//AttendanceReportPage.jsx
import React from 'react'
import {
  TableCell,
  Button,
  Paper,
  Box,
  TextField,
  Typography,
  Chip,
  Stack,
  InputAdornment,
  IconButton,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import ClearIcon from '@mui/icons-material/Clear'

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

function toTimeInputValue(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string' || !/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function formatMinutesAsHoursMins(totalMinutes) {
  const m = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0
  const hrs = Math.floor(m / 60)
  const mins = m % 60
  return `${hrs} ${hrs === 1 ? 'hr' : 'hrs'} ${String(mins).padStart(2, '0')} ${mins === 1 ? 'min' : 'mins'}`
}

function isNonWorkingDayType(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized === 'HOLIDAY' || normalized === 'REST_DAY' || normalized === 'SPECIAL_NON_WORKING'
}

function computeDutyHours(row) {
  // Company policy: no overtime credit for early IN / late OUT.
  // Work hours are clamped to the required shift window; late IN / early OUT deduct time.
  const clampSegment = (actualIn, actualOut, reqIn, reqOut) => {
    const aIn = toMinutes(actualIn)
    const aOut = toMinutes(actualOut)
    if (aIn == null || aOut == null || aOut <= aIn) return 0

    const rIn = toMinutes(reqIn)
    const rOut = toMinutes(reqOut)
    if (rIn == null || rOut == null || rOut <= rIn) return Math.max(0, aOut - aIn)

    const start = Math.max(aIn, rIn)
    const end = Math.min(aOut, rOut)
    return Math.max(0, end - start)
  }

  const total =
    clampSegment(row.MorningTimeIn, row.MorningTimeOut, row.RequiredMorningIn, row.RequiredMorningOut) +
    clampSegment(row.AfternoonTimeIn, row.AfternoonTimeOut, row.RequiredAfternoonIn, row.RequiredAfternoonOut)

  const actualTotal =
    computeActualSegmentMinutes(row.MorningTimeIn, row.MorningTimeOut) +
    computeActualSegmentMinutes(row.AfternoonTimeIn, row.AfternoonTimeOut)

  const specialDayType = String(row.SpecialDayType || '').trim().toUpperCase()
  if (isNonWorkingDayType(specialDayType)) {
    const approvedOtMinutes = computeApprovedOvertimeMinutesForRow(row)
    return formatMinutesAsHoursMins(Math.min(actualTotal, approvedOtMinutes))
  }

  const regularMinutes = isNonWorkingDayType(specialDayType) ? 0 : total
  const actualExtraMinutes = Math.max(0, actualTotal - regularMinutes)
  const approvedOtMinutes = computeApprovedOvertimeMinutesForRow(row)
  const payableOtMinutes = Math.min(actualExtraMinutes, approvedOtMinutes)

  return formatMinutesAsHoursMins(regularMinutes + payableOtMinutes)
}

function computeActualSegmentMinutes(actualIn, actualOut) {
  const aIn = toMinutes(actualIn)
  const aOut = toMinutes(actualOut)
  if (aIn == null || aOut == null || aOut <= aIn) return 0
  return Math.max(0, aOut - aIn)
}

function computeOverlapMinutes(actualIn, actualOut, allowedStart, allowedEnd) {
  const aIn = toMinutes(actualIn)
  const aOut = toMinutes(actualOut)
  const wIn = toMinutes(allowedStart)
  const wOut = toMinutes(allowedEnd)

  if (aIn == null || aOut == null || aOut <= aIn) return 0
  if (wIn == null || wOut == null || wOut <= wIn) return 0

  const start = Math.max(aIn, wIn)
  const end = Math.min(aOut, wOut)
  return Math.max(0, end - start)
}

function toInterval(start, end) {
  const s = toMinutes(start)
  const e = toMinutes(end)
  if (s == null || e == null || e <= s) return null
  return { start: s, end: e }
}

function intersectIntervals(a, b) {
  if (!a || !b) return null
  const start = Math.max(a.start, b.start)
  const end = Math.min(a.end, b.end)
  if (end <= start) return null
  return { start, end }
}

function subtractInterval(base, blocker) {
  if (!base) return []
  if (!blocker) return [base]

  const overlap = intersectIntervals(base, blocker)
  if (!overlap) return [base]

  const next = []
  if (base.start < overlap.start) next.push({ start: base.start, end: overlap.start })
  if (overlap.end < base.end) next.push({ start: overlap.end, end: base.end })
  return next
}

function getActualWorkIntervals(row) {
  return [
    toInterval(row.MorningTimeIn, row.MorningTimeOut),
    toInterval(row.AfternoonTimeIn, row.AfternoonTimeOut)
  ].filter(Boolean)
}

function getRequiredScheduleIntervals(row) {
  const specialDayType = String(row.SpecialDayType || '').trim().toUpperCase()
  if (isNonWorkingDayType(specialDayType)) return []

  return [
    toInterval(row.RequiredMorningIn, row.RequiredMorningOut),
    toInterval(row.RequiredAfternoonIn, row.RequiredAfternoonOut)
  ].filter(Boolean)
}

function getActualOvertimeIntervals(row) {
  const actualIntervals = getActualWorkIntervals(row)
  const scheduleIntervals = getRequiredScheduleIntervals(row)

  return actualIntervals.flatMap((actualInterval) => {
    let pieces = [actualInterval]
    for (const scheduleInterval of scheduleIntervals) {
      pieces = pieces.flatMap((piece) => subtractInterval(piece, scheduleInterval))
    }
    return pieces
  })
}

function sumIntervalOverlapMinutes(intervals, windowInterval) {
  return intervals.reduce((sum, interval) => {
    const overlap = intersectIntervals(interval, windowInterval)
    if (!overlap) return sum
    return sum + (overlap.end - overlap.start)
  }, 0)
}

function computeApprovedOvertimeMinutesForRow(row) {
  const entries = Array.isArray(row.__ApprovedOvertimeEntries) ? row.__ApprovedOvertimeEntries : []
  if (!entries.length) {
    const fallback = Number(row.__ApprovedOvertimeMinutes)
    return Number.isFinite(fallback) ? Math.max(0, Math.round(fallback)) : 0
  }

  const overtimeIntervals = getActualOvertimeIntervals(row)

  return entries.reduce((sum, entry) => {
    const approvedMinutes = Number(entry?.ApprovedMinutes)
    if (!Number.isFinite(approvedMinutes) || approvedMinutes <= 0) return sum

    const startTime = entry?.StartTime || ''
    const endTime = entry?.EndTime || ''
    if (startTime && endTime) {
      const windowInterval = toInterval(startTime, endTime)
      const withinWindow = sumIntervalOverlapMinutes(overtimeIntervals, windowInterval)
      return sum + Math.min(Math.round(approvedMinutes), withinWindow)
    }

    return sum + Math.round(approvedMinutes)
  }, 0)
}

function getRangeDate(kind, anchorDateStr = null) {
  const now = anchorDateStr ? new Date(anchorDateStr) : new Date()
  switch (kind) {
    case 'week': {
      const day = now.getDay() === 0 ? 7 : now.getDay()
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

const editCardSx = {
  p: 2,
  mb: 2,
  borderRadius: 2,
  border: '1px solid var(--border)',
  background: 'linear-gradient(180deg, rgba(255,255,255,0.98), rgba(248,250,255,0.96))'
}

const saveBtnSx = {
  backgroundColor: 'var(--primary)',
  color: '#fff',
  fontWeight: 700,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: '0 6px 14px rgba(0,0,0,0.16)',
  ':hover': { backgroundColor: 'var(--primary-dark)' }
}

export default function AttendanceReportPage() {
  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [range, setRange] = React.useState('today')
  const [dataSource, setDataSource] = React.useState('SHIFT') // SHIFT (shows absents) vs RAW (stored IN/OUT only)
  const [from, setFrom] = React.useState(toDateInputValue(new Date()))
  const [to, setTo] = React.useState(toDateInputValue(new Date()))
  const [weekAnchor, setWeekAnchor] = React.useState(toDateInputValue(new Date()))
  const [monthAnchor, setMonthAnchor] = React.useState(toDateInputValue(new Date()))
  const [yearAnchor, setYearAnchor] = React.useState(new Date().getFullYear().toString())
  // Multi-select: empty array means "All"
  const [statusFilters, setStatusFilters] = React.useState([])
  const [editRow, setEditRow] = React.useState(null)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    loadRecords()
  }, [range, dataSource, from, to, weekAnchor, monthAnchor, yearAnchor])

  const loadRecords = async () => {
    try {
      setLoading(true)
      let data = []
      let overtimeEntries = []
      switch (range) {
        case 'today':
          if (dataSource === 'RAW') {
            const today = toDateInputValue(new Date())
            ;[data, overtimeEntries] = await Promise.all([
              api.fetchAttendanceRawByRange(today, today),
              api.fetchOvertimeEntries({ from: today, to: today })
            ])
          } else {
            const today = toDateInputValue(new Date())
            ;[data, overtimeEntries] = await Promise.all([
              api.fetchAttendanceToday(),
              api.fetchOvertimeEntries({ from: today, to: today })
            ])
          }
          break
        case 'week': {
          const r = getRangeDate('week', weekAnchor)
          ;[data, overtimeEntries] = await Promise.all([
            dataSource === 'RAW'
              ? api.fetchAttendanceRawByRange(r.from, r.to)
              : api.fetchAttendanceByRange(r.from, r.to),
            api.fetchOvertimeEntries({ from: r.from, to: r.to })
          ])
          break
        }
        case 'month': {
          const r = getRangeDate('month', monthAnchor)
          ;[data, overtimeEntries] = await Promise.all([
            dataSource === 'RAW'
              ? api.fetchAttendanceRawByRange(r.from, r.to)
              : api.fetchAttendanceByRange(r.from, r.to),
            api.fetchOvertimeEntries({ from: r.from, to: r.to })
          ])
          break
        }
        case 'year': {
          const r = getRangeDate('year', `${yearAnchor}-01-01`)
          ;[data, overtimeEntries] = await Promise.all([
            dataSource === 'RAW'
              ? api.fetchAttendanceRawByRange(r.from, r.to)
              : api.fetchAttendanceByRange(r.from, r.to),
            api.fetchOvertimeEntries({ from: r.from, to: r.to })
          ])
          break
        }
        case 'custom':
          ;[data, overtimeEntries] = await Promise.all([
            dataSource === 'RAW'
              ? api.fetchAttendanceRawByRange(from, to)
              : api.fetchAttendanceByRange(from, to),
            api.fetchOvertimeEntries({ from, to })
          ])
          break
        default:
          ;[data, overtimeEntries] = await Promise.all([
            dataSource === 'RAW'
              ? api.fetchAttendanceRawByRange(from, to)
              : api.fetchAttendanceToday(),
            api.fetchOvertimeEntries({ from, to })
          ])
      }
      const overtimeByKey = new Map()
      for (const entry of Array.isArray(overtimeEntries) ? overtimeEntries : []) {
        const employeeId = String(entry?.EmployeeID || '')
        const date = fmtDate(entry?.OvertimeDate)
        if (!employeeId || date === '-') continue

        const explicitMinutes = entry?.ApprovedMinutes
        const approvedMinutes = explicitMinutes != null && explicitMinutes !== ''
          ? Number(explicitMinutes)
          : (entry?.ApprovedHours != null && entry?.ApprovedHours !== '' ? Number(entry.ApprovedHours) * 60 : 0)

        if (!Number.isFinite(approvedMinutes) || approvedMinutes <= 0) continue
        const key = `${employeeId}:${date}`
        const bucket = overtimeByKey.get(key) || []
        bucket.push({
          StartTime: entry?.StartTime || '',
          EndTime: entry?.EndTime || '',
          ApprovedMinutes: Math.round(approvedMinutes)
        })
        overtimeByKey.set(key, bucket)
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
          const dynamic = Object.entries(rec || {}).find(
            ([key, val]) => /shift/i.test(key) && typeof val === 'string' && val.trim()
          )
          if (dynamic) shift = dynamic[1].trim()
        }
        if (!shift && (rec.RequiredMorningIn || rec.RequiredAfternoonOut || rec.RequiredMorningOut || rec.RequiredAfternoonIn)) {
          const start = rec.RequiredMorningIn || rec.RequiredAfternoonIn || '--'
          const end = rec.RequiredMorningOut || rec.RequiredAfternoonOut || '--'
          shift = `${start} - ${end}`
        }
        if (!shift) shift = 'No shift'
        const emptyTimes =
          !rec.MorningTimeIn &&
          !rec.MorningTimeOut &&
          !rec.AfternoonTimeIn &&
          !rec.AfternoonTimeOut
        let status = (rec.AttendanceSummary || rec.Status || '').trim()
        if (!status && emptyTimes) status = 'Absent'
        const key = `${String(rec.EmployeeID || '')}:${fmtDate(rec.AttendanceDate)}`
        const overtimeEntryList = overtimeByKey.get(key) || []
        return {
          ...rec,
          __ShiftResolved: shift,
          __ApprovedOvertimeEntries: overtimeEntryList,
          __ApprovedOvertimeMinutes: overtimeEntryList.reduce((sum, entry) => sum + Number(entry.ApprovedMinutes || 0), 0),
          AttendanceSummary: status
        }
      })
      setRecords(normalized)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const openEdit = (row) => {
    if (!row) return
    setEditRow({
      ...row,
      AttendanceDate: fmtDate(row.AttendanceDate) === '-' ? '' : fmtDate(row.AttendanceDate),
      MorningTimeIn: toTimeInputValue(row.MorningTimeIn),
      MorningTimeOut: toTimeInputValue(row.MorningTimeOut),
      AfternoonTimeIn: toTimeInputValue(row.AfternoonTimeIn),
      AfternoonTimeOut: toTimeInputValue(row.AfternoonTimeOut)
    })
  }

  const handleEditChange = (field, value) => {
    setEditRow(prev => ({ ...prev, [field]: value }))
  }

  const handleEditSave = async () => {
    if (!editRow?.AttendanceID) return
    setSaving(true)
    try {
      const clean = (v) => (v && v.trim() ? v.trim() : null)
      await api.updateAttendanceRecord(editRow.AttendanceID, {
        EmployeeID: editRow.EmployeeID,
        AttendanceDate: editRow.AttendanceDate || null,
        MorningTimeIn: clean(editRow.MorningTimeIn),
        MorningTimeOut: clean(editRow.MorningTimeOut),
        AfternoonTimeIn: clean(editRow.AfternoonTimeIn),
        AfternoonTimeOut: clean(editRow.AfternoonTimeOut)
      })
      await loadRecords()
      setEditRow(null)
    } catch (err) {
      alert('Update failed: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
  }

  const totals = React.useMemo(() => {
    const total = records.length
    const normalized = records.map(r => (r.AttendanceSummary || r.Status || '').toLowerCase())
    const late = normalized.filter(s => s.includes('late')).length
    const early = normalized.filter(s => s.includes('early leave') || s.includes('early-out')).length
    const absent = normalized.filter(s => s.includes('absent')).length
    const incomplete = normalized.filter(s => s.includes('incomplete')).length
    const halfDay = normalized.filter(s => s.includes('half')).length
    const onTime = normalized.filter(s => s.includes('on-time') || s === 'on time' || s === 'present').length
    return { total, late, onTime, early, absent, incomplete, halfDay }
  }, [records])

  const statusOptions = React.useMemo(() => ([
    { value: 'on-time', label: 'On-Time' },
    { value: 'late', label: 'Late' },
    { value: 'early', label: 'Early Leave' },
    { value: 'absent', label: 'Absent' },
    { value: 'incomplete', label: 'Incomplete' },
    { value: 'half-day', label: 'Half-Day' },
    { value: 'holiday', label: 'Holiday' },
    { value: 'special-day', label: 'Special Day' },
    { value: 'rest-day', label: 'Rest Day' }
  ]), [])

  const statusMatches = React.useCallback((statusText, filterValue) => {
    const s = String(statusText || '').toLowerCase()
    if (filterValue === 'on-time') return s.includes('on-time') || s === 'on time' || s === 'present'
    if (filterValue === 'late') return s.includes('late')
    if (filterValue === 'early') return s.includes('early')
    if (filterValue === 'absent') return s.includes('absent')
    if (filterValue === 'incomplete') return s.includes('incomplete')
    if (filterValue === 'half-day') return s.includes('half')
    if (filterValue === 'holiday') return s.includes('holiday')
    if (filterValue === 'special-day') return s.includes('special non-working')
    if (filterValue === 'rest-day') return s.includes('rest day') || s.includes('rest-day')
    return true
  }, [])

  const filtered = records.filter((r) => {
    const active = Array.isArray(statusFilters) ? statusFilters.filter(Boolean) : []
    if (active.length === 0) return true // All
    const statusText = (r.AttendanceSummary || r.Status || '')
    return active.some((f) => statusMatches(statusText, f))
  })

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <label style={{ fontWeight: 700 }}>Range:</label>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
        >
          <option value="today">Today</option>
          <option value="week">Week (Monday-Sunday)</option>
          <option value="month">Month</option>
          <option value="year">Year</option>
          <option value="custom">Custom</option>
        </select>

        <label style={{ fontWeight: 700 }}>Source:</label>
        <select
          value={dataSource}
          onChange={(e) => setDataSource(e.target.value)}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }}
          title={dataSource === 'RAW'
            ? 'RAW: Shows stored IN/OUT times even if no shift is assigned (does not generate absents).'
            : 'SHIFT: Uses assigned shifts to show absents and schedule-required times.'}
        >
          <option value="SHIFT">Shift-based</option>
          <option value="RAW">Raw records</option>
        </select>

        {range === 'week' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Any date in week:</span>
            <input type="date" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value)} style={inputStyle} />
          </div>
        )}
        {range === 'month' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Month:</span>
            <input
              type="month"
              value={monthAnchor.slice(0, 7)}
              onChange={(e) => {
                const v = e.target.value
                if (v) setMonthAnchor(`${v}-01`)
              }}
              style={inputStyle}
            />
          </div>
        )}
        {range === 'year' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span>Year:</span>
            <input type="number" min="2000" max="2100" value={yearAnchor} onChange={(e) => setYearAnchor(e.target.value)} style={{ ...inputStyle, width: 90 }} />
          </div>
        )}
        {range === 'custom' && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <span>From:</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
            <span>To:</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </div>
        )}
        <Button
          variant="contained"
          size="small"
          onClick={() => {
            setRange('today')
            const today = toDateInputValue(new Date())
            setFrom(today)
            setTo(today)
            setWeekAnchor(today)
            setMonthAnchor(today)
            setYearAnchor(new Date().getFullYear().toString())
            setEditRow(null)
          }}
          sx={{ backgroundColor: '#3cc4bf', color: '#0b1021', fontWeight: 700, textTransform: 'none', borderRadius: 2, boxShadow: '0 4px 10px rgba(0,0,0,0.08)', ':hover': { backgroundColor: '#35b3af' } }}
        >
          Reset
        </Button>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <FormControl size="small" sx={{ minWidth: 240 }}>
            <InputLabel id="status-multi">Status</InputLabel>
            <Select
              labelId="status-multi"
              multiple
              value={statusFilters}
              label="Status"
              onChange={(e) => {
                const value = e.target.value
                setStatusFilters(Array.isArray(value) ? value : [])
              }}
              renderValue={(selected) => {
                const sel = Array.isArray(selected) ? selected : []
                if (!sel.length) return 'All'
                const map = new Map(statusOptions.map(o => [o.value, o.label]))
                return sel.map(v => map.get(v) || v).join(', ')
              }}
              sx={{
                background: 'var(--surface)',
                borderRadius: 2,
                '& fieldset': { borderColor: 'var(--border)' },
                '&:hover fieldset': { borderColor: 'var(--primary)' },
                '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
              }}
            >
              {statusOptions.map((opt) => (
                <MenuItem key={opt.value} value={opt.value}>
                  <Checkbox checked={statusFilters.indexOf(opt.value) > -1} />
                  <ListItemText primary={opt.label} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
        <StatCard label="Total logs" value={totals.total} />
        <StatCard label="On time" value={totals.onTime} />
        <StatCard label="Late" value={totals.late} tone="warn" />
        <StatCard label="Early leave" value={totals.early} tone="muted" />
        <StatCard label="Absent" value={totals.absent} tone="muted" />
        <StatCard label="Incomplete" value={totals.incomplete} tone="neutral" />
        <StatCard label="Half-Day" value={totals.halfDay} tone="neutral" />
      </div>

      <Paper sx={editCardSx}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1} sx={{ mb: 1.5 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>
            Edit Attendance Record
          </Typography>
          {editRow ? (
            <Chip size="small" color="primary" variant="outlined" label={`${editRow.EmployeeName || 'Employee'} | ${editRow.AttendanceDate || '-'}`} />
          ) : (
            <Typography variant="body2" sx={{ color: 'var(--muted)' }}>
              Click a row in the table to edit date/time.
            </Typography>
          )}
        </Stack>

        {editRow ? (
          <>
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))', gap: 1.2 }}>
              <TextField
                type="date"
                label="Date"
                size="small"
                value={editRow.AttendanceDate || ''}
                onChange={(e) => handleEditChange('AttendanceDate', e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
              <TextField
                type="time"
                label="AM In"
                size="small"
                value={editRow.MorningTimeIn || ''}
                onChange={(e) => handleEditChange('MorningTimeIn', e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank to clear"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => handleEditChange('MorningTimeIn', '')} aria-label="clear AM In">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                type="time"
                label="AM Out"
                size="small"
                value={editRow.MorningTimeOut || ''}
                onChange={(e) => handleEditChange('MorningTimeOut', e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank to clear"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => handleEditChange('MorningTimeOut', '')} aria-label="clear AM Out">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                type="time"
                label="PM In"
                size="small"
                value={editRow.AfternoonTimeIn || ''}
                onChange={(e) => handleEditChange('AfternoonTimeIn', e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank to clear"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => handleEditChange('AfternoonTimeIn', '')} aria-label="clear PM In">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
              <TextField
                type="time"
                label="PM Out"
                size="small"
                value={editRow.AfternoonTimeOut || ''}
                onChange={(e) => handleEditChange('AfternoonTimeOut', e.target.value)}
                InputLabelProps={{ shrink: true }}
                helperText="Leave blank to clear"
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => handleEditChange('AfternoonTimeOut', '')} aria-label="clear PM Out">
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  )
                }}
              />
            </Box>
            <Stack direction="row" spacing={1} sx={{ mt: 1.5 }}>
              <Button variant="outlined" size="small" onClick={() => setEditRow(null)}>
                Cancel
              </Button>
              <Button variant="contained" size="small" onClick={handleEditSave} disabled={saving} sx={saveBtnSx}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </Stack>
          </>
        ) : null}
      </Paper>

      <GenericDataTable
        title="Details"
        columns={['Name', 'Shift', 'Date', 'Status', 'AM In', 'AM Out', 'PM In', 'PM Out', 'Hours']}
        data={filtered}
        loading={loading}
        error={error}
        primaryKeyField="AttendanceID"
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onRowClick={openEdit}
        renderRow={(row) => (
          <>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{row.__ShiftResolved || row.ShiftName || row.shiftName || row.Shift || row.shift || 'No shift'}</TableCell>
            <TableCell>{fmtDate(row.AttendanceDate)}</TableCell>
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
    ok: { bg: '#16a34a', fg: '#ffffff' },
    warn: { bg: '#f97316', fg: '#ffffff' },
    muted: { bg: '#4f46e5', fg: '#ffffff' },
    neutral: { bg: '#6b7280', fg: '#ffffff' }
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
    'half-day': { bg: '#0ea5e9', fg: '#ffffff' },
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
