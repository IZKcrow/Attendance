//DevicesPage.jsx
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

  React.useEffect(() => {
    loadDevices()
  }, [])

  const loadDevices = async () => {
    try {
      setLoading(true)
      const data = await api.fetchDevices()
      setDevices(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createDevice({
        deviceCode: form.DeviceCode,
        deviceName: form.DeviceName,
        deviceType: form.DeviceType,
        serialNumber: form.SerialNumber,
        isActive: form.IsActive ?? true,
        registeredBy: form.RegisteredBy
      })
      setDevices([...devices, result])
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
        registeredBy: 'UI_DEVICES'
      })
      setStatusMsg(`Registered ${device.DeviceCode} @ ${new Date().toLocaleTimeString()}`)
      loadDevices()
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
      loadDevices()
    } catch (err) {
      setStatusMsg(`Heartbeat failed: ${err.message || err}`)
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {statusMsg && <div style={{ marginBottom: 8, color: '#0f1f3d', fontWeight: 600 }}>{statusMsg}</div>}
      <GenericDataTable
        title="Devices"
        columns={['DeviceCode', 'DeviceName', 'DeviceType', 'SerialNumber', 'RegisteredAt', 'LastSeenAt', 'IsActive', 'Actions']}
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
            <TableCell>{row.DeviceCode}</TableCell>
            <TableCell>{row.DeviceName}</TableCell>
            <TableCell>{row.DeviceType}</TableCell>
            <TableCell>{row.SerialNumber}</TableCell>
            <TableCell>{row.RegisteredAt || ''}</TableCell>
            <TableCell>{row.LastSeenAt || ''}</TableCell>
            <TableCell>{row.IsActive ? 'Yes' : 'No'}</TableCell>
            <TableCell>
              <button onClick={() => registerConnection(row)} disabled={busyId === (row.DeviceID || row.DeviceCode)}>Register</button>{' '}
              <button onClick={() => sendHeartbeat(row)} disabled={busyId === (row.DeviceID || row.DeviceCode)}>Heartbeat</button>
            </TableCell>
          </>
        )}
      />
    </>
  )
}
