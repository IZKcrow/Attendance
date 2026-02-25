//OverviewDashboard.jsx
import React from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Skeleton,
  Chip,
  Button
} from '@mui/material'
import { alpha } from '@mui/material/styles'
import AccessTimeOutlinedIcon from '@mui/icons-material/AccessTimeOutlined'
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline'
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline'
import CancelOutlinedIcon from '@mui/icons-material/CancelOutlined'
import ScheduleOutlinedIcon from '@mui/icons-material/ScheduleOutlined'
import ExitToAppOutlinedIcon from '@mui/icons-material/ExitToAppOutlined'
import ReportGmailerrorredOutlinedIcon from '@mui/icons-material/ReportGmailerrorredOutlined'
import ArrowDropUpOutlinedIcon from '@mui/icons-material/ArrowDropUpOutlined'
import ArrowDropDownOutlinedIcon from '@mui/icons-material/ArrowDropDownOutlined'
import RemoveOutlinedIcon from '@mui/icons-material/RemoveOutlined'
import { Pie, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement
} from 'chart.js'
import * as api from '../api'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement)

const getCssVar = (name, fallback) => {
  if (typeof window === 'undefined') return fallback
  const val = getComputedStyle(document.documentElement).getPropertyValue(name)
  return (val && val.trim()) || fallback
}

const accent = {
  primary: getCssVar('--primary', '#009063'),
  primaryDark: getCssVar('--primary-dark', '#006b4b'),
  primaryLight: getCssVar('--primary-light', '#00a877'),
  surface: getCssVar('--surface', 'rgba(229,229,229,0.72)'),
  card: getCssVar('--card', 'rgba(229,229,229,0.72)'),
  border: getCssVar('--border', '#c7cdd1'),
  text: getCssVar('--text', '#323232'),
  muted: getCssVar('--muted', '#6b7280'),
  secondary: getCssVar('--secondary', '#323232'),
  danger: '#b91c1c',
  warning: '#b45309'
}

const darkCard = {
  background: accent.card,
  border: `1px solid ${accent.border}`,
  color: accent.text,
  borderRadius: 3,
  boxShadow: '0 10px 24px rgba(0,0,0,0.2)'
}

function toDateStr(d) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

function groupByDate(records) {
  const map = new Map()
  records.forEach(r => {
    const day = toDateStr(r.AttendanceDate || r.AttendanceDay || r.CreatedAt || new Date())
    if (!map.has(day)) map.set(day, [])
    map.get(day).push(r)
  })
  return map
}

function enrichToday(records) {
  return records.map(r => {
    const status = (r.AttendanceSummary || r.Status || '').toLowerCase()
    const late = status.includes('late') || (r.MinutesLate || 0) > 0
    const absent = status.includes('absent')
    const earlyLeave = status.includes('early') || (r.MinutesEarlyLeave || 0) > 0
    const missing = !(r.MorningTimeIn && r.MorningTimeOut && r.AfternoonTimeIn && r.AfternoonTimeOut)
    const incomplete = !absent && missing
    const onTime = !absent && !late && !earlyLeave && !incomplete
    return { ...r, flags: { onTime, late, absent, earlyLeave, incomplete } }
  })
}

