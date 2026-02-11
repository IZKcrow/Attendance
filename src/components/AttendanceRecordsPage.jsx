import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function AttendanceRecordsPage() {
  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadRecords()
  }, [])

  const loadRecords = async () => {
    try {
      setLoading(true)
      const data = await api.fetchAttendanceRecords()
      setRecords(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createAttendanceRecord(form)
      setRecords([...records, result])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateAttendanceRecord(form.AttendanceRecordID, form)
      setRecords(records.map(r => r.AttendanceRecordID === form.AttendanceRecordID ? result : r))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteAttendanceRecord(id)
      setRecords(records.filter(r => r.AttendanceRecordID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <GenericDataTable
      title="Attendance Records"
      columns={['EmployeeID', 'AttendanceDate', 'ActualTimeIn', 'ActualTimeOut', 'Status']}
      data={records}
      loading={loading}
      error={error}
      primaryKeyField="AttendanceRecordID"
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      renderRow={(row) => (
        <>
          <TableCell>{row.EmployeeID}</TableCell>
          <TableCell>{row.AttendanceDate}</TableCell>
          <TableCell>{row.ActualTimeIn}</TableCell>
          <TableCell>{row.ActualTimeOut}</TableCell>
          <TableCell>{row.Status}</TableCell>
        </>
      )}
    />
  )
}
