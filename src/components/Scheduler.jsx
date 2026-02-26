import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  ListItemText,
  OutlinedInput,
  TextField,
  Button,
  Paper,
  Chip,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material'
import * as api from '../api'

function toLocalDateInputValue(d = new Date()) {
  const x = new Date(d)
  const year = x.getFullYear()
  const month = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export default function Scheduler() {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [selectedShiftID, setSelectedShiftID] = useState('')
  const [selectedEmployeeIDs, setSelectedEmployeeIDs] = useState([])
  const [assignAll, setAssignAll] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState(() => toLocalDateInputValue(new Date()))
  const [effectiveTo, setEffectiveTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [snack, setSnack] = useState({ open: false, message: '', severity: 'info' })
  const [reassignDialog, setReassignDialog] = useState({ open: false, rows: [], payload: null })

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
    () => shifts.find((s) => s.ShiftID === selectedShiftID),
    [shifts, selectedShiftID]
  )

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

  const dateRangeError = effectiveTo && effectiveFrom && effectiveTo < effectiveFrom
    ? 'Effective To must be on or after Effective From.'
    : ''
  const canSubmit = selectedShiftID && (assignAll || selectedEmployeeIDs.length > 0) && !dateRangeError

  const showSnack = (message, severity = 'info') => {
    setSnack({ open: true, message, severity })
  }

  const performAssign = async (payload) => {
    setSaving(true)
    try {
      await api.assignShiftToEmployees(payload)
      showSnack('Shift assignment saved successfully.', 'success')
      if (!payload.assignAll) setSelectedEmployeeIDs([])
    } catch (err) {
      showSnack('Assignment failed: ' + (err.message || err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleAssign = async () => {
    if (!canSubmit) return
    const payload = {
      shiftID: selectedShiftID,
      employeeIDs: assignAll ? [] : selectedEmployeeIDs,
      assignAll,
      effectiveFrom: effectiveFrom || null,
      effectiveTo: effectiveTo || null
    }

    const targetEmployees = assignAll
      ? employees
      : employees.filter((emp) => selectedEmployeeIDs.includes(emp.id))
    const nextShiftName = (selectedShift?.ShiftName || '').trim().toLowerCase()
    const alreadyAssigned = targetEmployees.filter((emp) => {
      const current = String(emp?.assignedShift || '').trim()
      if (!current) return false
      return current.toLowerCase() !== nextShiftName
    })

    if (alreadyAssigned.length > 0) {
      setReassignDialog({
        open: true,
        rows: alreadyAssigned,
        payload
      })
      return
    }

    await performAssign(payload)
  }

  if (loading) return <div>Loading scheduler...</div>

  return (
    <Box>
      <Typography variant="h5" gutterBottom>Shift Assignment</Typography>
      <Typography variant="body2" sx={{ mb: 3, color: 'text.secondary' }}>
        Create Shift defines the schedule template. This page assigns that existing shift to one, many, or all employees.
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel id="shift-label">Shift</InputLabel>
            <Select
              labelId="shift-label"
              value={selectedShiftID}
              label="Shift"
              onChange={(e) => setSelectedShiftID(e.target.value)}
            >
              {shifts.map((s) => (
                <MenuItem key={s.ShiftID} value={s.ShiftID}>
                  {s.ShiftName}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>

        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel id="employees-label">Employees</InputLabel>
            <Select
              labelId="employees-label"
              multiple
              value={selectedEmployeeIDs}
              input={<OutlinedInput label="Employees" />}
              onChange={(e) => setSelectedEmployeeIDs(typeof e.target.value === 'string' ? e.target.value.split(',') : e.target.value)}
              disabled={assignAll}
              renderValue={(selected) => `${selected.length} selected`}
            >
              {employees.map((emp) => (
                <MenuItem key={emp.id} value={emp.id}>
                  <Checkbox checked={selectedEmployeeIDs.indexOf(emp.id) > -1} />
                  <ListItemText primary={`${emp.EmployeeCode || ''} - ${emp.name || ''}`} />
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
            <Button
              size="small"
              variant="outlined"
              sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
              onClick={() => setSelectedEmployeeIDs(employees.map((e) => e.id))}
              disabled={assignAll}
            >
              Select All Employees
            </Button>
            <Button
              size="small"
              variant="outlined"
              sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
              onClick={() => setSelectedEmployeeIDs([])}
              disabled={assignAll}
            >
              Clear
            </Button>
            <Button
              size="small"
              variant={assignAll ? 'contained' : 'outlined'}
              sx={assignAll
                ? { background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }
                : { color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
              onClick={() => setAssignAll((prev) => !prev)}
            >
              {assignAll ? 'Assigning To All' : 'Assign To All'}
            </Button>
          </Box>
        </Grid>

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
            error={Boolean(dateRangeError)}
            helperText={dateRangeError || ' '}
            InputLabelProps={{ shrink: true }}
          />
        </Grid>
      </Grid>

      {selectedShift && (
        <Paper sx={{ p: 2, mt: 3 }}>
          <Typography variant="subtitle1" sx={{ mb: 1 }}>
            Selected Shift Preview
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            <Chip label={`Name: ${selectedShift.ShiftName}`} />
            <Chip label={`Grace: ${selectedShift.GracePeriodMinutes || 0} min`} />
            {Array.isArray(selectedShift.PatternDetails) && selectedShift.PatternDetails.length > 0 ? (
              selectedShift.PatternDetails.map((p, idx) => (
                <Chip
                  key={`${selectedShift.ShiftID}-pattern-${idx}`}
                  label={`${p.PatternName || `Pattern ${idx + 1}`}: ${p.DayNameList || fmtDays(selectedShift)} | AM ${fmtTime(p.MorningTimeIn)}-${fmtTime(p.MorningTimeOut)} | PM ${fmtTime(p.AfternoonTimeIn)}-${fmtTime(p.AfternoonTimeOut)}`}
                />
              ))
            ) : (
              <>
                <Chip label={`AM: ${fmtTime(selectedShift.MorningTimeIn)} - ${fmtTime(selectedShift.MorningTimeOut)}`} />
                <Chip label={`PM: ${fmtTime(selectedShift.AfternoonTimeIn)} - ${fmtTime(selectedShift.AfternoonTimeOut)}`} />
                <Chip label={`Days: ${fmtDays(selectedShift)}`} />
              </>
            )}
          </Box>
        </Paper>
      )}

      <Box sx={{ mt: 3 }}>
        <Button
          variant="contained"
          disabled={!canSubmit || saving}
          onClick={handleAssign}
          sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }}
        >
          {saving ? 'Assigning...' : 'Assign Shift'}
        </Button>
      </Box>

      <Snackbar
        open={snack.open}
        autoHideDuration={4000}
        onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert
          onClose={() => setSnack((prev) => ({ ...prev, open: false }))}
          severity={snack.severity}
          variant="filled"
          sx={{ width: '100%' }}
        >
          {snack.message}
        </Alert>
      </Snackbar>

      <Dialog
        open={reassignDialog.open}
        onClose={() => setReassignDialog({ open: false, rows: [], payload: null })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Existing Shift Assignment Detected</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" sx={{ mb: 1.2 }}>
            The following employee(s) already have a shift assigned. Continue to replace their assignment with this shift?
          </Typography>
          <Box sx={{ display: 'grid', gap: 0.8, maxHeight: 260, overflowY: 'auto' }}>
            {reassignDialog.rows.map((emp) => (
              <Typography key={emp.id} variant="body2">
                {emp.EmployeeCode || '-'} - {emp.name || 'Employee'} (Current: {emp.assignedShift})
              </Typography>
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setReassignDialog({ open: false, rows: [], payload: null })}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={async () => {
              const payload = reassignDialog.payload
              setReassignDialog({ open: false, rows: [], payload: null })
              if (payload) await performAssign(payload)
            }}
            sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }}
          >
            Continue
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
