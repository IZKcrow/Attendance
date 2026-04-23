//UsersPage.jsx
import React from 'react'
import { TableCell, Button, Box } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

function fmtDateTime(value) {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return d.toLocaleString()
}

export default function UsersPage() {
  const { show, SnackbarComponent } = useSnackbar()
  const [admins, setAdmins] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)
  const [currentAdminEmail, setCurrentAdminEmail] = React.useState('')

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
      setCurrentAdminEmail(String(res?.user?.email || '').trim().toLowerCase())
    } catch (_) {
      setCurrentAdminEmail('')
    }
  }

  const inviteAdmin = async () => {
    const email = (window.prompt('Invite new admin (email):') || '').trim()
    if (!email) return

    try {
      const res = await api.createAdminInvitation(email)
      const registerPath = res?.registerPath
      const url = registerPath
        ? `${window.location.origin}${registerPath}`
        : null

      if (url) {
        try {
          await navigator.clipboard.writeText(url)
          if (res?.emailSent) {
            show('Invitation email sent. Backup link copied to clipboard.', 'success')
          } else if (res?.emailError) {
            show(`Invitation created, but email failed: ${res.emailError}`, 'warning')
          } else {
            show('Invitation link copied to clipboard.', 'success')
          }
        } catch (_) {
          if (res?.emailSent) {
            show('Invitation email sent. Backup link logged to console.', 'info')
          } else if (res?.emailError) {
            show(`Invitation created, but email failed: ${res.emailError}`, 'warning')
          } else {
            show('Invitation created. Copy from console (clipboard blocked).', 'info')
          }
        }
        console.log('Admin invitation link:', url)
      } else {
        show(res?.emailSent ? 'Invitation email sent.' : 'Invitation created.', 'success')
      }
    } catch (err) {
      show(`Invite failed: ${err.message || err}`, 'error')
    }
  }

  const deleteAdmin = async (id) => {
    await api.deleteAdminUser(id)
    show('Admin account removed.', 'success')
    await loadAdmins()
  }

  return (
    <>
      {SnackbarComponent}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 1 }}>
        <Button
          variant="contained"
          onClick={inviteAdmin}
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
        columns={['Email', 'Created', 'Last Login']}
        data={admins}
        loading={loading}
        error={error}
        primaryKeyField="UserID"
        readOnly={false}
        onAdd={() => {}}
        onEdit={() => {}}
        onDelete={deleteAdmin}
        allowAdd={false}
        allowEdit={false}
        allowDelete={true}
        showRowDelete={true}
        canDeleteRow={(row) => String(row?.Email || row?.email || '').trim().toLowerCase() !== currentAdminEmail}
        renderRow={(row) => (
          <>
            <TableCell>{row.Email || row.email}</TableCell>
            <TableCell>{fmtDateTime(row.CreatedAt || row.createdAt)}</TableCell>
            <TableCell>{fmtDateTime(row.LastLoginAt || row.lastLoginAt)}</TableCell>
          </>
        )}
        useDeleteDialog={true}
      />
    </>
  )
}
