// DevicesPage.jsx
import React from 'react'
import { TableCell, Checkbox } from '@mui/material'
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

  const handleTestSelected = async () => {
    if (!selectedDeviceIds.length) {
      setStatusMsg('Select at least one device.')
      return
    }

    setBusyId('BATCH_TEST')
    try {
      try {
        const result = await api.testDevicesBatch({ deviceIds: selectedDeviceIds })
        const results = Array.isArray(result?.results) ? result.results : []
        const ok = results.filter(r => r.success).length
        setStatusMsg(`Batch test complete: ${ok}/${results.length || selectedDeviceIds.length} OK`)
      } catch (_) {
        const byId = new Map(devices.map(d => [d.DeviceID, d]))
        let ok = 0
        let total = 0
        for (const id of selectedDeviceIds) {
          const dev = byId.get(id)
          if (!dev?.DeviceCode) continue
          total += 1
          try {
            const r = await api.testDeviceConnection({ deviceCode: dev.DeviceCode })
            if (r?.success) ok += 1
          } catch (_) {}
        }
        setStatusMsg(`Batch test complete: ${ok}/${total} OK`)
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleHeartbeatSelected = async () => {
    if (!selectedDeviceIds.length) {
      setStatusMsg('Select at least one device.')
      return
    }

    setBusyId('BATCH_HEARTBEAT')
    try {
      try {
        const result = await api.heartbeatDevicesBatch({ deviceIds: selectedDeviceIds, actor: 'UI_DEVICES' })
        setStatusMsg(`Heartbeat updated for ${result?.updated ?? selectedDeviceIds.length} device(s).`)
        loadDevices({ silent: true })
      } catch (_) {
        const byId = new Map(devices.map(d => [d.DeviceID, d]))
        let updated = 0
        for (const id of selectedDeviceIds) {
          const dev = byId.get(id)
          if (!dev?.DeviceCode) continue
          try {
            await api.sendDeviceHeartbeat({ deviceCode: dev.DeviceCode, deviceID: dev.DeviceID, actor: 'UI_DEVICES' })
            updated += 1
          } catch (_) {}
        }
        setStatusMsg(`Heartbeat sent for ${updated} device(s).`)
        loadDevices({ silent: true })
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleRegisterSelected = async () => {
    if (!selectedDeviceIds.length) {
      setStatusMsg('Select at least one device.')
      return
    }

    setBusyId('BATCH_REGISTER')
    try {
      const byId = new Map(devices.map(d => [d.DeviceID, d]))
      let ok = 0
      let total = 0
      for (const id of selectedDeviceIds) {
        const dev = byId.get(id)
        if (!dev?.DeviceCode) continue
        total += 1
        try {
          await api.registerDeviceConnection({
            deviceCode: dev.DeviceCode,
            deviceName: dev.DeviceName,
            deviceType: dev.DeviceType || 'TCP',
            serialNumber: dev.SerialNumber,
            ipAddress: dev.IPAddress,
            port: dev.Port,
            registeredBy: 'UI_DEVICES'
          })
          ok += 1
        } catch (_) {}
      }
      setStatusMsg(`Register complete: ${ok}/${total} device(s).`)
      loadDevices({ silent: true })
    } finally {
      setBusyId(null)
    }
  }

  const handleExportSelected = async () => {
    if (!selectedDeviceIds.length) {
      setStatusMsg('Select at least one device.')
      return
    }

    setBusyId('BATCH_EXPORT')
    try {
      const byId = new Map(devices.map(d => [d.DeviceID, d]))
      let ok = 0
      let total = 0
      for (const id of selectedDeviceIds) {
        const dev = byId.get(id)
        if (!dev?.DeviceCode) continue
        total += 1
        try {
          const { blob, filename } = await api.exportDeviceLogsCsv({ deviceCode: dev.DeviceCode })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = filename || `device-${dev.DeviceCode}-logs.csv`
          document.body.appendChild(a)
          a.click()
          a.remove()
          URL.revokeObjectURL(url)
          ok += 1
        } catch (_) {}
      }
      setStatusMsg(`Export complete: ${ok}/${total} file(s).`)
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
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={handleRegisterSelected}
          disabled={!!busyId}
        >
          Register Selected
        </button>
        <button
          style={{
            background: '#334155',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={handleTestSelected}
          disabled={!!busyId}
        >
          Test Selected
        </button>
        <button
          style={{
            background: 'var(--primary)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={handleHeartbeatSelected}
          disabled={!!busyId}
        >
          Heartbeat Selected
        </button>
        <button
          style={{
            background: '#0f1f3d',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            padding: '6px 10px',
            whiteSpace: 'nowrap',
            cursor: 'pointer',
            opacity: busyId ? 0.6 : 1
          }}
          onClick={handleExportSelected}
          disabled={!!busyId}
        >
          Export Selected
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
        renderRow={(row) => (
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
                  background: isOnline(row) ? 'rgba(16,185,129,0.15)' : 'rgba(148,163,184,0.18)',
                  color: isOnline(row) ? '#047857' : '#334155'
                }}
                title={row?.LastSeenAt ? `Last seen: ${formatDateTime(row.LastSeenAt)}` : 'No heartbeat yet'}
              >
                {isOnline(row) ? 'ONLINE' : 'OFFLINE'}
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
        )}
      />
    </>
  )
}
