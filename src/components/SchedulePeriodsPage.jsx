import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function SchedulePeriodsPage() {
  const [periods, setPeriods] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadPeriods()
  }, [])

  const loadPeriods = async () => {
    try {
      setLoading(true)
      const data = await api.fetchSchedulePeriods()
      setPeriods(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createSchedulePeriod(form)
      setPeriods([...periods, result])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateSchedulePeriod(form.SchedulePeriodID, form)
      setPeriods(periods.map(p => p.SchedulePeriodID === form.SchedulePeriodID ? result : p))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteSchedulePeriod(id)
      setPeriods(periods.filter(p => p.SchedulePeriodID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <GenericDataTable
      title="Schedule Periods"
      columns={['EmployeeID', 'PeriodName', 'StartDate', 'EndDate', 'IsActive']}
      data={periods}
      loading={loading}
      error={error}
      primaryKeyField="SchedulePeriodID"
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      renderRow={(row) => (
        <>
          <TableCell>{row.EmployeeID}</TableCell>
          <TableCell>{row.PeriodName}</TableCell>
          <TableCell>{row.StartDate}</TableCell>
          <TableCell>{row.EndDate}</TableCell>
          <TableCell>{row.IsActive ? 'Yes' : 'No'}</TableCell>
        </>
      )}
    />
  )
}
