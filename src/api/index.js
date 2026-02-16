const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function handleRes(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${text}`)
  }
  return res.json().catch(() => null)
}

// =============================
// GENERIC CRUD
// =============================

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

export async function fetchUsers() {
  const rows = await fetchAll('employees')
  if (!Array.isArray(rows)) return []
  return rows.map((u) => ({
    UserID: u.id,
    name: u.name || '',
    position: u.position || '',
    email: u.email || '',
    department: u.department || ''
  }))
}

export async function createUser(data) {
  const created = await createRecord('employees', {
    name: data?.name || '',
    position: data?.position || 'Employee',
    department: data?.department || null,
    email: data?.email || null,
    phone: data?.phone || null
  })
  return {
    UserID: created?.id,
    name: created?.name || '',
    position: created?.position || 'Employee',
    email: created?.email || '',
    department: created?.department || ''
  }
}

// Compatibility: users are backed by Employees in the new schema.
export async function updateUser(id, data) {
  const [firstName = '', ...rest] = String(data?.name || '').trim().split(/\s+/)
  const lastName = rest.join(' ')
  const updated = await updateRecord('employees', id, {
    name: `${firstName} ${lastName}`.trim(),
    position: data?.position || 'Employee',
    department: data?.department || null,
    email: data?.email || null,
    phone: data?.phone || null
  })
  return {
    UserID: updated?.id,
    name: updated?.name || '',
    position: updated?.position || '',
    email: updated?.email || '',
    department: updated?.department || ''
  }
}

export async function deleteUser(id) {
  return deleteRecord('employees', id)
}

export async function fetchEmployees() {
  return fetchAll('employees')
}

export async function fetchAttendanceToday() {
  return fetchAll('attendance/today')
}

export async function recordAttendance(employeeCode, logType = 'MORNING_IN') {
  const res = await fetch(`${BASE}/attendance/log`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ employeeCode, logType })
  })
  return handleRes(res)
}

async function deleteViaPost(endpoint, id) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id })
  })
  return handleRes(res)
}

// Legacy wrappers kept for existing pages; backend currently supports only attendance/log.
export async function createAttendanceRecord(data) {
  return recordAttendance(data?.employeeCode || data?.EmployeeCode, data?.logType || 'MORNING_IN')
}

export async function updateAttendanceRecord() {
  throw new Error('Attendance update is not supported in current backend.')
}

export async function deleteAttendanceRecord() {
  throw new Error('Attendance delete is not supported in current backend.')
}

export async function fetchBiometricScans() {
  return fetchAll('biometric-scans')
}

export async function createBiometricScan(data) {
  return createRecord('biometric-scans', data)
}

export async function deleteBiometricScan(id) {
  return deleteRecord('biometric-scans', id)
}

export async function fetchAuditLogs() {
  return fetchAll('audit-logs')
}

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

export async function updateRecord(endpoint, id, data) {
  const res = await fetch(`${BASE}/${endpoint}/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
  return handleRes(res)
}

export async function deleteRecord(endpoint, id) {
  const res = await fetch(`${BASE}/${endpoint}/${id}`, {
    method: 'DELETE'
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Delete failed: ${res.status} ${res.statusText} ${text}`)
  }
  return true
}

// =============================
// SHIFT DEFINITIONS
// =============================

export async function fetchShiftDefinitions() {
  return fetchAll('shift-definitions')
}

export async function createShiftDefinition(data) {
  return createRecord('shift-definitions', data)
}

export async function updateShiftDefinition(id, data) {
  return updateRecord('shift-definitions', id, data)
}

export async function deleteShiftDefinition(id) {
  return deleteRecord('shift-definitions', id)
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
  try {
    return await deleteRecord('schedule-periods', id)
  } catch (err1) {
    // Backward-compatible fallback if server exposes only shift-definitions delete.
    try {
      return await deleteRecord('shift-definitions', id)
    } catch (err2) {
      // Fallback when DELETE method is blocked/mismatched in environment.
      try {
        return await deleteViaPost('schedule-periods/delete', id)
      } catch (err3) {
        try {
          return await deleteViaPost('shift-definitions/delete', id)
        } catch (err4) {
          let backendHint = ''
          try {
            const ping = await fetch(`${BASE}/ping-db`)
            if (!ping.ok) {
              backendHint = ' Ensure the MSSQL backend is running (not json-server mock).'
            }
          } catch (_) {
            backendHint = ' Ensure the MSSQL backend is running (not json-server mock).'
          }
          throw new Error(`Schedule delete failed. schedule-periods -> ${err1.message}; shift-definitions -> ${err2.message}; schedule-periods/delete -> ${err3.message}; shift-definitions/delete -> ${err4.message}.${backendHint}`)
        }
      }
    }
  }
}

export async function createScheduleDetailsBulk(employeeID, schedule, EffectiveFrom = null, EffectiveTo = null) {
  return createRecord('schedule-details/bulk', { employeeID, schedule, EffectiveFrom, EffectiveTo })
}

export async function assignShiftToEmployees({
  shiftID,
  employeeIDs = [],
  assignAll = false,
  effectiveFrom = null,
  effectiveTo = null
}) {
  return createRecord('shift-assignments/bulk', {
    shiftID,
    employeeIDs,
    assignAll,
    effectiveFrom,
    effectiveTo
  })
}
