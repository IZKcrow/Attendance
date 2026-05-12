const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

function getAuthToken() {
  try {
    return sessionStorage.getItem('authToken')
  } catch (_) {
    return null
  }
}

function withAuthHeaders(headers = {}) {
  const token = getAuthToken()
  return token ? { ...headers, Authorization: `Bearer ${token}` } : headers
}

function buildApiError(res, text) {
  let payload = null
  let message = ''
  try {
    payload = text ? JSON.parse(text) : null
  } catch (_) {
    payload = null
  }

  if (payload && typeof payload === 'object') {
    message = payload.error || payload.message || ''
  }
  if (!message) {
    const raw = String(text || '')
    const isHtml = raw.trim().toLowerCase().startsWith('<!doctype html') || raw.trim().toLowerCase().startsWith('<html')
    if (isHtml && raw.includes('Cannot POST')) {
      // Common local-dev confusion: json-server mock is running instead of the real backend.
      message = `Endpoint not available on the current backend. Ensure the real backend is running (run "npm run server", not "npm run mock").`
    } else {
      message = raw || `${res.status} ${res.statusText}`
    }
  }
  if (!message) {
    message = 'Request failed'
  }

  const err = new Error(message)
  err.status = res.status
  err.statusText = res.statusText
  err.payload = payload
  return err
}

async function handleRes(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw buildApiError(res, text)
  }
  return res.json().catch(() => null)
}

export async function fetchAll(endpoint) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    headers: withAuthHeaders()
  })
  return handleRes(res)
}

export async function createRecord(endpoint, data) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  })
  return handleRes(res)
}

export async function login(username, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, password })
  })
  return handleRes(res)
}

export async function fetchBootstrapStatus() {
  return fetchAll('auth/bootstrap-status')
}

export async function setupAdmin(username, email, password) {
  const res = await fetch(`${BASE}/auth/setup-admin`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, email, password })
  })
  return handleRes(res)
}

export async function registerAdminWithToken(token, username, email, password) {
  const res = await fetch(`${BASE}/auth/register-admin`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ token, username, email, password })
  })
  return handleRes(res)
}

export async function fetchAdminUsers() {
  return fetchAll('auth/admin-users')
}

export async function deleteAdminUser(id) {
  const res = await fetch(`${BASE}/auth/admin-users/${id}`, {
    method: 'DELETE',
    headers: withAuthHeaders()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw buildApiError(res, text)
  }
  return res.json().catch(() => null)
}

export async function updateAdminUser(id, { username, email }) {
  const res = await fetch(`${BASE}/auth/admin-users/${id}`, {
    method: 'PUT',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username, email })
  })
  return handleRes(res)
}

export async function createAdminInvitation(email, expiresHours = 24) {
  const res = await fetch(`${BASE}/auth/invitations`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ email, expiresHours })
  })
  return handleRes(res)
}


export async function forgotPassword(email, expiresHours = 2) {
  const res = await fetch(`${BASE}/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, expiresHours })
  })
  return handleRes(res)
}

export async function resetPassword(token, password) {
  const res = await fetch(`${BASE}/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, password })
  })
  return handleRes(res)
}

export async function fetchMe() {
  return fetchAll('auth/me')
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



export async function fetchAttendanceByRange(from, to) {
  const res = await fetch(`${BASE}/attendance/range`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ from, to })
  })
  return handleRes(res)
}
export async function fetchAttendanceRawByRange(from, to) {
  const res = await fetch(`${BASE}/attendance/raw-range`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ from, to })
  })

  // Backward compatibility: if backend hasn't been restarted yet, fall back.
  if (res.status === 404) {
    return fetchAttendanceByRange(from, to)
  }

  return handleRes(res)
}

export async function faceScanAttendance({
  employeeCode,
  deviceCode = null,
  matchScore = null,
  rawImageRef = null,
  latitude = null,
  longitude = null,
  actor = null
}) {
  const res = await fetch(`${BASE}/face-scan/recognize`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      employeeCode,
      deviceCode,
      matchScore,
      rawImageRef,
      latitude,
      longitude,
      actor
    })
  })
  return handleRes(res)
}

async function deleteViaPost(endpoint, id) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id })
  })
  return handleRes(res)
}

