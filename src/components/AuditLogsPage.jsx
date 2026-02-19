//AuditLogsPage.jsx
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

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function AuditLogsPage() {
  const [logs, setLogs] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [dateRange, setDateRange] = React.useState([null, null])

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

  const filtered = logs.filter(l => {
    const [start, end] = dateRange
    if (!start && !end) return true
    const t = l.CreatedAt ? new Date(l.CreatedAt) : null
    if (!t) return true
    if (start && t < new Date(start)) return false
    if (end) {
      const e = new Date(end)
      e.setHours(23,59,59,999)
      if (t > e) return false
    }
    return true
  })

  const chartData = React.useMemo(() => {
    const map = {}
    filtered.forEach(s => {
      const d = s.CreatedAt ? (new Date(s.CreatedAt)).toISOString().split('T')[0] : 'unknown'
      map[d] = (map[d] || 0) + 1
    })
    const keys = Object.keys(map).sort()
    return { labels: keys, datasets: [{ label: 'Events', data: keys.map(k => map[k]), backgroundColor: '#3f51b5' }] }
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

      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ flex: 1 }}>
          <GenericDataTable
            title="Audit Logs"
            columns={['Action', 'TableName', 'CreatedAt']}
            data={filtered}
            loading={loading}
            error={error}
            primaryKeyField="AuditLogID"
            readOnly={true}
            onAdd={() => {}}
            onEdit={() => {}}
            onDelete={() => {}}
            renderRow={(row) => (
              <>
                <TableCell>{row.Action}</TableCell>
                <TableCell>{row.TableName}</TableCell>
                <TableCell>{fmtDateTime(row.CreatedAt)}</TableCell>
              </>
            )}
          />
        </div>

        <div style={{ width: 360 }}>
          <h4>Events</h4>
          <Box>
            <Bar data={chartData} options={{ responsive: true, plugins: { legend: { display: false } } }} />
          </Box>
        </div>
      </div>
    </div>
  )
}

