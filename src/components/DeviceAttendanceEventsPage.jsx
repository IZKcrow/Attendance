import React from 'react'
import { Box, Button, Paper, TableCell, TextField } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

function fmtDateTime(value) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

const filterCardSx = {
  display: 'flex',
  gap: 2,
  rowGap: 1.5,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  padding: 2,
  marginBottom: 2,
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
  borderRadius: 3
}

const inputSx = {
  minWidth: 220,
  backgroundColor: '#fdfdfd',
  '& fieldset': { borderColor: 'var(--border)' },
  '&:hover fieldset': { borderColor: 'var(--primary)' },
  '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
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
      <Paper sx={filterCardSx}>
        <TextField
          size="small"
          label="Device Code (optional)"
          value={deviceCode}
          onChange={(e) => setDeviceCode(e.target.value)}
          placeholder="88"
          sx={inputSx}
        />
        <TextField
          size="small"
          label="From (optional)"
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={inputSx}
        />
        <TextField
          size="small"
          label="To (optional)"
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          InputLabelProps={{ shrink: true }}
          sx={inputSx}
        />

        <Box sx={{ flexGrow: 1 }} />

        <Button
          variant="contained"
          onClick={load}
          disabled={loading}
          sx={primaryBtnSx}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </Paper>

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
