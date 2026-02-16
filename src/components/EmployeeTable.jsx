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
  Tooltip
} from '@mui/material'
import SearchIcon from '@mui/icons-material/Search'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import EmployeeDialog from './EmployeeDialog'
import * as api from '../api/employees'

function EmployeeRow({ e, onEdit, onDelete }) {
  return (
    <TableRow hover>
      <TableCell>
        <Stack direction="row" spacing={2} alignItems="center">
          <Avatar>{e.name.split(' ').map(n => n[0]).slice(0,2).join('')}</Avatar>
          <Box>
            <div style={{ fontWeight: 600 }}>{e.name}</div>
            <div style={{ fontSize: 12, color: '#666' }}>{e.email}</div>
          </Box>
        </Stack>
      </TableCell>
      <TableCell>{e.position}</TableCell>
      <TableCell>{e.department}</TableCell>
      <TableCell>{e.assignedShift || 'N/A'}</TableCell>
      <TableCell>{e.phone}</TableCell>
      <TableCell align="right">
        <Tooltip title="Edit">
          <IconButton size="small" onClick={() => onEdit(e)}>
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton size="small" onClick={() => onDelete && onDelete(e.id)}>
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
            InputProps={{ startAdornment: <SearchIcon sx={{ mr: 1 }} /> }}
          />
          <FormControl size="small" sx={{ minWidth: 180 }}>
            <InputLabel id="dept-label">Department</InputLabel>
            <Select
              labelId="dept-label"
              value={department}
              label="Department"
              onChange={(e) => { setDepartment(e.target.value); setPage(0) }}
            >
              {departments.map(d => (
                <MenuItem key={d} value={d}>{d}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>

        <Box>
          <IconButton color="primary" onClick={openAdd}>
            <AddIcon />
          </IconButton>
        </Box>
      </Box>

      <TableContainer component={Paper} variant="outlined">
        <Table>
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
              <EmployeeRow key={e.id} e={e} onEdit={openEdit} onDelete={handleDelete} />
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
    </>
  )
}
