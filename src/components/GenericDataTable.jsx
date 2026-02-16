//GenericDataTable.jsx
import React from 'react'
import {
  Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper,
  IconButton, Dialog, DialogTitle, DialogContent, DialogActions, Button,
  Box, TextField, CircularProgress, Alert
} from '@mui/material'
import EditIcon from '@mui/icons-material/Edit'
import DeleteIcon from '@mui/icons-material/Delete'
import AddIcon from '@mui/icons-material/Add'

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
  onRowClick = null
}) {
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [editing, setEditing] = React.useState(null)
  const [form, setForm] = React.useState({})

  const handleOpenAdd = () => { setEditing(null); setForm({}); setDialogOpen(true) }
  const handleOpenEdit = (row) => { setEditing(row); setForm({ ...row }); setDialogOpen(true) }
  const handleClose = () => setDialogOpen(false)

  const handleSave = async () => {
    if (editing) {
      // Merge form changes with original record to preserve unedited fields
      const updatedData = { ...editing, ...form }
      await onEdit(updatedData)
    } else {
      await onAdd(form)
    }
    setDialogOpen(false)
  }

  const handleDelete = async (row) => {
    const id = row[primaryKeyField]
    if (confirm('Delete this record?')) await onDelete(id)
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <h3>{title}</h3>
        {allowAdd && (
          <Button startIcon={<AddIcon />} variant="contained" onClick={handleOpenAdd}>Add</Button>
        )}
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow sx={{ backgroundColor: '#f5f5f5' }}>
              {columns.map(col => <TableCell key={col}><strong>{col}</strong></TableCell>)}
              <TableCell align="right"><strong>Actions</strong></TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRow><TableCell colSpan={columns.length + 1} align="center"><CircularProgress /></TableCell></TableRow>}
            {!loading && data.length === 0 && <TableRow><TableCell colSpan={columns.length + 1} align="center">No data</TableCell></TableRow>}
            {!loading && data.map((row) => (
              <TableRow
                key={row[primaryKeyField]}
                hover
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                sx={onRowClick ? { cursor: 'pointer' } : undefined}
              >
                {renderRow(row)}
                <TableCell align="right">
                  {(allowEdit || allowDelete) && (
                    <>
                      {allowEdit && (
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleOpenEdit(row) }}><EditIcon fontSize="small" /></IconButton>
                      )}
                      {allowDelete && (
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDelete(row) }}><DeleteIcon fontSize="small" /></IconButton>
                      )}
                    </>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={dialogOpen} onClose={handleClose} maxWidth="sm" fullWidth>
        <DialogTitle>{editing ? 'Edit' : 'Add New'}</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
            {columns.map(col => (
              <TextField
                key={col}
                fullWidth
                label={col}
                value={form[col] || ''}
                onChange={(e) => setForm({ ...form, [col]: e.target.value })}
              />
            ))}
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
