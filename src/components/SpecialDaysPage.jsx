//SpecialDaysPage.jsx
import React from 'react'
import { Box, Button, Paper, TableCell, TextField } from '@mui/material'
import GenericDataTable from './GenericDataTable'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

const primaryBtnSx = {
  backgroundColor: 'var(--primary)',
  color: '#fff',
  fontWeight: 700,
  textTransform: 'none',
  borderRadius: 2,
  boxShadow: '0 4px 10px rgba(0,0,0,0.18)',
  ':hover': { backgroundColor: 'var(--primary-dark)' }
}

const formCardSx = {
  display: 'flex',
  gap: 2,
  rowGap: 1.5,
  flexWrap: 'wrap',
  alignItems: 'flex-end',
  justifyContent: 'space-between',
  padding: 2,
  marginBottom: 2,
  backgroundColor: 'var(--card)',
  border: '1px solid var(--border)',
  boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
  borderRadius: 3
}

const inputSx = {
  minWidth: 240,
  backgroundColor: '#fdfdfd',
  '& fieldset': { borderColor: 'var(--border)' },
  '&:hover fieldset': { borderColor: 'var(--primary)' },
  '&.Mui-focused fieldset': { borderColor: 'var(--primary)' }
}

const dayTypeMeta = {
  HOLIDAY: {
    label: 'Regular Holiday',
    bg: '#3f6b2a',
    fg: '#ffffff'
  },
  SPECIAL_NON_WORKING: {
    label: 'Special Non-Working',
    bg: '#7faa5f',
    fg: '#ffffff'
  },
  REST_DAY: {
    label: 'Rest Day',
    bg: '#6b7280',
    fg: '#ffffff'
  },
  HALF_DAY_AM: {
    label: 'Half Day AM',
    bg: '#0ea5e9',
    fg: '#ffffff'
  },
  HALF_DAY_PM: {
    label: 'Half Day PM',
    bg: '#0ea5e9',
    fg: '#ffffff'
  }
}

function getDayTypeMeta(dayType) {
  const normalized = String(dayType || '').trim().toUpperCase()
  return dayTypeMeta[normalized] || {
    label: normalized || 'Unknown',
    bg: '#374151',
    fg: '#ffffff'
  }
}

function renderDayTypeBadge(dayType) {
  const meta = getDayTypeMeta(dayType)
  return (
    <span style={{
      padding: '4px 10px',
      borderRadius: 999,
      background: meta.bg,
      color: meta.fg,
      fontWeight: 700,
      fontSize: 13,
      display: 'inline-block',
      minWidth: 90,
      textAlign: 'center'
    }}>
      {meta.label}
    </span>
  )
}

export default function SpecialDaysPage() {
  const { show, SnackbarComponent } = useSnackbar()
  const [days, setDays] = React.useState([])
  const [loading, setLoading] = React.useState(true)
  const [year, setYear] = React.useState(() => String(new Date().getFullYear()))
  const [generating, setGenerating] = React.useState(false)

  const todayIso = React.useMemo(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 10)
  }, [])

  React.useEffect(() => {
    loadDays()
  }, [])

  const loadDays = async () => {
    try {
      setLoading(true)
      const data = await api.fetchSpecialDays()
      setDays(Array.isArray(data) ? data : [])
    } catch (err) {
      show(`Load failed: ${err.message || err}`, 'error')
    } finally {
      setLoading(false)
    }
  }

  const handleAdd = async (form) => {
    const result = await api.createSpecialDay(form)
    setDays([...days, result])
    show('Special day created.', 'success')
  }

  const handleEdit = async (form) => {
    const result = await api.updateSpecialDay(form.SpecialDayID, form)
    setDays(days.map(d => d.SpecialDayID === form.SpecialDayID ? result : d))
    show('Special day updated.', 'success')
  }

  const handleDelete = async (id) => {
    await api.deleteSpecialDay(id)
    setDays(days.filter(d => d.SpecialDayID !== id))
    show('Special day deleted.', 'success')
  }

  return (
    <>
      {SnackbarComponent}

      <Paper sx={formCardSx}>
        <TextField
          size="small"
          label="Year"
          type="number"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          inputProps={{ min: 2000, max: 2100 }}
          sx={inputSx}
          helperText="Generate common PH holidays, including Christian, Muslim, and civic dates (you can still add/edit manually)."
        />
        <Box sx={{ flexGrow: 1 }} />
        <Button
          variant="contained"
          disabled={generating}
          onClick={async () => {
            const y = Number(year)
            if (!Number.isInteger(y) || y < 2000 || y > 2100) {
              show('Please enter a valid year (2000-2100).', 'warning')
              return
            }
            setGenerating(true)
            try {
              const res = await api.generateSpecialDaysYear(y, false)
              await loadDays()
              show(`Generated ${res.inserted} special day(s) for ${y}. Skipped: ${res.skipped}.`, 'success')
            } catch (err) {
              show(`Generate failed: ${err.message || err}`, 'error')
            } finally {
              setGenerating(false)
            }
          }}
          sx={primaryBtnSx}
        >
          {generating ? 'Generating...' : 'Generate Holidays'}
        </Button>
      </Paper>

      <GenericDataTable
        title="Special Days"
        columns={['SpecialDate', 'DayType', 'Description']}
        columnSchema={{ SpecialDate: { type: 'date' } }}
        defaultFormValues={{ SpecialDate: todayIso, DayType: 'HOLIDAY', Description: '' }}
        data={days}
        loading={loading}
        primaryKeyField="SpecialDayID"
        readOnly={false}
        showRowDelete={true}
        onAdd={handleAdd}
        onEdit={handleEdit}
        onDelete={handleDelete}
        renderRow={(row) => (
          <>
            <TableCell>{row.SpecialDate}</TableCell>
            <TableCell>{renderDayTypeBadge(row.DayType)}</TableCell>
            <TableCell>{row.Description}</TableCell>
          </>
        )}
      />
    </>
  )
}
