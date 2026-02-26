//ScheduleDetailsPage.jsx
import React, { useState, useEffect } from 'react'
import {
  TableCell,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Slide,
  TextField,
  Alert,
  Box,
  Stack,
  Typography,
  MenuItem
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const defaultGroup = (index = 1) => ({
  label: `Pattern ${index}`,
  days: [],
  morningIn: '08:00',
  morningOut: '12:00',
  afternoonIn: '13:00',
  afternoonOut: '17:00'
})

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />
})

const toMinutes = (value) => {
  if (!value || typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return null
  const [h, m] = value.split(':').map(Number)
  return h * 60 + m
}

export default function ScheduleDetailsPage() {
  const [periods, setPeriods] = useState([])
  const [periodLoading, setPeriodLoading] = useState(true)
  const [periodError, setPeriodError] = useState(null)
  const [selectedPeriodId, setSelectedPeriodId] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [shiftName, setShiftName] = useState('')
  const [grace, setGrace] = useState(15)
  const [groups, setGroups] = useState([defaultGroup(1)])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [periodSort, setPeriodSort] = useState('name-asc')

  const selectedPeriodData = periods.find((p) => p.SchedulePeriodID === selectedPeriodId) || null

  useEffect(() => {
    loadPeriods()
  }, [])

  const loadPeriods = async () => {
    try {
      setPeriodLoading(true)
      const data = await api.fetchSchedulePeriods()
      setPeriods(Array.isArray(data) ? data : [])
      setPeriodError(null)
    } catch (err) {
      setPeriodError(err.message)
    } finally {
      setPeriodLoading(false)
    }
  }

  const resetForm = () => {
    setShiftName('')
    setGrace(15)
    setGroups([defaultGroup(1)])
    setError('')
    setSuccess('')
  }

  const updateGroup = (index, patch) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  const toggleDay = (groupIndex, day) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g
        const exists = g.days.includes(day)
        return { ...g, days: exists ? g.days.filter((d) => d !== day) : [...g.days, day] }
      })
    )
  }

  const addGroup = () => setGroups((prev) => [...prev, defaultGroup(prev.length + 1)])

  const removeGroup = (index) => {
    setGroups((prev) => {
      if (prev.length === 1) return prev
      const next = prev.filter((_, i) => i !== index)
      return next.map((g, i) => ({ ...g, label: g.label || `Pattern ${i + 1}` }))
    })
  }

  const validate = () => {
    if (!shiftName.trim()) return 'Shift name is required.'
    const seen = new Set()
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i]
      if (!g.days.length) return `Pattern ${i + 1}: select at least one day.`
      if (!g.morningIn || !g.morningOut || !g.afternoonIn || !g.afternoonOut) {
        return `Pattern ${i + 1}: all time fields are required.`
      }
      const morningInMin = toMinutes(g.morningIn)
      const morningOutMin = toMinutes(g.morningOut)
      const afternoonInMin = toMinutes(g.afternoonIn)
      const afternoonOutMin = toMinutes(g.afternoonOut)
      if (
        morningInMin == null ||
        morningOutMin == null ||
        afternoonInMin == null ||
        afternoonOutMin == null
      ) {
        return `Pattern ${i + 1}: invalid time format.`
      }
      if (morningInMin >= morningOutMin) {
        return `Pattern ${i + 1}: Morning out must be after morning in.`
      }
      if (afternoonInMin >= afternoonOutMin) {
        return `Pattern ${i + 1}: Afternoon out must be after afternoon in.`
      }
      if (afternoonInMin <= morningOutMin) {
        return `Pattern ${i + 1}: Afternoon must start after morning ends.`
      }
      for (const d of g.days) {
        if (seen.has(d)) return `Day "${d}" is repeated across patterns.`
        seen.add(d)
      }
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }
    try {
      setLoading(true)
      const graceValue = parseInt(grace, 10) || 0
      await api.createShiftDefinition({
        ShiftName: shiftName.trim(),
        GracePeriodMinutes: graceValue,
        Patterns: groups.map((g, i) => ({
          label: g.label?.trim() || `Pattern ${i + 1}`,
          days: g.days,
          morningIn: `${g.morningIn}:00`,
          morningOut: `${g.morningOut}:00`,
          afternoonIn: `${g.afternoonIn}:00`,
          afternoonOut: `${g.afternoonOut}:00`
        }))
      })
      setSuccess(`Created 1 schedule with ${groups.length} pattern(s).`)
      resetForm()
      setShowForm(false)
      loadPeriods()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
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
    const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
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

  const displayedPeriods = React.useMemo(() => {
    const arr = Array.isArray(periods) ? [...periods] : []
    arr.sort((a, b) => {
      const nameA = String(a?.PeriodName || '').toLowerCase()
      const nameB = String(b?.PeriodName || '').toLowerCase()
      if (periodSort === 'name-desc') return nameB.localeCompare(nameA)
      return nameA.localeCompare(nameB)
    })
    return arr
  }, [periods, periodSort])

  return (
    <div className="schedule-wrapper">
      <div className="schedule-card" style={{ marginBottom: 20 }}>
        <div className="schedule-header">
          <h2 className="schedule-title">Schedule Periods</h2>
          <Button
            variant="contained"
            size="small"
            onClick={() => {
              resetForm()
              setShowForm(true)
            }}
            sx={{
              background: 'var(--primary)',
              color: '#fff',
              textTransform: 'none',
              fontWeight: 700,
              borderRadius: 1.5,
              ':hover': { background: 'var(--primary-dark)' }
            }}
          >
            Add Schedule
          </Button>
        </div>

        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mb: 1.5 }}>
          <TextField
            select
            size="small"
            label="Sort"
            value={periodSort}
            onChange={(e) => setPeriodSort(e.target.value)}
            sx={{ width: 220 }}
          >
            <MenuItem value="name-asc">Name (A-Z)</MenuItem>
            <MenuItem value="name-desc">Name (Z-A)</MenuItem>
          </TextField>
        </Stack>

        <GenericDataTable
          title=""
          columns={['Period Name', 'Days']}
          data={displayedPeriods}
          loading={periodLoading}
          error={periodError}
          primaryKeyField="SchedulePeriodID"
          readOnly={true}
          allowDelete={false}
          allowAdd={false}
          allowEdit={false}
          onRowClick={(row) => setSelectedPeriodId(row.SchedulePeriodID)}
          renderRow={(row) => (
            <>
              <TableCell>{row.PeriodName}</TableCell>
              <TableCell>{formatDayList(row.DayList, row.DayNameList)}</TableCell>
            </>
          )}
        />
      </div>

      <Dialog
        open={showForm}
        onClose={() => setShowForm(false)}
        maxWidth="md"
        fullWidth
        TransitionComponent={Transition}
        PaperProps={{ className: 'schedule-dialog' }}
      >
        <DialogTitle>Create Shift</DialogTitle>
        <DialogContent dividers>
          <Box component="form" id="create-shift-form" onSubmit={handleSubmit}>
            <Stack spacing={1.5}>
              {error && <Alert severity="error">{error}</Alert>}
              {success && <Alert severity="success">{success}</Alert>}

              <TextField
                label="Shift Name"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="e.g. Office Schedule"
                size="small"
                fullWidth
              />

              <TextField
                type="number"
                label="Grace Period (minutes)"
                inputProps={{ min: 0 }}
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                size="small"
                fullWidth
              />

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>Day/Time Patterns</Typography>
                <Typography variant="body2" sx={{ color: 'var(--muted)' }}>
                  Define patterns of days with morning and afternoon times. Days cannot overlap between patterns.
                </Typography>
              </Box>

              {groups.map((group, idx) => (
                <Box
                  key={idx}
                  sx={{
                    p: 1.5,
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                    background: 'var(--surface)'
                  }}
                >
                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1 }}>
                    <TextField
                      label="Pattern Label"
                      value={group.label}
                      onChange={(e) => updateGroup(idx, { label: e.target.value })}
                      placeholder={`Pattern ${idx + 1}`}
                      size="small"
                      fullWidth
                    />
                    <Button
                      type="button"
                      variant="outlined"
                      color="error"
                      onClick={() => removeGroup(idx)}
                      disabled={groups.length === 1}
                    >
                      Remove
                    </Button>
                  </Stack>

                  <Typography variant="caption" sx={{ display: 'block', mb: 0.7, color: 'var(--muted)' }}>
                    Days
                  </Typography>
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap' }}>
                    {WEEK_DAYS.map((day) => (
                      <Button
                        type="button"
                        key={`${idx}-${day}`}
                        onClick={() => toggleDay(idx, day)}
                        size="small"
                        variant={group.days.includes(day) ? 'contained' : 'outlined'}
                        sx={{
                          minWidth: 52,
                          mb: 1,
                          ...(group.days.includes(day)
                            ? { background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }
                            : {})
                        }}
                      >
                        {day.slice(0, 3)}
                      </Button>
                    ))}
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                    <TextField
                      type="time"
                      label="Morning In"
                      value={group.morningIn}
                      onChange={(e) => updateGroup(idx, { morningIn: e.target.value })}
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <TextField
                      type="time"
                      label="Morning Out"
                      value={group.morningOut}
                      onChange={(e) => updateGroup(idx, { morningOut: e.target.value })}
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Stack>

                  <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ mt: 1 }}>
                    <TextField
                      type="time"
                      label="Afternoon In"
                      value={group.afternoonIn}
                      onChange={(e) => updateGroup(idx, { afternoonIn: e.target.value })}
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                    <TextField
                      type="time"
                      label="Afternoon Out"
                      value={group.afternoonOut}
                      onChange={(e) => updateGroup(idx, { afternoonOut: e.target.value })}
                      size="small"
                      InputLabelProps={{ shrink: true }}
                      fullWidth
                    />
                  </Stack>
                </Box>
              ))}

              <Button type="button" variant="outlined" onClick={addGroup}>
                + Add Day/Time Pattern
              </Button>
            </Stack>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button form="create-shift-form" type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creating...' : 'Create Shift Patterns'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!selectedPeriodId}
        onClose={() => setSelectedPeriodId(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: 'schedule-dialog' }}
      >
        <DialogTitle sx={{ color: 'var(--text)', fontWeight: 700 }}>Schedule Details</DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          {selectedPeriodData && (
            <div className="schedule-details-grid">
              <div><strong>Name:</strong> {selectedPeriodData.PeriodName}</div>
              <div><strong>Days:</strong> {formatDayList(selectedPeriodData.DayList, selectedPeriodData.DayNameList)}</div>
              <div><strong>Morning:</strong> {formatSqlTime(selectedPeriodData.MorningTimeIn)} - {formatSqlTime(selectedPeriodData.MorningTimeOut)}</div>
              <div><strong>Afternoon:</strong> {formatSqlTime(selectedPeriodData.AfternoonTimeIn)} - {formatSqlTime(selectedPeriodData.AfternoonTimeOut)}</div>
              <div><strong>Grace Period:</strong> {selectedPeriodData.GracePeriodMinutes ?? 5} minutes</div>
              {Array.isArray(selectedPeriodData.PatternDetails) && selectedPeriodData.PatternDetails.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Patterns:</strong>
                  <div className="schedule-pattern-grid">
                    {selectedPeriodData.PatternDetails.map((p, idx) => (
                      <div key={idx} className="schedule-pattern-card">
                        <div className="schedule-pattern-title">{p.PatternName || `Pattern ${idx + 1}`}</div>
                        <div className="schedule-pattern-subtle">Days: {p.DayNameList || formatDayList(p.DayList, '')}</div>
                        <div>Morning: {formatSqlTime(p.MorningTimeIn)} - {formatSqlTime(p.MorningTimeOut)}</div>
                        <div>Afternoon: {formatSqlTime(p.AfternoonTimeIn)} - {formatSqlTime(p.AfternoonTimeOut)}</div>
                        <div className="schedule-pattern-subtle">Grace: {p.GracePeriodMinutes ?? selectedPeriodData.GracePeriodMinutes ?? 5} minutes</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
        <DialogActions sx={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
          <Button
            onClick={() => setSelectedPeriodId(null)}
            variant="contained"
            sx={{
              background: 'var(--primary)',
              color: '#fff',
              fontWeight: 700,
              ':hover': { background: 'var(--primary-dark)' }
            }}
          >
            Close
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
