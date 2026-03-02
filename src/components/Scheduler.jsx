import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  TextField,
  Button,
  Paper,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem
} from '@mui/material'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

export default function Scheduler() {
  const { show, SnackbarComponent } = useSnackbar()
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [selectedShiftID, setSelectedShiftID] = useState('')
  const [selectedEmployeeIDs, setSelectedEmployeeIDs] = useState([])
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [effectiveTo, setEffectiveTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [forceAssign, setForceAssign] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [removeMode, setRemoveMode] = useState('shift') // 'shift' | 'all'
  const [assignments, setAssignments] = useState([])
  const assignmentsTimer = React.useRef(null)

  const normalizeSelected = React.useCallback((ids = []) => [...new Set(ids.filter(Boolean))], [])

  useEffect(() => {
    let mounted = true
    Promise.all([api.fetchEmployees(), api.fetchShiftDefinitions()])
      .then(([empData, shiftData]) => {
        if (!mounted) return
        setEmployees(Array.isArray(empData) ? empData : [])
        setShifts(Array.isArray(shiftData) ? shiftData : [])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  const selectedShift = useMemo(
    () => shifts.find((s) => String(s.ShiftID) === String(selectedShiftID)),
    [shifts, selectedShiftID]
  )

  // Load current assignments for selected employees to show visibility and detect conflicts
  useEffect(() => {
    if (assignmentsTimer.current) clearTimeout(assignmentsTimer.current)
    if (!selectedEmployeeIDs.length) {
      setAssignments([])
      return
    }
    const ids = normalizeSelected(selectedEmployeeIDs)
    if (!ids.length) {
      setAssignments([])
      return
    }
    assignmentsTimer.current = setTimeout(async () => {
      try {
        const existing = await api.fetchEmployeeAssignments({ employeeIDs: ids })
        setAssignments(Array.isArray(existing) ? existing : [])
      } catch (_) {
        setAssignments([])
      }
    }, 350)
    return () => {
      if (assignmentsTimer.current) clearTimeout(assignmentsTimer.current)
    }
  }, [selectedEmployeeIDs])

  const employeeMap = useMemo(() => {
    const map = {}
    employees.forEach(e => { map[e.id] = e })
    return map
  }, [employees])

  const fmtDate = (value) => {
    if (!value) return '-'
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toISOString().slice(0, 10)
  }

  const fmtTime = (value) => {
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

  const fmtDays = (shift) => {
    if (shift?.DayNameList) {
      return String(shift.DayNameList)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join('-')
    }
    return shift?.DayList || '-'
  }

  const isDateRangeValid = !effectiveTo || new Date(effectiveTo) >= new Date(effectiveFrom)
  const canSubmit = selectedShiftID && selectedEmployeeIDs.length > 0 && isDateRangeValid
  const canRemove = selectedEmployeeIDs.length > 0

  const handleAssign = async () => {
    if (!canSubmit) return
    // Pre-flight: warn if selected employees already have an active shift
    if (!forceAssign) {
      try {
        const existing = await api.fetchEmployeeAssignments({ employeeIDs: selectedEmployeeIDs })
        const conflictsFound = existing || []
        const uniqueConflicts = Array.isArray(conflictsFound)
          ? Array.from(new Map(conflictsFound.map(c => [c.EmployeeID, c])).values())
          : []
        if (uniqueConflicts.length > 0) {
          setConflicts(uniqueConflicts)
          setShowConflictDialog(true)
          return
        }
      } catch (_) {
        // if preflight fails, continue with main flow but surface a toast
        show('Could not check existing assignments; proceeding anyway.', 'warning')
      }
    }
    setForceAssign(false)
    setSaving(true)
    try {
      await api.assignShiftToEmployees({
        shiftID: selectedShiftID,
        employeeIDs: selectedEmployeeIDs,
        assignAll: false,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null
      })
      show('Shift assignment saved successfully.', 'success')
      setSelectedEmployeeIDs([])
    } catch (err) {
      show('Assignment failed: ' + (err.message || err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (mode = 'shift') => {
    if (!canRemove) return
    const endDate = effectiveTo || new Date().toISOString().split('T')[0]
    setSaving(true)
    try {
      await api.removeShiftAssignments({
        shiftID: mode === 'shift' ? selectedShiftID : null,
        employeeIDs: selectedEmployeeIDs,
        effectiveTo: endDate,
        mode: 'end'
      })
      show(`Assignments ended as of ${endDate}.`, 'info')
      setSelectedEmployeeIDs([])
    } catch (err) {
      const raw = String(err?.message || err || '')
      const cleaned = raw.split(';')[0].replace(/Remove assignments failed\.\s*/i, '') || 'Remove failed'
      show(`Remove failed: ${cleaned}`, 'error')
    } finally {
      setSaving(false)
    }
  }
  const handleRemoveClick = () => {
    if (!canRemove) return
    setRemoveMode('shift')
    setShowRemoveDialog(true)
  }

  if (loading) return <div>Loading scheduler...</div>

  return (
    <Box>
      {SnackbarComponent}
      <Typography variant="h5" gutterBottom>Shift Assignment</Typography>
      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        Create Shift defines the schedule template. This page assigns that existing shift to one, many, or all employees.
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          {selectedEmployeeIDs.length === 0 ? (
            <Paper variant="outlined" sx={{ p: 2, borderColor: 'var(--border)', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Selected Employees</Typography>
              <Typography variant="body2" color="text.secondary">Select employees to see current shifts.</Typography>
            </Paper>
          ) : (
            <Paper variant="outlined" sx={{ p: 2, borderColor: 'var(--border)', mb: 2 }}>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>Selected Employees & Current Shifts</Typography>
              <Grid container spacing={1}>
              <Grid item xs={4}><Typography variant="caption" color="text.secondary">Employee</Typography></Grid>
              <Grid item xs={4}><Typography variant="caption" color="text.secondary">Current Shift</Typography></Grid>
              <Grid item xs={4}><Typography variant="caption" color="text.secondary">Effective</Typography></Grid>
              {selectedEmployeeIDs.map((id) => {
                const emp = employeeMap[id]
                const current = assignments.find(a => a.EmployeeID === id)
                return (
                  <React.Fragment key={id}>
                    <Grid item xs={4}><Typography variant="body2">{emp?.name || emp?.EmployeeCode || id}</Typography></Grid>
                    <Grid item xs={4}><Typography variant="body2">{current?.ShiftName || current?.ShiftID || 'None'}</Typography></Grid>
                    <Grid item xs={4}><Typography variant="body2">{current?.EffectiveFrom ? `${fmtDate(current.EffectiveFrom)} → ${current.EffectiveTo ? fmtDate(current.EffectiveTo) : 'open'}` : '—'}</Typography></Grid>
                  </React.Fragment>
                )
              })}
            </Grid>
          </Paper>
          )}
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, borderColor: 'var(--border)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Shift Selection</Typography>
            <FormControl fullWidth>
              <InputLabel id="shift-label">Shift</InputLabel>
              <Select
                labelId="shift-label"
                value={selectedShiftID}
                label="Shift"
                onChange={(e) => setSelectedShiftID(String(e.target.value))}
                disabled={loading}
              >
                {shifts.map((s) => (
                  <MenuItem key={s.ShiftID} value={s.ShiftID}>
                    {s.ShiftName}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            {shifts.length === 0 && (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                No shifts defined yet.
              </Typography>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper variant="outlined" sx={{ p: 2, borderColor: 'var(--border)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Employees</Typography>
            <Autocomplete
              multiple
              options={employees}
              getOptionLabel={(emp) => `${emp.EmployeeCode || ''} ${emp.name || ''}`.trim() || 'Unnamed'}
              value={employees.filter(e => selectedEmployeeIDs.includes(e.id))}
              onChange={(_, vals) => setSelectedEmployeeIDs(normalizeSelected(vals.map(v => v.id)))}
              renderInput={(params) => <TextField {...params} label="Search employees" />}
              disableCloseOnSelect
              sx={{ mb: 1 }}
            />
            <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
              <Button
                size="small"
                variant="outlined"
                sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
                onClick={() => setSelectedEmployeeIDs(normalizeSelected(employees.map((e) => e.id)))}
              >
                Select All Employees
              </Button>
              <Button
                size="small"
                variant="outlined"
                sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
                onClick={() => setSelectedEmployeeIDs([])}
              >
                Clear
              </Button>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12}>
          <Paper variant="outlined" sx={{ p: 2, borderColor: 'var(--border)' }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Effective Period</Typography>
            <Grid container spacing={2}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="Effective From"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="date"
                  label="Effective To (optional)"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  error={!isDateRangeValid}
                  helperText={!isDateRangeValid ? 'Effective To cannot be before Effective From' : ''}
                />
              </Grid>
            </Grid>
          </Paper>
        </Grid>
      </Grid>

      {selectedShift && (
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Selected Shift Preview
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip label={`Name: ${selectedShift.ShiftName}`} />
            <Chip label={`AM: ${fmtTime(selectedShift.MorningTimeIn)} - ${fmtTime(selectedShift.MorningTimeOut)}`} />
            <Chip label={`PM: ${fmtTime(selectedShift.AfternoonTimeIn)} - ${fmtTime(selectedShift.AfternoonTimeOut)}`} />
            <Chip label={`Grace: ${selectedShift.GracePeriodMinutes || 0} min`} />
            <Chip label={`Days: ${fmtDays(selectedShift)}`} />
          </Box>
        </Paper>
      )}

      <Box sx={{ mt: 3, display: 'flex', gap: 1 }}>
        <Button
          variant="contained"
          disabled={!canSubmit || saving}
          onClick={handleAssign}
          sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }}
        >
          {saving ? 'Assigning...' : 'Assign Shift'}
        </Button>
        <Button
          variant="outlined"
          color="error"
          disabled={!canRemove || !selectedShiftID || saving}
          onClick={() => { setRemoveMode('shift'); setShowRemoveDialog(true) }}
        >
          {saving ? 'Removing...' : 'End Selected Shift'}
        </Button>
        <Button
          variant="outlined"
          color="error"
          disabled={!canRemove || saving}
          onClick={() => { setRemoveMode('all'); setShowRemoveDialog(true) }}
        >
          {saving ? 'Removing...' : 'End All Shifts'}
        </Button>
      </Box>
      {!selectedShiftID && (
        <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
          If no shift is selected, ALL shifts for selected employees will be ended.
        </Typography>
      )}

      <Dialog open={showConflictDialog} onClose={() => setShowConflictDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Employees Already Assigned</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following employee(s) already have a shift. Do you want to override and assign the new shift?
          </Typography>
          <List dense>
            {conflicts.map((c, idx) => (
              <ListItem key={`${c.EmployeeID}-${idx}`} sx={{ py: 0.3 }}>
                {employeeMap[c.EmployeeID]?.name || c.EmployeeID}
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setShowConflictDialog(false); setForceAssign(false) }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setShowConflictDialog(false)
              setForceAssign(true)
              handleAssign()
            }}
          >
            Override & Assign
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showRemoveDialog} onClose={() => setShowRemoveDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Confirm Removal</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {removeMode === 'shift'
              ? `End selected shift for ${selectedEmployeeIDs.length} employee(s) as of ${effectiveTo || 'today'}?`
              : `End ALL shifts for ${selectedEmployeeIDs.length} employee(s) as of ${effectiveTo || 'today'}?`}
          </Typography>
          <List dense>
            {selectedEmployeeIDs.slice(0, 5).map((id) => (
              <ListItem key={id} sx={{ py: 0.3 }}>
                {employeeMap[id]?.name || id}
              </ListItem>
            ))}
            {selectedEmployeeIDs.length > 5 && (
              <ListItem sx={{ py: 0.3, color: 'text.secondary' }}>
                …and {selectedEmployeeIDs.length - 5} more
              </ListItem>
            )}
          </List>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowRemoveDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setShowRemoveDialog(false)
              handleRemove(removeMode)
            }}
          >
            End Assignment
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
