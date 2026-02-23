//AttendanceReportPage.jsx
import React from 'react'
import { TableCell, Button } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

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

function toDateInputValue(d) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

function startOfDay(d) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function computeDutyHours(row) {
  const segments = [
    [row.MorningTimeIn, row.MorningTimeOut],
    [row.AfternoonTimeIn, row.AfternoonTimeOut]
  ]
  let total = 0
  segments.forEach(([start, end]) => {
    const s = toMinutes(start)
    const e = toMinutes(end)
    if (s != null && e != null && e > s) {
      total += e - s
    }
  })
  return total > 0 ? (total / 60).toFixed(2) : '0.00'
}

function endOfDay(d) {
  const x = new Date(d)
  x.setHours(23, 59, 59, 999)
  return x
}

function getRangeDate(kind, anchorDateStr = null) {
  const now = anchorDateStr ? new Date(anchorDateStr) : new Date()
  switch (kind) {
    case 'week': {
      const day = now.getDay() === 0 ? 7 : now.getDay() // 1=Mon
      const monday = new Date(now.getTime() - (day - 1) * 24 * 60 * 60 * 1000)
      const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
      return { from: toDateInputValue(monday), to: toDateInputValue(sunday) }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: toDateInputValue(from), to: toDateInputValue(to) }
    }
    case 'year': {
      const from = new Date(now.getFullYear(), 0, 1)
      const to = new Date(now.getFullYear(), 11, 31)
      return { from: toDateInputValue(from), to: toDateInputValue(to) }
    }
    default:
      return { from: toDateInputValue(now), to: toDateInputValue(now) }
  }
}

