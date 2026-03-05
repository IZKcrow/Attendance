//ScheduleDetailsPage.jsx
import React, { useState, useEffect } from 'react'
import { TableCell, Dialog, DialogTitle, DialogContent, DialogActions, Button, Slide } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

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

export default function ScheduleDetailsPage() {
  const { show, SnackbarComponent } = useSnackbar()
  const [periods, setPeriods] = useState([])
  const [periodLoading, setPeriodLoading] = useState(true)
  const [periodError, setPeriodError] = useState(null)
  const [selectedPeriod, setSelectedPeriod] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [shiftName, setShiftName] = useState('')
  const [grace, setGrace] = useState(15)
  const [groups, setGroups] = useState([defaultGroup(1)])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [confirmDeletePeriod, setConfirmDeletePeriod] = useState(null)

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
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(11, 16)
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

  const getPeriodId = (row) => row?.SchedulePeriodID || row?.ShiftID || row?.PeriodID || row?.id || null

  const handleDeletePeriod = async (id) => {
    if (!id) {
      show('Delete failed: Missing schedule period ID.', 'error')
      return
    }
    const target = periods.find((p) => getPeriodId(p) === id)
    setConfirmDeletePeriod(target || { SchedulePeriodID: id, PeriodName: 'this schedule period' })
  }

  const confirmDelete = async () => {
    const id = getPeriodId(confirmDeletePeriod)
    if (!id) {
      show('Delete failed: Missing schedule period ID.', 'error')
      return
    }
    try {
      await api.deleteSchedulePeriod(id)
      setPeriods((prev) => prev.filter((p) => getPeriodId(p) !== id))
      if (getPeriodId(selectedPeriod) === id) setSelectedPeriod(null)
      setConfirmDeletePeriod(null)
      show('Schedule period deleted successfully.', 'success')
    } catch (err) {
      show(`Delete failed: ${err?.message || err}`, 'error')
    }
  }

  return (
    <div className="schedule-wrapper">
      {SnackbarComponent}
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

        <GenericDataTable
          title=""
          columns={['Period Name', 'Days']}
          data={periods}
          loading={periodLoading}
          error={periodError}
          primaryKeyField="SchedulePeriodID"
          readOnly={true}
          allowDelete={true}
          allowAdd={false}
          allowEdit={false}
          useDeleteDialog={false}
          onDelete={handleDeletePeriod}
          onRowClick={(row) => setSelectedPeriod(row)}
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
          <form id="create-shift-form" onSubmit={handleSubmit}>
            {error && <div className="schedule-alert schedule-alert-error">{error}</div>}
            {success && <div className="schedule-alert schedule-alert-success">{success}</div>}

            <div className="schedule-field">
              <label className="schedule-label">Shift Name</label>
              <input
                type="text"
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                className="schedule-input"
                placeholder="e.g. Office Schedule"
              />
            </div>

            <div className="schedule-field">
              <label className="schedule-label">Grace Period (minutes)</label>
              <input
                type="number"
                min="0"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
                className="schedule-input"
              />
            </div>

            <div className="schedule-section">
              <h4 className="schedule-section-title">Day/Time Patterns</h4>
              <p className="schedule-helper">Define patterns of days with morning/afternoon times. Days cannot overlap between patterns.</p>
            </div>

            {groups.map((group, idx) => (
              <div key={idx} className="schedule-group-card">
                <div className="schedule-group-header">
                  <input
                    type="text"
                    value={group.label}
                    onChange={(e) => updateGroup(idx, { label: e.target.value })}
                    className="schedule-group-label"
                    placeholder={`Pattern ${idx + 1}`}
                  />
                  <button
                    type="button"
                    className="schedule-remove-btn"
                    onClick={() => removeGroup(idx)}
                    disabled={groups.length === 1}
                  >
                    Remove
                  </button>
                </div>

                <div className="schedule-field">
                  <label className="schedule-label">Days</label>
                  <div className="schedule-days">
                    {WEEK_DAYS.map((day) => (
                      <button
                        type="button"
                        key={`${idx}-${day}`}
                        onClick={() => toggleDay(idx, day)}
                        className={`schedule-day-btn${group.days.includes(day) ? ' active' : ''}`}
                      >
                        {day.slice(0, 3)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="schedule-section">
                  <h4 className="schedule-section-title">Morning Shift</h4>
                  <div className="schedule-row">
                    <div className="schedule-field schedule-field-half">
                      <label className="schedule-label">Time In</label>
                      <input
                        type="time"
                        value={group.morningIn}
                        onChange={(e) => updateGroup(idx, { morningIn: e.target.value })}
                        className="schedule-input"
                      />
                    </div>
                    <div className="schedule-field schedule-field-half">
                      <label className="schedule-label">Time Out</label>
                      <input
                        type="time"
                        value={group.morningOut}
                        onChange={(e) => updateGroup(idx, { morningOut: e.target.value })}
                        className="schedule-input"
                      />
                    </div>
                  </div>
                </div>

                <div className="schedule-section">
                  <h4 className="schedule-section-title">Afternoon Shift</h4>
                  <div className="schedule-row">
                    <div className="schedule-field schedule-field-half">
                      <label className="schedule-label">Time In</label>
                      <input
                        type="time"
                        value={group.afternoonIn}
                        onChange={(e) => updateGroup(idx, { afternoonIn: e.target.value })}
                        className="schedule-input"
                      />
                    </div>
                    <div className="schedule-field schedule-field-half">
                      <label className="schedule-label">Time Out</label>
                      <input
                        type="time"
                        value={group.afternoonOut}
                        onChange={(e) => updateGroup(idx, { afternoonOut: e.target.value })}
                        className="schedule-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            <button type="button" className="schedule-secondary-btn" onClick={addGroup}>
              + Add Day/Time Pattern
            </button>
          </form>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowForm(false)}>Cancel</Button>
          <Button form="create-shift-form" type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creating...' : 'Create Shift Patterns'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={!!selectedPeriod}
        onClose={() => setSelectedPeriod(null)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ className: 'schedule-dialog' }}
      >
        <DialogTitle sx={{ color: 'var(--text)', fontWeight: 700 }}>Schedule Details</DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          {selectedPeriod && (
            <div className="schedule-details-grid">
              <div><strong>Name:</strong> {selectedPeriod.PeriodName}</div>
              <div><strong>Days:</strong> {formatDayList(selectedPeriod.DayList, selectedPeriod.DayNameList)}</div>
              <div><strong>Morning:</strong> {formatSqlTime(selectedPeriod.MorningTimeIn)} - {formatSqlTime(selectedPeriod.MorningTimeOut)}</div>
              <div><strong>Afternoon:</strong> {formatSqlTime(selectedPeriod.AfternoonTimeIn)} - {formatSqlTime(selectedPeriod.AfternoonTimeOut)}</div>
              <div><strong>Grace Period:</strong> {selectedPeriod.GracePeriodMinutes ?? 5} minutes</div>
              {Array.isArray(selectedPeriod.PatternDetails) && selectedPeriod.PatternDetails.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  <strong style={{ color: 'var(--text)' }}>Patterns:</strong>
                  <div className="schedule-pattern-grid">
                    {selectedPeriod.PatternDetails.map((p, idx) => (
                      <div key={idx} className="schedule-pattern-card">
                        <div className="schedule-pattern-title">{p.PatternName || `Pattern ${idx + 1}`}</div>
                        <div className="schedule-pattern-subtle">Days: {p.DayNameList || formatDayList(p.DayList, '')}</div>
                        <div>Morning: {formatSqlTime(p.MorningTimeIn)} - {formatSqlTime(p.MorningTimeOut)}</div>
                        <div>Afternoon: {formatSqlTime(p.AfternoonTimeIn)} - {formatSqlTime(p.AfternoonTimeOut)}</div>
                        <div className="schedule-pattern-subtle">Grace: {p.GracePeriodMinutes ?? selectedPeriod.GracePeriodMinutes ?? 5} minutes</div>
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
            onClick={() => setSelectedPeriod(null)}
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

      <Dialog
        open={!!confirmDeletePeriod}
        onClose={() => setConfirmDeletePeriod(null)}
        maxWidth="xs"
        fullWidth
        PaperProps={{ className: 'schedule-dialog' }}
      >
        <DialogTitle sx={{ color: 'var(--text)', fontWeight: 700 }}>Confirm Deletion</DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          Delete <strong>{confirmDeletePeriod?.PeriodName || 'this schedule period'}</strong>? This action cannot be undone.
        </DialogContent>
        <DialogActions sx={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => setConfirmDeletePeriod(null)}>Cancel</Button>
          <Button
            variant="contained"
            color="error"
            onClick={confirmDelete}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
