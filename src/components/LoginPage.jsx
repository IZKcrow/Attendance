import React, { useEffect, useState } from 'react'
import { fetchBootstrapStatus, login, setupAdmin } from '../api'
import { setStoredAuthToken } from '../authStorage'
import DarkVeil from './ui/DarkVeil'

export default function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [hasAdmin, setHasAdmin] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let mounted = true

    fetchBootstrapStatus()
      .then((data) => {
        if (mounted) {
          setHasAdmin(Boolean(data?.hasAdmin))
        }
      })
      .catch((err) => {
        if (mounted) {
          setHasAdmin(true)
          setError(err?.message || 'Unable to load the admin setup status.')
        }
      })

    return () => {
      mounted = false
    }
  }, [])

  const isSetupMode = hasAdmin === false
  const isCheckingSetup = hasAdmin === null

  const clearError = () => {
    if (error) setError(null)
  }

  const submit = async (e) => {
    e.preventDefault()
    clearError()

    const trimmedUsername = username.trim().toLowerCase()
    const trimmedEmail = email.trim().toLowerCase()
    if (!trimmedUsername || !password.trim()) {
      setError(isSetupMode ? 'Please enter your username and password.' : 'Please enter both user and password.')
      return
    }

    if (isSetupMode) {
      if (!trimmedEmail || !trimmedEmail.includes('@')) {
        setError('Please enter a valid admin email.')
        return
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters.')
        return
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match.')
        return
      }
    }

    try {
      setLoading(true)

      if (isSetupMode) {
        const data = await setupAdmin(trimmedUsername, trimmedEmail, password)
        setStoredAuthToken(data.token)
        onSuccess?.(data)
        return
      }

      const data = await login(trimmedUsername, password)
      setStoredAuthToken(data.token)
      onSuccess?.(data)
    } catch (err) {
      if (!isSetupMode && err?.status === 401) {
        setError('Invalid user or password.')
      } else if (err?.message) {
        setError(err.message)
      } else {
        setError(isSetupMode ? 'Admin setup failed. Please try again.' : 'Login failed. Please try again.')
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
          maxWidth: 360,
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
          {isSetupMode ? 'Create Local Admin' : 'Admin Login'}
        </h3>

        <p
          style={{
            fontSize: 12,
            lineHeight: 1.5,
            color: '#e2ebff',
            marginTop: 0,
            marginBottom: 12,
            textShadow: '0 2px 10px rgba(0,0,0,0.45)'
          }}
        >
          {isCheckingSetup
            ? 'Checking the local admin setup on this machine.'
            : isSetupMode
              ? 'No admin account exists yet. Create the first local admin here to keep the system private on this computer.'
              : 'Sign in with your local admin account, or open a pasted invite/reset link directly while testing on localhost.'}
        </p>

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
              clearError()
            }}
            placeholder="Username"
            style={input}
            disabled={loading || isCheckingSetup}
          />
          {isSetupMode && (
            <input
              className="login-glass-input"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                clearError()
              }}
              placeholder="Admin email"
              style={input}
              disabled={loading || isCheckingSetup}
            />
          )}
          <input
            className="login-glass-input"
            type="password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value)
              clearError()
            }}
            placeholder={isSetupMode ? 'Password (min 8 chars)' : 'Password'}
            style={input}
            disabled={loading || isCheckingSetup}
          />
          {isSetupMode && (
            <input
              className="login-glass-input"
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                clearError()
              }}
              placeholder="Confirm password"
              style={input}
              disabled={loading || isCheckingSetup}
            />
          )}
          <button
            className="login-glass-input"
            type="submit"
            disabled={loading || isCheckingSetup}
            style={{ ...input, cursor: loading || isCheckingSetup ? 'wait' : 'pointer', marginBottom: 0 }}
          >
            {isCheckingSetup
              ? 'Checking...'
              : loading
                ? (isSetupMode ? 'Creating admin...' : 'Signing in...')
                : (isSetupMode ? 'Create Admin Account' : 'Login')}
          </button>
        </form>

        {!isCheckingSetup && !isSetupMode && (
          <p style={{ fontSize: 12, color: '#e2ebff', marginBottom: 0, marginTop: 10, textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
            <a
              href="/forgot-password"
              onClick={(e) => {
                e.preventDefault()
                window.location.href = '/forgot-password'
              }}
              style={{ color: '#e2ebff', fontWeight: 800 }}
            >
              Forgot password?
            </a>
          </p>
        )}
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
  boxShadow: 'inset 0 0 0 1px rgba(10,20,40,0.25)',
  fontFamily: 'inherit'
}
