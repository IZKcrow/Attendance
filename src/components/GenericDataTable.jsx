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
import { useSnackbar, APP_ALERT_SX } from './ui/Snackbar'

function pad2(n) {
  return String(n).padStart(2, '0')
}

function toDateInput(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/)
    if (m) return m[1]
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  // Use local getters to avoid timezone shifting for DATE-only values.
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function toTimeInput(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const m = value.match(/^(\d{2}:\d{2})/)
    if (m) return m[1]
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function toDatetimeLocalInput(value) {
  if (!value) return ''
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/)
    if (m) return m[1]
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function normalizeFormForSchema(formObj, schema) {
  const next = { ...(formObj || {}) }
  for (const key of Object.keys(next)) {
    const t = schema?.[key]?.type
    if (t === 'date') next[key] = toDateInput(next[key])
    else if (t === 'time') next[key] = toTimeInput(next[key])
    else if (t === 'datetime-local') next[key] = toDatetimeLocalInput(next[key])
  }
  return next
}

export default function GenericDataTable({
  title,
  columns,
  formColumns = null,
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
  useDeleteDialog = true,
  defaultFormValues = {},
  showRowDelete = false
}) {
  const { show, SnackbarComponent } = useSnackbar()
  // Per-row delete is intentionally hidden (bulk deletion is used instead).
  const showActions = allowEdit || (showRowDelete && allowDelete)

  const columnDefs = React.useMemo(() => {
    const cols = Array.isArray(columns) ? columns : []
    return cols.map((col, idx) => {
      if (typeof col === 'string') return { key: col, label: col, header: null }
      if (React.isValidElement(col)) return { key: `col_${idx}`, label: '', header: col }
      if (col && typeof col === 'object') {
        const key = col.key || col.label || `col_${idx}`
        const label = col.label ?? col.key ?? ''
        const header = col.header ?? null
        return { key, label, header }
      }
      return { key: `col_${idx}`, label: String(col ?? ''), header: null }
    })
  }, [columns])

  const dialogColumns = React.useMemo(() => {
    if (Array.isArray(formColumns)) return formColumns
    return columnDefs.map((c) => c.label || c.key)
  }, [formColumns, columnDefs])
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [form, setForm] = React.useState({})
  const [search, setSearch] = React.useState('')
  const [deleteTarget, setDeleteTarget] = React.useState(null)
  const [dismissedError, setDismissedError] = React.useState(false)

  React.useEffect(() => {
    setDismissedError(false)
  }, [error])

  const handleOpenAdd = React.useCallback(() => {
    setEditing(null)
    setForm({ ...(defaultFormValues || {}) })
    setDialogOpen(true)
  }, [defaultFormValues])

  const handleOpenEdit = React.useCallback((row) => {
    setEditing(row)
    setForm(normalizeFormForSchema(row, columnSchema))
    setDialogOpen(true)
  }, [columnSchema])

  const handleClose = React.useCallback(() => setDialogOpen(false), [])

  const handleSave = React.useCallback(async () => {
    try {
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
      show(msg, 'error')
    }
  }, [editing, form, onAdd, onEdit, show])

  const handleDeleteImmediate = React.useCallback(async (row) => {
    if (!row) return
    const id = row?.[primaryKeyField]
    if (!id) {
      const msg = `Missing key field: ${primaryKeyField}`
      show(msg, 'error')
      return
    }
    try {
      await onDelete(id)
    } catch (err) {
      const msg = err?.message || 'Delete failed'
      show(msg, 'error')
    }
  }, [onDelete, primaryKeyField, show])

  const handleDeleteClick = React.useCallback((row) => {
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
      show(msg, 'error')
      return
    }
    try {
      await onDelete(id)
      setDeleteTarget(null)
    } catch (err) {
      const msg = err?.message || 'Delete failed'
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

      {error && !dismissedError && (
        <Alert
          severity="error"
          variant="filled"
          sx={{ ...APP_ALERT_SX, mt: 1, mb: 1 }}
          onClose={() => setDismissedError(true)}
        >
          {error}
        </Alert>
      )}

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
              {columnDefs.map(col => (
                <TableCell key={col.key}>
                  {col.header ? col.header : <strong>{col.label}</strong>}
                </TableCell>
              ))}
              {showActions && <TableCell align="right" sx={{ minWidth: 110 }}><strong>Actions</strong></TableCell>}
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={columnDefs.length + (showActions ? 1 : 0)} align="center"><CircularProgress /></TableCell></TableRow>}
            {!loading && filtered.length === 0 && <TableRow><TableCell colSpan={columnDefs.length + (showActions ? 1 : 0)} align="center">No matching records</TableCell></TableRow>}
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
                      {showRowDelete && allowDelete && (
                        <IconButton
                          size="small"
                          color="error"
                          onClick={(e) => { e.stopPropagation(); handleDeleteClick(row) }}
                          sx={{ ml: 0.5 }}
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
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
            {dialogColumns.map(col => (
              <TextField
                key={col}
                fullWidth
                label={col}
                type={columnSchema[col]?.type || 'text'}
                InputLabelProps={(() => {
                  const t = columnSchema[col]?.type
                  if (['date', 'time', 'datetime-local', 'month'].includes(t)) return { shrink: true }
                  return undefined
                })()}
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
