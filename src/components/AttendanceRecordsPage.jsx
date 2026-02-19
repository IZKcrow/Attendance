//AttendanceRecordsPage.jsx
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

const inputStyle = {
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid #c8d5ec',
  background: '#f9fbff'
}

const primaryBtnSx = {
  backgroundColor: '#3cc4bf',
  color: '#0b1021',
  fontWeight: 700,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: '0 4px 10px rgba(0,0,0,0.08)',
  ':hover': { backgroundColor: '#35b3af' }
}

export default function AttendanceRecordsPage() {
  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    // load today's attendance by default for live-clock view
    loadRecords()
  }, [])

  const loadRecords = async () => {
    try {
      setLoading(true)
      const data = await api.fetchAttendanceToday()
      setRecords(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <FaceScanForm onScanned={loadRecords} />
      <ClockInForm onClockIn={loadRecords} />

      <GenericDataTable
        title="Attendance Today"
        columns={[
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
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
      <select value={selectedCode} onChange={(e)=>setSelectedCode(e.target.value)} style={inputStyle}>
        <option value=''>-- Face scan: select employee --</option>
        {employees.map(emp => (
          <option key={emp.id || emp.EmployeeID} value={emp.EmployeeCode}>
            {emp.EmployeeCode} - {emp.name || `${emp.FirstName || ''} ${emp.LastName || ''}`}
          </option>
        ))}
      </select>
      <select value={deviceCode} onChange={(e)=>setDeviceCode(e.target.value)} style={inputStyle}>
        <option value=''>-- Select device --</option>
        {devices.map(dev => (
          <option key={dev.DeviceID || dev.DeviceCode} value={dev.DeviceCode}>
            {dev.DeviceCode} {dev.DeviceName ? `- ${dev.DeviceName}` : ''}
          </option>
        ))}
        <option value='KIOSK-001'>KIOSK-001 (default)</option>
      </select>
      <Button
        variant="contained"
        size="small"
        onClick={doFaceScan}
        disabled={scanning}
        sx={primaryBtnSx}
      >
        {scanning ? 'Scanning...' : 'Simulate Face Scan'}
      </Button>
    </div>
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
    <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
      <select value={selectedCode} onChange={(e)=>setSelectedCode(e.target.value)} style={inputStyle}>
        <option value=''>-- Select employee --</option>
        {employees.map(emp => (
          <option key={emp.id || emp.EmployeeID} value={emp.EmployeeCode}>
            {emp.EmployeeCode} - {emp.name || `${emp.FirstName || ''} ${emp.LastName || ''}`}
          </option>
        ))}
      </select>
      <select value={logType} onChange={(e)=>setLogType(e.target.value)} style={inputStyle}>
        <option value="MORNING_IN">Morning In</option>
        <option value="MORNING_OUT">Morning Out</option>
        <option value="AFTERNOON_IN">Afternoon In</option>
        <option value="AFTERNOON_OUT">Afternoon Out</option>
      </select>
      <Button
        variant="contained"
        size="small"
        onClick={doClockIn}
        disabled={submitting}
        sx={primaryBtnSx}
      >
        {submitting ? 'Recording...' : 'Submit Log'}
      </Button>
    </div>
  )
}