export default function OverviewDashboard() {
  const [overviewRecords, setOverviewRecords] = React.useState([]) // last 30 days
  const [todayRecords, setTodayRecords] = React.useState([])
  const [employees, setEmployees] = React.useState([])
  const [loadingOverview, setLoadingOverview] = React.useState(true)
  const [loadingDept, setLoadingDept] = React.useState(true)
  const [loadingRecent, setLoadingRecent] = React.useState(true)
  const [now, setNow] = React.useState(new Date())

  React.useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  React.useEffect(() => {
    loadEmployees()
    loadOverview()
    loadToday()
  }, [])

  const loadEmployees = async () => {
    try {
      const data = await api.fetchEmployees()
      setEmployees(Array.isArray(data) ? data : [])
    } catch (_) {}
  }

  const loadOverview = async () => {
    try {
      setLoadingOverview(true)
      setLoadingRecent(true)
      const today = new Date()
      const from = toDateStr(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000))
      const to = toDateStr(today)
      const attData = await api.fetchAttendanceByRange(from, to)
      setOverviewRecords(Array.isArray(attData) ? attData : [])
    } catch (_) {
      setOverviewRecords([])
    } finally {
      setLoadingOverview(false)
      setLoadingRecent(false)
    }
  }

  const loadToday = async () => {
    try {
      setLoadingDept(true)
      const attData = await api.fetchAttendanceToday()
      setTodayRecords(Array.isArray(attData) ? attData : [])
    } catch (_) {
      setTodayRecords([])
    } finally {
      setLoadingDept(false)
    }
  }

  const todayStr = React.useMemo(() => toDateStr(new Date()), [])
  const yesterdayStr = React.useMemo(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return toDateStr(d)
  }, [])

  const computeStats = React.useCallback(records => {
    const enriched = enrichToday(records)
    const onTime = enriched.filter(r => r.flags.onTime).length
    const late = enriched.filter(r => r.flags.late).length
    const absent = enriched.filter(r => r.flags.absent).length
    const earlyLeave = enriched.filter(r => r.flags.earlyLeave).length
    const incomplete = enriched.filter(r => r.flags.incomplete).length
    const totalLogs = enriched.length
    return { onTime, late, absent, earlyLeave, incomplete, totalLogs }
  }, [])

  // Stats (today / yesterday)
  const stats = React.useMemo(() => computeStats(todayRecords), [todayRecords, computeStats])
  const yesterdayRecords = React.useMemo(
    () => overviewRecords.filter(r => toDateStr(r.AttendanceDate || r.AttendanceDay || r.CreatedAt) === yesterdayStr),
    [overviewRecords, yesterdayStr]
  )
  const yesterdayStats = React.useMemo(() => computeStats(yesterdayRecords), [yesterdayRecords, computeStats])

  const makeDelta = (todayVal, prevVal, goodWhen = 'up') => {
    if (prevVal === undefined || prevVal === null) return { text: 'No yesterday data', tone: 'neutral' }
    if (prevVal === 0 && todayVal === 0) return { text: 'No change', tone: 'neutral' }
    const pct = prevVal === 0 ? 100 : Math.round(((todayVal - prevVal) / prevVal) * 100)
    const sign = pct > 0 ? '+' : ''
    const tone = goodWhen === 'up'
      ? (todayVal >= prevVal ? 'positive' : 'negative')
      : (todayVal <= prevVal ? 'positive' : 'negative')
    return { text: `${sign}${pct}% vs yesterday`, tone }
  }

  const newEmployeesToday = employees.filter(e => toDateStr(e.CreatedAt || e.HireDate) === todayStr).length

  const deltas = {
    employees: newEmployeesToday > 0
      ? { text: `+${newEmployeesToday} new employee${newEmployeesToday > 1 ? 's' : ''} added`, tone: 'positive' }
      : { text: 'No new employees today', tone: 'neutral' },
    onTime: makeDelta(stats.onTime, yesterdayStats.onTime, 'up'),
    absent: makeDelta(stats.absent, yesterdayStats.absent, 'down'),
    late: makeDelta(stats.late, yesterdayStats.late, 'down'),
    earlyLeave: makeDelta(stats.earlyLeave, yesterdayStats.earlyLeave, 'down'),
    incomplete: makeDelta(stats.incomplete, yesterdayStats.incomplete, 'down')
  }

  // Pie for today
  const pieData = {
    labels: ['On Time', 'Late', 'Absent', 'Early Leave', 'Incomplete'],
    datasets: [
      {
        data: [
          stats.onTime || 0,
          stats.late || 0,
          stats.absent || 0,
          stats.earlyLeave || 0,
          stats.incomplete || 0
        ],
        backgroundColor: [
          accent.primary,
          '#d97706',
          '#b91c1c',
          accent.primaryDark,
          accent.muted
        ],
        borderWidth: 0
      }
    ]
  }

  // Department Attendance today (percent of employees per dept that logged today)
  const deptAttendance = React.useMemo(() => {
    const empDept = {}
    employees.forEach(emp => {
      const dept = (emp.Department || emp.department || 'Unassigned').trim() || 'Unassigned'
      const id = emp.EmployeeID || emp.EmployeeId || emp.id || emp.EmployeeCode
      if (id) empDept[id] = dept
    })

    const totals = {}
    Object.values(empDept).forEach(dept => {
      totals[dept] = (totals[dept] || 0) + 1
    })

    const present = {}
    todayRecords.forEach(r => {
      const eid = r.EmployeeID || r.EmployeeId || r.EmployeeCode || r.EmployeeName
      if (!eid) return
      const dept = (r.Department || r.department || empDept[eid] || 'Unassigned').trim() || 'Unassigned'
      present[dept] = (present[dept] || 0) + 1
    })

    if (Object.keys(totals).length === 0) {
      Object.keys(present).forEach(dept => { totals[dept] = present[dept] })
    }

    const labels = Object.keys(totals).sort()
    const percents = labels.map(label => {
      const total = totals[label] || 1
      const logged = present[label] || 0
      return Math.min(100, Math.round((logged / total) * 100))
    })
    return { labels, percents, totals, present }
  }, [employees, todayRecords])

  // Comparison chart (last 14 days on-time rate)
  const comparisonData = React.useMemo(() => {
    const map = groupByDate(overviewRecords)
    const days = Array.from({ length: 14 }).map((_, idx) => {
      const d = new Date()
      d.setDate(d.getDate() - (13 - idx))
      return d
    })
    const rates = days.map(dayObj => {
      const key = toDateStr(dayObj)
      const recs = map.get(key) || []
      if (!recs.length) return 0
      const enriched = enrichToday(recs)
      const onTime = enriched.filter(r => r.flags.onTime).length
      return Math.round((onTime / recs.length) * 100)
    })
    const labels = days.map(d =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    )
    return { labels, rates }
  }, [overviewRecords])

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ ...darkCard, p: 2, height: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTimeOutlinedIcon sx={{ color: accent.primary }} />
              <Typography variant="h4" sx={{ fontWeight: 800, color: accent.text }}>{now.toLocaleTimeString()}</Typography>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5, color: accent.muted }}>Realtime Insight</Typography>
            <Typography variant="subtitle1" sx={{ mt: 2, fontWeight: 700, color: accent.text }}>
              Today: {now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            </Typography>
            <Button variant="contained" fullWidth sx={{ mt: 2, background: accent.primary, color: '#fff', boxShadow: '0 6px 14px rgba(0,144,99,0.3)', '&:hover': { background: accent.primaryDark } }}>
              Advanced Configuration
            </Button>
          </Paper>
        </Grid>

        <Grid item xs={12} md={9}>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <StatCard title="Total Employees" value={employees.length} icon={<PeopleOutlineIcon />} deltaText={deltas.employees.text} deltaTone={deltas.employees.tone} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="On Time" value={stats.onTime} accent={accent.primary} icon={<CheckCircleOutlineIcon />} deltaText={deltas.onTime.text} deltaTone={deltas.onTime.tone} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="Absent" value={stats.absent} accent={accent.danger} icon={<CancelOutlinedIcon />} deltaText={deltas.absent.text} deltaTone={deltas.absent.tone} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="Late Arrival" value={stats.late} accent={accent.warning} icon={<ScheduleOutlinedIcon />} deltaText={deltas.late.text} deltaTone={deltas.late.tone} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="Early Leave" value={stats.earlyLeave} accent={accent.primaryDark} icon={<ExitToAppOutlinedIcon />} deltaText={deltas.earlyLeave.text} deltaTone={deltas.earlyLeave.tone} />
            </Grid>
            <Grid item xs={12} md={4}>
              <StatCard title="Incomplete" value={stats.incomplete} accent={accent.muted} icon={<ReportGmailerrorredOutlinedIcon />} deltaText={deltas.incomplete.text} deltaTone={deltas.incomplete.tone} />
            </Grid>
          </Grid>
        </Grid>
      </Grid>

      <Grid container spacing={2}>
        <Grid item xs={12} md={8}>
          <Paper sx={{ ...darkCard, p: 2, minHeight: 320 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: accent.muted }}>Attendance Comparison (Last 14 days)</Typography>
            {loadingOverview ? (
              <Skeleton variant="rounded" height={240} />
            ) : (
              <Box sx={{ height: 240 }}>
                <Line
                  data={{
                    labels: comparisonData.labels,
                    datasets: [
                      {
                        label: 'On-time %',
                        data: comparisonData.rates,
                        borderColor: accent.primary,
                        backgroundColor: 'rgba(0,144,99,0.18)',
                        tension: 0.4,
                        fill: true,
                        pointRadius: 4
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, max: 100, ticks: { color: accent.text, callback: v => `${v}%` }, grid: { color: `${accent.border}55` } },
                      x: { ticks: { color: accent.text, maxTicksLimit: 7 }, grid: { color: `${accent.border}22` } }
                    }
                  }}
                />
              </Box>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={4}>
          <Paper sx={{ ...darkCard, p: 2, minHeight: 320 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: accent.muted }}>Department Attendance (Today)</Typography>
            {loadingDept ? (
              <Skeleton variant="rounded" height={240} />
            ) : (
              <Box sx={{ height: 240 }}>
                <Bar
                  data={{
                    labels: deptAttendance.labels,
                    datasets: [
                      {
                        label: '% logged today',
                        data: deptAttendance.percents,
                        backgroundColor: accent.primary,
                        borderRadius: 6
                      }
                    ]
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: {
                      y: { beginAtZero: true, max: 100, ticks: { color: accent.text, callback: v => `${v}%` }, grid: { color: `${accent.border}55` } },
                      x: { ticks: { color: accent.text }, grid: { display: false } }
                    }
                  }}
                />
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ ...darkCard, p: 2 }}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
          Recent Logs (Today)
        </Typography>
        {loadingRecent ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                {['Employee', 'Date', 'Time', 'Status'].map(h => (
                  <Box component="th" key={h} sx={{ textAlign: 'left', padding: '8px', color: accent.text, borderBottom: `1px solid ${accent.border}` }}>{h}</Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {getRecentLogs(todayRecords).map((row, idx) => (
                <Box component="tr" key={idx}>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.EmployeeName || row.EmployeeCode || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.AttendanceDate || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.__logTime || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{renderStatusChip(row.AttendanceSummary || row.Status || '-', accent)}</Box>
                </Box>
              ))}
              {getRecentLogs(todayRecords).length === 0 && (
                <Box component="tr">
                  <Box component="td" colSpan={4} sx={{ padding: '10px', textAlign: 'center' }}>No recent logs</Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
      </Paper>
    </Box>
  )
}

function StatCard({ title, value, accent: color = '#2563eb', icon = null, deltaText, deltaTone = 'neutral' }) {
  const toneMap = {
    positive: { color: accent.primary || '#009063', bg: alpha(accent.primary || '#009063', 0.14), Icon: ArrowDropUpOutlinedIcon },
    negative: { color: accent.danger || '#b91c1c', bg: alpha(accent.danger || '#b91c1c', 0.14), Icon: ArrowDropDownOutlinedIcon },
    neutral: { color: accent.muted || '#6b7280', bg: alpha(accent.muted || '#6b7280', 0.16), Icon: RemoveOutlinedIcon }
  }
  const tone = toneMap[deltaTone] || toneMap.neutral
  const DeltaIcon = tone.Icon
  return (
    <Paper sx={{ ...darkCard, p: 2, height: '100%' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="h4" sx={{ fontWeight: 800, color, lineHeight: 1.1 }}>{value}</Typography>
        {icon && (
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              backgroundColor: alpha(color, 0.14),
              display: 'grid',
              placeItems: 'center'
            }}
          >
            {React.cloneElement(icon, { sx: { color, fontSize: 18 } })}
          </Box>
        )}
      </Box>
      <Typography
        variant="caption"
        sx={{
          textTransform: 'uppercase',
          letterSpacing: 0.6,
          color: accent.muted,
          display: 'block'
        }}
      >
        {title}
      </Typography>
      {deltaText && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
          <Box
            sx={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              backgroundColor: tone.bg,
              display: 'grid',
              placeItems: 'center'
            }}
          >
            <DeltaIcon sx={{ fontSize: 18, color: tone.color }} />
          </Box>
          <Typography variant="body2" sx={{ color: tone.color }}>{deltaText}</Typography>
        </Box>
      )}
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
  return enriched.sort((a, b) => b.__sort - a.__sort).slice(0, 10)
}

function renderStatusChip(raw, palette) {
  const s = (raw || '').toLowerCase()
  const colors = s.includes('late')
    ? { bg: 'rgba(217,119,6,0.14)', fg: '#b45309' }
    : s.includes('absent')
      ? { bg: 'rgba(185,28,28,0.14)', fg: '#991b1b' }
      : s.includes('early')
        ? { bg: 'rgba(0,144,99,0.12)', fg: palette.primaryDark || '#006b4b' }
        : s.includes('incomplete')
          ? { bg: 'rgba(148,163,184,0.18)', fg: palette.muted || '#6b7280' }
          : { bg: 'rgba(0,144,99,0.18)', fg: palette.primary || '#009063' }
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
