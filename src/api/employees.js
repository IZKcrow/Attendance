const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

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
  const res = await fetch(`${BASE}/employees`)
  return handleRes(res)
}

export async function createEmployee(emp) {
  const res = await fetch(`${BASE}/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emp)
  })
  return handleRes(res)
}

export async function updateEmployee(emp) {
  const res = await fetch(`${BASE}/employees/${emp.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(emp)
  })
  return handleRes(res)
}

export async function deleteEmployee(id) {
  const res = await fetch(`${BASE}/employees/${id}`, { method: 'DELETE' })
  return handleRes(res)
}

export async function bulkDeleteEmployees(ids) {
  const res = await fetch(`${BASE}/employees/bulk-delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids })
  })
  return handleRes(res)
}

export default { fetchEmployees, createEmployee, updateEmployee, deleteEmployee, bulkDeleteEmployees }
