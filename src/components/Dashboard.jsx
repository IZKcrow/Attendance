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
import BiometricScansPage from './BiometricScansPage'
import ScheduleDetailsPage from './ScheduleDetailsPage'
import AuditLogsPage from './AuditLogsPage'
import SpecialDaysPage from './SpecialDaysPage'
import DevicesPage from './DevicesPage'
import OverviewDashboard from './OverviewDashboard'
import AttendanceReportPage from './AttendanceReportPage'

import bg2 from '../styles/bg2.png'

export default function Dashboard({ onLogout }) {
  const [currentPage, setCurrentPage] = React.useState('overview')
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false)

  const renderPage = () => {
    switch (currentPage) {
      case 'employees':
        return <EmployeeTable />
      case 'overview':
        return <OverviewDashboard />
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
      case 'biometric':
        return <BiometricScansPage />
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

  const formatTitle = (text) =>
    text
      .split('-')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

  return (
    <Box
      sx={{
        display: 'flex',
        position: 'relative',
        minHeight: '100vh',
        backgroundImage: `url(${bg2})`,
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
        onMenuClick={setCurrentPage}
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
