//Sidebar.jsx
import React from 'react'
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Tooltip
} from '@mui/material'
import PeopleIcon from '@mui/icons-material/People'
import EventNoteIcon from '@mui/icons-material/EventNote'
import AssignmentIcon from '@mui/icons-material/Assignment'
import TimerIcon from '@mui/icons-material/Timer'
import BusinessIcon from '@mui/icons-material/Business'
import VisibilityIcon from '@mui/icons-material/Visibility'
import LogoutIcon from '@mui/icons-material/Logout'
import HistoryIcon from '@mui/icons-material/History'
import DevicesOtherIcon from '@mui/icons-material/DevicesOther'
import InsightsIcon from '@mui/icons-material/Insights'

const MENU_ITEMS = [
  { id: 'employees', label: 'Employees', icon: PeopleIcon },
  { id: 'users', label: 'Users', icon: BusinessIcon },
  { id: 'devices', label: 'Devices', icon: DevicesOtherIcon },
  { id: 'schedule-periods', label: 'Schedule Periods', icon: AssignmentIcon },
  { id: 'schedule-details', label: 'Schedule Details', icon: EventNoteIcon },
  { id: 'schedule', label: 'Scheduler', icon: EventNoteIcon },
  { id: 'attendance', label: 'Attendance Records', icon: TimerIcon },
  { id: 'attendance-report', label: 'Attendance Report', icon: InsightsIcon },
  { id: 'biometric', label: 'Biometric Scans', icon: VisibilityIcon },
  { id: 'special-days', label: 'Special Days', icon: LogoutIcon },
  { id: 'audit-logs', label: 'Audit Logs', icon: HistoryIcon }
]

export default function Sidebar({ onMenuClick, expanded }) {
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: expanded ? 240 : 80,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: expanded ? 240 : 80,
          boxSizing: 'border-box',
          backgroundColor: '#1976d2',
          color: '#fff',
          transition: 'width 0.3s ease',
          overflow: 'hidden'
        }
      }}
    >
      <Box sx={{ p: 2, textAlign: 'center', fontWeight: 'bold', fontSize: '18px' }}>
        {expanded ? 'Menu' : '☰'}
      </Box>
      <List>
        {MENU_ITEMS.map(item => {
          const Icon = item.icon
          return (
            <Tooltip key={item.id} title={item.label} placement="right" disableHoverListener={expanded}>
              <ListItem disablePadding>
                <ListItemButton
                  onClick={() => onMenuClick(item.id)}
                  sx={{ justifyContent: expanded ? 'flex-start' : 'center', py: 2 }}
                >
                  <ListItemIcon sx={{ color: '#fff', minWidth: expanded ? 40 : 'auto' }}>
                    <Icon />
                  </ListItemIcon>
                  {expanded && <ListItemText primary={item.label} />}
                </ListItemButton>
              </ListItem>
            </Tooltip>
          )
        })}
      </List>
    </Drawer>
  )
}
