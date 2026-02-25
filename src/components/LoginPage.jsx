import React, { useState } from 'react'
import { login } from '../api'

export default function LoginPage({ onSuccess }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    try {
      setLoading(true)
      const data = await login(username, password)
      localStorage.setItem('authToken', data.token)
      onSuccess?.(data)
    } catch (err) {
      setError(err.message || 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 320, margin: '80px auto', padding: 20, borderRadius: 12, background: '#fff' }}>
      <h3>Login</h3>
      {error && <div style={{ color: 'red', marginBottom: 8 }}>{error}</div>}
      <form onSubmit={submit}>
        <input value={username} onChange={e=>setUsername(e.target.value)} placeholder="Username" style={input} />
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" style={input} />
        <button type="submit" disabled={loading} style={{ ...input, cursor:'pointer' }}>
          {loading ? 'Signing in…' : 'Login'}
        </button>
      </form>
      <p style={{ fontSize: 12, color: '#555' }}>Demo account: admin / admin</p>
    </div>
  )
}

const input = { width:'100%', padding:10, marginBottom:10, borderRadius:8, border:'1px solid #ccc' }
