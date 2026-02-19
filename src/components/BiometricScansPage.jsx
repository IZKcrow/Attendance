//BiometricScansPage.jsx
import React from 'react'
import { TableCell, Box } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { Bar } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import LocalizationProvider from '@mui/lab/LocalizationProvider'
import DateRangePicker from '@mui/lab/DateRangePicker'
import AdapterDateFns from '@mui/lab/AdapterDateFns'

function fmtDate(value) {
  if (!value) return '-'
  if (typeof value === 'string') {
    const isoMatch = value.match(/^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/)
    if (isoMatch) return isoMatch[1] // keep server-provided date, no TZ shift
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  }
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toISOString().slice(0, 10)
}

function fmtTime(value) {
  if (!value) return '-'
  if (typeof value === 'string') {
    const isoMatch = value.match(/^[^T]*T?(\d{2}:\d{2})(?::\d{2})?/)
    if (isoMatch) return isoMatch[1] // use server time portion as-is
    if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
  }
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}

function fmtDateTime(value) {
  if (!value) return '-'
  const date = fmtDate(value)
  const time = fmtTime(value)
  if (date === '-' && time === '-') return '-'
  if (date === '-') return time
  if (time === '-') return date
  return `${date} ${time}`
}

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function BiometricScansPage() {
  const [scans, setScans] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [dateRange, setDateRange] = React.useState([null, null])

  React.useEffect(() => {
    loadScans()
    // auto-refresh every 5 seconds for live feed
    const iv = setInterval(() => { loadScans() }, 5000)
    return () => clearInterval(iv)
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

  const filtered = scans.filter(s => {
    const [start, end] = dateRange
    if (!start && !end) return true
    const t = s.ScanTime ? new Date(s.ScanTime) : null
    if (!t) return true
    if (start && t < new Date(start)) return false
    if (end) {
      const e = new Date(end)
      e.setHours(23,59,59,999)
      if (t > e) return false
    }
    return true
  })

  // counts per day chart data
  const chartData = React.useMemo(() => {
    const map = {}
    filtered.forEach(s => {
      const d = s.ScanTime ? (new Date(s.ScanTime)).toISOString().split('T')[0] : 'unknown'
      map[d] = (map[d] || 0) + 1
    })
    const keys = Object.keys(map).sort()
    return {
      labels: keys,
      datasets: [{ label: 'Scans', data: keys.map(k => map[k]), backgroundColor: '#3f51b5' }]
    }
  }, [filtered])

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginBottom: 8 }}>
        <LocalizationProvider dateAdapter={AdapterDateFns}>
          <DateRangePicker
            startText="From"
            endText="To"
            value={dateRange}
            onChange={(newValue) => { setDateRange(newValue) }}
            renderInput={(startProps, endProps) => (
              <>
                <input {...startProps.inputProps} type="date" value={startProps.inputProps.value || ''} onChange={(e)=>{
                  const s = e.target.value ? new Date(e.target.value) : null
                  setDateRange([s, dateRange[1]])
                }} />
                <span style={{ margin: '0 8px' }}>—</span>
                <input {...endProps.inputProps} type="date" value={endProps.inputProps.value || ''} onChange={(e)=>{
                  const d = e.target.value ? new Date(e.target.value) : null
                  setDateRange([dateRange[0], d])
                }} />
              </>
            )}
          />
        </LocalizationProvider>
        <button onClick={()=>{ setDateRange([null, null]); }}>Clear</button>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <GenericDataTable
            title="🔍 Live Biometric Feed"
            columns={['EmployeeID', 'ScanTime', 'ScanType', 'AuthenticationMethod', 'IsSuccessful', 'Location']}
            data={filtered}
            loading={loading}
            error={error}
            primaryKeyField="BiometricScanID"
            readOnly={true}
            onAdd={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            renderRow={(row) => (
              <>
                <TableCell>{row.EmployeeID}</TableCell>
                <TableCell>{fmtDateTime(row.ScanTime)}</TableCell>
                <TableCell>{row.ScanType}</TableCell>
                <TableCell>{row.AuthenticationMethod}</TableCell>
                <TableCell>{row.IsSuccessful ? 'Yes' : 'No'}</TableCell>
                <TableCell>{row.Latitude && row.Longitude ? `${row.Latitude}, ${row.Longitude}` : ''}</TableCell>
              </>
            )}
          />
        </div>

        <div style={{ width: 360 }}>
          <h4>Scan counts</h4>
          <Box>
            <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
          </Box>
        </div>
      </div>
    </div>
  )
}
