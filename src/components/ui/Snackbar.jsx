import React from 'react'
import { Snackbar, Alert } from '@mui/material'

export function useSnackbar({
  autoHideDuration = 4000,
  anchorOrigin = { vertical: 'top', horizontal: 'center' }
} = {}) {
  const [snack, setSnack] = React.useState(null)

  const show = (message, severityOrOptions = 'info') => {
    if (!message) return

    if (severityOrOptions && typeof severityOrOptions === 'object') {
      const {
        severity = 'info',
        action = null,
        autoHideDuration: overrideDuration = autoHideDuration,
        onClose = null
      } = severityOrOptions
      setSnack({ message, severity, action, autoHideDuration: overrideDuration, onClose })
      return
    }

    const severity = typeof severityOrOptions === 'string' ? severityOrOptions : 'info'
    setSnack({ message, severity, action: null, autoHideDuration, onClose: null })
  }

  const hide = () => setSnack(null)

  const handleClose = (_, reason) => {
    if (reason === 'clickaway') return
    if (typeof snack?.onClose === 'function') {
      try { snack.onClose() } catch (_) {}
    }
    setSnack(null)
  }

  const SnackbarComponent = (
    <Snackbar
      open={!!snack}
      autoHideDuration={snack && snack.autoHideDuration !== undefined ? snack.autoHideDuration : autoHideDuration}
      onClose={handleClose}
      anchorOrigin={anchorOrigin}
    >
      <Alert
        onClose={handleClose}
        severity={snack?.severity || 'info'}
        variant="filled"
        sx={{ width: '100%' }}
        action={snack?.action || null}
      >
        {snack?.message}
      </Alert>
    </Snackbar>
  )

  return { show, hide, SnackbarComponent }
}
