import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function BiometricScansPage() {
  const [scans, setScans] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadScans()
  }, [])

  const loadScans = async () => {
    try {
      setLoading(true)
      const data = await api.fetchBiometricScans()
      setScans(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createBiometricScan(form)
      setScans([...scans, result])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteBiometricScan(id)
      setScans(scans.filter(s => s.BiometricScanID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <GenericDataTable
      title="Biometric Scans"
      columns={['EmployeeID', 'ScanTime', 'ScanType', 'AuthenticationMethod', 'IsSuccessful']}
      data={scans}
      loading={loading}
      error={error}
      primaryKeyField="BiometricScanID"
      onAdd={handleAdd}
      onEdit={() => {}}
      onDelete={handleDelete}
      renderRow={(row) => (
        <>
          <TableCell>{row.EmployeeID}</TableCell>
          <TableCell>{row.ScanTime}</TableCell>
          <TableCell>{row.ScanType}</TableCell>
          <TableCell>{row.AuthenticationMethod}</TableCell>
          <TableCell>{row.IsSuccessful ? 'Yes' : 'No'}</TableCell>
        </>
      )}
    />
  )
}
