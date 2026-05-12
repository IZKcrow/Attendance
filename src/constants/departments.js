export const COMPANY_DEPARTMENTS = [
  'Administrative Services Department',
  'Commercial Services Department',
  'Engineering Services Department',
  'Accounting and Financial Management Department'
]

export const DEPARTMENT_SHORT_LABELS = {
  'Administrative Services Department': 'ASD',
  'Commercial Services Department': 'CSD',
  'Engineering Services Department': 'ESD',
  'Accounting and Financial Management Department': 'AFMD'
}

export function isKnownDepartment(value) {
  return COMPANY_DEPARTMENTS.includes(String(value || '').trim())
}

export function getDepartmentShortLabel(value) {
  const normalized = String(value || '').trim()
  return DEPARTMENT_SHORT_LABELS[normalized] || normalized || 'Unassigned'
}
