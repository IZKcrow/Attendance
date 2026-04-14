import React from 'react'
import { Alert, Stack } from '@mui/material'

export const APP_ALERT_SX = {
  width: '100%',
  borderRadius: 2,
  boxShadow: '0 10px 24px rgba(0,0,0,0.18)',
  fontWeight: 700,
  alignItems: 'center',
  '& .MuiAlert-action': {
    alignItems: 'center',
    paddingTop: 0
  },
  '& .MuiAlert-action .MuiIconButton-root': {
    color: 'inherit'
  }
}

let idCounter = 0

export function useSnackbar({
  maxSnack = 3,
  autoHideDuration = 4000,
  anchorOrigin = { vertical: 'top', horizontal: 'center' }
} = {}) {
  const [snacks, setSnacks] = React.useState([])
  const timersRef = React.useRef(new Map())

  const hide = React.useCallback((id) => {
    if (id === null || id === undefined) {
      setSnacks([])
      for (const t of timersRef.current.values()) {
        try { clearTimeout(t) } catch (_) {}
      }
      timersRef.current.clear()
      return
    }

    const t = timersRef.current.get(id)
    if (t) {
      try { clearTimeout(t) } catch (_) {}
      timersRef.current.delete(id)
    }

    setSnacks((prev) => (Array.isArray(prev) ? prev.filter((s) => s.id !== id) : []))
  }, [])

  const clearAll = React.useCallback(() => hide(null), [hide])

  const show = React.useCallback((message, severityOrOptions = 'info') => {
    if (!message) return

    const options = (() => {
      if (severityOrOptions && typeof severityOrOptions === 'object') return severityOrOptions
      if (typeof severityOrOptions === 'string') return { severity: severityOrOptions }
      return { severity: 'info' }
    })()

    const {
      severity = 'info',
      autoHideDuration: overrideDuration = autoHideDuration,
      persist: persistOpt = undefined,
      action = null
    } = options

    // Default behavior: auto-hide, but always show a close (X) button.
    // Use persist:true for critical prompts you want to keep until dismissed.
    const persist = typeof persistOpt === 'boolean' ? persistOpt : false

    const effectiveDuration = (() => {
      if (persist) return null
      if (overrideDuration === null) return null
      // If the caller didn't specify a duration and it's an error, keep it a bit longer by default.
      if (persistOpt === undefined && severity === 'error' && overrideDuration === autoHideDuration) return 6000
      if (Number.isFinite(overrideDuration)) return overrideDuration
      return severity === 'error' ? 6000 : autoHideDuration
    })()

    const id = idCounter++
    const snack = {
      id,
      message,
      severity,
      action,
      persist: persist === true,
      autoHideDuration: effectiveDuration
    }

    setSnacks((prev) => {
      const existing = Array.isArray(prev) ? prev : []
      let next = [...existing, snack]

      if (maxSnack && next.length > maxSnack) {
        // Drop oldest non-persistent first, to keep important prompts visible.
        while (next.length > maxSnack) {
          const idx = next.findIndex((s) => !s?.persist)
          if (idx >= 0) next.splice(idx, 1)
          else next.shift()
        }
      }

      return next
    })
  }, [autoHideDuration, hide, maxSnack])

  React.useEffect(() => {
    const list = Array.isArray(snacks) ? snacks : []

    // Add timers for new snacks; persist=true disables auto-hide.
    for (const s of list) {
      if (!s || s.persist) continue
      if (!Number.isFinite(s.autoHideDuration) || s.autoHideDuration <= 0) continue
      if (timersRef.current.has(s.id)) continue

      const t = setTimeout(() => hide(s.id), s.autoHideDuration)
      timersRef.current.set(s.id, t)
    }

    // Cleanup timers for removed snacks
    const alive = new Set(list.map((s) => s.id))
    for (const [id, t] of timersRef.current.entries()) {
      if (alive.has(id)) continue
      try { clearTimeout(t) } catch (_) {}
      timersRef.current.delete(id)
    }
  }, [snacks, hide])

  const SnackbarComponent = (
    <Stack
      spacing={1.5}
      sx={{
        position: 'fixed',
        zIndex: 1400,
        top: anchorOrigin?.vertical === 'top' ? 16 : 'auto',
        bottom: anchorOrigin?.vertical === 'bottom' ? 16 : 'auto',
        left: 0,
        right: 0,
        margin: '0 auto',
        width: 'min(640px, calc(100vw - 24px))',
        pointerEvents: 'none'
      }}
    >
      {(Array.isArray(snacks) ? snacks : []).map((snack) => (
        <Alert
          key={snack.id}
          severity={snack.severity || 'info'}
          variant="filled"
          sx={{ ...APP_ALERT_SX, pointerEvents: 'auto' }}
          onClose={() => hide(snack.id)}
          action={snack.action || null}
        >
          {snack.message}
        </Alert>
      ))}
    </Stack>
  )

  return { show, hide, clearAll, SnackbarComponent }
}
