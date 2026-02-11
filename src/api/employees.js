const BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

async function handleRes(res) {
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${res.status} ${res.statusText} ${text}`)
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
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
  return true
}

export default { fetchEmployees, createEmployee, updateEmployee, deleteEmployee }
