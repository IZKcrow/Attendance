import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

function fmtDateTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

export default function DeviceAttendanceEventsPage() {
  const [rows, setRows] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [deviceCode, setDeviceCode] = React.useState('')
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.fetchDeviceAttendanceEvents({
        deviceCode: deviceCode.trim() || null,
        from: from || null,
        to: to || null,
        top: 2000
      })
      setRows(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [deviceCode, from, to])

  React.useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'end', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>DeviceCode (optional)</div>
          <input value={deviceCode} onChange={(e) => setDeviceCode(e.target.value)} placeholder="88" />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>From (optional)</div>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 2 }}>To (optional)</div>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={load} disabled={loading}>Refresh</button>
      </div>

      <GenericDataTable
        title="Imported Device Logs"
        columns={['EventTime', 'DeviceCode', 'StaffCode', 'EmployeeName', 'Department', 'UserID', 'MachineID', 'ImportedAt', 'Source']}
        data={rows}
        loading={loading}
        error={error}
        primaryKeyField="DeviceAttendanceEventID"
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        renderRow={(row) => (
          <>
            <TableCell>{fmtDateTime(row.EventTime)}</TableCell>
            <TableCell>{row.DeviceCode || ''}</TableCell>
            <TableCell>{row.StaffCode || ''}</TableCell>
            <TableCell>{row.EmployeeName || ''}</TableCell>
            <TableCell>{row.Department || ''}</TableCell>
            <TableCell>{row.UserID || ''}</TableCell>
            <TableCell>{row.MachineID ?? ''}</TableCell>
            <TableCell>{fmtDateTime(row.ImportedAt)}</TableCell>
            <TableCell>{row.Source || ''}</TableCell>
          </>
        )}
      />
    </div>
  )
}

