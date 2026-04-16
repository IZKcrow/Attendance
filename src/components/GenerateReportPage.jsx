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
  Checkbox,
  ListItemText,
  Typography,
  TableCell
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

const reportStatusOptions = [
  { value: 'on-time', label: 'On-Time' },
  { value: 'late', label: 'Late' },
  { value: 'early-leave', label: 'Early Leave' },
  { value: 'absent', label: 'Absent' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'half-day', label: 'Half-Day' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'holiday-worked', label: 'Holiday (Worked)' },
  { value: 'rest-day', label: 'Rest Day' },
  { value: 'rest-day-worked', label: 'Rest Day (Worked)' }
]

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

function formatMinutesAsHoursMins(totalMinutes) {
  const m = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0
  const hrs = Math.floor(m / 60)
  const mins = m % 60
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${String(mins).padStart(2, '0')} ${mins === 1 ? 'min' : 'mins'}`
}

function computeHours(row) {
  // Company policy: no overtime credit for early IN / late OUT.
  // Work hours are clamped to the required shift window; late IN / early OUT deduct time.
  const clampSegment = (actualIn, actualOut, reqIn, reqOut) => {
    const aIn = hhmmToMinutes(actualIn)
    const aOut = hhmmToMinutes(actualOut)
    if (aIn == null || aOut == null || aOut <= aIn) return 0

    const rIn = hhmmToMinutes(reqIn)
    const rOut = hhmmToMinutes(reqOut)
    if (rIn == null || rOut == null || rOut <= rIn) return Math.max(0, aOut - aIn)

    const start = Math.max(aIn, rIn) // early IN doesn't add
    const end = Math.min(aOut, rOut) // late OUT doesn't add
    return Math.max(0, end - start)
  }

  const total =
    clampSegment(row.MorningTimeIn, row.MorningTimeOut, row.RequiredMorningIn, row.RequiredMorningOut) +
    clampSegment(row.AfternoonTimeIn, row.AfternoonTimeOut, row.RequiredAfternoonIn, row.RequiredAfternoonOut)

  return formatMinutesAsHoursMins(total)
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
    AfternoonTimeOut: pmOut,
    RequiredMorningIn: fmtTime(r.RequiredMorningIn),
    RequiredMorningOut: fmtTime(r.RequiredMorningOut),
    RequiredAfternoonIn: fmtTime(r.RequiredAfternoonIn),
    RequiredAfternoonOut: fmtTime(r.RequiredAfternoonOut)
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

function statusMatches(statusText, filterValue) {
  const s = String(statusText || '').toLowerCase()
  if (filterValue === 'on-time') {
    return s.includes('on-time') || s.includes('on time') || s === 'present'
  }
  if (filterValue === 'late') {
    return s.includes('late')
  }
  if (filterValue === 'early-leave') {
    return s.includes('early leave') || s.includes('early-out') || s.includes('early out')
  }
  if (filterValue === 'absent') {
    return s.includes('absent')
  }
  if (filterValue === 'incomplete') {
    return s.includes('incomplete')
  }
  if (filterValue === 'half-day') {
    return s.includes('half')
  }
  if (filterValue === 'holiday-worked') {
    return s.includes('holiday') && s.includes('worked')
  }
  if (filterValue === 'holiday') {
    return s === 'holiday'
  }
  if (filterValue === 'rest-day-worked') {
    return (s.includes('rest day') || s.includes('rest-day')) && s.includes('worked')
  }
  if (filterValue === 'rest-day') {
    return s === 'rest day' || s === 'rest-day'
  }
  return true
}

function filterReportRows(reportRows, selectedStatuses) {
  const active = Array.isArray(selectedStatuses) ? selectedStatuses.filter(Boolean) : []
  if (!active.length) return Array.isArray(reportRows) ? reportRows : []
  return (Array.isArray(reportRows) ? reportRows : []).filter((row) =>
    active.some((status) => statusMatches(row.Status, status))
  )
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
  const [statusFilters, setStatusFilters] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const fetchReportRows = async () => {
    const data = source === 'RAW'
      ? await api.fetchAttendanceRawByRange(from, to)
      : await api.fetchAttendanceByRange(from, to)

    const arr = Array.isArray(data) ? data : []
    return arr.map(toReportRow)
  }

  const previewRows = React.useMemo(
    () => filterReportRows(rows, statusFilters),
    [rows, statusFilters]
  )

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
      const fetchedRows = await fetchReportRows()
      reportRows = filterReportRows(fetchedRows, statusFilters)
      setRows(fetchedRows)
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
        <Box sx={{ display: 'grid', gap: 1.5 }}>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) auto' },
              gap: 1.5,
              alignItems: 'center'
            }}
          >
            <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap', alignItems: 'center' }}>
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

              <FormControl size="small" sx={{ minWidth: 220 }}>
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

              <FormControl size="small" sx={{ minWidth: 240 }}>
                <InputLabel id="status-filter-label">Filter</InputLabel>
                <Select
                  labelId="status-filter-label"
                  multiple
                  value={statusFilters}
                  label="Filter"
                  onChange={(e) => {
                    const value = e.target.value
                    setStatusFilters(Array.isArray(value) ? value : [])
                  }}
                  renderValue={(selected) => {
                    const active = Array.isArray(selected) ? selected : []
                    if (!active.length) return 'All statuses'
                    const labels = new Map(reportStatusOptions.map((option) => [option.value, option.label]))
                    return active.map((value) => labels.get(value) || value).join(', ')
                  }}
                >
                  {reportStatusOptions.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      <Checkbox checked={statusFilters.indexOf(option.value) > -1} />
                      <ListItemText primary={option.label} />
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Box>

            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: { xs: 'flex-start', xl: 'flex-end' }, flexWrap: 'wrap' }}>
              <Button
                variant="outlined"
                onClick={load}
                disabled={loading}
                sx={{ textTransform: 'none', minWidth: 120 }}
              >
                {loading ? 'Loading...' : 'Preview'}
              </Button>

              <Button
                variant="contained"
                onClick={generate}
                disabled={loading}
                sx={{
                  backgroundColor: 'var(--primary)',
                  fontWeight: 800,
                  textTransform: 'none',
                  minWidth: 190,
                  ':hover': { backgroundColor: 'var(--primary-dark)' }
                }}
              >
                {loading ? 'Generating...' : 'Generate & Download'}
              </Button>
            </Box>
          </Box>

          <Box sx={{ display: 'flex', justifyContent: { xs: 'flex-start', xl: 'flex-end' } }}>
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
          </Box>
        </Box>
        {error && (
          <Typography variant="body2" sx={{ mt: 1, color: '#b91c1c' }}>
            {error}
          </Typography>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
          Leave the status filter empty to include all records. Selected statuses apply to both preview and export.
        </Typography>
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
          PDF export opens the print dialog (choose “Save as PDF”).
        </Typography>
      </Paper>

      <GenericDataTable
        title={`Preview (${previewRows.length} rows)`}
        columns={['Name', 'Shift', 'Date', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours']}
        data={previewRows}
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
