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
  TableCell,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import ppcwdLogo from '../styles/ppcwdLogo.png'

const reportStatusOptions = [
  { value: 'on-time', label: 'On-Time' },
  { value: 'late', label: 'Late' },
  { value: 'early-leave', label: 'Early Leave' },
  { value: 'absent', label: 'Absent' },
  { value: 'incomplete', label: 'Incomplete' },
  { value: 'half-day', label: 'Half-Day' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'holiday-worked', label: 'Holiday (Worked)' },
  { value: 'special-day', label: 'Special Day' },
  { value: 'special-day-worked', label: 'Special Day (Worked)' },
  { value: 'rest-day', label: 'Rest Day' },
  { value: 'rest-day-worked', label: 'Rest Day (Worked)' }
]

const detailedColumnDefs = [
  { key: 'Employee', label: 'Name' },
  { key: 'Shift', label: 'Shift' },
  { key: 'Date', label: 'Date' },
  { key: 'Status', label: 'Status' },
  { key: 'AMIn', label: 'AM In' },
  { key: 'AMOut', label: 'AM Out' },
  { key: 'PMIn', label: 'PM In' },
  { key: 'PMOut', label: 'PM Out' },
  { key: 'OTIn', label: 'OT In' },
  { key: 'OTOut', label: 'OT Out' },
  { key: 'OTHours', label: 'OT Hours' },
  { key: 'Hours', label: 'Hours' }
]

const employeeDtrColumnDefs = [
  { key: 'Date', label: 'Date' },
  { key: 'Day', label: 'Days' },
  { key: 'AMIn', label: 'AM In' },
  { key: 'AMOut', label: 'AM Out' },
  { key: 'PMIn', label: 'PM In' },
  { key: 'PMOut', label: 'PM Out' },
  { key: 'OTIn', label: 'OT In' },
  { key: 'OTOut', label: 'OT Out' },
  { key: 'NoOfHours', label: 'No. of Hours' },
  { key: 'Remarks', label: 'Remarks' }
]

const tardinessColumnDefs = [
  { key: 'Employee', label: 'Name' },
  { key: 'Shift', label: 'Shift' },
  { key: 'Date', label: 'Date' },
  { key: 'Day', label: 'Days' },
  { key: 'Status', label: 'Status' },
  { key: 'MorningTardinessMinutes', label: 'AM Tardiness' },
  { key: 'MorningUndertimeMinutes', label: 'AM Undertime' },
  { key: 'AfternoonTardinessMinutes', label: 'PM Tardiness' },
  { key: 'AfternoonUndertimeMinutes', label: 'PM Undertime' },
  { key: 'TotalTardinessMinutes', label: 'Total Tardiness' },
  { key: 'TotalUndertimeMinutes', label: 'Total Undertime' },
  { key: 'TotalMinutes', label: 'Total Minutes' }
]

const employeeTardinessColumnDefs = [
  { key: 'Date', label: 'Date' },
  { key: 'Day', label: 'Days' },
  { key: 'Shift', label: 'Shift' },
  { key: 'Status', label: 'Status' },
  { key: 'MorningTardinessMinutes', label: 'AM Tardiness' },
  { key: 'MorningUndertimeMinutes', label: 'AM Undertime' },
  { key: 'AfternoonTardinessMinutes', label: 'PM Tardiness' },
  { key: 'AfternoonUndertimeMinutes', label: 'PM Undertime' },
  { key: 'TotalTardinessMinutes', label: 'Total Tardiness' },
  { key: 'TotalUndertimeMinutes', label: 'Total Undertime' },
  { key: 'TotalMinutes', label: 'Total Minutes' }
]

