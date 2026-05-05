//UsersPage.jsx
import React from 'react'
import {
  TableCell,
  Button,
  Box,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  Stack,
  MenuItem,
  Typography
} from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'
import { setStoredAuthToken } from '../authStorage'

const INVITE_EXPIRY_OPTIONS = [
  { value: 2, label: '2 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours' },
  { value: 72, label: '3 days' },
  { value: 168, label: '7 days' }
]

function fmtDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

function buildInviteFeedback(result) {
  if (!result) return ''
  if (result.emailSent) return 'Invitation email sent successfully.'
  if (result.emailError) return `Invitation created, but email failed: ${result.emailError}`
  return 'Invitation link created. Share it manually with the invited admin.'
}

export default function UsersPage() {
  const { show, SnackbarComponent } = useSnackbar()
  const [admins, setAdmins] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [currentAdminId, setCurrentAdminId] = React.useState('')
  const [inviteDialogOpen, setInviteDialogOpen] = React.useState(false)
  const [inviteLoading, setInviteLoading] = React.useState(false)
  const [inviteError, setInviteError] = React.useState('')
  const [inviteForm, setInviteForm] = React.useState({ email: '', expiresHours: 24 })
  const [inviteResult, setInviteResult] = React.useState(null)

  React.useEffect(() => {
    loadAdmins()
    loadCurrentAdmin()
  }, [])

  const loadAdmins = async () => {
    try {
      setLoading(true)
      const data = await api.fetchAdminUsers()
      setAdmins(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
      show(`Load failed: ${err.message || err}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadCurrentAdmin = async () => {
    try {
      const res = await api.fetchMe()
      setCurrentAdminId(String(res?.user?.id || '').trim())
    } catch (_) {
      setCurrentAdminId('')
    }
  }

  const openInviteDialog = () => {
    setInviteDialogOpen(true)
    setInviteLoading(false)
    setInviteError('')
    setInviteResult(null)
    setInviteForm({ email: '', expiresHours: 24 })
  }

  const closeInviteDialog = () => {
    if (inviteLoading) return
    setInviteDialogOpen(false)
    setInviteError('')
  }

  const copyInviteLink = async (url) => {
    if (!url || typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return false
    }

    try {
      await navigator.clipboard.writeText(url)
      return true
    } catch (_) {
      return false
    }
  }

  const inviteAdmin = async () => {
    const email = String(inviteForm.email || '').trim().toLowerCase()
    const expiresHours = Number(inviteForm.expiresHours || 24)

    if (!email || !email.includes('@')) {
      setInviteError('Enter a valid admin email.')
      return
    }

    if (!Number.isFinite(expiresHours) || expiresHours < 1 || expiresHours > 168) {
      setInviteError('Select a valid invite expiry.')
      return
    }

    try {
      setInviteLoading(true)
      setInviteError('')

      const res = await api.createAdminInvitation(email, expiresHours)
      const registerPath = res?.registerPath || null
      const inviteUrl = registerPath ? `${window.location.origin}${registerPath}` : null
      const result = {
        email,
        expiresHours,
        expiresAt: res?.expiresAt || null,
        emailSent: Boolean(res?.emailSent),
        emailError: res?.emailError || '',
        inviteUrl
      }

      setInviteResult(result)

      if (inviteUrl) {
        const copied = await copyInviteLink(inviteUrl)
        if (copied) {
          show(result.emailSent ? 'Invitation email sent. Backup link copied.' : 'Invitation link copied.', 'success')
        } else {
          show(result.emailSent ? 'Invitation email sent.' : 'Invitation link created.', result.emailSent ? 'success' : 'info')
        }
      } else {
        show(result.emailSent ? 'Invitation email sent.' : 'Invitation created.', 'success')
      }
    } catch (err) {
      const message = err?.message || String(err)
      setInviteError(message)
      show(`Invite failed: ${message}`, 'error')
    } finally {
      setInviteLoading(false)
    }
  }

  const deleteAdmin = async (id) => {
    await api.deleteAdminUser(id)
    show('Admin account removed.', 'success')
    await loadAdmins()
  }

  const editAdmin = async (row) => {
    const id = String(row?.UserID || row?.userID || '').trim()
    if (!id || id !== currentAdminId) {
      throw new Error('You can only edit your own admin account.')
    }

    const username = String(row?.Username || row?.username || '').trim().toLowerCase()
    const email = String(row?.Email || row?.email || '').trim().toLowerCase()
    const res = await api.updateAdminUser(id, { username, email })
    if (res?.token) {
      setStoredAuthToken(res.token)
    }
    show('Admin profile updated.', 'success')
    await loadAdmins()
    await loadCurrentAdmin()
  }

  return (
    <>
      {SnackbarComponent}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          variant="contained"
          onClick={openInviteDialog}
          sx={{
            backgroundColor: 'var(--primary)',
            fontWeight: 800,
            textTransform: 'none',
            ':hover': { backgroundColor: 'var(--primary-dark)' }
          }}
        >
          Invite Admin
        </Button>
      </Box>

      <GenericDataTable
        title="Admins"
        columns={['User', 'Email', 'Created', 'Last Login']}
        data={admins}
        loading={loading}
        error={error}
        primaryKeyField="UserID"
        readOnly={false}
        onAdd={() => {}}
        onEdit={editAdmin}
        onDelete={deleteAdmin}
        allowAdd={false}
        allowEdit={true}
        allowDelete={true}
        formColumns={['Username', 'Email']}
        showRowDelete={true}
        actionsLabel="Action"
        canEditRow={(row) => String(row?.UserID || row?.userID || '').trim() === currentAdminId}
        canDeleteRow={(row) => String(row?.UserID || row?.userID || '').trim() !== currentAdminId}
        renderRow={(row) => (
          <>
            <TableCell>{row.Username || row.username}</TableCell>
            <TableCell>{row.Email || row.email}</TableCell>
            <TableCell>{fmtDateTime(row.CreatedAt || row.createdAt)}</TableCell>
            <TableCell>{fmtDateTime(row.LastLoginAt || row.lastLoginAt)}</TableCell>
          </>
        )}
        useDeleteDialog={true}
      />

      <Dialog open={inviteDialogOpen} onClose={closeInviteDialog} maxWidth="sm" fullWidth>
        <DialogTitle>Invite Admin</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <TextField
              fullWidth
              type="email"
              label="Admin email"
              value={inviteForm.email}
              onChange={(e) => {
                setInviteForm((prev) => ({ ...prev, email: e.target.value }))
                if (inviteError) setInviteError('')
              }}
              disabled={inviteLoading}
              helperText="This address receives the invite if email delivery is configured."
            />

            <TextField
              select
              fullWidth
              label="Invite expiry"
              value={String(inviteForm.expiresHours)}
              onChange={(e) => {
                setInviteForm((prev) => ({ ...prev, expiresHours: Number(e.target.value) }))
                if (inviteError) setInviteError('')
              }}
              disabled={inviteLoading}
            >
              {INVITE_EXPIRY_OPTIONS.map((option) => (
                <MenuItem key={option.value} value={String(option.value)}>
                  {option.label}
                </MenuItem>
              ))}
            </TextField>

            {inviteError && <Alert severity="error">{inviteError}</Alert>}

            {inviteResult && (
              <Stack spacing={1.5}>
                <Alert severity={inviteResult.emailError ? 'warning' : 'success'}>
                  {buildInviteFeedback(inviteResult)}
                </Alert>

                <TextField
                  fullWidth
                  label="Invite link"
                  value={inviteResult.inviteUrl || ''}
                  InputProps={{ readOnly: true }}
                />

                <Box>
                  <Typography variant="body2" sx={{ color: 'var(--muted)' }}>
                    Invitee: <strong>{inviteResult.email}</strong>
                  </Typography>
                  <Typography variant="body2" sx={{ color: 'var(--muted)' }}>
                    Expires: <strong>{fmtDateTime(inviteResult.expiresAt)}</strong>
                  </Typography>
                </Box>
              </Stack>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeInviteDialog} disabled={inviteLoading}>
            {inviteResult ? 'Close' : 'Cancel'}
          </Button>
          {inviteResult?.inviteUrl && (
            <Button
              onClick={async () => {
                const copied = await copyInviteLink(inviteResult.inviteUrl)
                show(copied ? 'Invitation link copied.' : 'Clipboard access was blocked.', copied ? 'success' : 'warning')
              }}
              disabled={inviteLoading}
            >
              Copy Link
            </Button>
          )}
          <Button
            variant="contained"
            onClick={inviteAdmin}
            disabled={inviteLoading}
            sx={{
              backgroundColor: 'var(--primary)',
              fontWeight: 800,
              textTransform: 'none',
              ':hover': { backgroundColor: 'var(--primary-dark)' }
            }}
          >
            {inviteLoading ? 'Creating...' : 'Create Invite'}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
