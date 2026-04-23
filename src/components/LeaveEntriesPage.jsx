import React from 'react'
import {
  Autocomplete,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TableCell,
  TextField,
  Typography
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

const primaryBtnSx = {
  backgroundColor: 'var(--primary)',
  color: '#fff',
  fontWeight: 700,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
  ':hover': { backgroundColor: 'var(--primary-dark)' }
}

const secondaryBtnSx = {
  textTransform: 'none',
  borderRadius: 2,
  fontWeight: 700
}

const formCardSx = {
  display: 'grid',
  gap: 1.5,
  padding: 2,
  marginBottom: 2,
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
  borderRadius: 3
}

const inputSx = {
  minWidth: 220,
  backgroundColor: '#fdfdfd',
  '& fieldset': { borderColor: 'var(--border)' },
  '&:hover fieldset': { borderColor: 'var(--primary)' },
  '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
}

function toDateInputValue(value = new Date()) {
  const d = new Date(value)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 10)
}

function emptyForm() {
  return {
    EmployeeID: '',
    LeaveStartDate: toDateInputValue(),
    LeaveEndDate: toDateInputValue(),
    LeaveType: 'LEAVE',
    LeaveUnitType: 'FULL_DAY',
    StartTime: '',
    EndTime: '',
    ApprovedHours: '',
    Reason: ''
  }
}

