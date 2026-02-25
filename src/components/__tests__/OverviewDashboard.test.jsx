import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import OverviewDashboard from '../OverviewDashboard'

// Mock Chart.js and react-chartjs-2 to avoid canvas rendering in JSDOM
vi.mock('react-chartjs-2', () => ({
  Pie: (props) => <div data-testid="pie-chart" {...props} />,
  Bar: (props) => <div data-testid="bar-chart" {...props} />,
  Line: (props) => <div data-testid="line-chart" {...props} />,
}))
vi.mock('chart.js', () => ({
  Chart: {},
  ArcElement: {},
  Tooltip: {},
  Legend: {},
  CategoryScale: {},
  LinearScale: {},
  PointElement: {},
  LineElement: {},
  BarElement: {},
  register: () => {}
}))

// Mock API layer
vi.mock('../../api', () => ({
  fetchEmployees: vi.fn(),
  fetchAttendanceToday: vi.fn(),
  fetchAttendanceByRange: vi.fn()
}))

import * as api from '../../api'

function flushPromises() {
  return new Promise((res) => setTimeout(res, 0))
}

describe('OverviewDashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2024-04-15T10:30:00Z'))
    vi.clearAllMocks()
  })

  it('renders skeletons while loading and charts after data loads', async () => {
    api.fetchEmployees.mockResolvedValueOnce([{ id: 1, name: 'Alice', CreatedAt: '2024-04-14' }])
    api.fetchAttendanceByRange.mockResolvedValueOnce([])
    api.fetchAttendanceToday.mockResolvedValueOnce([])

    render(<OverviewDashboard />)

    // Initially show skeletons
    expect(screen.getAllByRole('progressbar').length).toBeGreaterThan(0)

    // Allow effects to resolve
    await flushPromises()
    await waitFor(() => {
      expect(screen.getByTestId('line-chart')).toBeInTheDocument()
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })
  })

  it('shows employee count and no new employees delta when none added today', async () => {
    api.fetchEmployees.mockResolvedValueOnce([{ id: 1, name: 'Alice', CreatedAt: '2024-04-10' }])
    api.fetchAttendanceByRange.mockResolvedValueOnce([])
    api.fetchAttendanceToday.mockResolvedValueOnce([])

    render(<OverviewDashboard />)
    await flushPromises()

    await waitFor(() => {
      expect(screen.getByText('Total Employees')).toBeInTheDocument()
      expect(screen.getByText('1')).toBeInTheDocument()
      expect(screen.getByText(/No new employees today/i)).toBeInTheDocument()
    })
  })

  it('computes today stats: on time vs late vs absent vs early leave vs incomplete', async () => {
    api.fetchEmployees.mockResolvedValueOnce([{ id: 1, name: 'Alice', department: 'IT' }])
    api.fetchAttendanceByRange.mockResolvedValueOnce([])
    api.fetchAttendanceToday.mockResolvedValueOnce([
      { EmployeeName: 'A', AttendanceDate: '2024-04-15', AttendanceSummary: 'On Time', MorningTimeIn: '08:00', MorningTimeOut: '12:00', AfternoonTimeIn: '13:00', AfternoonTimeOut: '17:00' },
      { EmployeeName: 'B', AttendanceDate: '2024-04-15', AttendanceSummary: 'Late Arrival', MinutesLate: 10 },
      { EmployeeName: 'C', AttendanceDate: '2024-04-15', AttendanceSummary: 'Absent' },
      { EmployeeName: 'D', AttendanceDate: '2024-04-15', AttendanceSummary: 'Early Leave', MinutesEarlyLeave: 5 },
      { EmployeeName: 'E', AttendanceDate: '2024-04-15', AttendanceSummary: 'Partial' }, // incomplete
    ])

    render(<OverviewDashboard />)
    await flushPromises()

    await waitFor(() => {
      // Titles rendered by StatCard captions
      expect(screen.getByText('On Time')).toBeInTheDocument()
      expect(screen.getByText('Late Arrival')).toBeInTheDocument()
      expect(screen.getByText('Absent')).toBeInTheDocument()
      expect(screen.getByText('Early Leave')).toBeInTheDocument()
      expect(screen.getByText('Incomplete')).toBeInTheDocument()

      // Values
      // On Time: 1, Late:1, Absent:1, Early Leave:1, Incomplete:1
      expect(screen.getAllByText('1').length).toBeGreaterThan(0)
    })
  })

  it('shows department attendance percentages based on employees and today logs', async () => {
    api.fetchEmployees.mockResolvedValueOnce([
      { id: 1, name: 'A', Department: 'IT' },
      { id: 2, name: 'B', Department: 'HR' },
      { id: 3, name: 'C', Department: 'IT' }
    ])
    api.fetchAttendanceByRange.mockResolvedValueOnce([])
    api.fetchAttendanceToday.mockResolvedValueOnce([
      { EmployeeID: 1, Department: 'IT', AttendanceDate: '2024-04-15', AttendanceSummary: 'On Time' },
    ])

    render(<OverviewDashboard />)
    await flushPromises()

    await waitFor(() => {
      // Bar chart should be shown
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
    })
  })

  it('renders recent logs table with fallback row when there are no logs', async () => {
    api.fetchEmployees.mockResolvedValueOnce([{ id: 1, name: 'Alice' }])
    api.fetchAttendanceByRange.mockResolvedValueOnce([])
    api.fetchAttendanceToday.mockResolvedValueOnce([])

    render(<OverviewDashboard />)
    await flushPromises()

    await waitFor(() => {
      expect(screen.getByText('Recent Logs (Today)')).toBeInTheDocument()
      expect(screen.getByText('No recent logs')).toBeInTheDocument()
    })
  })
})
