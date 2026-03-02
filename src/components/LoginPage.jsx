import React, { useEffect, useRef, useState } from 'react'
import { login } from '../api'

function LoginDarkVeil() {
  const veilRefA = useRef(null)
  const veilRefB = useRef(null)
  const veilRefC = useRef(null)

  useEffect(() => {
    let raf = 0
    let start = 0
    const speedMultiplier = 1.7
    const tick = (ts) => {
      if (!start) start = ts
      const t = ((ts - start) / 1000) * speedMultiplier
      const hue = Math.sin(t * 0.28) * 8

      if (veilRefA.current) {
        const xA = Math.sin(t * 0.68) * 2.4
        const yA = Math.cos(t * 0.52) * 1.9
        const sA = 1 + Math.sin(t * 0.55) * 0.02
        const rA = Math.sin(t * 0.34) * 0.8
        veilRefA.current.style.transform = `translate3d(${xA}%, ${yA}%, 0) scale(${sA}) rotate(${rA}deg) skewX(${Math.sin(t * 0.28) * 0.65}deg)`
        veilRefA.current.style.opacity = String(0.56 + Math.sin(t * 0.95) * 0.07)
        veilRefA.current.style.filter = `hue-rotate(${hue}deg) blur(0.7px)`
      }

      if (veilRefB.current) {
        const xB = Math.sin(t * 0.44 + 1.2) * -2.8
        const yB = Math.cos(t * 0.6 + 0.4) * 2.2
        const sB = 1 + Math.cos(t * 0.48) * 0.02
        const rB = Math.cos(t * 0.32) * -0.9
        veilRefB.current.style.transform = `translate3d(${xB}%, ${yB}%, 0) scale(${sB}) rotate(${rB}deg) skewY(${Math.cos(t * 0.26) * 0.7}deg)`
        veilRefB.current.style.opacity = String(0.45 + Math.cos(t * 0.76) * 0.08)
        veilRefB.current.style.filter = `hue-rotate(${hue * 0.7}deg) blur(1.05px)`
      }

      if (veilRefC.current) {
        const xC = Math.sin(t * 0.74 + 0.9) * 1.8
        const yC = Math.cos(t * 0.66 + 1.4) * -1.4
        const sC = 1 + Math.sin(t * 0.56 + 0.5) * 0.014
        const rC = Math.sin(t * 0.4) * 0.55
        veilRefC.current.style.transform = `translate3d(${xC}%, ${yC}%, 0) scale(${sC}) rotate(${rC}deg)`
        veilRefC.current.style.opacity = String(0.3 + Math.sin(t * 1.02) * 0.05)
        veilRefC.current.style.filter = `hue-rotate(${hue * 0.85}deg) blur(0.55px)`
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `
            radial-gradient(120% 85% at 35% -10%, hsla(206, 100%, 56%, 0.86), transparent 55%),
            radial-gradient(85% 75% at 85% 10%, hsla(218, 100%, 20%, 0.52), transparent 60%),
            radial-gradient(80% 70% at 22% 100%, hsla(196, 95%, 22%, 0.40), transparent 60%),
            linear-gradient(150deg, #021629 0%, #041324 55%, #020a14 100%)
          `,
          pointerEvents: 'none'
        }}
      />
      <div
        ref={veilRefA}
        style={{
          position: 'absolute',
          inset: '-22%',
          background: `
            linear-gradient(126deg,
              rgba(155, 228, 255, 0.30) 0%,
              rgba(98, 186, 255, 0.20) 30%,
              rgba(47, 116, 220, 0.12) 58%,
              rgba(13, 58, 150, 0.08) 100%
            ),
            radial-gradient(70% 56% at 20% 36%, rgba(175, 236, 255, 0.24), transparent 72%),
            radial-gradient(64% 50% at 78% 70%, rgba(89, 174, 255, 0.18), transparent 74%)
          `,
          mixBlendMode: 'screen',
          borderRadius: '42%',
          willChange: 'transform, filter, opacity',
          pointerEvents: 'none'
        }}
      />
      <div
        ref={veilRefB}
        style={{
          position: 'absolute',
          inset: '-26%',
          background: `
            linear-gradient(42deg,
              rgba(102, 189, 255, 0.24) 0%,
              rgba(64, 140, 238, 0.14) 36%,
              rgba(21, 78, 185, 0.09) 62%,
              rgba(7, 45, 118, 0.07) 100%
            ),
            radial-gradient(58% 54% at 72% 28%, rgba(168, 235, 255, 0.20), transparent 74%),
            radial-gradient(56% 52% at 28% 82%, rgba(82, 170, 255, 0.16), transparent 78%)
          `,
          mixBlendMode: 'soft-light',
          borderRadius: '48%',
          willChange: 'transform, filter, opacity',
          pointerEvents: 'none'
        }}
      />
      <div
        ref={veilRefC}
        style={{
          position: 'absolute',
          inset: '-14%',
          background: `
            radial-gradient(42% 38% at 30% 30%, rgba(160,236,255,0.42), transparent 72%),
            radial-gradient(40% 35% at 72% 62%, rgba(74,168,255,0.36), transparent 74%)
          `,
          mixBlendMode: 'screen',
          willChange: 'transform, filter, opacity',
          pointerEvents: 'none'
        }}
      />
    </div>
  )
}

export default function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setError(null)
    if (!username.trim() || !password.trim()) {
      setError('Please enter both username and password.')
      return
    }
    try {
      setLoading(true)
      const data = await login(username, password)
      localStorage.setItem('authToken', data.token)
      onSuccess?.(data)
    } catch (err) {
      if (err?.status === 401) {
        setError('Invalid username or password.')
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
    <div style={{ minHeight: '100vh', position: 'relative', display: 'grid', placeItems: 'center', padding: 16, isolation: 'isolate' }}>
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
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <LoginDarkVeil />
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
        <h3 style={{ marginTop: 0, color: '#f8fbff', textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>Login</h3>
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
            placeholder="Username"
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
          <button className="login-glass-input" type="submit" disabled={loading} style={{ ...input, cursor:'pointer' }}>
            {loading ? 'Signing in...' : 'Login'}
          </button>
        </form>
        <p style={{ fontSize: 12, color: '#e2ebff', marginBottom: 0, textShadow: '0 2px 10px rgba(0,0,0,0.45)' }}>
          Demo account: admin / admin
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
