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

const detailedColumnDefs = [
  { key: 'Employee', label: 'Name' },
  { key: 'Shift', label: 'Shift' },
  { key: 'Date', label: 'Date' },
  { key: 'Status', label: 'Status' },
  { key: 'AMIn', label: 'AM In' },
  { key: 'AMOut', label: 'AM Out' },
  { key: 'PMIn', label: 'PM In' },
  { key: 'PMOut', label: 'PM Out' },
  { key: 'Hours', label: 'Hours' }
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
  { key: 'LateInMinutes', label: 'Late in Minutes' },
  { key: 'EarlyOutMinutes', label: 'Early Out Minutes' },
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

function getActualWorkIntervalsFromRaw(raw) {
  const row = buildSourceRowForCalc(raw)
  return [
    toInterval(row.MorningTimeIn, row.MorningTimeOut),
    toInterval(row.AfternoonTimeIn, row.AfternoonTimeOut)
  ].filter(Boolean)
}

function getRequiredScheduleIntervalsFromRaw(raw) {
  const specialDayType = String(raw?.SpecialDayType || '').trim().toUpperCase()
  if (specialDayType === 'HOLIDAY' || specialDayType === 'REST_DAY') return []

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

function computePayableOvertimeMinutesForRow(raw, overtimeEntries) {
  const entries = Array.isArray(overtimeEntries) ? overtimeEntries : []
  if (!entries.length) return 0

  const overtimeIntervals = getActualOvertimeIntervalsFromRaw(raw)
  const totalActualOvertimeMinutes = sumIntervals(overtimeIntervals)

  return entries.reduce((sum, entry) => {
    const approvedMinutes = getApprovedEntryMinutes(entry)
    if (approvedMinutes == null || approvedMinutes <= 0) return sum

    const windowInterval = toInterval(entry?.StartTime, entry?.EndTime)
    if (!windowInterval) {
      return sum + Math.min(approvedMinutes, totalActualOvertimeMinutes)
    }

    const withinWindow = sumIntervalOverlapMinutes(overtimeIntervals, windowInterval)
    return sum + Math.min(approvedMinutes, withinWindow)
  }, 0)
}

function computePolicyAwareWorkedMinutes(raw, overtimeEntries) {
  const specialDayType = String(raw?.SpecialDayType || '').trim().toUpperCase()
  const actualMinutes =
    actualSegmentMinutes(fmtTime(raw.MorningTimeIn), fmtTime(raw.MorningTimeOut)) +
    actualSegmentMinutes(fmtTime(raw.AfternoonTimeIn), fmtTime(raw.AfternoonTimeOut))

  // On holidays/rest days, worked hours only count when there is approved OT.
  if (specialDayType === 'HOLIDAY' || specialDayType === 'REST_DAY') {
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
  const hours = formatMinutesAsHoursMins(computePolicyAwareWorkedMinutes(r, overtimeEntries))

  return {
    AttendanceID: r.AttendanceID || `${employee}-${date}-${shift}`,
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

function formatDecimalHours(totalMinutes) {
  const minutes = Number.isFinite(totalMinutes) ? totalMinutes : 0
  return (minutes / 60).toFixed(2)
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
    const isHoliday = specialDayType === 'HOLIDAY'
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
      isHoliday || isRestDay ? 0 : (isHalfDaySpecial ? 0.5 : (expectedSegments.length > 0 ? 1 : 0))
    )
    const actualMinutesTotal =
      actualSegmentMinutes(calcRow.MorningTimeIn, calcRow.MorningTimeOut) +
      actualSegmentMinutes(calcRow.AfternoonTimeIn, calcRow.AfternoonTimeOut)
    const workedMinutes =
      clampSegmentMinutes(calcRow.MorningTimeIn, calcRow.MorningTimeOut, calcRow.RequiredMorningIn, calcRow.RequiredMorningOut) +
      clampSegmentMinutes(calcRow.AfternoonTimeIn, calcRow.AfternoonTimeOut, calcRow.RequiredAfternoonIn, calcRow.RequiredAfternoonOut)
    const overtimeMinutesNormal = Math.max(0, actualMinutesTotal - workedMinutes)

    let dueWeight = 0
    if (isHoliday || isRestDay) {
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

    expectedSegments.forEach((segment) => {
      const segmentCoveredByLeave = leaveImpact.coveredKinds.has(segment.kind)
      const segmentActualMinutes = actualSegmentMinutes(segment.actualIn, segment.actualOut)
      if (!segmentCoveredByLeave && segmentActualMinutes > 0) {
        actualDayWeight += segmentWeight
      }

      const requiredIn = hhmmToMinutes(segment.reqIn)
      const actualIn = hhmmToMinutes(segment.actualIn)
      if (!segmentCoveredByLeave && requiredIn != null && actualIn != null) {
        const grace = Number(raw.GracePeriodMinutes || 0)
        lateMinutes += Math.max(0, actualIn - (requiredIn + grace))
      }

      const requiredOut = hhmmToMinutes(segment.reqOut)
      const actualOut = hhmmToMinutes(segment.actualOut)
      if (!segmentCoveredByLeave && requiredOut != null && actualOut != null) {
        earlyMinutes += Math.max(0, requiredOut - actualOut)
      }
    })

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
    acc.WorkingHours += isHoliday || isRestDay ? 0 : workedMinutes
    acc.OTHours += isHoliday ? 0 : overtimeMinutes
    acc.LateInMinutes += isHoliday || isRestDay ? 0 : lateMinutes
    acc.EarlyOutMinutes += isHoliday || isRestDay ? 0 : earlyMinutes
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

function buildHtmlDocument(headers, rows, title) {
  const safeHeaders = Array.isArray(headers) ? headers : []
  const safeRows = Array.isArray(rows) ? rows : []

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
  const [reportType, setReportType] = React.useState('DETAILED')
  const [format, setFormat] = React.useState('EXCEL')
  const [rows, setRows] = React.useState([])
  const [overtimeEntries, setOvertimeEntries] = React.useState([])
  const [leaveEntries, setLeaveEntries] = React.useState([])
  const [employeeMetaById, setEmployeeMetaById] = React.useState(() => new Map())
  const [statusFilters, setStatusFilters] = React.useState([])
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

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
    const [attendanceData, overtimeData, leaveData] = await Promise.all([
      source === 'RAW'
        ? api.fetchAttendanceRawByRange(from, to)
        : api.fetchAttendanceByRange(from, to),
      api.fetchOvertimeEntries({ from, to }),
      api.fetchLeaveEntries({ from, to })
    ])

    return {
      attendanceRows: Array.isArray(attendanceData) ? attendanceData : [],
      overtimeRows: Array.isArray(overtimeData) ? overtimeData : [],
      leaveRows: Array.isArray(leaveData) ? leaveData : []
    }
  }

  const filteredSourceRows = React.useMemo(
    () => filterSourceRows(rows, statusFilters),
    [rows, statusFilters]
  )

  const overtimeEntriesByKey = React.useMemo(
    () => buildOvertimeEntriesByKey(overtimeEntries),
    [overtimeEntries]
  )

  const previewRows = React.useMemo(
    () => (reportType === 'SUMMARY'
      ? buildSummaryRows(filteredSourceRows, employeeMetaById, overtimeEntries, leaveEntries)
      : filteredSourceRows.map((row) => toReportRow(row, overtimeEntriesByKey))),
    [filteredSourceRows, reportType, employeeMetaById, overtimeEntries, leaveEntries, overtimeEntriesByKey]
  )

  const previewColumnDefs = reportType === 'SUMMARY' ? summaryColumnDefs : detailedColumnDefs

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

  const generate = async () => {
    let pdfWin = null
    const title = `${reportType === 'SUMMARY' ? 'Attendance Summary Report' : 'Attendance Detailed Report'} (${from} to ${to})`

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
      const fetched = await fetchReportData()
      const filteredRows = filterSourceRows(fetched.attendanceRows, statusFilters)
      const overtimeByKey = buildOvertimeEntriesByKey(fetched.overtimeRows)
      reportRows = reportType === 'SUMMARY'
        ? buildSummaryRows(filteredRows, employeeMetaById, fetched.overtimeRows, fetched.leaveRows)
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
        const html = buildHtmlDocument([], [], `${title} (Error)`)
          .replace('<h2>', `<h2>${escapeHtml(title)}<br/><span style="font-size:12px;color:#b91c1c;font-weight:700;">${escapeHtml(msg)}</span><br/>`)
        writePrintablePdf(pdfWin, html)
      }
      return
    } finally {
      setLoading(false)
    }

    const exportHeaders = previewColumnDefs.map((column) => column.label)
    const exportRows = reportRows.map((row) => previewColumnDefs.map((column) => row[column.key] ?? ''))

    if (format === 'PDF') {
      const html = buildHtmlDocument(exportHeaders, exportRows, title)
      writePrintablePdf(pdfWin, html)
      triggerPrintAndClose(pdfWin)
      return
    }

    const html = buildHtmlDocument(exportHeaders, exportRows, title)
    const filename = `${reportType === 'SUMMARY' ? 'Attendance_Summary_Report' : 'Attendance_Report'}_${from}_to_${to}.xls`
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
                <InputLabel id="report-type-label">Report Type</InputLabel>
                <Select
                  labelId="report-type-label"
                  label="Report Type"
                  value={reportType}
                  onChange={(e) => {
                    const next = e.target.value
                    setReportType(next)
                    if (next === 'SUMMARY') setSource('SHIFT')
                  }}
                >
                  <MenuItem value="DETAILED">Detailed report</MenuItem>
                  <MenuItem value="SUMMARY">Summary report</MenuItem>
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
                  <MenuItem value="RAW" disabled={reportType === 'SUMMARY'}>Raw logs only (no shift needed)</MenuItem>
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
        {reportType === 'SUMMARY' && (
          <Typography variant="caption" sx={{ display: 'block', mt: 1, color: 'var(--muted)' }}>
            Summary mode groups rows by employee and month, and uses the shift-based source so due days, absences, approved overtime, and approved leave all stay aligned with the admin-maintained records.
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
              <TableCell key={column.key}>{row[column.key]}</TableCell>
            ))}
          </>
        )}
      />
    </Box>
  )
}
