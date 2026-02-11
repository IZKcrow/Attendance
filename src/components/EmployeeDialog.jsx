import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid
} from '@mui/material'

export default function EmployeeDialog({ open, onClose, onSave, initial }) {
  const [form, setForm] = React.useState(() => ({
    id: null,
    name: '',
    position: '',
    department: '',
    email: '',
    phone: ''
  }))

  React.useEffect(() => {
    if (initial) setForm(initial)
    else setForm({ id: null, name: '', position: '', department: '', email: '', phone: '' })
  }, [initial, open])

  const handleChange = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSave = () => {
    onSave(form)
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{form.id ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ mt: 0.5 }}>
          <Grid item xs={12}>
            <TextField fullWidth label="Name" value={form.name} onChange={handleChange('name')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Position" value={form.position} onChange={handleChange('position')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Department" value={form.department} onChange={handleChange('department')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Email" value={form.email} onChange={handleChange('email')} />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField fullWidth label="Phone" value={form.phone} onChange={handleChange('phone')} />
          </Grid>
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSave}>Save</Button>
      </DialogActions>
    </Dialog>
  )
}
