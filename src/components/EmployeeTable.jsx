//EmployeeTable.jsx
import React from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Avatar,
  TextField,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Box,
  TablePagination,
  IconButton,
  Stack,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Chip,
  Checkbox,
  Grid
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import EmployeeDialog from './EmployeeDialog'
import * as api from '../api/employees'
import { fetchEmployeeAssignments } from '../api'
import { useSnackbar } from './ui/Snackbar'

function formatSqlTime(value) {
  if (!value) return '-'
  if (typeof value === 'string') {
    if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(11, 16)
    return value
  }
  try {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(11, 16)
  } catch (_) {}
  return String(value)
}

function formatDayList(value) {
  if (!value) return '-'
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ')
}

function EmployeeRow({ e, selected, onToggleSelect, onEdit, onView }) {
  return (
    <TableRow
      hover
      selected={!!selected}
      onClick={() => onView?.(e)}
      sx={{
        cursor: onView ? 'pointer' : 'default',
        '&:hover': { background: 'rgba(255,255,255,0.04)' }
      }}
    >
      <TableCell padding="checkbox" onClick={(ev) => ev.stopPropagation()}>
        <Checkbox
          checked={!!selected}
          onChange={() => onToggleSelect?.(e.id)}
          inputProps={{ 'aria-label': `select ${e.name || 'employee'}` }}
          sx={{ color: 'var(--muted)', '&.Mui-checked': { color: 'var(--primary)' } }}
        />
      </TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: 'var(--primary)' }}>
            {(e.name || '')
              .split(' ')
              .map(n => n[0])
              .filter(Boolean)
              .slice(0, 2)
              .join('')
              || '?'}
          </Avatar>
          <Box>
            <div style={{ fontWeight: 600, color: 'var(--text)' }}>{e.name}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{e.email}</div>
          </Box>
        </Stack>
      </TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.position}</TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.department}</TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.biometricStaffCode || '-'}</TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.biometricUserId || '-'}</TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.assignedShift || 'N/A'}</TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.phone}</TableCell>
      <TableCell align="right">
        <Tooltip title="Edit">
          <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); onEdit(e) }} sx={{ color: 'var(--muted)' }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

export default function EmployeeTable() {
  const { show, hide, SnackbarComponent } = useSnackbar()
  const [query, setQuery] = React.useState('')
  const [department, setDepartment] = React.useState('All')
  const [sortMode, setSortMode] = React.useState('STAFF_ASC')
  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(8)
  const [employees, setEmployees] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [viewing, setViewing] = React.useState(null)
  const [viewLoading, setViewLoading] = React.useState(false)
  const [selectedIds, setSelectedIds] = React.useState(() => new Set())
  const [deleting, setDeleting] = React.useState(false)

  const departments = React.useMemo(() => [
    'All',
    ...Array.from(new Set(employees.map(e => e.department)))
  ], [employees])

  React.useEffect(() => {
    let mounted = true
    setLoading(true)
    api.fetchEmployees()
      .then(data => {
        if (!mounted) return
        setEmployees(Array.isArray(data) ? data : [])
        setError(null)
      })
      .catch(err => {
        if (!mounted) return
        setError(err.message)
      })
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  const nextStaffCode = React.useMemo(() => {
    const parse = (v) => {
      const s = String(v ?? '').trim()
      if (!s) return null
      const n = Number(s)
      return Number.isFinite(n) ? n : null
    }

    const used = (Array.isArray(employees) ? employees : [])
      .map((e) => parse(e.biometricStaffCode))
      .filter((n) => n !== null && n >= 0 && n <= 100000)
      .sort((a, b) => a - b)

    let next = 0
    for (const n of used) {
      if (n === next) next += 1
      else if (n > next) break
    }

    return next <= 100000 ? String(next) : ''
  }, [employees])

  const filtered = (Array.isArray(employees) ? employees : [])
    .filter((e) => {
      const q = query.trim().toLowerCase()
      const matchesQuery =
        !q ||
        String(e.name || '').toLowerCase().includes(q) ||
        String(e.position || '').toLowerCase().includes(q) ||
        String(e.department || '').toLowerCase().includes(q) ||
        String(e.assignedShift || '').toLowerCase().includes(q) ||
        String(e.biometricStaffCode || '').toLowerCase().includes(q) ||
        String(e.biometricUserId || '').toLowerCase().includes(q) ||
        String(e.EmployeeCode || e.employeeCode || '').toLowerCase().includes(q)
      const matchesDept = department === 'All' || e.department === department
      return matchesQuery && matchesDept
    })
    .sort((a, b) => {
      const parse = (v) => {
        const s = String(v ?? '').trim()
        if (!s) return null
        const n = Number(s)
        return Number.isFinite(n) ? n : null
      }

      const nameA = String(a.name || '')
      const nameB = String(b.name || '')

      const staffA = parse(a.biometricStaffCode)
      const staffB = parse(b.biometricStaffCode)

      const staffCmpAsc = (() => {
        if (staffA === null && staffB === null) return 0
        if (staffA === null) return 1
        if (staffB === null) return -1
        if (staffA !== staffB) return staffA - staffB
        return 0
      })()

      const nameCmpAsc = nameA.localeCompare(nameB)

      if (sortMode === 'NAME_ASC') return nameCmpAsc || staffCmpAsc
      if (sortMode === 'NAME_DESC') return nameB.localeCompare(nameA) || staffCmpAsc

      return staffCmpAsc || nameCmpAsc
    })

  const filteredIds = React.useMemo(() => filtered.map(e => e.id), [filtered])
  const selectedCount = selectedIds.size
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selectedIds.has(id))
  const someFilteredSelected = filteredIds.some(id => selectedIds.has(id))

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAllFiltered = () => {
    if (!filteredIds.length) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      const currentlyAllSelected = filteredIds.every(id => next.has(id))
      if (currentlyAllSelected) {
        filteredIds.forEach(id => next.delete(id))
      } else {
        filteredIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  const handleChangePage = (_, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10))
    setPage(0)
  }
  const openAdd = () => {
    setEditing({
      id: null,
      name: '',
      position: '',
      department: '',
      biometricStaffCode: nextStaffCode,
      biometricUserId: '',
      email: '',
      phone: ''
    })
    setDialogOpen(true)
  }
  const openEdit = (emp) => { setEditing(emp); setDialogOpen(true) }
  const openView = async (emp) => {
    setViewing(emp)
    setViewLoading(true)
    try {
      const assignments = await fetchEmployeeAssignments({ employeeIDs: [emp.id] })
      const details = Array.isArray(assignments) ? assignments : []
      setViewing({ ...emp, scheduleDetails: details })
    } catch (_) {
      setViewing({ ...emp, scheduleDetails: [] })
    } finally {
      setViewLoading(false)
    }
  }

  const handleSave = async (emp) => {
    try {
      if (emp.id) {
        const updated = await api.updateEmployee(emp)
        setEmployees(prev => prev.map(p => p.id === updated.id ? updated : p))
        show('Employee updated successfully.', 'success')
      } else {
        const created = await api.createEmployee(emp)
        setEmployees(prev => [created, ...prev])
        show('Employee created successfully.', 'success')
      }
      setError(null)
      return true
    } catch (err) {
      setError(err.message)
      show(`${err.message || err}`, 'error')
      return false
    }
  }

  const performDelete = async (ids) => {
    const list = Array.isArray(ids) ? ids.map(v => String(v || '').trim()).filter(Boolean) : []
    if (!list.length || deleting) return

    setDeleting(true)
    try {
      const result = await api.bulkDeleteEmployees(list)
      const deletedCount = Number(result?.deleted ?? list.length)

      const idSet = new Set(list)
      setEmployees(prev => prev.filter(p => !idSet.has(p.id)))
      setSelectedIds(prev => {
        if (!prev.size) return prev
        const next = new Set(prev)
        list.forEach(id => next.delete(id))
        return next
      })

      show(deletedCount === 1 ? 'Employee deleted.' : `${deletedCount} employees deleted.`, 'success')
      setError(null)
    } catch (err) {
      setError(err.message)
      show(`${err.message || 'Delete failed'}`, 'error')
    } finally {
      setDeleting(false)
    }
  }

  const confirmDelete = (ids) => {
    const list = Array.isArray(ids) ? ids : []
    if (!list.length) return

    const count = list.length
    const label = count === 1 ? 'Delete this employee?' : `Delete ${count} employees?`

    show(label, {
      severity: 'warning',
      autoHideDuration: null,
      action: (
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Button color="inherit" size="small" onClick={() => hide()}>
            Cancel
          </Button>
          <Button
            color="error"
            size="small"
            variant="contained"
            onClick={() => { hide(); performDelete(list) }}
          >
            Delete
          </Button>
        </Stack>
      )
    })
  }

  return (
    <>
      {SnackbarComponent}
      <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', justifyContent: 'space-between' }}>
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
          <TextField
            size="small"
            placeholder="Search by name or position"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(0) }}
            InputProps={{
              startAdornment: <SearchIcon sx={{ mr: 1, color: 'var(--muted)' }} />,
              sx: { color: 'var(--text)' }
            }}
            sx={{
              background: 'var(--surface)',
              borderRadius: 2,
              '& fieldset': { borderColor: 'var(--border)' },
              '&:hover fieldset': { borderColor: 'var(--primary)' }
            }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="dept-label" sx={{ color: 'var(--text)' }}>Department</InputLabel>
            <Select
              labelId="dept-label"
              value={department}
              label="Department"
              onChange={(e) => { setDepartment(e.target.value); setPage(0) }}
              sx={{ color: 'var(--text)' }}
              MenuProps={{ PaperProps: { sx: { background: 'var(--surface)', color: 'var(--text)' } } }}
            >
              {departments.map(d => (
                <MenuItem key={d} value={d}>{d}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="sort-label" sx={{ color: 'var(--text)' }}>Sort</InputLabel>
            <Select
              labelId="sort-label"
              value={sortMode}
              label="Sort"
              onChange={(e) => { setSortMode(e.target.value); setPage(0) }}
              sx={{ color: 'var(--text)' }}
              MenuProps={{ PaperProps: { sx: { background: 'var(--surface)', color: 'var(--text)' } } }}
            >
              <MenuItem value="NAME_ASC">Name (A-Z)</MenuItem>
              <MenuItem value="NAME_DESC">Name (Z-A)</MenuItem>
              <MenuItem value="STAFF_ASC">By Number</MenuItem>
            </Select>
          </FormControl>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          {selectedCount > 0 && (
            <Chip
              label={`${selectedCount} selected`}
              onDelete={clearSelection}
              size="small"
              sx={{
                background: 'rgba(255,255,255,0.06)',
                color: 'var(--text)',
                borderColor: 'var(--border)'
              }}
              variant="outlined"
            />
          )}
          <Tooltip title={selectedCount ? 'Delete selected' : 'Select employees to delete'}>
            <span>
              <IconButton
                disabled={!selectedCount || deleting}
                onClick={() => confirmDelete(Array.from(selectedIds))}
                sx={{
                  color: selectedCount ? '#ef4444' : 'var(--muted)',
                  background: selectedCount ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.04)',
                  '&:hover': { background: selectedCount ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)' }
                }}
              >
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
          <IconButton
            onClick={openAdd}
            sx={{ color: 'var(--primary)', background: 'rgba(37,99,235,0.12)', '&:hover': { background: 'rgba(37,99,235,0.2)' } }}
          >
            <AddIcon />
          </IconButton>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined" sx={{ background: 'var(--surface)', borderColor: 'var(--border)' }}>
        <Table sx={{
          '& th, & td': { color: 'var(--text)', borderColor: 'var(--border)' },
          '& thead th': { background: 'var(--primary)', color: '#fff', fontWeight: 700 }
        }}>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox" sx={{ width: 48 }}>
                <Checkbox
                  checked={allFilteredSelected}
                  indeterminate={someFilteredSelected && !allFilteredSelected}
                  onChange={toggleSelectAllFiltered}
                  inputProps={{ 'aria-label': 'select all employees' }}
                  sx={{
                    color: '#fff',
                    '&.Mui-checked': { color: '#fff' },
                    '&.MuiCheckbox-indeterminate': { color: '#fff' }
                  }}
                />
              </TableCell>
              <TableCell>Employee</TableCell>
              <TableCell>Position</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Staff Code</TableCell>
              <TableCell>User ID</TableCell>
              <TableCell>Assigned Shift</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={9} align="center">Loading...</TableCell>
              </TableRow>
            )}
            {!loading && filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(e => (
              <EmployeeRow
                key={e.id}
                e={e}
                selected={selectedIds.has(e.id)}
                onToggleSelect={toggleSelect}
                onEdit={openEdit}
                onView={openView}
              />
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={9} align="center">No employees found</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5,8,10,20]}
        />
      </TableContainer>

      <EmployeeDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSave={handleSave}
        initial={editing}
      />

      <EmployeeDetailsDialog
        open={!!viewing}
        onClose={() => setViewing(null)}
        employee={viewing}
        loading={viewLoading}
      />
    </>
  )
}

function EmployeeDetailsDialog({ open, onClose, employee, loading }) {
  if (!employee) return null
  const scheduleDetails = employee.scheduleDetails || employee.ScheduleDetails || []
  const shiftName = employee.assignedShift || employee.AssignedShift || '-'
  const initials =
    (employee.name || '')
      .split(' ')
      .map(n => n[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('') || '?'

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        Employee Details
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Avatar sx={{ bgcolor: 'var(--primary)', width: 48, height: 48, fontSize: 20 }}>
            {initials}
          </Avatar>
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 800 }}>{employee.name || 'Unnamed'}</Typography>
            <Typography variant="body2" sx={{ color: 'var(--muted)' }}>{employee.email || 'No email'}</Typography>
          </Box>
        </Stack>

        <Grid container spacing={1.2} sx={{ mb: 2 }}>
          <Detail label="Position" value={employee.position || '-'} />
          <Detail label="Department" value={employee.department || '-'} />
          <Detail label="Phone" value={employee.phone || '-'} />
          <Detail label="Assigned Shift" value={shiftName} />
        </Grid>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Schedule Details
        </Typography>
        {loading ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Loading schedule detailsâ€¦</Typography>
        ) : Array.isArray(scheduleDetails) && scheduleDetails.length > 0 ? (
          <Stack spacing={1}>
            {scheduleDetails.slice(0, 2).map((s, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 1, borderColor: 'var(--border)' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {s.PeriodName || s.name || s.ShiftName || `Pattern ${idx + 1}`}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Days: {s.DayNameList || formatDayList(s.DayList) || '-'}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Morning: {formatSqlTime(s.MorningTimeIn || s.morningIn)} - {formatSqlTime(s.MorningTimeOut || s.morningOut)}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Afternoon: {formatSqlTime(s.AfternoonTimeIn || s.afternoonIn)} - {formatSqlTime(s.AfternoonTimeOut || s.afternoonOut)}
                </Typography>
              </Paper>
            ))}
            {scheduleDetails.length > 2 && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                â€¦plus {scheduleDetails.length - 2} more pattern(s)
              </Typography>
            )}
          </Stack>
        ) : (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>No schedule details.</Typography>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained" sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }}>
          Close
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Detail({ label, value }) {
  return (
    <Grid item xs={12} sm={6}>
      <Typography variant="caption" sx={{ color: 'var(--muted)', letterSpacing: 0.4 }}>{label}</Typography>
      <Typography variant="body2" sx={{ color: 'var(--text)', fontWeight: 600 }}>{value}</Typography>
    </Grid>
  )
}