const summaryColumnDefs = [
  { key: 'Name', label: 'Name' },
  { key: 'StaffCode', label: 'Staff Code' },
  { key: 'Department', label: 'Department' },
  { key: 'YearMonth', label: 'Year/Month' },
  { key: 'DueAttendanceDays', label: 'Due Attendance Days' },
  { key: 'ActualAttendanceDays', label: 'Actual Attendance Days' },
  { key: 'DaysAbsent', label: 'Days Absent' },
  { key: 'WorkingHours', label: 'Working Hours' },
  { key: 'OTHours', label: 'OT Hours' },
  { key: 'LateInMinutes', label: 'Tardiness Minutes' },
  { key: 'EarlyOutMinutes', label: 'Undertime Minutes' },
  { key: 'PublicHolidayHours', label: 'Public Holiday Hours' },
  { key: 'LeaveHours', label: 'Leave Hours' }
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

function fmtDisplayDate(value) {
  const iso = fmtDate(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso
  const [year, month, day] = iso.split('-')
  return `${month}/${day}/${year}`
}

function fmtTime(value) {
  if (!value) return '-'
  if (typeof value === 'string' && /^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function toTimeInputValue(value) {
  const formatted = fmtTime(value)
  return formatted === '-' ? '' : formatted
}

function fmtWeekday(value) {
  const iso = fmtDate(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '-'
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString([], { weekday: 'long' })
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

function assetUrlToDataUri(url) {
  return fetch(url)
    .then((res) => {
      if (!res.ok) throw new Error(`Failed to load asset: ${res.status}`)
      return res.blob()
    })
    .then((blob) => new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Failed to convert asset to data URL'))
      reader.readAsDataURL(blob)
    }))
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

function isNonWorkingDayType(value) {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized === 'HOLIDAY' || normalized === 'REST_DAY' || normalized === 'SPECIAL_NON_WORKING'
}

function isWeekendIsoDate(value) {
  const raw = fmtDate(value)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return false
  const date = new Date(`${raw}T00:00:00`)
  if (Number.isNaN(date.getTime())) return false
  const day = date.getDay()
  return day === 0 || day === 6
}

function isRegularWorkingDayForOvertime(raw) {
  const specialDayType = String(raw?.SpecialDayType || '').trim().toUpperCase()
  const dateText = raw?.AttendanceDate || raw?.AttendanceDay || raw?.Date
  return !isNonWorkingDayType(specialDayType) && !isWeekendIsoDate(dateText)
}

function actualSegmentMinutes(actualIn, actualOut) {
  const aIn = hhmmToMinutes(actualIn)
  const aOut = hhmmToMinutes(actualOut)
  if (aIn == null || aOut == null || aOut <= aIn) return 0
  return Math.max(0, aOut - aIn)
}

function clampSegmentMinutes(actualIn, actualOut, reqIn, reqOut) {
  const aIn = hhmmToMinutes(actualIn)
  const aOut = hhmmToMinutes(actualOut)
  if (aIn == null || aOut == null || aOut <= aIn) return 0

  const rIn = hhmmToMinutes(reqIn)
  const rOut = hhmmToMinutes(reqOut)
  if (rIn == null || rOut == null || rOut <= rIn) return Math.max(0, aOut - aIn)

  const start = Math.max(aIn, rIn)
  const end = Math.min(aOut, rOut)
  return Math.max(0, end - start)
}

function computeWorkedMinutes(row) {
  const total =
    clampSegmentMinutes(row.MorningTimeIn, row.MorningTimeOut, row.RequiredMorningIn, row.RequiredMorningOut) +
    clampSegmentMinutes(row.AfternoonTimeIn, row.AfternoonTimeOut, row.RequiredAfternoonIn, row.RequiredAfternoonOut)

  return Math.max(0, total)
}

function computeHours(row) {
  return formatMinutesAsHoursMins(computeWorkedMinutes(row))
}

function toInterval(start, end) {
  const s = hhmmToMinutes(start)
  const e = hhmmToMinutes(end)
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

function sumIntervals(intervals) {
  return intervals.reduce((sum, interval) => sum + Math.max(0, interval.end - interval.start), 0)
}

function minutesToTimeText(totalMinutes) {
  if (!Number.isFinite(totalMinutes)) return ''
  const safeMinutes = Math.max(0, Math.round(totalMinutes))
  const hh = Math.floor(safeMinutes / 60)
  const mm = safeMinutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function getActualWorkIntervalsFromRaw(raw) {
  const row = buildSourceRowForCalc(raw)
  return [
    toInterval(row.MorningTimeIn, row.MorningTimeOut),
    toInterval(row.AfternoonTimeIn, row.AfternoonTimeOut)
  ].filter(Boolean)
}

function getRequiredScheduleIntervalsFromRaw(raw) {
  if (!isRegularWorkingDayForOvertime(raw)) return []

  const row = buildSourceRowForCalc(raw)
  return [
    toInterval(row.RequiredMorningIn, row.RequiredMorningOut),
    toInterval(row.RequiredAfternoonIn, row.RequiredAfternoonOut)
  ].filter(Boolean)
}

function getActualOvertimeIntervalsFromRaw(raw) {
  const actualIntervals = getActualWorkIntervalsFromRaw(raw)
  const scheduleIntervals = getRequiredScheduleIntervalsFromRaw(raw)

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

function trimIntervalsFromMinute(intervals, minStart) {
  return (Array.isArray(intervals) ? intervals : [])
    .map((interval) => {
      const start = Math.max(interval.start, minStart)
      const end = interval.end
      if (end <= start) return null
      return { start, end }
    })
    .filter(Boolean)
}

function sortOvertimeEntries(entries) {
  return [...(Array.isArray(entries) ? entries : [])].sort((a, b) => {
    const aStart = hhmmToMinutes(a?.StartTime)
    const bStart = hhmmToMinutes(b?.StartTime)
    if (aStart == null && bStart == null) return 0
    if (aStart == null) return 1
    if (bStart == null) return -1
    return aStart - bStart
  })
}

function allocateMinutesFromIntervals(intervals, approvedMinutes) {
  let remainingMinutes = approvedMinutes
  const allocated = []
  const nextIntervals = []

  for (const interval of Array.isArray(intervals) ? intervals : []) {
    if (remainingMinutes <= 0) {
      nextIntervals.push(interval)
      continue
    }

    const availableMinutes = Math.max(0, interval.end - interval.start)
    const usedMinutes = Math.min(remainingMinutes, availableMinutes)

    if (usedMinutes > 0) {
      allocated.push({
        start: interval.start,
        end: interval.start + usedMinutes
      })
      remainingMinutes -= usedMinutes
    }

    if (interval.start + usedMinutes < interval.end) {
      nextIntervals.push({
        start: interval.start + usedMinutes,
        end: interval.end
      })
    }
  }

  return { allocated, remainingIntervals: nextIntervals }
}

function getApprovedOvertimeIntervalsForRow(raw, overtimeEntries) {
  const entries = sortOvertimeEntries(overtimeEntries)
  if (!entries.length) return []

  const regularDayOvertimeFloor = 18 * 60
  let availableIntervals = getActualOvertimeIntervalsFromRaw(raw)

  if (isRegularWorkingDayForOvertime(raw)) {
    availableIntervals = trimIntervalsFromMinute(availableIntervals, regularDayOvertimeFloor)
  }

  if (!availableIntervals.length) return []

  const approvedIntervals = []
  for (const entry of entries) {
    const approvedMinutes = getApprovedEntryMinutes(entry)
    if (approvedMinutes == null || approvedMinutes <= 0) continue

    const allocation = allocateMinutesFromIntervals(availableIntervals, approvedMinutes)
    approvedIntervals.push(...allocation.allocated)
    availableIntervals = allocation.remainingIntervals
    if (!availableIntervals.length) break
  }

  return approvedIntervals
}

function getApprovedWindowIntervals(entries) {
  return sortOvertimeEntries(entries)
    .map((entry) => toInterval(entry?.StartTime, entry?.EndTime))
    .filter(Boolean)
}

function getApprovedCountedIntervals(entries) {
  return sortOvertimeEntries(entries)
    .map((entry) => {
      const windowInterval = toInterval(entry?.StartTime, entry?.EndTime)
      if (!windowInterval) return null

      const approvedMinutes = getApprovedEntryMinutes(entry)
      if (approvedMinutes == null || approvedMinutes <= 0) return windowInterval

      return {
        start: windowInterval.start,
        end: Math.min(windowInterval.end, windowInterval.start + approvedMinutes)
      }
    })
    .filter(Boolean)
}

function computePayableOvertimeMinutesForRow(raw, overtimeEntries) {
  const officialIntervals = getOfficialOvertimeIntervalsFromEntries(overtimeEntries)
  if (officialIntervals.length) return sumIntervals(officialIntervals)

  const actualApprovedIntervals = getApprovedOvertimeIntervalsForRow(raw, overtimeEntries)
  if (actualApprovedIntervals.length) return sumIntervals(actualApprovedIntervals)

  return sumIntervals(getApprovedCountedIntervals(overtimeEntries))
}

function computePolicyAwareWorkedMinutes(raw, overtimeEntries) {
  const actualMinutes =
    actualSegmentMinutes(fmtTime(raw.MorningTimeIn), fmtTime(raw.MorningTimeOut)) +
    actualSegmentMinutes(fmtTime(raw.AfternoonTimeIn), fmtTime(raw.AfternoonTimeOut))

  // On weekends / non-working days, worked hours only count when there is approved OT.
  if (!isRegularWorkingDayForOvertime(raw)) {
    return Math.min(actualMinutes, computePayableOvertimeMinutesForRow(raw, overtimeEntries))
  }

  const regularMinutes = computeWorkedMinutes({
    MorningTimeIn: fmtTime(raw.MorningTimeIn),
    MorningTimeOut: fmtTime(raw.MorningTimeOut),
    AfternoonTimeIn: fmtTime(raw.AfternoonTimeIn),
    AfternoonTimeOut: fmtTime(raw.AfternoonTimeOut),
    RequiredMorningIn: fmtTime(raw.RequiredMorningIn),
    RequiredMorningOut: fmtTime(raw.RequiredMorningOut),
    RequiredAfternoonIn: fmtTime(raw.RequiredAfternoonIn),
    RequiredAfternoonOut: fmtTime(raw.RequiredAfternoonOut)
  })

  return regularMinutes + computePayableOvertimeMinutesForRow(raw, overtimeEntries)
}

function getRowEmployeeId(row) {
  return String(row?.EmployeeID || row?.employeeID || '')
}

function filterRowsByEmployee(sourceRows, employeeId) {
  const safeRows = Array.isArray(sourceRows) ? sourceRows : []
  if (!employeeId) return safeRows
  return safeRows.filter((row) => getRowEmployeeId(row) === employeeId)
}

function getEmployeeDateKey(row) {
  const employeeId = getRowEmployeeId(row)
  const date = fmtDate(row?.AttendanceDate || row?.AttendanceDay || row?.Date)
  if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return ''
  return `${employeeId}:${date}`
}

function mergeAttendanceRowsWithOvertimeRows(attendanceRows, overtimeRows, rawAttendanceRows) {
  const merged = Array.isArray(attendanceRows) ? [...attendanceRows] : []
  const seenKeys = new Set(merged.map(getEmployeeDateKey).filter(Boolean))
  const rawByKey = new Map(
    (Array.isArray(rawAttendanceRows) ? rawAttendanceRows : [])
      .map((row) => [getEmployeeDateKey(row), row])
      .filter(([key]) => Boolean(key))
  )

  for (const overtimeEntry of Array.isArray(overtimeRows) ? overtimeRows : []) {
    const employeeId = String(overtimeEntry?.EmployeeID || '').trim()
    const date = fmtDate(overtimeEntry?.OvertimeDate)
    const key = employeeId && /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${employeeId}:${date}` : ''
    if (!key || seenKeys.has(key)) continue

    const rawRow = rawByKey.get(key)
    if (!rawRow) continue

    merged.push(rawRow)
    seenKeys.add(key)
  }

  return merged.sort((a, b) => {
    const dateA = fmtDate(a?.AttendanceDate || a?.AttendanceDay || a?.Date)
    const dateB = fmtDate(b?.AttendanceDate || b?.AttendanceDay || b?.Date)
    if (dateA !== dateB) return String(dateB).localeCompare(String(dateA))

    const nameA = String(a?.EmployeeName || a?.EmployeeCode || '')
    const nameB = String(b?.EmployeeName || b?.EmployeeCode || '')
    return nameA.localeCompare(nameB)
  })
}

function getDisplayOvertimeBounds(raw, entries) {
  const safeEntries = Array.isArray(entries) ? entries : []
  if (!safeEntries.length) {
    return { in: '', out: '' }
  }

  const officialIntervals = getOfficialOvertimeIntervalsFromEntries(safeEntries)
  if (officialIntervals.length) {
    return {
      in: minutesToTimeText(officialIntervals[0].start) || '',
      out: minutesToTimeText(officialIntervals[officialIntervals.length - 1].end) || ''
    }
  }

  const approvedOvertimeIntervals = getApprovedOvertimeIntervalsForRow(raw, safeEntries)
  if (approvedOvertimeIntervals.length) {
    const starts = approvedOvertimeIntervals.map((interval) => minutesToTimeText(interval.start)).filter(Boolean)
    const ends = approvedOvertimeIntervals.map((interval) => minutesToTimeText(interval.end)).filter(Boolean)

    return {
      in: starts[0] || '',
      out: ends[ends.length - 1] || ''
    }
  }

  const approvedWindowIntervals = getApprovedWindowIntervals(safeEntries)
  if (!approvedWindowIntervals.length) {
    return { in: '', out: '' }
  }

  const starts = approvedWindowIntervals.map((interval) => minutesToTimeText(interval.start)).filter(Boolean)
  const ends = approvedWindowIntervals.map((interval) => minutesToTimeText(interval.end)).filter(Boolean)

  return {
    in: starts[0] || '',
    out: ends[ends.length - 1] || ''
  }
}

function toReportRow(r, overtimeEntriesByKey = new Map()) {
  const employee = r.EmployeeName || r.EmployeeCode || '-'
  const shift = r.ShiftName || r.RequiredShiftName || r.ScheduleName || r.PeriodName || '-'
  const date = fmtDate(r.AttendanceDate || r.AttendanceDay || r.Date)
  const status = r.AttendanceSummary || r.Status || '-'
  const amIn = fmtTime(r.MorningTimeIn)
  const amOut = fmtTime(r.MorningTimeOut)
  const pmIn = fmtTime(r.AfternoonTimeIn)
  const pmOut = fmtTime(r.AfternoonTimeOut)
  const overtimeEntries = overtimeEntriesByKey.get(`${String(r.EmployeeID || r.employeeID || '')}:${date}`) || []
  const overtimeBounds = getDisplayOvertimeBounds(r, overtimeEntries)
  const overtimeMinutes = computePayableOvertimeMinutesForRow(r, overtimeEntries)
  const hours = formatMinutesAsHoursMins(computePolicyAwareWorkedMinutes(r, overtimeEntries))

  return {
    AttendanceID: r.AttendanceID || `${employee}-${date}-${shift}`,
    Employee: employee,
    Shift: shift,
    Date: fmtDisplayDate(date),
    Status: status,
    AMIn: amIn,
    AMOut: amOut,
    PMIn: pmIn,
    PMOut: pmOut,
    OTIn: overtimeBounds.in || '',
    OTOut: overtimeBounds.out || '',
    OTHours: overtimeMinutes > 0 ? formatMinutesAsHoursMins(overtimeMinutes) : '',
    Hours: hours,
    __raw: r
  }
}

function toEmployeeDtrRow(r, overtimeEntriesByKey = new Map()) {
  const date = fmtDate(r.AttendanceDate || r.AttendanceDay || r.Date)
  const overtimeEntries = overtimeEntriesByKey.get(`${getRowEmployeeId(r)}:${date}`) || []
  const overtimeBounds = getDisplayOvertimeBounds(r, overtimeEntries)

  return {
    AttendanceID: r.AttendanceID || `${getRowEmployeeId(r)}-${date}`,
    Date: fmtDisplayDate(date),
    Day: fmtWeekday(date),
    AMIn: fmtTime(r.MorningTimeIn),
    AMOut: fmtTime(r.MorningTimeOut),
    PMIn: fmtTime(r.AfternoonTimeIn),
    PMOut: fmtTime(r.AfternoonTimeOut),
    NoOfHours: formatHourMinuteValue(computePolicyAwareWorkedMinutes(r, overtimeEntries)),
    OTIn: overtimeBounds.in,
    OTOut: overtimeBounds.out,
    Remarks: String(r.Remarks || '').trim(),
    __raw: r
  }
}

function toMinuteText(totalMinutes) {
  return String(Math.max(0, Math.round(Number(totalMinutes) || 0)))
}

function toSegmentMinuteText(totalMinutes, enabled) {
  return enabled ? toMinuteText(totalMinutes) : ''
}

function getTardinessDueWeight(raw, expectedSegments) {
  const specialDayType = String(raw?.SpecialDayType || '').trim().toUpperCase()
  const date = fmtDate(raw?.AttendanceDate || raw?.AttendanceDay || raw?.Date)
  const isWeekend = isWeekendIsoDate(date)
  const isHoliday = specialDayType === 'HOLIDAY'
  const isSpecialNonWorking = specialDayType === 'SPECIAL_NON_WORKING'
  const isRestDay = specialDayType === 'REST_DAY'
  const isHalfDaySpecial = specialDayType.startsWith('HALF_DAY')

  if (isHoliday || isSpecialNonWorking || isRestDay || isWeekend) return 0
  if (isHalfDaySpecial) return 0.5
  return expectedSegments.length > 0 ? 1 : 0
}

function getTardinessBreakdownForRow(raw, leaveEntriesForDay = []) {
  const expectedSegments = getExpectedSegments(raw)
  const dueWeight = getTardinessDueWeight(raw, expectedSegments)
  const result = {
    hasMorning: expectedSegments.some((segment) => segment.kind === 'AM'),
    hasAfternoon: expectedSegments.some((segment) => segment.kind === 'PM'),
    morningTardiness: 0,
    morningUndertime: 0,
    afternoonTardiness: 0,
    afternoonUndertime: 0,
    totalTardiness: 0,
    totalUndertime: 0,
    hasIncompleteSegment: false,
    proofRequiredKinds: [],
    proofReason: ''
  }

  if (dueWeight <= 0) return result

  const leaveImpact = getLeaveImpactForRow(leaveEntriesForDay, expectedSegments, dueWeight)
  const proofMessages = []

  expectedSegments.forEach((segment) => {
    if (leaveImpact.coveredKinds.has(segment.kind)) return

    let tardiness = 0
    let undertime = 0

    const requiredIn = hhmmToMinutes(segment.reqIn)
    const actualIn = hhmmToMinutes(segment.actualIn)
    const requiredOut = hhmmToMinutes(segment.reqOut)
    const actualOut = hhmmToMinutes(segment.actualOut)

    if (requiredIn != null && actualIn != null && requiredOut != null && actualOut != null) {
      tardiness = Math.max(0, actualIn - requiredIn)
      undertime = Math.max(0, requiredOut - actualOut)
    } else if (requiredIn != null && actualIn == null && actualOut != null) {
      tardiness = requiredSegmentMinutes(segment.reqIn, segment.reqOut)
      result.hasIncompleteSegment = true
      result.proofRequiredKinds.push(segment.kind)
      proofMessages.push(`${segment.kind} tardiness missing`)
    } else if (requiredOut != null && actualIn != null && actualOut == null) {
      undertime = requiredSegmentMinutes(segment.reqIn, segment.reqOut)
      result.hasIncompleteSegment = true
      result.proofRequiredKinds.push(segment.kind)
      proofMessages.push(`${segment.kind} undertime missing`)
    }

    if (segment.kind === 'AM') {
      result.morningTardiness = tardiness
      result.morningUndertime = undertime
    } else if (segment.kind === 'PM') {
      result.afternoonTardiness = tardiness
      result.afternoonUndertime = undertime
    }
  })

  result.proofRequiredKinds = Array.from(new Set(result.proofRequiredKinds))
  result.proofReason = proofMessages.join(' ')
  result.totalTardiness = result.morningTardiness + result.afternoonTardiness
  result.totalUndertime = result.morningUndertime + result.afternoonUndertime
  return result
}

function toTardinessReportRow(r, leaveEntriesByKey = new Map(), includeEmployee = true) {
  const date = fmtDate(r.AttendanceDate || r.AttendanceDay || r.Date)
  const leaveEntries = leaveEntriesByKey.get(`${getRowEmployeeId(r)}:${date}`) || []
  const metrics = getTardinessBreakdownForRow(r, leaveEntries)
  const statusText = r.AttendanceSummary || r.Status || '-'
  const pausedLabel = metrics.hasIncompleteSegment
    ? metrics.proofReason || statusText
    : statusText
  const baseRow = {
    AttendanceID: r.AttendanceID || `${getRowEmployeeId(r) || (r.EmployeeName || r.EmployeeCode || '-')}-${date}-tardiness`,
    Shift: r.ShiftName || r.RequiredShiftName || r.ScheduleName || r.PeriodName || '-',
    Date: fmtDisplayDate(date),
    Day: fmtWeekday(date),
    Status: pausedLabel,
    MorningTardinessMinutes: toSegmentMinuteText(metrics.morningTardiness, metrics.hasMorning),
    MorningUndertimeMinutes: toSegmentMinuteText(metrics.morningUndertime, metrics.hasMorning),
    AfternoonTardinessMinutes: toSegmentMinuteText(metrics.afternoonTardiness, metrics.hasAfternoon),
    AfternoonUndertimeMinutes: toSegmentMinuteText(metrics.afternoonUndertime, metrics.hasAfternoon),
    TotalTardinessMinutes: toMinuteText(metrics.totalTardiness),
    TotalUndertimeMinutes: toMinuteText(metrics.totalUndertime),
    TotalMinutes: toMinuteText(metrics.totalTardiness + metrics.totalUndertime),
    ProofNote: metrics.proofReason,
    __needsProof: metrics.hasIncompleteSegment,
    __raw: r
  }

  if (!includeEmployee) return baseRow

  return {
    ...baseRow,
    Employee: r.EmployeeName || r.EmployeeCode || '-'
  }
}

function toEmployeeTardinessReportRow(r, leaveEntriesByKey = new Map()) {
  return toTardinessReportRow(r, leaveEntriesByKey, false)
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
  if (filterValue === 'special-day-worked') {
    return s.includes('special non-working') && s.includes('worked')
  }
  if (filterValue === 'special-day') {
    return s === 'special non-working day'
  }
  if (filterValue === 'rest-day-worked') {
    return (s.includes('rest day') || s.includes('rest-day')) && s.includes('worked')
  }
  if (filterValue === 'rest-day') {
    return s === 'rest day' || s === 'rest-day'
  }
  return true
}

function formatDecimalHours(totalMinutes) {
  const minutes = Number.isFinite(totalMinutes) ? totalMinutes : 0
  return (minutes / 60).toFixed(2)
}

function formatHourMinuteValue(totalMinutes) {
  const safeMinutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0
  const hours = Math.floor(safeMinutes / 60)
  const minutes = safeMinutes % 60
  return `${hours}.${String(minutes).padStart(2, '0')}`
}

function formatDayCount(value) {
  const n = Number.isFinite(value) ? value : 0
  return (Math.round(n * 100) / 100).toString()
}

function normalizeStaffCode(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return '-'
  if (!/^\d+$/.test(raw)) return raw
  const stripped = raw.replace(/^0+(?=\d)/, '')
  return stripped || '0'
}

function toYearMonth(value) {
  const date = fmtDate(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date.slice(0, 4)}/${date.slice(5, 7)}` : '-'
}

function buildSourceRowForCalc(raw) {
  return {
    MorningTimeIn: fmtTime(raw.MorningTimeIn),
    MorningTimeOut: fmtTime(raw.MorningTimeOut),
    AfternoonTimeIn: fmtTime(raw.AfternoonTimeIn),
    AfternoonTimeOut: fmtTime(raw.AfternoonTimeOut),
    RequiredMorningIn: fmtTime(raw.RequiredMorningIn),
    RequiredMorningOut: fmtTime(raw.RequiredMorningOut),
    RequiredAfternoonIn: fmtTime(raw.RequiredAfternoonIn),
    RequiredAfternoonOut: fmtTime(raw.RequiredAfternoonOut)
  }
}

function getExpectedSegments(raw) {
  const row = buildSourceRowForCalc(raw)
  return [
    {
      kind: 'AM',
      actualIn: row.MorningTimeIn,
      actualOut: row.MorningTimeOut,
      reqIn: row.RequiredMorningIn,
      reqOut: row.RequiredMorningOut
    },
    {
      kind: 'PM',
      actualIn: row.AfternoonTimeIn,
      actualOut: row.AfternoonTimeOut,
      reqIn: row.RequiredAfternoonIn,
      reqOut: row.RequiredAfternoonOut
    }
  ].filter((segment) => segment.reqIn && segment.reqOut)
}

function requiredSegmentMinutes(reqIn, reqOut) {
  const start = hhmmToMinutes(reqIn)
  const end = hhmmToMinutes(reqOut)
  if (start == null || end == null || end <= start) return 0
  return end - start
}

function segmentHasAnyPunch(segment) {
  return Boolean(segment?.actualIn || segment?.actualOut)
}

function normalizeDecimalMinutes(value) {
  if (value == null || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric) || numeric < 0) return null
  return Math.round(numeric)
}

function getApprovedEntryMinutes(entry) {
  const directMinutes = normalizeDecimalMinutes(entry?.ApprovedMinutes)
  if (directMinutes != null) return directMinutes

  const hoursValue = entry?.ApprovedHours
  if (hoursValue != null && hoursValue !== '') {
    const numeric = Number(hoursValue)
    if (Number.isFinite(numeric) && numeric >= 0) return Math.round(numeric * 60)
  }

  return computeMinutesBetweenWindow(entry?.StartTime, entry?.EndTime)
}

function getOfficialOvertimeIntervalsFromEntries(entries) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => toInterval(
      entry?.OfficialPunchInTime || entry?.OfficialTimeIn || entry?.PunchInTime,
      entry?.OfficialPunchOutTime || entry?.OfficialTimeOut || entry?.PunchOutTime
    ))
    .filter(Boolean)
    .sort((a, b) => a.start - b.start)
}

function computeMinutesBetweenWindow(startTime, endTime) {
  const start = hhmmToMinutes(startTime)
  const end = hhmmToMinutes(endTime)
  if (start == null || end == null || end <= start) return null
  return end - start
}

function addDaysToIso(dateText, daysToAdd) {
  const value = fmtDate(dateText)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  date.setDate(date.getDate() + daysToAdd)
  return toDateInputValue(date)
}

function buildOvertimeEntriesByKey(entries) {
  const indexed = new Map()

  for (const entry of Array.isArray(entries) ? entries : []) {
    const employeeId = String(entry?.EmployeeID || '')
    const date = fmtDate(entry?.OvertimeDate)
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue

    const minutes = getApprovedEntryMinutes(entry)
    if (minutes == null || minutes <= 0) continue

    const key = `${employeeId}:${date}`
    const bucket = indexed.get(key) || []
    bucket.push({
      ...entry,
      ApprovedMinutes: minutes
    })
    indexed.set(key, bucket)
  }

  return indexed
}

function buildLeaveEntriesByKey(entries) {
  const indexed = new Map()

  for (const entry of Array.isArray(entries) ? entries : []) {
    const employeeId = String(entry?.EmployeeID || '')
    const startDate = fmtDate(entry?.LeaveStartDate)
    const endDate = fmtDate(entry?.LeaveEndDate || entry?.LeaveStartDate)
    if (!employeeId || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) continue

    let cursor = startDate
    let guard = 0
    while (cursor && cursor <= endDate && guard < 4000) {
      const key = `${employeeId}:${cursor}`
      const bucket = indexed.get(key) || []
      bucket.push(entry)
      indexed.set(key, bucket)
      cursor = addDaysToIso(cursor, 1)
      guard += 1
    }
  }

  return indexed
}

function getLeaveImpactForRow(leaveEntries, expectedSegments, dueWeight) {
  if (!Array.isArray(leaveEntries) || !leaveEntries.length || dueWeight <= 0 || !expectedSegments.length) {
    return {
      coveredKinds: new Set(),
      leaveDayWeight: 0,
      leaveMinutes: 0
    }
  }

  const segmentWeight = dueWeight / expectedSegments.length
  const scheduledMinutes = expectedSegments.reduce((sum, segment) => sum + requiredSegmentMinutes(segment.reqIn, segment.reqOut), 0)
  const coveredKinds = new Set()
  let leaveDayWeight = 0
  let leaveMinutes = 0

  for (const entry of leaveEntries) {
    const unitType = String(entry?.LeaveUnitType || 'FULL_DAY').trim().toUpperCase()
    const approvedMinutes = getApprovedEntryMinutes(entry)

    if (unitType === 'FULL_DAY') {
      expectedSegments.forEach((segment) => coveredKinds.add(segment.kind))
      leaveDayWeight = dueWeight
      leaveMinutes += approvedMinutes != null ? approvedMinutes : scheduledMinutes
      continue
    }

    if (unitType === 'HALF_DAY_AM' || unitType === 'HALF_DAY_PM') {
      const targetKind = unitType.endsWith('_PM') ? 'PM' : 'AM'
      const targetSegment = expectedSegments.find((segment) => segment.kind === targetKind)
      if (!targetSegment) continue

      coveredKinds.add(targetKind)
      leaveDayWeight += segmentWeight
      leaveMinutes += approvedMinutes != null ? approvedMinutes : requiredSegmentMinutes(targetSegment.reqIn, targetSegment.reqOut)
      continue
    }

    const hoursMinutes = approvedMinutes != null ? approvedMinutes : 0
    if (hoursMinutes > 0 && scheduledMinutes > 0) {
      leaveDayWeight += Math.min(dueWeight, dueWeight * (hoursMinutes / scheduledMinutes))
      leaveMinutes += hoursMinutes
    }

    const leaveStart = hhmmToMinutes(entry?.StartTime)
    const leaveEnd = hhmmToMinutes(entry?.EndTime)
    if (leaveStart == null || leaveEnd == null || leaveEnd <= leaveStart) continue

    expectedSegments.forEach((segment) => {
      const reqStart = hhmmToMinutes(segment.reqIn)
      const reqEnd = hhmmToMinutes(segment.reqOut)
      if (reqStart == null || reqEnd == null) return
      if (leaveStart <= reqStart && leaveEnd >= reqEnd) {
        coveredKinds.add(segment.kind)
      }
    })
  }

  return {
    coveredKinds,
    leaveDayWeight: Math.min(dueWeight, leaveDayWeight),
    leaveMinutes
  }
}

function buildSummaryRows(sourceRows, employeeMetaById, overtimeEntries, leaveEntries) {
  const grouped = new Map()
  const overtimeEntriesByKey = buildOvertimeEntriesByKey(overtimeEntries)
  const leaveEntriesByKey = buildLeaveEntriesByKey(leaveEntries)

  for (const raw of Array.isArray(sourceRows) ? sourceRows : []) {
    const date = fmtDate(raw.AttendanceDate || raw.AttendanceDay || raw.Date)
    const yearMonth = toYearMonth(date)
    const employeeId = String(raw.EmployeeID || raw.employeeID || raw.EmployeeCode || raw.EmployeeName || '')
    const employeeMeta = employeeMetaById.get(employeeId) || {}
    const name = raw.EmployeeName || raw.EmployeeCode || employeeMeta.name || '-'
    const staffCode = normalizeStaffCode(raw.EmployeeCode || employeeMeta.employeeCode || employeeMeta.EmployeeCode || '')
    const department = raw.Department || employeeMeta.department || employeeMeta.Department || '-'
    const groupKey = `${employeeId}:${yearMonth}`
    const specialDayType = String(raw.SpecialDayType || '').trim().toUpperCase()
    const isWeekend = isWeekendIsoDate(date)
    const isHoliday = specialDayType === 'HOLIDAY'
    const isSpecialNonWorking = specialDayType === 'SPECIAL_NON_WORKING'
    const isRestDay = specialDayType === 'REST_DAY'
    const isHalfDaySpecial = specialDayType.startsWith('HALF_DAY')
    const calcRow = buildSourceRowForCalc(raw)
    const expectedSegments = getExpectedSegments(raw)
    const overtimeMinutes = computePayableOvertimeMinutesForRow(
      raw,
      overtimeEntriesByKey.get(`${employeeId}:${date}`) || []
    )
    const leaveImpact = getLeaveImpactForRow(
      leaveEntriesByKey.get(`${employeeId}:${date}`) || [],
      expectedSegments,
      isHoliday || isSpecialNonWorking || isRestDay || isWeekend ? 0 : (isHalfDaySpecial ? 0.5 : (expectedSegments.length > 0 ? 1 : 0))
    )
    const actualMinutesTotal =
      actualSegmentMinutes(calcRow.MorningTimeIn, calcRow.MorningTimeOut) +
      actualSegmentMinutes(calcRow.AfternoonTimeIn, calcRow.AfternoonTimeOut)
    const workedMinutes =
      clampSegmentMinutes(calcRow.MorningTimeIn, calcRow.MorningTimeOut, calcRow.RequiredMorningIn, calcRow.RequiredMorningOut) +
      clampSegmentMinutes(calcRow.AfternoonTimeIn, calcRow.AfternoonTimeOut, calcRow.RequiredAfternoonIn, calcRow.RequiredAfternoonOut)
    const overtimeMinutesNormal = Math.max(0, actualMinutesTotal - workedMinutes)

    let dueWeight = 0
    if (isHoliday || isSpecialNonWorking || isRestDay || isWeekend) {
      dueWeight = 0
    } else if (isHalfDaySpecial) {
      dueWeight = 0.5
    } else if (expectedSegments.length > 0) {
      dueWeight = 1
    }

    const segmentWeight = expectedSegments.length > 1
      ? dueWeight / expectedSegments.length
      : dueWeight

    let actualDayWeight = 0
    let lateMinutes = 0
    let earlyMinutes = 0

    const tardinessMetrics = getTardinessBreakdownForRow(
      raw,
      leaveEntriesByKey.get(`${employeeId}:${date}`) || []
    )

    expectedSegments.forEach((segment) => {
      const segmentCoveredByLeave = leaveImpact.coveredKinds.has(segment.kind)
      const segmentActualMinutes = actualSegmentMinutes(segment.actualIn, segment.actualOut)
      if (!segmentCoveredByLeave && segmentActualMinutes > 0) {
        actualDayWeight += segmentWeight
      }
    })

    lateMinutes = tardinessMetrics.totalTardiness
    earlyMinutes = tardinessMetrics.totalUndertime

    const netDueWeight = Math.max(0, dueWeight - leaveImpact.leaveDayWeight)

    const acc = grouped.get(groupKey) || {
      __key: groupKey,
      Name: name,
      StaffCode: staffCode,
      Department: department,
      YearMonth: yearMonth,
      DueAttendanceDays: 0,
      ActualAttendanceDays: 0,
      DaysAbsent: 0,
      WorkingHours: 0,
      OTHours: 0,
      LateInMinutes: 0,
      EarlyOutMinutes: 0,
      PublicHolidayHours: 0,
      LeaveHours: 0
    }

    acc.DueAttendanceDays += netDueWeight
    acc.ActualAttendanceDays += Math.min(netDueWeight, actualDayWeight)
    acc.WorkingHours += isHoliday || isSpecialNonWorking || isRestDay || isWeekend ? 0 : workedMinutes
    acc.OTHours += isHoliday ? 0 : overtimeMinutes
    acc.LateInMinutes += isHoliday || isSpecialNonWorking || isRestDay || isWeekend ? 0 : lateMinutes
    acc.EarlyOutMinutes += isHoliday || isSpecialNonWorking || isRestDay || isWeekend ? 0 : earlyMinutes
    acc.PublicHolidayHours += isHoliday ? Math.min(actualMinutesTotal, overtimeMinutes) : 0
    acc.LeaveHours += leaveImpact.leaveMinutes

    grouped.set(groupKey, acc)
  }

  return Array.from(grouped.values())
    .map((row) => {
      const due = Number(row.DueAttendanceDays || 0)
      const actual = Number(row.ActualAttendanceDays || 0)
      return {
        ...row,
        DaysAbsent: formatDayCount(Math.max(0, due - actual)),
        DueAttendanceDays: formatDayCount(due),
        ActualAttendanceDays: formatDayCount(actual),
        WorkingHours: formatDecimalHours(row.WorkingHours),
        OTHours: formatDecimalHours(row.OTHours),
        LateInMinutes: String(Math.round(row.LateInMinutes || 0)),
        EarlyOutMinutes: String(Math.round(row.EarlyOutMinutes || 0)),
        PublicHolidayHours: formatDecimalHours(row.PublicHolidayHours),
        LeaveHours: formatDecimalHours(row.LeaveHours)
      }
    })
    .sort((a, b) => {
      if (a.YearMonth !== b.YearMonth) return a.YearMonth.localeCompare(b.YearMonth)
      return a.Name.localeCompare(b.Name)
    })
}

function filterSourceRows(sourceRows, selectedStatuses) {
  const active = Array.isArray(selectedStatuses) ? selectedStatuses.filter(Boolean) : []
  if (!active.length) return Array.isArray(sourceRows) ? sourceRows : []
  return (Array.isArray(sourceRows) ? sourceRows : []).filter((row) =>
    active.some((status) => statusMatches(row.AttendanceSummary || row.Status, status))
  )
}

function buildHtmlDocument(headers, rows, title, logoSrc = '') {
  const safeHeaders = Array.isArray(headers) ? headers : []
  const safeRows = Array.isArray(rows) ? rows : []
  const safeLogoSrc = logoSrc ? escapeHtml(logoSrc) : ''

  const table = `
    ${safeRows.length ? '' : '<p style="margin:8px 0 12px 0;color:#374151;">No data found for the selected date range.</p>'}
    <table border="1" cellspacing="0" cellpadding="4">
      <thead>
        <tr>${safeHeaders.map(h => `<th>${escapeHtml(h)}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${safeRows.map(cols => `<tr>${cols.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `

  const confirmationBlock = `
    <div class="report-confirmation">
      <div class="report-confirmed-by">Confirmed By:</div>
      <div class="report-signature-line"></div>
    </div>
  `

  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:16px; color:#111827;}
      .report-header{display:flex; align-items:center; gap:14px; margin:0 0 14px 0; padding-bottom:12px; border-bottom:2px solid #d1d5db;}
      .report-logo{width:70px; height:70px; object-fit:contain; flex-shrzzink:0;}
      .report-brand{display:flex; flex-direction:column; gap:3px;}
      .report-company{font-size:18px; font-weight:800; line-height:1.2;}
      .report-title{font-size:22px; font-weight:800; line-height:1.2;}
      table{border-collapse:collapse; width:100%;}
      th{background:#f3f4f6;}
      th,td{font-size:12px;}
      .report-confirmation{width:280px; margin:56px 0 0 auto; text-align:left;}
      .report-confirmed-by{font-size:13px; font-weight:700; margin-bottom:36px;}
      .report-signature-line{border-top:1.5px solid #111827; width:100%;}
      @media print { body{padding:0;} .report-header{margin:0 0 10px 0;} }
    </style>
  `

  const safeTitle = escapeHtml(title)
  const reportHeader = `
    <div class="report-header">
      ${safeLogoSrc ? `<img class="report-logo" src="${safeLogoSrc}" alt="Puerto Princesa City Water District logo" />` : ''}
      <div class="report-brand">
        <div class="report-company">Puerto Princesa City Water District</div>
        <div class="report-title">${safeTitle}</div>
      </div>
    </div>
  `
  return `<!doctype html><html><head><meta charset="utf-8"/><title>${safeTitle}</title>${style}</head><body>${reportHeader}${table}${confirmationBlock}</body></html>`
}

function buildEmployeeDtrHtmlDocument(rows, employeeName, from, to) {
  const safeRows = Array.isArray(rows) ? rows : []
  const safeEmployeeName = escapeHtml(employeeName || 'Selected employee')
  const safePeriod = escapeHtml(`${fmtDisplayDate(from)} to ${fmtDisplayDate(to)}`)

  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:22px 28px; color:#111827;}
      .report-head{text-align:center; margin-bottom:18px;}
      .report-company{font-size:20px; font-weight:800; line-height:1.2;}
      .report-address{font-size:12px; line-height:1.4; margin-top:2px;}
      .report-meta{display:flex; justify-content:space-between; align-items:flex-end; margin:18px 0 10px 0; font-size:13px;}
      .report-name{font-weight:700;}
      .report-name-label{font-weight:700;}
      .report-range{font-size:12px;}
      table{border-collapse:collapse; width:100%; table-layout:fixed;}
      th,td{border:1px solid #111827; padding:6px 8px; font-size:12px; vertical-align:top;}
      th{text-align:center; font-weight:700;}
      .col-date{width:11%;}
      .col-day{width:12%;}
      .col-time{width:8%;}
      .col-hours{width:7%;}
      .col-remarks{width:22%;}
      .group-head th{font-size:12px;}
      .sub-head th{font-size:11px;}
      .report-empty{margin:8px 0 12px 0; font-size:12px;}
      @media print { body{padding:18px 22px;} }
    </style>
  `

  const table = `
    ${safeRows.length ? '' : '<p class="report-empty">No data found for the selected filters.</p>'}
    <table>
      <thead>
        <tr class="group-head">
          <th rowspan="2" class="col-date">Date</th>
          <th rowspan="2" class="col-day">Days</th>
          <th colspan="2">AM</th>
          <th colspan="2">PM</th>
          <th colspan="2">Overtime</th>
          <th rowspan="2" class="col-hours">No. of Hours</th>
          <th rowspan="2" class="col-remarks">Remarks</th>
        </tr>
        <tr class="sub-head">
          <th class="col-time">IN</th>
          <th class="col-time">OUT</th>
          <th class="col-time">IN</th>
          <th class="col-time">OUT</th>
          <th class="col-time">IN</th>
          <th class="col-time">OUT</th>
        </tr>
      </thead>
      <tbody>
        ${safeRows.map((row) => `<tr>
          <td class="col-date">${escapeHtml(row?.Date ?? '')}</td>
          <td class="col-day">${escapeHtml(row?.Day ?? '')}</td>
          <td class="col-time">${escapeHtml(row?.AMIn ?? '')}</td>
          <td class="col-time">${escapeHtml(row?.AMOut ?? '')}</td>
          <td class="col-time">${escapeHtml(row?.PMIn ?? '')}</td>
          <td class="col-time">${escapeHtml(row?.PMOut ?? '')}</td>
          <td class="col-time">${escapeHtml(row?.OTIn ?? '')}</td>
          <td class="col-time">${escapeHtml(row?.OTOut ?? '')}</td>
          <td class="col-hours">${escapeHtml(row?.NoOfHours ?? '')}</td>
          <td class="col-remarks">${escapeHtml(row?.Remarks ?? '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Employee DTR</title>${style}</head><body><div class="report-head"><div class="report-company">PUERTO PRINCESA CITY WATER DISTRICT</div><div class="report-address">South National Highway, Sta. Monica, Puerto Princesa City</div></div><div class="report-meta"><div class="report-name"><span class="report-name-label">Name of Employee:</span> ${safeEmployeeName}</div><div class="report-range">${safePeriod}</div></div>${table}</body></html>`
}

function buildEmployeeTardinessHtmlDocument(rows, employeeName, from, to) {
  const safeRows = Array.isArray(rows) ? rows : []
  const safeEmployeeName = escapeHtml(employeeName || 'Selected employee')
  const safePeriod = escapeHtml(`${fmtDisplayDate(from)} to ${fmtDisplayDate(to)}`)

  const style = `
    <style>
      body{font-family:Arial, sans-serif; padding:22px 24px; color:#111827;}
      .report-head{text-align:center; margin-bottom:18px;}
      .report-company{font-size:20px; font-weight:800; line-height:1.2;}
      .report-address{font-size:12px; line-height:1.4; margin-top:2px;}
      .report-meta{display:flex; justify-content:space-between; align-items:flex-end; margin:18px 0 10px 0; font-size:13px;}
      .report-name{font-weight:700;}
      .report-name-label{font-weight:700;}
      .report-range{font-size:12px;}
      table{border-collapse:collapse; width:100%; table-layout:fixed;}
      th,td{border:1px solid #111827; padding:6px 8px; font-size:11px; vertical-align:top;}
      th{text-align:center; font-weight:700;}
      .col-date{width:11%;}
      .col-day{width:12%;}
      .col-shift{width:17%;}
      .col-status{width:17%;}
      .col-mins{width:7%;}
      .group-head th{font-size:12px;}
      .sub-head th{font-size:11px;}
      .report-empty{margin:8px 0 12px 0; font-size:12px;}
      .needs-proof td{background:#fee2e2; color:#991b1b;}
      .needs-proof .col-status{font-weight:700;}
      @media print { body{padding:16px 18px;} }
    </style>
  `

  const table = `
    ${safeRows.length ? '' : '<p class="report-empty">No data found for the selected filters.</p>'}
    <table>
      <thead>
        <tr class="group-head">
          <th rowspan="2" class="col-date">Date</th>
          <th rowspan="2" class="col-day">Days</th>
          <th rowspan="2" class="col-shift">Shift</th>
          <th colspan="2">Tardiness</th>
          <th colspan="2">Undertime</th>
          <th colspan="3">Total</th>
          <th rowspan="2" class="col-status">Status</th>
        </tr>
        <tr class="sub-head">
          <th class="col-mins">AM</th>
          <th class="col-mins">PM</th>
          <th class="col-mins">AM</th>
          <th class="col-mins">PM</th>
          <th class="col-mins">Tardiness</th>
          <th class="col-mins">Undertime</th>
          <th class="col-mins">Minutes</th>
        </tr>
      </thead>
      <tbody>
        ${safeRows.map((row) => `<tr class="${row?.__needsProof ? 'needs-proof' : ''}">
          <td class="col-date">${escapeHtml(row?.Date ?? '')}</td>
          <td class="col-day">${escapeHtml(row?.Day ?? '')}</td>
          <td class="col-shift">${escapeHtml(row?.Shift ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.MorningTardinessMinutes ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.AfternoonTardinessMinutes ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.MorningUndertimeMinutes ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.AfternoonUndertimeMinutes ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.TotalTardinessMinutes ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.TotalUndertimeMinutes ?? '')}</td>
          <td class="col-mins">${escapeHtml(row?.TotalMinutes ?? '')}</td>
          <td class="col-status">${escapeHtml(row?.Status ?? '')}</td>
        </tr>`).join('')}
      </tbody>
    </table>
  `

  return `<!doctype html><html><head><meta charset="utf-8"/><title>Tardiness Report</title>${style}</head><body><div class="report-head"><div class="report-company">PUERTO PRINCESA CITY WATER DISTRICT</div><div class="report-address">South National Highway, Sta. Monica, Puerto Princesa City</div></div><div class="report-meta"><div class="report-name"><span class="report-name-label">Name of Employee:</span> ${safeEmployeeName}</div><div class="report-range">${safePeriod}</div></div>${table}</body></html>`
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
  const [reportType, setReportType] = React.useState('DETAILED')
  const [format, setFormat] = React.useState('EXCEL')
  const [rows, setRows] = React.useState([])
  const [overtimeEntries, setOvertimeEntries] = React.useState([])
  const [leaveEntries, setLeaveEntries] = React.useState([])
  const [employeeMetaById, setEmployeeMetaById] = React.useState(() => new Map())
  const [selectedEmployeeId, setSelectedEmployeeId] = React.useState('')
  const [statusFilters, setStatusFilters] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [editingAttendance, setEditingAttendance] = React.useState(null)
  const [attendanceEditForm, setAttendanceEditForm] = React.useState({
    MorningTimeIn: '',
    MorningTimeOut: '',
    AfternoonTimeIn: '',
    AfternoonTimeOut: '',
    Remarks: ''
  })
  const [savingAttendanceEdit, setSavingAttendanceEdit] = React.useState(false)
  const [attendanceEditError, setAttendanceEditError] = React.useState('')

  React.useEffect(() => {
    let mounted = true
    api.fetchEmployees()
      .then((data) => {
        if (!mounted) return
        const next = new Map()
        for (const employee of Array.isArray(data) ? data : []) {
          next.set(String(employee?.id || ''), employee)
        }
        setEmployeeMetaById(next)
      })
      .catch(() => {
        if (mounted) setEmployeeMetaById(new Map())
      })
    return () => { mounted = false }
  }, [])

  const fetchReportData = async () => {
    const [attendanceData, overtimeData, leaveData, rawAttendanceData] = await Promise.all([
      source === 'RAW'
        ? api.fetchAttendanceRawByRange(from, to)
        : api.fetchAttendanceByRange(from, to),
      api.fetchOvertimeEntries({ from, to }),
      api.fetchLeaveEntries({ from, to }),
      api.fetchAttendanceRawByRange(from, to)
    ])

    const safeAttendanceRows = Array.isArray(attendanceData) ? attendanceData : []
    const safeOvertimeRows = Array.isArray(overtimeData) ? overtimeData : []
    const safeRawRows = Array.isArray(rawAttendanceData) ? rawAttendanceData : []
    const mergedAttendanceRows = mergeAttendanceRowsWithOvertimeRows(safeAttendanceRows, safeOvertimeRows, safeRawRows)

    return {
      attendanceRows: mergedAttendanceRows,
      overtimeRows: safeOvertimeRows,
      leaveRows: Array.isArray(leaveData) ? leaveData : []
    }
  }

  const employeeOptions = React.useMemo(
    () => Array.from(employeeMetaById.values())
      .map((employee) => {
        const id = String(employee?.id || '')
        const name = String(
          employee?.name ||
          employee?.EmployeeName ||
          [employee?.firstName, employee?.lastName].filter(Boolean).join(' ') ||
          employee?.employeeCode ||
          employee?.EmployeeCode ||
          ''
        ).trim()
        if (!id || !name) return null
        return { id, name }
      })
      .filter(Boolean)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [employeeMetaById]
  )

  const selectedEmployeeName = React.useMemo(() => {
    if (!selectedEmployeeId) return ''

    const selected = employeeOptions.find((employee) => employee.id === selectedEmployeeId)
    if (selected?.name) return selected.name

    const matchingRow = (Array.isArray(rows) ? rows : []).find((row) => getRowEmployeeId(row) === selectedEmployeeId)
    return matchingRow?.EmployeeName || matchingRow?.EmployeeCode || 'Selected employee'
  }, [employeeOptions, rows, selectedEmployeeId])

  const employeeFilteredRows = React.useMemo(
    () => filterRowsByEmployee(rows, selectedEmployeeId),
    [rows, selectedEmployeeId]
  )

  const filteredSourceRows = React.useMemo(
    () => filterSourceRows(employeeFilteredRows, statusFilters),
    [employeeFilteredRows, statusFilters]
  )

  const filteredOvertimeEntries = React.useMemo(
    () => filterRowsByEmployee(overtimeEntries, selectedEmployeeId),
    [overtimeEntries, selectedEmployeeId]
  )

  const filteredLeaveEntries = React.useMemo(
    () => filterRowsByEmployee(leaveEntries, selectedEmployeeId),
    [leaveEntries, selectedEmployeeId]
  )

  const leaveEntriesByKey = React.useMemo(
    () => buildLeaveEntriesByKey(filteredLeaveEntries),
    [filteredLeaveEntries]
  )

  const overtimeEntriesByKey = React.useMemo(
    () => buildOvertimeEntriesByKey(filteredOvertimeEntries),
    [filteredOvertimeEntries]
  )

  const usingEmployeeDtrPreview = reportType === 'DETAILED' && !!selectedEmployeeId
  const usingEmployeeTardinessPreview = reportType === 'TARDINESS' && !!selectedEmployeeId

  const previewRows = React.useMemo(() => {
    if (reportType === 'SUMMARY') {
      return buildSummaryRows(filteredSourceRows, employeeMetaById, filteredOvertimeEntries, filteredLeaveEntries)
    }
    if (reportType === 'TARDINESS') {
      return usingEmployeeTardinessPreview
        ? filteredSourceRows.map((row) => toEmployeeTardinessReportRow(row, leaveEntriesByKey))
        : filteredSourceRows.map((row) => toTardinessReportRow(row, leaveEntriesByKey))
    }
    return usingEmployeeDtrPreview
      ? filteredSourceRows.map((row) => toEmployeeDtrRow(row, overtimeEntriesByKey))
      : filteredSourceRows.map((row) => toReportRow(row, overtimeEntriesByKey))
  }, [
    filteredSourceRows,
    reportType,
    employeeMetaById,
    filteredOvertimeEntries,
    filteredLeaveEntries,
    overtimeEntriesByKey,
    leaveEntriesByKey,
    usingEmployeeDtrPreview,
    usingEmployeeTardinessPreview
  ])

  const employeeDtrPreviewColumnDefs = React.useMemo(
    () => [...employeeDtrColumnDefs, { key: '__actions', label: 'Actions' }],
    []
  )

  const previewColumnDefs = reportType === 'SUMMARY'
    ? summaryColumnDefs
    : reportType === 'TARDINESS'
      ? (usingEmployeeTardinessPreview ? employeeTardinessColumnDefs : tardinessColumnDefs)
      : (usingEmployeeDtrPreview ? employeeDtrPreviewColumnDefs : detailedColumnDefs)

  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      const fetched = await fetchReportData()
      setRows(fetched.attendanceRows)
      setOvertimeEntries(fetched.overtimeRows)
      setLeaveEntries(fetched.leaveRows)
      return fetched
    } catch (e) {
      setError(e?.message || String(e))
      setRows([])
      setOvertimeEntries([])
      setLeaveEntries([])
      return { attendanceRows: [], overtimeRows: [], leaveRows: [] }
    } finally {
      setLoading(false)
    }
  }

  const openAttendanceEdit = React.useCallback((row) => {
    if (!row?.__raw) return
    setAttendanceEditError('')
    setEditingAttendance(row)
    setAttendanceEditForm({
      MorningTimeIn: toTimeInputValue(row.__raw.MorningTimeIn),
      MorningTimeOut: toTimeInputValue(row.__raw.MorningTimeOut),
      AfternoonTimeIn: toTimeInputValue(row.__raw.AfternoonTimeIn),
      AfternoonTimeOut: toTimeInputValue(row.__raw.AfternoonTimeOut),
      Remarks: String(row.__raw.Remarks || '').trim()
    })
  }, [])

  const closeAttendanceEdit = React.useCallback(() => {
    setEditingAttendance(null)
    setAttendanceEditError('')
    setAttendanceEditForm({
      MorningTimeIn: '',
      MorningTimeOut: '',
      AfternoonTimeIn: '',
      AfternoonTimeOut: '',
      Remarks: ''
    })
  }, [savingAttendanceEdit])

  const handleAttendanceEditChange = React.useCallback((field, value) => {
    setAttendanceEditForm((prev) => ({ ...prev, [field]: value }))
  }, [])

  const saveAttendanceEdit = React.useCallback(async () => {
    const raw = editingAttendance?.__raw
    if (!raw) return

    setSavingAttendanceEdit(true)
    setAttendanceEditError('')
    try {
      const clean = (value) => {
        const next = String(value || '').trim()
        return next || null
      }

      await api.updateAttendanceRecord(editingAttendance.AttendanceID, {
        EmployeeID: raw.EmployeeID,
        AttendanceDate: fmtDate(raw.AttendanceDate || raw.AttendanceDay || raw.Date),
        MorningTimeIn: clean(attendanceEditForm.MorningTimeIn),
        MorningTimeOut: clean(attendanceEditForm.MorningTimeOut),
        AfternoonTimeIn: clean(attendanceEditForm.AfternoonTimeIn),
        AfternoonTimeOut: clean(attendanceEditForm.AfternoonTimeOut),
        Remarks: clean(attendanceEditForm.Remarks)
      })

      await load()
      closeAttendanceEdit()
    } catch (err) {
      setAttendanceEditError(err?.message || String(err))
    } finally {
      setSavingAttendanceEdit(false)
    }
  }, [attendanceEditForm, closeAttendanceEdit, editingAttendance, load])

  const generate = async () => {
    let pdfWin = null
    const titleBase = reportType === 'SUMMARY'
      ? 'Attendance Summary Report'
      : reportType === 'TARDINESS'
        ? 'Tardiness Report'
        : 'Attendance Detailed Report'
    const title = `${titleBase} (${from} to ${to})`
    let reportLogoSrc = ''

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
      reportLogoSrc = await assetUrlToDataUri(ppcwdLogo).catch(() => '')
      const fetched = await fetchReportData()
      const employeeRows = filterRowsByEmployee(fetched.attendanceRows, selectedEmployeeId)
      const filteredRows = filterSourceRows(employeeRows, statusFilters)
      const filteredOtRows = filterRowsByEmployee(fetched.overtimeRows, selectedEmployeeId)
      const filteredLvRows = filterRowsByEmployee(fetched.leaveRows, selectedEmployeeId)
      const overtimeByKey = buildOvertimeEntriesByKey(filteredOtRows)
      const leaveByKey = buildLeaveEntriesByKey(filteredLvRows)
      const useEmployeeDtrExport = reportType === 'DETAILED' && !!selectedEmployeeId
      const useEmployeeTardinessExport = reportType === 'TARDINESS' && !!selectedEmployeeId
      reportRows = reportType === 'SUMMARY'
        ? buildSummaryRows(filteredRows, employeeMetaById, filteredOtRows, filteredLvRows)
        : reportType === 'TARDINESS'
          ? useEmployeeTardinessExport
            ? filteredRows.map((row) => toEmployeeTardinessReportRow(row, leaveByKey))
            : filteredRows.map((row) => toTardinessReportRow(row, leaveByKey))
          : useEmployeeDtrExport
            ? filteredRows.map((row) => toEmployeeDtrRow(row, overtimeByKey))
            : filteredRows.map((row) => toReportRow(row, overtimeByKey))
      setRows(fetched.attendanceRows)
      setOvertimeEntries(fetched.overtimeRows)
      setLeaveEntries(fetched.leaveRows)
    } catch (e) {
      const msg = e?.message || String(e)
      setError(msg)
      setRows([])
      setOvertimeEntries([])
      setLeaveEntries([])
      if (pdfWin) {
        const html = buildHtmlDocument([], [], `${title} (Error)`, reportLogoSrc)
          .replace('</div></div>', `<div style="font-size:12px;color:#b91c1c;font-weight:700;">${escapeHtml(msg)}</div></div></div>`)
        writePrintablePdf(pdfWin, html)
      }
      return
    } finally {
      setLoading(false)
    }

    const useEmployeeDtrExport = reportType === 'DETAILED' && !!selectedEmployeeId
    const useEmployeeTardinessExport = reportType === 'TARDINESS' && !!selectedEmployeeId
    const exportColumnDefs = reportType === 'SUMMARY'
      ? summaryColumnDefs
      : reportType === 'TARDINESS'
        ? (useEmployeeTardinessExport ? employeeTardinessColumnDefs : tardinessColumnDefs)
        : (useEmployeeDtrExport ? employeeDtrColumnDefs : detailedColumnDefs)
    const exportHeaders = exportColumnDefs.map((column) => column.label)
    const exportRows = reportRows.map((row) => exportColumnDefs.map((column) => row[column.key] ?? ''))

    if (format === 'PDF') {
      const html = useEmployeeDtrExport
        ? buildEmployeeDtrHtmlDocument(reportRows, selectedEmployeeName, from, to)
        : useEmployeeTardinessExport
          ? buildEmployeeTardinessHtmlDocument(reportRows, selectedEmployeeName, from, to)
          : buildHtmlDocument(exportHeaders, exportRows, title, reportLogoSrc)
      writePrintablePdf(pdfWin, html)
      triggerPrintAndClose(pdfWin)
      return
    }

    const html = useEmployeeDtrExport
      ? buildEmployeeDtrHtmlDocument(reportRows, selectedEmployeeName, from, to)
      : useEmployeeTardinessExport
        ? buildEmployeeTardinessHtmlDocument(reportRows, selectedEmployeeName, from, to)
        : buildHtmlDocument(exportHeaders, exportRows, title, reportLogoSrc)
    const filename = useEmployeeDtrExport
      ? `Attendance_DTR_${selectedEmployeeName.replace(/[^a-z0-9]+/gi, '_') || 'employee'}_${from}_to_${to}.xls`
      : useEmployeeTardinessExport
        ? `Tardiness_Report_${selectedEmployeeName.replace(/[^a-z0-9]+/gi, '_') || 'employee'}_${from}_to_${to}.xls`
        : `${reportType === 'SUMMARY' ? 'Attendance_Summary_Report' : reportType === 'TARDINESS' ? 'Tardiness_Report' : 'Attendance_Report'}_${from}_to_${to}.xls`
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
        <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>
          Generate Report
        </Typography>
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
                <InputLabel id="report-type-label">Report Type</InputLabel>
                <Select
                  labelId="report-type-label"
                  label="Report Type"
                  value={reportType}
                  onChange={(e) => {
                    const next = e.target.value
                    setReportType(next)
                    if (next === 'SUMMARY' || next === 'TARDINESS') setSource('SHIFT')
                  }}
                >
                  <MenuItem value="DETAILED">Detailed report</MenuItem>
                  <MenuItem value="SUMMARY">Summary report</MenuItem>
                  <MenuItem value="TARDINESS">Tardiness report</MenuItem>
                </Select>
              </FormControl>

              <FormControl size="small" sx={{ minWidth: 220 }}>
                <InputLabel id="source-label">Data Source</InputLabel>
                <Select
                  labelId="source-label"
                  label="Data Source"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                >
                  <MenuItem value="SHIFT">Shift schedule (recommended)</MenuItem>
                  <MenuItem value="RAW" disabled={reportType === 'SUMMARY' || reportType === 'TARDINESS'}>Raw logs only (no shift needed)</MenuItem>
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

              <FormControl size="small" sx={{ minWidth: 260 }}>
                <InputLabel id="employee-filter-label">Employee</InputLabel>
                <Select
                  labelId="employee-filter-label"
                  label="Employee"
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(String(e.target.value || ''))}
                >
                  <MenuItem value="">All employees</MenuItem>
                  {employeeOptions.map((employee) => (
                    <MenuItem key={employee.id} value={employee.id}>
                      {employee.name}
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
          Choose one employee to switch the detailed export into a focused DTR layout and the tardiness export into a focused employee tardiness layout.
        </Typography>
        {reportType === 'SUMMARY' && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
            Summary mode groups rows by employee and month, and uses the shift-based source so due days, absences, approved overtime, and approved leave all stay aligned with the admin-maintained records.
          </Typography>
        )}
        {reportType === 'TARDINESS' && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
            Tardiness report uses shift-based data so AM and PM tardiness/undertime can be computed from the required schedule. Complete segments use the actual punch times, while incomplete segments use the default full-segment penalty on the missing side.
          </Typography>
        )}
        {reportType === 'TARDINESS' && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: '#fca5a5' }}>
            Red rows mean an AM or PM punch is incomplete. Missing time in defaults to full-segment tardiness, and missing time out defaults to full-segment undertime.
          </Typography>
        )}
        <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
          PDF export opens the print dialog (choose “Save as PDF”).
        </Typography>
      </Paper>

      <GenericDataTable
        title={`Preview (${previewRows.length} rows)`}
        columns={previewColumnDefs}
        data={previewRows}
        loading={loading}
        error={error}
        primaryKeyField={reportType === 'SUMMARY' ? '__key' : 'AttendanceID'}
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        renderRow={(row) => (
          <>
            {previewColumnDefs.map((column) => (
              <TableCell
                key={column.key}
                sx={
                  reportType === 'TARDINESS' && row?.__needsProof
                    ? {
                        backgroundColor: 'rgba(239, 68, 68, 0.14)',
                        color: '#fecaca',
                        borderColor: 'rgba(239, 68, 68, 0.28)',
                        fontWeight: column.key === 'Status' ? 700 : 500
                      }
                    : undefined
                }
              >
                {column.key === '__actions' ? (
                  <Button
                    size="small"
                    variant="outlined"
                    onClick={() => openAttendanceEdit(row)}
                    sx={{ textTransform: 'none', minWidth: 72 }}
                  >
                    Edit
                  </Button>
                ) : (
                  row[column.key]
                )}
              </TableCell>
            ))}
          </>
        )}
      />

      <Dialog
        open={!!editingAttendance}
        onClose={() => {
          if (!savingAttendanceEdit) closeAttendanceEdit()
        }}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Edit DTR Entry</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'grid', gap: 2 }}>
            <Box sx={{ display: 'grid', gap: 0.5 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }}>
                {selectedEmployeeName || 'Selected employee'}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted)' }}>
                {editingAttendance ? `${editingAttendance.Date} • ${editingAttendance.Day}` : ''}
              </Typography>
              <Typography variant="caption" sx={{ color: 'var(--muted)' }}>
                Date, day, and number of hours stay read-only here so the admin can only correct punch times and remarks.
              </Typography>
            </Box>

            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
              <TextField
                label="AM In"
                type="time"
                value={attendanceEditForm.MorningTimeIn}
                onChange={(e) => handleAttendanceEditChange('MorningTimeIn', e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                fullWidth
              />
              <TextField
                label="AM Out"
                type="time"
                value={attendanceEditForm.MorningTimeOut}
                onChange={(e) => handleAttendanceEditChange('MorningTimeOut', e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                fullWidth
              />
              <TextField
                label="PM In"
                type="time"
                value={attendanceEditForm.AfternoonTimeIn}
                onChange={(e) => handleAttendanceEditChange('AfternoonTimeIn', e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                fullWidth
              />
              <TextField
                label="PM Out"
                type="time"
                value={attendanceEditForm.AfternoonTimeOut}
                onChange={(e) => handleAttendanceEditChange('AfternoonTimeOut', e.target.value)}
                InputLabelProps={{ shrink: true }}
                inputProps={{ step: 60 }}
                fullWidth
              />
            </Box>

            <TextField
              label="Remarks"
              value={attendanceEditForm.Remarks}
              onChange={(e) => handleAttendanceEditChange('Remarks', e.target.value)}
              fullWidth
              multiline
              minRows={3}
              placeholder="Example: Brgy. Tiniguiban"
            />

            {attendanceEditError && (
              <Typography variant="body2" sx={{ color: '#b91c1c' }}>
                {attendanceEditError}
              </Typography>
            )}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeAttendanceEdit} disabled={savingAttendanceEdit} sx={{ textTransform: 'none' }}>
            Cancel
          </Button>
          <Button
            onClick={saveAttendanceEdit}
            variant="contained"
            disabled={savingAttendanceEdit}
            sx={{
              textTransform: 'none',
              backgroundColor: 'var(--primary)',
              ':hover': { backgroundColor: 'var(--primary-dark)' }
            }}
          >
            {savingAttendanceEdit ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
