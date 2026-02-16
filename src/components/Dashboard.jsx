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

export default function Dashboard() {
  const [currentPage, setCurrentPage] = React.useState('employees')
  const [sidebarExpanded, setSidebarExpanded] = React.useState(true)

  const drawerWidth = sidebarExpanded ? 240 : 80

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
          ml: `${drawerWidth}px`,
          transition: 'margin 0.3s ease',
          backgroundColor: '#f4f6f8',
          minHeight: '100vh'
        }}
      >
        {/* Top AppBar */}
        <AppBar
          position="fixed"
          elevation={0}
          sx={{
            ml: `${drawerWidth}px`,
            width: `calc(100% - ${drawerWidth}px)`,
            backgroundColor: '#fff',
            color: '#000',
            borderBottom: '1px solid #e0e0e0',
            transition: 'all 0.3s ease'
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
        <Box sx={{ mt: 10, px: 4 }}>
          <Container maxWidth="xl">
            <Paper
              elevation={0}
              sx={{
                p: 4,
                borderRadius: 3,
                backgroundColor: '#fff',
                boxShadow: '0 4px 20px rgba(0,0,0,0.05)'
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