export async function updateAttendanceRecord(id, data) {
  const payload = {
    AttendanceDate: data?.AttendanceDate || data?.attendanceDate || null,
    MorningTimeIn: data?.MorningTimeIn || data?.morningIn || null,
    MorningTimeOut: data?.MorningTimeOut || data?.morningOut || null,
    AfternoonTimeIn: data?.AfternoonTimeIn || data?.afternoonIn || null,
    AfternoonTimeOut: data?.AfternoonTimeOut || data?.afternoonOut || null,
    Remarks: data?.Remarks ?? data?.remarks ?? null,
    EmployeeID: data?.EmployeeID || data?.employeeID || null
  }
  let res = await fetch(`${BASE}/attendance/${id}`, {
    method: 'PUT',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload)
  })
  if (res.status === 404 || res.status === 405) {
    res = await fetch(`${BASE}/attendance/update`, {
      method: 'POST',
      headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id, ...payload })
    })
  }
  return handleRes(res)
}

export async function fetchDevices() {
  return fetchAll('devices')
}

export async function createDevice({
  deviceCode,
  deviceName,
  deviceType = null,
  serialNumber = null,
  ipAddress = null,
  port = null,
  machineId = null,
  commPort = null,
  devicePassword = null,
  isActive = true,
  registeredBy = null
}) {
  return createRecord('devices', {
    DeviceCode: deviceCode,
    DeviceName: deviceName,
    DeviceType: deviceType,
    SerialNumber: serialNumber,
    IPAddress: ipAddress,
    Port: port,
    MachineID: machineId,
    CommPort: commPort,
    DevicePassword: devicePassword,
    IsActive: isActive,
    RegisteredBy: registeredBy
  })
}

export async function registerDeviceConnection({
  deviceCode,
  deviceName = null,
  deviceType = 'KIOSK',
  serialNumber = null,
  ipAddress = null,
  port = null,
  locationName = null,
  latitude = null,
  longitude = null,
  registeredBy = null
}) {
  return createRecord('devices/register-connection', {
    DeviceCode: deviceCode,
    DeviceName: deviceName,
    DeviceType: deviceType,
    SerialNumber: serialNumber,
    IPAddress: ipAddress,
    Port: port,
    LocationName: locationName,
    Latitude: latitude,
    Longitude: longitude,
    RegisteredBy: registeredBy
  })
}

export async function updateDevice(deviceID, data) {
  if (!deviceID) throw new Error('DeviceID is required')
  return updateRecord('devices', deviceID, data)
}

export async function sendDeviceHeartbeat({ deviceCode = null, deviceID = null, actor = null }) {
  return createRecord('devices/heartbeat', {
    DeviceCode: deviceCode,
    DeviceID: deviceID,
    Actor: actor
  })
}

export async function testDeviceConnection({ deviceCode = null, ipAddress = null, port = null }) {
  return createRecord('devices/test-connection', {
    DeviceCode: deviceCode,
    IPAddress: ipAddress,
    Port: port
  })
}

export async function testDevicesBatch({ deviceIds = [] } = {}) {
  const res = await fetch(`${BASE}/devices/test-batch`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deviceIds: Array.isArray(deviceIds) ? deviceIds : [] })
  })
  return handleRes(res)
}

export async function heartbeatDevicesBatch({ deviceIds = [], actor = null } = {}) {
  const res = await fetch(`${BASE}/devices/heartbeat-batch`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deviceIds: Array.isArray(deviceIds) ? deviceIds : [], actor })
  })
  return handleRes(res)
}

export async function requestDeviceSync({ deviceCode }) {
  const res = await fetch(`${BASE}/devices/request-sync`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ deviceCode })
  })
  return handleRes(res)
}

export async function requestDeviceSyncBatch({ deviceIds = [], deviceCodes = [] } = {}) {
  const res = await fetch(`${BASE}/devices/request-sync-batch`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      deviceIds: Array.isArray(deviceIds) ? deviceIds : [],
      deviceCodes: Array.isArray(deviceCodes) ? deviceCodes : []
    })
  })
  return handleRes(res)
}

