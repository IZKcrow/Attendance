import React from 'react'
import { Button } from '@mui/material'
import DarkVeil from './ui/DarkVeil'
import * as api from '../api'

export default function ResetPasswordPage({ onSuccess }) {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const token = (params.get('token') || '').trim()

  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)

    if (!token) return setError('Missing reset token.')
    if (!password || password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')

    setLoading(true)
    try {
      const res = await api.resetPassword(token, password)
      if (res?.token) {
        localStorage.setItem('authToken', res.token)
      }
      onSuccess?.(res)
      window.location.href = '/dashboard'
    } catch (err) {
      setError(err?.message || String(err))
    } finally {
      setLoading(false)
    }
  }

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
          Reset Password
        </h3>

        {!token && (
          <div role="alert" style={{ color: '#ffd8d8', marginBottom: 10, fontWeight: 700 }}>
            Missing reset token.
          </div>
        )}

        {error && (
          <div role="alert" aria-live="polite" style={{ color: '#ffd8d8', marginBottom: 10, fontWeight: 700 }}>
            {error}
          </div>
        )}

        <form onSubmit={submit}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password (min 8 chars)"
            style={input}
            disabled={loading}
          />
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Confirm new password"
            style={input}
            disabled={loading}
          />

          <Button
            variant="contained"
            type="submit"
            disabled={loading || !token}
            sx={{
              width: '100%',
              borderRadius: 2,
              fontWeight: 800,
              textTransform: 'none',
              backgroundColor: 'var(--primary)',
              ':hover': { backgroundColor: 'var(--primary-dark)' }
            }}
          >
            {loading ? 'Working...' : 'Reset Password'}
          </Button>
        </form>

        <p style={{ fontSize: 12, color: '#e2ebff', marginBottom: 0, marginTop: 10, textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
          <a
            href="/login"
            onClick={(e) => {
              e.preventDefault()
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
