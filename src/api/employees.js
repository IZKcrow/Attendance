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

async function handleRes(res) {
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const data = await res.json()
      if (data?.error) message = String(data.error)
    } catch (_) {
      const text = await res.text().catch(() => '')
      if (text) message = text
    }
    throw new Error(message)
  }
  return res.json().catch(() => null)
}

export async function fetchEmployees() {
  const res = await fetch(`${BASE}/employees`, {
    headers: withAuthHeaders()
  })
  return handleRes(res)
}

export async function createEmployee(emp) {
  const res = await fetch(`${BASE}/employees`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(emp)
  })
  return handleRes(res)
}

export async function updateEmployee(emp) {
  const res = await fetch(`${BASE}/employees/${emp.id}`, {
    method: 'PUT',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(emp)
  })
  return handleRes(res)
}

export async function deleteEmployee(id) {
  const res = await fetch(`${BASE}/employees/${id}`, {
    method: 'DELETE',
    headers: withAuthHeaders()
  })
  return handleRes(res)
}

export async function bulkDeleteEmployees(ids) {
  const res = await fetch(`${BASE}/employees/bulk-delete`, {
    method: 'POST',
    headers: withAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ids })
  })
  return handleRes(res)
}

export default { fetchEmployees, createEmployee, updateEmployee, deleteEmployee, bulkDeleteEmployees }
