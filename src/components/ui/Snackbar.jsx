import React from 'react'
import { Snackbar, Alert } from '@mui/material'

export function useSnackbar({
  autoHideDuration = 4000,
  anchorOrigin = { vertical: 'top', horizontal: 'center' }
} = {}) {
  const [snack, setSnack] = React.useState(null)

  const show = (message, severity = 'info') => {
    if (!message) return
    setSnack({ message, severity })
  }

  const handleClose = (_, reason) => {
    if (reason === 'clickaway') return
    setSnack(null)
  }

  const SnackbarComponent = (
    <Snackbar
      open={!!snack}
      autoHideDuration={autoHideDuration}
      onClose={handleClose}
      anchorOrigin={anchorOrigin}
    >
      <Alert
        onClose={handleClose}
        severity={snack?.severity || 'info'}
        variant="filled"
        sx={{ width: '100%' }}
      >
        {snack?.message}
      </Alert>
    </Snackbar>
  )

  return { show, SnackbarComponent }
}
