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
    EmployeeIDs: [],
    OvertimeDate: toDateInputValue(),
    StartTime: '',
    EndTime: '',
    ApprovedHours: '',
    OvertimeType: 'REGULAR',
    Reason: ''
  }
}

export default function OvertimeEntriesPage() {
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
      const data = await api.fetchOvertimeEntries()
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
    setForm((prev) => ({ ...prev, [field]: event.target.value }))
  }

  const selectedEmployees = React.useMemo(
    () => {
      const selectedIds = new Set(form.EmployeeIDs || [])
      return employees.filter((employee) => selectedIds.has(employee.id))
    },
    [employees, form.EmployeeIDs]
  )

  const handleSubmit = async () => {
    const employeeIds = Array.isArray(form.EmployeeIDs) ? form.EmployeeIDs.filter(Boolean) : []

    if (!employeeIds.length) {
      show(editingId ? 'Please choose an employee.' : 'Please choose at least one employee.', 'warning')
      return
    }
    if (!form.OvertimeDate) {
      show('Please choose an overtime date.', 'warning')
      return
    }

    setSaving(true)
    try {
      const buildPayload = (employeeId) => ({
        EmployeeID: employeeId,
        OvertimeDate: form.OvertimeDate,
        StartTime: form.StartTime || null,
        EndTime: form.EndTime || null,
        ApprovedHours: form.ApprovedHours === '' ? null : form.ApprovedHours,
        OvertimeType: form.OvertimeType || 'REGULAR',
        Reason: form.Reason || null
      })

      if (editingId) {
        await api.updateOvertimeEntry(editingId, buildPayload(employeeIds[0]))
        show('Overtime entry updated.', 'success')
      } else {
        await Promise.all(employeeIds.map((employeeId) => api.createOvertimeEntry(buildPayload(employeeId))))
        show(
          employeeIds.length === 1
            ? 'Overtime entry created.'
            : `Overtime entries created for ${employeeIds.length} employees.`,
          'success'
        )
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
    await api.deleteOvertimeEntry(id)
    setRows((prev) => prev.filter((row) => row.OvertimeEntryID !== id))
    if (editingId === id) resetForm()
    show('Overtime entry deleted.', 'success')
  }

  const handleRowClick = (row) => {
    setEditingId(row.OvertimeEntryID)
    setForm({
      EmployeeIDs: row.EmployeeID ? [row.EmployeeID] : [],
      OvertimeDate: row.OvertimeDate || toDateInputValue(),
      StartTime: row.StartTime || '',
      EndTime: row.EndTime || '',
      ApprovedHours: row.ApprovedHours == null ? '' : String(row.ApprovedHours),
      OvertimeType: row.OvertimeType || 'REGULAR',
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
              Approved Overtime
            </Typography>
            <Typography variant="body2" sx={{ color: 'var(--muted)' }}>
              Admins can encode only approved overtime so reports do not guess from raw punches.
              {!editingId ? ' You can assign the same overtime details to multiple employees in one save.' : ''}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ color: editingId ? 'var(--primary)' : 'var(--muted)', fontWeight: 700 }}>
            {editingId ? 'Editing selected overtime entry' : 'Creating a new overtime entry'}
          </Typography>
        </Box>

        <Box sx={{ display: 'grid', gap: 1.5, gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' } }}>
          <Autocomplete
            multiple={!editingId}
            options={employees}
            value={editingId ? selectedEmployees[0] || null : selectedEmployees}
            onChange={(_event, value) => {
              setForm((prev) => ({
                ...prev,
                EmployeeIDs: Array.isArray(value) ? value.map((employee) => employee.id) : value?.id ? [value.id] : []
              }))
            }}
            getOptionLabel={(option) => `${option?.name || ''} (${option?.employeeCode || option?.EmployeeCode || 'No code'})`}
            isOptionEqualToValue={(option, value) => option.id === value.id}
            renderInput={(params) => (
              <TextField
                {...params}
                size="small"
                label={editingId ? 'Employee' : 'Employees'}
                helperText={
                  editingId
                    ? 'Edit mode updates the selected overtime entry only.'
                    : 'Search by employee name or staff code. Select one or many.'
                }
                sx={inputSx}
              />
            )}
          />

          <TextField
            size="small"
            label="Overtime Date"
            type="date"
            value={form.OvertimeDate}
            onChange={handleChange('OvertimeDate')}
            InputLabelProps={{ shrink: true }}
            sx={inputSx}
          />

          <FormControl size="small" sx={inputSx}>
            <InputLabel id="ot-type-label">OT Type</InputLabel>
            <Select
              labelId="ot-type-label"
              label="OT Type"
              value={form.OvertimeType}
              onChange={handleChange('OvertimeType')}
            >
              <MenuItem value="REGULAR">Regular</MenuItem>
              <MenuItem value="REST_DAY">Rest Day</MenuItem>
              <MenuItem value="HOLIDAY">Holiday</MenuItem>
              <MenuItem value="OTHER">Other</MenuItem>
            </Select>
          </FormControl>

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

          <TextField
            size="small"
            label="Approved Hours"
            type="number"
            value={form.ApprovedHours}
            onChange={handleChange('ApprovedHours')}
            inputProps={{ min: 0, step: '0.25' }}
            helperText="Optional if start and end time already define the duration."
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
            {saving ? 'Saving...' : editingId ? 'Update Overtime' : 'Add Overtime'}
          </Button>
        </Box>
      </Paper>

      <GenericDataTable
        title="Approved Overtime Entries"
        columns={[
          { key: 'OvertimeDate', label: 'Date' },
          { key: 'EmployeeName', label: 'Employee' },
          { key: 'EmployeeCode', label: 'Staff Code' },
          { key: 'Department', label: 'Department' },
          { key: 'OvertimeType', label: 'Type' },
          { key: 'ApprovedHours', label: 'Approved Hours' },
          { key: 'Window', label: 'Window' },
          { key: 'Reason', label: 'Reason' }
        ]}
        data={rows.map((row) => ({
          ...row,
          Window: row.StartTime && row.EndTime ? `${row.StartTime} - ${row.EndTime}` : '-'
        }))}
        loading={loading}
        primaryKeyField="OvertimeEntryID"
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
            <TableCell>{row.OvertimeDate}</TableCell>
            <TableCell>{row.EmployeeName}</TableCell>
            <TableCell>{row.EmployeeCode}</TableCell>
            <TableCell>{row.Department || '-'}</TableCell>
            <TableCell>{row.OvertimeType}</TableCell>
            <TableCell>{row.ApprovedHours}</TableCell>
            <TableCell>{row.Window}</TableCell>
            <TableCell>{row.Reason || '-'}</TableCell>
          </>
        )}
      />
    </>
  )
}