export default function AttendanceReportPage() {
  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [range, setRange] = React.useState('today')
  const [from, setFrom] = React.useState(toDateInputValue(new Date()))
  const [to, setTo] = React.useState(toDateInputValue(new Date()))
  const [weekAnchor, setWeekAnchor] = React.useState(toDateInputValue(new Date()))
  const [monthAnchor, setMonthAnchor] = React.useState(toDateInputValue(new Date()))
  const [yearAnchor, setYearAnchor] = React.useState(new Date().getFullYear().toString())
  const [statusFilter, setStatusFilter] = React.useState('all')

  React.useEffect(() => {
    loadRecords()
    // reload when anchors change too
  }, [range, from, to, weekAnchor, monthAnchor, yearAnchor])

  const loadRecords = async () => {
    try {
      setLoading(true)
      let data = []
      switch (range) {
        case 'today':
          data = await api.fetchAttendanceToday()
          break
        case 'week': {
          const r = getRangeDate('week', weekAnchor)
          data = await api.fetchAttendanceByRange(r.from, r.to)
          break
        }
        case 'month': {
          const r = getRangeDate('month', monthAnchor)
          data = await api.fetchAttendanceByRange(r.from, r.to)
          break
        }
        case 'year': {
          const r = getRangeDate('year', `${yearAnchor}-01-01`)
          data = await api.fetchAttendanceByRange(r.from, r.to)
          break
        }
        case 'custom':
          data = await api.fetchAttendanceByRange(from, to)
          break
        default:
          data = await api.fetchAttendanceToday()
      }
      const arr = Array.isArray(data) ? data : []
      const normalized = arr.map((rec) => {
        const candidates = [
          rec.ShiftName,
          rec.shiftName,
          rec.Shift,
          rec.shift,
          rec.RequiredShiftName,
          rec.ScheduleName,
          rec.PeriodName
        ]
          .map(v => (typeof v === 'string' ? v.trim() : v))
          .filter(Boolean)

        let shift = candidates[0] || ''
        if (!shift) {
          // Last-resort: look for any string field whose key contains "shift"
          const dynamic = Object.entries(rec || {}).find(
            ([key, val]) => /shift/i.test(key) && typeof val === 'string' && val.trim()
          )
          if (dynamic) shift = dynamic[1].trim()
        }
        if (!shift && (rec.RequiredMorningIn || rec.RequiredAfternoonOut || rec.RequiredMorningOut || rec.RequiredAfternoonIn)) {
          // Fallback: compose a label from required times when named shift is missing
          const start = rec.RequiredMorningIn || rec.RequiredAfternoonIn || '--'
          const end = rec.RequiredMorningOut || rec.RequiredAfternoonOut || '--'
          shift = `${start} – ${end}`
        }
        if (!shift) shift = 'No shift'
        const emptyTimes =
          !rec.MorningTimeIn &&
          !rec.MorningTimeOut &&
          !rec.AfternoonTimeIn &&
          !rec.AfternoonTimeOut
        let status = (rec.AttendanceSummary || rec.Status || '').trim()
        if (!status && emptyTimes) status = 'Absent'
        return { ...rec, __ShiftResolved: shift, AttendanceSummary: status }
      })
      setRecords(normalized)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const totals = React.useMemo(() => {
    const total = records.length
    const normalized = records.map(r => (r.AttendanceSummary || r.Status || '').toLowerCase())
    const late = normalized.filter(s => s.includes('late')).length
    const early = normalized.filter(s => s.includes('early leave') || s.includes('early-out')).length
    const absent = normalized.filter(s => s.includes('absent')).length
    const incomplete = normalized.filter(s => s.includes('incomplete')).length
    const onTime = normalized.filter(s => s.includes('on-time') || s === 'on time' || s === 'present').length
    return { total, late, onTime, early, absent, incomplete }
  }, [records])


  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>Range:</label>
        <select
          value={range}
          onChange={(e)=>setRange(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="today">Today</option>
          <option value="week">Week (Monday–Sunday)</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="custom">Custom</option>
        </select>
        {range === 'week' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Any date in week:</span>
            <input type="date" value={weekAnchor} onChange={(e)=>setWeekAnchor(e.target.value)} style={inputStyle} />
          </div>
        )}
        {range === 'month' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Month:</span>
            <input type="month" value={monthAnchor.slice(0,7)} onChange={(e)=>{
              const v = e.target.value
              if (v) {
                setMonthAnchor(`${v}-01`)
              }
            }} style={inputStyle} />
          </div>
        )}
        {range === 'year' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Year:</span>
            <input type="number" min="2000" max="2100" value={yearAnchor} onChange={(e)=>setYearAnchor(e.target.value)} style={{ ...inputStyle, width: 90 }} />
          </div>
        )}
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>From:</span>
            <input type="date" value={from} onChange={(e)=>setFrom(e.target.value)} style={inputStyle} />
            <span>To:</span>
            <input type="date" value={to} onChange={(e)=>setTo(e.target.value)} style={inputStyle} />
          </div>
        )}
        <Button
          variant="contained"
          size="small"
          onClick={() => {
            setRange('today')
            const today = toDateInputValue(new Date())
            setFrom(today); setTo(today); setWeekAnchor(today); setMonthAnchor(today); setYearAnchor(new Date().getFullYear().toString())
          }}
          sx={{ backgroundColor: '#3cc4bf', color: '#0b1021', fontWeight: 700, textTransform: 'none', borderRadius: 2, boxShadow: '0 4px 10px rgba(0,0,0,0.08)', ':hover': { backgroundColor: '#35b3af' } }}
        >
          Reset
        </Button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <label style={{ fontWeight: 600 }}>Status:</label>
          <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)} style={inputStyle}>
            <option value="all">All</option>
            <option value="on-time">On-Time</option>
            <option value="late">Late</option>
            <option value="early">Early Leave</option>
            <option value="absent">Absent</option>
            <option value="incomplete">Incomplete</option>
          </select>
        </div>
      </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <StatCard label="Total logs" value={totals.total} />
        <StatCard label="On time" value={totals.onTime} />
        <StatCard label="Late" value={totals.late} tone="warn" />
        <StatCard label="Early leave" value={totals.early} tone="muted" />
        <StatCard label="Absent" value={totals.absent} tone="muted" />
        <StatCard label="Incomplete" value={totals.incomplete} tone="neutral" />
      </div>

      <GenericDataTable
        title="Details"
        columns={['Date', 'Name', 'Shift', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours']}
        data={records.filter((r) => {
          if (statusFilter === 'all') return true
          const s = (r.AttendanceSummary || r.Status || '').toLowerCase()
          if (statusFilter === 'on-time') return s.includes('on-time') || s === 'on time' || s === 'present'
          if (statusFilter === 'late') return s.includes('late')
          if (statusFilter === 'early') return s.includes('early')
          if (statusFilter === 'absent') return s.includes('absent')
          if (statusFilter === 'incomplete') return s.includes('incomplete')
          return true
        })}
        loading={loading}
        error={error}
        primaryKeyField="AttendanceID"
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        renderRow={(row) => (
          <>
            <TableCell>{fmtDate(row.AttendanceDate)}</TableCell>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{row.__ShiftResolved || row.ShiftName || row.shiftName || row.Shift || row.shift || 'No shift'}</TableCell>
            <TableCell>{renderStatusBadge(row.AttendanceSummary || row.Status || '-')}</TableCell>
            <TableCell>{fmtTime(row.MorningTimeIn)}</TableCell>
            <TableCell>{fmtTime(row.MorningTimeOut)}</TableCell>
            <TableCell>{fmtTime(row.AfternoonTimeIn)}</TableCell>
            <TableCell>{fmtTime(row.AfternoonTimeOut)}</TableCell>
            <TableCell>{computeDutyHours(row)}</TableCell>
          </>
        )}
      />
    </div>
  )
}

