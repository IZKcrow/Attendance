export function toDateInputValue(d) {
  const x = new Date(d)
  x.setMinutes(x.getMinutes() - x.getTimezoneOffset())
  return x.toISOString().slice(0, 10)
}

export function getRangeDate(kind, anchorDateStr = null) {
  const now = anchorDateStr ? new Date(anchorDateStr) : new Date()
  switch (kind) {
    case 'week': {
      const day = now.getDay() === 0 ? 7 : now.getDay()
      const monday = new Date(now.getTime() - (day - 1) * 24 * 60 * 60 * 1000)
      const sunday = new Date(monday.getTime() + 6 * 24 * 60 * 60 * 1000)
      return { from: toDateInputValue(monday), to: toDateInputValue(sunday) }
    }
    case 'month': {
      const from = new Date(now.getFullYear(), now.getMonth(), 1)
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: toDateInputValue(from), to: toDateInputValue(to) }
    }
    case 'year': {
      const from = new Date(now.getFullYear(), 0, 1)
      const to = new Date(now.getFullYear(), 11, 31)
      return { from: toDateInputValue(from), to: toDateInputValue(to) }
    }
    default:
      return { from: toDateInputValue(now), to: toDateInputValue(now) }
  }
}
