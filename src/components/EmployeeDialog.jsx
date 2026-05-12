//EmployeeDialog.jsx
import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  MenuItem
} from '@mui/material'
import { COMPANY_DEPARTMENTS, isKnownDepartment } from '../constants/departments'

const EMPTY_FORM = {
  id: null,
  name: '',
  position: '',
  department: '',
  biometricStaffCode: '',
  biometricUserId: '',
  email: '',
  phone: ''
}

function normalizeForm(initial) {
  const next = { ...EMPTY_FORM, ...(initial || {}) }
  next.department = isKnownDepartment(next.department) ? next.department : ''
  return next
}

export default function EmployeeDialog({ open, onClose, onSave, initial }) {
  const [form, setForm] = React.useState(() => normalizeForm())
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (initial) setForm(normalizeForm(initial))
    else setForm(normalizeForm())
  }, [initial, open])

  const handleChange = (key) => (e) => setForm(prev => ({ ...prev, [key]: e.target.value }))

  const handleSave = async () => {
    if (saving) return
    setSaving(true)
    try {
      const ok = await onSave(form)
      if (ok !== false) onClose()
    } finally {
      setSaving(false)
    }
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
            <TextField
              select
              fullWidth
              label="Department"
              value={form.department || ''}
              onChange={handleChange('department')}
            >
              <MenuItem value="">Select department</MenuItem>
              {COMPANY_DEPARTMENTS.map((department) => (
                <MenuItem key={department} value={department}>{department}</MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Biometric Staff Code"
              value={form.biometricStaffCode || ''}
              onChange={handleChange('biometricStaffCode')}
            />
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField
              fullWidth
              label="Biometric User ID"
              value={form.biometricUserId || ''}
              onChange={handleChange('biometricUserId')}
            />
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
        <Button onClick={onClose} disabled={saving}>Cancel</Button>
        <Button variant="contained" onClick={handleSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save'}
        </Button>
      </DialogActions>
    </Dialog>
  )
}
