import React, { useState } from 'react'
import { login } from '../api'
import DarkVeil from './ui/DarkVeil'

export default function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password.trim()) {
      setError('Please enter both email and password.')
      return
    }
    try {
      setLoading(true)
      const data = await login(username, password)
      localStorage.setItem('authToken', data.token)
      onSuccess?.(data)
    } catch (err) {
      if (err?.status === 401) {
        setError('Invalid email or password.')
      } else if (err?.message) {
        setError(err.message)
      } else {
        setError('Login failed. Please try again.')
      }
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
      <style>
        {`
          .login-glass-input::placeholder { color: rgba(232,241,255,0.85); }
          .login-glass-input:focus {
            border-color: rgba(182, 210, 255, 0.95) !important;
            background: rgba(255,255,255,0.22) !important;
            box-shadow: 0 0 0 2px rgba(94, 156, 255, 0.35), inset 0 0 0 1px rgba(10,20,40,0.28) !important;
          }
        `}
      </style>

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
          maxWidth: 340,
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
          Admin Login
        </h3>
        {error && (
          <div role="alert" aria-live="polite" style={{ color: '#ffd8d8', marginBottom: 8, fontWeight: 600 }}>
            {error}
          </div>
        )}
        <form onSubmit={submit}>
          <input
            className="login-glass-input"
            value={username}
            onChange={(e) => {
              setUsername(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Email"
            style={input}
          />
          <input
            className="login-glass-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Password"
            style={input}
          />
          <button
            className="login-glass-input"
            type="submit"
            disabled={loading}
            style={{ ...input, cursor: 'pointer' }}
          >
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
        <p
          style={{
            fontSize: 12,
            color: '#e2ebff',
            marginBottom: 0,
            textShadow: '0 2px 10px rgba(0,0,0,0.45)'
          }}
        >
          First time setup?{' '}
          <a
            href="/register-admin"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/register-admin'
            }}
            style={{ color: '#e2ebff', fontWeight: 800 }}
          >
            Create the first admin
          </a>
          {' · '}
          <a
            href="/forgot-password"
            onClick={(e) => {
              e.preventDefault()
              window.location.href = '/forgot-password'
            }}
            style={{ color: '#e2ebff', fontWeight: 800 }}
          >
            Forgot password
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
