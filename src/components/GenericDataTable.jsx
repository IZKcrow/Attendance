//GenericDataTable.jsx
import React from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, TextField, CircularProgress, Alert, TablePagination, InputAdornment
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'
import SearchIcon from '@mui/icons-material/Search'
import { useSnackbar } from './ui/Snackbar'

export default function GenericDataTable({
  title,
  columns,
  data,
  loading,
  error,
  onAdd,
  onEdit,
  onDelete,
  renderRow,
  primaryKeyField,
  readOnly = false,
  allowAdd = !readOnly,
  allowEdit = !readOnly,
  allowDelete = !readOnly,
  onRowClick = null,
  columnSchema = {},
  useDeleteDialog = true
}) {
  const { show, SnackbarComponent } = useSnackbar()
  const showActions = allowEdit || allowDelete
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [form, setForm] = React.useState({})
  const [search, setSearch] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [localError, setLocalError] = React.useState(null)

  const handleOpenAdd = React.useCallback(() => {
    setEditing(null)
    setForm({})
    setLocalError(null)
    setDialogOpen(true)
  }, [])

  const handleOpenEdit = React.useCallback((row) => {
    setEditing(row)
    setForm({ ...row })
    setLocalError(null)
    setDialogOpen(true)
  }, [])

  const handleClose = React.useCallback(() => setDialogOpen(false), [])

  const handleSave = React.useCallback(async () => {
    try {
      setLocalError(null)
      if (editing) {
        // Merge form changes with original record to preserve unedited fields
        const updatedData = { ...editing, ...form }
        await onEdit(updatedData)
      } else {
        await onAdd(form)
      }
      setDialogOpen(false)
    } catch (err) {
      const msg = err?.message || 'Save failed'
      setLocalError(msg)
      show(msg, 'error')
    }
  }, [editing, form, onAdd, onEdit, show])

  const handleDeleteImmediate = React.useCallback(async (row) => {
    if (!row) return
    const id = row?.[primaryKeyField]
    if (!id) {
      const msg = `Missing key field: ${primaryKeyField}`
      setLocalError(msg)
      show(msg, 'error')
      return
    }
    try {
      setLocalError(null)
      await onDelete(id)
    } catch (err) {
      const msg = err?.message || 'Delete failed'
      setLocalError(msg)
      show(msg, 'error')
    }
  }, [onDelete, primaryKeyField, show])

  const handleDeleteClick = React.useCallback((row) => {
    setLocalError(null)
    if (!useDeleteDialog) {
      handleDeleteImmediate(row)
      return
    }
    setDeleteTarget(row)
  }, [useDeleteDialog, handleDeleteImmediate])

  const handleConfirmDelete = React.useCallback(async () => {
    if (!deleteTarget) return
    const id = deleteTarget?.[primaryKeyField]
    if (!id) {
      const msg = `Missing key field: ${primaryKeyField}`
      setLocalError(msg)
      show(msg, 'error')
      return
    }
    try {
      setLocalError(null)
      await onDelete(id)
      setDeleteTarget(null)
    } catch (err) {
      const msg = err?.message || 'Delete failed'
      setLocalError(msg)
      show(msg, 'error')
    }
  }, [deleteTarget, onDelete, primaryKeyField, show])

  const [page, setPage] = React.useState(0)
  const [rowsPerPage, setRowsPerPage] = React.useState(10)

  const handleChangePage = React.useCallback((_evt, newPage) => setPage(newPage), [])
  const handleChangeRowsPerPage = React.useCallback((evt) => {
    setRowsPerPage(parseInt(evt.target.value, 10))
    setPage(0)
  }, [])

  const filtered = React.useMemo(() => {
    if (!search.trim()) return data
    const needle = search.toLowerCase()
    return data.filter((row) =>
      Object.values(row || {}).some((val) =>
        (val === null || val === undefined) ? false : String(val).toLowerCase().includes(needle)
      )
    )
  }, [data, search])

  const displayed = loading ? [] : filtered.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)

  React.useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(filtered.length / rowsPerPage) - 1)
    if (page > maxPage) setPage(maxPage)
  }, [filtered.length, page, rowsPerPage])

  return (
    <Box>
      {SnackbarComponent}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 2, mb: 1, flexWrap: 'wrap' }}>
        <h3 style={{ margin: 0 }}>{title}</h3>
        {allowAdd && (
          <Button
            startIcon={<AddIcon />}
            variant="contained"
            onClick={handleOpenAdd}
            sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }}
          >
            Add
          </Button>
        )}
      </Box>
      <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', mb: 2 }}>
        <TextField
          size="small"
          placeholder="Search..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0) }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" sx={{ color: '#6b7280' }} />
              </InputAdornment>
            )
          }}
          sx={{
            minWidth: 260,
            maxWidth: 420,
            background: 'var(--surface)',
            borderRadius: 3,
            boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
            '& fieldset': { borderColor: 'var(--border)' },
            '&:hover fieldset': { borderColor: 'var(--primary)' },
            '& .MuiOutlinedInput-input': { paddingY: 1.2 }
          }}
        />
      </Box>

      {(error || localError) && <Alert severity="error">{error || localError}</Alert>}

      <TableContainer
        component={Paper}
        sx={{
          width: '100%',
          overflowX: 'auto',
          background: 'var(--surface)',
          color: 'var(--text)',
          '& th, & td': {
            whiteSpace: 'normal',
            wordBreak: 'break-word',
            verticalAlign: 'top'
          }
        }}
      >
        <Table
          sx={{
            width: '100%',
            '& th, & td': { color: 'var(--text)', borderColor: 'var(--border)' },
            '& thead th': {
              background: 'var(--primary)',
              color: '#fff',
              fontWeight: 700
            }
          }}
        >
          <TableHead>
            <TableRow>
              {columns.map(col => <TableCell key={col}><strong>{col}</strong></TableCell>)}
              {showActions && <TableCell align="right" sx={{ minWidth: 110 }}><strong>Actions</strong></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={columns.length + (showActions ? 1 : 0)} align="center"><CircularProgress /></TableCell></TableRow>}
            {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={columns.length + (showActions ? 1 : 0)} align="center">No matching records</TableCell></TableRow>}
            {!loading && displayed.map((row) => (
              <TableRow
                key={row[primaryKeyField]}
                hover
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={{
                  ...(onRowClick ? { cursor: 'pointer' } : {}),
                  '&:hover': { background: 'rgba(255,255,255,0.03)' }
                }}
              >
                {renderRow(row)}
                {showActions && (
                <TableCell align="right">
                  {(
                    <>
                      {allowEdit && (
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row) }}><EditIcon fontSize="small" /></IconButton>
                      )}
                      {allowDelete && (
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteClick(row) }}><DeleteIcon fontSize="small" /></IconButton>
                      )}
                    </>
                  )}
                </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {!loading && filtered.length > 0 && (
        <TablePagination
          component="div"
          count={filtered.length}
          page={page}
          onPageChange={handleChangePage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          rowsPerPageOptions={[5, 10, 20]}
          labelRowsPerPage="Rows per page"
        />
      )}

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit' : 'Add New'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {columns.map(col => (
              <TextField
                key={col}
                fullWidth
                label={col}
                type={columnSchema[col]?.type || 'text'}
                value={form[col] ?? ''}
                onChange={(e) => setForm((prev) => ({ ...prev, [col]: e.target.value }))}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {useDeleteDialog && (
        <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Confirm Deletion</DialogTitle>
          <DialogContent>
            Delete this record? This action cannot be undone.
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button color="error" variant="contained" onClick={handleConfirmDelete}>Delete</Button>
          </DialogActions>
        </Dialog>
      )}
    </Box>
  )
}
