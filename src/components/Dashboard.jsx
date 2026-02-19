import React from 'react'
import {
  Box,
  Container,
  Paper,
  Typography,
  AppBar,
  Toolbar,
  IconButton
} from '@mui/material'
import MenuIcon from '@mui/icons-material/Menu'

import Sidebar from './Sidebar'
import EmployeeTable from './EmployeeTable'
import Scheduler from './Scheduler'
import UsersPage from './UsersPage'
import AttendanceRecordsPage from './AttendanceRecordsPage'
import BiometricScansPage from './BiometricScansPage'
import SchedulePeriodsPage from './SchedulePeriodsPage'
import ScheduleDetailsPage from './ScheduleDetailsPage'
import AuditLogsPage from './AuditLogsPage'
import SpecialDaysPage from './SpecialDaysPage'
import DevicesPage from './DevicesPage'
import AttendanceReportPage from './AttendanceReportPage'

export default function Dashboard() {
  const [currentPage, setCurrentPage] = React.useState('employees')
  const [sidebarExpanded, setSidebarExpanded] = React.useState(true)

  const renderPage = () => {
    switch (currentPage) {
      case 'employees':
        return <EmployeeTable />
      case 'users':
        return <UsersPage />
      case 'devices':
        return <DevicesPage />
      case 'schedule-periods':
        return <SchedulePeriodsPage />
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
    <Box sx={{ display: 'flex' }}>
      
      {/* Sidebar */}
      <Sidebar
        expanded={sidebarExpanded}
        activeMenu={currentPage}
        onMenuClick={setCurrentPage}
      />

      {/* Main Content Area */}
      <Box
        sx={{
          flexGrow: 1,
          backgroundColor: '#f4f6f8',
          minHeight: '100vh'
        }}
      >
        {/* Top AppBar */}
        <AppBar
          position="sticky"
          elevation={0}
          sx={{
            backgroundColor: '#fff',
            color: '#000',
            borderBottom: '1px solid #e0e0e0',
            zIndex: 1
          }}
        >
          <Toolbar>
            <IconButton
              edge="start"
              onClick={() => setSidebarExpanded(prev => !prev)}
              sx={{ mr: 2 }}
            >
              <MenuIcon />
            </IconButton>

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
                backgroundColor: '#fff',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
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
