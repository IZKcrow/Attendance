//OverviewDashboard.jsx
import React from 'react'
import { Box, Grid, Paper, Typography, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip } from '@mui/material'
import { Pie, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement } from 'chart.js'
import * as api from '../api'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement)

function toDateStr(d) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

const getCssVar = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name)
  return (val && val.trim()) || fallback
}

export default function OverviewDashboard() {
  const palette = React.useMemo(() => ({
    primary: getCssVar('--primary', '#2563eb'),
    primaryLight: getCssVar('--primary-light', '#e0e8ff'),
    secondary: getCssVar('--secondary', '#7c3aed'),
    accent: getCssVar('--accent', '#fbbf24'),
    text: getCssVar('--text', '#0f172a'),
    cardShadow: '0 6px 16px rgba(15,31,61,0.08)'
  }), [])

  const [records, setRecords] = React.useState([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setLoading(true)
      const today = new Date()
      const fromDate = new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)
      const data = await api.fetchAttendanceByRange(toDateStr(fromDate), toDateStr(today))
      setRecords(Array.isArray(data) ? data : [])
    } catch (err) {
      // swallow for dashboard
    } finally {
      setLoading(false)
    }
  }

  const stats = React.useMemo(() => {
    const norm = records.map(r => (r.AttendanceSummary || r.Status || '').toLowerCase())
    const onTime = norm.filter(s => s.includes('on-time') || s === 'on time' || s === 'present').length
    const late = norm.filter(s => s.includes('late')).length
    const early = norm.filter(s => s.includes('early')).length
    const absent = norm.filter(s => s.includes('absent')).length
    const total = onTime + late + early + absent
    return { total, late, onTime, early, absent }
  }, [records])

  const pieData = {
    labels: ['On Time', 'Late', 'Absent', 'Early Leave'],
    datasets: [
      {
        data: stats.total ? [stats.onTime, stats.late, stats.absent, stats.early] : [1, 1, 1, 1],
        backgroundColor: [
          '#16a34a', // on-time green
          '#f97316', // late orange
          '#dc2626', // absent red
          '#4f46e5'  // early leave purple
        ],
        borderWidth: 0
      }
    ]
  }

  const trend = React.useMemo(() => {
    const perDay = {}
    records.forEach(r => {
      const day = r.AttendanceDate || ''
      const s = (r.AttendanceSummary || r.Status || '').toLowerCase()
      if (!perDay[day]) perDay[day] = { on: 0, late: 0 }
      if (s.includes('late')) perDay[day].late += 1
      else if (s.includes('on-time') || s === 'on time' || s === 'present') perDay[day].on += 1
    })
    const labels = Object.keys(perDay).sort()
    return {
      labels,
      datasets: [
        {
          label: 'On-Time',
          data: labels.map(l => perDay[l].on),
          backgroundColor: 'rgba(22, 163, 74, 0.7)'
        },
        {
          label: 'Late',
          data: labels.map(l => perDay[l].late),
          backgroundColor: 'rgba(249, 115, 22, 0.8)'
        }
      ]
    }
  }, [records])

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Grid container spacing={2}>
        <Grid item xs={6} md={3}>
          <StatCard title="Total Logs (30d)" value={stats.total} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard title="On Time" value={stats.onTime} accent={palette.primary} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard title="Late" value={stats.late} accent={palette.accent} />
        </Grid>
        <Grid item xs={6} md={3}>
          <StatCard title="Absent" value={stats.absent} accent={palette.secondary} />
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: palette.cardShadow, minHeight: 300, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: palette.text }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: palette.text }}>Attendance Breakdown</Typography>
            {loading ? (
              <Skeleton variant="rounded" height={220} />
            ) : (
              <Box sx={{ height: 220 }}>
                <Pie
                  key={`${stats.total}-${stats.late}-${stats.absent}-${stats.early}`}
                  data={pieData}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: {
                      animateRotate: true,
                      animateScale: true,
                      duration: 700,
                      easing: 'easeOutQuad'
                    },
                    plugins: { legend: { position: 'bottom', labels: { color: palette.text } } }
                  }}
                />
              </Box>
            )}
          </Paper>
        </Grid>
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, borderRadius: 2, boxShadow: palette.cardShadow, minHeight: 320, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: palette.text }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: palette.text }}>On-Time vs Late (Last 30 Days)</Typography>
            {loading ? (
              <Skeleton variant="rounded" height={240} />
            ) : (
              <Box sx={{ height: 240 }}>
                <Bar
                  data={trend}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { color: palette.text } } },
                    scales: {
                      y: {
                        beginAtZero: true,
                        ticks: { precision: 0, color: palette.text },
                        grid: { color: 'rgba(0,0,0,0.08)' }
                      },
                      x: {
                        ticks: { color: palette.text },
                        grid: { display: false }
                      }
                    }
                  }}
                />
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2, borderRadius: 2, boxShadow: palette.cardShadow, backgroundColor: 'var(--surface)', border: '1px solid var(--border)', color: palette.text }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: palette.text }}>
          Recent Logs
        </Typography>
        {loading ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <TableContainer>
            <Table size="small" sx={{ '& th, & td': { borderColor: 'var(--border)', color: palette.text } }}>
              <TableHead>
                <TableRow>
                  <TableCell><strong>Employee</strong></TableCell>
                  <TableCell><strong>Date</strong></TableCell>
                  <TableCell><strong>Time</strong></TableCell>
                  <TableCell><strong>Status</strong></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {getRecentLogs(records).map((row, idx) => (
                  <TableRow key={idx} hover>
                    <TableCell>{row.EmployeeName || row.EmployeeCode || '-'}</TableCell>
                    <TableCell>{row.AttendanceDate || '-'}</TableCell>
                    <TableCell>{row.__logTime || '-'}</TableCell>
                    <TableCell>{renderStatusChip(row.AttendanceSummary || row.Status || '-', palette)}</TableCell>
                  </TableRow>
                ))}
                {getRecentLogs(records).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} align="center">No recent logs</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>
    </Box>
  )
}