export default function LeaveEntriesPage() {
  const { show, SnackbarComponent } = useSnackbar()
  const [rows, setRows] = React.useState([])
  const [employees, setEmployees] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState(false)
  const [editingId, setEditingId] = React.useState('')
  const [form, setForm] = React.useState(() => emptyForm())

  const loadEntries = React.useCallback(async () => {
    try {
      setLoading(true)
      const data = await api.fetchLeaveEntries()
      setRows(Array.isArray(data) ? data : [])
    } catch (err) {
      show(`Load failed: ${err.message || err}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [show])

  const loadEmployees = React.useCallback(async () => {
    try {
      const data = await api.fetchEmployees()
      setEmployees(Array.isArray(data) ? data : [])
    } catch (err) {
      show(`Employee load failed: ${err.message || err}`, 'error')
    }
  }, [show])

  React.useEffect(() => {
    loadEntries()
    loadEmployees()
  }, [loadEntries, loadEmployees])

  const resetForm = React.useCallback(() => {
    setEditingId('')
    setForm(emptyForm())
  }, [])

  const handleChange = (field) => (event) => {
    const value = event.target.value
    setForm((prev) => {
      const next = { ...prev, [field]: value }
      if (field === 'LeaveStartDate' && (!prev.LeaveEndDate || prev.LeaveEndDate < value)) {
        next.LeaveEndDate = value
      }
      return next
    })
  }

  const selectedEmployee = React.useMemo(
    () => employees.find((employee) => employee.id === form.EmployeeID) || null,
    [employees, form.EmployeeID]
  )

  const handleSubmit = async () => {
    if (!form.EmployeeID) {
      show('Please choose an employee.', 'warning')
      return
    }
    if (!form.LeaveStartDate || !form.LeaveEndDate) {
      show('Please choose the leave date range.', 'warning')
      return
    }

    setSaving(true)
    try {
      const payload = {
        EmployeeID: form.EmployeeID,
        LeaveStartDate: form.LeaveStartDate,
        LeaveEndDate: form.LeaveEndDate,
        LeaveType: form.LeaveType || 'LEAVE',
        LeaveUnitType: form.LeaveUnitType || 'FULL_DAY',
        StartTime: form.StartTime || null,
        EndTime: form.EndTime || null,
        ApprovedHours: form.ApprovedHours === '' ? null : form.ApprovedHours,
        Reason: form.Reason || null
      }

      if (editingId) {
        await api.updateLeaveEntry(editingId, payload)
        show('Leave entry updated.', 'success')
      } else {
        await api.createLeaveEntry(payload)
        show('Leave entry created.', 'success')
      }

      resetForm()
      await loadEntries()
    } catch (err) {
      show(err.message || String(err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    await api.deleteLeaveEntry(id)
    setRows((prev) => prev.filter((row) => row.LeaveEntryID !== id))
    if (editingId === id) resetForm()
    show('Leave entry deleted.', 'success')
  }

  const handleRowClick = (row) => {
    setEditingId(row.LeaveEntryID)
    setForm({
      EmployeeID: row.EmployeeID || '',
      LeaveStartDate: row.LeaveStartDate || toDateInputValue(),
      LeaveEndDate: row.LeaveEndDate || row.LeaveStartDate || toDateInputValue(),
      LeaveType: row.LeaveType || 'LEAVE',
      LeaveUnitType: row.LeaveUnitType || 'FULL_DAY',
      StartTime: row.StartTime || '',
      EndTime: row.EndTime || '',
      ApprovedHours: row.ApprovedHours == null ? '' : String(row.ApprovedHours),
      Reason: row.Reason || ''
    })
  }

  return (
    <>
      {SnackbarComponent}

      <Paper sx={formCardSx}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
              Approved Leave
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--muted)' }}>
              Encode approved leave here so absences and leave hours are based on admin records, not guesses.
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: editingId ? 'var(--primary)' : 'var(--muted)', fontWeight: 700 }}>
            {editingId ? 'Editing selected leave entry' : 'Creating a new leave entry'}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
          <Autocomplete
            options={employees}
            value={selectedEmployee}
            onChange={(_event, value) => {
              setForm((prev) => ({ ...prev, EmployeeID: value?.id || '' }))
            }}
            getOptionLabel={(option) => `${option?.name || ''} (${option?.employeeCode || option?.EmployeeCode || 'No code'})`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label="Employee"
                helperText="Search by employee name or staff code."
                sx={inputSx}
              />
            )}
          />

          <TextField
            size="small"
            label="Start Date"
            type="date"
            value={form.LeaveStartDate}
            onChange={handleChange('LeaveStartDate')}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />

          <TextField
            size="small"
            label="End Date"
            type="date"
            value={form.LeaveEndDate}
            onChange={handleChange('LeaveEndDate')}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />

          <FormControl size="small" sx={inputSx}>
            <InputLabel id="leave-type-label">Leave Type</InputLabel>
            <Select
              labelId="leave-type-label"
              label="Leave Type"
              value={form.LeaveType}
              onChange={handleChange('LeaveType')}
            >
              <MenuItem value="LEAVE">General Leave</MenuItem>
              <MenuItem value="VACATION">Vacation</MenuItem>
              <MenuItem value="SICK">Sick</MenuItem>
              <MenuItem value="EMERGENCY">Emergency</MenuItem>
              <MenuItem value="UNPAID">Unpaid</MenuItem>
            </Select>
          </FormControl>

          <FormControl size="small" sx={inputSx}>
            <InputLabel id="leave-unit-label">Unit</InputLabel>
            <Select
              labelId="leave-unit-label"
              label="Unit"
              value={form.LeaveUnitType}
              onChange={handleChange('LeaveUnitType')}
            >
              <MenuItem value="FULL_DAY">Full Day</MenuItem>
              <MenuItem value="HALF_DAY_AM">Half Day AM</MenuItem>
              <MenuItem value="HALF_DAY_PM">Half Day PM</MenuItem>
              <MenuItem value="HOURS">Hours</MenuItem>
            </Select>
          </FormControl>

          <TextField
            size="small"
            label="Approved Hours"
            type="number"
            value={form.ApprovedHours}
            onChange={handleChange('ApprovedHours')}
            inputProps={{ min: 0, step: '0.25' }}
            helperText="Optional. Use this for custom hour values."
            sx={inputSx}
          />

          <TextField
            size="small"
            label="Start Time"
            type="time"
            value={form.StartTime}
            onChange={handleChange('StartTime')}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />

          <TextField
            size="small"
            label="End Time"
            type="time"
            value={form.EndTime}
            onChange={handleChange('EndTime')}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />
        </Box>

        <TextField
          size="small"
          label="Reason / Reference"
          value={form.Reason}
          onChange={handleChange('Reason')}
          sx={{ ...inputSx, minWidth: '100%' }}
        />

        <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Button variant="outlined" onClick={resetForm} sx={secondaryBtnSx}>
            Clear
          </Button>
          <Button
            variant="contained"
            disabled={saving}
            onClick={handleSubmit}
            sx={primaryBtnSx}
          >
            {saving ? 'Saving...' : editingId ? 'Update Leave' : 'Add Leave'}
          </Button>
        </Box>
      </Paper>

      <GenericDataTable
        title="Approved Leave Entries"
        columns={[
          { key: 'LeaveRange', label: 'Date Range' },
          { key: 'EmployeeName', label: 'Employee' },
          { key: 'EmployeeCode', label: 'Staff Code' },
          { key: 'Department', label: 'Department' },
          { key: 'LeaveType', label: 'Type' },
          { key: 'LeaveUnitType', label: 'Unit' },
          { key: 'ApprovedHours', label: 'Approved Hours' },
          { key: 'Window', label: 'Window' },
          { key: 'Reason', label: 'Reason' }
        ]}
        data={rows.map((row) => ({
          ...row,
          LeaveRange: row.LeaveStartDate === row.LeaveEndDate ? row.LeaveStartDate : `${row.LeaveStartDate} to ${row.LeaveEndDate}`,
          Window: row.StartTime && row.EndTime ? `${row.StartTime} - ${row.EndTime}` : '-'
        }))}
        loading={loading}
        primaryKeyField="LeaveEntryID"
        readOnly={true}
        allowAdd={false}
        allowEdit={false}
        allowDelete={true}
        showRowDelete={true}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={handleDelete}
        onRowClick={handleRowClick}
        renderRow={(row) => (
          <>
            <TableCell>{row.LeaveRange}</TableCell>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{row.EmployeeCode}</TableCell>
            <TableCell>{row.Department || '-'}</TableCell>
            <TableCell>{row.LeaveType}</TableCell>
            <TableCell>{row.LeaveUnitType}</TableCell>
            <TableCell>{row.ApprovedHours}</TableCell>
            <TableCell>{row.Window}</TableCell>
            <TableCell>{row.Reason || '-'}</TableCell>
          </>
        )}
      />
    </>
  )
}
