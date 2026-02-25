import React, { useMemo, useState } from 'react'
import { CssBaseline } from '@mui/material'
import Dashboard from './components/Dashboard'
import LoginPage from './components/LoginPage'

export default function App() {
  // Keep auth in localStorage so a page refresh preserves the session.
  const [token, setToken] = useState(() => localStorage.getItem('authToken'))

  const handleLoginSuccess = (data) => {
    setToken(data?.token || localStorage.getItem('authToken'))
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setToken(null)
    // optional refresh to clear any cached data
    // window.location.reload()
  }

  const isAuthed = useMemo(() => Boolean(token), [token])

  return (
    <>
      <CssBaseline />
      {isAuthed ? (
        <Dashboard onLogout={handleLogout} />
      ) : (
        <LoginPage onSuccess={handleLoginSuccess} />
      )}
    </>
  )
}
