const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function handleRes(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${text}`)
  }
  return res.json().catch(() => null)
}

// Generic CRUD
export async function fetchAll(endpoint) {
  const res = await fetch(`${BASE}/${endpoint}`)
  return handleRes(res)
}

export async function createRecord(endpoint, data) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return handleRes(res)
}

export async function updateRecord(endpoint, id, data) {
  console.log(`Updating ${endpoint}/${id} with:`, data)
  const res = await fetch(`${BASE}/${endpoint}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  const result = await handleRes(res)
  console.log(`Update response:`, result)
  return result
}

export async function deleteRecord(endpoint, id) {
  const res = await fetch(`${BASE}/${endpoint}/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
  return true
}

// Employees
export async function fetchEmployees() {
  return fetchAll('employees')
}

export async function createEmployee(emp) {
  return createRecord('employees', emp)
}

export async function updateEmployee(emp) {
  return updateRecord('employees', emp.id, emp)
}

export async function deleteEmployee(id) {
  return deleteRecord('employees', id)
}

// Users
export async function fetchUsers() {
  return fetchAll('users')
}

export async function createUser(data) {
  return createRecord('users', data)
}

export async function updateUser(id, data) {
  return updateRecord('users', id, data)
}

export async function deleteUser(id) {
  return deleteRecord('users', id)
}

// Schedule Periods
export async function fetchSchedulePeriods() {
  return fetchAll('schedule-periods')
}

export async function createSchedulePeriod(data) {
  return createRecord('schedule-periods', data)
}

export async function updateSchedulePeriod(id, data) {
  return updateRecord('schedule-periods', id, data)
}

export async function deleteSchedulePeriod(id) {
  return deleteRecord('schedule-periods', id)
}

// Schedule Details
export async function fetchScheduleDetails() {
  return fetchAll('schedule-details')
}

export async function createScheduleDetail(data) {
  return createRecord('schedule-details', data)
}

export async function updateScheduleDetail(id, data) {
  return updateRecord('schedule-details', id, data)
}

export async function deleteScheduleDetail(id) {
  return deleteRecord('schedule-details', id)
}

// Attendance Records
export async function fetchAttendanceRecords() {
  return fetchAll('attendance-records')
}

export async function createAttendanceRecord(data) {
  return createRecord('attendance-records', data)
}

export async function updateAttendanceRecord(id, data) {
  return updateRecord('attendance-records', id, data)
}

export async function deleteAttendanceRecord(id) {
  return deleteRecord('attendance-records', id)
}

// Biometric Scans
export async function fetchBiometricScans() {
  return fetchAll('biometric-scans')
}

export async function createBiometricScan(data) {
  return createRecord('biometric-scans', data)
}

export async function deleteBiometricScan(id) {
  return deleteRecord('biometric-scans', id)
}

// Audit Logs
export async function fetchAuditLogs() {
  return fetchAll('audit-logs')
}

export async function createAuditLog(data) {
  return createRecord('audit-logs', data)
}

// Special Days
export async function fetchSpecialDays() {
  return fetchAll('special-days')
}

export async function createSpecialDay(data) {
  return createRecord('special-days', data)
}

export async function updateSpecialDay(id, data) {
  return updateRecord('special-days', id, data)
}

export async function deleteSpecialDay(id) {
  return deleteRecord('special-days', id)
}
