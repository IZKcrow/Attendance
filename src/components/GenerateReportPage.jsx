//GenerateReportPage.jsx
import React from 'react'
import {
  Box,
  Paper,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  TableCell
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

function toDateInputValue(d) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

function fmtDate(value) {
  if (!value) return '-'
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

function fmtTime(value) {
  if (!value) return '-'
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function downloadBlob(filename, mimeType, content) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function hhmmToMinutes(v) {
  if (!v) return null
  const s = String(v).trim()
  const m = s.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  const hh = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return hh * 60 + mm
}

function computeHours(row) {
  const segments = [
    [row.MorningTimeIn, row.MorningTimeOut],
    [row.AfternoonTimeIn, row.AfternoonTimeOut]
  ]
  let total = 0
  for (const [start, end] of segments) {
    const s = hhmmToMinutes(start)
    const e = hhmmToMinutes(end)
    if (s != null && e != null && e > s) total += (e - s)
  }
  return total > 0 ? (total / 60).toFixed(2) : '0.00'
}

function toReportRow(r) {
  const employee = r.EmployeeName || r.EmployeeCode || '-'
  const shift = r.ShiftName || r.RequiredShiftName || r.ScheduleName || r.PeriodName || '-'
  const date = fmtDate(r.AttendanceDate || r.AttendanceDay || r.Date)
  const status = r.AttendanceSummary || r.Status || '-'
  const amIn = fmtTime(r.MorningTimeIn)
  const amOut = fmtTime(r.MorningTimeOut)
  const pmIn = fmtTime(r.AfternoonTimeIn)
  const pmOut = fmtTime(r.AfternoonTimeOut)
  const hours = computeHours({
    MorningTimeIn: amIn,
    MorningTimeOut: amOut,
    AfternoonTimeIn: pmIn,
    AfternoonTimeOut: pmOut
  })

  return {
    Employee: employee,
    Shift: shift,
    Date: date,
    Status: status,
    AMIn: amIn,
    AMOut: amOut,
    PMIn: pmIn,
    PMOut: pmOut,
    Hours: hours,
    __raw: r
  }
}

function buildHtmlDocument(reportRows, title) {
  const headers = ['Name', 'Shift', 'Date', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours']

  const rows = (Array.isArray(reportRows) ? reportRows : []).map((r) => [
    r.Employee,
    r.Shift,
    r.Date,
    r.Status,
    r.AMIn,
    r.AMOut,
    r.PMIn,
    r.PMOut,
    r.Hours
  ])

  const table = `
    ${rows.length ? '' : '<p style="margin:8px 0 12px 0;color:#374151;">No data found for the selected date range.</p>'}
    <table border="1" cellspacing="0" cellpadding="4">
      <thead>
        <tr>${headers.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(cols => `<tr>${cols.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `

  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:16px;}
      h2{margin:0 0 10px 0;}
      table{border-collapse:collapse; width:100%;}
      th{background:#f3f4f6;}
      th,td{font-size:12px;}
      @media print { body{padding:0;} h2{margin:0 0 8px 0;} }
    </style>
  `

  const safeTitle = escapeHtml(title)
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>${style}</head><body><h2>${safeTitle}</h2>${table}</body></html>`
}

function openPdfWindowNow() {
  const w = window.open('', '_blank')
  if (!w) throw new Error('Popup blocked. Allow popups to export PDF.')
  w.document.open()
  w.document.write('<!doctype html><html><head><meta charset="utf-8"/><title>Preparing report...</title></head><body style="font-family:Arial;padding:16px;">Preparing report...</body></html>')
  w.document.close()
  return w
}

function writePrintablePdf(win, html) {
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.focus()
}

function triggerPrintAndClose(win) {
  try {
    win.focus()
    win.onafterprint = function () {
      try { win.close() } catch (_) {}
    }
    // Small delay so layout finishes before print dialog opens.
    setTimeout(() => {
      try { win.print() } catch (_) {}
    }, 450)
  } catch (_) {}
}

export default function GenerateReportPage() {
  const today = React.useMemo(() => new Date(), [])
  const [from, setFrom] = React.useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return toDateInputValue(d)
  })
  const [to, setTo] = React.useState(() => toDateInputValue(today))
  const [source, setSource] = React.useState('SHIFT')
  const [format, setFormat] = React.useState('EXCEL')
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const fetchReportRows = async () => {
    const data = source === 'RAW'
      ? await api.fetchAttendanceRawByRange(from, to)
      : await api.fetchAttendanceByRange(from, to)

    const arr = Array.isArray(data) ? data : []
    return arr.map(toReportRow)
  }

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const mapped = await fetchReportRows()
      setRows(mapped)
      return mapped
    } catch (e) {
      setError(e?.message || String(e))
      setRows([])
      return []
    } finally {
      setLoading(false)
    }
  }

  const generate = async () => {
    let pdfWin = null
    const title = `Attendance Report (${from} to ${to})`

    if (format === 'PDF') {
      try {
        pdfWin = openPdfWindowNow()
      } catch (e) {
        setError(e?.message || String(e))
        return
      }
    }

    setLoading(true)
    setError(null)

    let reportRows = []
    try {
      reportRows = await fetchReportRows()
      setRows(reportRows)
    } catch (e) {
      const msg = e?.message || String(e)
      setError(msg)
      setRows([])
      if (pdfWin) {
        const html = buildHtmlDocument([], `${title} (Error)`)
          .replace('<h2>', `<h2>${escapeHtml(title)}<br/><span style="font-size:12px;color:#b91c1c;font-weight:700;">${escapeHtml(msg)}</span><br/>`)
        writePrintablePdf(pdfWin, html)
      }
      return
    } finally {
      setLoading(false)
    }

    if (format === 'PDF') {
      const html = buildHtmlDocument(reportRows, title)
      writePrintablePdf(pdfWin, html)
      triggerPrintAndClose(pdfWin)
      return
    }

    const html = buildHtmlDocument(reportRows, title)
    const filename = `Attendance_Report_${from}_to_${to}.xls`
    downloadBlob(filename, 'application/vnd.ms-excel;charset=utf-8', html)
  }

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Paper
        sx={{
          p: 2,
          borderRadius: 3,
          backgroundColor: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 10px 24px rgba(0,0,0,0.12)'
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>Generate Report</Typography>
        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <TextField
            size="small"
            type="date"
            label="From"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="To"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />

          <FormControl size="small" sx={{ minWidth: 200 }}>
            <InputLabel id="source-label">Data Source</InputLabel>
            <Select
              labelId="source-label"
              label="Data Source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              <MenuItem value="SHIFT">Shift schedule (recommended)</MenuItem>
              <MenuItem value="RAW">Raw logs only (no shift needed)</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="format-label">Format</InputLabel>
            <Select
              labelId="format-label"
              label="Format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <MenuItem value="EXCEL">Excel (.xls)</MenuItem>
              <MenuItem value="PDF">PDF (Print)</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ flexGrow: 1 }} />

          <Button
            variant="outlined"
            onClick={load}
            disabled={loading}
            sx={{ textTransform: 'none' }}
          >
            {loading ? 'Loading...' : 'Load Preview'}
          </Button>

          <Button
            variant="contained"
            onClick={generate}
            disabled={loading}
            sx={{
              backgroundColor: 'var(--primary)',
              fontWeight: 800,
              textTransform: 'none',
              ':hover': { backgroundColor: 'var(--primary-dark)' }
            }}
          >
            {loading ? 'Generating...' : 'Generate & Download'}
          </Button>
        </Box>
        {error && (
          <Typography variant="body2" sx={{ mt: 1, color: '#b91c1c' }}>
            {error}
          </Typography>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
          PDF export opens the print dialog (choose “Save as PDF”). If you see a blank tab, allow popups for `localhost`.
        </Typography>
      </Paper>

      <GenericDataTable
        title={`Preview (${rows.length} rows)`}
        columns={['Name', 'Shift', 'Date', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours']}
        data={rows}
        loading={loading}
        error={error}
        primaryKeyField="AttendanceID"
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        renderRow={(row) => (
          <>
            <TableCell>{row.Employee}</TableCell>
            <TableCell>{row.Shift}</TableCell>
            <TableCell>{row.Date}</TableCell>
            <TableCell>{row.Status}</TableCell>
            <TableCell>{row.AMIn}</TableCell>
            <TableCell>{row.AMOut}</TableCell>
            <TableCell>{row.PMIn}</TableCell>
            <TableCell>{row.PMOut}</TableCell>
            <TableCell>{row.Hours}</TableCell>
          </>
        )}
      />
    </Box>
  )
}
