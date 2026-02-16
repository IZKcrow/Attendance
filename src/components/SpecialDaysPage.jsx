//SpecialDaysPage.jsx
import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function SpecialDaysPage() {
  const [days, setDays] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadDays()
  }, [])

  const loadDays = async () => {
    try {
      setLoading(true)
      const data = await api.fetchSpecialDays()
      setDays(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createSpecialDay(form)
      setDays([...days, result])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateSpecialDay(form.SpecialDayID, form)
      setDays(days.map(d => d.SpecialDayID === form.SpecialDayID ? result : d))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteSpecialDay(id)
      setDays(days.filter(d => d.SpecialDayID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <GenericDataTable
      title="Special Days"
      columns={['SpecialDate', 'DayType', 'Description']}
      data={days}
      loading={loading}
      error={error}
      primaryKeyField="SpecialDayID"
      readOnly={true}
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      renderRow={(row) => (
        <>
          <TableCell>{row.SpecialDate}</TableCell>
          <TableCell>{row.DayType}</TableCell>
          <TableCell>{row.Description}</TableCell>
        </>
      )}
    />
  )
}
