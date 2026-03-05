//OverviewDashboard.jsx
import React from 'react'
import {
  Box,
  Grid,
  Paper,
  Typography,
  Skeleton,
  Chip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem
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
import { Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement
} from 'chart.js'
import * as api from '../api'

ChartJS.register(Tooltip, Legend, CategoryScale, LinearScale, PointElement, LineElement, BarElement)

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
    const day = r.NormalizedDate
      ? r.NormalizedDate
      : toDateStr(r.AttendanceDate || r.AttendanceDay || r.CreatedAt || r.date || r.attendance_date || r.Date || new Date())
    if (!map.has(day)) map.set(day, [])
    map.get(day).push(r)
  })
  return map
}

function enrichToday(records, opts = {}) {
  const now = opts.now ? new Date(opts.now) : new Date()
  const todayStr = toDateStr(now)
  const morningOutHour = Number.isFinite(opts.morningOutHour) ? opts.morningOutHour : 12
  const afternoonOutHour = Number.isFinite(opts.afternoonOutHour) ? opts.afternoonOutHour : 17

  return records.map(r => {
    const status = (r.AttendanceSummary || r.Status || '').toLowerCase()
    const late = status.includes('late') || (r.MinutesLate || 0) > 0
    const absent = status.includes('absent')
    const earlyLeave = status.includes('early') || (r.MinutesEarlyLeave || 0) > 0

    const hasMorningIn = !!r.MorningTimeIn
    const hasMorningOut = !!r.MorningTimeOut
    const hasAfternoonIn = !!r.AfternoonTimeIn
    const hasAfternoonOut = !!r.AfternoonTimeOut

    const recordDate = toDateStr(
      r.AttendanceDate || r.AttendanceDay || r.CreatedAt || r.date || r.attendance_date || r.Date || now
    )
    const isPastRecord = recordDate < todayStr
    const isTodayRecord = recordDate === todayStr
    const hourNow = now.getHours()

    const requireMorningOut = isPastRecord || (isTodayRecord && hourNow >= morningOutHour)
    const requireAfternoonOut = isPastRecord || (isTodayRecord && hourNow >= afternoonOutHour)

    let incomplete = false
    if (!absent) {
      if (requireMorningOut && (!hasMorningIn || !hasMorningOut)) incomplete = true
      if (requireAfternoonOut && (!hasAfternoonIn || !hasAfternoonOut)) incomplete = true
    }

    // During in-progress shifts, allow "on time so far" if morning-in exists and no late/early/incomplete flags.
    const onTime = !absent && hasMorningIn && !late && !earlyLeave && !incomplete

    return { ...r, flags: { onTime, late, absent, earlyLeave, incomplete } }
  })
}

