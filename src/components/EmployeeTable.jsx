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
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import EmployeeDialog from './EmployeeDialog'
import * as api from '../api/employees'

function EmployeeRow({ e, onEdit, onDelete }) {
  const initials = String(e?.name || '')
    .split(/\s+/)
    .filter(Boolean)
    .map(n => n[0])
    .slice(0, 2)
    .join('')

  return (
    <TableRow
      hover
      sx={{
        '&:hover': { background: 'rgba(255,255,255,0.04)' }
      }}
    >
      <TableCell sx={{ color: 'var(--text)' }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar sx={{ bgcolor: 'var(--primary)' }}>{initials || '?'}</Avatar>
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
          <IconButton size="small" onClick={() => onEdit(e)} sx={{ color: 'var(--muted)' }}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => onDelete && onDelete(e.id)} sx={{ color: 'var(--muted)' }}>
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
  const [deleteTarget, setDeleteTarget] = React.useState(null)

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

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    return employees.filter(e => {
      const name = String(e?.name || '').toLowerCase()
      const position = String(e?.position || '').toLowerCase()
      const shift = String(e?.assignedShift || '').toLowerCase()
      const email = String(e?.email || '').toLowerCase()
      const phone = String(e?.phone || '').toLowerCase()
      const dept = String(e?.department || '').toLowerCase()
      const matchesQuery =
        !q ||
        name.includes(q) ||
        position.includes(q) ||
        shift.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        dept.includes(q)
      const matchesDept = department === 'All' || e.department === department
      return matchesQuery && matchesDept
    })
  }, [employees, query, department])

  const handleChangePage = (_, newPage) => setPage(newPage)
  const handleChangeRowsPerPage = (e) => {
    setRowsPerPage(parseInt(e.target.value, 10))
    setPage(0)
  }

  const openAdd = () => { setEditing(null); setDialogOpen(true) }
  const openEdit = (emp) => { setEditing(emp); setDialogOpen(true) }

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
    try {
      await api.deleteEmployee(id)
      setEmployees(prev => {
        const updated = prev.filter(p => p.id !== id)
        const nextMaxPage = Math.max(0, Math.ceil(updated.length / rowsPerPage) - 1)
        setPage(prevPage => Math.min(prevPage, nextMaxPage))
        return updated
      })
      setDeleteTarget(null)
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
            placeholder="Search name, position, shift, email, phone, department"
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
              <EmployeeRow key={e.id} e={e} onEdit={openEdit} onDelete={setDeleteTarget} />
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

      <Dialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
      >
        <DialogTitle>Delete Employee</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Are you sure you want to delete this employee?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteTarget && handleDelete(deleteTarget)}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
