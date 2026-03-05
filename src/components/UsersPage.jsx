//UsersPage.jsx
import React from 'react'
import { TableCell } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

export default function UsersPage() {
  const { show, SnackbarComponent } = useSnackbar()
  const [users, setUsers] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    try {
      setLoading(true)
      const data = await api.fetchUsers()
      setUsers(Array.isArray(data) ? data : [])
      setError(null)
    } catch (err) {
      setError(err.message)
      show(`Load failed: ${err.message || err}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    try {
      const result = await api.createUser(form)
      setUsers([...users, result])
      setError(null)
    } catch (err) {
      setError(err.message)
      show(`Create failed: ${err.message || err}`, 'error')
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateUser(form.UserID, form)
      setUsers(users.map(u => u.UserID === form.UserID ? result : u))
      setError(null)
    } catch (err) {
      setError(err.message)
      show(`Update failed: ${err.message || err}`, 'error')
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteUser(id)
      setUsers(users.filter(u => u.UserID !== id))
      setError(null)
      show('User deleted.', 'success')
    } catch (err) {
      setError(err.message)
      show(`Delete failed: ${err.message || err}`, 'error')
    }
  }

  return (
    <>
      {SnackbarComponent}
      <GenericDataTable
        title="Users"
        columns={['name', 'position', 'email', 'department']}
        data={users}
        loading={loading}
        error={error}
        primaryKeyField="UserID"
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        renderRow={(row) => (
          <>
            <TableCell>{row.name}</TableCell>
            <TableCell>{row.position}</TableCell>
            <TableCell>{row.email}</TableCell>
            <TableCell>{row.department}</TableCell>
          </>
        )}
      />
    </>
  )
}
