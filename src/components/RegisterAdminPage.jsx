import React from 'react'
import { Button } from '@mui/material'
import DarkVeil from './ui/DarkVeil'
import * as api from '../api'
import { setStoredAuthToken } from '../authStorage'

function normalizePath(path) {
  if (!path) return '/'
  const cleaned = path.replace(/\/+$/, '')
  return cleaned || '/'
}

function replacePath(path) {
  if (typeof window === 'undefined') return
  const current = normalizePath(window.location.pathname)
  if (current !== path) {
    window.history.replaceState({}, '', path)
  }
}

export default function RegisterAdminPage({ onSuccess }) {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const token = (params.get('token') || '').trim()
  const invitedEmail = (params.get('email') || '').trim()

  const [hasAdmin, setHasAdmin] = React.useState(null)
  const [email, setEmail] = React.useState(() => invitedEmail)
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  React.useEffect(() => {
    if (token) return undefined

    let mounted = true
    api.fetchBootstrapStatus()
      .then((r) => { if (mounted) setHasAdmin(!!r?.hasAdmin) })
      .catch(() => { if (mounted) setHasAdmin(false) })
    return () => { mounted = false }
  }, [token])

  const submit = async (e) => {
    e.preventDefault()
    setError(null)

    const em = email.trim().toLowerCase()
    if (!em || !em.includes('@')) return setError('Enter a valid email.')
    if (!password || password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    try {
      const res = token
        ? await api.registerAdminWithToken(token, em, password)
        : await api.setupAdmin(em, password)

      if (res?.token) {
        setStoredAuthToken(res.token)
      }

      onSuccess?.(res)
      replacePath('/dashboard')
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

  const blocked = !token && hasAdmin === true
  const title = token ? 'Accept Admin Invitation' : 'Set Up Admin'
  const description = token
    ? 'Use this invite token to create your admin account locally. Pasted invitation links work even when email sending is disabled.'
    : 'Create the first admin account for this local installation.'

  return (
    <div
      style={{
        width: '100vw',
        minHeight: '100dvh',
        position: 'relative',
        display: 'grid',
        placeItems: 'center',
        padding: 16,
        isolation: 'isolate',
        overflow: 'hidden'
      }}
    >
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <DarkVeil
          hueShift={395}
          noiseIntensity={0}
          scanlineIntensity={0}
          speed={0.75}
          scanlineFrequency={0}
          warpAmount={0.5}
          resolutionScale={1.2}
        />
      </div>

      <div
        style={{
          maxWidth: 380,
          width: '100%',
          padding: 22,
          borderRadius: 14,
          background: 'rgba(14, 18, 38, 0.34)',
          border: '1px solid rgba(214, 214, 214, 0.6)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 2,
          boxShadow: '0 14px 34px rgba(0,0,0,0.45)'
        }}
      >
        <h3 style={{ marginTop: 0, color: '#f8fbff', textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
          {title}
        </h3>

        <p style={{ fontSize: 12, lineHeight: 1.55, color: '#e2ebff', marginTop: 0, marginBottom: 12, textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
          {description}
        </p>

        {blocked && (
          <div role="alert" style={{ color: '#ffd8d8', marginBottom: 10, fontWeight: 700 }}>
            Admin already exists. You need an invitation token.
          </div>
        )}

        {error && (
          <div role="alert" aria-live="polite" style={{ color: '#ffd8d8', marginBottom: 10, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={token ? 'Invited admin email' : 'Admin email'}
            style={input}
            disabled={loading}
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password (min 8 chars)"
            style={input}
            disabled={loading}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm password"
            style={input}
            disabled={loading}
          />

          <Button
            variant="contained"
            type="submit"
            disabled={loading || blocked}
            sx={{
              width: '100%',
              borderRadius: 2,
              fontWeight: 800,
              textTransform: 'none',
              backgroundColor: 'var(--primary)',
              ':hover': { backgroundColor: 'var(--primary-dark)' }
            }}
          >
            {loading ? 'Working...' : (token ? 'Create Invited Admin' : 'Create Admin')}
          </Button>
        </form>

        <p style={{ fontSize: 12, color: '#e2ebff', marginBottom: 0, marginTop: 10, textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault()
              replacePath('/login')
              window.location.href = '/login'
            }}
            style={{ color: '#e2ebff', fontWeight: 800 }}
          >
            Back to login
          </a>
        </p>
      </div>
    </div>
  )
}

const input = {
  width: '100%',
  padding: 11,
  marginBottom: 10,
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.42)',
  background: 'rgba(255,255,255,0.16)',
  color: '#f8fbff',
  fontWeight: 600,
  outline: 'none',
  boxShadow: 'inset 0 0 0 1px rgba(10,20,40,0.25)'
}

