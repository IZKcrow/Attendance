import React, { useEffect, useMemo, useState } from 'react'
import {
  Box,
  Typography,
  Grid,
  FormControl,
  FormControlLabel,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  TextField,
  Button,
  Paper,
  Chip,
  Switch,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Checkbox
} from '@mui/material'
import * as api from '../api'
import { useSnackbar } from './ui/Snackbar'

export default function Scheduler() {
  const { show, SnackbarComponent } = useSnackbar()
  const outline = 'rgba(0,0,0,0.28)'
  const formSx = {
    borderRadius: 3,
    background: 'var(--card)',
    color: 'var(--text)',
    border: `1px solid ${outline}`,
    boxShadow: '0 10px 24px rgba(0,0,0,0.12)',
    overflow: 'hidden'
  }
  const sectionSx = { p: 2, borderTop: `1px solid ${outline}` }
  const sectionTitleSx = { fontWeight: 800, mb: 1, letterSpacing: 0.2 }
  const [employees, setEmployees] = useState([])
  const [shifts, setShifts] = useState([])
  const [selectedShiftID, setSelectedShiftID] = useState('')
  const [selectedEmployeeIDs, setSelectedEmployeeIDs] = useState([])
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().split('T')[0])
  const [effectiveTo, setEffectiveTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState([])
  const [showConflictDialog, setShowConflictDialog] = useState(false)
  const [forceAssign, setForceAssign] = useState(false)
  const [showRemoveDialog, setShowRemoveDialog] = useState(false)
  const [removeMode, setRemoveMode] = useState('shift')
  const [assignments, setAssignments] = useState([])
  const [currentAssignments, setCurrentAssignments] = useState([])
  const assignmentsTimer = React.useRef(null)
  const EMPLOYEE_PANEL_LIMIT = 25
  const EMPLOYEE_RENDER_LIMIT = 250
  const MAX_BULK_SELECT = 3000
  const [showHistory, setShowHistory] = useState(true)

  const [employeeQuery, setEmployeeQuery] = useState('')
  const [employeeSort, setEmployeeSort] = useState('code-asc')
  const [onlyBiometricLinked, setOnlyBiometricLinked] = useState(false)
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const [pasteDialogOpen, setPasteDialogOpen] = useState(false)
  const [pasteText, setPasteText] = useState('')

  const normalizeSelected = React.useCallback((ids = []) => [...new Set(ids.filter(Boolean))], [])
  const normalizeNumericCode = React.useCallback((value) => {
    const raw = String(value ?? '').trim()
    if (!raw) return ''
    const digits = raw.replace(/[^\d]/g, '')
    if (!digits) return raw
    const stripped = digits.replace(/^0+(?=\d)/, '')
    return stripped || '0'
  }, [])

  const refreshCurrentAssignments = React.useCallback(async (employeeRows) => {
    const sourceRows = Array.isArray(employeeRows) ? employeeRows : employees
    const employeeIDs = sourceRows.map((e) => e?.id).filter(Boolean)

    if (!employeeIDs.length) {
      setCurrentAssignments([])
      return []
    }

    try {
      const rows = await api.fetchEmployeeAssignments({ employeeIDs })
      const safeRows = Array.isArray(rows) ? rows : []
      setCurrentAssignments(safeRows)
      return safeRows
    } catch (_) {
      setCurrentAssignments([])
      return []
    }
  }, [employees])

  useEffect(() => {
    let mounted = true
    Promise.all([api.fetchEmployees(), api.fetchShiftDefinitions()])
      .then(([empData, shiftData]) => {
        if (!mounted) return
        setEmployees(Array.isArray(empData) ? empData : [])
        setShifts(Array.isArray(shiftData) ? shiftData : [])
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    const employeeIDs = Array.isArray(employees) ? employees.map((e) => e?.id).filter(Boolean) : []

    if (!employeeIDs.length) {
      setCurrentAssignments([])
      return () => { mounted = false }
    }

    api.fetchEmployeeAssignments({ employeeIDs })
      .then((rows) => {
        if (!mounted) return
        setCurrentAssignments(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!mounted) return
        setCurrentAssignments([])
      })

    return () => { mounted = false }
  }, [employees])

  const selectedShift = useMemo(
    () => shifts.find((s) => String(s.ShiftID) === String(selectedShiftID)),
    [shifts, selectedShiftID]
  )

  useEffect(() => {
    if (assignmentsTimer.current) clearTimeout(assignmentsTimer.current)
    if (!selectedEmployeeIDs.length) {
      setAssignments([])
      return
    }
    const ids = normalizeSelected(selectedEmployeeIDs)
    if (!ids.length) {
      setAssignments([])
      return
    }
    assignmentsTimer.current = setTimeout(async () => {
      try {
        const existing = await api.fetchEmployeeAssignmentHistory({ employeeIDs: ids, top: 6 })
        setAssignments(Array.isArray(existing) ? existing : [])
      } catch (_) {
        setAssignments([])
      }
    }, 350)
    return () => {
      if (assignmentsTimer.current) clearTimeout(assignmentsTimer.current)
    }
  }, [selectedEmployeeIDs])

  const employeeMap = useMemo(() => {
    const map = {}
    employees.forEach(e => { map[e.id] = e })
    return map
  }, [employees])

  const currentAssignmentMap = useMemo(() => {
    const map = new Map()
    for (const row of currentAssignments || []) {
      const employeeID = row?.EmployeeID
      if (!employeeID || map.has(employeeID)) continue
      map.set(employeeID, row)
    }
    return map
  }, [currentAssignments])

  const selectedSet = useMemo(() => new Set(selectedEmployeeIDs), [selectedEmployeeIDs])
  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], [])

  const getHistoryForEmployee = useMemo(() => {
    const grouped = new Map()
    for (const a of assignments || []) {
      const id = a?.EmployeeID
      if (!id) continue
      if (!grouped.has(id)) grouped.set(id, [])
      grouped.get(id).push(a)
    }
    // Ensure newest first
    for (const [id, list] of grouped.entries()) {
      list.sort((x, y) => {
        const ax = String(x?.EffectiveFrom || '')
        const ay = String(y?.EffectiveFrom || '')
        return ay.localeCompare(ax)
      })
      grouped.set(id, list)
    }
    return (employeeID) => grouped.get(employeeID) || []
  }, [assignments])

  const employeeLookup = useMemo(() => {
    const map = new Map()
    const add = (key, id) => {
      const k = String(key ?? '').trim()
      if (!k) return
      if (!map.has(k)) map.set(k, id)
    }
    for (const e of employees || []) {
      add(e.id, e.id)
      add(e.EmployeeCode, e.id)
      add(normalizeNumericCode(e.EmployeeCode), e.id)
      add(e.biometricStaffCode, e.id)
      add(normalizeNumericCode(e.biometricStaffCode), e.id)
      add(e.biometricUserId, e.id)
      add(normalizeNumericCode(e.biometricUserId), e.id)
      add(e.name, e.id)
    }
    return map
  }, [employees, normalizeNumericCode])

  const filteredEmployees = useMemo(() => {
    const q = employeeQuery.trim().toLowerCase()
    let list = Array.isArray(employees) ? employees : []

    if (onlyBiometricLinked) {
      list = list.filter((e) => {
        const a = String(e?.biometricStaffCode ?? '').trim()
        const b = String(e?.biometricUserId ?? '').trim()
        return !!(a || b)
      })
    }

    if (onlyUnassigned) {
      list = list.filter((e) => !currentAssignmentMap.has(e?.id))
    }

    if (q) {
      list = list.filter((e) => {
        const currentShiftName = currentAssignmentMap.get(e?.id)?.ShiftName
        const hay = [
          e?.EmployeeCode,
          e?.name,
          e?.department,
          currentShiftName,
          e?.assignedShift,
          e?.biometricStaffCode,
          e?.biometricUserId
        ]
          .map((v) => String(v ?? '').toLowerCase())
          .join(' ')
        return hay.includes(q)
      })
    }

    const cmpStr = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), undefined, { sensitivity: 'base' })

    list = [...list].sort((a, b) => {
      if (employeeSort === 'name-az') return cmpStr(a?.name, b?.name) || cmpStr(a?.EmployeeCode, b?.EmployeeCode)
      if (employeeSort === 'name-za') return cmpStr(b?.name, a?.name) || cmpStr(a?.EmployeeCode, b?.EmployeeCode)
      if (employeeSort === 'dept-az') return cmpStr(a?.department, b?.department) || cmpStr(a?.name, b?.name)
      const ac = normalizeNumericCode(a?.EmployeeCode)
      const bc = normalizeNumericCode(b?.EmployeeCode)
      const an = Number(ac)
      const bn = Number(bc)
      if (Number.isFinite(an) && Number.isFinite(bn) && !Number.isNaN(an) && !Number.isNaN(bn)) return an - bn
      return cmpStr(a?.EmployeeCode, b?.EmployeeCode)
    })

    return list
  }, [employees, employeeQuery, employeeSort, onlyBiometricLinked, onlyUnassigned, normalizeNumericCode, currentAssignmentMap])

  const visibleEmployees = useMemo(() => filteredEmployees.slice(0, EMPLOYEE_RENDER_LIMIT), [filteredEmployees])

  const visibleSelectedEmployeeIDs = useMemo(
    () => selectedEmployeeIDs.slice(0, EMPLOYEE_PANEL_LIMIT),
    [selectedEmployeeIDs]
  )

  const fmtDate = (value) => {
    if (!value) return '-'
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10)
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toISOString().slice(0, 10)
  }

  const fmtTime = (value) => {
    if (!value) return 'Not set'
    if (typeof value === 'string') {
      if (/^\d{2}:\d{2}/.test(value)) return value.slice(0, 5)
      const d = new Date(value)
      if (!Number.isNaN(d.getTime())) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
      return value
    }
    const d = new Date(value)
    if (Number.isNaN(d.getTime())) return String(value)
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const fmtDays = (shift) => {
    if (shift?.DayNameList) {
      return String(shift.DayNameList)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .join('-')
    }
    return shift?.DayList || '-'
  }

  const isDateRangeValid = !effectiveTo || new Date(effectiveTo) >= new Date(effectiveFrom)
  const canSubmit = selectedShiftID && selectedEmployeeIDs.length > 0 && isDateRangeValid
  const canRemove = selectedEmployeeIDs.length > 0

  const toggleEmployee = (id, checked) => {
    if (!id) return
    setSelectedEmployeeIDs((prev) => {
      const arr = Array.isArray(prev) ? prev : []
      if (checked) {
        if (arr.includes(id)) return arr
        return [...arr, id]
      }
      return arr.filter((x) => x !== id)
    })
  }

  const selectFilteredEmployees = () => {
    const ids = filteredEmployees.map((e) => e?.id).filter(Boolean)
    if (!ids.length) {
      show('No employees match the current filters.', 'warning')
      return
    }
    if (ids.length > MAX_BULK_SELECT) {
      show(`Too many employees to select at once (${ids.length}). Refine search/filters.`, 'warning')
      return
    }
    setSelectedEmployeeIDs(normalizeSelected(ids))
    show(`Selected ${ids.length} employee(s).`, 'info')
  }

  const openPaste = () => {
    setPasteText('')
    setPasteDialogOpen(true)
  }

  const applyPasteSelection = () => {
    const raw = String(pasteText ?? '').trim()
    if (!raw) {
      setPasteDialogOpen(false)
      return
    }
    const tokens = raw
      .split(/[\s,;]+/)
      .map((t) => t.trim())
      .filter(Boolean)

    const found = new Set()
    const missing = []

    for (const t of tokens) {
      const direct = employeeLookup.get(t)
      const norm = employeeLookup.get(normalizeNumericCode(t))
      const id = direct || norm || null
      if (id) found.add(id)
      else missing.push(t)
    }

    const merged = normalizeSelected([...selectedEmployeeIDs, ...Array.from(found)])
    if (merged.length > MAX_BULK_SELECT) {
      show(`Selection too large (${merged.length}). Refine or paste fewer codes.`, 'warning')
      return
    }

    setSelectedEmployeeIDs(merged)
    setPasteDialogOpen(false)

    if (missing.length) {
      show(`Selected ${found.size} employee(s). Missing: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}`, 'warning')
    } else {
      show(`Selected ${found.size} employee(s).`, 'success')
    }
  }

  const handleAssign = async () => {
    if (!canSubmit) return
    setForceAssign(false)
    setSaving(true)
    try {
      await api.assignShiftToEmployees({
        shiftID: selectedShiftID,
        employeeIDs: selectedEmployeeIDs,
        assignAll: false,
        effectiveFrom: effectiveFrom || null,
        effectiveTo: effectiveTo || null
      })
      await refreshCurrentAssignments()
      show('Shift assignment saved successfully.', 'success')
      setSelectedEmployeeIDs([])
    } catch (err) {
      show('Assignment failed: ' + (err.message || err), 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRemove = async (mode = 'shift') => {
    if (!canRemove) return
    const endDate = effectiveTo || new Date().toISOString().split('T')[0]
    setSaving(true)
    try {
      await api.removeShiftAssignments({
        shiftID: mode === 'shift' ? selectedShiftID : null,
        employeeIDs: selectedEmployeeIDs,
        effectiveTo: endDate,
        mode: 'end'
      })
      await refreshCurrentAssignments()
      show(`Assignments ended as of ${endDate}.`, 'info')
      setSelectedEmployeeIDs([])
    } catch (err) {
      const raw = String(err?.message || err || '')
      const cleaned = raw.split(';')[0].replace(/Remove assignments failed\.\s*/i, '') || 'Remove failed'
      show(`Remove failed: ${cleaned}`, 'error')
    } finally {
      setSaving(false)
    }
  }
  const handleRemoveClick = () => {
    if (!canRemove) return
    setRemoveMode('shift')
    setShowRemoveDialog(true)
  }

  if (loading) return <div>Loading scheduler...</div>

  return (
    <Box sx={{ maxWidth: 1280, mx: 'auto', px: { xs: 1.5, sm: 2.5 }, py: 2, display: 'grid', gap: 2 }}>
      {SnackbarComponent}
      <Paper sx={formSx}>
        <Box sx={{ p: 2 }}>
          <Typography variant="h5" sx={{ fontWeight: 900, mb: 0.5 }}>
            Shift Assignment
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Assign shifts for employees imported from the device. Use search, filters, or paste codes to select quickly.
          </Typography>
        </Box>

        <Box sx={sectionSx}>
          {selectedEmployeeIDs.length === 0 ? (
            <>
              <Typography variant="subtitle2" sx={sectionTitleSx}>Selected Employees</Typography>
              <Typography variant="body2" color="text.secondary">Select employees to see current shifts.</Typography>
            </>
          ) : (
            <>
              <Box sx={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 2, flexWrap: 'wrap' }}>
                <Typography variant="subtitle2" sx={sectionTitleSx}>Selected Employees & Shift Timeline</Typography>
                <FormControlLabel
                  control={<Switch checked={showHistory} onChange={(e) => setShowHistory(e.target.checked)} />}
                  label="Show history"
                />
              </Box>
              <Grid container spacing={1}>
                <Grid item xs={4}><Typography variant="caption" color="text.secondary">Employee</Typography></Grid>
                <Grid item xs={4}><Typography variant="caption" color="text.secondary">Current Shift</Typography></Grid>
                <Grid item xs={4}><Typography variant="caption" color="text.secondary">Effective</Typography></Grid>
                {visibleSelectedEmployeeIDs.map((id) => {
                  const emp = employeeMap[id]
                  const history = getHistoryForEmployee(id)
                  const current =
                    history.find(a => a?.IsCurrent === 1) ||
                    history.find(a => {
                      const from = String(a?.EffectiveFrom || '')
                      const to = a?.EffectiveTo ? String(a.EffectiveTo) : todayIso
                      return from && todayIso >= from && todayIso <= to
                    }) ||
                    history[0] ||
                    null

                  const fmtRange = (a) => {
                    const from = a?.EffectiveFrom ? fmtDate(a.EffectiveFrom) : '-'
                    const to = a?.EffectiveTo ? fmtDate(a.EffectiveTo) : 'open'
                    return `${from} → ${to}`
                  }

                  return (
                    <React.Fragment key={id}>
                      <Grid item xs={4}><Typography variant="body2">{emp?.name || emp?.EmployeeCode || id}</Typography></Grid>
                      <Grid item xs={4}><Typography variant="body2">{current?.ShiftName || current?.ShiftID || 'None'}</Typography></Grid>
                      <Grid item xs={4}><Typography variant="body2">{current ? fmtRange(current) : '-'}</Typography></Grid>
                      {showHistory && history.length > 1 && (
                        <Grid item xs={12} sx={{ pt: 0.25, pb: 0.5 }}>
                          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                            {history.slice(0, 6).map((a, idx) => (
                              <Chip
                                key={`${a.EmployeeID}_${a.ShiftID}_${a.EffectiveFrom}_${idx}`}
                                size="small"
                                label={`${a.ShiftName || 'Shift'} (${fmtRange(a)})`}
                                sx={{
                                  background: a?.IsCurrent === 1 ? 'rgba(0,144,99,0.16)' : 'rgba(148,163,184,0.18)',
                                  color: 'var(--text)',
                                  border: `1px solid ${outline}`,
                                  fontWeight: a?.IsCurrent === 1 ? 800 : 600
                                }}
                              />
                            ))}
                          </Box>
                        </Grid>
                      )}
                    </React.Fragment>
                  )
                })}
                {selectedEmployeeIDs.length > EMPLOYEE_PANEL_LIMIT && (
                  <Grid item xs={12}>
                    <Typography variant="caption" color="text.secondary">
                      Showing first {EMPLOYEE_PANEL_LIMIT} of {selectedEmployeeIDs.length} selected employees. Use search to refine.
                    </Typography>
                  </Grid>
                )}
              </Grid>
            </>
          )}
        </Box>

        <Box sx={sectionSx}>
          <Grid container>
            <Grid item xs={12} md={5} sx={{ pr: { md: 2 }, borderRight: { md: `1px solid ${outline}` } }}>
              <Typography variant="subtitle2" sx={sectionTitleSx}>Shift Selection</Typography>
              <FormControl fullWidth>
                <InputLabel id="shift-label">Shift</InputLabel>
                <Select
                  labelId="shift-label"
                  value={selectedShiftID}
                  label="Shift"
                  onChange={(e) => setSelectedShiftID(String(e.target.value))}
                  disabled={loading}
                >
                  {shifts.map((s) => (
                    <MenuItem key={s.ShiftID} value={s.ShiftID}>
                      {s.ShiftName}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
              {shifts.length === 0 && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  No shifts defined yet.
                </Typography>
              )}
            </Grid>

            <Grid item xs={12} md={7} sx={{ pl: { md: 2 }, pt: { xs: 2, md: 0 } }}>
              <Typography variant="subtitle2" sx={sectionTitleSx}>Employees</Typography>
              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <TextField
                  size="small"
                  label="Search"
                  value={employeeQuery}
                  onChange={(e) => setEmployeeQuery(e.target.value)}
                  sx={{ minWidth: 220, flexGrow: 1 }}
                />
                <FormControl size="small" sx={{ minWidth: 180 }}>
                  <InputLabel id="employee-sort">Sort</InputLabel>
                  <Select
                    labelId="employee-sort"
                    label="Sort"
                    value={employeeSort}
                    onChange={(e) => setEmployeeSort(String(e.target.value))}
                  >
                    <MenuItem value="code-asc">Staff Code (0-9)</MenuItem>
                    <MenuItem value="name-az">Name (A-Z)</MenuItem>
                    <MenuItem value="name-za">Name (Z-A)</MenuItem>
                    <MenuItem value="dept-az">Department (A-Z)</MenuItem>
                  </Select>
                </FormControl>
              </Box>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center', mb: 1 }}>
                <FormControlLabel
                  control={<Switch checked={onlyBiometricLinked} onChange={(e) => setOnlyBiometricLinked(e.target.checked)} />}
                  label="Biometric-linked only"
                />
                <FormControlLabel
                  control={<Switch checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} />}
                  label="Unassigned only"
                />
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="caption" color="text.secondary">
                  Showing {Math.min(visibleEmployees.length, EMPLOYEE_RENDER_LIMIT)} of {filteredEmployees.length}
                </Typography>
              </Box>

              <Divider sx={{ mb: 1, borderColor: outline }} />

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
                  onClick={selectFilteredEmployees}
                  disabled={filteredEmployees.length === 0 || saving}
                  title="Select all employees that match the current search/filters"
                >
                  Select Filtered
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
                  onClick={openPaste}
                  disabled={saving}
                  title="Paste Staff Codes / Employee Codes / Biometric IDs to select employees instantly"
                >
                  Paste Codes
                </Button>
                <Button
                  size="small"
                  variant="outlined"
                  sx={{ color: 'var(--primary)', borderColor: 'var(--primary)', ':hover': { borderColor: 'var(--primary)', background: 'rgba(0,144,99,0.08)' } }}
                  onClick={() => setSelectedEmployeeIDs([])}
                  disabled={selectedEmployeeIDs.length === 0 || saving}
                >
                  Clear Selection
                </Button>
                <Box sx={{ flexGrow: 1 }} />
                <Typography variant="caption" color="text.secondary" sx={{ alignSelf: 'center' }}>
                  Selected: {selectedEmployeeIDs.length}
                </Typography>
              </Box>

              <Box sx={{ maxHeight: 360, overflowY: 'auto', border: `1px solid ${outline}`, borderRadius: 2, background: 'var(--surface)' }}>
                <List dense disablePadding>
                  {visibleEmployees.map((emp) => {
                    const id = emp?.id
                    const checked = id ? selectedSet.has(id) : false
                    const currentAssignment = id ? currentAssignmentMap.get(id) : null
                    const primary = `${emp?.EmployeeCode || ''} ${emp?.name || ''}`.trim() || 'Unnamed'
                    const secondaryParts = [
                      emp?.department ? `Dept: ${emp.department}` : null,
                      currentAssignment?.ShiftName ? `Shift: ${currentAssignment.ShiftName}` : null
                    ].filter(Boolean)
                    const secondary = secondaryParts.join(' • ')

                    return (
                      <ListItem disablePadding key={id || primary}>
                        <ListItemButton onClick={() => toggleEmployee(id, !checked)}>
                          <ListItemIcon sx={{ minWidth: 36 }}>
                            <Checkbox edge="start" checked={checked} tabIndex={-1} disableRipple />
                          </ListItemIcon>
                          <ListItemText
                            primary={primary}
                            secondary={secondary || null}
                            primaryTypographyProps={{ fontWeight: checked ? 800 : 600 }}
                            secondaryTypographyProps={{ sx: { opacity: 0.85 } }}
                          />
                        </ListItemButton>
                      </ListItem>
                    )
                  })}

                  {filteredEmployees.length === 0 && (
                    <ListItem sx={{ py: 2 }}>
                      <ListItemText primary="No employees match your filters." />
                    </ListItem>
                  )}

                  {filteredEmployees.length > EMPLOYEE_RENDER_LIMIT && (
                    <ListItem sx={{ py: 1.5 }}>
                      <ListItemText
                        primary={`Showing first ${EMPLOYEE_RENDER_LIMIT} employees. Refine search to narrow results.`}
                        primaryTypographyProps={{ variant: 'caption', color: 'text.secondary' }}
                      />
                    </ListItem>
                  )}
                </List>
              </Box>
            </Grid>
          </Grid>
        </Box>

        <Box sx={sectionSx}>
          <Typography variant="subtitle2" sx={sectionTitleSx}>Effective Period</Typography>
          <Grid container spacing={2}>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="date"
                label="Effective From"
                value={effectiveFrom}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                type="date"
                label="Effective To (optional)"
                value={effectiveTo}
                onChange={(e) => setEffectiveTo(e.target.value)}
                InputLabelProps={{ shrink: true }}
                error={!isDateRangeValid}
                helperText={!isDateRangeValid ? 'Effective To cannot be before Effective From' : ''}
              />
            </Grid>
          </Grid>
        </Box>

        {selectedShift && (
          <Box sx={sectionSx}>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mb: 1 }}>
              Selected Shift Preview
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
              <Chip label={`Name: ${selectedShift.ShiftName}`} />
              <Chip label={`AM: ${fmtTime(selectedShift.MorningTimeIn)} - ${fmtTime(selectedShift.MorningTimeOut)}`} />
              <Chip label={`PM: ${fmtTime(selectedShift.AfternoonTimeIn)} - ${fmtTime(selectedShift.AfternoonTimeOut)}`} />
              <Chip label={`Days: ${fmtDays(selectedShift)}`} />
            </Box>
          </Box>
        )}

        <Box sx={sectionSx}>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
            <Button
              variant="contained"
              disabled={!canSubmit || saving}
              onClick={handleAssign}
              sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' }, fontWeight: 800, textTransform: 'none' }}
            >
              {saving ? 'Assigning...' : 'Assign Shift'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              disabled={!canRemove || !selectedShiftID || saving}
              onClick={() => { setRemoveMode('shift'); setShowRemoveDialog(true) }}
              sx={{ textTransform: 'none', fontWeight: 700, borderColor: outline }}
            >
              {saving ? 'Removing...' : 'End Selected Shift'}
            </Button>
            <Button
              variant="outlined"
              color="error"
              disabled={!canRemove || saving}
              onClick={() => { setRemoveMode('all'); setShowRemoveDialog(true) }}
              sx={{ textTransform: 'none', fontWeight: 700, borderColor: outline }}
            >
              {saving ? 'Removing...' : 'End All Shifts'}
            </Button>
            <Box sx={{ flexGrow: 1 }} />
            <Typography variant="caption" sx={{ opacity: 0.8 }}>
              Tip: Use “Paste Codes” when importing from device logs.
            </Typography>
          </Box>
          {!selectedShiftID && (
            <Typography variant="caption" sx={{ mt: 1, display: 'block', color: 'text.secondary' }}>
              If no shift is selected, ALL shifts for selected employees will be ended.
            </Typography>
          )}
        </Box>
      </Paper>

      <Dialog open={showConflictDialog} onClose={() => setShowConflictDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' } }}>
        <DialogTitle sx={{ color: 'var(--text)', fontWeight: 700 }}>Employees Already Assigned</DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            The following employee(s) already have a shift. Do you want to override and assign the new shift?
          </Typography>
          <List dense>
            {conflicts.map((c, idx) => (
              <ListItem key={`${c.EmployeeID}-${idx}`} sx={{ py: 0.3 }}>
                {employeeMap[c.EmployeeID]?.name || c.EmployeeID}
              </ListItem>
            ))}
          </List>
        </DialogContent>
        <DialogActions sx={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => { setShowConflictDialog(false); setForceAssign(false) }}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="warning"
            onClick={() => {
              setShowConflictDialog(false)
              setForceAssign(true)
              handleAssign()
            }}
          >
            Override & Assign
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={showRemoveDialog} onClose={() => setShowRemoveDialog(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' } }}>
        <DialogTitle sx={{ color: 'var(--text)', fontWeight: 700 }}>Confirm Removal</DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {removeMode === 'shift'
              ? `End selected shift for ${selectedEmployeeIDs.length} employee(s) as of ${effectiveTo || 'today'}?`
              : `End ALL shifts for ${selectedEmployeeIDs.length} employee(s) as of ${effectiveTo || 'today'}?`}
          </Typography>
          <List dense>
            {selectedEmployeeIDs.slice(0, 5).map((id) => (
              <ListItem key={id} sx={{ py: 0.3 }}>
                {employeeMap[id]?.name || id}
              </ListItem>
            ))}
            {selectedEmployeeIDs.length > 5 && (
              <ListItem sx={{ py: 0.3, color: 'text.secondary' }}>
                ...and {selectedEmployeeIDs.length - 5} more
              </ListItem>
            )}
          </List>
        </DialogContent>
        <DialogActions sx={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => setShowRemoveDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={() => {
              setShowRemoveDialog(false)
              handleRemove(removeMode)
            }}
          >
            End Assignment
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={pasteDialogOpen} onClose={() => setPasteDialogOpen(false)} maxWidth="sm" fullWidth PaperProps={{ sx: { background: 'var(--card)', color: 'var(--text)', border: '1px solid var(--border)' } }}>
        <DialogTitle sx={{ color: 'var(--text)', fontWeight: 700 }}>Paste Employee Codes</DialogTitle>
        <DialogContent dividers sx={{ borderColor: 'var(--border)', background: 'var(--surface)', color: 'var(--text)' }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            Paste Staff Codes / Employee Codes / Biometric IDs (separated by spaces, commas, or newlines).
          </Typography>
          <TextField
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            multiline
            minRows={6}
            fullWidth
            placeholder={"Example:\n0000000248\n248\nE00123\n"}
          />
        </DialogContent>
        <DialogActions sx={{ background: 'var(--card)', borderTop: '1px solid var(--border)' }}>
          <Button onClick={() => setPasteDialogOpen(false)}>
            Cancel
          </Button>
          <Button variant="contained" onClick={applyPasteSelection} sx={{ background: 'var(--primary)', ':hover': { background: 'var(--primary-dark)' } }}>
            Select Matches
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
