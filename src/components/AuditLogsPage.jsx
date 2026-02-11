import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadLogs()
  }, [])

  const loadLogs = async () => {
    try {
      setLoading(true)
      const data = await api.fetchAuditLogs()
      setLogs(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <GenericDataTable
      title="Audit Logs"
      columns={['Action', 'TableName', 'CreatedAt']}
      data={logs}
      loading={loading}
      error={error}
      primaryKeyField="AuditLogID"
      onAdd={() => {}}
      onEdit={() => {}}
      onDelete={() => {}}
      renderRow={(row) => (
        <>
          <TableCell>{row.Action}</TableCell>
          <TableCell>{row.TableName}</TableCell>
          <TableCell>{row.CreatedAt}</TableCell>
        </>
      )}
    />
  )
}
