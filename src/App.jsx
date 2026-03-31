import React, { useMemo, useState } from 'react'
import { CssBaseline } from '@mui/material'
import Dashboard from './components/Dashboard'
import LoginPage from './components/LoginPage'

const LOGIN_PATH = '/login'
const DASHBOARD_PATH = '/dashboard'

const normalizePath = (path) => {
  if (!path) return '/'
  const cleaned = path.replace(/\/+$/, '')
  return cleaned || '/'
}

const replacePath = (path) => {
  if (typeof window === 'undefined') return
  const current = normalizePath(window.location.pathname)
  if (current !== path) {
    window.history.replaceState({}, '', path)
  }
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('authToken'))

  const handleLoginSuccess = (data) => {
    setToken(data?.token || localStorage.getItem('authToken'))
    replacePath(DASHBOARD_PATH)
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setToken(null)
    replacePath(LOGIN_PATH)
  }

  const isAuthed = useMemo(() => Boolean(token), [token])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const syncAuthPath = () => {
      const path = normalizePath(window.location.pathname)
      if (isAuthed) {
        if (path === '/' || path === LOGIN_PATH) {
          replacePath(DASHBOARD_PATH)
        }
      } else if (path !== LOGIN_PATH) {
        replacePath(LOGIN_PATH)
      }
    }

    syncAuthPath()
    window.addEventListener('popstate', syncAuthPath)
    return () => window.removeEventListener('popstate', syncAuthPath)
  }, [isAuthed])

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
