import React from 'react'
import { Alert, Box, Collapse } from '@mui/material'

export default function useAppSnackbar() {
  const [snack, setSnack] = React.useState(null)

  const show = React.useCallback((message, severity = 'info') => {
    setSnack({ message, severity })
  }, [])

  React.useEffect(() => {
    if (!snack) return undefined
    const t = setTimeout(() => setSnack(null), 3500)
    return () => clearTimeout(t)
  }, [snack])

  const SnackbarComponent = (
    <Collapse in={!!snack} mountOnEnter unmountOnExit>
      <Box
        sx={{
          position: 'sticky',
          top: 8,
          zIndex: 1200,
          mb: 1.5
        }}
      >
        <Alert
          onClose={() => setSnack(null)}
          severity={snack?.severity || 'info'}
          variant="filled"
        >
          {snack?.message || ''}
        </Alert>
      </Box>
    </Collapse>
  )

  return { show, SnackbarComponent }
}
