import React, { useState } from 'react'
import * as api from '../api'

const WEEK_DAYS = [
  'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
]

const defaultGroup = (index = 1) => ({
  label: `Pattern ${index}`,
  days: [],
  morningIn: '08:00',
  morningOut: '12:00',
  afternoonIn: '13:00',
  afternoonOut: '17:00'
})

export default function CreateShift() {
  const [shiftName, setShiftName] = useState('')
  const [grace, setGrace] = useState(15)
  const [groups, setGroups] = useState([defaultGroup(1)])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const resetForm = () => {
    setShiftName('')
    setGrace(15)
    setGroups([defaultGroup(1)])
  }

  const updateGroup = (index, patch) => {
    setGroups((prev) => prev.map((g, i) => (i === index ? { ...g, ...patch } : g)))
  }

  const toggleDay = (groupIndex, day) => {
    setGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g
        const exists = g.days.includes(day)
        return { ...g, days: exists ? g.days.filter((d) => d !== day) : [...g.days, day] }
      })
    )
  }

  const addGroup = () => {
    setGroups((prev) => [...prev, defaultGroup(prev.length + 1)])
  }

  const removeGroup = (index) => {
    setGroups((prev) => {
      if (prev.length === 1) return prev
      const next = prev.filter((_, i) => i !== index)
      return next.map((g, i) => ({ ...g, label: g.label || `Pattern ${i + 1}` }))
    })
  }

  const validate = () => {
    if (!shiftName.trim()) return 'Shift name is required.'

    const seen = new Set()
    for (let i = 0; i < groups.length; i += 1) {
      const g = groups[i]
      if (!g.days.length) return `Group ${i + 1}: select at least one day.`
      if (!g.morningIn || !g.morningOut || !g.afternoonIn || !g.afternoonOut) {
        return `Group ${i + 1}: all time fields are required.`
      }
      for (const d of g.days) {
        if (seen.has(d)) return `Day "${d}" is repeated in multiple groups.`
        seen.add(d)
      }
    }
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    const validationError = validate()
    if (validationError) {
      setError(validationError)
      return
    }

    try {
      setLoading(true)
      const graceValue = parseInt(grace, 10) || 0

      await api.createShiftDefinition({
        ShiftName: shiftName,
        GracePeriodMinutes: graceValue,
        Patterns: groups.map((g, i) => ({
          label: g.label?.trim() || `Pattern ${i + 1}`,
          days: g.days,
          morningIn: `${g.morningIn}:00`,
          morningOut: `${g.morningOut}:00`,
          afternoonIn: `${g.afternoonIn}:00`,
          afternoonOut: `${g.afternoonOut}:00`
        }))
      })

      setSuccess(`Created 1 schedule with ${groups.length} pattern(s) successfully.`)
      resetForm()
    } catch (err) {
      setError(err.message || 'Something went wrong.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.wrapper}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h2 style={styles.title}>Create Shift</h2>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>{success}</div>}

        <div style={styles.field}>
          <label style={styles.label}>Shift Name</label>
          <input
            type="text"
            value={shiftName}
            onChange={(e) => setShiftName(e.target.value)}
            style={styles.input}
            placeholder="e.g. Office Schedule"
          />
        </div>

        <div style={styles.field}>
          <label style={styles.label}>Grace Period (minutes)</label>
          <input
            type="number"
            min="0"
            value={grace}
            onChange={(e) => setGrace(e.target.value)}
            style={styles.input}
          />
        </div>

        {groups.map((group, idx) => (
          <div key={idx} style={styles.groupCard}>
            <div style={styles.groupHeader}>
              <input
                type="text"
                value={group.label}
                onChange={(e) => updateGroup(idx, { label: e.target.value })}
                style={styles.groupLabelInput}
                placeholder={`Pattern ${idx + 1}`}
              />
              <button
                type="button"
                style={styles.removeBtn}
                onClick={() => removeGroup(idx)}
                disabled={groups.length === 1}
              >
                Remove
              </button>
            </div>

            <div style={styles.field}>
              <label style={styles.label}>Days</label>
              <div style={styles.daysContainer}>
                {WEEK_DAYS.map((day) => (
                  <button
                    type="button"
                    key={`${idx}-${day}`}
                    onClick={() => toggleDay(idx, day)}
                    style={{
                      ...styles.dayButton,
                      ...(group.days.includes(day) ? styles.dayActive : {})
                    }}
                  >
                    {day.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Morning Shift</h4>
              <div style={styles.row}>
                <div style={styles.fieldHalf}>
                  <label style={styles.label}>Time In</label>
                  <input
                    type="time"
                    value={group.morningIn}
                    onChange={(e) => updateGroup(idx, { morningIn: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.fieldHalf}>
                  <label style={styles.label}>Time Out</label>
                  <input
                    type="time"
                    value={group.morningOut}
                    onChange={(e) => updateGroup(idx, { morningOut: e.target.value })}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>

            <div style={styles.section}>
              <h4 style={styles.sectionTitle}>Afternoon Shift</h4>
              <div style={styles.row}>
                <div style={styles.fieldHalf}>
                  <label style={styles.label}>Time In</label>
                  <input
                    type="time"
                    value={group.afternoonIn}
                    onChange={(e) => updateGroup(idx, { afternoonIn: e.target.value })}
                    style={styles.input}
                  />
                </div>
                <div style={styles.fieldHalf}>
                  <label style={styles.label}>Time Out</label>
                  <input
                    type="time"
                    value={group.afternoonOut}
                    onChange={(e) => updateGroup(idx, { afternoonOut: e.target.value })}
                    style={styles.input}
                  />
                </div>
              </div>
            </div>
          </div>
        ))}

        <button type="button" style={styles.secondaryBtn} onClick={addGroup}>
          + Add Day/Time Pattern
        </button>

        <button
          type="submit"
          disabled={loading}
          style={{
            ...styles.submit,
            ...(loading ? styles.submitDisabled : {})
          }}
        >
          {loading ? 'Creating...' : 'Create Shift Patterns'}
        </button>
      </form>
    </div>
  )
}

const styles = {
  wrapper: {
    display: 'flex',
    justifyContent: 'center',
    padding: '40px 20px',
    background: '#f5f7fa',
    minHeight: '100vh'
  },
  card: {
    background: '#ffffff',
    padding: 30,
    borderRadius: 12,
    width: 760,
    boxShadow: '0 10px 30px rgba(0,0,0,0.08)'
  },
  title: {
    marginBottom: 20
  },
  field: {
    marginBottom: 16
  },
  fieldHalf: {
    flex: 1
  },
  row: {
    display: 'flex',
    gap: 20
  },
  label: {
    display: 'block',
    marginBottom: 6,
    fontWeight: 500
  },
  input: {
    width: '100%',
    padding: 10,
    borderRadius: 6,
    border: '1px solid #ddd',
    fontSize: 14
  },
  section: {
    marginBottom: 16
  },
  sectionTitle: {
    marginBottom: 10
  },
  daysContainer: {
    display: 'flex',
    gap: 8,
    flexWrap: 'wrap'
  },
  dayButton: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #ddd',
    background: '#fff',
    cursor: 'pointer'
  },
  dayActive: {
    background: '#2563eb',
    color: '#fff',
    border: '1px solid #2563eb'
  },
  submit: {
    width: '100%',
    padding: 12,
    borderRadius: 8,
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 15
  },
  submitDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed'
  },
  secondaryBtn: {
    width: '100%',
    marginBottom: 14,
    padding: 10,
    borderRadius: 8,
    border: '1px solid #c9d2e3',
    background: '#f8fbff',
    color: '#1f3a67',
    fontWeight: 600,
    cursor: 'pointer'
  },
  groupCard: {
    border: '1px solid #e6ecf5',
    borderRadius: 10,
    padding: 14,
    marginBottom: 14,
    background: '#fcfdff'
  },
  groupHeader: {
    display: 'flex',
    gap: 10,
    alignItems: 'center',
    marginBottom: 10
  },
  groupLabelInput: {
    flex: 1,
    padding: 9,
    borderRadius: 6,
    border: '1px solid #d5deeb',
    fontSize: 14
  },
  removeBtn: {
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #f3b3b3',
    background: '#fff5f5',
    color: '#b42318',
    cursor: 'pointer'
  },
  error: {
    background: '#fee2e2',
    color: '#991b1b',
    padding: 10,
    borderRadius: 6,
    marginBottom: 15
  },
  success: {
    background: '#dcfce7',
    color: '#166534',
    padding: 10,
    borderRadius: 6,
    marginBottom: 15
  }
}