function StatCard({ title, value, accent = 'var(--primary, #2563eb)' }) {
  return (
    <Paper sx={{ p: 2, borderRadius: 2, boxShadow: '0 6px 16px rgba(0,0,0,0.35)', backgroundColor: 'var(--surface)', border: '1px solid var(--border)' }}>
      <Typography variant="caption" sx={{ textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--muted, #9ca3af)' }}>{title}</Typography>
      <Typography variant="h5" sx={{ fontWeight: 800, color: accent }}>{value}</Typography>
    </Paper>
  )
}

function pickLogTime(r) {
  const candidates = [
    r.LogTime,
    r.MorningTimeIn,
    r.MorningTimeOut,
    r.AfternoonTimeIn,
    r.AfternoonTimeOut,
    r.CreatedAt
  ].filter(Boolean)
  if (!candidates.length) return null
  const first = candidates[0]
  const d = new Date(first)
  if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  // try literal string HH:mm
  if (typeof first === 'string' && /^\d{2}:\d{2}/.test(first)) return first.slice(0, 5)
  return String(first)
}

function getRecentLogs(records = []) {
  const enriched = records.map(r => {
    const time = pickLogTime(r)
    const sortKey = (() => {
      const datePart = r.AttendanceDate ? new Date(r.AttendanceDate) : new Date()
      const t = time && /^\d{2}:\d{2}/.test(time) ? time : '00:00'
      const [h, m] = t.split(':').map(Number)
      datePart.setHours(h || 0, m || 0, 0, 0)
      return datePart.getTime()
    })()
    return { ...r, __logTime: time || '-', __sort: sortKey }
  })
  return enriched
    .sort((a, b) => b.__sort - a.__sort)
    .slice(0, 10)
}

function renderStatusChip(raw, palette) {
  const s = (raw || '').toLowerCase()
  const colors = s.includes('late')
    ? { bg: 'rgba(249,115,22,0.16)', fg: '#c2410c' }
    : s.includes('absent')
      ? { bg: 'rgba(220,38,38,0.16)', fg: '#991b1b' }
      : s.includes('early')
        ? { bg: 'rgba(79,70,229,0.16)', fg: '#4338ca' }
        : { bg: 'rgba(22,163,74,0.16)', fg: '#166534' }
  return (
    <Chip
      label={raw || '-'}
      size="small"
      sx={{
        backgroundColor: colors.bg,
        color: colors.fg,
        fontWeight: 700,
        textTransform: 'capitalize'
      }}
    />
  )
}
