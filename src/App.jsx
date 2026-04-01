import React, { useMemo, useState } from 'react'
import { CssBaseline } from '@mui/material'
import Dashboard from './components/Dashboard'
import LoginPage from './components/LoginPage'
import RegisterAdminPage from './components/RegisterAdminPage'
import ForgotPasswordPage from './components/ForgotPasswordPage'
import ResetPasswordPage from './components/ResetPasswordPage'

const LOGIN_PATH = '/login'
const DASHBOARD_PATH = '/dashboard'
const REGISTER_ADMIN_PATH = '/register-admin'
const FORGOT_PASSWORD_PATH = '/forgot-password'
const RESET_PASSWORD_PATH = '/reset-password'

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
  const [path, setPath] = useState(() =>
    typeof window === 'undefined' ? '/' : normalizePath(window.location.pathname)
  )

  const navigate = (to) => {
    const next = normalizePath(to)
    replacePath(next)
    setPath(next)
  }

  const handleLoginSuccess = (data) => {
    setToken(data?.token || localStorage.getItem('authToken'))
    navigate(DASHBOARD_PATH)
  }

  const handleRegisterSuccess = (data) => {
    setToken(data?.token || localStorage.getItem('authToken'))
    navigate(DASHBOARD_PATH)
  }

  const handleLogout = () => {
    localStorage.removeItem('authToken')
    setToken(null)
    navigate(LOGIN_PATH)
  }

  const isAuthed = useMemo(() => Boolean(token), [token])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const onPop = () => {
      setPath(normalizePath(window.location.pathname))
    }

    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const current = normalizePath(window.location.pathname)
    if (current !== path) {
      setPath(current)
      return
    }

    if (isAuthed) {
      if (
        path === '/' ||
        path === LOGIN_PATH ||
        path === REGISTER_ADMIN_PATH ||
        path === FORGOT_PASSWORD_PATH ||
        path === RESET_PASSWORD_PATH
      ) {
        navigate(DASHBOARD_PATH)
      }
    } else {
      if (
        path !== LOGIN_PATH &&
        path !== REGISTER_ADMIN_PATH &&
        path !== FORGOT_PASSWORD_PATH &&
        path !== RESET_PASSWORD_PATH
      ) {
        navigate(LOGIN_PATH)
      }
    }
  }, [isAuthed, path])

  return (
    <>
      <CssBaseline />
      {isAuthed ? (
        <Dashboard onLogout={handleLogout} />
      ) : path === REGISTER_ADMIN_PATH ? (
        <RegisterAdminPage onSuccess={handleRegisterSuccess} />
      ) : path === FORGOT_PASSWORD_PATH ? (
        <ForgotPasswordPage />
      ) : path === RESET_PASSWORD_PATH ? (
        <ResetPasswordPage onSuccess={handleRegisterSuccess} />
      ) : (
        <LoginPage onSuccess={handleLoginSuccess} />
      )}
    </>
  )
}
