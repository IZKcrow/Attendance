import React from 'react'
import { TableCell, Box } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'

export default function UsersPage() {
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
    }
  }

  const handleEdit = async (form) => {
    try {
      const result = await api.updateUser(form.UserID, form)
      setUsers(users.map(u => u.UserID === form.UserID ? result : u))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    try {
      await api.deleteUser(id)
      setUsers(users.filter(u => u.UserID !== id))
      setError(null)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <GenericDataTable
      title="Users"
      columns={['FirstName', 'LastName', 'Email', 'Role']}
      data={users}
      loading={loading}
      error={error}
      primaryKeyField="UserID"
      onAdd={handleAdd}
      onEdit={handleEdit}
      onDelete={handleDelete}
      renderRow={(row) => (
        <>
          <TableCell>{row.FirstName}</TableCell>
          <TableCell>{row.LastName}</TableCell>
          <TableCell>{row.Email}</TableCell>
          <TableCell>{row.Role}</TableCell>
        </>
      )}
    />
  )
}