export default function OverviewDashboard({ onOpenAttendance }) {
  const [overviewRecords, setOverviewRecords] = React.useState([]) // last 30 days
  const [todayRecords, setTodayRecords] = React.useState([])
  const [employees, setEmployees] = React.useState([])
  const [loadingOverview, setLoadingOverview] = React.useState(true)
  const [loadingDept, setLoadingDept] = React.useState(true)
  const [now, setNow] = React.useState(new Date())
  const [openDeptDialog, setOpenDeptDialog] = React.useState(false)
  const [deptQuery, setDeptQuery] = React.useState('')
  const [deptSort, setDeptSort] = React.useState('percent-desc')

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
      const today = new Date()
      const from = toDateStr(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000))
      const to = toDateStr(today)
      const attData = await api.fetchAttendanceByRange(from, to)
      const arr = Array.isArray(attData) ? attData : []
      const normalized = arr.map(r => {
        const rawDate =
          r.AttendanceDate ??
          r.AttendanceDay ??
          r.CreatedAt ??
          r.date ??
          r.attendance_date ??
          r.Date
        return { ...r, NormalizedDate: toDateStr(rawDate || new Date()) }
      })
      setOverviewRecords(normalized)
    } catch (_) {
      setOverviewRecords([])
    } finally {
      setLoadingOverview(false)
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

  const todayStr = React.useMemo(() => toDateStr(now), [now])
  const yesterdayStr = React.useMemo(() => {
    const d = new Date(now)
    d.setDate(d.getDate() - 1)
    return toDateStr(d)
  }, [now])

  const computeStats = React.useCallback((records, refNow = new Date()) => {
    const enriched = enrichToday(records, { now: refNow })
    let onTime = 0, late = 0, absent = 0, earlyLeave = 0, incomplete = 0
    for (const r of enriched) {
      // Priority: absent > incomplete > late > earlyLeave > onTime
      if (r.flags.absent) absent += 1
      else if (r.flags.incomplete) incomplete += 1
      else if (r.flags.late) late += 1
      else if (r.flags.earlyLeave) earlyLeave += 1
      else onTime += 1
    }
    const totalLogs = enriched.length
    return { onTime, late, absent, earlyLeave, incomplete, totalLogs }
  }, [])

  // Stats (today / yesterday)
  const stats = React.useMemo(() => computeStats(todayRecords, now), [todayRecords, now, computeStats])
  const yesterdayRecords = React.useMemo(
    () => overviewRecords.filter(r => (r.NormalizedDate || toDateStr(r.AttendanceDate || r.AttendanceDay || r.CreatedAt || r.date || r.attendance_date || r.Date)) === yesterdayStr),
    [overviewRecords, yesterdayStr]
  )
  const yesterdayStats = React.useMemo(() => computeStats(yesterdayRecords, now), [yesterdayRecords, now, computeStats])

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


  // Department Attendance today (percent of employees per dept that logged today)
  // Keep chart readable at scale: Top 5 + Others
  const deptAttendance = React.useMemo(() => {
    const empDept = {}
    const empDeptByCode = {}
    employees.forEach(emp => {
      const dept = (emp.Department || emp.department || 'Unassigned').trim() || 'Unassigned'
      const id = emp.EmployeeID || emp.EmployeeId || emp.id || null
      const code = emp.EmployeeCode || emp.employeeCode || null
      if (id) empDept[id] = dept
      if (code) empDeptByCode[code] = dept
    })

    const totals = {}
    Object.values(empDept).forEach(dept => {
      totals[dept] = (totals[dept] || 0) + 1
    })

    const present = {}
    const seen = new Set()
    todayRecords.forEach(r => {
      const eid = r.EmployeeID || r.EmployeeId || r.id || null
      const ecode = r.EmployeeCode || r.employeeCode || null
      const uniqueKey = eid || ecode
      if (!uniqueKey || seen.has(uniqueKey)) return
      seen.add(uniqueKey)
      const dept = (r.Department || r.department || (eid ? empDept[eid] : null) || (ecode ? empDeptByCode[ecode] : null) || 'Unassigned').trim() || 'Unassigned'
      present[dept] = (present[dept] || 0) + 1
    })

    if (Object.keys(totals).length === 0) {
      Object.keys(present).forEach(dept => { totals[dept] = present[dept] })
    }

    const raw = Object.keys(totals).map((label) => {
      const total = totals[label] || 1
      const logged = present[label] || 0
      return {
        label,
        total,
        logged,
        percent: Math.min(100, Math.round((logged / total) * 100))
      }
    })

    const ranked = [...raw].sort((a, b) => {
      if (b.percent !== a.percent) return b.percent - a.percent
      return b.logged - a.logged
    })

    const TOP_N = 5
    const top = ranked.slice(0, TOP_N)
    const rest = ranked.slice(TOP_N)

    if (rest.length) {
      const othersTotal = rest.reduce((sum, r) => sum + r.total, 0)
      const othersLogged = rest.reduce((sum, r) => sum + r.logged, 0)
      top.push({
        label: 'Others',
        total: othersTotal,
        logged: othersLogged,
        percent: othersTotal > 0 ? Math.min(100, Math.round((othersLogged / othersTotal) * 100)) : 0
      })
    }

    const labels = top.map((r) => `${r.label} (${r.logged}/${r.total})`)
    const percents = top.map((r) => r.percent)
    return { labels, percents, totals, present, ranked }
  }, [employees, todayRecords])

  const filteredRankedDepartments = React.useMemo(() => {
    const q = deptQuery.trim().toLowerCase()
    let rows = (deptAttendance.ranked || []).filter((r) =>
      !q || r.label.toLowerCase().includes(q)
    )
    switch (deptSort) {
      case 'name-asc':
        rows = [...rows].sort((a, b) => a.label.localeCompare(b.label))
        break
      case 'name-desc':
        rows = [...rows].sort((a, b) => b.label.localeCompare(a.label))
        break
      case 'logged-desc':
        rows = [...rows].sort((a, b) => b.logged - a.logged || b.total - a.total)
        break
      case 'logged-asc':
        rows = [...rows].sort((a, b) => a.logged - b.logged || a.total - b.total)
        break
      case 'percent-asc':
        rows = [...rows].sort((a, b) => a.percent - b.percent || a.label.localeCompare(b.label))
        break
      case 'percent-desc':
      default:
        rows = [...rows].sort((a, b) => b.percent - a.percent || b.logged - a.logged)
        break
    }
    return rows
  }, [deptAttendance.ranked, deptQuery, deptSort])

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
      const enriched = enrichToday(recs, { now })
      const onTime = enriched.filter(r => r.flags.onTime).length
      return Math.round((onTime / recs.length) * 100)
    })
    const labels = days.map(d =>
      d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    )
    return { labels, rates }
  }, [overviewRecords, now])

  const recentLogs = React.useMemo(() => getRecentLogs(todayRecords), [todayRecords])
  const employeeDeptById = React.useMemo(() => {
    const map = {}
    employees.forEach((e) => {
      const id = e.EmployeeID || e.EmployeeId || e.id || null
      const code = e.EmployeeCode || e.employeeCode || null
      const dept = e.Department || e.department || null
      if (id && dept) map[id] = dept
      if (code && dept) map[code] = dept
    })
    return map
  }, [employees])

  return (
    <Box sx={{ display: 'grid', gap: 2 }}>
      <Grid container spacing={2}>
        <Grid item xs={12} md={3}>
          <Paper sx={{ ...darkCard, p: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <AccessTimeOutlinedIcon sx={{ color: accent.primary }} />
              <Typography variant="h4" sx={{ fontWeight: 800, color: accent.text }}>{now.toLocaleTimeString()}</Typography>
            </Box>
            <Typography variant="body2" sx={{ opacity: 0.7, mt: 0.5, color: accent.muted }}>Realtime Insight</Typography>
            <Typography variant="subtitle1" sx={{ mt: 'auto', pt: 1.5, fontWeight: 700, color: accent.text }}>
              Today: {now.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
            </Typography>
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, color: accent.muted }}>
                Department Attendance (Today)
              </Typography>
              <Button size="small" variant="outlined" onClick={() => setOpenDeptDialog(true)}>
                View All
              </Button>
            </Box>
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
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
            Recent Logs (Today)
          </Typography>
          <Typography variant="caption" sx={{ color: accent.primary, fontWeight: 700 }}>
            ● Live Updates
          </Typography>
        </Box>
        {loadingDept ? (
          <Skeleton variant="rounded" height={200} />
        ) : (
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                {['Employee', 'Department', 'Date', 'Time', 'Log Type', 'Status', 'Device'].map(h => (
                  <Box component="th" key={h} sx={{ textAlign: 'left', padding: '8px', color: accent.text, borderBottom: `1px solid ${accent.border}` }}>{h}</Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {recentLogs.map((row, idx) => (
                <Box component="tr" key={idx} sx={getRecentRowSx(row.AttendanceSummary || row.Status || '')}>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.EmployeeName || row.EmployeeCode || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>
                    {row.Department || row.department || employeeDeptById[row.EmployeeID] || employeeDeptById[row.EmployeeCode] || '-'}
                  </Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.AttendanceDate || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.__logTime || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.__logType || '-'}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{renderStatusChip(row.AttendanceSummary || row.Status || '-', accent)}</Box>
                  <Box component="td" sx={{ padding: '8px', borderBottom: `1px solid ${accent.border}` }}>{row.DeviceCode || row.DeviceID || '-'}</Box>
                </Box>
              ))}
              {recentLogs.length === 0 && (
                <Box component="tr">
                  <Box component="td" colSpan={7} sx={{ padding: '10px', textAlign: 'center' }}>No recent logs</Box>
                </Box>
              )}
            </Box>
          </Box>
        )}
        <Box sx={{ mt: 1.5, display: 'flex', justifyContent: 'flex-end' }}>
          <Button size="small" variant="outlined" onClick={() => onOpenAttendance?.()}>
            View Full Attendance Logs
          </Button>
        </Box>
      </Paper>

      <Dialog open={openDeptDialog} onClose={() => setOpenDeptDialog(false)} fullWidth maxWidth="md">
        <DialogTitle>All Departments Attendance (Today)</DialogTitle>
        <DialogContent dividers>
          <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
            <TextField
              size="small"
              label="Search department"
              value={deptQuery}
              onChange={(e) => setDeptQuery(e.target.value)}
              sx={{ minWidth: 240 }}
            />
            <FormControl size="small" sx={{ minWidth: 220 }}>
              <InputLabel id="dept-sort-label">Sort By</InputLabel>
              <Select
                labelId="dept-sort-label"
                value={deptSort}
                label="Sort By"
                onChange={(e) => setDeptSort(e.target.value)}
              >
                <MenuItem value="percent-desc">Attendance % (High to Low)</MenuItem>
                <MenuItem value="percent-asc">Attendance % (Low to High)</MenuItem>
                <MenuItem value="logged-desc">Logged Count (High to Low)</MenuItem>
                <MenuItem value="logged-asc">Logged Count (Low to High)</MenuItem>
                <MenuItem value="name-asc">Department Name (A-Z)</MenuItem>
                <MenuItem value="name-desc">Department Name (Z-A)</MenuItem>
              </Select>
            </FormControl>
          </Box>
          <Box component="table" sx={{ width: '100%', borderCollapse: 'collapse' }}>
            <Box component="thead">
              <Box component="tr">
                {['Department', 'Logged/Total', 'Attendance %'].map((h) => (
                  <Box
                    key={h}
                    component="th"
                    sx={{ textAlign: 'left', p: 1, borderBottom: `1px solid ${accent.border}`, color: accent.text }}
                  >
                    {h}
                  </Box>
                ))}
              </Box>
            </Box>
            <Box component="tbody">
              {filteredRankedDepartments.map((r) => (
                <Box component="tr" key={r.label}>
                  <Box component="td" sx={{ p: 1, borderBottom: `1px solid ${accent.border}` }}>{r.label}</Box>
                  <Box component="td" sx={{ p: 1, borderBottom: `1px solid ${accent.border}` }}>{r.logged}/{r.total}</Box>
                  <Box component="td" sx={{ p: 1, borderBottom: `1px solid ${accent.border}` }}>{r.percent}%</Box>
                </Box>
              ))}
              {filteredRankedDepartments.length === 0 && (
                <Box component="tr">
                  <Box component="td" colSpan={3} sx={{ p: 1.5, textAlign: 'center', color: accent.muted }}>
                    No departments found.
                  </Box>
                </Box>
              )}
            </Box>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenDeptDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function StatCard({ title, value, accent: color = '#2563eb', icon = null, deltaText, deltaTone = 'neutral' }) {
  // Resolve CSS variables at render-time for theme reactivity
  const primary = getCssVar('--primary', '#009063')
  const muted = getCssVar('--muted', '#6b7280')
  const toneMap = {
    positive: { color: primary, bg: alpha(primary, 0.14), Icon: ArrowDropUpOutlinedIcon },
    negative: { color: '#b91c1c', bg: alpha('#b91c1c', 0.14), Icon: ArrowDropDownOutlinedIcon },
    neutral: { color: muted, bg: alpha(muted, 0.16), Icon: RemoveOutlinedIcon }
  }
  const tone = toneMap[deltaTone] || toneMap.neutral
  const DeltaIcon = tone.Icon
  return (
    <Paper sx={{ p: 2, height: '100%', backgroundColor: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 3, boxShadow: '0 10px 24px rgba(0,0,0,0.2)' }}>
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
          color: getCssVar('--muted', '#6b7280'),
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
  const latest = getLatestPunch(r)
  return latest?.time || null
}

function getLatestPunch(r) {
  const toMinutes = (v) => {
    if (!v) return null
    if (typeof v === 'string' && /^\d{2}:\d{2}/.test(v)) {
      const hh = Number(v.slice(0, 2))
      const mm = Number(v.slice(3, 5))
      if (!Number.isNaN(hh) && !Number.isNaN(mm)) return hh * 60 + mm
    }
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes()
    return null
  }

  const fmt = (v) => {
    if (!v) return null
    if (typeof v === 'string' && /^\d{2}:\d{2}/.test(v)) return v.slice(0, 5)
    const d = new Date(v)
    if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
    return String(v)
  }

  const punches = [
    { key: 'MorningTimeIn', label: 'Morning In', value: r.MorningTimeIn },
    { key: 'MorningTimeOut', label: 'Morning Out', value: r.MorningTimeOut },
    { key: 'AfternoonTimeIn', label: 'Afternoon In', value: r.AfternoonTimeIn },
    { key: 'AfternoonTimeOut', label: 'Afternoon Out', value: r.AfternoonTimeOut },
    { key: 'LogTime', label: 'Attendance', value: r.LogTime }
  ]
    .map((p) => ({ ...p, minuteOfDay: toMinutes(p.value), time: fmt(p.value) }))
    .filter((p) => p.minuteOfDay !== null)

  if (!punches.length) return null
  punches.sort((a, b) => b.minuteOfDay - a.minuteOfDay)
  return punches[0]
}

function getRecentLogs(records = []) {
  const enriched = records.map(r => {
    const latest = getLatestPunch(r)
    const time = latest?.time || pickLogTime(r)
    const logType = latest?.label || pickLogType(r)
    const sortKey = (() => {
      const datePart = r.AttendanceDate ? new Date(r.AttendanceDate) : new Date()
      const t = time && /^\d{2}:\d{2}/.test(time) ? time : '00:00'
      const [h, m] = t.split(':').map(Number)
      datePart.setHours(h || 0, m || 0, 0, 0)
      return datePart.getTime()
    })()
    return { ...r, __logTime: time || '-', __logType: logType, __sort: sortKey }
  })
  return enriched.sort((a, b) => b.__sort - a.__sort).slice(0, 10)
}

function pickLogType(r) {
  const status = String(r.AttendanceSummary || r.Status || '').toLowerCase()
  if (status.includes('break')) return 'Break'
  if (r.AfternoonTimeOut) return 'Afternoon Out'
  if (r.AfternoonTimeIn) return 'Afternoon In'
  if (r.MorningTimeOut) return 'Morning Out'
  if (r.MorningTimeIn) return 'Morning In'
  return 'Attendance'
}

function getRecentRowSx(rawStatus) {
  const s = String(rawStatus || '').toLowerCase()
  if (s.includes('absent')) return { backgroundColor: 'rgba(185,28,28,0.08)' }
  if (s.includes('late')) return { backgroundColor: 'rgba(180,83,9,0.08)' }
  if (s.includes('on time')) return { backgroundColor: 'rgba(0,144,99,0.06)' }
  if (s.includes('incomplete')) return { backgroundColor: 'rgba(107,114,128,0.08)' }
  return {}
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