function StatCard({ label, value, tone = 'ok' }) {
  const palette = {
    ok: { bg: '#16a34a', fg: '#ffffff' },           // on-time green
    warn: { bg: '#f97316', fg: '#ffffff' },         // late orange
    muted: { bg: '#4f46e5', fg: '#ffffff' },        // early leave purple
    neutral: { bg: '#6b7280', fg: '#ffffff' }       // incomplete gray
  }
  const colors = palette[tone] || palette.ok
  return (
    <div style={{
      minWidth: 160,
      padding: 14,
      borderRadius: 12,
      background: colors.bg,
      color: colors.fg,
      boxShadow: '0 10px 22px rgba(0,0,0,0.18)',
      border: '1px solid rgba(0,0,0,0.08)'
    }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.6, opacity: 0.92 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>{value}</div>
    </div>
  )
}

const inputStyle = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)'
}

function renderStatusBadge(statusRaw) {
  const status = (statusRaw || '').toString()
  const s = status.toLowerCase()
  const palette = {
    'on-time': { bg: '#16a34a', fg: '#ffffff' },
    ontime: { bg: '#16a34a', fg: '#ffffff' },
    present: { bg: '#16a34a', fg: '#ffffff' },
    late: { bg: '#f97316', fg: '#ffffff' },
    'early leave': { bg: '#4f46e5', fg: '#ffffff' },
    'early-out': { bg: '#4f46e5', fg: '#ffffff' },
    absent: { bg: '#dc2626', fg: '#ffffff' },
    incomplete: { bg: '#6b7280', fg: '#ffffff' },
    missing: { bg: '#6b7280', fg: '#ffffff' }
  }
  const key = Object.keys(palette).find(k => s.includes(k))
  const colors = key ? palette[key] : { bg: '#374151', fg: '#ffffff' }
  return (
    <span style={{
      padding: '4px 10px',
      borderRadius: 999,
      background: colors.bg,
      color: colors.fg,
      fontWeight: 700,
      fontSize: 13,
      display: 'inline-block',
      minWidth: 90,
      textAlign: 'center'
    }}>
      {status || '-'}
    </span>
  )
}
