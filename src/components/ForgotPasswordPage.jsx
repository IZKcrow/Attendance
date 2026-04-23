import React from 'react'
import { Button } from '@mui/material'
import DarkVeil from './ui/DarkVeil'
import * as api from '../api'

export default function ForgotPasswordPage() {
  const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams()
  const [email, setEmail] = React.useState(() => (params.get('email') || '').trim())
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [link, setLink] = React.useState(null)
  const [message, setMessage] = React.useState(null)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    setLink(null)
    setMessage(null)

    const em = email.trim().toLowerCase()
    if (!em || !em.includes('@')) return setError('Enter a valid email.')

    setLoading(true)
    try {
      const res = await api.forgotPassword(em)
      const resetPath = res?.resetPath
      const resetUrl = resetPath && typeof window !== 'undefined'
        ? `${window.location.origin}${resetPath}`
        : null

      if (resetUrl) {
        try {
          await navigator.clipboard.writeText(resetUrl)
          if (res?.emailSent) {
            setMessage('Password reset email sent. Backup reset link copied to clipboard.')
          } else if (res?.emailError) {
            setMessage(`Reset link created, but email failed: ${res.emailError}`)
          } else {
            setMessage('Reset link copied to clipboard.')
          }
        } catch (_) {
          if (res?.emailSent) {
            setMessage('Password reset email sent. Backup reset link logged to console.')
          } else if (res?.emailError) {
            setMessage(`Reset link created, but email failed: ${res.emailError}`)
          } else {
            setMessage('Reset link created. Copy it from the page or console.')
          }
        }
        console.log('Password reset link:', resetUrl)
        setLink(resetUrl)
      } else {
        setMessage('If the email exists, a password reset email has been sent.')
      }
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
          Forgot Password
        </h3>

        {error && (
          <div role="alert" aria-live="polite" style={{ color: '#ffd8d8', marginBottom: 10, fontWeight: 700 }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ color: '#e2ebff', marginBottom: 10, fontWeight: 700, fontSize: 13, wordBreak: 'break-word' }}>
            {message}
          </div>
        )}

        {link && (
          <div style={{ color: '#e2ebff', marginBottom: 10, fontWeight: 700, fontSize: 13, wordBreak: 'break-all' }}>
            {link.startsWith('http') ? (
              <>
                Reset link (copied if allowed):{' '}
                <a href={link} style={{ color: '#e2ebff', fontWeight: 800 }}>
                  {link}
                </a>
              </>
            ) : (
              link
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Admin email"
            style={input}
            disabled={loading}
          />

          <Button
            variant="contained"
            type="submit"
            disabled={loading}
            sx={{
              width: '100%',
              borderRadius: 2,
              fontWeight: 800,
              textTransform: 'none',
              backgroundColor: 'var(--primary)',
              ':hover': { backgroundColor: 'var(--primary-dark)' }
            }}
          >
            {loading ? 'Working...' : 'Send Reset Email'}
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