export async function fetchDeviceSyncJobs({ top = 100 } = {}) {
  const params = new URLSearchParams()
  if (top) params.set('top', String(top))
  const qs = params.toString()
  const res = await fetch(`${BASE}/devices/sync-jobs${qs ? `?${qs}` : ''}`, {
    headers: withAuthHeaders()
  })
  return handleRes(res)
}
function getFilenameFromContentDisposition(value) {
  if (!value) return null
  const match = String(value).match(/filename\s*=\s*\"?([^\";]+)\"?/i)
  return match ? match[1] : null
}

export async function exportDeviceLogsCsv({ deviceCode, from = null, to = null }) {
  const res = await fetch(`${BASE}/devices/export-logs`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      DeviceCode: deviceCode,
      From: from,
      To: to
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw buildApiError(res, text)
  }

  const blob = await res.blob()
  const filename = getFilenameFromContentDisposition(res.headers.get('content-disposition')) || 'device-logs.csv'
  return { blob, filename }
}

export async function importDeviceAttendanceCsv({
  deviceCode,
  csvText,
  createMissingEmployees = false,
  overwriteExisting = false,
  updateEmployeeProfiles = false,
  overwriteEmployeeProfiles = false
}) {
  const res = await fetch(`${BASE}/devices/import-attendance-csv`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      DeviceCode: deviceCode,
      CsvText: csvText,
      CreateMissingEmployees: !!createMissingEmployees,
      OverwriteExisting: !!overwriteExisting,
      UpdateEmployeeProfiles: !!updateEmployeeProfiles,
      OverwriteEmployeeProfiles: !!overwriteEmployeeProfiles
    })
  })
  return handleRes(res)
}

export async function fetchDeviceAttendanceEvents({ deviceCode = null, from = null, to = null, top = 500 } = {}) {
  const params = new URLSearchParams()
  if (deviceCode) params.set('deviceCode', deviceCode)
  if (from) params.set('from', from)
  if (to) params.set('to', to)
  if (top) params.set('top', String(top))
  const qs = params.toString()
  const res = await fetch(`${BASE}/device-attendance-events${qs ? `?${qs}` : ''}`)
  return handleRes(res)
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

function buildQueryString(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.set(key, String(value))
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

export async function fetchOvertimeEntries({ from = null, to = null, employeeId = null } = {}) {
  const res = await fetch(`${BASE}/overtime-entries${buildQueryString({ from, to, employeeId })}`, {
    headers: withAuthHeaders()
  })
  return handleRes(res)
}

export async function createOvertimeEntry(data) {
  return createRecord('overtime-entries', data)
}

export async function updateOvertimeEntry(id, data) {
  return updateRecord('overtime-entries', id, data)
}

export async function deleteOvertimeEntry(id) {
  return deleteRecord('overtime-entries', id)
}

export async function fetchLeaveEntries({ from = null, to = null, employeeId = null } = {}) {
  const res = await fetch(`${BASE}/leave-entries${buildQueryString({ from, to, employeeId })}`, {
    headers: withAuthHeaders()
  })
  return handleRes(res)
}

export async function createLeaveEntry(data) {
  return createRecord('leave-entries', data)
}

export async function updateLeaveEntry(id, data) {
  return updateRecord('leave-entries', id, data)
}

export async function deleteLeaveEntry(id) {
  return deleteRecord('leave-entries', id)
}

export async function generateSpecialDaysYear(year, overwriteExisting = false) {
  const res = await fetch(`${BASE}/special-days/generate-year`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ year, overwriteExisting })
  })
  return handleRes(res)
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
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(data)
  })
  return handleRes(res)
}

export async function deleteRecord(endpoint, id) {
  const res = await fetch(`${BASE}/${endpoint}/${id}`, {
    method: 'DELETE',
    headers: withAuthHeaders()
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    const err = buildApiError(res, text)
    err.message = `Delete failed: ${err.message}`
    throw err
  }
  return true
}

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
    try {
      return await deleteRecord('shift-definitions', id)
    } catch (err2) {
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

export async function fetchEmployeeAssignments({ employeeIDs = [] }) {
  const res = await fetch(`${BASE}/shift-assignments/list`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ employeeIDs })
  })
  return handleRes(res)
}

export async function fetchEmployeeAssignmentHistory({ employeeIDs = [], top = 5 } = {}) {
  const res = await fetch(`${BASE}/shift-assignments/history`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ employeeIDs, top })
  })
  return handleRes(res)
}

export async function removeShiftAssignments({
  shiftID,
  employeeIDs = [],
  effectiveTo = null,
  mode = 'end'
}) {
  const payload = {
    shiftID: shiftID || null,
    employeeIDs: employeeIDs || [],
    effectiveTo,
    mode
  }
  return createRecord('shift-assignments/remove', payload)
}












