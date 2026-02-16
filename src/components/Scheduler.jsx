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
  Chip
} from '@mui/material'
import * as api from '../api'

export default function Scheduler() {
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [selectedShiftID, setSelectedShiftID] = useState('')
  const [selectedEmployeeIDs, setSelectedEmployeeIDs] = useState([])
  const [assignAll, setAssignAll] = useState(false)
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [effectiveTo, setEffectiveTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

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

  const canSubmit = selectedShiftID && (assignAll || selectedEmployeeIDs.length > 0)

  const handleAssign = async () => {
    if (!canSubmit) return
    setSaving(true)
    try {
      await api.assignShiftToEmployees({
        shiftID: selectedShiftID,
        employeeIDs: selectedEmployeeIDs,
        assignAll,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null
      })
      alert('Shift assignment saved successfully.')
      if (!assignAll) setSelectedEmployeeIDs([])
    } catch (err) {
      alert('Assignment failed: ' + (err.message || err))
    } finally {
      setSaving(false)
    }
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
            <Button size="small" variant="outlined" onClick={() => setSelectedEmployeeIDs(employees.map((e) => e.id))} disabled={assignAll}>
              Select All Employees
            </Button>
            <Button size="small" variant="outlined" onClick={() => setSelectedEmployeeIDs([])} disabled={assignAll}>
              Clear
            </Button>
            <Button
              size="small"
              variant={assignAll ? 'contained' : 'outlined'}
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
            <Chip label={`AM: ${fmtTime(selectedShift.MorningTimeIn)} - ${fmtTime(selectedShift.MorningTimeOut)}`} />
            <Chip label={`PM: ${fmtTime(selectedShift.AfternoonTimeIn)} - ${fmtTime(selectedShift.AfternoonTimeOut)}`} />
            <Chip label={`Grace: ${selectedShift.GracePeriodMinutes || 0} min`} />
            <Chip label={`Days: ${fmtDays(selectedShift)}`} />
          </Box>
        </Paper>
      )}

      <Box sx={{ mt: 3 }}>
        <Button variant="contained" disabled={!canSubmit || saving} onClick={handleAssign}>
          {saving ? 'Assigning...' : 'Assign Shift'}
        </Button>
      </Box>
    </Box>
  )
}
