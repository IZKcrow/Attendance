//AuditLogsPage.jsx
import React from 'react'
import {
  TableCell,
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Paper
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import LocalizationProvider from '@mui/lab/LocalizationProvider'
import DateRangePicker from '@mui/lab/DateRangePicker'
import AdapterDateFns from '@mui/lab/AdapterDateFns'

function fmtDate(value) {
  if (!value) return '-'
  if (typeof value === 'string') {
    const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/)
    if (isoMatch) return isoMatch[1]
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

function fmtTime(value) {
  if (!value) return '-'
  if (typeof value === 'string') {
    const isoMatch = value.match(/^[^T]*T?(\d{2}:\d{2})(?::\d{2})?/)
    if (isoMatch) return isoMatch[1]
    if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDateTime(value) {
  const date = fmtDate(value)
  const time = fmtTime(value)
  if (date === '-' && time === '-') return '-'
  if (date === '-') return time
  if (time === '-') return date
  return `${date} ${time}`
}

function prettifyAction(action) {
  const raw = String(action || '').trim()
  if (!raw) return '-'

  const overrides = {
    IMPORT_EMPLOYEES_CSV: 'Imported Employee CSV',
    IMPORT_DEVICE_ATTENDANCE_CSV: 'Imported Attendance CSV',
    CREATE_EMPLOYEE: 'Created Employee',
    UPDATE_EMPLOYEE: 'Updated Employee',
    DELETE_EMPLOYEE: 'Deleted Employee',
    BULK_DELETE_EMPLOYEES: 'Deleted Employees'
  }

  if (overrides[raw]) return overrides[raw]
  return raw
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ')
}

function tryParseJson(value) {
  if (!value) return null
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch (_) {
    return null
  }
}

function prettifyFieldName(key) {
  const overrides = {
    name: 'Name',
    employeeCode: 'Employee Code',
    department: 'Department',
    position: 'Position',
    employmentStatus: 'Position',
    biometricStaffCode: 'Biometric Staff Code',
    biometricUserId: 'Biometric User ID',
    deviceCode: 'Device Code',
    deviceName: 'Device Name',
    requested: 'Requested',
    deleted: 'Deleted'
  }

  if (overrides[key]) return overrides[key]

  return String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function normalizeAuditValue(value) {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.join(', ')
  try {
    return JSON.stringify(value)
  } catch (_) {
    return String(value)
  }
}

function buildChangeList(row) {
  const before = tryParseJson(row?.BeforeJson)
  const after = tryParseJson(row?.AfterJson)
  const action = String(row?.Action || '').trim()

  if (!before || typeof before !== 'object' || !after || typeof after !== 'object') {
    return []
  }

  const ignoredKeys = new Set([
    'id',
    'EmployeeID',
    'AttendanceID',
    'CreatedAt',
    'UpdatedAt'
  ])

  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  const changes = keys
    .filter((key) => !ignoredKeys.has(key))
    .map((key) => {
      const beforeValue = normalizeAuditValue(before[key])
      const afterValue = normalizeAuditValue(after[key])
      if (beforeValue === afterValue) return null
      return {
        field: prettifyFieldName(key),
        before: beforeValue || '-',
        after: afterValue || '-'
      }
    })
    .filter(Boolean)

  if (changes.length) return changes

  if (action.startsWith('UPDATE_')) {
    return [{
      field: 'Change',
      before: formatAuditSummary({ ...row, AfterJson: null }),
      after: formatAuditSummary(row)
    }]
  }

  return []
}

function formatAuditSummary(row) {
  const action = String(row?.Action || '').trim()
  const details = tryParseJson(row?.AfterJson)
  const before = tryParseJson(row?.BeforeJson)

  if (action === 'DELETE_EMPLOYEE' && before) {
    return before.name || before.employeeCode || row?.RecordID || '-'
  }

  if (!details || typeof details !== 'object') return row?.RecordID || '-'

  if (action === 'IMPORT_EMPLOYEES_CSV') {
    return [
      `Rows: ${details.totalRows ?? 0}`,
      `Unique: ${details.uniqueEmployees ?? 0}`,
      `Created: ${details.created ?? 0}`,
      `Updated: ${details.updated ?? 0}`,
      `Skipped: ${details.skipped ?? 0}`
    ].join(' | ')
  }

  if (action === 'IMPORT_DEVICE_ATTENDANCE_CSV') {
    return [
      `Events: ${details.insertedEvents ?? 0}`,
      `Duplicates: ${details.duplicateEvents ?? 0}`,
      `Created: ${details.createdEmployees ?? 0}`,
      `Profiles: ${details.employeeProfilesTouched ?? 0}`,
      `Unknown: ${details.unknownEmployees ?? 0}`,
      `Days: ${details.attendanceGroupsTouched ?? 0}`
    ].join(' | ')
  }

  if (details.name) return String(details.name)
  if (details.employeeCode) return `Employee: ${details.employeeCode}`
  if (details.deviceCode) return `Device: ${details.deviceCode}`
  return row?.RecordID || '-'
}

function buildAuditHighlights(row) {
  const action = String(row?.Action || '').trim()
  const before = tryParseJson(row?.BeforeJson)
  const after = tryParseJson(row?.AfterJson)
  const focus = action.startsWith('DELETE_') ? before : (after || before)
  const items = []

  const push = (label, value) => {
    const safe = String(value ?? '').trim()
    if (!safe) return
    items.push({ label, value: safe })
  }

  if (focus && typeof focus === 'object') {
    push('Name', focus.name)
    push('Employee Code', focus.employeeCode)
    push('Department', focus.department)
    push('Position', focus.position || focus.employmentStatus)
    push('Biometric Staff Code', focus.biometricStaffCode)
    push('Biometric User ID', focus.biometricUserId)
    push('Device Code', focus.deviceCode)
    push('Device Name', focus.deviceName)
    push('Requested', focus.requested)
    push('Deleted', focus.deleted)
  }

  if (!items.length && row?.RecordID) {
    items.push({ label: 'Record ID', value: String(row.RecordID) })
  }

  return items
}

function formatJsonForDisplay(value) {
  const parsed = tryParseJson(value)
  if (!parsed) return String(value || '')
  try {
    return JSON.stringify(parsed, null, 2)
  } catch (_) {
    return String(value || '')
  }
}

function DetailBlock({ title, value }) {
  if (!value) return null
  return (
    <Box sx={{ display: 'grid', gap: 0.75 }}>
      <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
        {title}
      </Typography>
      <Paper
        variant="outlined"
        sx={{
          p: 1.25,
          borderColor: 'var(--border)',
          backgroundColor: 'rgba(255,255,255,0.03)',
          overflowX: 'auto'
        }}
      >
        <Typography
          component="pre"
          sx={{
            m: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 12,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {value}
        </Typography>
      </Paper>
    </Box>
  )
}

function ChangeBlock({ changes }) {
  if (!Array.isArray(changes) || !changes.length) return null

  return (
    <Box sx={{ display: 'grid', gap: 1 }}>
      <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
        Before And After
      </Typography>
      <Box sx={{ display: 'grid', gap: 1 }}>
        {changes.map((change) => (
          <Paper
            key={`${change.field}:${change.before}:${change.after}`}
            variant="outlined"
            sx={{ p: 1.25, borderColor: 'var(--border)', display: 'grid', gap: 1 }}
          >
            <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
              {change.field}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 }}>
              <Box>
                <Typography variant="caption" sx={{ color: '#fca5a5', fontWeight: 700 }}>
                  Before
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {change.before}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#86efac', fontWeight: 700 }}>
                  After
                </Typography>
                <Typography variant="body2" sx={{ mt: 0.25 }}>
                  {change.after}
                </Typography>
              </Box>
            </Box>
          </Paper>
        ))}
      </Box>
    </Box>
  )
}

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [dateRange, setDateRange] = React.useState([null, null])
  const [selectedLog, setSelectedLog] = React.useState(null)

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

  const filtered = logs.filter((l) => {
    const [start, end] = dateRange
    if (!start && !end) return true
    const t = l.CreatedAt ? new Date(l.CreatedAt) : null
    if (!t) return true
    if (start && t < new Date(start)) return false
    if (end) {
      const e = new Date(end)
      e.setHours(23, 59, 59, 999)
      if (t > e) return false
    }
    return true
  })

  const selectedHighlights = React.useMemo(
    () => buildAuditHighlights(selectedLog),
    [selectedLog]
  )
  const selectedChanges = React.useMemo(
    () => buildChangeList(selectedLog),
    [selectedLog]
  )

  return (
    <Box>
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mb: 1, flexWrap: 'wrap' }}>
        <Button variant="outlined" onClick={loadLogs}>
          Refresh
        </Button>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DateRangePicker
            startText="From"
            endText="To"
            value={dateRange}
            onChange={(newValue) => {
              setDateRange(newValue)
            }}
            renderInput={(startProps, endProps) => (
              <>
                <input
                  {...startProps.inputProps}
                  type="date"
                  value={startProps.inputProps.value || ''}
                  onChange={(e) => {
                    const s = e.target.value ? new Date(e.target.value) : null
                    setDateRange([s, dateRange[1]])
                  }}
                />
                <span style={{ margin: '0 8px' }}>—</span>
                <input
                  {...endProps.inputProps}
                  type="date"
                  value={endProps.inputProps.value || ''}
                  onChange={(e) => {
                    const d = e.target.value ? new Date(e.target.value) : null
                    setDateRange([dateRange[0], d])
                  }}
                />
              </>
            )}
          />
        </LocalizationProvider>
      </Box>

      <GenericDataTable
        title="Audit Logs"
        columns={['Admin', 'Action', 'Table', 'Summary', 'Created At']}
        data={filtered}
        loading={loading}
        error={error}
        primaryKeyField="AuditLogID"
        readOnly={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onRowClick={(row) => setSelectedLog(row)}
        renderRow={(row) => (
          <>
            <TableCell>{row.Actor || '-'}</TableCell>
            <TableCell>{prettifyAction(row.Action)}</TableCell>
            <TableCell>{row.TableName}</TableCell>
            <TableCell>
              <Button
                variant="text"
                onClick={(e) => {
                  e.stopPropagation()
                  setSelectedLog(row)
                }}
                sx={{
                  p: 0,
                  minWidth: 0,
                  textTransform: 'none',
                  justifyContent: 'flex-start',
                  textAlign: 'left',
                  color: 'var(--primary)'
                }}
              >
                {formatAuditSummary(row)}
              </Button>
            </TableCell>
            <TableCell>{fmtDateTime(row.CreatedAt)}</TableCell>
          </>
        )}
      />

      <Box sx={{ display: 'flex', justifyContent: 'flex-start', mt: 1 }}>
        <Button
          variant="outlined"
          onClick={() => {
            setDateRange([null, null])
          }}
        >
          Clear
        </Button>
      </Box>

      <Dialog
        open={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Audit Log Details</DialogTitle>
        <DialogContent dividers>
          {selectedLog && (
            <Box sx={{ display: 'grid', gap: 2 }}>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
                <Paper variant="outlined" sx={{ p: 1.25, borderColor: 'var(--border)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
                    Action
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {prettifyAction(selectedLog.Action)}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.25, borderColor: 'var(--border)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
                    Admin
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {selectedLog.Actor || '-'}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.25, borderColor: 'var(--border)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
                    Table
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {selectedLog.TableName || '-'}
                  </Typography>
                </Paper>
                <Paper variant="outlined" sx={{ p: 1.25, borderColor: 'var(--border)' }}>
                  <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
                    Created At
                  </Typography>
                  <Typography variant="body2" sx={{ mt: 0.5 }}>
                    {fmtDateTime(selectedLog.CreatedAt)}
                  </Typography>
                </Paper>
              </Box>

              <Box sx={{ display: 'grid', gap: 1 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                  Affected Record
                </Typography>
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.25 }}>
                  {selectedHighlights.map((item) => (
                    <Paper key={`${item.label}:${item.value}`} variant="outlined" sx={{ p: 1.25, borderColor: 'var(--border)' }}>
                      <Typography variant="caption" sx={{ fontWeight: 800, color: 'var(--muted)' }}>
                        {item.label}
                      </Typography>
                      <Typography variant="body2" sx={{ mt: 0.5 }}>
                        {item.value}
                      </Typography>
                    </Paper>
                  ))}
                </Box>
              </Box>

              <DetailBlock title="Summary" value={formatAuditSummary(selectedLog)} />
              <ChangeBlock changes={selectedChanges} />
              <DetailBlock title="Before" value={formatJsonForDisplay(selectedLog.BeforeJson)} />
              <DetailBlock title="After" value={formatJsonForDisplay(selectedLog.AfterJson)} />
              <DetailBlock
                title="Raw Metadata"
                value={JSON.stringify({
                  AuditLogID: selectedLog.AuditLogID,
                  RecordID: selectedLog.RecordID,
                  DeviceID: selectedLog.DeviceID,
                  IPAddress: selectedLog.IPAddress
                }, null, 2)}
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedLog(null)} sx={{ textTransform: 'none' }}>
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
