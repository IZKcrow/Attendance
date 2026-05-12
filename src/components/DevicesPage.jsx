// DevicesPage.jsx
import React from 'react'
import {
  TableCell,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function DevicesPage() {
  const [devices, setDevices] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [busyId, setBusyId] = React.useState(null)
  const [statusMsg, setStatusMsg] = React.useState('')
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState(null)
  const [selectedDeviceIds, setSelectedDeviceIds] = React.useState([])
  const [importDialogOpen, setImportDialogOpen] = React.useState(false)
  const [pendingImport, setPendingImport] = React.useState(null)
  const importFileInputRef = React.useRef(null)
  const importTargetRef = React.useRef(null)

  const ONLINE_THRESHOLD_MS = 2 * 60 * 1000

  const parseDate = React.useCallback((value) => {
    if (!value) return null
    const d = value instanceof Date ? value : new Date(value)
    return Number.isNaN(d.getTime()) ? null : d
  }, [])

  const formatDateTime = React.useCallback((value) => {
    const d = parseDate(value)
    return d ? d.toLocaleString() : ''
  }, [parseDate])

  const getDeviceStatus = React.useCallback((device) => {
    if (!device?.IsActive) {
      return {
        label: 'OFFLINE',
        background: 'rgba(148,163,184,0.18)',
        color: '#334155',
        title: 'Device is inactive'
      }
    }

    const lastSeen = parseDate(device?.LastSeenAt)
    if (!lastSeen) {
      return {
        label: 'REGISTERED',
        background: 'rgba(245,158,11,0.16)',
        color: '#b45309',
        title: 'Device is registered but has not sent a successful heartbeat yet'
      }
    }

    if ((Date.now() - lastSeen.getTime()) <= ONLINE_THRESHOLD_MS) {
      return {
        label: 'ONLINE',
        background: 'rgba(16,185,129,0.15)',
        color: '#047857',
        title: `Last seen: ${formatDateTime(lastSeen)}`
      }
    }

    return {
      label: 'OFFLINE',
      background: 'rgba(148,163,184,0.18)',
      color: '#334155',
      title: `Last seen: ${formatDateTime(lastSeen)}`
    }
  }, [ONLINE_THRESHOLD_MS, formatDateTime, parseDate])

  React.useEffect(() => {
    let alive = true
    loadDevices({ silent: false, aliveRef: () => alive })

    const intervalId = setInterval(() => {
      loadDevices({ silent: true, aliveRef: () => alive })
    }, 15000)

    return () => {
      alive = false
      clearInterval(intervalId)
    }
  }, [])

  const loadDevices = async ({ silent = false, aliveRef = null } = {}) => {
    try {
      if (!silent) setLoading(true)
      const data = await api.fetchDevices()
      if (!aliveRef || aliveRef()) {
        const list = Array.isArray(data) ? data : []
        setDevices(list)
        const present = new Set(list.map(d => d.DeviceID).filter(Boolean))
        setSelectedDeviceIds((prev) => (Array.isArray(prev) ? prev.filter(id => present.has(id)) : []))
        setError(null)
        setLastRefreshedAt(new Date())
      }
    } catch (err) {
      if (!aliveRef || aliveRef()) setError(err.message)
    } finally {
      if (!silent && (!aliveRef || aliveRef())) setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const registeredBy = 'UI_DEVICES'
      const ipAddress = String(form.IPAddress || '').trim()
      const port = form.Port === '' || form.Port === null || form.Port === undefined ? null : Number.parseInt(form.Port, 10)

      const machineId = Number.parseInt(String(form.DeviceCode || '').trim(), 10)
      if (!Number.isInteger(machineId) || machineId <= 0) throw new Error('DeviceCode must be a numeric ID (used as MachineID).')

      const commPort = 0
      const devicePassword = 0

      if (!ipAddress) throw new Error('IPAddress is required.')
      if (Number.isNaN(port) || port === null) throw new Error('Port is required.')

      const result = await api.createDevice({
        deviceCode: form.DeviceCode,
        deviceName: form.DeviceName,
        deviceType: form.DeviceType || 'TCP',
        serialNumber: form.SerialNumber,
        ipAddress,
        port,
        machineId,
        commPort,
        devicePassword,
        isActive: true,
        registeredBy
      })
      setStatusMsg(`Added ${result?.DeviceCode || form.DeviceCode} @ ${new Date().toLocaleTimeString()}`)
      await loadDevices({ silent: true })
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (updated) => {
    const deviceID = updated?.DeviceID
    if (!deviceID) throw new Error('Missing DeviceID')

    setBusyId(deviceID)
    try {
      const portRaw = updated.Port
      const port = portRaw === '' || portRaw === null || portRaw === undefined ? null : Number.parseInt(portRaw, 10)

      await api.updateDevice(deviceID, {
        DeviceName: updated.DeviceName,
        DeviceType: updated.DeviceType,
        SerialNumber: updated.SerialNumber,
        IPAddress: updated.IPAddress,
        Port: Number.isNaN(port) ? null : port,
        IsActive: updated.IsActive
      })

      setStatusMsg(`Updated ${updated?.DeviceCode || deviceID} @ ${new Date().toLocaleTimeString()}`)
      await loadDevices({ silent: true })
      setError(null)
    } finally {
      setBusyId(null)
    }
  }

  const onImportFileChange = async (e) => {
    const device = importTargetRef.current
    const file = e?.target?.files?.[0] || null
    if (!device?.DeviceCode || !file) return

    try {
      const csvText = await file.text()
      setPendingImport({
        deviceCode: device.DeviceCode,
        deviceKey: device.DeviceID || device.DeviceCode,
        csvText,
        filename: file.name || 'CSV file'
      })
      setImportDialogOpen(true)
    } catch (err) {
      setStatusMsg(`Import failed: ${err.message || err}`)
    } finally {
      importTargetRef.current = null
    }
  }

  const closeImportDialog = React.useCallback(() => {
    if (busyId) return
    setImportDialogOpen(false)
    setPendingImport(null)
  }, [busyId])

  const runImport = React.useCallback(async (mode) => {
    if (!pendingImport?.deviceCode || !pendingImport?.csvText) return

    const isFirstTime = mode === 'first-time'
    const createMissingEmployees = isFirstTime
    const updateEmployeeProfiles = true
    const overwriteEmployeeProfiles = !isFirstTime

    setBusyId(pendingImport.deviceKey)
    try {
      const result = await api.importDeviceAttendanceCsv({
        deviceCode: pendingImport.deviceCode,
        csvText: pendingImport.csvText,
        createMissingEmployees,
        overwriteExisting: false,
        updateEmployeeProfiles,
        overwriteEmployeeProfiles
      })

      const profileUpdates = Number(result?.employeeProfilesTouched ?? 0)
      setStatusMsg(
        `Imported ${result?.insertedEvents ?? 0} event(s) (${result?.duplicateEvents ?? 0} duplicate), ` +
        `created employees: ${result?.createdEmployees ?? 0}, ` +
        `updated ${result?.attendanceGroupsTouched ?? 0} attendance day(s), ` +
        `employee profiles: ${profileUpdates}, ` +
        `unknown employees: ${result?.unknownEmployees ?? 0}.`
      )
      setError(null)
      setImportDialogOpen(false)
      setPendingImport(null)
    } catch (err) {
      setStatusMsg(`Import failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }, [pendingImport])

  const allDeviceIds = React.useMemo(() => devices.map(d => d.DeviceID).filter(Boolean), [devices])
  const allSelected = React.useMemo(() => allDeviceIds.length > 0 && allDeviceIds.every(id => selectedDeviceIds.includes(id)), [allDeviceIds, selectedDeviceIds])
  const someSelected = React.useMemo(() => selectedDeviceIds.length > 0 && !allSelected, [selectedDeviceIds, allSelected])

  const toggleAll = React.useCallback((checked) => {
    setSelectedDeviceIds(checked ? allDeviceIds : [])
  }, [allDeviceIds])

  const toggleOne = React.useCallback((deviceId, checked) => {
    if (!deviceId) return
    setSelectedDeviceIds((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      if (checked) {
        if (arr.includes(deviceId)) return arr
        return [...arr, deviceId]
      }
      return arr.filter((id) => id !== deviceId)
    })
  }, [])

  const handleSyncSelected = async () => {
    if (!selectedDeviceIds.length) {
      setStatusMsg('Select at least one device.')
      return
    }

    setBusyId('BATCH_SYNC')
    try {
      const result = await api.requestDeviceSyncBatch({ deviceIds: selectedDeviceIds })
      const queued = result?.queued ?? 0
      const requested = result?.requested ?? selectedDeviceIds.length
      setStatusMsg(`Sync queued: ${queued}/${requested} device(s). Run the BiometricsBridge agent to process jobs.`)
    } catch (err) {
      setStatusMsg(`Sync queue failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleImportSelected = () => {
    if (selectedDeviceIds.length !== 1) {
      setStatusMsg('Select exactly one device to import a CSV.')
      return
    }
    const target = devices.find(d => d.DeviceID === selectedDeviceIds[0]) || null
    if (!target) {
      setStatusMsg('Selected device not found.')
      return
    }
    importTargetRef.current = target
    if (importFileInputRef.current) {
      importFileInputRef.current.value = ''
      importFileInputRef.current.click()
    }
  }

  return (
  <>
      <input
        ref={importFileInputRef}
        type="file"
        accept=".csv,text/csv"
        style={{ display: 'none' }}
        onChange={onImportFileChange}
      />
      <Dialog
        open={importDialogOpen}
        onClose={closeImportDialog}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: {
            borderRadius: 3,
            overflow: 'hidden'
          }
        }}
      >
        <DialogTitle sx={{ fontWeight: 700 }}>
          Import Attendance CSV
        </DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
            Choose how to handle <strong>{pendingImport?.filename || 'this CSV file'}</strong>.
          </Typography>

          <Box
            sx={{
              display: 'grid',
              gap: 1.5,
              gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }
            }}
          >
            <Box
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: '#c7d2fe',
                borderRadius: 2,
                background: 'linear-gradient(180deg, #eef2ff 0%, #f8fafc 100%)'
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#312e81', mb: 0.5 }}>
                First-Time Import
              </Typography>
              <Typography variant="body2" sx={{ color: '#4338ca', mb: 2 }}>
                Best when this device is being imported for the first time. Missing employees will be created automatically.
              </Typography>
              <Button
                fullWidth
                variant="contained"
                onClick={() => runImport('first-time')}
                disabled={!!busyId}
                sx={{
                  background: '#4338ca',
                  ':hover': { background: '#3730a3' }
                }}
              >
                Use First-Time Import
              </Button>
            </Box>

            <Box
              sx={{
                p: 2,
                border: '1px solid',
                borderColor: '#bfdbfe',
                borderRadius: 2,
                background: 'linear-gradient(180deg, #eff6ff 0%, #f8fafc 100%)'
              }}
            >
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#1d4ed8', mb: 0.5 }}>
                Update Existing Data
              </Typography>
              <Typography variant="body2" sx={{ color: '#1e40af', mb: 2 }}>
                Best when employees already exist. This refreshes existing employee profile data from the CSV and imports attendance only for matched employees.
              </Typography>
              <Button
                fullWidth
                variant="outlined"
                onClick={() => runImport('update-existing')}
                disabled={!!busyId}
                sx={{
                  borderColor: '#60a5fa',
                  color: '#1d4ed8',
                  ':hover': {
                    borderColor: '#2563eb',
                    background: 'rgba(37,99,235,0.06)'
                  }
                }}
              >
                Update Existing Employees
              </Button>
            </Box>
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2 }}>
          <Button onClick={closeImportDialog} disabled={!!busyId}>
            Cancel
          </Button>
        </DialogActions>
      </Dialog>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ color: '#0f1f3d', fontWeight: 600 }}>
          {statusMsg || ''}
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          {lastRefreshedAt ? `Last refresh: ${lastRefreshedAt.toLocaleTimeString()}` : ''}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, opacity: 0.85 }}>
          Selected: <strong>{selectedDeviceIds.length}</strong>
        </div>
        <button
          style={{
            background: '#0f172a',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={handleSyncSelected}
          disabled={!!busyId}
          title="Queues a sync job. Requires BiometricsBridge to run in agent mode to pull logs from the device."
        >
          Sync Selected
        </button>
        <button
          style={{
            background: '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={handleImportSelected}
          disabled={!!busyId}
          title="Import attendance CSV exported from TM200/Zwkq (select exactly one device)"
        >
          Import CSV
        </button>
        <button
          style={{
            background: '#111827',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={() => setSelectedDeviceIds([])}
          disabled={!!busyId || selectedDeviceIds.length === 0}
        >
          Clear Selection
        </button>
      </div>

      <GenericDataTable
        title="Devices"
        columns={[
          {
            key: 'Select',
            label: '',
            header: (
              <Checkbox
                size="small"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(e) => toggleAll(e.target.checked)}
                inputProps={{ 'aria-label': 'Select all devices' }}
              />
            )
          },
          'Status',
          'DeviceCode',
          'DeviceName',
          'IPAddress',
          'Port',
          'LastSeenAt'
        ]}
        formColumns={['DeviceCode', 'DeviceName', 'IPAddress', 'Port', 'DeviceType', 'SerialNumber']}
        columnSchema={{ Port: { type: 'number' } }}
        data={devices}
        loading={loading}
        error={error}
        primaryKeyField="DeviceID"
        allowDelete={false}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={() => {}}
        renderRow={(row) => {
          const status = getDeviceStatus(row)
          return (
          <>
            <TableCell>
              <Checkbox
                size="small"
                checked={selectedDeviceIds.includes(row.DeviceID)}
                onChange={(e) => toggleOne(row.DeviceID, e.target.checked)}
                inputProps={{ 'aria-label': `Select device ${row.DeviceCode || ''}` }}
              />
            </TableCell>
            <TableCell>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: status.background,
                  color: status.color
                }}
                title={status.title}
              >
                {status.label}
              </span>
            </TableCell>
            <TableCell>
              {row.DeviceCode ?? ''}
            </TableCell>
            <TableCell>{row.DeviceName || ''}</TableCell>
            <TableCell>{row.IPAddress || ''}</TableCell>
            <TableCell>{row.Port ?? ''}</TableCell>
            <TableCell>{formatDateTime(row.LastSeenAt)}</TableCell>
          </>
          )
        }}
      />
    </>
  )
}
