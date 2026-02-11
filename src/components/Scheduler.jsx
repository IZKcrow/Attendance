import React from 'react'
import { Box, Grid, Typography, Select, MenuItem, Button, Divider } from '@mui/material'
import * as api from '../api/employees'

const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
const SHIFTS = ['Off','Morning','Afternoon','Night']

function cellKey(empId, dayIdx) { return `${empId}_${dayIdx}` }

export default function Scheduler() {
  const [employees, setEmployees] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [schedule, setSchedule] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem('schedule_v1') || '{}') } catch { return {} }
  })

  React.useEffect(() => {
    let mounted = true
    setLoading(true)
    api.fetchEmployees()
      .then(data => { if (!mounted) return; setEmployees(Array.isArray(data) ? data : []) })
      .catch(() => setEmployees([]))
      .finally(() => mounted && setLoading(false))
    return () => { mounted = false }
  }, [])

  const setShift = (empId, dayIdx, shift) => {
    setSchedule(prev => {
      const copy = { ...prev }
      copy[cellKey(empId, dayIdx)] = shift
      return copy
    })
  }

  const save = () => {
    localStorage.setItem('schedule_v1', JSON.stringify(schedule))
  }

  const clear = () => { setSchedule({}); localStorage.removeItem('schedule_v1') }

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="h6">Weekly Schedule</Typography>
        <Box>
          <Button onClick={save} variant="contained" sx={{ mr: 1 }}>Save</Button>
          <Button onClick={clear}>Clear</Button>
        </Box>
      </Box>

      <Divider sx={{ mb: 2 }} />

      <Grid container spacing={1} sx={{ maxHeight: '60vh', overflow: 'auto' }}>
        <Grid item xs={3} sx={{ borderRight: '1px solid #eee', p: 1 }}>
          <Box sx={{ fontWeight: 600, mb: 1 }}>Employee</Box>
          {loading && <div>Loading...</div>}
          {!loading && employees.map(e => (
            <Box key={e.id} sx={{ py: 1, borderBottom: '1px solid #f0f0f0' }}>{e.name}</Box>
          ))}
        </Grid>

        {DAYS.map((d, di) => (
          <Grid item xs key={d} sx={{ p: 1, borderRight: '1px solid #f5f5f5' }}>
            <Box sx={{ fontWeight: 600, mb: 1 }}>{d}</Box>
            {employees.map(emp => (
              <Box key={cellKey(emp.id, di)} sx={{ mb: 1 }}>
                <Select
                  fullWidth
                  size="small"
                  value={schedule[cellKey(emp.id, di)] || 'Off'}
                  onChange={(ev) => setShift(emp.id, di, ev.target.value)}
                >
                  {SHIFTS.map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
                </Select>
              </Box>
            ))}
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
