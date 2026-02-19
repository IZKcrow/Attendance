//SchedulePeriodsPage.jsx
import React from 'react'
import { TableCell, Dialog, DialogTitle, DialogContent, DialogActions, Button } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function SchedulePeriodsPage() {
  const [periods, setPeriods] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [selectedPeriod, setSelectedPeriod] = React.useState(null)

  const cardSx = {
    border: '1px solid #d6deed',
    borderRadius: 10,
    padding: 12,
    background: '#f9fbff',
    boxShadow: '0 6px 16px rgba(15,31,61,0.08)'
  }

  React.useEffect(() => {
    loadPeriods()
  }, [])

  const loadPeriods = async () => {
    try {
      setLoading(true)
      const data = await api.fetchSchedulePeriods()
      setPeriods(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createSchedulePeriod(form)
      setPeriods([...periods, result])
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateSchedulePeriod(form.SchedulePeriodID, form)
      setPeriods(periods.map(p => p.SchedulePeriodID === form.SchedulePeriodID ? result : p))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteSchedulePeriod(id)
      setPeriods(periods.filter(p => p.SchedulePeriodID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const formatSqlTime = (value) => {
    if (!value) return 'Not set'
    if (typeof value === 'string') {
      if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      return value
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const formatDayList = (value, dayNames) => {
    if (dayNames) {
      return String(dayNames)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join('-')
    }
    if (!value) return '-'
    const dayMap = {
      1: 'Mon',
      2: 'Tue',
      3: 'Wed',
      4: 'Thu',
      5: 'Fri',
      6: 'Sat',
      7: 'Sun'
    }
    const tokens = String(value)
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean)
    const mapped = tokens.map((t) => {
      const n = Number(t)
      if (!Number.isNaN(n) && dayMap[n]) return dayMap[n]
      const lowered = t.toLowerCase()
      if (lowered.startsWith('mon')) return 'Mon'
      if (lowered.startsWith('tue')) return 'Tue'
      if (lowered.startsWith('wed')) return 'Wed'
      if (lowered.startsWith('thu')) return 'Thu'
      if (lowered.startsWith('fri')) return 'Fri'
      if (lowered.startsWith('sat')) return 'Sat'
      if (lowered.startsWith('sun')) return 'Sun'
      return t
    })
    return Array.from(new Set(mapped)).join('-')
  }

  return (
    <>
      <GenericDataTable
        title="Schedule Periods"
        columns={['PeriodName', 'DayList']}
        data={periods}
        loading={loading}
        error={error}
        primaryKeyField="SchedulePeriodID"
        readOnly={true}
        allowDelete={true}
        allowAdd={false}
        allowEdit={false}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onRowClick={(row) => setSelectedPeriod(row)}
        renderRow={(row) => (
          <>
            <TableCell>{row.PeriodName}</TableCell>
            <TableCell>{formatDayList(row.DayList, row.DayNameList)}</TableCell>
          </>
        )}
      />

      <Dialog
        open={!!selectedPeriod}
        onClose={() => setSelectedPeriod(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { background: '#e7ecf5', borderRadius: 14, border: '1px solid #c8d5ec' }
        }}
      >
        <DialogTitle sx={{ color: '#0f1f3d', fontWeight: 700 }}>Schedule Details</DialogTitle>
        <DialogContent dividers sx={{ borderColor: '#c8d5ec', background: '#f4f7ff' }}>
          {selectedPeriod && (
            <div style={{ display: 'grid', gap: 12, color: '#0b1021' }}>
              <div><strong>Name:</strong> {selectedPeriod.PeriodName}</div>
              <div><strong>Days:</strong> {formatDayList(selectedPeriod.DayList, selectedPeriod.DayNameList)}</div>
              <div><strong>Morning:</strong> {formatSqlTime(selectedPeriod.MorningTimeIn)} - {formatSqlTime(selectedPeriod.MorningTimeOut)}</div>
              <div><strong>Afternoon:</strong> {formatSqlTime(selectedPeriod.AfternoonTimeIn)} - {formatSqlTime(selectedPeriod.AfternoonTimeOut)}</div>
              <div><strong>Grace Period:</strong> {selectedPeriod.GracePeriodMinutes ?? 5} minutes</div>
              {Array.isArray(selectedPeriod.PatternDetails) && selectedPeriod.PatternDetails.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ color: '#0f1f3d' }}>Patterns:</strong>
                  <div style={{ marginTop: 10, display: 'grid', gap: 10 }}>
                    {selectedPeriod.PatternDetails.map((p, idx) => (
                      <div key={idx} style={{ ...cardSx, borderColor: '#3cc4bf40' }}>
                        <div style={{ color: '#0f1f3d', fontWeight: 700 }}>{p.PatternName || `Pattern ${idx + 1}`}</div>
                        <div style={{ color: '#4a5672' }}>Days: {p.DayNameList || formatDayList(p.DayList, '')}</div>
                        <div>Morning: {formatSqlTime(p.MorningTimeIn)} - {formatSqlTime(p.MorningTimeOut)}</div>
                        <div>Afternoon: {formatSqlTime(p.AfternoonTimeIn)} - {formatSqlTime(p.AfternoonTimeOut)}</div>
                        <div style={{ color: '#4a5672' }}>Grace: {p.GracePeriodMinutes ?? selectedPeriod.GracePeriodMinutes ?? 5} minutes</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ background: '#e7ecf5', borderTop: '1px solid #c8d5ec' }}>
          <Button
            onClick={() => setSelectedPeriod(null)}
            variant="contained"
            sx={{
              background: '#3cc4bf',
              color: '#0b1021',
              fontWeight: 700,
              ':hover': { background: '#35b3af' }
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
