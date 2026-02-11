import React from 'react'
import { Box, Container, Paper, Typography } from '@mui/material'
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

export default function Dashboard() {
  const [currentPage, setCurrentPage] = React.useState('employees')
  const [sidebarExpanded, setSidebarExpanded] = React.useState(false)

  const renderPage = () => {
    switch (currentPage) {
      case 'employees':
        return <EmployeeTable />
      case 'users':
        return <UsersPage />
      case 'schedule-periods':
        return <SchedulePeriodsPage />
      case 'schedule-details':
        return <ScheduleDetailsPage />
      case 'attendance':
        return <AttendanceRecordsPage />
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

  return (
    <Box sx={{ display: 'flex' }}>
      <Box
        onMouseEnter={() => setSidebarExpanded(true)}
        onMouseLeave={() => setSidebarExpanded(false)}
      >
        <Sidebar onMenuClick={setCurrentPage} expanded={sidebarExpanded} />
      </Box>

      <Box sx={{ flex: 1, p: 3, backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <Container maxWidth="lg">
          <Paper sx={{ p: 3 }} elevation={2}>
            <Typography variant="h5" gutterBottom sx={{ textTransform: 'capitalize' }}>
              {currentPage.replace('-', ' ')}
            </Typography>
            {renderPage()}
          </Paper>
        </Container>
      </Box>
    </Box>
  )
}
