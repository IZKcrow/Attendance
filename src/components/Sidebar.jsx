//Sidebar.jsx
import React from 'react'
import {
  Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText,
  Collapse
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
import ExpandLess from '@mui/icons-material/ExpandLess'
import ExpandMore from '@mui/icons-material/ExpandMore'

const TOP_LEVEL = [
  { id: 'overview', label: 'Dashboard', icon: InsightsIcon },
  { id: 'employees', label: 'Employees', icon: PeopleIcon },
  { id: 'users', label: 'Users', icon: BusinessIcon },
  { id: 'devices', label: 'Devices', icon: DevicesOtherIcon }
]

const SCHEDULE_GROUP = [
  { id: 'schedule-details', label: 'Schedule Details', icon: EventNoteIcon },
  { id: 'schedule', label: 'Scheduler', icon: EventNoteIcon }
]

const ATTENDANCE_GROUP = [
  { id: 'attendance', label: 'Attendance Records', icon: TimerIcon },
  { id: 'attendance-report', label: 'Attendance Report', icon: AssignmentIcon },
  { id: 'biometric', label: 'Biometric Scans', icon: VisibilityIcon }
]

const OTHER_ITEMS = [
  { id: 'special-days', label: 'Special Days', icon: LogoutIcon },
  { id: 'audit-logs', label: 'Audit Logs', icon: HistoryIcon }
]

export default function Sidebar({ onMenuClick, expanded, activeMenu, onHover, onLogout }) {
  const [openSchedule, setOpenSchedule] = React.useState(true)
  const [openAttendance, setOpenAttendance] = React.useState(true)
  const textColor = '#f5f5f5'

  return (
    <Drawer
      variant="permanent"
      sx={{
        width: expanded ? 240 : 80,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: expanded ? 240 : 80,
          boxSizing: 'border-box',
          backgroundColor: 'var(--secondary)',
          color: textColor,
          transition: 'width 0.12s ease-out',
          willChange: 'width',
          overflow: 'hidden'
        }
      }}
      onMouseEnter={() => onHover?.(true)}
      onMouseLeave={() => onHover?.(false)}
      >
      <Box sx={{ p: 2, textAlign: 'center', fontWeight: 'bold', fontSize: '18px', color: textColor }}>
        {expanded ? 'Menu' : '☰'}
      </Box>
      <List>
        {TOP_LEVEL.map(item => (
          <ListItem disablePadding key={item.id}>
            <ListItemButton
              onClick={() => onMenuClick(item.id)}
              selected={activeMenu === item.id}
              sx={{
                justifyContent: expanded ? 'flex-start' : 'center',
                py: 2,
                '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.15)' },
                '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.25)' }
              }}
            >
              <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 40 : 'auto' }}>
                <item.icon />
              </ListItemIcon>
              {expanded && (
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ color: textColor, fontWeight: 600 }}
                />
              )}
            </ListItemButton>
          </ListItem>
        ))}

        {/* Schedule group */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => setOpenSchedule(o => !o)} sx={{ justifyContent: expanded ? 'flex-start' : 'center', py: 2 }}>
            <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 40 : 'auto' }}>
              <EventNoteIcon />
            </ListItemIcon>
            {expanded && (
              <ListItemText
                primary="Schedule"
                primaryTypographyProps={{ color: textColor, fontWeight: 700 }}
              />
            )}
            {expanded && (openSchedule ? <ExpandLess sx={{ color: textColor }} /> : <ExpandMore sx={{ color: textColor }} />)}
          </ListItemButton>
        </ListItem>
        <Collapse in={openSchedule} timeout="auto" unmountOnExit>
          {SCHEDULE_GROUP.map(item => (
            <ListItem disablePadding key={item.id}>
              <ListItemButton
                onClick={() => onMenuClick(item.id)}
                selected={activeMenu === item.id}
                sx={{
                  pl: expanded ? 6 : 2,
                  py: 1.2,
                  justifyContent: expanded ? 'flex-start' : 'center',
                  '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.15)' },
                  '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.25)' }
                }}
              >
                <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 32 : 'auto' }}>
                  <item.icon fontSize="small" />
                </ListItemIcon>
                {expanded && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ color: textColor, fontWeight: 600 }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </Collapse>

        {/* Attendance group */}
        <ListItem disablePadding>
          <ListItemButton onClick={() => setOpenAttendance(o => !o)} sx={{ justifyContent: expanded ? 'flex-start' : 'center', py: 2 }}>
            <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 40 : 'auto' }}>
              <TimerIcon />
            </ListItemIcon>
            {expanded && (
              <ListItemText
                primary="Attendance"
                primaryTypographyProps={{ color: textColor, fontWeight: 700 }}
              />
            )}
            {expanded && (openAttendance ? <ExpandLess sx={{ color: textColor }} /> : <ExpandMore sx={{ color: textColor }} />)}
          </ListItemButton>
        </ListItem>
        <Collapse in={openAttendance} timeout="auto" unmountOnExit>
          {ATTENDANCE_GROUP.map(item => (
            <ListItem disablePadding key={item.id}>
              <ListItemButton
                onClick={() => onMenuClick(item.id)}
                selected={activeMenu === item.id}
                sx={{
                  pl: expanded ? 6 : 2,
                  py: 1.2,
                  justifyContent: expanded ? 'flex-start' : 'center',
                  '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.15)' },
                  '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.25)' }
                }}
              >
                <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 32 : 'auto' }}>
                  <item.icon fontSize="small" />
                </ListItemIcon>
                {expanded && (
                  <ListItemText
                    primary={item.label}
                    primaryTypographyProps={{ color: textColor, fontWeight: 600 }}
                  />
                )}
              </ListItemButton>
            </ListItem>
          ))}
        </Collapse>

        {OTHER_ITEMS.map(item => (
          <ListItem disablePadding key={item.id}>
            <ListItemButton
              onClick={() => onMenuClick(item.id)}
              selected={activeMenu === item.id}
              sx={{
                justifyContent: expanded ? 'flex-start' : 'center',
                py: 2,
                '&.Mui-selected': { backgroundColor: 'rgba(255,255,255,0.15)' },
                '&.Mui-selected:hover': { backgroundColor: 'rgba(255,255,255,0.25)' }
              }}
            >
              <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 40 : 'auto' }}>
                <item.icon />
              </ListItemIcon>
              {expanded && (
                <ListItemText
                  primary={item.label}
                  primaryTypographyProps={{ color: textColor, fontWeight: 600 }}
                />
              )}
            </ListItemButton>
          </ListItem>
        ))}

        {/* Logout */}
        <ListItem disablePadding>
          <ListItemButton
            onClick={() => {
              onLogout?.()
              onMenuClick?.('overview')
            }}
            sx={{
              justifyContent: expanded ? 'flex-start' : 'center',
              py: 2,
              mt: 1,
              '&:hover': { backgroundColor: 'rgba(255,255,255,0.15)' }
            }}
          >
            <ListItemIcon sx={{ color: textColor, minWidth: expanded ? 40 : 'auto' }}>
              <LogoutIcon />
            </ListItemIcon>
            {expanded && (
              <ListItemText
                primary="Logout"
                primaryTypographyProps={{ color: textColor, fontWeight: 700 }}
              />
            )}
          </ListItemButton>
        </ListItem>
      </List>
    </Drawer>
  )
}
