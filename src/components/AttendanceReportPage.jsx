//AttendanceReportPage.jsx
import React from 'react'
import { TableCell, Button } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

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
      setRecords(Array.isArray(data) ? data : [])
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
    const onTime = normalized.filter(s => s.includes('on-time') || s === 'on time' || s === 'present').length
    return { total, late, onTime, early, absent }
  }, [records])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>Range:</label>
        <select
          value={range}
          onChange={(e)=>setRange(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #c8d5ec', background: '#f9fbff' }}
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
      </div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total logs" value={totals.total} />
        <StatCard label="On time" value={totals.onTime} />
        <StatCard label="Late" value={totals.late} tone="warn" />
        <StatCard label="Early leave" value={totals.early} tone="muted" />
      </div>

      <GenericDataTable
        title="Details"
        columns={['Date', 'Name', 'Shift', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours']}
        data={records}
        loading={loading}
        error={error}
        primaryKeyField="AttendanceID"
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        renderRow={(row) => (
          <>
            <TableCell>{row.AttendanceDate}</TableCell>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{row.ShiftName || '-'}</TableCell>
            <TableCell>{row.AttendanceSummary || row.Status || '-'}</TableCell>
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
    ok: { bg: '#e7ecf5', fg: '#0f1f3d' },
    warn: { bg: '#fff4e5', fg: '#b86a00' },
    muted: { bg: '#f0f4f8', fg: '#4a5672' }
  }
  const colors = palette[tone] || palette.ok
  return (
    <div style={{ minWidth: 160, padding: 12, borderRadius: 10, background: colors.bg, color: colors.fg, boxShadow: '0 6px 16px rgba(15,31,61,0.08)' }}>
      <div style={{ fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 700 }}>{value}</div>
    </div>
  )
}

const inputStyle = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #c8d5ec',
  background: '#f9fbff'
}
