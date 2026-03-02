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
  Grid
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import EmployeeDialog from './EmployeeDialog'
import * as api from '../api/employees'
import { fetchEmployeeAssignments } from '../api'

function formatSqlTime(value) {
  if (!value) return '—'
  if (typeof value === 'string') {
    // "08:00:00" or "08:00"
    if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
    // ISO datetime -> grab local-less HH:MM
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return value.slice(11, 16)
    return value
  }
  // Fallback: non-string values
  try {
    const d = new Date(value)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(11, 16)
  } catch (_) {}
  return String(value)
}

function formatDayList(value) {
  if (!value) return '—'
  return String(value)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ')
}

function EmployeeRow({ e, onEdit, onDelete, onView }) {
  return (
    <TableRow
      hover
      onClick={() => onView?.(e)}
      sx={{
        cursor: onView ? 'pointer' : 'default',
        '&:hover': { background: 'rgba(255,255,255,0.04)' }
      }}
    >
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
      <TableCell sx={{ color: 'var(--text)' }}>{e.assignedShift || 'N/A'}</TableCell>
      <TableCell sx={{ color: 'var(--text)' }}>{e.phone}</TableCell>
      <TableCell align="right">
        <Tooltip title="Edit">
          <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); onEdit(e) }} sx={{ color: 'var(--muted)' }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={(ev) => { ev.stopPropagation(); onDelete && onDelete(e.id) }} sx={{ color: 'var(--muted)' }}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

export default function EmployeeTable() {
  const [query, setQuery] = React.useState('')
  const [department, setDepartment] = React.useState('All')
  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(8)
  const [employees, setEmployees] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [viewing, setViewing] = React.useState(null)
  const [viewLoading, setViewLoading] = React.useState(false)

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

  const filtered = employees.filter(e => {
    const q = query.trim().toLowerCase()
    const matchesQuery =
      !q ||
      e.name.toLowerCase().includes(q) ||
      e.position.toLowerCase().includes(q) ||
      (e.assignedShift || '').toLowerCase().includes(q)
    const matchesDept = department === 'All' || e.department === department
    return matchesQuery && matchesDept
  })

  const handleChangePage = (_, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10))
    setPage(0)
  }

  const openAdd = () => { setEditing(null); setDialogOpen(true) }
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
      } else {
        const created = await api.createEmployee(emp)
        setEmployees(prev => [created, ...prev])
      }
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this employee?')) return
    try {
      await api.deleteEmployee(id)
      setEmployees(prev => prev.filter(p => p.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <>
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
        </Box>

        <Box>
          <IconButton onClick={openAdd} sx={{ color: 'var(--primary)', background: 'rgba(37,99,235,0.12)', '&:hover': { background: 'rgba(37,99,235,0.2)' } }}>
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
              <TableCell>Employee</TableCell>
              <TableCell>Position</TableCell>
              <TableCell>Department</TableCell>
              <TableCell>Assigned Shift</TableCell>
              <TableCell>Phone</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && (
              <TableRow>
                <TableCell colSpan={6} align="center">Loading...</TableCell>
              </TableRow>
            )}
            {!loading && filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage).map(e => (
              <EmployeeRow key={e.id} e={e} onEdit={openEdit} onDelete={handleDelete} onView={openView} />
            ))}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} align="center">No employees found</TableCell>
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
  const shiftName = employee.assignedShift || employee.AssignedShift || '—'
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
          <Detail label="Position" value={employee.position || '—'} />
          <Detail label="Department" value={employee.department || '—'} />
          <Detail label="Phone" value={employee.phone || '—'} />
          <Detail label="Assigned Shift" value={shiftName} />
        </Grid>

        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
          Schedule Details
        </Typography>
        {loading ? (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>Loading schedule details…</Typography>
        ) : Array.isArray(scheduleDetails) && scheduleDetails.length > 0 ? (
          <Stack spacing={1}>
            {scheduleDetails.slice(0, 2).map((s, idx) => (
              <Paper key={idx} variant="outlined" sx={{ p: 1, borderColor: 'var(--border)' }}>
                <Typography variant="body2" sx={{ fontWeight: 700 }}>
                  {s.PeriodName || s.name || s.ShiftName || `Pattern ${idx + 1}`}
                </Typography>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  Days: {s.DayNameList || formatDayList(s.DayList) || '—'}
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
                …plus {scheduleDetails.length - 2} more pattern(s)
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
