//AttendanceRecordsPage.jsx
import React from 'react'
import {
  TableCell,
  Button,
  Paper,
  Box,
  FormControl,
  InputLabel,
  Select,
  MenuItem
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { getRangeDate, toDateInputValue } from '../utils/dateRange'
import useAppSnackbar from '../hooks/useAppSnackbar'

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

const primaryBtnSx = {
  backgroundColor: 'var(--primary)',
  color: '#fff',
  fontWeight: 700,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
  ':hover': { backgroundColor: 'var(--primary-dark)' }
}

const formCardSx = {
  display: 'flex',
  gap: 2,
  rowGap: 1.5,
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: 2,
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
  borderRadius: 3
}

const selectSx = {
  minWidth: 220,
  backgroundColor: '#fdfdfd',
  '& fieldset': { borderColor: 'var(--border)' },
  '&:hover fieldset': { borderColor: 'var(--primary)' },
  '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
}

function getFriendlyAttendanceError(err, mode = 'attendance') {
  const msg = String(err?.message || err || '')
  const lower = msg.toLowerCase()

  if (lower.includes('attendance already complete for today')) {
    return 'Attendance is already complete for today.'
  }
  if (lower.includes('invalid log sequence')) {
    return msg
  }
  if (lower.includes('no shift assigned for this employee today') || lower.includes('no shift assigned')) {
    return 'This employee has no schedule assigned for today.'
  }
  if (lower.includes('employee not found')) {
    return 'Employee was not found. Please refresh the employee list.'
  }
  if (lower.includes('invalid logtype')) {
    return 'Invalid log type selected.'
  }

  return mode === 'face'
    ? `Face scan failed: ${msg || 'Please try again.'}`
    : `Attendance log failed: ${msg || 'Please try again.'}`
}

export default function AttendanceRecordsPage() {
  const { show, SnackbarComponent } = useAppSnackbar()
  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [range, setRange] = React.useState('today')
  const [from, setFrom] = React.useState(toDateInputValue(new Date()))
  const [to, setTo] = React.useState(toDateInputValue(new Date()))
  const [weekAnchor, setWeekAnchor] = React.useState(toDateInputValue(new Date()))
  const [monthAnchor, setMonthAnchor] = React.useState(toDateInputValue(new Date()))
  const [yearAnchor, setYearAnchor] = React.useState(new Date().getFullYear().toString())
  const [employees, setEmployees] = React.useState([])
  const [devices, setDevices] = React.useState([])
  const [employeesLoading, setEmployeesLoading] = React.useState(true)
  const [devicesLoading, setDevicesLoading] = React.useState(true)
  const requestSeqRef = React.useRef(0)

  const rangeParams = React.useMemo(() => {
    switch (range) {
      case 'today':
        return { type: 'today' }
      case 'week':
        return { type: 'week', anchor: weekAnchor }
      case 'month':
        return { type: 'month', anchor: monthAnchor }
      case 'year':
        return { type: 'year', anchor: yearAnchor }
      case 'custom':
        return { type: 'custom', from, to }
      default:
        return { type: 'today' }
    }
  }, [range, weekAnchor, monthAnchor, yearAnchor, from, to])

  React.useEffect(() => {
    loadRecords(rangeParams)
  }, [rangeParams])

  React.useEffect(() => {
    let mounted = true
    setEmployeesLoading(true)
    setDevicesLoading(true)

    api.fetchEmployees()
      .then((data) => {
        if (!mounted) return
        setEmployees(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setEmployeesLoading(false)
      })

    api.fetchDevices()
      .then((data) => {
        if (!mounted) return
        setDevices(Array.isArray(data) ? data : [])
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setDevicesLoading(false)
      })

    return () => { mounted = false }
  }, [])

  const loadRecords = async (params = rangeParams) => {
    const reqSeq = ++requestSeqRef.current
    try {
      setLoading(true)
      let data = []
      switch (params.type) {
        case 'today':
          data = await api.fetchAttendanceToday()
          break
        case 'week': {
          const r = getRangeDate('week', params.anchor)
          data = await api.fetchAttendanceByRange(r.from, r.to)
          break
        }
        case 'month': {
          const r = getRangeDate('month', params.anchor)
          data = await api.fetchAttendanceByRange(r.from, r.to)
          break
        }
        case 'year': {
          const r = getRangeDate('year', `${params.anchor}-01-01`)
          data = await api.fetchAttendanceByRange(r.from, r.to)
          break
        }
        case 'custom':
          data = await api.fetchAttendanceByRange(params.from, params.to)
          break
        default:
          data = await api.fetchAttendanceToday()
      }
      const arr = Array.isArray(data) ? data : []
      const normalized = arr.map((rec) => {
        const hasAnyLog =
          rec.MorningTimeIn ||
          rec.MorningTimeOut ||
          rec.AfternoonTimeIn ||
          rec.AfternoonTimeOut

        return {
          ...rec,
          ShiftName:
            rec.ShiftName ||
            rec.RequiredShiftName ||
            rec.ScheduleName ||
            rec.PeriodName ||
            '-',
          AttendanceSummary:
            rec.AttendanceSummary ||
            rec.Status ||
            (hasAnyLog ? 'On-Site' : 'Absent')
        }
      })
      if (reqSeq !== requestSeqRef.current) return
      setRecords(normalized)
      setError(null)
    } catch (err) {
      if (reqSeq !== requestSeqRef.current) return
      setError(err.message)
    } finally {
      if (reqSeq !== requestSeqRef.current) return
      setLoading(false)
    }
  }

  return (
    <>
      {SnackbarComponent}
      <FaceScanForm
        employees={employees}
        devices={devices}
        employeesLoading={employeesLoading}
        devicesLoading={devicesLoading}
        onScanned={loadRecords}
        show={show}
      />
      <ClockInForm
        employees={employees}
        employeesLoading={employeesLoading}
        onClockIn={loadRecords}
        show={show}
      />

      <GenericDataTable
        title="Attendance"
        columns={[
          'Shift',
          'Name',
          'Date',
          'AM In',
          'AM Out',
          'PM In',
          'PM Out',
          'Summary'
        ]}
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
            <TableCell>{row.ShiftName || '-'}</TableCell>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{fmtDate(row.AttendanceDate)}</TableCell>
            <TableCell>{fmtTime(row.MorningTimeIn)}</TableCell>
            <TableCell>{fmtTime(row.MorningTimeOut)}</TableCell>
            <TableCell>{fmtTime(row.AfternoonTimeIn)}</TableCell>
            <TableCell>{fmtTime(row.AfternoonTimeOut)}</TableCell>
            <TableCell>{row.AttendanceSummary || row.Status || '-'}</TableCell>
          </>
        )}
      />
    </>
  )
}

