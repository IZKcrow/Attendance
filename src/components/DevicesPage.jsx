// DevicesPage.jsx
// Practical devices admin:
// - Add a device (stores DeviceCode/Name/Type + IPAddress/Port)
// - Register connection / Heartbeat (updates LastSeenAt)
// - Test TCP reachability (calls POST /devices/test-connection)
// - Export logs as CSV (calls POST /devices/export-logs)
import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function DevicesPage() {
  const [devices, setDevices] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [busyId, setBusyId] = React.useState(null)
  const [statusMsg, setStatusMsg] = React.useState('')
  const [lastRefreshedAt, setLastRefreshedAt] = React.useState(null)
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

  const isOnline = React.useCallback((device) => {
    if (!device?.IsActive) return false
    const lastSeen = parseDate(device?.LastSeenAt)
    if (!lastSeen) return false
    return (Date.now() - lastSeen.getTime()) <= ONLINE_THRESHOLD_MS
  }, [ONLINE_THRESHOLD_MS, parseDate])

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
        setDevices(Array.isArray(data) ? data : [])
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
      const machineIdRaw = form.MachineID
      let machineId = machineIdRaw === '' || machineIdRaw === null || machineIdRaw === undefined ? null : Number.parseInt(machineIdRaw, 10)
      if (!Number.isInteger(machineId) || machineId <= 0) {
        const fallback = Number.parseInt(String(form.DeviceCode || ''), 10)
        if (Number.isInteger(fallback) && fallback > 0) machineId = fallback
      }
      if (!Number.isInteger(machineId) || machineId <= 0) throw new Error('MachineID is required (or make DeviceCode numeric).')

      const commPortRaw = form.CommPort
      const commPort = commPortRaw === '' || commPortRaw === null || commPortRaw === undefined ? 0 : Number.parseInt(commPortRaw, 10)

      const pwdRaw = form.DevicePassword
      const devicePassword = pwdRaw === '' || pwdRaw === null || pwdRaw === undefined ? 0 : Number.parseInt(pwdRaw, 10)

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

  const registerConnection = async (device) => {
    if (!device?.DeviceCode) return
    setBusyId(device.DeviceID || device.DeviceCode)
    try {
      await api.registerDeviceConnection({
        deviceCode: device.DeviceCode,
        deviceName: device.DeviceName,
        deviceType: device.DeviceType || 'TCP',
        serialNumber: device.SerialNumber,
        ipAddress: device.IPAddress,
        port: device.Port,
        registeredBy: 'UI_DEVICES'
      })
      setStatusMsg(`Registered ${device.DeviceCode} @ ${new Date().toLocaleTimeString()}`)
      loadDevices({ silent: true })
    } catch (err) {
      setStatusMsg(`Register failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }

  const sendHeartbeat = async (device) => {
    if (!device?.DeviceCode) return
    setBusyId(device.DeviceID || device.DeviceCode)
    try {
      await api.sendDeviceHeartbeat({ deviceCode: device.DeviceCode, deviceID: device.DeviceID, actor: 'UI_DEVICES' })
      setStatusMsg(`Heartbeat sent for ${device.DeviceCode} @ ${new Date().toLocaleTimeString()}`)
      loadDevices({ silent: true })
    } catch (err) {
      setStatusMsg(`Heartbeat failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }

  const testConnection = async (device) => {
    if (!device?.DeviceCode) return
    setBusyId(device.DeviceID || device.DeviceCode)
    try {
      const result = await api.testDeviceConnection({ deviceCode: device.DeviceCode })
      if (result?.success) {
        setStatusMsg(`Connection OK for ${device.DeviceCode} (${result.ip}:${result.port}) - ${result.latencyMs}ms`)
      } else {
        setStatusMsg(`Connection FAIL for ${device.DeviceCode} (${result?.ip || '-'}:${result?.port || '-'}) - ${result?.reason || 'error'}`)
      }
    } catch (err) {
      setStatusMsg(`Test failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }

  const exportLogs = async (device) => {
    if (!device?.DeviceCode) return
    setBusyId(device.DeviceID || device.DeviceCode)
    try {
      const { blob, filename } = await api.exportDeviceLogsCsv({ deviceCode: device.DeviceCode })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `device-${device.DeviceCode}-logs.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      setStatusMsg(`Exported logs for ${device.DeviceCode} @ ${new Date().toLocaleTimeString()}`)
    } catch (err) {
      setStatusMsg(`Export failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }

  const startImportCsv = (device) => {
    if (!device?.DeviceCode) return
    importTargetRef.current = device
    if (importFileInputRef.current) {
      importFileInputRef.current.value = ''
      importFileInputRef.current.click()
    }
  }

  const onImportFileChange = async (e) => {
    const device = importTargetRef.current
    const file = e?.target?.files?.[0] || null
    if (!device?.DeviceCode || !file) return

    setBusyId(device.DeviceID || device.DeviceCode)
    try {
      const csvText = await file.text()
      const createMissingEmployees = window.confirm('Create missing employees from this CSV?\n\nOK = create employees (recommended for first import)\nCancel = import only for existing employees')
      const result = await api.importDeviceAttendanceCsv({
        deviceCode: device.DeviceCode,
        csvText,
        createMissingEmployees,
        overwriteExisting: false
      })
      setStatusMsg(
        `Imported ${result?.insertedEvents ?? 0} event(s) (${result?.duplicateEvents ?? 0} duplicate), ` +
        `updated ${result?.attendanceGroupsTouched ?? 0} attendance day(s), ` +
        `unknown employees: ${result?.unknownEmployees ?? 0}.`
      )
      setError(null)
    } catch (err) {
      setStatusMsg(`Import failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
      importTargetRef.current = null
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
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap', marginBottom: 8 }}>
        <div style={{ color: '#0f1f3d', fontWeight: 600 }}>
          {statusMsg || ''}
        </div>
        <div style={{ opacity: 0.75, fontSize: 12 }}>
          {lastRefreshedAt ? `Last refresh: ${lastRefreshedAt.toLocaleTimeString()}` : ''}
        </div>
      </div>

      <GenericDataTable
        title="Devices"
        columns={['Status', 'DeviceCode', 'MachineID', 'CommPort', 'DeviceName', 'DeviceType', 'SerialNumber', 'IPAddress', 'Port', 'RegisteredAt', 'LastSeenAt', 'IsActive', 'Actions']}
        formColumns={['DeviceCode', 'MachineID', 'CommPort', 'DevicePassword', 'DeviceName', 'DeviceType', 'IPAddress', 'Port', 'SerialNumber']}
        columnSchema={{ Port: { type: 'number' }, MachineID: { type: 'number' }, CommPort: { type: 'number' }, DevicePassword: { type: 'password' } }}
        data={devices}
        loading={loading}
        error={error}
        primaryKeyField="DeviceID"
        allowEdit={false}
        allowDelete={false}
        onAdd={handleAdd}
        onEdit={() => {}}
        onDelete={() => {}}
        renderRow={(row) => (
          <>
            <TableCell>
              <span
                style={{
                  display: 'inline-block',
                  padding: '2px 8px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 700,
                  background: isOnline(row) ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.18)',
                  color: isOnline(row) ? '#047857' : '#334155'
                }}
                title={row?.LastSeenAt ? `Last seen: ${formatDateTime(row.LastSeenAt)}` : 'No heartbeat yet'}
              >
                {isOnline(row) ? 'ONLINE' : 'OFFLINE'}
              </span>
            </TableCell>
            <TableCell>{row.DeviceCode}</TableCell>
            <TableCell>{row.MachineID ?? ''}</TableCell>
            <TableCell>{row.CommPort ?? ''}</TableCell>
            <TableCell>{row.DeviceName}</TableCell>
            <TableCell>{row.DeviceType}</TableCell>
            <TableCell>{row.SerialNumber}</TableCell>
            <TableCell>{row.IPAddress || ''}</TableCell>
            <TableCell>{row.Port ?? ''}</TableCell>
            <TableCell>{formatDateTime(row.RegisteredAt)}</TableCell>
            <TableCell>{formatDateTime(row.LastSeenAt)}</TableCell>
            <TableCell>{row.IsActive ? 'Yes' : 'No'}</TableCell>
            <TableCell style={{ minWidth: 320 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              <button
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: busyId === (row.DeviceID || row.DeviceCode) ? 0.6 : 1
                }}
                onClick={() => registerConnection(row)}
                disabled={busyId === (row.DeviceID || row.DeviceCode)}
              >
                Register
              </button>
              <button
                style={{
                  background: '#334155',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: busyId === (row.DeviceID || row.DeviceCode) ? 0.6 : 1
                }}
                onClick={() => testConnection(row)}
                disabled={busyId === (row.DeviceID || row.DeviceCode)}
              >
                Test
              </button>
              <button
                style={{
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: busyId === (row.DeviceID || row.DeviceCode) ? 0.6 : 1
                }}
                onClick={() => sendHeartbeat(row)}
                disabled={busyId === (row.DeviceID || row.DeviceCode)}
              >
                Heartbeat
              </button>
              <button
                style={{
                  background: '#0f1f3d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: busyId === (row.DeviceID || row.DeviceCode) ? 0.6 : 1
                }}
                onClick={() => exportLogs(row)}
                disabled={busyId === (row.DeviceID || row.DeviceCode)}
              >
                Export Logs
              </button>
              <button
                style={{
                  background: '#111827',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  padding: '6px 10px',
                  whiteSpace: 'nowrap',
                  display: 'inline-flex',
                  alignItems: 'center',
                  cursor: 'pointer',
                  opacity: busyId === (row.DeviceID || row.DeviceCode) ? 0.6 : 1
                }}
                onClick={() => startImportCsv(row)}
                disabled={busyId === (row.DeviceID || row.DeviceCode)}
                title="Import attendance CSV exported from TM200/Zwkq"
              >
                Import CSV
              </button>
              </div>
            </TableCell>
          </>
        )}
      />
    </>
  )
}
