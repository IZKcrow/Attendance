import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function ScheduleDetailsPage() {
  const [details, setDetails] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadDetails()
  }, [])

  const loadDetails = async () => {
    try {
      setLoading(true)
      const data = await api.fetchScheduleDetails()
      setDetails(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createScheduleDetail(form)
      setDetails([...details, result])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateScheduleDetail(form.ScheduleDetailID, form)
      setDetails(details.map(d => d.ScheduleDetailID === form.ScheduleDetailID ? result : d))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteScheduleDetail(id)
      setDetails(details.filter(d => d.ScheduleDetailID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <GenericDataTable
      title="Schedule Details"
      columns={['SchedulePeriodID', 'DayName', 'IsWorkingDay', 'ShiftStartTime', 'ShiftEndTime']}
      data={details}
      loading={loading}
      error={error}
      primaryKeyField="ScheduleDetailID"
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      renderRow={(row) => (
        <>
          <TableCell>{row.SchedulePeriodID}</TableCell>
          <TableCell>{row.DayName}</TableCell>
          <TableCell>{row.IsWorkingDay ? 'Yes' : 'No'}</TableCell>
          <TableCell>{row.ShiftStartTime}</TableCell>
          <TableCell>{row.ShiftEndTime}</TableCell>
        </>
      )}
    />
  )
}