function FaceScanForm({
  employees,
  devices,
  employeesLoading,
  devicesLoading,
  onScanned,
  show
}) {
  const [selectedCode, setSelectedCode] = React.useState('')
  const [deviceCode, setDeviceCode] = React.useState('')
  const [scanning, setScanning] = React.useState(false)

  React.useEffect(() => {
    if (!Array.isArray(devices) || !devices.length) return
    setDeviceCode((prev) => {
      if (prev && devices.some((d) => d.DeviceCode === prev)) return prev
      const defaultDevice =
        devices.find((d) => d.DeviceCode === 'KIOSK-001') ||
        devices[0]
      return defaultDevice?.DeviceCode || ''
    })
  }, [devices])

  const doFaceScan = async () => {
    if (!selectedCode) {
      show('Select an employee for face scan.', 'warning')
      return
    }
    setScanning(true)
    try {
      const result = await api.faceScanAttendance({
        employeeCode: selectedCode,
        deviceCode: deviceCode || null,
        matchScore: 99.0,
        actor: 'FACE_SCANNER_UI'
      })
      onScanned && onScanned()
      setSelectedCode('')
      show(`Face scan success: ${result.employeeName || result.employeeCode} -> ${result.logType} at ${result.time}`, 'success')
    } catch (err) {
      show(getFriendlyAttendanceError(err, 'face'), 'error')
    } finally {
      setScanning(false)
    }
  }

  return (
    <Paper sx={{ ...formCardSx, mb: 2 }}>
      <FormControl size="small" sx={selectSx}>
        <InputLabel id="face-employee">Employee</InputLabel>
        <Select
          labelId="face-employee"
          label="Employee"
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
        >
          <MenuItem value="">
            <em>{employeesLoading ? 'Loading employees...' : 'Face scan: select employee'}</em>
          </MenuItem>
          {employees.map((emp) => (
            <MenuItem key={emp.id || emp.EmployeeID} value={emp.EmployeeCode}>
              {emp.EmployeeCode} - {emp.name || `${emp.FirstName || ''} ${emp.LastName || ''}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={selectSx}>
        <InputLabel id="face-device">Device</InputLabel>
        <Select
          labelId="face-device"
          label="Device"
          value={deviceCode}
          onChange={(e) => setDeviceCode(e.target.value)}
        >
          <MenuItem value="">
            <em>{devicesLoading ? 'Loading devices...' : 'Select device'}</em>
          </MenuItem>
          {devices.map((dev) => (
            <MenuItem key={dev.DeviceID || dev.DeviceCode} value={dev.DeviceCode}>
              {dev.DeviceCode} {dev.DeviceName ? `- ${dev.DeviceName}` : ''}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <Box sx={{ flexGrow: 1 }} />

      <Button
        variant="contained"
        size="medium"
        onClick={doFaceScan}
        disabled={scanning}
        sx={primaryBtnSx}
      >
        {scanning ? 'Scanning...' : 'Simulate Face Scan'}
      </Button>
    </Paper>
  )
}

function ClockInForm({ employees, employeesLoading, onClockIn, show }) {
  const [selectedCode, setSelectedCode] = React.useState('')
  const [logType, setLogType] = React.useState('MORNING_IN')
  const [submitting, setSubmitting] = React.useState(false)

  const doClockIn = async () => {
    if (!selectedCode) {
      show('Select an employee.', 'warning')
      return
    }
    setSubmitting(true)
    try {
      await api.recordAttendance(selectedCode, logType)
      onClockIn && onClockIn()
      setSelectedCode('')
      show('Attendance log recorded', 'success')
    } catch (err) {
      show(getFriendlyAttendanceError(err, 'attendance'), 'error')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Paper sx={{ ...formCardSx, mb: 3 }}>
      <FormControl size="small" sx={selectSx}>
        <InputLabel id="clock-employee">Employee</InputLabel>
        <Select
          labelId="clock-employee"
          label="Employee"
          value={selectedCode}
          onChange={(e) => setSelectedCode(e.target.value)}
        >
          <MenuItem value="">
            <em>{employeesLoading ? 'Loading employees...' : 'Select employee'}</em>
          </MenuItem>
          {employees.map((emp) => (
            <MenuItem key={emp.id || emp.EmployeeID} value={emp.EmployeeCode}>
              {emp.EmployeeCode} - {emp.name || `${emp.FirstName || ''} ${emp.LastName || ''}`}
            </MenuItem>
          ))}
        </Select>
      </FormControl>

      <FormControl size="small" sx={selectSx}>
        <InputLabel id="clock-logtype">Log type</InputLabel>
        <Select
          labelId="clock-logtype"
          label="Log type"
          value={logType}
          onChange={(e) => setLogType(e.target.value)}
        >
          <MenuItem value="MORNING_IN">Morning In</MenuItem>
          <MenuItem value="MORNING_OUT">Morning Out</MenuItem>
          <MenuItem value="AFTERNOON_IN">Afternoon In</MenuItem>
          <MenuItem value="AFTERNOON_OUT">Afternoon Out</MenuItem>
        </Select>
      </FormControl>

      <Box sx={{ flexGrow: 1 }} />

      <Button
        variant="contained"
        size="medium"
        onClick={doClockIn}
        disabled={submitting}
        sx={primaryBtnSx}
      >
        {submitting ? 'Recording...' : 'Submit Log'}
      </Button>
    </Paper>
  )
}
