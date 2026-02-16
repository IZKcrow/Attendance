//AttendanceRecordsPage.jsx
import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

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
      <ClockInForm onClockIn={loadRecords} />

      <GenericDataTable
        title="Attendance Today"
        columns={['EmployeeCode', 'EmployeeName', 'AttendanceDate', 'MorningTimeIn', 'MorningTimeOut', 'AfternoonTimeIn', 'AfternoonTimeOut', 'Status']}
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
            <TableCell>{row.EmployeeCode}</TableCell>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{row.AttendanceDate}</TableCell>
            <TableCell>{row.MorningTimeIn}</TableCell>
            <TableCell>{row.MorningTimeOut}</TableCell>
            <TableCell>{row.AfternoonTimeIn}</TableCell>
            <TableCell>{row.AfternoonTimeOut}</TableCell>
            <TableCell>{row.Status}</TableCell>
          </>
        )}
      />
    </>
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
    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
      <select value={selectedCode} onChange={(e)=>setSelectedCode(e.target.value)}>
        <option value=''>-- Select employee --</option>
        {employees.map(emp => (
          <option key={emp.id || emp.EmployeeID} value={emp.EmployeeCode}>
            {emp.EmployeeCode} - {emp.name || `${emp.FirstName || ''} ${emp.LastName || ''}`}
          </option>
        ))}
      </select>
      <select value={logType} onChange={(e)=>setLogType(e.target.value)}>
        <option value="MORNING_IN">MORNING_IN</option>
        <option value="MORNING_OUT">MORNING_OUT</option>
        <option value="AFTERNOON_IN">AFTERNOON_IN</option>
        <option value="AFTERNOON_OUT">AFTERNOON_OUT</option>
      </select>
      <button onClick={doClockIn} disabled={submitting}>{submitting ? 'Recording...' : 'Submit Log'}</button>
    </div>
  )
}
