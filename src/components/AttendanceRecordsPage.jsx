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

export default function AttendanceRecordsPage() {
  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [editRow, setEditRow] = React.useState(null)
  const [saving, setSaving] = React.useState(false)
  const [range, setRange] = React.useState('today')
  const [from, setFrom] = React.useState(toDateInputValue(new Date()))
  const [to, setTo] = React.useState(toDateInputValue(new Date()))
  const [weekAnchor, setWeekAnchor] = React.useState(toDateInputValue(new Date()))
  const [monthAnchor, setMonthAnchor] = React.useState(toDateInputValue(new Date()))
  const [yearAnchor, setYearAnchor] = React.useState(new Date().getFullYear().toString())

  React.useEffect(() => {
    loadRecords()
  }, [range, from, to, weekAnchor, monthAnchor, yearAnchor])

  const getRangeDate = (kind, anchorDateStr = null) => {
    const now = anchorDateStr ? new Date(anchorDateStr) : new Date()
    switch (kind) {
      case 'week': {
        const day = now.getDay() === 0 ? 7 : now.getDay()
        const monday = new Date(now.getTime() - (day - 1) * 86400000)
        const sunday = new Date(monday.getTime() + 6 * 86400000)
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
      const normalized = arr.map((rec) => ({
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
          (rec.MorningTimeIn || rec.AfternoonTimeIn ? 'On-Site' : 'Absent')
      }))
      setRecords(normalized)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEditSave = async () => {
    if (!editRow?.AttendanceID) return
    setSaving(true)
    try {
      const clean = (v) => (v && v.trim() ? v.trim() : null)
      await api.updateAttendanceRecord(editRow.AttendanceID, {
        EmployeeID: editRow.EmployeeID,
        AttendanceDate: editRow.AttendanceDate,
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

  return (
    <>
      <FaceScanForm onScanned={loadRecords} />
      <ClockInForm onClockIn={loadRecords} />

      {/* Edit panel */}
      <Paper sx={{ p: 2, mb: 2, borderRadius: 2, border: '1px solid var(--border)', background: 'var(--surface)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
          <strong>Edit attendance (pick a row)</strong>
          {editRow && <span style={{ color: 'var(--muted)' }}>{editRow.EmployeeName} — {editRow.AttendanceDate}</span>}
        </div>
        {editRow ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <label className="schedule-label">
              Date
              <input
                type="date"
                value={editRow.AttendanceDate || ''}
                onChange={(e)=>setEditRow(r => ({ ...r, AttendanceDate: e.target.value }))}
                className="schedule-input"
              />
            </label>
            <label className="schedule-label">
              AM In
              <input
                type="time"
                value={editRow.MorningTimeIn || ''}
                onChange={(e)=>setEditRow(r => ({ ...r, MorningTimeIn: e.target.value }))}
                className="schedule-input"
              />
            </label>
            <label className="schedule-label">
              AM Out
              <input
                type="time"
                value={editRow.MorningTimeOut || ''}
                onChange={(e)=>setEditRow(r => ({ ...r, MorningTimeOut: e.target.value }))}
                className="schedule-input"
              />
            </label>
            <label className="schedule-label">
              PM In
              <input
                type="time"
                value={editRow.AfternoonTimeIn || ''}
                onChange={(e)=>setEditRow(r => ({ ...r, AfternoonTimeIn: e.target.value }))}
                className="schedule-input"
              />
            </label>
            <label className="schedule-label">
              PM Out
              <input
                type="time"
                value={editRow.AfternoonTimeOut || ''}
                onChange={(e)=>setEditRow(r => ({ ...r, AfternoonTimeOut: e.target.value }))}
                className="schedule-input"
              />
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 4 }}>
              <Button variant="outlined" size="small" onClick={()=>setEditRow(null)}>Cancel</Button>
              <Button variant="contained" size="small" onClick={handleEditSave} disabled={saving} sx={primaryBtnSx}>
                {saving ? 'Saving...' : 'Save Changes'}
              </Button>
            </div>
          </div>
        ) : (
          <div style={{ color: 'var(--muted)' }}>Select a row below to edit date/time.</div>
        )}
      </Paper>

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
        onRowClick={(row) => setEditRow(row)}
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

function FaceScanForm({ onScanned }) {
  const [employees, setEmployees] = React.useState([])
  const [selectedCode, setSelectedCode] = React.useState('')
  const [deviceCode, setDeviceCode] = React.useState('KIOSK-001')
  const [devices, setDevices] = React.useState([])
  const [scanning, setScanning] = React.useState(false)

  React.useEffect(() => {
    let mounted = true
    api.fetchEmployees().then(data => { if (mounted) setEmployees(Array.isArray(data) ? data : []) }).catch(() => {})
    api.fetchDevices().then(data => {
      if (!mounted) return
      const list = Array.isArray(data) ? data : []
      setDevices(list)
      if (list.length > 0 && !selectedCode) {
        // keep existing deviceCode if set, otherwise default to first device
        setDeviceCode(prev => prev || list[0].DeviceCode || 'KIOSK-001')
      }
    }).catch(()=>{})
    return () => { mounted = false }
  }, [])


  const doFaceScan = async () => {
    if (!selectedCode) return alert('Select an employee for prototype face scan.')
    setScanning(true)
    try {
      const result = await api.faceScanAttendance({
        employeeCode: selectedCode,
        deviceCode,
        matchScore: 99.0,
        actor: 'FACE_SCANNER_UI'
      })
      onScanned && onScanned()
      setSelectedCode('')
      alert(`Face scan success: ${result.employeeName || result.employeeCode} -> ${result.logType} at ${result.time}`)
    } catch (err) {
      alert('Face scan failed: ' + (err.message || err))
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
          onChange={(e)=>setSelectedCode(e.target.value)}
        >
          <MenuItem value=""><em>Face scan: select employee</em></MenuItem>
          {employees.map(emp => (
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
          onChange={(e)=>setDeviceCode(e.target.value)}
        >
          <MenuItem value=""><em>Select device</em></MenuItem>
          {devices.map(dev => (
            <MenuItem key={dev.DeviceID || dev.DeviceCode} value={dev.DeviceCode}>
              {dev.DeviceCode} {dev.DeviceName ? `- ${dev.DeviceName}` : ''}
            </MenuItem>
          ))}
          <MenuItem value="KIOSK-001">KIOSK-001 (default)</MenuItem>
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

function ClockInForm({ onClockIn }) {
  const [employees, setEmployees] = React.useState([])
  const [selectedCode, setSelectedCode] = React.useState('')
  const [logType, setLogType] = React.useState('MORNING_IN')
  const [submitting, setSubmitting] = React.useState(false)

  React.useEffect(() => {
    let mounted = true
    api.fetchEmployees().then(data => { if (mounted) setEmployees(Array.isArray(data) ? data : []) }).catch(()=>{})
    return () => { mounted = false }
  }, [])

  const doClockIn = async () => {
    if (!selectedCode) return alert('Select an employee')
    setSubmitting(true)
    try {
      await api.recordAttendance(selectedCode, logType)
      onClockIn && onClockIn()
      setSelectedCode('')
      alert('Attendance log recorded')
    } catch (err) {
      alert('Attendance log failed: ' + (err.message || err))
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
          onChange={(e)=>setSelectedCode(e.target.value)}
        >
          <MenuItem value=""><em>Select employee</em></MenuItem>
          {employees.map(emp => (
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
          onChange={(e)=>setLogType(e.target.value)}
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
