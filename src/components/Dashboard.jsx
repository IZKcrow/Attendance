import React from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  AppBar,
  Toolbar
} from '@mui/material'

import Sidebar from './Sidebar'
import EmployeeTable from './EmployeeTable'
import Scheduler from './Scheduler'
import UsersPage from './UsersPage'
import AttendanceRecordsPage from './AttendanceRecordsPage'
import GenerateReportPage from './GenerateReportPage'
import DeviceAttendanceEventsPage from './DeviceAttendanceEventsPage'
import ScheduleDetailsPage from './ScheduleDetailsPage'
import AuditLogsPage from './AuditLogsPage'
import SpecialDaysPage from './SpecialDaysPage'
import DevicesPage from './DevicesPage'
import OverviewDashboard from './OverviewDashboard'
import AttendanceReportPage from './AttendanceReportPage'
import OvertimeEntriesPage from './OvertimeEntriesPage'
import LeaveEntriesPage from './LeaveEntriesPage'

import bg3 from '../styles/bg3.png'

const PAGE_TO_PATH = {
  overview: '/dashboard',
  employees: '/employees',
  users: '/users',
  devices: '/devices',
  'schedule-details': '/schedule-details',
  schedule: '/scheduler',
  attendance: '/attendance',
  'attendance-report': '/attendance-report',
  'device-attendance-events': '/imported-logs',
  reports: '/reports',
  overtime: '/overtime',
  leave: '/leave',
  'special-days': '/special-days',
  'audit-logs': '/audit-logs'
}

const PATH_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_TO_PATH).map(([page, path]) => [path, page])
)

const PAGE_TITLES = {
  overview: 'Dashboard',
  employees: 'Employees',
  users: 'Users',
  devices: 'Devices',
  'schedule-details': 'Schedule Details',
  schedule: 'Scheduler',
  attendance: 'Attendance Records',
  'attendance-report': 'Attendance Report',
  'device-attendance-events': 'Imported Device Logs',
  reports: 'Generate Report',
  overtime: 'Approved Overtime',
  leave: 'Approved Leave',
  'special-days': 'Special Days',
  'audit-logs': 'Audit Logs'
}

const normalizePath = (path) => {
  if (!path) return '/'
  const cleaned = path.replace(/\/+$/, '')
  return cleaned || '/'
}

const getPageFromPath = (pathname) => {
  const normalized = normalizePath(pathname).toLowerCase()
  if (normalized === '/') return 'overview'
  if (normalized === '/biometric') return 'reports'
  return PATH_TO_PAGE[normalized] || 'overview'
}

export default function Dashboard({ onLogout }) {
  const [currentPage, setCurrentPage] = React.useState(() => {
    if (typeof window === 'undefined') return 'overview'
    return getPageFromPath(window.location.pathname)
  })
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false)

  const navigateToPage = React.useCallback((page, options = {}) => {
    const nextPage = PAGE_TO_PATH[page] ? page : 'overview'
    const nextPath = PAGE_TO_PATH[nextPage]
    setCurrentPage(nextPage)
    if (typeof window === 'undefined') return
    const currentPath = normalizePath(window.location.pathname)
    if (currentPath !== nextPath) {
      const fn = options.replace ? 'replaceState' : 'pushState'
      window.history[fn]({}, '', nextPath)
    }
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return

    const syncFromUrl = () => {
      setCurrentPage(getPageFromPath(window.location.pathname))
    }

    syncFromUrl()
    window.addEventListener('popstate', syncFromUrl)
    return () => window.removeEventListener('popstate', syncFromUrl)
  }, [])

  React.useEffect(() => {
    if (typeof window === 'undefined') return
    const pageFromPath = getPageFromPath(window.location.pathname)
    if (pageFromPath !== currentPage) {
      navigateToPage(currentPage, { replace: true })
    }
  }, [currentPage, navigateToPage])

  const renderPage = () => {
    switch (currentPage) {
      case 'employees':
        return <EmployeeTable />
      case 'overview':
        return <OverviewDashboard onOpenAttendance={() => navigateToPage('attendance')} />
      case 'users':
        return <UsersPage />
      case 'devices':
        return <DevicesPage />
      case 'schedule-details':
        return <ScheduleDetailsPage />
      case 'attendance':
        return <AttendanceRecordsPage />
      case 'attendance-report':
        return <AttendanceReportPage />
      case 'device-attendance-events':
        return <DeviceAttendanceEventsPage />
      case 'reports':
        return <GenerateReportPage />
      case 'overtime':
        return <OvertimeEntriesPage />
      case 'leave':
        return <LeaveEntriesPage />
      case 'special-days':
        return <SpecialDaysPage />
      case 'audit-logs':
        return <AuditLogsPage />
      case 'schedule':
        return <Scheduler />
      default:
        return <EmployeeTable />
    }
  }

  const formatTitle = (text) => PAGE_TITLES[text] || text
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')

  return (
    <Box
      sx={{
        display: 'flex',
        position: 'relative',
        minHeight: '100vh',
        backgroundImage: `url(${bg3})`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: '1500px',
        backgroundAttachment: 'fixed',
        '&::before': {
          content: '""',
          position: 'absolute',
          inset: 0,
          backgroundColor: 'rgba(128, 128, 128, 0.32)'
        }
      }}
    >
      
     {/* Sidebar */}
      <Sidebar
        expanded={sidebarExpanded}
        activeMenu={currentPage}
        onMenuClick={navigateToPage}
        onHover={(open) => setSidebarExpanded(open)}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <Box
        sx={{
          position: 'relative',
          flexGrow: 1,
          minHeight: '100vh',
          zIndex: 1
        }}
      >
        {/* Top AppBar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            backgroundColor: 'var(--surface)',
            color: 'var(--text)',
            borderBottom: '1px solid var(--border)',
            zIndex: 1
          }}
        >
          <Toolbar>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              {formatTitle(currentPage)}
            </Typography>
          </Toolbar>
        </AppBar>

        {/* Page Content */}
        <Box sx={{ px: { xs: 1.5, md: 3 }, py: 2 }}>
          <Container maxWidth={false} disableGutters>
            <Paper
              elevation={0}
              sx={{
                p: { xs: 1.5, md: 3 },
                borderRadius: 3,
                backgroundColor: 'var(--surface)',
                color: 'var(--text)',
                boxShadow: '0 18px 36px rgba(0,0,0,0.3)',
                border: '1px solid var(--border)',
                width: '100%'
              }}
            >
              {renderPage()}
            </Paper>
          </Container>
        </Box>
      </Box>
    </Box>
  )
}



