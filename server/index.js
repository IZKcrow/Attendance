const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const sql = require('mssql')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const https = require('https')

function parseEnvValue(rawValue) {
  let value = String(rawValue || '').trim()
  if (!value) return ''
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1)
  }
  return value.replace(/\\n/g, '\n')
}

function loadEnvFile(filePath) {
  try {
    if (!fs.existsSync(filePath)) return
    const text = fs.readFileSync(filePath, 'utf8')
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/)
      if (!match) continue
      const [, key, rawValue] = match
      if (process.env[key] == null) {
        process.env[key] = parseEnvValue(rawValue)
      }
    }
  } catch (err) {
    console.warn('Failed to load .env file:', err.message)
  }
}

function normalizeBaseUrl(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  return raw.replace(/\/+$/, '')
}

loadEnvFile(path.join(__dirname, '..', '.env'))

const app = express()
const PORT = process.env.PORT || 4000
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'dev-bridge-token'
const APP_BASE_URL = normalizeBaseUrl(process.env.APP_BASE_URL || '')
const MAILERSEND_API_KEY = String(process.env.MAILERSEND_API_KEY || process.env.RESEND_API_KEY || '').trim()
const MAILERSEND_FROM_EMAIL = String(process.env.MAILERSEND_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || '').trim()
const MAILERSEND_FROM_NAME = String(process.env.MAILERSEND_FROM_NAME || process.env.RESEND_FROM_NAME || 'Attendance System').trim() || 'Attendance System'

app.use(cors())
app.use(bodyParser.json({ limit: '10mb' }))

const rawServer = process.env.MSSQL_HOST || process.env.DB_HOST || process.env.SERVER_NAME || 'IAD-BERNS-LPT'
const parsed = { host: rawServer, instanceName: null }
if (rawServer && rawServer.includes('\\')) {
  const parts = rawServer.split('\\')
  parsed.host = parts[0]
  parsed.instanceName = parts[1]
}

const dbConfig = {
  user: process.env.MSSQL_USER || process.env.DB_USER || 'sa',
  password: process.env.MSSQL_PASSWORD || process.env.DB_PASS || process.env.PASSWORD || 'password12345',
  server: parsed.host,
  database: process.env.MSSQL_DATABASE || process.env.DB_NAME || 'FlexiAttendanceSystem',
  port: parseInt(process.env.MSSQL_PORT || process.env.DB_PORT || '1433', 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
    instanceName: parsed.instanceName || undefined
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  connectionTimeout: 15000,
  requestTimeout: 60000
}

console.log('DB config:', {
  user: dbConfig.user,
  server: dbConfig.server,
  instanceName: dbConfig.options.instanceName,
  database: dbConfig.database,
  port: dbConfig.port
})

let poolPromise = null

function isMailerSendConfigured() {
  return Boolean(MAILERSEND_API_KEY && MAILERSEND_FROM_EMAIL)
}

function getAppBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL

  const originHeader = normalizeBaseUrl(req?.headers?.origin)
  if (originHeader) return originHeader

  const forwardedProto = String(req?.headers?.['x-forwarded-proto'] || '').split(',')[0].trim()
  const forwardedHost = String(req?.headers?.['x-forwarded-host'] || '').split(',')[0].trim()
  const host = forwardedHost || String(req?.headers?.host || '').split(',')[0].trim()
  const protocol = forwardedProto || req?.protocol || 'http'

  return host ? `${protocol}://${host}` : 'http://localhost:5173'
}

function buildAppUrl(req, routePath) {
  const rawPath = String(routePath || '')
  const cleanPath = rawPath.startsWith('/') ? rawPath : `/${rawPath}`
  return `${getAppBaseUrl(req)}${cleanPath}`
}

function formatFromAddress() {
  if (!MAILERSEND_FROM_EMAIL) return ''
  return MAILERSEND_FROM_NAME ? `${MAILERSEND_FROM_NAME} <${MAILERSEND_FROM_EMAIL}>` : MAILERSEND_FROM_EMAIL
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function buildEmailShell({ preheader, title, intro, actionLabel, actionUrl, footer }) {
  const safeActionUrl = escapeHtml(actionUrl)
  return `
    <div style="background:#f4f7fb;padding:32px 16px;font-family:Arial,sans-serif;color:#122033;">
      <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:18px;padding:32px;border:1px solid #dde7f3;box-shadow:0 12px 40px rgba(15,38,72,0.08);">
        <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
          ${escapeHtml(preheader)}
        </div>
        <p style="margin:0 0 12px;color:#46617f;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;">
          Attendance Admin
        </p>
        <h1 style="margin:0 0 14px;font-size:28px;line-height:1.2;color:#10233f;">${escapeHtml(title)}</h1>
        <p style="margin:0 0 24px;font-size:15px;line-height:1.65;color:#304968;">${intro}</p>
        <p style="margin:0 0 28px;">
          <a href="${safeActionUrl}" style="display:inline-block;padding:14px 22px;border-radius:12px;background:#0f62fe;color:#ffffff;text-decoration:none;font-weight:700;">
            ${escapeHtml(actionLabel)}
          </a>
        </p>
        <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#5e748d;">
          If the button does not work, open this link:
        </p>
        <p style="margin:0 0 24px;font-size:13px;line-height:1.6;word-break:break-all;">
          <a href="${safeActionUrl}" style="color:#0f62fe;text-decoration:none;">${safeActionUrl}</a>
        </p>
        <p style="margin:0;font-size:12px;line-height:1.6;color:#70839a;">${footer}</p>
      </div>
    </div>
  `
}

function buildAdminInvitationEmail({ registerUrl, inviteEmail, expiresHours, invitedBy }) {
  const invitedText = invitedBy
    ? `${escapeHtml(invitedBy)} invited ${inviteEmail ? escapeHtml(inviteEmail) : 'you'} to join the Attendance admin portal.`
    : `${inviteEmail ? escapeHtml(inviteEmail) : 'You'} were invited to join the Attendance admin portal.`
  const footer = `This invitation expires in ${expiresHours} hour${expiresHours === 1 ? '' : 's'}. If you were not expecting this email, you can ignore it.`

  return {
    subject: 'Attendance admin invitation',
    html: buildEmailShell({
      preheader: 'Your admin invitation is ready.',
      title: 'Create your admin account',
      intro: `${invitedText}<br /><br />Use the button below to finish your registration and set your password.`,
      actionLabel: 'Accept Invitation',
      actionUrl: registerUrl,
      footer
    }),
    text: [
      invitedBy ? `${invitedBy} invited ${inviteEmail || 'you'} to join the Attendance admin portal.` : `${inviteEmail || 'You'} were invited to join the Attendance admin portal.`,
      '',
      `Open this link to create your admin account: ${registerUrl}`,
      '',
      footer
    ].join('\n')
  }
}

function buildPasswordResetEmail({ email, resetUrl, expiresHours }) {
  const footer = `This reset link expires in ${expiresHours} hour${expiresHours === 1 ? '' : 's'}. If you did not request a password reset, you can safely ignore this email.`

  return {
    subject: 'Reset your Attendance admin password',
    html: buildEmailShell({
      preheader: 'Use this link to reset your admin password.',
      title: 'Reset your password',
      intro: `A password reset was requested for <strong>${escapeHtml(email)}</strong>.<br /><br />Use the button below to choose a new password.`,
      actionLabel: 'Reset Password',
      actionUrl: resetUrl,
      footer
    }),
    text: [
      `A password reset was requested for ${email}.`,
      '',
      `Open this link to reset your password: ${resetUrl}`,
      '',
      footer
    ].join('\n')
  }
}

function sendTransactionalEmail({ to, subject, html, text }) {
  if (!isMailerSendConfigured()) {
    return Promise.resolve({
      sent: false,
      skipped: true,
      reason: 'MailerSend is not configured.'
    })
  }

  const recipients = Array.isArray(to) ? to.filter(Boolean) : [to].filter(Boolean)
  if (!recipients.length) {
    return Promise.resolve({
      sent: false,
      skipped: true,
      reason: 'No recipient provided.'
    })
  }

  const payload = JSON.stringify({
    from: {
      email: MAILERSEND_FROM_EMAIL,
      name: MAILERSEND_FROM_NAME
    },
    to: recipients.map((email) => ({ email })),
    subject,
    html,
    text
  })

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.mailersend.com',
        path: '/v1/email',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MAILERSEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => { body += chunk })
        res.on('end', () => {
          let parsedBody = null
          try {
            parsedBody = body ? JSON.parse(body) : null
          } catch (_) {}

          if (res.statusCode >= 200 && res.statusCode < 300) {
            return resolve({
              sent: true,
              id: res.headers['x-message-id'] || parsedBody?.id || null,
              provider: 'mailersend'
            })
          }

          const errorMessage = parsedBody?.message
            || parsedBody?.error
            || (parsedBody?.errors && typeof parsedBody.errors === 'object' && Object.values(parsedBody.errors).flat().map((entry) => String(entry)).join('; '))
            || `MailerSend request failed with status ${res.statusCode}`

          reject(new Error(errorMessage))
        })
      }
    )

    req.on('error', reject)
    req.write(payload)
    req.end()
  })
}

function parseTimeString(value) {
  if (value == null) return null

  const toLiteral = (h, m, s = 0) => {
    if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s)) return null
    if (h < 0 || h > 23) return null
    if (m < 0 || m > 59) return null
    if (s < 0 || s > 59) return null
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return toLiteral(value.getHours(), value.getMinutes(), value.getSeconds())
  }

  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  const isoMatch = raw.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (isoMatch) {
    return toLiteral(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3] || 0))
  }

  const ampmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])$/)
  if (ampmMatch) {
    let h = Number(ampmMatch[1])
    const m = Number(ampmMatch[2])
    const s = Number(ampmMatch[3] || 0)
    const meridiem = ampmMatch[4].toUpperCase()
    if (h < 1 || h > 12) return null
    if (meridiem === 'AM') h = h === 12 ? 0 : h
    if (meridiem === 'PM') h = h === 12 ? 12 : h + 12
    return toLiteral(h, m, s)
  }

  const hmMatch = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (hmMatch) {
    return toLiteral(Number(hmMatch[1]), Number(hmMatch[2]), Number(hmMatch[3] || 0))
  }

  return null
}

function toTimeLiteral(value) {
  if (!value) return null
  if (value instanceof Date) {
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`
  }
  if (typeof value === 'string') return parseTimeString(value)
  return null
}

function stripBom(text) {
  if (!text) return ''
  if (text.charCodeAt(0) === 0xFEFF) return text.slice(1)
  return text
}

function parseCsvRows(csvText) {
  const text = stripBom(String(csvText ?? ''))
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  const pushField = () => {
    row.push(field)
    field = ''
  }

  const pushRow = () => {
    rows.push(row)
    row = []
  }

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1]
        if (next === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
      continue
    }

    if (ch === ',') {
      pushField()
      continue
    }

    if (ch === '\r') continue

    if (ch === '\n') {
      pushField()
      pushRow()
      continue
    }

    field += ch
  }

  pushField()
  if (row.length) pushRow()

  while (rows.length && rows[rows.length - 1].every(v => String(v ?? '') === '')) rows.pop()

  return rows
}

function normalizeHeaderName(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\./g, '')
}

function normalizeNumericCode(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const digits = raw.replace(/[^\d]/g, '')
  if (!digits) return raw
  const stripped = digits.replace(/^0+(?=\d)/, '')
  return stripped || '0'
}

function normalizeBiometricIdentifierForComparison(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (/^\d+$/.test(raw)) return normalizeNumericCode(raw)
  return raw.toLowerCase()
}

function biometricIdentifiersMatch(left, right) {
  const a = normalizeBiometricIdentifierForComparison(left)
  const b = normalizeBiometricIdentifierForComparison(right)
  return !!a && !!b && a === b
}

function getBiometricConflictMessage(conflict) {
  if (!conflict) return null
  if (conflict.incomingField === 'Biometric Staff Code') {
    return 'Staff Code already taken.'
  }
  if (conflict.incomingField === 'Biometric User ID') {
    return 'User ID already taken.'
  }
  return 'Staff Code/User ID already taken.'
}

function parseMmDdYyyyToIso(dateText) {
  const raw = String(dateText ?? '').trim()
  if (!raw) return null
  const parts = raw.split(/[\/\-]/).map(p => p.trim()).filter(Boolean)
  if (parts.length !== 3) return null

  let a = Number(parts[0])
  let b = Number(parts[1])
  const y = Number(parts[2])
  if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(y)) return null
  if (y < 1900 || y > 2100) return null

  let month = a
  let day = b
  if (a > 12 && b >= 1 && b <= 12) {
    day = a
    month = b
  }

  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null

  return `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseCsvTimeToHms(timeText) {
  const t = parseTimeString(timeText)
  if (!t) return null
  const parts = t.split(':')
  const h = Number(parts[0])
  const m = Number(parts[1])
  const s = Number(parts[2] || 0)
  if (!Number.isInteger(h) || !Number.isInteger(m) || !Number.isInteger(s)) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function splitName(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return { firstName: '', lastName: '' }
  if (raw.includes(',')) {
    const [last, first] = raw.split(',').map(s => (s || '').trim())
    return { firstName: first || '', lastName: last || '' }
  }
  const parts = raw.split(/\s+/).filter(Boolean)
  const firstName = parts.shift() || ''
  const lastName = parts.join(' ') || ''
  return { firstName, lastName }
}

async function writeAuditLog(pool, payload) {
  try {
    const req = pool.request()
    req.input('AuditLogID', sql.NVarChar(36), require('crypto').randomUUID())
    req.input('Actor', sql.NVarChar(100), payload?.actor || null)
    req.input('Action', sql.NVarChar(100), payload?.action || 'UNKNOWN')
    req.input('TableName', sql.NVarChar(128), payload?.tableName || 'UNKNOWN')
    req.input('RecordID', sql.NVarChar(100), payload?.recordID || null)
    req.input('BeforeJson', sql.NVarChar(sql.MAX), payload?.beforeJson || null)
    req.input('AfterJson', sql.NVarChar(sql.MAX), payload?.afterJson || null)
    req.input('DeviceID', sql.NVarChar(36), payload?.deviceID || null)
    req.input('IPAddress', sql.NVarChar(64), payload?.ipAddress || null)
    await req.query(`
      INSERT INTO dbo.AuditLogs
      (AuditLogID, Actor, Action, TableName, RecordID, BeforeJson, AfterJson, DeviceID, IPAddress)
      VALUES
      (@AuditLogID, @Actor, @Action, @TableName, @RecordID, @BeforeJson, @AfterJson, @DeviceID, @IPAddress)
    `)
  } catch (_) {
  }
}

function resolveAuditActor(req, fallback) {
  try {
    const adminEmail = (req && req.authUser && req.authUser.email) ? String(req.authUser.email).trim() : ''
    if (adminEmail) return adminEmail
  } catch (_) {}
  const fb = String(fallback || '').trim()
  return fb || 'SYSTEM'
}

function getEmployeeSaveErrorMessage(err) {
  const msg = String(err?.message || err || '')
  const lower = msg.toLowerCase()

  if (!lower.includes('cannot insert duplicate key') && !lower.includes('unique')) {
    return null
  }

  if (msg.includes('UQ_Employees_BiometricStaffCode') || msg.includes('BiometricStaffCode')) {
    return 'Biometric Staff Code is already assigned to another employee.'
  }

  if (msg.includes('UQ_Employees_BiometricUserID') || msg.includes('BiometricUserID')) {
    return 'Biometric User ID is already assigned to another employee.'
  }

  if (msg.includes('EmployeeCode')) {
    return 'Employee code already exists.'
  }

  return 'Employee record already exists.'
}

async function findEmployeeBiometricConflict(pool, { employeeID = null, biometricStaffCode = null, biometricUserId = null } = {}) {
  const incoming = [
    { field: 'Biometric Staff Code', value: biometricStaffCode },
    { field: 'Biometric User ID', value: biometricUserId }
  ]
    .map((item) => ({ ...item, value: String(item.value ?? '').trim() }))
    .filter((item) => item.value)

  if (!incoming.length) return null

  const result = await pool.request()
    .input('EmployeeID', sql.NVarChar(36), employeeID || null)
    .query(`
      SELECT
        EmployeeID,
        BiometricStaffCode,
        BiometricUserID
      FROM dbo.Employees
      WHERE (@EmployeeID IS NULL OR EmployeeID <> @EmployeeID)
        AND (
          (BiometricStaffCode IS NOT NULL AND LTRIM(RTRIM(BiometricStaffCode)) <> '')
          OR
          (BiometricUserID IS NOT NULL AND LTRIM(RTRIM(BiometricUserID)) <> '')
        )
    `)

  for (const employee of result.recordset || []) {
    const existing = [
      { field: 'Biometric Staff Code', value: employee.BiometricStaffCode },
      { field: 'Biometric User ID', value: employee.BiometricUserID }
    ]
      .map((item) => ({ ...item, value: String(item.value ?? '').trim() }))
      .filter((item) => item.value)

    for (const candidate of incoming) {
      for (const current of existing) {
        if (!biometricIdentifiersMatch(candidate.value, current.value)) continue
        return {
          incomingField: candidate.field,
          existingField: current.field,
          normalizedOnly: candidate.value !== current.value
        }
      }
    }
  }

  return null
}

async function initDbIfNeeded(pool) {

  const tableStatements = [
    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.Employees (
    EmployeeID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeCode NVARCHAR(50) NOT NULL UNIQUE,
    FirstName NVARCHAR(100) NOT NULL,
    LastName NVARCHAR(100) NOT NULL,
    Department NVARCHAR(100) NULL,
    MiddleName NVARCHAR(100) NULL,
    Gender NVARCHAR(20) NULL,
    DateOfBirth DATE NULL,
    ContactNumber NVARCHAR(50) NULL,
    Email NVARCHAR(150) NULL,
    Address NVARCHAR(255) NULL,
    HireDate DATE NOT NULL,
    EmploymentStatus NVARCHAR(50) DEFAULT 'Active',
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
  )
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftDefinitions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftDefinitions (
    ShiftID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftName NVARCHAR(100) NOT NULL,
    ExternalSource NVARCHAR(50) NULL,
    ExternalShiftCode NVARCHAR(50) NULL,
    ExternalShiftName NVARCHAR(100) NULL,
    ExternalConfigJson NVARCHAR(MAX) NULL,
    MorningTimeIn TIME(7) NOT NULL,
    MorningTimeOut TIME(7) NULL,
    AfternoonTimeIn TIME(7) NULL,
    AfternoonTimeOut TIME(7) NULL,
    GracePeriodMinutes INT DEFAULT 5,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
  )
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftSegments' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftSegments (
    ShiftSegmentID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    SegmentNo INT NOT NULL CHECK (SegmentNo BETWEEN 1 AND 3),
    StartTime TIME(7) NOT NULL,
    EndTime TIME(7) NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    CONSTRAINT UQ_ShiftSegments_Shift_Segment UNIQUE (ShiftID, SegmentNo),
    FOREIGN KEY (ShiftID) REFERENCES dbo.ShiftDefinitions(ShiftID) ON DELETE CASCADE
  );
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftPunchRules' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftPunchRules (
    ShiftPunchRuleID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    SegmentNo INT NOT NULL CHECK (SegmentNo BETWEEN 1 AND 3),
    BeforeStartMinutes INT NULL,
    AfterStartMinutes INT NULL,
    BeforeEndMinutes INT NULL,
    AfterEndMinutes INT NULL,
    LateMinutes INT NULL,
    EarlyLeaveMinutes INT NULL,
    Enabled BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    CONSTRAINT UQ_ShiftPunchRules_Shift_Segment UNIQUE (ShiftID, SegmentNo),
    CONSTRAINT FK_ShiftPunchRules_ShiftSegments FOREIGN KEY (ShiftID, SegmentNo) REFERENCES dbo.ShiftSegments(ShiftID, SegmentNo) ON DELETE CASCADE
  );
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftDays' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftDays (
    ShiftDayID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    DayOfWeek INT NOT NULL CHECK (DayOfWeek BETWEEN 1 AND 7),
    FOREIGN KEY (ShiftID) REFERENCES dbo.ShiftDefinitions(ShiftID) ON DELETE CASCADE
  )
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftDaySchedules' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftDaySchedules (
    ShiftDayScheduleID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    DayOfWeek INT NOT NULL CHECK (DayOfWeek BETWEEN 1 AND 7),
    MorningTimeIn TIME(7) NULL,
    MorningTimeOut TIME(7) NULL,
    AfternoonTimeIn TIME(7) NULL,
    AfternoonTimeOut TIME(7) NULL,
    GracePeriodMinutes INT NULL,
    FOREIGN KEY (ShiftID) REFERENCES dbo.ShiftDefinitions(ShiftID) ON DELETE CASCADE,
    CONSTRAINT UQ_ShiftDaySchedules_ShiftDay UNIQUE (ShiftID, DayOfWeek)
  )
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeShiftAllotments' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.EmployeeShiftAllotments (
    AllotmentID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    EffectiveFrom DATE NOT NULL,
    EffectiveTo DATE NULL,
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID),
    FOREIGN KEY (ShiftID) REFERENCES dbo.ShiftDefinitions(ShiftID)
  )
END`,
    `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmployeeShiftAllotments_EmpDate' AND object_id = OBJECT_ID('dbo.EmployeeShiftAllotments'))
BEGIN
  CREATE INDEX IX_EmployeeShiftAllotments_EmpDate
  ON dbo.EmployeeShiftAllotments(EmployeeID, EffectiveFrom, EffectiveTo, ShiftID)
END`,
    `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmployeeShiftAllotments_ShiftDate' AND object_id = OBJECT_ID('dbo.EmployeeShiftAllotments'))
BEGIN
  CREATE INDEX IX_EmployeeShiftAllotments_ShiftDate
  ON dbo.EmployeeShiftAllotments(ShiftID, EffectiveFrom, EffectiveTo, EmployeeID)
END`,
    `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ShiftDays_Shift_Day' AND object_id = OBJECT_ID('dbo.ShiftDays'))
BEGIN
  CREATE INDEX IX_ShiftDays_Shift_Day
  ON dbo.ShiftDays(ShiftID, DayOfWeek)
END`,
    `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_ShiftDaySchedules_Shift_Day' AND object_id = OBJECT_ID('dbo.ShiftDaySchedules'))
BEGIN
  CREATE INDEX IX_ShiftDaySchedules_Shift_Day
  ON dbo.ShiftDaySchedules(ShiftID, DayOfWeek)
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'EmployeeShiftDailyAssignments' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.EmployeeShiftDailyAssignments (
    AssignmentID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    WorkDate DATE NOT NULL,
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    CONSTRAINT UQ_EmployeeShiftDailyAssignments_EmpDate UNIQUE (EmployeeID, WorkDate),
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID),
    FOREIGN KEY (ShiftID) REFERENCES dbo.ShiftDefinitions(ShiftID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmployeeShiftDailyAssignments_WorkDate' AND object_id = OBJECT_ID('dbo.EmployeeShiftDailyAssignments'))
  BEGIN
    CREATE INDEX IX_EmployeeShiftDailyAssignments_WorkDate ON dbo.EmployeeShiftDailyAssignments(WorkDate, EmployeeID, ShiftID)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_EmployeeShiftDailyAssignments_ShiftDate' AND object_id = OBJECT_ID('dbo.EmployeeShiftDailyAssignments'))
  BEGIN
    CREATE INDEX IX_EmployeeShiftDailyAssignments_ShiftDate ON dbo.EmployeeShiftDailyAssignments(ShiftID, WorkDate, EmployeeID)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AttendanceRecords' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AttendanceRecords (
    AttendanceID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    AttendanceDate DATE NOT NULL,
    MorningTimeIn TIME(7) NULL,
    MorningTimeOut TIME(7) NULL,
    AfternoonTimeIn TIME(7) NULL,
    AfternoonTimeOut TIME(7) NULL,
    MinutesLate INT DEFAULT 0,
    MinutesEarlyLeave INT DEFAULT 0,
    Status NVARCHAR(50) NULL,
    CreatedAt DATETIME DEFAULT GETDATE(),
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_EmployeeDate' AND object_id = OBJECT_ID('dbo.AttendanceRecords'))
  BEGIN
    CREATE UNIQUE INDEX UQ_EmployeeDate ON dbo.AttendanceRecords(EmployeeID, AttendanceDate)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Devices' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.Devices (
    DeviceID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DeviceCode NVARCHAR(100) NOT NULL UNIQUE,
    DeviceName NVARCHAR(150) NOT NULL,
    DeviceType NVARCHAR(50) NULL,
    SerialNumber NVARCHAR(100) NULL,
    LocationName NVARCHAR(150) NULL,
    Latitude DECIMAL(10,7) NULL,
    Longitude DECIMAL(10,7) NULL,
    IsActive BIT NOT NULL DEFAULT 1,
    RegisteredAt DATETIME NOT NULL DEFAULT GETDATE(),
    RegisteredBy NVARCHAR(100) NULL,
    LastSeenAt DATETIME NULL,
    UpdatedAt DATETIME NULL
  )
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'FaceProfiles' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.FaceProfiles (
    FaceProfileID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    EmbeddingText NVARCHAR(MAX) NOT NULL,
    ModelVersion NVARCHAR(50) NULL,
    QualityScore DECIMAL(5,2) NULL,
    Status NVARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CreatedBy NVARCHAR(100) NULL,
    UpdatedAt DATETIME NULL,
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID) ON DELETE CASCADE
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_FaceProfiles_EmployeeID' AND object_id = OBJECT_ID('dbo.FaceProfiles'))
  BEGIN
    CREATE INDEX IX_FaceProfiles_EmployeeID ON dbo.FaceProfiles(EmployeeID, IsActive)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BiometricScans' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.BiometricScans (
    BiometricScanID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NULL,
    DeviceID UNIQUEIDENTIFIER NULL,
    ScanTime DATETIME NOT NULL DEFAULT GETDATE(),
    ScanType NVARCHAR(50) NOT NULL DEFAULT 'FACE',
    AuthenticationMethod NVARCHAR(50) NOT NULL DEFAULT 'FACE_MATCH',
    MatchScore DECIMAL(5,2) NULL,
    ScanResult NVARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
    IsSuccessful BIT NOT NULL DEFAULT 1,
    FailureReason NVARCHAR(255) NULL,
    RawImageRef NVARCHAR(500) NULL,
    LivenessScore DECIMAL(5,2) NULL,
    Latitude DECIMAL(10,7) NULL,
    Longitude DECIMAL(10,7) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID),
    FOREIGN KEY (DeviceID) REFERENCES dbo.Devices(DeviceID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BiometricScans_ScanTime' AND object_id = OBJECT_ID('dbo.BiometricScans'))
  BEGIN
    CREATE INDEX IX_BiometricScans_ScanTime ON dbo.BiometricScans(ScanTime DESC)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BiometricScans_EmployeeID' AND object_id = OBJECT_ID('dbo.BiometricScans'))
  BEGIN
    CREATE INDEX IX_BiometricScans_EmployeeID ON dbo.BiometricScans(EmployeeID, ScanTime DESC)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'BiometricScanImages' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.BiometricScanImages (
    BiometricScanImageID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    BiometricScanID UNIQUEIDENTIFIER NOT NULL,
    Image VARBINARY(MAX) NOT NULL,
    MimeType NVARCHAR(100) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (BiometricScanID) REFERENCES dbo.BiometricScans(BiometricScanID) ON DELETE CASCADE
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_BiometricScanImages_Scan' AND object_id = OBJECT_ID('dbo.BiometricScanImages'))
  BEGIN
    CREATE INDEX IX_BiometricScanImages_Scan ON dbo.BiometricScanImages(BiometricScanID, CreatedAt DESC)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DeviceAttendanceEvents' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.DeviceAttendanceEvents (
    DeviceAttendanceEventID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DeviceID UNIQUEIDENTIFIER NOT NULL,
    EmployeeID UNIQUEIDENTIFIER NULL,
    StaffCode NVARCHAR(50) NOT NULL,
    UserID NVARCHAR(50) NULL,
    RawName NVARCHAR(200) NULL,
    Department NVARCHAR(100) NULL,
    MachineID INT NULL,
    EventTime DATETIME NOT NULL,
    Source NVARCHAR(50) NOT NULL DEFAULT 'CSV_IMPORT',
    ImportedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (DeviceID) REFERENCES dbo.Devices(DeviceID),
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_DeviceAttendanceEvents_DeviceStaffTime' AND object_id = OBJECT_ID('dbo.DeviceAttendanceEvents'))
  BEGIN
    CREATE UNIQUE INDEX UQ_DeviceAttendanceEvents_DeviceStaffTime ON dbo.DeviceAttendanceEvents(DeviceID, StaffCode, EventTime)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceAttendanceEvents_EmployeeTime' AND object_id = OBJECT_ID('dbo.DeviceAttendanceEvents'))
  BEGIN
    CREATE INDEX IX_DeviceAttendanceEvents_EmployeeTime ON dbo.DeviceAttendanceEvents(EmployeeID, EventTime DESC)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AuditLogs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AuditLogs (
    AuditLogID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Actor NVARCHAR(100) NULL,
    Action NVARCHAR(100) NOT NULL,
    TableName NVARCHAR(128) NOT NULL,
    RecordID NVARCHAR(100) NULL,
    BeforeJson NVARCHAR(MAX) NULL,
    AfterJson NVARCHAR(MAX) NULL,
    DeviceID UNIQUEIDENTIFIER NULL,
    IPAddress NVARCHAR(64) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (DeviceID) REFERENCES dbo.Devices(DeviceID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLogs_CreatedAt' AND object_id = OBJECT_ID('dbo.AuditLogs'))
  BEGIN
    CREATE INDEX IX_AuditLogs_CreatedAt ON dbo.AuditLogs(CreatedAt DESC)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AuditLogs_ActionTable' AND object_id = OBJECT_ID('dbo.AuditLogs'))
  BEGIN
    CREATE INDEX IX_AuditLogs_ActionTable ON dbo.AuditLogs(Action, TableName)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SpecialDays' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.SpecialDays (
    SpecialDayID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SpecialDate DATE NOT NULL,
    DayType NVARCHAR(50) NOT NULL,
    Description NVARCHAR(255) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_SpecialDays_DateType' AND object_id = OBJECT_ID('dbo.SpecialDays'))
  BEGIN
    CREATE UNIQUE INDEX UQ_SpecialDays_DateType ON dbo.SpecialDays(SpecialDate, DayType)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SpecialDays_Date' AND object_id = OBJECT_ID('dbo.SpecialDays'))
  BEGIN
    CREATE INDEX IX_SpecialDays_Date ON dbo.SpecialDays(SpecialDate)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AdminOvertimeEntries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AdminOvertimeEntries (
    OvertimeEntryID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    OvertimeDate DATE NOT NULL,
    StartTime TIME(7) NULL,
    EndTime TIME(7) NULL,
    ApprovedMinutes INT NULL,
    OvertimeType NVARCHAR(50) NOT NULL DEFAULT 'REGULAR',
    Reason NVARCHAR(255) NULL,
    Status NVARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    CreatedByUserID NVARCHAR(36) NULL,
    UpdatedByUserID NVARCHAR(36) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminOvertimeEntries_Date' AND object_id = OBJECT_ID('dbo.AdminOvertimeEntries'))
  BEGIN
    CREATE INDEX IX_AdminOvertimeEntries_Date ON dbo.AdminOvertimeEntries(OvertimeDate, EmployeeID)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminOvertimeEntries_EmployeeDate' AND object_id = OBJECT_ID('dbo.AdminOvertimeEntries'))
  BEGIN
    CREATE INDEX IX_AdminOvertimeEntries_EmployeeDate ON dbo.AdminOvertimeEntries(EmployeeID, OvertimeDate)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AdminLeaveEntries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AdminLeaveEntries (
    LeaveEntryID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    LeaveStartDate DATE NOT NULL,
    LeaveEndDate DATE NOT NULL,
    LeaveType NVARCHAR(50) NOT NULL DEFAULT 'LEAVE',
    LeaveUnitType NVARCHAR(30) NOT NULL DEFAULT 'FULL_DAY',
    StartTime TIME(7) NULL,
    EndTime TIME(7) NULL,
    ApprovedMinutes INT NULL,
    Reason NVARCHAR(255) NULL,
    Status NVARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    CreatedByUserID NVARCHAR(36) NULL,
    UpdatedByUserID NVARCHAR(36) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID)
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminLeaveEntries_DateRange' AND object_id = OBJECT_ID('dbo.AdminLeaveEntries'))
  BEGIN
    CREATE INDEX IX_AdminLeaveEntries_DateRange ON dbo.AdminLeaveEntries(LeaveStartDate, LeaveEndDate, EmployeeID)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminLeaveEntries_EmployeeDateRange' AND object_id = OBJECT_ID('dbo.AdminLeaveEntries'))
  BEGIN
    CREATE INDEX IX_AdminLeaveEntries_EmployeeDateRange ON dbo.AdminLeaveEntries(EmployeeID, LeaveStartDate, LeaveEndDate)
  END
END`,

    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'DeviceSyncJobs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.DeviceSyncJobs (
    JobID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DeviceCode NVARCHAR(100) NOT NULL,
    RequestedBy NVARCHAR(255) NULL,
    Status NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
    Error NVARCHAR(2000) NULL,
    ResultJson NVARCHAR(MAX) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    StartedAt DATETIME NULL,
    CompletedAt DATETIME NULL
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceSyncJobs_StatusCreatedAt' AND object_id = OBJECT_ID('dbo.DeviceSyncJobs'))
  BEGIN
    CREATE INDEX IX_DeviceSyncJobs_StatusCreatedAt ON dbo.DeviceSyncJobs(Status, CreatedAt DESC)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_DeviceSyncJobs_DeviceCreatedAt' AND object_id = OBJECT_ID('dbo.DeviceSyncJobs'))
  BEGIN
    CREATE INDEX IX_DeviceSyncJobs_DeviceCreatedAt ON dbo.DeviceSyncJobs(DeviceCode, CreatedAt DESC)
  END
END`,

    `IF OBJECT_ID('dbo.vw_AttendanceStatus','V') IS NOT NULL DROP VIEW dbo.vw_AttendanceStatus;`,
    `CREATE VIEW dbo.vw_AttendanceStatus AS
  SELECT 
    e.EmployeeCode,
    e.FirstName,
    e.LastName,
    a.AttendanceDate,
    a.MorningTimeIn,
    s.MorningTimeIn AS RequiredMorningIn,
    s.GracePeriodMinutes,
    CASE 
      WHEN a.MorningTimeIn IS NULL THEN 'Absent'
      WHEN a.MorningTimeIn > DATEADD(MINUTE, s.GracePeriodMinutes, s.MorningTimeIn)
        THEN 'Late'
      ELSE 'On-Time'
    END AS MorningStatus
  FROM dbo.AttendanceRecords a
  JOIN dbo.Employees e ON a.EmployeeID = e.EmployeeID
  JOIN dbo.EmployeeShiftAllotments sa ON e.EmployeeID = sa.EmployeeID
  JOIN dbo.ShiftDefinitions s ON sa.ShiftID = s.ShiftID;`,

    `IF OBJECT_ID('dbo.sp_RecordAttendance','P') IS NOT NULL DROP PROCEDURE dbo.sp_RecordAttendance;`,
    `CREATE PROCEDURE dbo.sp_RecordAttendance
    @EmployeeCode NVARCHAR(50),
    @LogType NVARCHAR(20)
  AS
  BEGIN
    SET NOCOUNT ON;
    DECLARE @EmployeeID UNIQUEIDENTIFIER;
    DECLARE @Today DATE = CAST(GETDATE() AS DATE);
    DECLARE @CurrentTime TIME = CAST(GETDATE() AS TIME);

    SELECT @EmployeeID = EmployeeID
    FROM dbo.Employees
    WHERE EmployeeCode = @EmployeeCode;

    IF @EmployeeID IS NULL
    BEGIN
      RAISERROR('Employee not found', 16, 1);
      RETURN;
    END

    IF NOT EXISTS (
      SELECT 1 FROM dbo.AttendanceRecords
      WHERE EmployeeID = @EmployeeID
      AND AttendanceDate = @Today
    )
    BEGIN
      INSERT INTO dbo.AttendanceRecords(EmployeeID, AttendanceDate)
      VALUES(@EmployeeID, @Today);
    END

    IF @LogType = 'MORNING_IN'
      UPDATE dbo.AttendanceRecords
      SET MorningTimeIn = @CurrentTime
      WHERE EmployeeID = @EmployeeID AND AttendanceDate = @Today;

    IF @LogType = 'MORNING_OUT'
      UPDATE dbo.AttendanceRecords
      SET MorningTimeOut = @CurrentTime
      WHERE EmployeeID = @EmployeeID AND AttendanceDate = @Today;

    IF @LogType = 'AFTERNOON_IN'
      UPDATE dbo.AttendanceRecords
      SET AfternoonTimeIn = @CurrentTime
      WHERE EmployeeID = @EmployeeID AND AttendanceDate = @Today;

    IF @LogType = 'AFTERNOON_OUT'
      UPDATE dbo.AttendanceRecords
      SET AfternoonTimeOut = @CurrentTime
      WHERE EmployeeID = @EmployeeID AND AttendanceDate = @Today;
  END`,
  ]

  try {
    for (const stmt of tableStatements) {
      await pool.request().query(stmt)
    }
    const migrationStatements = [
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'Department')
BEGIN
  ALTER TABLE dbo.Employees ADD Department NVARCHAR(100) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'BiometricStaffCode')
BEGIN
  ALTER TABLE dbo.Employees ADD BiometricStaffCode NVARCHAR(50) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'BiometricUserID')
BEGIN
  ALTER TABLE dbo.Employees ADD BiometricUserID NVARCHAR(50) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_Employees_BiometricStaffCode' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
  CREATE UNIQUE INDEX UQ_Employees_BiometricStaffCode ON dbo.Employees(BiometricStaffCode)
  WHERE BiometricStaffCode IS NOT NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_Employees_BiometricUserID' AND object_id = OBJECT_ID('dbo.Employees'))
BEGIN
  CREATE UNIQUE INDEX UQ_Employees_BiometricUserID ON dbo.Employees(BiometricUserID)
  WHERE BiometricUserID IS NOT NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.FaceProfiles') AND name = 'EmbeddingText')
BEGIN
  ALTER TABLE dbo.FaceProfiles ADD EmbeddingText NVARCHAR(MAX) NULL
END`
      ,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'ExternalSource')
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ADD ExternalSource NVARCHAR(50) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'ExternalShiftCode')
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ADD ExternalShiftCode NVARCHAR(50) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'ExternalShiftName')
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ADD ExternalShiftName NVARCHAR(100) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'ExternalConfigJson')
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ADD ExternalConfigJson NVARCHAR(MAX) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Devices') AND name = 'IPAddress')
BEGIN
  ALTER TABLE dbo.Devices ADD IPAddress NVARCHAR(64) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Devices') AND name = 'Port')
BEGIN
  ALTER TABLE dbo.Devices ADD Port INT NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Devices') AND name = 'MachineID')
BEGIN
  ALTER TABLE dbo.Devices ADD MachineID INT NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Devices') AND name = 'CommPort')
BEGIN
  ALTER TABLE dbo.Devices ADD CommPort INT NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Devices') AND name = 'DevicePassword')
BEGIN
  ALTER TABLE dbo.Devices ADD DevicePassword INT NULL
END`
    ,
      `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SpecialDays' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.SpecialDays (
    SpecialDayID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SpecialDate DATE NOT NULL,
    DayType NVARCHAR(50) NOT NULL,
    Description NVARCHAR(255) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
  );
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_SpecialDays_DateType' AND object_id = OBJECT_ID('dbo.SpecialDays'))
  BEGIN
    CREATE UNIQUE INDEX UQ_SpecialDays_DateType ON dbo.SpecialDays(SpecialDate, DayType)
  END
  IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SpecialDays_Date' AND object_id = OBJECT_ID('dbo.SpecialDays'))
  BEGIN
    CREATE INDEX IX_SpecialDays_Date ON dbo.SpecialDays(SpecialDate)
  END
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_SpecialDays_DateType' AND object_id = OBJECT_ID('dbo.SpecialDays'))
BEGIN
  CREATE UNIQUE INDEX UQ_SpecialDays_DateType ON dbo.SpecialDays(SpecialDate, DayType)
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_SpecialDays_Date' AND object_id = OBJECT_ID('dbo.SpecialDays'))
BEGIN
  CREATE INDEX IX_SpecialDays_Date ON dbo.SpecialDays(SpecialDate)
END`
    ,
      `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AdminOvertimeEntries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AdminOvertimeEntries (
    OvertimeEntryID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    OvertimeDate DATE NOT NULL,
    StartTime TIME(7) NULL,
    EndTime TIME(7) NULL,
    ApprovedMinutes INT NULL,
    OvertimeType NVARCHAR(50) NOT NULL DEFAULT 'REGULAR',
    Reason NVARCHAR(255) NULL,
    Status NVARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    CreatedByUserID NVARCHAR(36) NULL,
    UpdatedByUserID NVARCHAR(36) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID)
  )
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminOvertimeEntries_Date' AND object_id = OBJECT_ID('dbo.AdminOvertimeEntries'))
BEGIN
  CREATE INDEX IX_AdminOvertimeEntries_Date ON dbo.AdminOvertimeEntries(OvertimeDate, EmployeeID)
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminOvertimeEntries_EmployeeDate' AND object_id = OBJECT_ID('dbo.AdminOvertimeEntries'))
BEGIN
  CREATE INDEX IX_AdminOvertimeEntries_EmployeeDate ON dbo.AdminOvertimeEntries(EmployeeID, OvertimeDate)
END`,
      `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AdminLeaveEntries' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AdminLeaveEntries (
    LeaveEntryID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    EmployeeID UNIQUEIDENTIFIER NOT NULL,
    LeaveStartDate DATE NOT NULL,
    LeaveEndDate DATE NOT NULL,
    LeaveType NVARCHAR(50) NOT NULL DEFAULT 'LEAVE',
    LeaveUnitType NVARCHAR(30) NOT NULL DEFAULT 'FULL_DAY',
    StartTime TIME(7) NULL,
    EndTime TIME(7) NULL,
    ApprovedMinutes INT NULL,
    Reason NVARCHAR(255) NULL,
    Status NVARCHAR(30) NOT NULL DEFAULT 'APPROVED',
    CreatedByUserID NVARCHAR(36) NULL,
    UpdatedByUserID NVARCHAR(36) NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL,
    FOREIGN KEY (EmployeeID) REFERENCES dbo.Employees(EmployeeID)
  )
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminLeaveEntries_DateRange' AND object_id = OBJECT_ID('dbo.AdminLeaveEntries'))
BEGIN
  CREATE INDEX IX_AdminLeaveEntries_DateRange ON dbo.AdminLeaveEntries(LeaveStartDate, LeaveEndDate, EmployeeID)
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_AdminLeaveEntries_EmployeeDateRange' AND object_id = OBJECT_ID('dbo.AdminLeaveEntries'))
BEGIN
  CREATE INDEX IX_AdminLeaveEntries_EmployeeDateRange ON dbo.AdminLeaveEntries(EmployeeID, LeaveStartDate, LeaveEndDate)
END`,
      `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'MorningTimeOut' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ALTER COLUMN MorningTimeOut TIME(7) NULL
END`,
      `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'AfternoonTimeIn' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ALTER COLUMN AfternoonTimeIn TIME(7) NULL
END`,
      `IF EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('dbo.ShiftDefinitions') AND name = 'AfternoonTimeOut' AND is_nullable = 0)
BEGIN
  ALTER TABLE dbo.ShiftDefinitions ALTER COLUMN AfternoonTimeOut TIME(7) NULL
END`,
      `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AppUsers' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AppUsers (
    UserID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Username NVARCHAR(50) NOT NULL,
    Email NVARCHAR(255) NOT NULL UNIQUE,
    PasswordHash NVARCHAR(500) NOT NULL,
    Role NVARCHAR(30) NOT NULL DEFAULT 'ADMIN',
    IsActive BIT NOT NULL DEFAULT 1,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    LastLoginAt DATETIME NULL
  )
END`,
      `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AdminInvitations' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AdminInvitations (
    InvitationID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    Email NVARCHAR(255) NULL,
    TokenHash VARBINARY(32) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    UsedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    CreatedByUserID UNIQUEIDENTIFIER NULL,
    FOREIGN KEY (CreatedByUserID) REFERENCES dbo.AppUsers(UserID)
  )
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_AdminInvitations_TokenHash' AND object_id = OBJECT_ID('dbo.AdminInvitations'))
BEGIN
  CREATE UNIQUE INDEX UQ_AdminInvitations_TokenHash ON dbo.AdminInvitations(TokenHash)
END`,
      `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'AdminPasswordResets' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.AdminPasswordResets (
    ResetID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    UserID UNIQUEIDENTIFIER NOT NULL,
    Email NVARCHAR(255) NOT NULL,
    TokenHash VARBINARY(32) NOT NULL,
    ExpiresAt DATETIME NOT NULL,
    UsedAt DATETIME NULL,
    CreatedAt DATETIME NOT NULL DEFAULT GETDATE(),
    FOREIGN KEY (UserID) REFERENCES dbo.AppUsers(UserID) ON DELETE CASCADE
  )
END`,
      `IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_AdminPasswordResets_TokenHash' AND object_id = OBJECT_ID('dbo.AdminPasswordResets'))
BEGIN
  CREATE UNIQUE INDEX UQ_AdminPasswordResets_TokenHash ON dbo.AdminPasswordResets(TokenHash)
END`]
    for (const m of migrationStatements) {
      await pool.request().query(m)
    }
    await ensureAppUserUsernames(pool)
    console.log('Database schema initialized successfully')
  } catch (err) {
    console.error('initDbIfNeeded error:', err.message)
  }
}

async function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(dbConfig)
    poolPromise = poolPromise.then(async (p) => {
      try {
        await initDbIfNeeded(p)
      } catch (e) {
        console.error('DB initialization failed', e.message)
      }
      return p
    }).catch(err => {
      console.error('DB connection failed:', err.message)
      throw err
    })
  }
  return poolPromise
}
// --- Auth (Admin accounts) -------------------------------------------------
const AUTH_SECRET = process.env.AUTH_SECRET || 'DEV_ONLY_CHANGE_ME'
if (AUTH_SECRET === 'DEV_ONLY_CHANGE_ME') {
  console.warn('WARNING: AUTH_SECRET is using the default value. Set AUTH_SECRET in production.')
}

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input))
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function b64urlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4))
  return Buffer.from(s + pad, 'base64')
}

function signToken(payload, ttlSeconds = 7 * 24 * 60 * 60) {
  const header = { alg: 'HS256', typ: 'JWT' }
  const now = Math.floor(Date.now() / 1000)
  const body = { ...payload, iat: now, exp: now + ttlSeconds }
  const h = b64urlEncode(JSON.stringify(header))
  const p = b64urlEncode(JSON.stringify(body))
  const data = `${h}.${p}`
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest()
  return `${data}.${b64urlEncode(sig)}`
}

function verifyToken(token) {
  try {
    const parts = String(token || '').split('.')
    if (parts.length !== 3) return null
    const [h, p, s] = parts
    const data = `${h}.${p}`
    const expected = crypto.createHmac('sha256', AUTH_SECRET).update(data).digest()
    const actual = b64urlDecode(s)
    if (expected.length !== actual.length) return null
    if (!crypto.timingSafeEqual(expected, actual)) return null
    const payload = JSON.parse(b64urlDecode(p).toString('utf8'))
    const now = Math.floor(Date.now() / 1000)
    if (payload?.exp && now > payload.exp) return null
    return payload
  } catch (_) {
    return null
  }
}

function getBearerToken(req) {
  const h = String(req.headers.authorization || '')
  const m = h.match(/^Bearer\s+(.+)$/i)
  if (m) return m[1]
  const cookie = String(req.headers.cookie || '')
  const cm = cookie.match(/(?:^|;\s*)authToken=([^;]+)/)
  if (cm) return decodeURIComponent(cm[1])
  return null
}

function hashPassword(password, opts = {}) {
  const iters = Number(opts.iterations || 120000)
  const salt = opts.salt || crypto.randomBytes(16)
  const dk = crypto.pbkdf2Sync(String(password), salt, iters, 32, 'sha256')
  return `pbkdf2$${iters}$${b64urlEncode(salt)}$${b64urlEncode(dk)}`
}

function verifyPassword(password, stored) {
  try {
    const s = String(stored || '')
    let iters = 0
    let saltB64 = ''
    let hashB64 = ''

    let m = s.match(/^pbkdf2\$(\d+)\$([^$]+)\$([^$]+)$/)
    if (m) {
      iters = Number(m[1])
      saltB64 = m[2]
      hashB64 = m[3]
    } else {
      m = s.match(/^pbkdf2(\d+)([A-Za-z0-9_-]{22})([A-Za-z0-9_-]{43})$/)
      if (!m) return false
      iters = Number(m[1])
      saltB64 = m[2]
      hashB64 = m[3]
    }

    const salt = b64urlDecode(saltB64)
    const expected = b64urlDecode(hashB64)
    const actual = crypto.pbkdf2Sync(String(password), salt, iters, expected.length, 'sha256')
    if (actual.length !== expected.length) return false
    return crypto.timingSafeEqual(actual, expected)
  } catch (_) {
    return false
  }
}

function isLegacyPasswordHash(stored) {
  const s = String(stored || '')
  return s.startsWith('pbkdf2') && !s.startsWith('pbkdf2$')
}

function normalizeAdminIdentifier(value) {
  return String(value || '').trim().toLowerCase()
}

function sanitizeAdminUsername(value) {
  return normalizeAdminIdentifier(value)
    .replace(/[^a-z0-9._-]/g, '')
    .replace(/^[._-]+/, '')
    .replace(/[._-]+$/, '')
    .slice(0, 50)
}

function isValidAdminUsername(value) {
  return /^[a-z0-9](?:[a-z0-9._-]{1,48}[a-z0-9])$/.test(String(value || ''))
}

async function adminUsernameExists(pool, username, excludeUserId = null) {
  const result = await pool.request()
    .input('Username', sql.NVarChar(50), normalizeAdminIdentifier(username))
    .input('ExcludeUserID', sql.NVarChar(36), excludeUserId || null)
    .query(`
      SELECT TOP 1 UserID
      FROM dbo.AppUsers
      WHERE LOWER(Username)=@Username
        AND (@ExcludeUserID IS NULL OR UserID <> @ExcludeUserID)
    `)

  return Boolean(result.recordset?.length)
}

async function buildUniqueAdminUsername(pool, preferred, excludeUserId = null) {
  const base = sanitizeAdminUsername(preferred) || 'admin'
  let attempt = 1
  let candidate = base

  while (await adminUsernameExists(pool, candidate, excludeUserId)) {
    attempt += 1
    const suffix = `-${attempt}`
    candidate = `${base.slice(0, Math.max(1, 50 - suffix.length))}${suffix}`
  }

  return candidate
}

async function ensureAppUserUsernames(pool) {
  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.AppUsers')
        AND name = 'Username'
    )
    BEGIN
      ALTER TABLE dbo.AppUsers ADD Username NVARCHAR(50) NULL
    END
  `)

  const users = await pool.request().query(`
    SELECT UserID, Username, Email
    FROM dbo.AppUsers
    ORDER BY CreatedAt ASC, UserID ASC
  `)

  for (const user of users.recordset || []) {
    const current = sanitizeAdminUsername(user.Username)
    const desired = await buildUniqueAdminUsername(
      pool,
      current || user.Email || user.UserID,
      user.UserID
    )

    if (String(user.Username || '') !== desired) {
      await pool.request()
        .input('UserID', sql.NVarChar(36), String(user.UserID))
        .input('Username', sql.NVarChar(50), desired)
        .query('UPDATE dbo.AppUsers SET Username=@Username WHERE UserID=@UserID')
    }
  }

  await pool.request().query(`
    IF EXISTS (
      SELECT 1
      FROM sys.columns
      WHERE object_id = OBJECT_ID('dbo.AppUsers')
        AND name = 'Username'
        AND is_nullable = 1
    )
    BEGIN
      ALTER TABLE dbo.AppUsers ALTER COLUMN Username NVARCHAR(50) NOT NULL
    END
  `)

  await pool.request().query(`
    IF NOT EXISTS (
      SELECT 1
      FROM sys.indexes
      WHERE name = 'UQ_AppUsers_Username'
        AND object_id = OBJECT_ID('dbo.AppUsers')
    )
    BEGIN
      CREATE UNIQUE INDEX UQ_AppUsers_Username ON dbo.AppUsers(Username)
    END
  `)
}

async function hasAnyAdminAuth(pool) {
  try {
    const r = await pool.request().query("SELECT COUNT(1) AS cnt FROM dbo.AppUsers WHERE Role='ADMIN' AND IsActive=1")
    return (r.recordset?.[0]?.cnt || 0) > 0
  } catch (e) {
    const msg = String(e?.message || e)
    if (msg.toLowerCase().includes('invalid object name') && msg.toLowerCase().includes('appusers')) {
      return false
    }
    throw e
  }
}

async function findAdminUserForLogin(pool, identifier) {
  const normalized = normalizeAdminIdentifier(identifier)
  if (!normalized) return { user: null, ambiguous: false }

  const exact = await pool.request()
    .input('Identifier', sql.NVarChar(255), normalized)
    .query(`
      SELECT TOP 1 UserID, Username, Email, PasswordHash, Role, IsActive
      FROM dbo.AppUsers
      WHERE LOWER(Username)=@Identifier
         OR LOWER(Email)=@Identifier
      ORDER BY CASE WHEN LOWER(Username)=@Identifier THEN 0 ELSE 1 END, CreatedAt ASC
    `)

  return { user: exact.recordset?.[0] || null, ambiguous: false }
}

function authOptional(req, _res, next) {
  const token = getBearerToken(req)
  const payload = token ? verifyToken(token) : null
  req.authUser = payload && payload.email ? payload : null
  next()
}

function requireAdmin(req, res, next) {
  if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' })
  if (String(req.authUser.role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' })
  next()
}

function requireBridge(req, res, next) {
  const token = String(req.headers['x-bridge-token'] || '').trim()
  if (!token || token !== BRIDGE_TOKEN) return res.status(401).json({ error: 'Unauthorized' })
  next()
}

app.use(authOptional)

app.get('/auth/bootstrap-status', async (req, res) => {
  try {
    const pool = await getPool()
    const ok = await hasAnyAdminAuth(pool)
    res.json({ hasAdmin: ok })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/setup-admin', async (req, res) => {
  const username = sanitizeAdminUsername(req.body?.username)
  const email = normalizeAdminIdentifier(req.body?.email)
  const password = String(req.body?.password || '').trim()
  if (!isValidAdminUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 characters and use only letters, numbers, dots, underscores, or dashes.' })
  }
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' })
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    const pool = await getPool()

    const already = await hasAnyAdminAuth(pool)
    if (already) return res.status(409).json({ error: 'Admin already exists. Use an invitation token.' })

    const { randomUUID } = require('crypto')
    const userId = randomUUID()

    const existing = await pool.request()
      .input('Username', sql.NVarChar(50), username)
      .input('Email', sql.NVarChar(255), email)
      .query(`
        SELECT TOP 1 Username, Email
        FROM dbo.AppUsers
        WHERE LOWER(Username)=@Username OR LOWER(Email)=@Email
        ORDER BY CASE WHEN LOWER(Username)=@Username THEN 0 ELSE 1 END
      `)
    const taken = existing.recordset?.[0] || null
    if (taken) {
      if (normalizeAdminIdentifier(taken.Username) === username) {
        return res.status(409).json({ error: 'Username already registered' })
      }
      if (normalizeAdminIdentifier(taken.Email) === email) {
        return res.status(409).json({ error: 'Email already registered' })
      }
    }

    await pool.request()
      .input('UserID', sql.NVarChar(36), userId)
      .input('Username', sql.NVarChar(50), username)
      .input('Email', sql.NVarChar(255), email)
      .input('PasswordHash', sql.NVarChar(500), hashPassword(password))
      .input('Role', sql.NVarChar(30), 'ADMIN')
      .query('INSERT INTO dbo.AppUsers (UserID, Username, Email, PasswordHash, Role, IsActive) VALUES (@UserID, @Username, @Email, @PasswordHash, @Role, 1)')

    const token = signToken({ sub: userId, username, email, role: 'ADMIN' })
    res.json({ success: true, token, user: { id: userId, username, email, role: 'ADMIN' } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/login', async (req, res) => {
  const username = normalizeAdminIdentifier(req.body?.username || req.body?.email)
  const password = String(req.body?.password || '').trim()

  if (!username || !password) return res.status(400).json({ error: 'User and password are required' })

  try {
    const pool = await getPool()

    if (username === 'admin' && password === 'admin') {
      const already = await hasAnyAdminAuth(pool)
      if (!already) {
        const token = signToken({ sub: 'bootstrap', username: 'admin', email: 'bootstrap-admin', role: 'ADMIN' }, 60 * 60)
        return res.json({ success: true, token, user: { id: 'bootstrap', username: 'admin', email: 'bootstrap-admin', role: 'ADMIN' }, bootstrap: true })
      }
    }

    const { user: u, ambiguous } = await findAdminUserForLogin(pool, username)
    if (ambiguous) {
      return res.status(409).json({ error: 'Multiple admin accounts match that user. Sign in with the full email address.' })
    }

    if (!u) return res.status(401).json({ error: 'Invalid credentials' })
    if (!u.IsActive) return res.status(403).json({ error: 'Account disabled' })

    const storedHash = String(u.PasswordHash || '')
    if (!verifyPassword(password, storedHash)) return res.status(401).json({ error: 'Invalid credentials' })

    const upgradeHash = isLegacyPasswordHash(storedHash) ? hashPassword(password) : null
    await pool.request()
      .input('UserID', sql.NVarChar(36), u.UserID)
      .input('PasswordHash', sql.NVarChar(500), upgradeHash)
      .query(upgradeHash
        ? 'UPDATE dbo.AppUsers SET PasswordHash=@PasswordHash, LastLoginAt=GETDATE() WHERE UserID=@UserID'
        : 'UPDATE dbo.AppUsers SET LastLoginAt=GETDATE() WHERE UserID=@UserID')

    const token = signToken({
      sub: String(u.UserID),
      username: String(u.Username || ''),
      email: String(u.Email),
      role: String(u.Role)
    })
    res.json({
      success: true,
      token,
      user: {
        id: String(u.UserID),
        username: String(u.Username || ''),
        email: u.Email,
        role: u.Role
      }
    })
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('invalid object name') && msg.toLowerCase().includes('appusers')) {
      return res.status(503).json({ error: 'Auth tables are not initialized yet. Restart the backend server to run migrations.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.get('/auth/me', async (req, res) => {
  if (!req.authUser) return res.status(401).json({ error: 'Unauthorized' })
  res.json({
    user: {
      id: req.authUser.sub || null,
      username: req.authUser.username || '',
      email: req.authUser.email,
      role: req.authUser.role
    }
  })
})

app.get('/auth/admin-users', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT UserID, Username, Email, Role, CreatedAt, LastLoginAt
      FROM dbo.AppUsers
      WHERE Role='ADMIN' AND IsActive=1
      ORDER BY CreatedAt DESC
    `)
    res.json(r.recordset || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.put('/auth/admin-users/:id', requireAdmin, async (req, res) => {
  const userId = String(req.params?.id || '').trim()
  const actorUserId = String(req.authUser?.sub || '').trim()
  const username = sanitizeAdminUsername(req.body?.username)
  const email = normalizeAdminIdentifier(req.body?.email)

  if (!userId) return res.status(400).json({ error: 'UserID is required' })
  if (!actorUserId || actorUserId !== userId) {
    return res.status(403).json({ error: 'You can only edit your own admin account' })
  }
  if (!isValidAdminUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 characters and use only letters, numbers, dots, underscores, or dashes.' })
  }
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email is required' })
  }

  try {
    const pool = await getPool()

    const beforeRes = await pool.request()
      .input('UserID', sql.NVarChar(36), userId)
      .query(`
        SELECT TOP 1 UserID, Username, Email, Role, IsActive, CreatedAt, LastLoginAt
        FROM dbo.AppUsers
        WHERE UserID=@UserID
      `)
    const before = beforeRes.recordset?.[0] || null
    if (!before) return res.status(404).json({ error: 'Admin account not found' })
    if (!before.IsActive) return res.status(409).json({ error: 'Admin account is inactive' })
    if (String(before.Role || '').toUpperCase() !== 'ADMIN') {
      return res.status(400).json({ error: 'Only admin accounts can be edited here' })
    }

    const existing = await pool.request()
      .input('Username', sql.NVarChar(50), username)
      .input('Email', sql.NVarChar(255), email)
      .input('UserID', sql.NVarChar(36), userId)
      .query(`
        SELECT TOP 1 Username, Email
        FROM dbo.AppUsers
        WHERE UserID <> @UserID
          AND (LOWER(Username)=@Username OR LOWER(Email)=@Email)
        ORDER BY CASE WHEN LOWER(Username)=@Username THEN 0 ELSE 1 END
      `)
    const taken = existing.recordset?.[0] || null
    if (taken) {
      if (normalizeAdminIdentifier(taken.Username) === username) {
        return res.status(409).json({ error: 'Username already registered' })
      }
      if (normalizeAdminIdentifier(taken.Email) === email) {
        return res.status(409).json({ error: 'Email already registered' })
      }
    }

    const updatedRes = await pool.request()
      .input('UserID', sql.NVarChar(36), userId)
      .input('Username', sql.NVarChar(50), username)
      .input('Email', sql.NVarChar(255), email)
      .query(`
        UPDATE dbo.AppUsers
        SET Username=@Username, Email=@Email
        OUTPUT INSERTED.UserID, INSERTED.Username, INSERTED.Email, INSERTED.Role, INSERTED.IsActive, INSERTED.CreatedAt, INSERTED.LastLoginAt
        WHERE UserID=@UserID
      `)
    const updated = updatedRes.recordset?.[0] || null
    if (!updated) return res.status(404).json({ error: 'Admin account not found' })

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'UPDATE_ADMIN_PROFILE',
      tableName: 'AppUsers',
      recordID: userId,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated),
      ipAddress: req.ip
    })

    const token = signToken({
      sub: String(updated.UserID),
      username: String(updated.Username || ''),
      email: String(updated.Email || ''),
      role: String(updated.Role || 'ADMIN')
    })

    res.json({
      success: true,
      token,
      user: {
        id: String(updated.UserID),
        username: String(updated.Username || ''),
        email: String(updated.Email || ''),
        role: String(updated.Role || 'ADMIN')
      }
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.delete('/auth/admin-users/:id', requireAdmin, async (req, res) => {
  const userId = String(req.params?.id || '').trim()
  if (!userId) return res.status(400).json({ error: 'UserID is required' })

  let transaction = null
  try {
    const pool = await getPool()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const request = new sql.Request(transaction)
    request.input('UserID', sql.NVarChar(36), userId)

    const targetRes = await request.query(`
      SELECT TOP 1 UserID, Username, Email, Role, IsActive, CreatedAt, LastLoginAt
      FROM dbo.AppUsers
      WHERE UserID=@UserID
    `)
    const target = targetRes.recordset?.[0] || null
    if (!target) {
      await transaction.rollback()
      return res.status(404).json({ error: 'Admin account not found' })
    }

    if (String(target.Role || '').toUpperCase() !== 'ADMIN') {
      await transaction.rollback()
      return res.status(400).json({ error: 'Only admin accounts can be deleted here' })
    }

    if (!target.IsActive) {
      await transaction.rollback()
      return res.status(409).json({ error: 'Admin account is already inactive' })
    }

    const actorUserId = String(req.authUser?.sub || '').trim()
    if (actorUserId && String(target.UserID || '').trim() === actorUserId) {
      await transaction.rollback()
      return res.status(403).json({ error: 'You cannot delete your own admin account' })
    }

    const countRes = await request.query(`
      SELECT COUNT(1) AS cnt
      FROM dbo.AppUsers
      WHERE Role='ADMIN' AND IsActive=1
    `)
    const activeAdmins = Number(countRes.recordset?.[0]?.cnt || 0)
    if (activeAdmins <= 1) {
      await transaction.rollback()
      return res.status(409).json({ error: 'At least one active admin account must remain' })
    }

    await request.query(`
      UPDATE dbo.AppUsers
      SET IsActive=0
      WHERE UserID=@UserID
    `)

    await transaction.commit()

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'DEACTIVATE_ADMIN',
      tableName: 'AppUsers',
      recordID: userId,
      beforeJson: JSON.stringify(target),
      afterJson: JSON.stringify({ ...target, IsActive: false }),
      ipAddress: req.ip
    })

    res.json({ success: true })
  } catch (err) {
    try {
      if (transaction) await transaction.rollback()
    } catch (_) {}
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/invitations', requireAdmin, async (req, res) => {
  const inviteEmail = String(req.body?.email || '').trim().toLowerCase() || null
  const expiresHours = Math.max(1, Math.min(168, Number(req.body?.expiresHours || 24)))

  try {
    const pool = await getPool()

    const token = b64urlEncode(crypto.randomBytes(32))
    const tokenHash = crypto.createHash('sha256').update(token).digest()

    const { randomUUID } = require('crypto')
    const invitationId = randomUUID()

    await pool.request()
      .input('InvitationID', sql.NVarChar(36), invitationId)
      .input('Email', sql.NVarChar(255), inviteEmail)
      .input('TokenHash', sql.VarBinary(32), tokenHash)
      .input('ExpiresAt', sql.DateTime, new Date(Date.now() + expiresHours * 3600 * 1000))
      .input('CreatedByUserID', sql.NVarChar(36), String(req.authUser?.sub || null))
      .query('INSERT INTO dbo.AdminInvitations (InvitationID, Email, TokenHash, ExpiresAt, CreatedByUserID) VALUES (@InvitationID, @Email, @TokenHash, @ExpiresAt, @CreatedByUserID)')

    const expiresAt = new Date(Date.now() + expiresHours * 3600 * 1000)
    const registerPath = `/register-admin?token=${encodeURIComponent(token)}${inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ''}`
    let emailSent = false
    let emailError = null

    if (inviteEmail) {
      const registerUrl = buildAppUrl(req, registerPath)
      const emailPayload = buildAdminInvitationEmail({
        registerUrl,
        inviteEmail,
        expiresHours,
        invitedBy: req.authUser?.email || null
      })

      try {
        const delivery = await sendTransactionalEmail({
          to: inviteEmail,
          ...emailPayload
        })
        emailSent = Boolean(delivery?.sent)
      } catch (emailErr) {
        emailError = emailErr.message || String(emailErr)
        console.error('Admin invitation email failed:', emailError)
      }
    }

    res.json({
      success: true,
      token,
      registerPath,
      expiresAt: expiresAt.toISOString(),
      emailSent,
      emailError
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/register-admin', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  const username = sanitizeAdminUsername(req.body?.username)
  const email = normalizeAdminIdentifier(req.body?.email)
  const password = String(req.body?.password || '').trim()

  if (!token) return res.status(400).json({ error: 'Invitation token is required' })
  if (!isValidAdminUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-50 characters and use only letters, numbers, dots, underscores, or dashes.' })
  }
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' })
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    const pool = await getPool()

    const tokenHash = crypto.createHash('sha256').update(token).digest()
    const inv = await pool.request()
      .input('TokenHash', sql.VarBinary(32), tokenHash)
      .query('SELECT TOP 1 InvitationID, Email, ExpiresAt, UsedAt FROM dbo.AdminInvitations WHERE TokenHash=@TokenHash ORDER BY CreatedAt DESC')

    if (!inv.recordset?.length) return res.status(400).json({ error: 'Invalid invitation token' })
    const row = inv.recordset[0]
    if (row.UsedAt) return res.status(409).json({ error: 'Invitation token already used' })
    if (row.ExpiresAt && new Date(row.ExpiresAt) < new Date()) return res.status(410).json({ error: 'Invitation token expired' })
    if (row.Email && String(row.Email).toLowerCase() !== email) return res.status(400).json({ error: 'Invitation token is not for this email' })

    const existing = await pool.request()
      .input('Username', sql.NVarChar(50), username)
      .input('Email', sql.NVarChar(255), email)
      .query(`
        SELECT TOP 1 Username, Email
        FROM dbo.AppUsers
        WHERE LOWER(Username)=@Username OR LOWER(Email)=@Email
        ORDER BY CASE WHEN LOWER(Username)=@Username THEN 0 ELSE 1 END
      `)
    const taken = existing.recordset?.[0] || null
    if (taken) {
      if (normalizeAdminIdentifier(taken.Username) === username) {
        return res.status(409).json({ error: 'Username already registered' })
      }
      if (normalizeAdminIdentifier(taken.Email) === email) {
        return res.status(409).json({ error: 'Email already registered' })
      }
    }

    const { randomUUID } = require('crypto')
    const userId = randomUUID()

    await pool.request()
      .input('UserID', sql.NVarChar(36), userId)
      .input('Username', sql.NVarChar(50), username)
      .input('Email', sql.NVarChar(255), email)
      .input('PasswordHash', sql.NVarChar(500), hashPassword(password))
      .input('Role', sql.NVarChar(30), 'ADMIN')
      .query('INSERT INTO dbo.AppUsers (UserID, Username, Email, PasswordHash, Role, IsActive) VALUES (@UserID, @Username, @Email, @PasswordHash, @Role, 1)')

    await pool.request().input('InvitationID', sql.NVarChar(36), row.InvitationID).query('UPDATE dbo.AdminInvitations SET UsedAt=GETDATE() WHERE InvitationID=@InvitationID')

    const jwt = signToken({ sub: userId, username, email, role: 'ADMIN' })
    res.json({ success: true, token: jwt, user: { id: userId, username, email, role: 'ADMIN' } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/forgot-password', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase()
  const expiresHours = Math.max(1, Math.min(24, Number(req.body?.expiresHours || 2)))
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' })

  try {
    const pool = await getPool()
    const u = await pool.request().input('Email', sql.NVarChar(255), email)
      .query('SELECT TOP 1 UserID, Email, Role, IsActive FROM dbo.AppUsers WHERE LOWER(Email)=@Email')

    if (!u.recordset?.length) return res.json({ success: true, resetPath: null, emailSent: false, emailError: null })
    const row = u.recordset[0]
    if (!row.IsActive || String(row.Role || '').toUpperCase() !== 'ADMIN') {
      return res.json({ success: true, resetPath: null, emailSent: false, emailError: null })
    }

    const token = b64urlEncode(crypto.randomBytes(32))
    const tokenHash = crypto.createHash('sha256').update(token).digest()
    const { randomUUID } = require('crypto')

    await pool.request()
      .input('ResetID', sql.NVarChar(36), randomUUID())
      .input('UserID', sql.NVarChar(36), String(row.UserID))
      .input('Email', sql.NVarChar(255), email)
      .input('TokenHash', sql.VarBinary(32), tokenHash)
      .input('ExpiresAt', sql.DateTime, new Date(Date.now() + expiresHours * 3600 * 1000))
      .query('INSERT INTO dbo.AdminPasswordResets (ResetID, UserID, Email, TokenHash, ExpiresAt) VALUES (@ResetID, @UserID, @Email, @TokenHash, @ExpiresAt)')

    const resetPath = `/reset-password?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`
    const resetUrl = buildAppUrl(req, resetPath)
    let emailSent = false
    let emailError = null

    try {
      const emailPayload = buildPasswordResetEmail({ email, resetUrl, expiresHours })
      const delivery = await sendTransactionalEmail({
        to: email,
        ...emailPayload
      })
      emailSent = Boolean(delivery?.sent)
    } catch (emailErr) {
      emailError = emailErr.message || String(emailErr)
      console.error(`Password reset email failed for ${email}:`, emailError)
    }

    res.json({
      success: true,
      resetPath,
      emailSent,
      emailError
    })
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('invalid object name') && (msg.toLowerCase().includes('appusers') || msg.toLowerCase().includes('adminpasswordresets'))) {
      return res.status(503).json({ error: 'Auth tables are not initialized yet. Restart the backend server to run migrations.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.post('/auth/reset-password', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  const password = String(req.body?.password || '').trim()
  if (!token) return res.status(400).json({ error: 'Reset token is required' })
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    const pool = await getPool()
    const tokenHash = crypto.createHash('sha256').update(token).digest()

    const r = await pool.request().input('TokenHash', sql.VarBinary(32), tokenHash).query(`
      SELECT TOP 1 pr.ResetID, pr.UserID, pr.Email, pr.ExpiresAt, pr.UsedAt, u.Username, u.Role, u.IsActive
      FROM dbo.AdminPasswordResets pr
      JOIN dbo.AppUsers u ON u.UserID = pr.UserID
      WHERE pr.TokenHash=@TokenHash
      ORDER BY pr.CreatedAt DESC
    `)

    if (!r.recordset?.length) return res.status(400).json({ error: 'Invalid reset token' })
    const row = r.recordset[0]
    if (row.UsedAt) return res.status(409).json({ error: 'Reset token already used' })
    if (row.ExpiresAt && new Date(row.ExpiresAt) < new Date()) return res.status(410).json({ error: 'Reset token expired' })
    if (!row.IsActive || String(row.Role || '').toUpperCase() !== 'ADMIN') return res.status(403).json({ error: 'Account disabled' })

    await pool.request()
      .input('UserID', sql.NVarChar(36), String(row.UserID))
      .input('PasswordHash', sql.NVarChar(500), hashPassword(password))
      .query('UPDATE dbo.AppUsers SET PasswordHash=@PasswordHash, LastLoginAt=GETDATE() WHERE UserID=@UserID')

    await pool.request()
      .input('ResetID', sql.NVarChar(36), String(row.ResetID))
      .query('UPDATE dbo.AdminPasswordResets SET UsedAt=GETDATE() WHERE ResetID=@ResetID')

    const jwt = signToken({
      sub: String(row.UserID),
      username: String(row.Username || ''),
      email: String(row.Email),
      role: 'ADMIN'
    })
    res.json({
      success: true,
      token: jwt,
      user: {
        id: String(row.UserID),
        username: String(row.Username || ''),
        email: row.Email,
        role: 'ADMIN'
      }
    })
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('invalid object name') && (msg.toLowerCase().includes('appusers') || msg.toLowerCase().includes('adminpasswordresets'))) {
      return res.status(503).json({ error: 'Auth tables are not initialized yet. Restart the backend server to run migrations.' })
    }
    res.status(500).json({ error: msg })
  }
})
// --------------------------------------------------------------------------

app.get('/employees', async (req, res) => {
  try {
    const pool = await getPool()
      const q = `
        SELECT
          e.EmployeeID AS id,
          e.EmployeeCode,
          CONCAT(e.FirstName, ' ', e.LastName) AS name,
          e.EmploymentStatus AS position,
          e.Department AS department,
          e.BiometricStaffCode AS biometricStaffCode,
          e.BiometricUserID AS biometricUserId,
          e.ContactNumber AS phone,
          e.Email AS email,
          e.HireDate,
          ISNULL(currentShift.ShiftName, latestShift.ShiftName) AS assignedShift
        FROM dbo.Employees e
        OUTER APPLY (
          SELECT TOP 1 s.ShiftName
          FROM dbo.EmployeeShiftAllotments a
          JOIN dbo.ShiftDefinitions s ON s.ShiftID = a.ShiftID
          WHERE a.EmployeeID = e.EmployeeID
            AND a.EffectiveFrom <= CAST(GETDATE() AS DATE)
            AND (a.EffectiveTo IS NULL OR a.EffectiveTo >= CAST(GETDATE() AS DATE))
          ORDER BY
            a.EffectiveFrom DESC,
            ISNULL(a.EffectiveTo, CAST('9999-12-31' AS DATE)) DESC
        ) currentShift
        OUTER APPLY (
          SELECT TOP 1 s.ShiftName
          FROM dbo.EmployeeShiftAllotments a
          JOIN dbo.ShiftDefinitions s ON s.ShiftID = a.ShiftID
          WHERE a.EmployeeID = e.EmployeeID
          ORDER BY
            a.EffectiveFrom DESC,
            ISNULL(a.EffectiveTo, CAST('9999-12-31' AS DATE)) DESC
        ) latestShift
      `;
    const result = await pool.request().query(q)
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/users', async (req, res) => {
  try {
    const pool = await getPool()
    const q = `SELECT EmployeeID AS UserID, FirstName, LastName, Email, EmployeeCode AS Username, EmploymentStatus AS Role FROM dbo.Employees`
    const result = await pool.request().query(q)
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/users', async (req, res) => {
  try {
    const { FirstName, LastName, Email } = req.body
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const empID = randomUUID()
    const code = `EMP${Date.now()}`
    const request = pool.request()
    request.input('EmployeeID', sql.NVarChar(36), empID)
    request.input('EmployeeCode', sql.NVarChar(50), code)
    request.input('FirstName', sql.NVarChar(100), FirstName || '')
    request.input('LastName', sql.NVarChar(100), LastName || '')
    request.input('Email', sql.NVarChar(150), Email || null)
    request.input('HireDate', sql.Date, new Date())
    const insertQ = `INSERT INTO dbo.Employees (EmployeeID, EmployeeCode, FirstName, LastName, Email, HireDate) VALUES (@EmployeeID, @EmployeeCode, @FirstName, @LastName, @Email, @HireDate)`
    await request.query(insertQ)
    res.json({ UserID: empID, FirstName: FirstName || '', LastName: LastName || '', Email: Email || null, Username: code })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/shift-definitions', async (req, res) => {
  try {
    console.log("SHIFT BODY:", req.body)

    const {
      ShiftName,
      MorningTimeIn,
      MorningTimeOut,
      AfternoonTimeIn,
      AfternoonTimeOut,
      GracePeriodMinutes,
      Days,
      Patterns
    } = req.body

    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const shiftID = randomUUID()
    const grace = Number.isFinite(Number(GracePeriodMinutes)) ? Number(GracePeriodMinutes) : 5

    const mapDay = {
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
      sunday: 7
    }

    const normalizeDay = (d) => {
      if (typeof d === 'number') return d === 0 ? 7 : d
      if (typeof d === 'string') {
        const numeric = Number(d)
        if (!Number.isNaN(numeric)) return numeric === 0 ? 7 : numeric
        return mapDay[d.trim().toLowerCase()]
      }
      return null
    }

    const hasPatterns = Array.isArray(Patterns) && Patterns.length > 0

    let baseMorningIn = MorningTimeIn
    let baseMorningOut = MorningTimeOut
    let baseAfternoonIn = AfternoonTimeIn
    let baseAfternoonOut = AfternoonTimeOut
    let normalizedDays = []

    if (hasPatterns) {
      const p0 = Patterns[0] || {}
      baseMorningIn = p0.morningIn || p0.MorningTimeIn
      baseMorningOut = p0.morningOut || p0.MorningTimeOut
      baseAfternoonIn = p0.afternoonIn || p0.AfternoonTimeIn
      baseAfternoonOut = p0.afternoonOut || p0.AfternoonTimeOut
      normalizedDays = Array.from(new Set(
        Patterns.flatMap((p) => (Array.isArray(p.days) ? p.days : []))
          .map(normalizeDay)
          .filter((d) => d >= 1 && d <= 7)
      ))
    } else {
      normalizedDays = Array.isArray(Days)
        ? Array.from(new Set(Days.map(normalizeDay).filter((d) => d >= 1 && d <= 7)))
        : []
    }

    if (!ShiftName ||
        !baseMorningIn ||
        !baseMorningOut ||
        !baseAfternoonIn ||
        !baseAfternoonOut) {
      return res.status(400).json({
        error: "Shift name and all base shift time fields are required."
      })
    }

    const parsedBaseMorningIn = parseTimeString(baseMorningIn)
    const parsedBaseMorningOut = parseTimeString(baseMorningOut)
    const parsedBaseAfternoonIn = parseTimeString(baseAfternoonIn)
    const parsedBaseAfternoonOut = parseTimeString(baseAfternoonOut)
    if (!parsedBaseMorningIn || !parsedBaseMorningOut || !parsedBaseAfternoonIn || !parsedBaseAfternoonOut) {
      return res.status(400).json({
        error: 'Invalid base time format. Use HH:mm, HH:mm:ss, ISO datetime, or h:mm AM/PM.',
        details: {
          MorningTimeIn: baseMorningIn,
          MorningTimeOut: baseMorningOut,
          AfternoonTimeIn: baseAfternoonIn,
          AfternoonTimeOut: baseAfternoonOut
        }
      })
    }

    const normalizedPatterns = []
    if (hasPatterns) {
      for (let i = 0; i < Patterns.length; i += 1) {
        const p = Patterns[i] || {}
        const pDays = Array.isArray(p.days) ? p.days.map(normalizeDay).filter((d) => d >= 1 && d <= 7) : []
        const pMorningIn = parseTimeString(p.morningIn || p.MorningTimeIn)
        const pMorningOut = parseTimeString(p.morningOut || p.MorningTimeOut)
        const pAfternoonIn = parseTimeString(p.afternoonIn || p.AfternoonTimeIn)
        const pAfternoonOut = parseTimeString(p.afternoonOut || p.AfternoonTimeOut)
        if (!pDays.length) {
          return res.status(400).json({ error: `Pattern ${i + 1}: at least one valid day is required.` })
        }
        if (!pMorningIn || !pMorningOut || !pAfternoonIn || !pAfternoonOut) {
          return res.status(400).json({
            error: `Pattern ${i + 1}: invalid time format.`,
            details: {
              MorningTimeIn: p.morningIn || p.MorningTimeIn || null,
              MorningTimeOut: p.morningOut || p.MorningTimeOut || null,
              AfternoonTimeIn: p.afternoonIn || p.AfternoonTimeIn || null,
              AfternoonTimeOut: p.afternoonOut || p.AfternoonTimeOut || null
            }
          })
        }
        normalizedPatterns.push({
          days: Array.from(new Set(pDays)),
          morningIn: pMorningIn,
          morningOut: pMorningOut,
          afternoonIn: pAfternoonIn,
          afternoonOut: pAfternoonOut
        })
      }
    }

    await pool.request()
      .input('ShiftID', sql.NVarChar(36), shiftID)
      .input('ShiftName', sql.NVarChar(100), ShiftName)
      .input('MorningTimeIn', sql.NVarChar(8), parsedBaseMorningIn)
      .input('MorningTimeOut', sql.NVarChar(8), parsedBaseMorningOut)
      .input('AfternoonTimeIn', sql.NVarChar(8), parsedBaseAfternoonIn)
      .input('AfternoonTimeOut', sql.NVarChar(8), parsedBaseAfternoonOut)
      .input('GracePeriodMinutes', sql.Int, grace)
      .query(`
        INSERT INTO dbo.ShiftDefinitions
        (ShiftID, ShiftName, MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut, GracePeriodMinutes)
        VALUES
        (@ShiftID, @ShiftName, CAST(@MorningTimeIn AS TIME(7)), CAST(@MorningTimeOut AS TIME(7)), CAST(@AfternoonTimeIn AS TIME(7)), CAST(@AfternoonTimeOut AS TIME(7)), @GracePeriodMinutes)
      `)

    for (const day of Array.from(new Set(normalizedDays))) {
      await pool.request()
        .input('ShiftDayID', sql.NVarChar(36), randomUUID())
        .input('ShiftID', sql.NVarChar(36), shiftID)
        .input('DayOfWeek', sql.Int, day)
        .query(`
          INSERT INTO dbo.ShiftDays (ShiftDayID, ShiftID, DayOfWeek)
          VALUES (@ShiftDayID, @ShiftID, @DayOfWeek)
        `)
    }

    if (hasPatterns) {
      for (const p of normalizedPatterns) {
        for (const day of p.days) {
          await pool.request()
            .input('ShiftDayScheduleID', sql.NVarChar(36), randomUUID())
            .input('ShiftID', sql.NVarChar(36), shiftID)
            .input('DayOfWeek', sql.Int, day)
            .input('MorningTimeIn', sql.NVarChar(8), p.morningIn)
            .input('MorningTimeOut', sql.NVarChar(8), p.morningOut)
            .input('AfternoonTimeIn', sql.NVarChar(8), p.afternoonIn)
            .input('AfternoonTimeOut', sql.NVarChar(8), p.afternoonOut)
            .input('GracePeriodMinutes', sql.Int, grace)
            .query(`
              MERGE dbo.ShiftDaySchedules AS target
              USING (SELECT @ShiftID AS ShiftID, @DayOfWeek AS DayOfWeek) AS source
              ON target.ShiftID = source.ShiftID AND target.DayOfWeek = source.DayOfWeek
              WHEN MATCHED THEN
                UPDATE SET MorningTimeIn=CAST(@MorningTimeIn AS TIME(7)), MorningTimeOut=CAST(@MorningTimeOut AS TIME(7)), AfternoonTimeIn=CAST(@AfternoonTimeIn AS TIME(7)), AfternoonTimeOut=CAST(@AfternoonTimeOut AS TIME(7)), GracePeriodMinutes=@GracePeriodMinutes
              WHEN NOT MATCHED THEN
                INSERT (ShiftDayScheduleID, ShiftID, DayOfWeek, MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut, GracePeriodMinutes)
                VALUES (@ShiftDayScheduleID, @ShiftID, @DayOfWeek, CAST(@MorningTimeIn AS TIME(7)), CAST(@MorningTimeOut AS TIME(7)), CAST(@AfternoonTimeIn AS TIME(7)), CAST(@AfternoonTimeOut AS TIME(7)), @GracePeriodMinutes);
            `)
        }
      }
    }

    res.json({ success: true, ShiftID: shiftID, Days: normalizedDays })

  } catch (err) {
    console.error("SHIFT INSERT ERROR:", err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/shift-definitions', async (req, res) => {
  try {
    const pool = await getPool()
    const q = `
      SELECT
        s.ShiftID,
        s.ShiftName,
        CONVERT(varchar(5), s.MorningTimeIn, 108) AS MorningTimeIn,
        CONVERT(varchar(5), s.MorningTimeOut, 108) AS MorningTimeOut,
        CONVERT(varchar(5), s.AfternoonTimeIn, 108) AS AfternoonTimeIn,
        CONVERT(varchar(5), s.AfternoonTimeOut, 108) AS AfternoonTimeOut,
        ISNULL(s.GracePeriodMinutes, 5) AS GracePeriodMinutes,
        (SELECT STUFF((SELECT ',' + CAST(sd.DayOfWeek AS nvarchar(3)) FROM dbo.ShiftDays sd WHERE sd.ShiftID = s.ShiftID ORDER BY sd.DayOfWeek FOR XML PATH('')),1,1,'')) AS DayList,
        (SELECT STUFF((SELECT ',' + CASE sd.DayOfWeek
            WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu'
            WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' WHEN 7 THEN 'Sun' END
          FROM dbo.ShiftDays sd WHERE sd.ShiftID = s.ShiftID ORDER BY sd.DayOfWeek FOR XML PATH('')),1,1,'')) AS DayNameList
      FROM dbo.ShiftDefinitions s
      ORDER BY s.CreatedAt DESC
    `
    const result = await pool.request().query(q)
    const sds = await pool.request().query(`
      SELECT ShiftID, DayOfWeek,
        CONVERT(varchar(5), MorningTimeIn, 108) AS MorningTimeIn,
        CONVERT(varchar(5), MorningTimeOut, 108) AS MorningTimeOut,
        CONVERT(varchar(5), AfternoonTimeIn, 108) AS AfternoonTimeIn,
        CONVERT(varchar(5), AfternoonTimeOut, 108) AS AfternoonTimeOut,
        ISNULL(GracePeriodMinutes, 5) AS GracePeriodMinutes
      FROM dbo.ShiftDaySchedules
      ORDER BY DayOfWeek
    `)
    const byShift = {}
    for (const r of sds.recordset) {
      byShift[r.ShiftID] = byShift[r.ShiftID] || []
      byShift[r.ShiftID].push(r)
    }
    const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
    const rows = result.recordset.map((row) => {
      const dayRows = byShift[row.ShiftID] || []
      const grouped = {}
      for (const d of dayRows) {
        const key = `${d.MorningTimeIn}|${d.MorningTimeOut}|${d.AfternoonTimeIn}|${d.AfternoonTimeOut}|${d.GracePeriodMinutes}`
        grouped[key] = grouped[key] || {
          MorningTimeIn: d.MorningTimeIn,
          MorningTimeOut: d.MorningTimeOut,
          AfternoonTimeIn: d.AfternoonTimeIn,
          AfternoonTimeOut: d.AfternoonTimeOut,
          GracePeriodMinutes: d.GracePeriodMinutes,
          DayList: [],
          DayNameList: []
        }
        grouped[key].DayList.push(d.DayOfWeek)
        grouped[key].DayNameList.push(dayMap[d.DayOfWeek] || String(d.DayOfWeek))
      }
      return {
        ...row,
        PatternDetails: Object.values(grouped).map((g, idx) => ({
          PatternName: `Pattern ${idx + 1}`,
          ...g,
          DayList: g.DayList.join(','),
          DayNameList: g.DayNameList.join('-')
        }))
      }
    })
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/shift-definitions/:id', async (req, res) => {
  const id = req.params.id
  try {
    const pool = await getPool()

    await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.EmployeeShiftAllotments WHERE ShiftID=@ShiftID')

    const result = await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.ShiftDefinitions WHERE ShiftID=@ShiftID')

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/shift-definitions/delete', async (req, res) => {
  const id = req.body?.id
  if (!id) return res.status(400).json({ error: 'id is required' })
  try {
    const pool = await getPool()

    await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.EmployeeShiftAllotments WHERE ShiftID=@ShiftID')

    const result = await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.ShiftDefinitions WHERE ShiftID=@ShiftID')

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})



app.get('/schedule-periods', async (req, res) => {
  try {
    const pool = await getPool()
    const q = `SELECT
      s.ShiftID AS SchedulePeriodID,
      s.ShiftName AS PeriodName,
      CONVERT(varchar(5), s.MorningTimeIn, 108) AS MorningTimeIn,
      CONVERT(varchar(5), s.MorningTimeOut, 108) AS MorningTimeOut,
      CONVERT(varchar(5), s.AfternoonTimeIn, 108) AS AfternoonTimeIn,
      CONVERT(varchar(5), s.AfternoonTimeOut, 108) AS AfternoonTimeOut,
      ISNULL(s.GracePeriodMinutes, 5) AS GracePeriodMinutes,
      (SELECT STUFF((SELECT ',' + CAST(sd.DayOfWeek AS nvarchar(3)) FROM dbo.ShiftDays sd WHERE sd.ShiftID = s.ShiftID ORDER BY sd.DayOfWeek FOR XML PATH('')),1,1,'')) AS DayList,
      (SELECT STUFF((SELECT ',' + CASE sd.DayOfWeek
          WHEN 1 THEN 'Mon' WHEN 2 THEN 'Tue' WHEN 3 THEN 'Wed' WHEN 4 THEN 'Thu'
          WHEN 5 THEN 'Fri' WHEN 6 THEN 'Sat' WHEN 7 THEN 'Sun' END
        FROM dbo.ShiftDays sd WHERE sd.ShiftID = s.ShiftID ORDER BY sd.DayOfWeek FOR XML PATH('')),1,1,'')) AS DayNameList
      FROM dbo.ShiftDefinitions s`;
    const result = await pool.request().query(q)
    const sds = await pool.request().query(`
      SELECT ShiftID, DayOfWeek,
        CONVERT(varchar(5), MorningTimeIn, 108) AS MorningTimeIn,
        CONVERT(varchar(5), MorningTimeOut, 108) AS MorningTimeOut,
        CONVERT(varchar(5), AfternoonTimeIn, 108) AS AfternoonTimeIn,
        CONVERT(varchar(5), AfternoonTimeOut, 108) AS AfternoonTimeOut,
        ISNULL(GracePeriodMinutes, 5) AS GracePeriodMinutes
      FROM dbo.ShiftDaySchedules
      ORDER BY DayOfWeek
    `)
    const byShift = {}
    for (const r of sds.recordset) {
      byShift[r.ShiftID] = byShift[r.ShiftID] || []
      byShift[r.ShiftID].push(r)
    }
    const dayMap = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
    res.json(result.recordset.map(r => {
      const dayRows = byShift[r.SchedulePeriodID] || []
      const grouped = {}
      for (const d of dayRows) {
        const key = `${d.MorningTimeIn}|${d.MorningTimeOut}|${d.AfternoonTimeIn}|${d.AfternoonTimeOut}|${d.GracePeriodMinutes}`
        grouped[key] = grouped[key] || {
          MorningTimeIn: d.MorningTimeIn,
          MorningTimeOut: d.MorningTimeOut,
          AfternoonTimeIn: d.AfternoonTimeIn,
          AfternoonTimeOut: d.AfternoonTimeOut,
          GracePeriodMinutes: d.GracePeriodMinutes,
          DayList: [],
          DayNameList: []
        }
        grouped[key].DayList.push(d.DayOfWeek)
        grouped[key].DayNameList.push(dayMap[d.DayOfWeek] || String(d.DayOfWeek))
      }
      return ({
      SchedulePeriodID: r.SchedulePeriodID,
      PeriodName: r.PeriodName,
      DayList: r.DayList || '',
      DayNameList: r.DayNameList || '',
      MorningTimeIn: r.MorningTimeIn,
      MorningTimeOut: r.MorningTimeOut,
      AfternoonTimeIn: r.AfternoonTimeIn,
      AfternoonTimeOut: r.AfternoonTimeOut,
      GracePeriodMinutes: r.GracePeriodMinutes || 5,
      PatternDetails: Object.values(grouped).map((g, idx) => ({
        PatternName: `Pattern ${idx + 1}`,
        ...g,
        DayList: g.DayList.join(','),
        DayNameList: g.DayNameList.join('-')
      }))
    })}))
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/schedule-periods/:id', async (req, res) => {
  const id = req.params.id
  try {
    const pool = await getPool()

    
    await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.EmployeeShiftAllotments WHERE ShiftID=@ShiftID')

    const result = await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.ShiftDefinitions WHERE ShiftID=@ShiftID')

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/schedule-periods/delete', async (req, res) => {
  const id = req.body?.id
  if (!id) return res.status(400).json({ error: 'id is required' })
  try {
    const pool = await getPool()

    await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.EmployeeShiftAllotments WHERE ShiftID=@ShiftID')

    const result = await pool.request()
      .input('ShiftID', sql.NVarChar(36), id)
      .query('DELETE FROM dbo.ShiftDefinitions WHERE ShiftID=@ShiftID')

    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/schedule-details', async (req, res) => {
  const { PeriodName, Days, ShiftStartTime, ShiftEndTime, BreakStartTime, BreakEndTime } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const shiftID = randomUUID()
    const morningIn = ShiftStartTime ? parseTimeString(ShiftStartTime) : null
    const morningOut = ShiftEndTime ? parseTimeString(ShiftEndTime) : null
    const afternoonIn = BreakStartTime ? parseTimeString(BreakStartTime) : null
    const afternoonOut = BreakEndTime ? parseTimeString(BreakEndTime) : null
    if (!morningIn || !morningOut || !afternoonIn || !afternoonOut) {
      return res.status(400).json({
        error: 'Invalid time format. Use HH:mm, HH:mm:ss, ISO datetime, or h:mm AM/PM.',
        details: { ShiftStartTime, ShiftEndTime, BreakStartTime, BreakEndTime }
      })
    }
    const request = pool.request()
    request.input('ShiftID', sql.NVarChar(36), shiftID)
    request.input('ShiftName', sql.NVarChar(100), PeriodName || 'Shift')
    request.input('MorningTimeIn', sql.NVarChar(8), morningIn)
    request.input('MorningTimeOut', sql.NVarChar(8), morningOut)
    request.input('AfternoonTimeIn', sql.NVarChar(8), afternoonIn)
    request.input('AfternoonTimeOut', sql.NVarChar(8), afternoonOut)
    const insertQ = `INSERT INTO dbo.ShiftDefinitions (ShiftID, ShiftName, MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut)
      VALUES (@ShiftID, @ShiftName, CAST(@MorningTimeIn AS TIME(7)), CAST(@MorningTimeOut AS TIME(7)), CAST(@AfternoonTimeIn AS TIME(7)), CAST(@AfternoonTimeOut AS TIME(7)))`
    await request.query(insertQ)
    const dayList = Array.isArray(Days) ? Days : (typeof Days === 'string' ? Days.split(',').map(d => d.trim()).filter(Boolean).map(Number) : [])
    for (const d of dayList) {
      const dayValue = (d === 0) ? 7 : d
      await pool.request().input('ShiftDayID', sql.NVarChar(36), randomUUID()).input('ShiftID', sql.NVarChar(36), shiftID).input('DayOfWeek', sql.Int, dayValue).query('INSERT INTO dbo.ShiftDays (ShiftDayID, ShiftID, DayOfWeek) VALUES (@ShiftDayID, @ShiftID, @DayOfWeek)')
    }
    res.json({ ScheduleDetailID: shiftID, PeriodName, Days: dayList })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/schedule-details/bulk', async (req, res) => {
  const { employeeID, schedule, EffectiveFrom, EffectiveTo } = req.body
  if (!Array.isArray(schedule)) return res.status(400).json({ error: 'schedule must be an array' })
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const groups = {}
    for (const row of schedule) {
      const key = `${row.amIn}-${row.amOut}|${row.pmIn}-${row.pmOut}`
      groups[key] = groups[key] || { amIn: row.amIn, amOut: row.amOut, pmIn: row.pmIn, pmOut: row.pmOut, days: [] }
      groups[key].days.push(row.dayNum)
    }
    const created = []
    for (const k of Object.keys(groups)) {
      const g = groups[k]
      const amIn = g.amIn ? parseTimeString(g.amIn) : null
      const amOut = g.amOut ? parseTimeString(g.amOut) : null
      const pmIn = g.pmIn ? parseTimeString(g.pmIn) : null
      const pmOut = g.pmOut ? parseTimeString(g.pmOut) : null
      if (!amIn || !amOut || !pmIn || !pmOut) {
        return res.status(400).json({
          error: 'Invalid time format in schedule row(s).',
          details: { amIn: g.amIn, amOut: g.amOut, pmIn: g.pmIn, pmOut: g.pmOut }
        })
      }
      const shiftID = randomUUID()
      await pool.request().input('ShiftID', sql.NVarChar(36), shiftID).input('ShiftName', sql.NVarChar(100), `AutoShift_${shiftID.slice(0,8)}`).input('MorningTimeIn', sql.NVarChar(8), amIn).input('MorningTimeOut', sql.NVarChar(8), amOut).input('AfternoonTimeIn', sql.NVarChar(8), pmIn).input('AfternoonTimeOut', sql.NVarChar(8), pmOut).query('INSERT INTO dbo.ShiftDefinitions (ShiftID, ShiftName, MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut) VALUES (@ShiftID, @ShiftName, CAST(@MorningTimeIn AS TIME(7)), CAST(@MorningTimeOut AS TIME(7)), CAST(@AfternoonTimeIn AS TIME(7)), CAST(@AfternoonTimeOut AS TIME(7)))')
      for (const d of g.days) {
        const dayValue = (d === 0) ? 7 : d
        await pool.request().input('ShiftDayID', sql.NVarChar(36), randomUUID()).input('ShiftID', sql.NVarChar(36), shiftID).input('DayOfWeek', sql.Int, dayValue).query('INSERT INTO dbo.ShiftDays (ShiftDayID, ShiftID, DayOfWeek) VALUES (@ShiftDayID, @ShiftID, @DayOfWeek)')
      }
      const effFrom = EffectiveFrom ? new Date(EffectiveFrom) : new Date()
      const effTo = EffectiveTo ? new Date(EffectiveTo) : null
      const reqAll = pool.request()
      reqAll.input('AllotmentID', sql.NVarChar(36), randomUUID())
      reqAll.input('EmployeeID', sql.NVarChar(36), employeeID)
      reqAll.input('ShiftID', sql.NVarChar(36), shiftID)
      reqAll.input('EffectiveFrom', sql.Date, effFrom)
      reqAll.input('EffectiveTo', sql.Date, effTo)
      await reqAll.query('INSERT INTO dbo.EmployeeShiftAllotments (AllotmentID, EmployeeID, ShiftID, EffectiveFrom, EffectiveTo) VALUES (@AllotmentID, @EmployeeID, @ShiftID, @EffectiveFrom, @EffectiveTo)')
      created.push({ shiftID, days: g.days })
    }
    res.json({ success: true, created: created.length, details: created })
  } catch (err) {
    console.error('bulk schedule insert failed', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/shift-assignments/bulk', async (req, res) => {
  const { shiftID, employeeIDs, assignAll, effectiveFrom, effectiveTo } = req.body

  if (!shiftID) return res.status(400).json({ error: 'shiftID is required' })

  let transaction
  try {
    const pool = await getPool()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const request = new sql.Request(transaction)

    const shiftExists = await pool.request()
      .input('ShiftID', sql.NVarChar(36), shiftID)
      .query('SELECT 1 AS ok FROM dbo.ShiftDefinitions WHERE ShiftID=@ShiftID')
    if (!shiftExists.recordset.length) return res.status(404).json({ error: 'Shift not found' })

    let targetEmployeeIDs = []
    if (assignAll) {
      const allEmp = await pool.request().query('SELECT EmployeeID FROM dbo.Employees')
      targetEmployeeIDs = allEmp.recordset.map((r) => r.EmployeeID)
    } else if (Array.isArray(employeeIDs)) {
      targetEmployeeIDs = Array.from(new Set(employeeIDs.filter(Boolean)))
    }

    if (!targetEmployeeIDs.length) return res.status(400).json({ error: 'No employees selected' })

    const effFrom = effectiveFrom ? new Date(effectiveFrom) : null
    const effTo = effectiveTo ? new Date(effectiveTo) : null
    if (!effFrom) return res.status(400).json({ error: 'effectiveFrom is required' })
    if (Number.isNaN(effFrom.getTime())) return res.status(400).json({ error: 'Invalid effectiveFrom date' })
    if (effTo && Number.isNaN(effTo.getTime())) return res.status(400).json({ error: 'Invalid effectiveTo date' })
    if (effTo && effTo.getTime() < effFrom.getTime()) return res.status(400).json({ error: 'effectiveTo must be on/after effectiveFrom' })

    const empCsv = targetEmployeeIDs.join(',')
    request.input('EmpCSV', sql.NVarChar(sql.MAX), empCsv)
    request.input('ShiftID', sql.NVarChar(36), shiftID)
    request.input('EffectiveFrom', sql.Date, effFrom)
    request.input('EffectiveTo', sql.Date, effTo || null)
    request.input('HasEffectiveTo', sql.Bit, effTo ? 1 : 0)

    const result = await request.query(`
      DECLARE @Emp TABLE (EmployeeID NVARCHAR(36));
      ;WITH EmpSplit AS (
        SELECT LTRIM(RTRIM(m.n.value('.','nvarchar(100)'))) AS value
        FROM (SELECT CAST('<i>' + REPLACE(@EmpCSV, ',', '</i><i>') + '</i>' AS XML) AS x) t
        CROSS APPLY x.nodes('/i') m(n)
      )
      INSERT INTO @Emp(EmployeeID)
      SELECT value FROM EmpSplit WHERE value <> '';

      IF EXISTS (SELECT 1 FROM @Emp WHERE EmployeeID IS NULL OR EmployeeID = '')
      BEGIN
        RAISERROR('Invalid employeeIDs', 16, 1);
      END

      DECLARE @EffFrom DATE = @EffectiveFrom;
      DECLARE @EffTo   DATE = @EffectiveTo;
      DECLARE @NewEnd  DATE = CASE WHEN @HasEffectiveTo = 1 THEN @EffTo ELSE '9999-12-31' END;

      DECLARE @InsertedSplit INT = 0;
      DECLARE @UpdatedLeft INT = 0;
      DECLARE @UpdatedRight INT = 0;
      DECLARE @DeletedCovered INT = 0;
      DECLARE @DeletedInvalid INT = 0;
      DECLARE @InsertedNew INT = 0;

      -- If an existing assignment fully spans the new range, split it into left and right parts.
      -- (Right part only exists if EffectiveTo was provided.)
      IF @HasEffectiveTo = 1
      BEGIN
        INSERT INTO dbo.EmployeeShiftAllotments (AllotmentID, EmployeeID, ShiftID, EffectiveFrom, EffectiveTo)
        SELECT NEWID(), A.EmployeeID, A.ShiftID, DATEADD(DAY, 1, @EffTo), A.EffectiveTo
        FROM dbo.EmployeeShiftAllotments A
        INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
        WHERE A.EffectiveFrom < @EffFrom
          AND ISNULL(A.EffectiveTo, '9999-12-31') > @EffTo;
        SET @InsertedSplit = @@ROWCOUNT;
      END

      -- Shorten any existing assignment that overlaps the new range on the left side.
      UPDATE A
      SET EffectiveTo = DATEADD(DAY, -1, @EffFrom)
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
      WHERE A.EffectiveFrom < @EffFrom
        AND ISNULL(A.EffectiveTo, '9999-12-31') >= @EffFrom;
      SET @UpdatedLeft = @@ROWCOUNT;

      -- Move forward any existing assignment that overlaps the new range on the right side.
      IF @HasEffectiveTo = 1
      BEGIN
        UPDATE A
        SET EffectiveFrom = DATEADD(DAY, 1, @EffTo)
        FROM dbo.EmployeeShiftAllotments A
        INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
        WHERE A.EffectiveFrom >= @EffFrom
          AND A.EffectiveFrom <= @EffTo
          AND ISNULL(A.EffectiveTo, '9999-12-31') > @EffTo;
        SET @UpdatedRight = @@ROWCOUNT;
      END

      -- Delete any existing assignments fully covered by the new range.
      DELETE A
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
      WHERE A.EffectiveFrom >= @EffFrom
        AND ISNULL(A.EffectiveTo, '9999-12-31') <= @NewEnd;
      SET @DeletedCovered = @@ROWCOUNT;

      -- Cleanup: remove any invalid ranges created by updates (EffectiveTo < EffectiveFrom).
      DELETE A
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
      WHERE A.EffectiveTo IS NOT NULL
        AND A.EffectiveTo < A.EffectiveFrom;
      SET @DeletedInvalid = @@ROWCOUNT;

      -- Insert the new assignment period.
      INSERT INTO dbo.EmployeeShiftAllotments (AllotmentID, EmployeeID, ShiftID, EffectiveFrom, EffectiveTo)
      SELECT NEWID(), E.EmployeeID, @ShiftID, @EffFrom, CASE WHEN @HasEffectiveTo = 1 THEN @EffTo ELSE NULL END
      FROM @Emp E;
      SET @InsertedNew = @@ROWCOUNT;

      SELECT
        (SELECT COUNT(1) FROM @Emp) AS Employees,
        @InsertedNew AS InsertedNew,
        @InsertedSplit AS InsertedSplit,
        @UpdatedLeft AS UpdatedLeft,
        @UpdatedRight AS UpdatedRight,
        @DeletedCovered AS DeletedCovered,
        @DeletedInvalid AS DeletedInvalid;
    `)

    await transaction.commit()
    const summary = result?.recordset?.[0] || {}
    res.json({ success: true, shiftID, summary })
  } catch (err) {
    console.error('shift assignment failed', err)
    try { if (transaction) await transaction.rollback() } catch (_) {}
    res.status(500).json({ error: err.message })
  }
})

app.post('/shift-assignments/remove', async (req, res) => {
  const { shiftID = null, employeeIDs = [], effectiveTo = null } = req.body
  if (!Array.isArray(employeeIDs) || employeeIDs.length === 0) {
    return res.status(400).json({ error: 'employeeIDs array is required' })
  }

  const effTo = effectiveTo ? new Date(effectiveTo) : new Date()
  if (Number.isNaN(effTo.getTime())) return res.status(400).json({ error: 'Invalid effectiveTo date' })

  let transaction
  try {
    const pool = await getPool()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const request = new sql.Request(transaction)
    const isoDate = effTo.toISOString().slice(0, 10)

    const empCsv = Array.from(new Set(employeeIDs.filter(Boolean))).join(',')
    request.input('EmpCSV', sql.NVarChar(sql.MAX), empCsv)
    request.input('EffectiveTo', sql.NVarChar(20), isoDate)
    request.input('ShiftID', sql.NVarChar(36), shiftID || null)
    request.input('HasShift', sql.Bit, shiftID ? 1 : 0)

    const result = await request.query(`
      DECLARE @Emp TABLE (EmployeeID NVARCHAR(36));
      ;WITH EmpSplit AS (
        SELECT LTRIM(RTRIM(m.n.value('.','nvarchar(100)'))) AS value
        FROM (SELECT CAST('<i>' + REPLACE(@EmpCSV, ',', '</i><i>') + '</i>' AS XML) AS x) t
        CROSS APPLY x.nodes('/i') m(n)
      )
      INSERT INTO @Emp(EmployeeID)
      SELECT value FROM EmpSplit WHERE value <> '';

      IF EXISTS (SELECT 1 FROM @Emp WHERE EmployeeID IS NULL OR EmployeeID = '')
      BEGIN
        RAISERROR('Invalid employeeIDs', 16, 1);
      END

      DECLARE @EffTo DATE = TRY_CONVERT(DATE, @EffectiveTo);
      IF @EffTo IS NULL BEGIN RAISERROR('Invalid effectiveTo date', 16, 1); END

      DECLARE @AffectedDeleteFuture INT = 0, @AffectedUpdate INT = 0, @AffectedCleanup INT = 0;

      -- delete future assignments only
      DELETE A
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
      WHERE (@HasShift = 0 OR A.ShiftID = @ShiftID)
        AND A.EffectiveFrom > @EffTo;
      SET @AffectedDeleteFuture = @@ROWCOUNT;

      -- end-date current assignments that overlap
      UPDATE A
      SET EffectiveTo = @EffTo
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
      WHERE (@HasShift = 0 OR A.ShiftID = @ShiftID)
        AND A.EffectiveFrom <= @EffTo
        AND (A.EffectiveTo IS NULL OR A.EffectiveTo >= @EffTo);
      SET @AffectedUpdate = @@ROWCOUNT;

      -- cleanup: remove any already-ended assignments up to EffTo (allows repeated removes)
      DELETE A
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID
      WHERE (@HasShift = 0 OR A.ShiftID = @ShiftID)
        AND A.EffectiveFrom <= @EffTo
        AND A.EffectiveTo IS NOT NULL
        AND A.EffectiveTo <= @EffTo;
      SET @AffectedCleanup = @@ROWCOUNT;

      SELECT @AffectedDeleteFuture AS DeletedFuture, @AffectedUpdate AS UpdatedCurrent, @AffectedCleanup AS DeletedCleanup;
    `)

    await transaction.commit()
    const summary = result?.recordset?.[0] || {}
    const affected = (summary.DeletedFuture || 0) + (summary.UpdatedCurrent || 0) + (summary.DeletedCleanup || 0)
    res.json({ success: true, affected, effectiveTo: isoDate, shiftID: shiftID || null })
  } catch (err) {
    console.error('shift assignment remove failed', err)
    try { if (transaction) await transaction.rollback() } catch (_) {}
    res.status(500).json({ error: err.message })
  }
})

app.post('/shift-assignments/list', async (req, res) => {
  const { employeeIDs = [] } = req.body
  if (!Array.isArray(employeeIDs) || employeeIDs.length === 0) {
    return res.status(400).json({ error: 'employeeIDs array is required' })
  }
  try {
    const pool = await getPool()
    const empCsv = employeeIDs.filter(Boolean).join(',')
    const request = pool.request()
    request.input('EmpCSV', sql.NVarChar(sql.MAX), empCsv)
    const result = await request.query(`
      DECLARE @Emp TABLE (EmployeeID NVARCHAR(36));
      ;WITH EmpSplit AS (
        SELECT LTRIM(RTRIM(m.n.value('.','nvarchar(100)'))) AS value
        FROM (SELECT CAST('<i>' + REPLACE(@EmpCSV, ',', '</i><i>') + '</i>' AS XML) AS x) t
        CROSS APPLY x.nodes('/i') m(n)
      )
      INSERT INTO @Emp(EmployeeID)
      SELECT value FROM EmpSplit WHERE value <> '';

      SELECT A.EmployeeID, A.ShiftID, A.EffectiveFrom, A.EffectiveTo,
             SD.ShiftName, SD.MorningTimeIn, SD.MorningTimeOut, SD.AfternoonTimeIn, SD.AfternoonTimeOut
      FROM dbo.EmployeeShiftAllotments A
      LEFT JOIN dbo.ShiftDefinitions SD ON A.ShiftID = SD.ShiftID
      WHERE A.EmployeeID IN (SELECT EmployeeID FROM @Emp)
        AND (A.EffectiveTo IS NULL OR A.EffectiveTo >= CAST(GETDATE() AS DATE))
      ORDER BY A.EmployeeID, A.EffectiveFrom DESC;
    `)
    res.json(result.recordset || [])
  } catch (err) {
    console.error('list assignments failed', err)
    res.status(500).json({ error: err.message })
  }
})

// Full assignment history (for UI verification / timeline view).
// Returns the most recent N assignments per employee (including past-ended ones).
app.post('/shift-assignments/history', requireAdmin, async (req, res) => {
  const { employeeIDs = [], top = 5 } = req.body || {}
  if (!Array.isArray(employeeIDs) || employeeIDs.length === 0) {
    return res.status(400).json({ error: 'employeeIDs array is required' })
  }
  const topN = Number.isFinite(Number(top)) ? Math.max(1, Math.min(50, Number(top))) : 5
  try {
    const pool = await getPool()
    const empCsv = employeeIDs.filter(Boolean).join(',')
    const request = pool.request()
    request.input('EmpCSV', sql.NVarChar(sql.MAX), empCsv)
    request.input('TopN', sql.Int, topN)
    const result = await request.query(`
      DECLARE @Emp TABLE (EmployeeID NVARCHAR(36));
      ;WITH EmpSplit AS (
        SELECT LTRIM(RTRIM(m.n.value('.','nvarchar(100)'))) AS value
        FROM (SELECT CAST('<i>' + REPLACE(@EmpCSV, ',', '</i><i>') + '</i>' AS XML) AS x) t
        CROSS APPLY x.nodes('/i') m(n)
      )
      INSERT INTO @Emp(EmployeeID)
      SELECT value FROM EmpSplit WHERE value <> '';

      DECLARE @today DATE = CAST(GETDATE() AS DATE);

      ;WITH Pick AS (
        SELECT
          A.EmployeeID,
          A.ShiftID,
          A.EffectiveFrom,
          A.EffectiveTo,
          SD.ShiftName,
          SD.MorningTimeIn,
          SD.MorningTimeOut,
          SD.AfternoonTimeIn,
          SD.AfternoonTimeOut,
          CASE WHEN @today BETWEEN A.EffectiveFrom AND ISNULL(A.EffectiveTo, @today) THEN 1 ELSE 0 END AS IsCurrent,
          ROW_NUMBER() OVER (PARTITION BY A.EmployeeID ORDER BY A.EffectiveFrom DESC) AS rn
        FROM dbo.EmployeeShiftAllotments A
        LEFT JOIN dbo.ShiftDefinitions SD ON A.ShiftID = SD.ShiftID
        WHERE A.EmployeeID IN (SELECT EmployeeID FROM @Emp)
      )
      SELECT *
      FROM Pick
      WHERE rn <= @TopN
      ORDER BY EmployeeID, EffectiveFrom DESC;
    `)
    res.json(result.recordset || [])
  } catch (err) {
    console.error('assignment history failed', err)
    res.status(500).json({ error: err.message })
  }
})

function getNextAttendanceLogType(att) {
  if (!att || !att.MorningTimeIn) return 'MORNING_IN'
  if (!att.MorningTimeOut) return 'MORNING_OUT'
  if (!att.AfternoonTimeIn) return 'AFTERNOON_IN'
  if (!att.AfternoonTimeOut) return 'AFTERNOON_OUT'
  return null
}

async function processAttendanceLog(pool, { employeeID, logType, now = new Date() }) {
  const todayStr = now.toISOString().split('T')[0]
  const currentTime = now.toTimeString().split(' ')[0]
  const todayDay = now.getDay() === 0 ? 7 : now.getDay()

  const shiftResult = await pool.request()
    .input('EmployeeID', sql.NVarChar(36), employeeID)
    .input('Today', sql.Date, todayStr)
    .input('TodayDay', sql.Int, todayDay)
    .query(`
      SELECT s.*
      FROM dbo.EmployeeShiftAllotments a
      JOIN dbo.ShiftDefinitions s ON a.ShiftID = s.ShiftID
      JOIN dbo.ShiftDays sd ON sd.ShiftID = s.ShiftID
      WHERE a.EmployeeID=@EmployeeID
      AND @Today BETWEEN a.EffectiveFrom AND ISNULL(a.EffectiveTo, @Today)
      AND sd.DayOfWeek=@TodayDay
    `)
  if (!shiftResult.recordset.length) {
    const err = new Error('No shift assigned for this employee today')
    err.statusCode = 400
    throw err
  }
  const shift = shiftResult.recordset[0]

  await pool.request()
    .input('EmployeeID', sql.NVarChar(36), employeeID)
    .input('AttendanceDate', sql.Date, todayStr)
    .query(`
      IF NOT EXISTS (
        SELECT 1 FROM dbo.AttendanceRecords
        WHERE EmployeeID=@EmployeeID AND AttendanceDate=@AttendanceDate
      )
      INSERT INTO dbo.AttendanceRecords(EmployeeID, AttendanceDate)
      VALUES(@EmployeeID, @AttendanceDate)
    `)

  let minutesLate = 0
  let minutesEarly = 0
  let status = 'On-Time'

  const calcLate = async (requiredTime) => {
    if (!requiredTime) return 0
    const diff = await pool.request()
      .input('Actual', sql.NVarChar(8), parseTimeString(currentTime))
      .input('Required', sql.NVarChar(8), toTimeLiteral(requiredTime))
      .query(`SELECT DATEDIFF(MINUTE, CAST(@Required AS TIME(7)), CAST(@Actual AS TIME(7))) AS diff`)
    return Math.max(0, diff.recordset[0].diff - (shift.GracePeriodMinutes || 0))
  }

  const calcEarlyLeave = async (requiredTime) => {
    if (!requiredTime) return 0
    const diff = await pool.request()
      .input('Actual', sql.NVarChar(8), parseTimeString(currentTime))
      .input('Required', sql.NVarChar(8), toTimeLiteral(requiredTime))
      .query(`SELECT DATEDIFF(MINUTE, CAST(@Actual AS TIME(7)), CAST(@Required AS TIME(7))) AS diff`)
    return Math.max(0, diff.recordset[0].diff)
  }

  if (logType === 'MORNING_IN') {
    minutesLate = await calcLate(shift.MorningTimeIn)
    if (minutesLate > 0) status = 'Late'
  }

  if (logType === 'AFTERNOON_IN') {
    minutesLate = await calcLate(shift.AfternoonTimeIn)
    if (minutesLate > 0) status = 'Late'
  }

  if (logType === 'MORNING_OUT') {
    minutesEarly = await calcEarlyLeave(shift.MorningTimeOut)
    if (minutesEarly > 0) status = 'Early Leave'
  }

  if (logType === 'AFTERNOON_OUT') {
    minutesEarly = await calcEarlyLeave(shift.AfternoonTimeOut)
    if (minutesEarly > 0) status = 'Early Leave'
  }

  const columnMap = {
    MORNING_IN: 'MorningTimeIn',
    MORNING_OUT: 'MorningTimeOut',
    AFTERNOON_IN: 'AfternoonTimeIn',
    AFTERNOON_OUT: 'AfternoonTimeOut'
  }
  const column = columnMap[logType]
  if (!column) {
    const err = new Error('Invalid logType')
    err.statusCode = 400
    throw err
  }

  await pool.request()
    .input('EmployeeID', sql.NVarChar(36), employeeID)
    .input('AttendanceDate', sql.Date, todayStr)
    .input('TimeValue', sql.NVarChar(8), parseTimeString(currentTime))
    .input('MinutesLate', sql.Int, minutesLate)
    .input('MinutesEarly', sql.Int, minutesEarly)
    .input('Status', sql.NVarChar(50), status)
    .query(`
      UPDATE dbo.AttendanceRecords
      SET ${column}=CAST(@TimeValue AS TIME(7)),
          MinutesLate = MinutesLate + @MinutesLate,
          MinutesEarlyLeave = MinutesEarlyLeave + @MinutesEarly,
          Status=@Status
      WHERE EmployeeID=@EmployeeID
      AND AttendanceDate=@AttendanceDate
    `)

  return { logType, time: currentTime, minutesLate, minutesEarly, status, attendanceDate: todayStr }
}

async function updateAttendanceRecord(pool, id, body = {}) {
  if (!id) {
    const err = new Error('AttendanceID is required')
    err.statusCode = 400
    throw err
  }

  const setClauses = []
  const req = pool.request()
  req.input('AttendanceID', sql.NVarChar(36), id)

  if (body.EmployeeID !== undefined) {
    req.input('EmployeeID', sql.NVarChar(36), body.EmployeeID || null)
    setClauses.push('EmployeeID = @EmployeeID')
  }

  if (body.AttendanceDate !== undefined) {
    req.input('AttendanceDate', sql.Date, body.AttendanceDate || null)
    setClauses.push('AttendanceDate = @AttendanceDate')
  }

  const timeField = (key, sqlName) => {
    if (body[key] === undefined) return
    const parsed = body[key] ? parseTimeString(body[key]) : null
    if (body[key] && !parsed) {
      const err = new Error(`Invalid time for ${key}`)
      err.statusCode = 400
      throw err
    }
    req.input(sqlName, sql.VarChar(8), parsed)
    setClauses.push(`${key} = ${parsed ? `CAST(@${sqlName} AS TIME(7))` : 'NULL'}`)
  }

  timeField('MorningTimeIn', 'MorningTimeIn')
  timeField('MorningTimeOut', 'MorningTimeOut')
  timeField('AfternoonTimeIn', 'AfternoonTimeIn')
  timeField('AfternoonTimeOut', 'AfternoonTimeOut')

  if (body.Status !== undefined) {
    req.input('Status', sql.NVarChar(50), body.Status || null)
    setClauses.push('Status = @Status')
  }

  if (!setClauses.length) {
    const err = new Error('No fields to update')
    err.statusCode = 400
    throw err
  }

  const updateSql = `
    UPDATE dbo.AttendanceRecords
    SET ${setClauses.join(', ')}
    WHERE AttendanceID = @AttendanceID
  `

  const upsertByEmployeeDate = async () => {
    const employeeID = body.EmployeeID || null
    const attendanceDate = body.AttendanceDate || null
    if (!employeeID || !attendanceDate) return null

    const parseOptTime = (v) => (v ? parseTimeString(v) : null)
    const mIn = parseOptTime(body.MorningTimeIn)
    const mOut = parseOptTime(body.MorningTimeOut)
    const aIn = parseOptTime(body.AfternoonTimeIn)
    const aOut = parseOptTime(body.AfternoonTimeOut)
    const status = body.Status !== undefined ? (body.Status || null) : null

    const result = await pool.request()
      .input('EmployeeID', sql.NVarChar(36), employeeID)
      .input('AttendanceDate', sql.Date, attendanceDate)
      .input('MorningTimeIn', sql.VarChar(8), mIn)
      .input('MorningTimeOut', sql.VarChar(8), mOut)
      .input('AfternoonTimeIn', sql.VarChar(8), aIn)
      .input('AfternoonTimeOut', sql.VarChar(8), aOut)
      .input('Status', sql.NVarChar(50), status)
      .query(`
        IF EXISTS (
          SELECT 1 FROM dbo.AttendanceRecords
          WHERE EmployeeID=@EmployeeID AND AttendanceDate=@AttendanceDate
        )
        BEGIN
          UPDATE dbo.AttendanceRecords
          SET
            MorningTimeIn = CASE WHEN @MorningTimeIn IS NULL THEN MorningTimeIn ELSE CAST(@MorningTimeIn AS TIME(7)) END,
            MorningTimeOut = CASE WHEN @MorningTimeOut IS NULL THEN MorningTimeOut ELSE CAST(@MorningTimeOut AS TIME(7)) END,
            AfternoonTimeIn = CASE WHEN @AfternoonTimeIn IS NULL THEN AfternoonTimeIn ELSE CAST(@AfternoonTimeIn AS TIME(7)) END,
            AfternoonTimeOut = CASE WHEN @AfternoonTimeOut IS NULL THEN AfternoonTimeOut ELSE CAST(@AfternoonTimeOut AS TIME(7)) END,
            Status = CASE WHEN @Status IS NULL THEN Status ELSE @Status END
          WHERE EmployeeID=@EmployeeID AND AttendanceDate=@AttendanceDate;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.AttendanceRecords(
            EmployeeID, AttendanceDate, MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut, Status
          ) VALUES (
            @EmployeeID,
            @AttendanceDate,
            CAST(@MorningTimeIn AS TIME(7)),
            CAST(@MorningTimeOut AS TIME(7)),
            CAST(@AfternoonTimeIn AS TIME(7)),
            CAST(@AfternoonTimeOut AS TIME(7)),
            @Status
          );
        END;

        SELECT TOP 1 *
        FROM dbo.AttendanceRecords
        WHERE EmployeeID=@EmployeeID AND AttendanceDate=@AttendanceDate;
      `)

    return result.recordset[0] || null
  }

  try {
    const result = await req.query(updateSql)
    if (result.rowsAffected[0] === 0) {
      const upserted = await upsertByEmployeeDate()
      if (upserted) return upserted
      const err = new Error('Attendance record not found')
      err.statusCode = 404
      throw err
    }
  } catch (err) {
    if (err.number === 2627) {
      err.statusCode = 409
      err.message = 'Duplicate AttendanceDate for this employee'
    }
    throw err
  }

  const row = await pool.request()
    .input('AttendanceID', sql.NVarChar(36), id)
    .query('SELECT * FROM dbo.AttendanceRecords WHERE AttendanceID=@AttendanceID')

  return row.recordset[0] || { AttendanceID: id }
}

app.put('/attendance/:id', async (req, res) => {
  try {
    const pool = await getPool()
    const updated = await updateAttendanceRecord(pool, req.params.id, req.body || {})
    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/attendance/update', async (req, res) => {
  const { id, ...payload } = req.body || {}
  try {
    const pool = await getPool()
    const updated = await updateAttendanceRecord(pool, id, payload)
    res.json(updated)
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/attendance/log', async (req, res) => {
  const { employeeCode, logType } = req.body

  try {
    const pool = await getPool()
    const empResult = await pool.request()
      .input('EmployeeCode', sql.NVarChar(50), employeeCode)
      .query(`SELECT EmployeeID FROM dbo.Employees WHERE EmployeeCode=@EmployeeCode`)

    if (!empResult.recordset.length) return res.status(404).json({ error: 'Employee not found' })
    const employeeID = empResult.recordset[0].EmployeeID
    const todayStr = new Date().toISOString().split('T')[0]
    const att = await pool.request()
      .input('EmployeeID', sql.NVarChar(36), employeeID)
      .input('AttendanceDate', sql.Date, todayStr)
      .query(`
        SELECT MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut
        FROM dbo.AttendanceRecords
        WHERE EmployeeID=@EmployeeID AND AttendanceDate=@AttendanceDate
      `)

    const nextLogType = getNextAttendanceLogType(att.recordset[0] || null)
    if (!nextLogType) {
      return res.status(409).json({ error: 'Attendance already complete for today' })
    }

    const requestedLogType = logType || nextLogType
    if (requestedLogType !== nextLogType) {
      return res.status(409).json({
        error: `Invalid log sequence. Next expected log is ${nextLogType}.`
      })
    }

    const result = await processAttendanceLog(pool, { employeeID, logType: requestedLogType })

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, employeeCode || 'SYSTEM'),
      action: 'ATTENDANCE_LOG',
      tableName: 'AttendanceRecords',
      recordID: `${employeeID}:${result.attendanceDate}`,
      afterJson: JSON.stringify(result),
      ipAddress: req.ip
    })

    res.json({ success: true, ...result })
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.post('/auth/login-legacy', (req, res) => {
  const { username, password } = req.body || {}
  if (username === 'admin' && password === 'admin') {
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64')
    return res.json({
      success: true,
      token,
      user: { username: 'admin', role: 'admin' }
    })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
})

app.post('/face-scan/recognize', async (req, res) => {
  const { employeeCode, deviceCode, matchScore, rawImageRef, latitude, longitude, actor } = req.body || {}
  if (!employeeCode) return res.status(400).json({ error: 'employeeCode is required (prototype mode)' })

  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')

    const emp = await pool.request()
      .input('EmployeeCode', sql.NVarChar(50), employeeCode)
      .query(`
        SELECT EmployeeID, EmployeeCode, CONCAT(FirstName,' ',LastName) AS EmployeeName
        FROM dbo.Employees
        WHERE EmployeeCode=@EmployeeCode
      `)
    if (!emp.recordset.length) return res.status(404).json({ error: 'Employee not found' })
    const employee = emp.recordset[0]

    let deviceID = null
    if (deviceCode) {
      const dev = await pool.request()
        .input('DeviceCode', sql.NVarChar(100), deviceCode)
        .query('SELECT DeviceID FROM dbo.Devices WHERE DeviceCode=@DeviceCode')
      deviceID = dev.recordset[0]?.DeviceID || null
    }

    const todayStr = new Date().toISOString().split('T')[0]
    const att = await pool.request()
      .input('EmployeeID', sql.NVarChar(36), employee.EmployeeID)
      .input('AttendanceDate', sql.Date, todayStr)
      .query(`
        SELECT MorningTimeIn, MorningTimeOut, AfternoonTimeIn, AfternoonTimeOut
        FROM dbo.AttendanceRecords
        WHERE EmployeeID=@EmployeeID AND AttendanceDate=@AttendanceDate
      `)

    const nextLogType = getNextAttendanceLogType(att.recordset[0] || null)
    if (!nextLogType) return res.status(409).json({ error: 'Attendance already complete for today' })

    const attendanceResult = await processAttendanceLog(pool, {
      employeeID: employee.EmployeeID,
      logType: nextLogType
    })

    const scanReq = pool.request()
    scanReq.input('BiometricScanID', sql.NVarChar(36), randomUUID())
    scanReq.input('EmployeeID', sql.NVarChar(36), employee.EmployeeID)
    scanReq.input('DeviceID', sql.NVarChar(36), deviceID)
    scanReq.input('ScanType', sql.NVarChar(50), 'FACE')
    scanReq.input('AuthenticationMethod', sql.NVarChar(50), 'FACE_MATCH')
    scanReq.input('MatchScore', sql.Decimal(5, 2), matchScore ?? 99.0)
    scanReq.input('ScanResult', sql.NVarChar(30), 'SUCCESS')
    scanReq.input('IsSuccessful', sql.Bit, true)
    scanReq.input('RawImageRef', sql.NVarChar(500), rawImageRef || null)
    scanReq.input('Latitude', sql.Decimal(10, 7), latitude ?? null)
    scanReq.input('Longitude', sql.Decimal(10, 7), longitude ?? null)
    const insertedScan = await scanReq.query(`
      INSERT INTO dbo.BiometricScans
      (BiometricScanID, EmployeeID, DeviceID, ScanType, AuthenticationMethod, MatchScore, ScanResult, IsSuccessful, RawImageRef, Latitude, Longitude)
      OUTPUT INSERTED.BiometricScanID
      VALUES
      (@BiometricScanID, @EmployeeID, @DeviceID, @ScanType, @AuthenticationMethod, @MatchScore, @ScanResult, @IsSuccessful, @RawImageRef, @Latitude, @Longitude)
    `)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, actor || deviceCode || 'FACE_SCANNER'),
      action: 'FACE_SCAN_ATTENDANCE',
      tableName: 'AttendanceRecords',
      recordID: `${employee.EmployeeID}:${attendanceResult.attendanceDate}`,
      afterJson: JSON.stringify({ ...attendanceResult, biometricScanID: insertedScan.recordset[0]?.BiometricScanID }),
      deviceID,
      ipAddress: req.ip
    })

    res.json({
      success: true,
      employeeCode: employee.EmployeeCode,
      employeeName: employee.EmployeeName,
      deviceCode: deviceCode || null,
      biometricScanID: insertedScan.recordset[0]?.BiometricScanID || null,
      ...attendanceResult
    })
  } catch (err) {
    console.error(err)
    res.status(err.statusCode || 500).json({ error: err.message })
  }
})

app.get('/devices', async (req, res) => {
  try {
    const pool = await getPool()
    const q = `SELECT DeviceID, DeviceCode, DeviceName, DeviceType, SerialNumber, IPAddress, Port, MachineID, CommPort, IsActive, RegisteredAt, RegisteredBy, LastSeenAt, UpdatedAt
      FROM dbo.Devices
      ORDER BY RegisteredAt DESC`
    const result = await pool.request().query(q)
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/devices', async (req, res) => {
  const {
    DeviceCode,
    DeviceName,
    DeviceType,
    SerialNumber,
    IPAddress,
    Port,
    MachineID,
    CommPort,
    DevicePassword,
    IsActive,
    RegisteredBy
  } = req.body || {}

  if (!DeviceCode || !DeviceName) {
    return res.status(400).json({ error: 'DeviceCode and DeviceName are required' })
  }

  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('DeviceID', sql.NVarChar(36), randomUUID())
    request.input('DeviceCode', sql.NVarChar(100), String(DeviceCode).trim())
    request.input('DeviceName', sql.NVarChar(150), String(DeviceName).trim())
    request.input('DeviceType', sql.NVarChar(50), DeviceType || null)
    request.input('SerialNumber', sql.NVarChar(100), SerialNumber || null)
    request.input('IPAddress', sql.NVarChar(64), IPAddress || null)
    request.input('Port', sql.Int, Port ?? null)
    request.input('MachineID', sql.Int, MachineID ?? null)
    request.input('CommPort', sql.Int, CommPort ?? null)
    request.input('DevicePassword', sql.Int, DevicePassword ?? null)
    request.input('IsActive', sql.Bit, IsActive === undefined ? true : !!IsActive)
    request.input('RegisteredBy', sql.NVarChar(100), RegisteredBy || null)
    const q = `
      INSERT INTO dbo.Devices (DeviceID, DeviceCode, DeviceName, DeviceType, SerialNumber, IPAddress, Port, MachineID, CommPort, DevicePassword, IsActive, RegisteredBy)
      OUTPUT INSERTED.*
      VALUES (@DeviceID, @DeviceCode, @DeviceName, @DeviceType, @SerialNumber, @IPAddress, @Port, @MachineID, @CommPort, @DevicePassword, @IsActive, @RegisteredBy)
    `
    const result = await request.query(q)
    const created = result.recordset[0]
    if (created && Object.prototype.hasOwnProperty.call(created, 'DevicePassword')) delete created.DevicePassword
    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, RegisteredBy || 'SYSTEM'),
      action: 'CREATE_DEVICE',
      tableName: 'Devices',
      recordID: created.DeviceID,
      afterJson: JSON.stringify(created),
      ipAddress: req.ip
    })
    res.json(created)
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({ error: 'DeviceCode already exists' })
    }
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/devices/:id', async (req, res) => {
  const id = String(req.params.id || '').trim()
  const body = req.body || {}
  if (!id) return res.status(400).json({ error: 'DeviceID is required' })

  const getStr = (key) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return null
    const v = body[key]
    if (v === undefined || v === null) return null
    const s = String(v).trim()
    return s === '' ? null : s
  }

  const getInt = (key) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return null
    const raw = body[key]
    if (raw === undefined || raw === null || raw === '') return null
    const n = Number.parseInt(String(raw), 10)
    return Number.isInteger(n) ? n : null
  }

  const getBool = (key) => {
    if (!Object.prototype.hasOwnProperty.call(body, key)) return null
    if (body[key] === undefined || body[key] === null) return null
    return !!body[key]
  }

  try {
    const pool = await getPool()

    const request = pool.request()
    request.input('DeviceID', sql.NVarChar(36), id)
    request.input('DeviceName', sql.NVarChar(150), getStr('DeviceName'))
    request.input('DeviceType', sql.NVarChar(50), getStr('DeviceType'))
    request.input('SerialNumber', sql.NVarChar(100), getStr('SerialNumber'))
    request.input('IPAddress', sql.NVarChar(64), getStr('IPAddress'))
    request.input('Port', sql.Int, getInt('Port'))
    request.input('MachineID', sql.Int, getInt('MachineID'))
    request.input('CommPort', sql.Int, getInt('CommPort'))
    request.input('DevicePassword', sql.Int, getInt('DevicePassword'))
    request.input('IsActive', sql.Bit, getBool('IsActive'))

    const updated = await request.query(`
      UPDATE dbo.Devices
      SET
        DeviceName = COALESCE(@DeviceName, DeviceName),
        DeviceType = COALESCE(@DeviceType, DeviceType),
        SerialNumber = COALESCE(@SerialNumber, SerialNumber),
        IPAddress = COALESCE(@IPAddress, IPAddress),
        Port = COALESCE(@Port, Port),
        MachineID = COALESCE(@MachineID, MachineID),
        CommPort = COALESCE(@CommPort, CommPort),
        DevicePassword = COALESCE(@DevicePassword, DevicePassword),
        IsActive = COALESCE(@IsActive, IsActive),
        UpdatedAt = GETDATE()
      OUTPUT INSERTED.*
      WHERE DeviceID=@DeviceID
    `)

    const device = updated.recordset[0]
    if (!device) return res.status(404).json({ error: 'Device not found' })
    if (device && Object.prototype.hasOwnProperty.call(device, 'DevicePassword')) delete device.DevicePassword

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, body?.Actor || body?.RegisteredBy || 'UI_DEVICES'),
      action: 'UPDATE_DEVICE',
      tableName: 'Devices',
      recordID: id,
      afterJson: JSON.stringify(device),
      deviceID: id,
      ipAddress: req.ip
    })

    return res.json(device)
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})


app.post('/devices/register-connection', async (req, res) => {
  const {
    DeviceCode,
    DeviceName,
    DeviceType,
    SerialNumber,
    IPAddress,
    Port,
    LocationName,
    Latitude,
    Longitude,
    RegisteredBy
  } = req.body || {}

  const normalizedCode = String(DeviceCode || '').trim()
  if (!normalizedCode) {
    return res.status(400).json({ error: 'DeviceCode is required' })
  }

  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')

    const existingResult = await pool.request()
      .input('DeviceCode', sql.NVarChar(100), normalizedCode)
      .query('SELECT TOP 1 * FROM dbo.Devices WHERE DeviceCode=@DeviceCode')

    let device = null
    let status = 'connected'

    if (existingResult.recordset.length) {
      const reqUpdate = pool.request()
      reqUpdate.input('DeviceCode', sql.NVarChar(100), normalizedCode)
      reqUpdate.input('DeviceName', sql.NVarChar(150), DeviceName ? String(DeviceName).trim() : null)
      reqUpdate.input('DeviceType', sql.NVarChar(50), DeviceType || null)
      reqUpdate.input('SerialNumber', sql.NVarChar(100), SerialNumber || null)
      reqUpdate.input('IPAddress', sql.NVarChar(64), IPAddress || null)
      reqUpdate.input('Port', sql.Int, Port ?? null)
      reqUpdate.input('LocationName', sql.NVarChar(150), LocationName || null)
      reqUpdate.input('Latitude', sql.Decimal(10, 7), Latitude ?? null)
      reqUpdate.input('Longitude', sql.Decimal(10, 7), Longitude ?? null)
      const updated = await reqUpdate.query(`
        UPDATE dbo.Devices
        SET
          DeviceName = COALESCE(@DeviceName, DeviceName),
          DeviceType = COALESCE(@DeviceType, DeviceType),
          SerialNumber = COALESCE(@SerialNumber, SerialNumber),
          IPAddress = COALESCE(@IPAddress, IPAddress),
          Port = COALESCE(@Port, Port),
          LocationName = COALESCE(@LocationName, LocationName),
          Latitude = COALESCE(@Latitude, Latitude),
          Longitude = COALESCE(@Longitude, Longitude),
          UpdatedAt = GETDATE()
        OUTPUT INSERTED.*
        WHERE DeviceCode=@DeviceCode
      `)
      device = updated.recordset[0]
    } else {
      return res.status(404).json({
        error: 'Device not found. Add the device first via POST /devices.'
      })
    }

    const connectionID = randomUUID()

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, RegisteredBy || normalizedCode),
      action: 'REGISTER_DEVICE_CONNECTION',
      tableName: 'Devices',
      recordID: device?.DeviceID || null,
      afterJson: JSON.stringify(device || {}),
      deviceID: device?.DeviceID || null,
      ipAddress: req.ip
    })

    return res.json({
      success: true,
      status: device?.LastSeenAt ? status : 'registered',
      connectionID,
      serverTime: new Date().toISOString(),
      device
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

function isPrivateIpv4(ip) {
  if (!ip) return false
  const m = String(ip).trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return false
  const parts = m.slice(1).map(n => Number(n))
  if (parts.some(n => Number.isNaN(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  if (a === 10) return true
  if (a === 127) return true
  if (a === 192 && b === 168) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  return false
}

app.post('/devices/test-connection', async (req, res) => {
  const { DeviceCode, IPAddress, Port, DeviceID, Password, CommPort } = req.body || {}
  const normalizedCode = String(DeviceCode || '').trim()

  try {
    let targetIp = IPAddress ? String(IPAddress).trim() : null
    let targetPort = Port ?? null
    let device = null

    if (normalizedCode) {
      const pool = await getPool()
      const dev = await pool.request()
        .input('DeviceCode', sql.NVarChar(100), normalizedCode)
        .query('SELECT TOP 1 DeviceID, DeviceCode, DeviceName, IPAddress, Port, MachineID, CommPort, DevicePassword FROM dbo.Devices WHERE DeviceCode=@DeviceCode')
      device = dev.recordset[0] || null
      if (!device) return res.status(404).json({ error: 'Device not found' })
      targetIp = String(device.IPAddress || '').trim() || null
      targetPort = device.Port ?? null
    }

    if (!targetIp || !targetPort) {
      return res.status(400).json({ error: 'IPAddress and Port are required (or provide DeviceCode with saved IP/Port).' })
    }

    if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
      return res.status(400).json({ error: 'Port must be an integer between 1 and 65535.' })
    }

    if (!isPrivateIpv4(targetIp)) {
      return res.status(400).json({ error: 'For safety, only private IPv4 addresses are allowed for test-connection.' })
    }

    
    const bridgeBase = String(process.env.BIOMETRICS_BRIDGE_URL || '').trim() || 'http://localhost:5001'

    const tryBridgeSdk = async () => {
      const numericDeviceId = Number(DeviceID || device?.MachineID || device?.DeviceCode || normalizedCode)
      if (!Number.isInteger(numericDeviceId) || numericDeviceId <= 0) return null

      const payload = {
        ip: targetIp,
        port: targetPort,
        deviceId: numericDeviceId,
        password: Number(Password ?? 0),
        commPort: Number(CommPort ?? 0)
      }

      const { URL } = require('url')
      const u = new URL('/v1/test-connection', bridgeBase)
      const isHttps = u.protocol === 'https:'
      const httpMod = require(isHttps ? 'https' : 'http')

      const body = JSON.stringify(payload)

      return await new Promise((resolve, reject) => {
        const req2 = httpMod.request({
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 6000
        }, (resp) => {
          let data = ''
          resp.setEncoding('utf8')
          resp.on('data', (chunk) => { data += chunk })
          resp.on('end', () => {
            try {
              const parsed = data ? JSON.parse(data) : null
              resolve({ status: resp.statusCode, payload: parsed })
            } catch (e) {
              resolve({ status: resp.statusCode, payload: null, raw: data })
            }
          })
        })

        req2.on('timeout', () => {
          try { req2.destroy(new Error('Bridge timeout')) } catch (_) {}
        })
        req2.on('error', (err) => reject(err))
        req2.write(body)
        req2.end()
      })
    }

    try {
      const bridgeRes = await tryBridgeSdk()
      if (bridgeRes && bridgeRes.status >= 200 && bridgeRes.status < 300) {
        const ok = !!bridgeRes.payload?.result?.success
        return res.json({
          success: ok,
          mode: 'SDK',
          latencyMs: bridgeRes.payload?.latencyMs ?? null,
          ip: targetIp,
          port: targetPort,
          deviceCode: device?.DeviceCode || normalizedCode || null,
          deviceName: device?.DeviceName || null,
          serverTime: new Date().toISOString(),
          bridge: bridgeRes.payload,
          reason: ok ? null : (bridgeRes.payload?.result?.step || ('SDK error ' + String(bridgeRes.payload?.result?.errorCode ?? '')))
        })
      }
    } catch (_) {
   
    }

    const net = require('net')
    const startedAt = Date.now()

    const result = await new Promise((resolve) => {
      const socket = new net.Socket()
      const timeoutMs = 3000
      let done = false

      const finish = (payload) => {
        if (done) return
        done = true
        try { socket.destroy() } catch (_) {}
        resolve(payload)
      }

      socket.setTimeout(timeoutMs)
      socket.once('connect', () => finish({ ok: true }))
      socket.once('timeout', () => finish({ ok: false, reason: 'timeout' }))
      socket.once('error', (err) => finish({ ok: false, reason: err?.code || err?.message || 'error' }))

      try {
        socket.connect(targetPort, targetIp)
      } catch (e) {
        finish({ ok: false, reason: e?.message || 'error' })
      }
    })

    const latencyMs = Date.now() - startedAt
    return res.json({
      success: result.ok,
      latencyMs,
      ip: targetIp,
      port: targetPort,
      deviceCode: device?.DeviceCode || normalizedCode || null,
      deviceName: device?.DeviceName || null,
      serverTime: new Date().toISOString(),
      reason: result.ok ? null : result.reason
    })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/devices/test-batch', async (req, res) => {
  const deviceIds = Array.isArray(req.body?.deviceIds) ? req.body.deviceIds : []
  if (!deviceIds.length) return res.status(400).json({ error: 'deviceIds is required' })
  if (deviceIds.length > 100) return res.status(413).json({ error: 'Too many deviceIds (max 100).' })

  try {
    const pool = await getPool()
    const request = pool.request()

    const params = []
    deviceIds.forEach((id, idx) => {
      const key = `DeviceID${idx}`
      params.push(`@${key}`)
      request.input(key, sql.NVarChar(36), String(id))
    })

    const devRes = await request.query(`
      SELECT DeviceID, DeviceCode, DeviceName, IPAddress, Port, MachineID, CommPort, DevicePassword
      FROM dbo.Devices
      WHERE DeviceID IN (${params.join(',')})
    `)

    const list = devRes.recordset || []
    const byId = new Map(list.map(d => [String(d.DeviceID), d]))

    const bridgeBase = String(process.env.BIOMETRICS_BRIDGE_URL || '').trim() || 'http://localhost:5001'
    const { URL } = require('url')
    const net = require('net')

    const tryBridgeSdk = async (device) => {
      const targetIp = String(device?.IPAddress || '').trim() || null
      const targetPort = device?.Port ?? null
      if (!targetIp || !targetPort) return null

      const numericDeviceId = Number(device?.MachineID || device?.DeviceCode || 0)
      if (!Number.isInteger(numericDeviceId) || numericDeviceId <= 0) return null

      const payload = {
        ip: targetIp,
        port: targetPort,
        deviceId: numericDeviceId,
        password: Number(device?.DevicePassword ?? 0),
        commPort: Number(device?.CommPort ?? 0)
      }

      const u = new URL('/v1/test-connection', bridgeBase)
      const isHttps = u.protocol === 'https:'
      const httpMod = require(isHttps ? 'https' : 'http')
      const body = JSON.stringify(payload)

      return await new Promise((resolve, reject) => {
        const req2 = httpMod.request({
          protocol: u.protocol,
          hostname: u.hostname,
          port: u.port,
          path: u.pathname + u.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          },
          timeout: 6000
        }, (resp) => {
          let data = ''
          resp.setEncoding('utf8')
          resp.on('data', (chunk) => { data += chunk })
          resp.on('end', () => {
            try {
              const parsed = data ? JSON.parse(data) : null
              resolve({ status: resp.statusCode, payload: parsed })
            } catch (e) {
              resolve({ status: resp.statusCode, payload: null, raw: data })
            }
          })
        })

        req2.on('timeout', () => {
          try { req2.destroy(new Error('Bridge timeout')) } catch (_) {}
        })
        req2.on('error', (err) => reject(err))
        req2.write(body)
        req2.end()
      })
    }

    const tcpTest = async (ip, port) => {
      const startedAt = Date.now()
      const result = await new Promise((resolve) => {
        const socket = new net.Socket()
        const timeoutMs = 3000
        let done = false

        const finish = (payload) => {
          if (done) return
          done = true
          try { socket.destroy() } catch (_) {}
          resolve(payload)
        }

        socket.setTimeout(timeoutMs)
        socket.once('connect', () => finish({ ok: true }))
        socket.once('timeout', () => finish({ ok: false, reason: 'timeout' }))
        socket.once('error', (err) => finish({ ok: false, reason: err?.code || err?.message || 'error' }))

        try { socket.connect(port, ip) } catch (e) { finish({ ok: false, reason: e?.message || 'error' }) }
      })
      return { ...result, latencyMs: Date.now() - startedAt }
    }

    const results = []

    for (const id of deviceIds) {
      const device = byId.get(String(id)) || null
      if (!device) {
        results.push({ deviceId: String(id), success: false, reason: 'Device not found' })
        continue
      }

      const targetIp = String(device.IPAddress || '').trim() || null
      const targetPort = device.Port ?? null
      if (!targetIp || !targetPort) {
        results.push({ deviceId: String(device.DeviceID), deviceCode: device.DeviceCode, success: false, reason: 'Missing IP/Port' })
        continue
      }

      if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) {
        results.push({ deviceId: String(device.DeviceID), deviceCode: device.DeviceCode, success: false, reason: 'Invalid port' })
        continue
      }

      if (!isPrivateIpv4(targetIp)) {
        results.push({ deviceId: String(device.DeviceID), deviceCode: device.DeviceCode, success: false, reason: 'IP not private' })
        continue
      }

      
      try {
        const bridgeRes = await tryBridgeSdk(device)
        if (bridgeRes && bridgeRes.status >= 200 && bridgeRes.status < 300) {
          const ok = !!bridgeRes.payload?.result?.success
          results.push({
            deviceId: String(device.DeviceID),
            deviceCode: device.DeviceCode,
            deviceName: device.DeviceName || null,
            ip: targetIp,
            port: targetPort,
            success: ok,
            mode: 'SDK',
            latencyMs: bridgeRes.payload?.latencyMs ?? null,
            reason: ok ? null : (bridgeRes.payload?.result?.step || ('SDK error ' + String(bridgeRes.payload?.result?.errorCode ?? '')))
          })
          continue
        }
      } catch (_) {}

      const tcp = await tcpTest(targetIp, targetPort)
      results.push({
        deviceId: String(device.DeviceID),
        deviceCode: device.DeviceCode,
        deviceName: device.DeviceName || null,
        ip: targetIp,
        port: targetPort,
        success: !!tcp.ok,
        mode: 'TCP',
        latencyMs: tcp.latencyMs,
        reason: tcp.ok ? null : tcp.reason
      })
    }

    return res.json({ success: true, results })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/devices/heartbeat', async (req, res) => {
  const { DeviceCode, DeviceID, Actor } = req.body || {}
  const normalizedCode = String(DeviceCode || '').trim()

  if (!normalizedCode && !DeviceID) {
    return res.status(400).json({ error: 'DeviceCode or DeviceID is required' })
  }

  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('DeviceCode', sql.NVarChar(100), normalizedCode || null)
    request.input('DeviceID', sql.NVarChar(36), DeviceID || null)

    const q = `
      UPDATE dbo.Devices
      SET IsActive = 1, LastSeenAt = GETDATE(), UpdatedAt = GETDATE()
      OUTPUT INSERTED.*
      WHERE (@DeviceID IS NOT NULL AND DeviceID=@DeviceID)
         OR (@DeviceID IS NULL AND @DeviceCode IS NOT NULL AND DeviceCode=@DeviceCode)
    `
    const updated = await request.query(q)
    const device = updated.recordset[0]
    if (!device) {
      return res.status(404).json({ error: 'Device not found' })
    }

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, Actor || normalizedCode || 'DEVICE_CLIENT'),
      action: 'DEVICE_HEARTBEAT',
      tableName: 'Devices',
      recordID: device.DeviceID,
      afterJson: JSON.stringify({ LastSeenAt: device.LastSeenAt }),
      deviceID: device.DeviceID,
      ipAddress: req.ip
    })

    return res.json({ success: true, serverTime: new Date().toISOString(), device })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/devices/heartbeat-batch', async (req, res) => {
  const deviceIds = Array.isArray(req.body?.deviceIds) ? req.body.deviceIds : []
  const actor = req.body?.actor || 'UI_DEVICES'
  if (!deviceIds.length) return res.status(400).json({ error: 'deviceIds is required' })
  if (deviceIds.length > 500) return res.status(413).json({ error: 'Too many deviceIds (max 500).' })

  try {
    const pool = await getPool()
    const request = pool.request()

    const params = []
    deviceIds.forEach((id, idx) => {
      const key = `DeviceID${idx}`
      params.push(`@${key}`)
      request.input(key, sql.NVarChar(36), String(id))
    })

    const updated = await request.query(`
      UPDATE dbo.Devices
      SET LastSeenAt = GETDATE(), UpdatedAt = GETDATE()
      WHERE DeviceID IN (${params.join(',')});
      SELECT @@ROWCOUNT AS Updated;
    `)

    try {
      await writeAuditLog(pool, {
        actor: resolveAuditActor(req, actor),
        action: 'DEVICE_HEARTBEAT_BATCH',
        tableName: 'Devices',
        recordID: null,
        afterJson: JSON.stringify({ deviceIds, updated: updated.recordset?.[0]?.Updated ?? null }),
        deviceID: null,
        ipAddress: req.ip
      })
    } catch (_) {}

    return res.json({ success: true, updated: updated.recordset?.[0]?.Updated ?? 0, serverTime: new Date().toISOString() })
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/devices/export-logs', async (req, res) => {
  const { DeviceCode, From, To } = req.body || {}
  const normalizedCode = String(DeviceCode || '').trim()
  if (!normalizedCode) return res.status(400).json({ error: 'DeviceCode is required' })

  const parseDate = (v) => {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const fromDate = parseDate(From)
  const toDate = parseDate(To)

  try {
    const pool = await getPool()

    const dev = await pool.request()
      .input('DeviceCode', sql.NVarChar(100), normalizedCode)
      .query('SELECT TOP 1 DeviceID, DeviceCode, DeviceName FROM dbo.Devices WHERE DeviceCode=@DeviceCode')

    const device = dev.recordset[0]
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const request = pool.request()
    request.input('DeviceID', sql.NVarChar(36), device.DeviceID)
    request.input('From', sql.DateTime, fromDate || null)
    request.input('To', sql.DateTime, toDate || null)

    const q = `
      SELECT
        bs.ScanTime,
        e.EmployeeCode,
        CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
        d.DeviceCode,
        d.DeviceName,
        bs.ScanType,
        bs.AuthenticationMethod,
        bs.MatchScore,
        bs.ScanResult,
        bs.IsSuccessful,
        bs.FailureReason
      FROM dbo.BiometricScans bs
      LEFT JOIN dbo.Employees e ON e.EmployeeID = bs.EmployeeID
      LEFT JOIN dbo.Devices d ON d.DeviceID = bs.DeviceID
      WHERE bs.DeviceID=@DeviceID
        AND (@From IS NULL OR bs.ScanTime >= @From)
        AND (@To IS NULL OR bs.ScanTime <= @To)
      ORDER BY bs.ScanTime DESC
    `

    const result = await request.query(q)
    const rows = result.recordset || []

    const csvEscape = (val) => {
      if (val === null || val === undefined) return ''
      const s = String(val)
      if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
      return s
    }

    const header = [
      'ScanTime',
      'EmployeeCode',
      'EmployeeName',
      'DeviceCode',
      'DeviceName',
      'ScanType',
      'AuthenticationMethod',
      'MatchScore',
      'ScanResult',
      'IsSuccessful',
      'FailureReason'
    ]

    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push([
        r.ScanTime ? new Date(r.ScanTime).toISOString() : '',
        r.EmployeeCode || '',
        r.EmployeeName || '',
        r.DeviceCode || '',
        r.DeviceName || '',
        r.ScanType || '',
        r.AuthenticationMethod || '',
        r.MatchScore ?? '',
        r.ScanResult || '',
        r.IsSuccessful ? 'true' : 'false',
        r.FailureReason || ''
      ].map(csvEscape).join(','))
    }

    const nowStamp = new Date().toISOString().replace(/[:.]/g, '-')
    const safeCode = normalizedCode.replace(/[^a-zA-Z0-9_-]/g, '_')
    const filename = `device-${safeCode}-logs-${nowStamp}.csv`

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, normalizedCode),
      action: 'EXPORT_DEVICE_LOGS',
      tableName: 'BiometricScans',
      recordID: device.DeviceID,
      afterJson: JSON.stringify({ deviceCode: normalizedCode, rows: rows.length }),
      deviceID: device.DeviceID,
      ipAddress: req.ip
    })

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.send(lines.join('\r\n'))
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.post('/devices/import-attendance-csv', async (req, res) => {
  const { DeviceCode, CsvText, CreateMissingEmployees, OverwriteExisting } = req.body || {}
  const normalizedCode = String(DeviceCode || '').trim()
  const csvText = typeof CsvText === 'string' ? CsvText : ''
  const createMissingEmployees = CreateMissingEmployees === true
  const overwriteExisting = OverwriteExisting === true

  if (!normalizedCode) return res.status(400).json({ error: 'DeviceCode is required' })
  if (!csvText || csvText.length < 5) return res.status(400).json({ error: 'CsvText is required' })
  if (csvText.length > 10_000_000) return res.status(413).json({ error: 'CSV payload too large (max 10MB).' })

  let transaction = null

  try {
    const pool = await getPool()

    const dev = await pool.request()
      .input('DeviceCode', sql.NVarChar(100), normalizedCode)
      .query('SELECT TOP 1 DeviceID, DeviceCode, DeviceName FROM dbo.Devices WHERE DeviceCode=@DeviceCode')

    const device = dev.recordset[0]
    if (!device) return res.status(404).json({ error: 'Device not found' })

    const allRows = parseCsvRows(csvText)
    if (allRows.length < 2) return res.status(400).json({ error: 'CSV contains no data rows.' })

    const header = allRows[0].map(normalizeHeaderName)
    const findIndex = (candidates) => {
      for (const n of candidates) {
        const i = header.indexOf(normalizeHeaderName(n))
        if (i >= 0) return i
      }
      return -1
    }

    const staffIdx = findIndex(['staff code', 'staffcode', 'staff'])
    const userIdx = findIndex(['user id', 'userid', 'user'])
    const nameIdx = findIndex(['name', 'employee name', 'emp name'])
    const deptIdx = findIndex(['department', 'dept'])
    const dateIdx = findIndex(['date', 'sign date', 'signdate'])
    const timeIdx = findIndex(['time', 'sign time', 'signtime'])
    const machineIdx = findIndex(['machine id', 'machineid'])

    if (staffIdx < 0 || dateIdx < 0 || timeIdx < 0) {
      return res.status(400).json({
        error: 'CSV header is missing required columns. Required: Staff Code, Date, Time.'
      })
    }

    const parsed = []
    for (let r = 1; r < allRows.length; r++) {
      const line = allRows[r]
      if (!line || !line.length) continue

      const staffCodeRaw = String(line[staffIdx] ?? '').trim()
      if (!staffCodeRaw) continue

      const dateIso = parseMmDdYyyyToIso(line[dateIdx] ?? '')
      const timeHms = parseCsvTimeToHms(line[timeIdx] ?? '')
      if (!dateIso || !timeHms) continue

      parsed.push({
        staffCodeRaw,
        staffCodeNormalized: normalizeNumericCode(staffCodeRaw),
        userIdRaw: userIdx >= 0 ? String(line[userIdx] ?? '').trim() : '',
        rawName: nameIdx >= 0 ? String(line[nameIdx] ?? '').trim() : '',
        department: deptIdx >= 0 ? String(line[deptIdx] ?? '').trim() : '',
        machineId: machineIdx >= 0 ? Number.parseInt(String(line[machineIdx] ?? '').trim(), 10) : null,
        dateIso,
        timeHms,
        eventTimeText: `${dateIso} ${timeHms}`
      })
    }

    if (!parsed.length) {
      return res.status(400).json({ error: 'No valid rows found. Ensure Date is MM/dd/yyyy and Time is HH:mm[:ss].' })
    }
    if (parsed.length > 50_000) return res.status(413).json({ error: 'Too many rows (max 50,000 per import).' })

    const empRes = await pool.request().query('SELECT EmployeeID, EmployeeCode, BiometricStaffCode, BiometricUserID, FirstName, LastName, Department FROM dbo.Employees')
    const employeeByIdentifier = new Map()
    const addKey = (key, employee) => {
      const k = String(key || '').trim()
      if (!k) return
      if (!employeeByIdentifier.has(k)) employeeByIdentifier.set(k, employee)
    }
    for (const e of empRes.recordset || []) {
      addKey(e.EmployeeCode, e)
      addKey(normalizeNumericCode(e.EmployeeCode), e)
      addKey(e.BiometricStaffCode, e)
      addKey(normalizeNumericCode(e.BiometricStaffCode), e)
      addKey(e.BiometricUserID, e)
      addKey(normalizeNumericCode(e.BiometricUserID), e)
    }

    transaction = new sql.Transaction(pool)
    await transaction.begin()

    let insertedEvents = 0
    let duplicateEvents = 0
    let unknownEmployees = 0
    let createdEmployees = 0

    const resolveEmployee = async (p) => {
      const variants = []
      if (p.staffCodeRaw) variants.push(p.staffCodeRaw)
      if (p.staffCodeNormalized) variants.push(p.staffCodeNormalized)
      if (p.userIdRaw) variants.push(p.userIdRaw)
      if (p.userIdRaw) variants.push(normalizeNumericCode(p.userIdRaw))

      for (const code of variants) {
        if (employeeByIdentifier.has(code)) return employeeByIdentifier.get(code)
      }

      if (!createMissingEmployees) return null

      const staffCodeForCreate = String(p.staffCodeRaw || p.staffCodeNormalized).trim()
      if (!staffCodeForCreate) return null

      const { firstName, lastName } = splitName(p.rawName || '')
      const safeFirst = firstName || 'Unknown'
      const safeLast = lastName || staffCodeForCreate

      const insertReq = new sql.Request(transaction)
      insertReq.input('EmployeeID', sql.NVarChar(36), require('crypto').randomUUID())
      insertReq.input('EmployeeCode', sql.NVarChar(50), staffCodeForCreate)
      insertReq.input('FirstName', sql.NVarChar(100), safeFirst)
      insertReq.input('LastName', sql.NVarChar(100), safeLast)
      insertReq.input('Department', sql.NVarChar(100), p.department || null)
      insertReq.input('BiometricStaffCode', sql.NVarChar(50), staffCodeForCreate)
      insertReq.input('BiometricUserID', sql.NVarChar(50), p.userIdRaw ? String(p.userIdRaw).trim() : null)
      insertReq.input('HireDate', sql.Date, new Date())
      insertReq.input('EmploymentStatus', sql.NVarChar(50), 'Active')

      try {
        const inserted = await insertReq.query(`
          INSERT INTO dbo.Employees (EmployeeID, EmployeeCode, FirstName, LastName, Department, BiometricStaffCode, BiometricUserID, HireDate, EmploymentStatus)
          OUTPUT INSERTED.EmployeeID, INSERTED.EmployeeCode, INSERTED.BiometricStaffCode, INSERTED.BiometricUserID, INSERTED.FirstName, INSERTED.LastName, INSERTED.Department
          VALUES (@EmployeeID, @EmployeeCode, @FirstName, @LastName, @Department, @BiometricStaffCode, @BiometricUserID, @HireDate, @EmploymentStatus)
        `)
        const e = inserted.recordset[0] || null
        if (e) {
          createdEmployees++
          addKey(e.EmployeeCode, e)
          addKey(normalizeNumericCode(e.EmployeeCode), e)
          addKey(e.BiometricStaffCode, e)
          addKey(normalizeNumericCode(e.BiometricStaffCode), e)
          addKey(e.BiometricUserID, e)
          addKey(normalizeNumericCode(e.BiometricUserID), e)
          return e
        }
      } catch (err) {
        const existing =
          employeeByIdentifier.get(staffCodeForCreate) ||
          employeeByIdentifier.get(normalizeNumericCode(staffCodeForCreate)) ||
          (p.userIdRaw ? employeeByIdentifier.get(String(p.userIdRaw).trim()) : null) ||
          (p.userIdRaw ? employeeByIdentifier.get(normalizeNumericCode(p.userIdRaw)) : null) ||
          null
        if (existing) return existing
        throw err
      }

      return null
    }

    const timesByEmployeeDate = new Map()

    for (const p of parsed) {
      const employee = await resolveEmployee(p)
      let employeeID = employee?.EmployeeID || null
      if (!employeeID) unknownEmployees++

      const staffCodeToStore = String(p.staffCodeRaw).trim()
      const userIdToStore = p.userIdRaw ? String(p.userIdRaw).trim() : null

      if (employeeID && (staffCodeToStore || userIdToStore)) {
        const updReq = new sql.Request(transaction)
        updReq.input('EmployeeID', sql.NVarChar(36), employeeID)
        updReq.input('StaffCode', sql.NVarChar(50), staffCodeToStore || null)
        updReq.input('UserID', sql.NVarChar(50), userIdToStore || null)
        updReq.input('Department', sql.NVarChar(100), p.department || null)
        await updReq.query(`
          UPDATE dbo.Employees
          SET
            BiometricStaffCode = CASE WHEN (BiometricStaffCode IS NULL OR LTRIM(RTRIM(BiometricStaffCode))='') AND @StaffCode IS NOT NULL THEN @StaffCode ELSE BiometricStaffCode END,
            BiometricUserID = CASE WHEN (BiometricUserID IS NULL OR LTRIM(RTRIM(BiometricUserID))='') AND @UserID IS NOT NULL THEN @UserID ELSE BiometricUserID END,
            Department = CASE WHEN (Department IS NULL OR LTRIM(RTRIM(Department))='') AND @Department IS NOT NULL THEN @Department ELSE Department END
          WHERE EmployeeID=@EmployeeID
        `)
      }

      const insertEventReq = new sql.Request(transaction)
      insertEventReq.input('DeviceID', sql.NVarChar(36), device.DeviceID)
      insertEventReq.input('EmployeeID', sql.NVarChar(36), employeeID)
      insertEventReq.input('StaffCode', sql.NVarChar(50), staffCodeToStore)
      insertEventReq.input('UserID', sql.NVarChar(50), userIdToStore)
      insertEventReq.input('RawName', sql.NVarChar(200), p.rawName || null)
      insertEventReq.input('Department', sql.NVarChar(100), p.department || null)
      insertEventReq.input('MachineID', sql.Int, Number.isInteger(p.machineId) ? p.machineId : null)
      insertEventReq.input('EventTimeText', sql.NVarChar(19), p.eventTimeText)

      const eventInsert = await insertEventReq.query(`
        IF NOT EXISTS (
          SELECT 1 FROM dbo.DeviceAttendanceEvents
          WHERE DeviceID=@DeviceID AND StaffCode=@StaffCode
            AND EventTime = CONVERT(DATETIME, @EventTimeText, 120)
        )
        BEGIN
          INSERT INTO dbo.DeviceAttendanceEvents
            (DeviceID, EmployeeID, StaffCode, UserID, RawName, Department, MachineID, EventTime, Source)
          VALUES
            (@DeviceID, @EmployeeID, @StaffCode, @UserID, @RawName, @Department, @MachineID, CONVERT(DATETIME, @EventTimeText, 120), 'CSV_IMPORT');
          SELECT 1 AS inserted;
        END
        ELSE
        BEGIN
          SELECT 0 AS inserted;
        END
      `)

      const inserted = eventInsert.recordset?.[0]?.inserted === 1
      if (inserted) insertedEvents++
      else duplicateEvents++

      if (employeeID) {
        const key = `${employeeID}|${p.dateIso}`
        if (!timesByEmployeeDate.has(key)) timesByEmployeeDate.set(key, new Set())
        timesByEmployeeDate.get(key).add(p.timeHms)
      }
    }

    let attendanceGroupsTouched = 0
    for (const [key, timesSet] of timesByEmployeeDate.entries()) {
      const [employeeID, dateIso] = key.split('|')
      const times = Array.from(timesSet).sort()
      if (!times.length) continue

      const [t1, t2, t3, t4] = times.slice(0, 4)

      const upReq = new sql.Request(transaction)
      upReq.input('EmployeeID', sql.NVarChar(36), employeeID)
      upReq.input('AttendanceDate', sql.NVarChar(10), dateIso)
      upReq.input('MorningIn', sql.NVarChar(8), t1 || null)
      upReq.input('MorningOut', sql.NVarChar(8), t2 || null)
      upReq.input('AfternoonIn', sql.NVarChar(8), t3 || null)
      upReq.input('AfternoonOut', sql.NVarChar(8), t4 || null)
      upReq.input('Overwrite', sql.Bit, overwriteExisting ? 1 : 0)

      await upReq.query(`
        DECLARE @D DATE = CONVERT(date, @AttendanceDate, 23);
        IF NOT EXISTS (SELECT 1 FROM dbo.AttendanceRecords WHERE EmployeeID=@EmployeeID AND AttendanceDate=@D)
        BEGIN
          INSERT INTO dbo.AttendanceRecords(EmployeeID, AttendanceDate) VALUES(@EmployeeID, @D);
        END

        UPDATE dbo.AttendanceRecords
        SET
          MorningTimeIn = CASE
            WHEN @Overwrite=1 AND @MorningIn IS NOT NULL THEN CONVERT(time(7), @MorningIn, 108)
            WHEN @Overwrite=0 AND MorningTimeIn IS NULL AND @MorningIn IS NOT NULL THEN CONVERT(time(7), @MorningIn, 108)
            ELSE MorningTimeIn
          END,
          MorningTimeOut = CASE
            WHEN @Overwrite=1 AND @MorningOut IS NOT NULL THEN CONVERT(time(7), @MorningOut, 108)
            WHEN @Overwrite=0 AND MorningTimeOut IS NULL AND @MorningOut IS NOT NULL THEN CONVERT(time(7), @MorningOut, 108)
            ELSE MorningTimeOut
          END,
          AfternoonTimeIn = CASE
            WHEN @Overwrite=1 AND @AfternoonIn IS NOT NULL THEN CONVERT(time(7), @AfternoonIn, 108)
            WHEN @Overwrite=0 AND AfternoonTimeIn IS NULL AND @AfternoonIn IS NOT NULL THEN CONVERT(time(7), @AfternoonIn, 108)
            ELSE AfternoonTimeIn
          END,
          AfternoonTimeOut = CASE
            WHEN @Overwrite=1 AND @AfternoonOut IS NOT NULL THEN CONVERT(time(7), @AfternoonOut, 108)
            WHEN @Overwrite=0 AND AfternoonTimeOut IS NULL AND @AfternoonOut IS NOT NULL THEN CONVERT(time(7), @AfternoonOut, 108)
            ELSE AfternoonTimeOut
          END
        WHERE EmployeeID=@EmployeeID AND AttendanceDate=@D;
      `)

      attendanceGroupsTouched++
    }

    await transaction.commit()

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, normalizedCode),
      action: 'IMPORT_DEVICE_ATTENDANCE_CSV',
      tableName: 'DeviceAttendanceEvents',
      recordID: device.DeviceID,
      afterJson: JSON.stringify({
        deviceCode: normalizedCode,
        totalRows: allRows.length - 1,
        parsedRows: parsed.length,
        insertedEvents,
        duplicateEvents,
        createdEmployees,
        unknownEmployees,
        attendanceGroupsTouched,
        overwriteExisting
      }),
      deviceID: device.DeviceID,
      ipAddress: req.ip
    })

    return res.json({
      success: true,
      deviceCode: normalizedCode,
      totalRows: allRows.length - 1,
      parsedRows: parsed.length,
      insertedEvents,
      duplicateEvents,
      createdEmployees,
      unknownEmployees,
      attendanceGroupsTouched,
      overwriteExisting
    })
  } catch (err) {
    try {
      if (transaction) await transaction.rollback()
    } catch (_) {}
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/device-attendance-events', async (req, res) => {
  const deviceCode = String(req.query?.deviceCode || '').trim() || null
  const topRaw = Number.parseInt(String(req.query?.top || '').trim(), 10)
  const top = Number.isInteger(topRaw) && topRaw > 0 ? Math.min(topRaw, 5000) : 500

  const parseDate = (v) => {
    if (!v) return null
    const d = v instanceof Date ? v : new Date(String(v))
    return Number.isNaN(d.getTime()) ? null : d
  }

  const fromDate = parseDate(req.query?.from || null)
  const toDate = parseDate(req.query?.to || null)
  if ((req.query?.from && !fromDate) || (req.query?.to && !toDate)) {
    return res.status(400).json({ error: 'Invalid from/to date. Use YYYY-MM-DD or ISO.' })
  }

  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('DeviceCode', sql.NVarChar(100), deviceCode)
    request.input('From', sql.DateTime, fromDate)
    request.input('To', sql.DateTime, toDate)

    const q = `
      SELECT TOP (${top})
        dae.DeviceAttendanceEventID,
        dae.EventTime,
        dae.StaffCode,
        dae.UserID,
        dae.RawName,
        dae.Department,
        dae.MachineID,
        dae.Source,
        dae.ImportedAt,
        d.DeviceCode,
        d.DeviceName,
        e.EmployeeCode,
        CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName
      FROM dbo.DeviceAttendanceEvents dae
      LEFT JOIN dbo.Devices d ON d.DeviceID = dae.DeviceID
      LEFT JOIN dbo.Employees e ON
        e.EmployeeID = dae.EmployeeID OR (
          dae.EmployeeID IS NULL AND (
            e.BiometricStaffCode = dae.StaffCode OR
            e.BiometricUserID = dae.UserID OR
            e.EmployeeCode = dae.StaffCode
          )
        )
      WHERE (@DeviceCode IS NULL OR d.DeviceCode = @DeviceCode)
        AND (@From IS NULL OR dae.EventTime >= @From)
        AND (@To IS NULL OR dae.EventTime <= @To)
      ORDER BY dae.EventTime DESC, dae.ImportedAt DESC
    `

    const result = await request.query(q)
    return res.json(result.recordset || [])
  } catch (err) {
    console.error(err)
    return res.status(500).json({ error: err.message })
  }
})

app.get('/biometric-scans', async (req, res) => {
  try {
    const pool = await getPool()
    const q = `SELECT
      bs.BiometricScanID,
      bs.EmployeeID,
      e.EmployeeCode,
      CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
      bs.DeviceID,
      d.DeviceCode,
      d.DeviceName,
      bs.ScanTime,
      bs.ScanType,
      bs.AuthenticationMethod,
      bs.MatchScore,
      bs.ScanResult,
      bs.IsSuccessful,
      bs.FailureReason,
      bs.RawImageRef,
      bs.LivenessScore,
      bs.Latitude,
      bs.Longitude
      FROM dbo.BiometricScans bs
      LEFT JOIN dbo.Employees e ON e.EmployeeID = bs.EmployeeID
      LEFT JOIN dbo.Devices d ON d.DeviceID = bs.DeviceID
      ORDER BY bs.ScanTime DESC`
    const result = await pool.request().query(q)
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/login-legacy2', (req, res) => {
  const { username, password } = req.body || {}
  if (username === 'admin' && password === 'admin') {
    const token = Buffer.from(`${username}:${Date.now()}`).toString('base64')
    return res.json({ success: true, token, user: { username: 'admin', role: 'admin' } })
  }
  return res.status(401).json({ error: 'Invalid credentials' })
})


app.post('/biometric-scans', async (req, res) => {
  const {
    EmployeeID,
    EmployeeCode,
    DeviceID,
    DeviceCode,
    ScanType,
    AuthenticationMethod,
    MatchScore,
    ScanResult,
    IsSuccessful,
    FailureReason,
    RawImageRef,
    LivenessScore,
    Latitude,
    Longitude,
    Actor
  } = req.body || {}

  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')

    let resolvedEmployeeID = EmployeeID || null
    if (!resolvedEmployeeID && EmployeeCode) {
      const emp = await pool.request()
        .input('EmployeeCode', sql.NVarChar(50), EmployeeCode)
        .query('SELECT EmployeeID FROM dbo.Employees WHERE EmployeeCode=@EmployeeCode')
      resolvedEmployeeID = emp.recordset[0]?.EmployeeID || null
    }

    let resolvedDeviceID = DeviceID || null
    if (!resolvedDeviceID && DeviceCode) {
      const dev = await pool.request()
        .input('DeviceCode', sql.NVarChar(100), DeviceCode)
        .query('SELECT DeviceID FROM dbo.Devices WHERE DeviceCode=@DeviceCode')
      resolvedDeviceID = dev.recordset[0]?.DeviceID || null
    }

    const reqInsert = pool.request()
    reqInsert.input('BiometricScanID', sql.NVarChar(36), randomUUID())
    reqInsert.input('EmployeeID', sql.NVarChar(36), resolvedEmployeeID)
    reqInsert.input('DeviceID', sql.NVarChar(36), resolvedDeviceID)
    reqInsert.input('ScanType', sql.NVarChar(50), ScanType || 'FACE')
    reqInsert.input('AuthenticationMethod', sql.NVarChar(50), AuthenticationMethod || 'FACE_MATCH')
    reqInsert.input('MatchScore', sql.Decimal(5, 2), MatchScore ?? null)
    reqInsert.input('ScanResult', sql.NVarChar(30), ScanResult || ((IsSuccessful === false || FailureReason) ? 'FAILED' : 'SUCCESS'))
    reqInsert.input('IsSuccessful', sql.Bit, IsSuccessful === undefined ? !(FailureReason) : !!IsSuccessful)
    reqInsert.input('FailureReason', sql.NVarChar(255), FailureReason || null)
    reqInsert.input('RawImageRef', sql.NVarChar(500), RawImageRef || null)
    reqInsert.input('LivenessScore', sql.Decimal(5, 2), LivenessScore ?? null)
    reqInsert.input('Latitude', sql.Decimal(10, 7), Latitude ?? null)
    reqInsert.input('Longitude', sql.Decimal(10, 7), Longitude ?? null)
    const q = `
      INSERT INTO dbo.BiometricScans
      (BiometricScanID, EmployeeID, DeviceID, ScanType, AuthenticationMethod, MatchScore, ScanResult, IsSuccessful, FailureReason, RawImageRef, LivenessScore, Latitude, Longitude)
      OUTPUT INSERTED.*
      VALUES
      (@BiometricScanID, @EmployeeID, @DeviceID, @ScanType, @AuthenticationMethod, @MatchScore, @ScanResult, @IsSuccessful, @FailureReason, @RawImageRef, @LivenessScore, @Latitude, @Longitude)
    `
    const inserted = await reqInsert.query(q)
    const created = inserted.recordset[0]

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, Actor || 'SCANNER'),
      action: 'BIOMETRIC_SCAN',
      tableName: 'BiometricScans',
      recordID: created.BiometricScanID,
      afterJson: JSON.stringify(created),
      deviceID: resolvedDeviceID,
      ipAddress: req.ip
    })

    res.json(created)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/audit-logs', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool()
    const q = `SELECT AuditLogID, Actor, Action, TableName, RecordID, BeforeJson, AfterJson, DeviceID, IPAddress, CreatedAt
      FROM dbo.AuditLogs
      ORDER BY CreatedAt DESC`
    const result = await pool.request().query(q)
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/audit-logs', requireAdmin, async (req, res) => {
  const { Actor, Action, TableName, RecordID, BeforeJson, AfterJson, DeviceID, IPAddress } = req.body || {}
  if (!Action || !TableName) {
    return res.status(400).json({ error: 'Action and TableName are required' })
  }
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const insert = await pool.request()
      .input('AuditLogID', sql.NVarChar(36), randomUUID())
      .input('Actor', sql.NVarChar(100), resolveAuditActor(req, Actor || null))
      .input('Action', sql.NVarChar(100), Action)
      .input('TableName', sql.NVarChar(128), TableName)
      .input('RecordID', sql.NVarChar(100), RecordID || null)
      .input('BeforeJson', sql.NVarChar(sql.MAX), BeforeJson || null)
      .input('AfterJson', sql.NVarChar(sql.MAX), AfterJson || null)
      .input('DeviceID', sql.NVarChar(36), DeviceID || null)
      .input('IPAddress', sql.NVarChar(64), IPAddress || req.ip || null)
      .query(`
        INSERT INTO dbo.AuditLogs
        (AuditLogID, Actor, Action, TableName, RecordID, BeforeJson, AfterJson, DeviceID, IPAddress)
        OUTPUT INSERTED.*
        VALUES
        (@AuditLogID, @Actor, @Action, @TableName, @RecordID, @BeforeJson, @AfterJson, @DeviceID, @IPAddress)
      `)
    res.json(insert.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

function normalizeSpecialDayType(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const normalized = raw
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase()

  if (normalized === 'REGULAR_HOLIDAY') return 'HOLIDAY'
  if (normalized === 'SPECIAL' || normalized === 'SPECIAL_DAY' || normalized === 'SPECIAL_NONWORKING' || normalized === 'SPECIAL_NON_WORKING_DAY') {
    return 'SPECIAL_NON_WORKING'
  }
  return normalized
}

function isValidIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeOvertimeType(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'REGULAR'
  return raw
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase()
}

function normalizeLeaveType(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'LEAVE'
  return raw
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase()
}

function normalizeLeaveUnitType(value) {
  const raw = String(value || '').trim()
  if (!raw) return 'FULL_DAY'

  const normalized = raw
    .replace(/\s+/g, '_')
    .replace(/-+/g, '_')
    .toUpperCase()

  if (normalized === 'FULL' || normalized === 'FULLDAY') return 'FULL_DAY'
  if (normalized === 'AM_HALF') return 'HALF_DAY_AM'
  if (normalized === 'PM_HALF') return 'HALF_DAY_PM'
  return normalized
}

function parseOptionalTimeValue(value, fieldName) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const parsed = parseTimeString(raw)
  if (!parsed) throw new Error(`${fieldName} must be a valid time`)
  return parsed
}

function timeLiteralToMinutes(value) {
  const parsed = parseTimeString(value)
  if (!parsed) return null
  const parts = parsed.split(':')
  const hh = Number(parts[0] || 0)
  const mm = Number(parts[1] || 0)
  return hh * 60 + mm
}

function computeMinutesBetweenTimes(startTime, endTime) {
  if (!startTime || !endTime) return null
  const startMinutes = timeLiteralToMinutes(startTime)
  const endMinutes = timeLiteralToMinutes(endTime)
  if (startMinutes == null || endMinutes == null) return null
  const diff = endMinutes - startMinutes
  if (diff <= 0) return null
  return diff
}

function resolveApprovedMinutes({
  approvedMinutes,
  approvedHours,
  startTime,
  endTime
}) {
  if (approvedMinutes !== undefined && approvedMinutes !== null && String(approvedMinutes).trim() !== '') {
    const numeric = Number(approvedMinutes)
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error('ApprovedMinutes must be a non-negative number')
    }
    return Math.round(numeric)
  }

  if (approvedHours !== undefined && approvedHours !== null && String(approvedHours).trim() !== '') {
    const numeric = Number(approvedHours)
    if (!Number.isFinite(numeric) || numeric < 0) {
      throw new Error('ApprovedHours must be a non-negative number')
    }
    return Math.round(numeric * 60)
  }

  if ((startTime && !endTime) || (!startTime && endTime)) {
    throw new Error('StartTime and EndTime must both be provided')
  }

  const computed = computeMinutesBetweenTimes(startTime, endTime)
  if (startTime && endTime && computed == null) {
    throw new Error('EndTime must be later than StartTime')
  }

  return computed
}

async function ensureEmployeeExists(pool, employeeId) {
  const result = await pool.request()
    .input('EmployeeID', sql.NVarChar(36), employeeId)
    .query('SELECT TOP 1 EmployeeID FROM dbo.Employees WHERE EmployeeID=@EmployeeID')

  return Boolean(result.recordset?.length)
}

const overtimeEntrySelectSql = `
  SELECT
    ot.OvertimeEntryID,
    ot.EmployeeID,
    e.EmployeeCode,
    CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName,
    e.Department,
    CONVERT(varchar(10), ot.OvertimeDate, 23) AS OvertimeDate,
    CONVERT(varchar(5), ot.StartTime, 108) AS StartTime,
    CONVERT(varchar(5), ot.EndTime, 108) AS EndTime,
    ot.ApprovedMinutes,
    CAST(CAST(ISNULL(ot.ApprovedMinutes, 0) AS DECIMAL(10, 2)) / 60.0 AS DECIMAL(10, 2)) AS ApprovedHours,
    ot.OvertimeType,
    ot.Reason,
    ot.Status,
    ot.CreatedByUserID,
    ot.UpdatedByUserID,
    ot.CreatedAt,
    ot.UpdatedAt
  FROM dbo.AdminOvertimeEntries ot
  JOIN dbo.Employees e ON e.EmployeeID = ot.EmployeeID
`

const leaveEntrySelectSql = `
  SELECT
    le.LeaveEntryID,
    le.EmployeeID,
    e.EmployeeCode,
    CONCAT(e.FirstName, ' ', e.LastName) AS EmployeeName,
    e.Department,
    CONVERT(varchar(10), le.LeaveStartDate, 23) AS LeaveStartDate,
    CONVERT(varchar(10), le.LeaveEndDate, 23) AS LeaveEndDate,
    le.LeaveType,
    le.LeaveUnitType,
    CONVERT(varchar(5), le.StartTime, 108) AS StartTime,
    CONVERT(varchar(5), le.EndTime, 108) AS EndTime,
    le.ApprovedMinutes,
    CAST(CAST(ISNULL(le.ApprovedMinutes, 0) AS DECIMAL(10, 2)) / 60.0 AS DECIMAL(10, 2)) AS ApprovedHours,
    le.Reason,
    le.Status,
    le.CreatedByUserID,
    le.UpdatedByUserID,
    le.CreatedAt,
    le.UpdatedAt
  FROM dbo.AdminLeaveEntries le
  JOIN dbo.Employees e ON e.EmployeeID = le.EmployeeID
`

async function fetchOvertimeEntryById(pool, entryId) {
  const result = await pool.request()
    .input('OvertimeEntryID', sql.NVarChar(36), entryId)
    .query(`
      ${overtimeEntrySelectSql}
      WHERE ot.OvertimeEntryID=@OvertimeEntryID
    `)

  return result.recordset?.[0] || null
}

async function fetchLeaveEntryById(pool, entryId) {
  const result = await pool.request()
    .input('LeaveEntryID', sql.NVarChar(36), entryId)
    .query(`
      ${leaveEntrySelectSql}
      WHERE le.LeaveEntryID=@LeaveEntryID
    `)

  return result.recordset?.[0] || null
}

app.get('/special-days', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query(`
      SELECT
        SpecialDayID,
        CONVERT(varchar(10), SpecialDate, 23) AS SpecialDate,
        DayType,
        Description,
        CreatedAt,
        UpdatedAt
      FROM dbo.SpecialDays
      ORDER BY SpecialDate DESC, DayType ASC
    `)
    res.json(result.recordset)
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('invalid object name') && msg.toLowerCase().includes('specialdays')) {
      return res.status(503).json({ error: 'SpecialDays table is not initialized yet. Restart the backend server to run migrations.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.post('/special-days', requireAdmin, async (req, res) => {
  const SpecialDate = String(req.body?.SpecialDate || req.body?.specialDate || '').trim()
  const DayType = normalizeSpecialDayType(req.body?.DayType || req.body?.dayType)
  const Description = (req.body?.Description ?? req.body?.description ?? null)
  if (!isValidIsoDate(SpecialDate)) return res.status(400).json({ error: 'SpecialDate is required (YYYY-MM-DD)' })
  if (!DayType) return res.status(400).json({ error: 'DayType is required (e.g. HOLIDAY, SPECIAL_NON_WORKING, REST_DAY, HALF_DAY_AM, HALF_DAY_PM)' })

  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const id = randomUUID()
    const insert = await pool.request()
      .input('SpecialDayID', sql.NVarChar(36), id)
      .input('SpecialDate', sql.Date, SpecialDate)
      .input('DayType', sql.NVarChar(50), DayType)
      .input('Description', sql.NVarChar(255), Description ? String(Description) : null)
      .query(`
        INSERT INTO dbo.SpecialDays (SpecialDayID, SpecialDate, DayType, Description)
        OUTPUT INSERTED.SpecialDayID,
               CONVERT(varchar(10), INSERTED.SpecialDate, 23) AS SpecialDate,
               INSERTED.DayType,
               INSERTED.Description,
               INSERTED.CreatedAt,
               INSERTED.UpdatedAt
        VALUES (@SpecialDayID, @SpecialDate, @DayType, @Description)
      `)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'CREATE',
      tableName: 'SpecialDays',
      recordID: id,
      afterJson: JSON.stringify(insert.recordset?.[0] || {})
    })

    res.json(insert.recordset[0])
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('cannot insert duplicate key') || msg.toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Special day already exists for that date/type.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.put('/special-days/:id', requireAdmin, async (req, res) => {
  const id = String(req.params?.id || '').trim()
  if (!id) return res.status(400).json({ error: 'SpecialDayID is required' })

  const SpecialDate = req.body?.SpecialDate !== undefined ? String(req.body?.SpecialDate || '').trim() : null
  const DayType = req.body?.DayType !== undefined ? normalizeSpecialDayType(req.body?.DayType) : null
  const Description = req.body?.Description !== undefined ? (req.body?.Description ?? null) : undefined

  if (SpecialDate !== null && !isValidIsoDate(SpecialDate)) return res.status(400).json({ error: 'SpecialDate must be YYYY-MM-DD' })

  try {
    const pool = await getPool()
    const before = await pool.request().input('SpecialDayID', sql.NVarChar(36), id).query(`
      SELECT TOP 1 SpecialDayID, CONVERT(varchar(10), SpecialDate, 23) AS SpecialDate, DayType, Description
      FROM dbo.SpecialDays WHERE SpecialDayID=@SpecialDayID
    `)
    if (!before.recordset?.length) return res.status(404).json({ error: 'Not found' })

    const req0 = pool.request().input('SpecialDayID', sql.NVarChar(36), id)
    if (SpecialDate !== null) req0.input('SpecialDate', sql.Date, SpecialDate || null)
    if (DayType !== null) req0.input('DayType', sql.NVarChar(50), DayType || null)
    if (Description !== undefined) req0.input('Description', sql.NVarChar(255), Description ? String(Description) : null)

    const setParts = []
    if (SpecialDate !== null) setParts.push('SpecialDate=@SpecialDate')
    if (DayType !== null) setParts.push('DayType=@DayType')
    if (Description !== undefined) setParts.push('Description=@Description')
    setParts.push('UpdatedAt=GETDATE()')

    const updated = await req0.query(`
      UPDATE dbo.SpecialDays
      SET ${setParts.join(', ')}
      OUTPUT INSERTED.SpecialDayID,
             CONVERT(varchar(10), INSERTED.SpecialDate, 23) AS SpecialDate,
             INSERTED.DayType,
             INSERTED.Description,
             INSERTED.CreatedAt,
             INSERTED.UpdatedAt
      WHERE SpecialDayID=@SpecialDayID
    `)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'UPDATE',
      tableName: 'SpecialDays',
      recordID: id,
      beforeJson: JSON.stringify(before.recordset[0]),
      afterJson: JSON.stringify(updated.recordset?.[0] || {})
    })

    res.json(updated.recordset[0])
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('cannot insert duplicate key') || msg.toLowerCase().includes('unique')) {
      return res.status(409).json({ error: 'Special day already exists for that date/type.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.delete('/special-days/:id', requireAdmin, async (req, res) => {
  const id = String(req.params?.id || '').trim()
  if (!id) return res.status(400).json({ error: 'SpecialDayID is required' })

  try {
    const pool = await getPool()
    const before = await pool.request().input('SpecialDayID', sql.NVarChar(36), id).query(`
      SELECT TOP 1 SpecialDayID, CONVERT(varchar(10), SpecialDate, 23) AS SpecialDate, DayType, Description
      FROM dbo.SpecialDays WHERE SpecialDayID=@SpecialDayID
    `)
    const del = await pool.request().input('SpecialDayID', sql.NVarChar(36), id).query(`
      DELETE FROM dbo.SpecialDays WHERE SpecialDayID=@SpecialDayID
    `)
    if ((del.rowsAffected?.[0] || 0) === 0) return res.status(404).json({ error: 'Not found' })

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'DELETE',
      tableName: 'SpecialDays',
      recordID: id,
      beforeJson: JSON.stringify(before.recordset?.[0] || {})
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/overtime-entries', requireAdmin, async (req, res) => {
  const from = String(req.query?.from || '').trim()
  const to = String(req.query?.to || '').trim()
  const employeeId = String(req.query?.employeeId || '').trim()

  if (from && !isValidIsoDate(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' })
  if (to && !isValidIsoDate(to)) return res.status(400).json({ error: 'to must be YYYY-MM-DD' })

  try {
    const pool = await getPool()
    const request = pool.request()
      .input('FromDate', sql.Date, from || null)
      .input('ToDate', sql.Date, to || null)
      .input('EmployeeID', sql.NVarChar(36), employeeId || null)

    const result = await request.query(`
      ${overtimeEntrySelectSql}
      WHERE (@FromDate IS NULL OR ot.OvertimeDate >= @FromDate)
        AND (@ToDate IS NULL OR ot.OvertimeDate <= @ToDate)
        AND (@EmployeeID IS NULL OR ot.EmployeeID = @EmployeeID)
      ORDER BY ot.OvertimeDate DESC, EmployeeName ASC
    `)

    res.json(result.recordset || [])
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('invalid object name') && msg.toLowerCase().includes('adminovertimeentries')) {
      return res.status(503).json({ error: 'Overtime tables are not initialized yet. Restart the backend server to run migrations.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.post('/overtime-entries', requireAdmin, async (req, res) => {
  const employeeId = String(req.body?.EmployeeID || req.body?.employeeID || '').trim()
  const overtimeDate = String(req.body?.OvertimeDate || req.body?.overtimeDate || '').trim()
  const overtimeType = normalizeOvertimeType(req.body?.OvertimeType || req.body?.overtimeType)
  const reason = req.body?.Reason ?? req.body?.reason ?? null

  if (!employeeId) return res.status(400).json({ error: 'EmployeeID is required' })
  if (!isValidIsoDate(overtimeDate)) return res.status(400).json({ error: 'OvertimeDate is required (YYYY-MM-DD)' })

  try {
    const pool = await getPool()
    const employeeExists = await ensureEmployeeExists(pool, employeeId)
    if (!employeeExists) return res.status(404).json({ error: 'Employee not found' })

    const startTime = parseOptionalTimeValue(req.body?.StartTime ?? req.body?.startTime, 'StartTime')
    const endTime = parseOptionalTimeValue(req.body?.EndTime ?? req.body?.endTime, 'EndTime')
    const approvedMinutes = resolveApprovedMinutes({
      approvedMinutes: req.body?.ApprovedMinutes ?? req.body?.approvedMinutes,
      approvedHours: req.body?.ApprovedHours ?? req.body?.approvedHours,
      startTime,
      endTime
    })

    if (approvedMinutes == null || approvedMinutes <= 0) {
      return res.status(400).json({ error: 'Provide ApprovedHours/ApprovedMinutes or a valid StartTime/EndTime window.' })
    }

    const { randomUUID } = require('crypto')
    const entryId = randomUUID()

    await pool.request()
      .input('OvertimeEntryID', sql.NVarChar(36), entryId)
      .input('EmployeeID', sql.NVarChar(36), employeeId)
      .input('OvertimeDate', sql.Date, overtimeDate)
      .input('StartTime', sql.NVarChar(8), startTime)
      .input('EndTime', sql.NVarChar(8), endTime)
      .input('ApprovedMinutes', sql.Int, approvedMinutes)
      .input('OvertimeType', sql.NVarChar(50), overtimeType)
      .input('Reason', sql.NVarChar(255), reason ? String(reason).trim() : null)
      .input('CreatedByUserID', sql.NVarChar(36), String(req.authUser?.sub || '').trim() || null)
      .query(`
        INSERT INTO dbo.AdminOvertimeEntries
        (OvertimeEntryID, EmployeeID, OvertimeDate, StartTime, EndTime, ApprovedMinutes, OvertimeType, Reason, Status, CreatedByUserID)
        VALUES
        (@OvertimeEntryID, @EmployeeID, @OvertimeDate, CAST(@StartTime AS TIME(7)), CAST(@EndTime AS TIME(7)), @ApprovedMinutes, @OvertimeType, @Reason, 'APPROVED', @CreatedByUserID)
      `)

    const created = await fetchOvertimeEntryById(pool, entryId)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'CREATE',
      tableName: 'AdminOvertimeEntries',
      recordID: entryId,
      afterJson: JSON.stringify(created || {})
    })

    res.json(created)
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.put('/overtime-entries/:id', requireAdmin, async (req, res) => {
  const entryId = String(req.params?.id || '').trim()
  if (!entryId) return res.status(400).json({ error: 'OvertimeEntryID is required' })

  try {
    const pool = await getPool()
    const before = await fetchOvertimeEntryById(pool, entryId)
    if (!before) return res.status(404).json({ error: 'Not found' })

    const employeeId = String(req.body?.EmployeeID || req.body?.employeeID || before.EmployeeID || '').trim()
    const overtimeDate = String(req.body?.OvertimeDate || req.body?.overtimeDate || before.OvertimeDate || '').trim()
    const overtimeType = normalizeOvertimeType(req.body?.OvertimeType || req.body?.overtimeType || before.OvertimeType)
    const reason = req.body?.Reason ?? req.body?.reason ?? before.Reason ?? null

    if (!employeeId) return res.status(400).json({ error: 'EmployeeID is required' })
    if (!isValidIsoDate(overtimeDate)) return res.status(400).json({ error: 'OvertimeDate is required (YYYY-MM-DD)' })

    const employeeExists = await ensureEmployeeExists(pool, employeeId)
    if (!employeeExists) return res.status(404).json({ error: 'Employee not found' })

    const startTime = parseOptionalTimeValue(
      req.body?.StartTime ?? req.body?.startTime ?? before.StartTime,
      'StartTime'
    )
    const endTime = parseOptionalTimeValue(
      req.body?.EndTime ?? req.body?.endTime ?? before.EndTime,
      'EndTime'
    )
    const approvedMinutes = resolveApprovedMinutes({
      approvedMinutes: req.body?.ApprovedMinutes ?? req.body?.approvedMinutes ?? before.ApprovedMinutes,
      approvedHours: req.body?.ApprovedHours ?? req.body?.approvedHours,
      startTime,
      endTime
    })

    if (approvedMinutes == null || approvedMinutes <= 0) {
      return res.status(400).json({ error: 'Provide ApprovedHours/ApprovedMinutes or a valid StartTime/EndTime window.' })
    }

    await pool.request()
      .input('OvertimeEntryID', sql.NVarChar(36), entryId)
      .input('EmployeeID', sql.NVarChar(36), employeeId)
      .input('OvertimeDate', sql.Date, overtimeDate)
      .input('StartTime', sql.NVarChar(8), startTime)
      .input('EndTime', sql.NVarChar(8), endTime)
      .input('ApprovedMinutes', sql.Int, approvedMinutes)
      .input('OvertimeType', sql.NVarChar(50), overtimeType)
      .input('Reason', sql.NVarChar(255), reason ? String(reason).trim() : null)
      .input('UpdatedByUserID', sql.NVarChar(36), String(req.authUser?.sub || '').trim() || null)
      .query(`
        UPDATE dbo.AdminOvertimeEntries
        SET EmployeeID=@EmployeeID,
            OvertimeDate=@OvertimeDate,
            StartTime=CAST(@StartTime AS TIME(7)),
            EndTime=CAST(@EndTime AS TIME(7)),
            ApprovedMinutes=@ApprovedMinutes,
            OvertimeType=@OvertimeType,
            Reason=@Reason,
            UpdatedByUserID=@UpdatedByUserID,
            UpdatedAt=GETDATE()
        WHERE OvertimeEntryID=@OvertimeEntryID
      `)

    const updated = await fetchOvertimeEntryById(pool, entryId)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'UPDATE',
      tableName: 'AdminOvertimeEntries',
      recordID: entryId,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated || {})
    })

    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.delete('/overtime-entries/:id', requireAdmin, async (req, res) => {
  const entryId = String(req.params?.id || '').trim()
  if (!entryId) return res.status(400).json({ error: 'OvertimeEntryID is required' })

  try {
    const pool = await getPool()
    const before = await fetchOvertimeEntryById(pool, entryId)
    if (!before) return res.status(404).json({ error: 'Not found' })

    await pool.request()
      .input('OvertimeEntryID', sql.NVarChar(36), entryId)
      .query('DELETE FROM dbo.AdminOvertimeEntries WHERE OvertimeEntryID=@OvertimeEntryID')

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'DELETE',
      tableName: 'AdminOvertimeEntries',
      recordID: entryId,
      beforeJson: JSON.stringify(before)
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/leave-entries', requireAdmin, async (req, res) => {
  const from = String(req.query?.from || '').trim()
  const to = String(req.query?.to || '').trim()
  const employeeId = String(req.query?.employeeId || '').trim()

  if (from && !isValidIsoDate(from)) return res.status(400).json({ error: 'from must be YYYY-MM-DD' })
  if (to && !isValidIsoDate(to)) return res.status(400).json({ error: 'to must be YYYY-MM-DD' })

  try {
    const pool = await getPool()
    const request = pool.request()
      .input('FromDate', sql.Date, from || null)
      .input('ToDate', sql.Date, to || null)
      .input('EmployeeID', sql.NVarChar(36), employeeId || null)

    const result = await request.query(`
      ${leaveEntrySelectSql}
      WHERE (@FromDate IS NULL OR le.LeaveEndDate >= @FromDate)
        AND (@ToDate IS NULL OR le.LeaveStartDate <= @ToDate)
        AND (@EmployeeID IS NULL OR le.EmployeeID = @EmployeeID)
      ORDER BY le.LeaveStartDate DESC, EmployeeName ASC
    `)

    res.json(result.recordset || [])
  } catch (err) {
    const msg = String(err?.message || err)
    if (msg.toLowerCase().includes('invalid object name') && msg.toLowerCase().includes('adminleaveentries')) {
      return res.status(503).json({ error: 'Leave tables are not initialized yet. Restart the backend server to run migrations.' })
    }
    res.status(500).json({ error: msg })
  }
})

app.post('/leave-entries', requireAdmin, async (req, res) => {
  const employeeId = String(req.body?.EmployeeID || req.body?.employeeID || '').trim()
  const leaveStartDate = String(req.body?.LeaveStartDate || req.body?.leaveStartDate || '').trim()
  const leaveEndDate = String(req.body?.LeaveEndDate || req.body?.leaveEndDate || leaveStartDate || '').trim()
  const leaveType = normalizeLeaveType(req.body?.LeaveType || req.body?.leaveType)
  const leaveUnitType = normalizeLeaveUnitType(req.body?.LeaveUnitType || req.body?.leaveUnitType)
  const reason = req.body?.Reason ?? req.body?.reason ?? null

  if (!employeeId) return res.status(400).json({ error: 'EmployeeID is required' })
  if (!isValidIsoDate(leaveStartDate)) return res.status(400).json({ error: 'LeaveStartDate is required (YYYY-MM-DD)' })
  if (!isValidIsoDate(leaveEndDate)) return res.status(400).json({ error: 'LeaveEndDate is required (YYYY-MM-DD)' })
  if (leaveEndDate < leaveStartDate) return res.status(400).json({ error: 'LeaveEndDate cannot be earlier than LeaveStartDate' })

  try {
    const pool = await getPool()
    const employeeExists = await ensureEmployeeExists(pool, employeeId)
    if (!employeeExists) return res.status(404).json({ error: 'Employee not found' })

    const startTime = parseOptionalTimeValue(req.body?.StartTime ?? req.body?.startTime, 'StartTime')
    const endTime = parseOptionalTimeValue(req.body?.EndTime ?? req.body?.endTime, 'EndTime')
    const approvedMinutes = resolveApprovedMinutes({
      approvedMinutes: req.body?.ApprovedMinutes ?? req.body?.approvedMinutes,
      approvedHours: req.body?.ApprovedHours ?? req.body?.approvedHours,
      startTime,
      endTime
    })

    if (leaveUnitType !== 'FULL_DAY' && leaveStartDate !== leaveEndDate) {
      return res.status(400).json({ error: 'Multi-day leave is only supported for FULL_DAY entries right now.' })
    }

    const { randomUUID } = require('crypto')
    const entryId = randomUUID()

    await pool.request()
      .input('LeaveEntryID', sql.NVarChar(36), entryId)
      .input('EmployeeID', sql.NVarChar(36), employeeId)
      .input('LeaveStartDate', sql.Date, leaveStartDate)
      .input('LeaveEndDate', sql.Date, leaveEndDate)
      .input('LeaveType', sql.NVarChar(50), leaveType)
      .input('LeaveUnitType', sql.NVarChar(30), leaveUnitType)
      .input('StartTime', sql.NVarChar(8), startTime)
      .input('EndTime', sql.NVarChar(8), endTime)
      .input('ApprovedMinutes', sql.Int, approvedMinutes)
      .input('Reason', sql.NVarChar(255), reason ? String(reason).trim() : null)
      .input('CreatedByUserID', sql.NVarChar(36), String(req.authUser?.sub || '').trim() || null)
      .query(`
        INSERT INTO dbo.AdminLeaveEntries
        (LeaveEntryID, EmployeeID, LeaveStartDate, LeaveEndDate, LeaveType, LeaveUnitType, StartTime, EndTime, ApprovedMinutes, Reason, Status, CreatedByUserID)
        VALUES
        (@LeaveEntryID, @EmployeeID, @LeaveStartDate, @LeaveEndDate, @LeaveType, @LeaveUnitType, CAST(@StartTime AS TIME(7)), CAST(@EndTime AS TIME(7)), @ApprovedMinutes, @Reason, 'APPROVED', @CreatedByUserID)
      `)

    const created = await fetchLeaveEntryById(pool, entryId)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'CREATE',
      tableName: 'AdminLeaveEntries',
      recordID: entryId,
      afterJson: JSON.stringify(created || {})
    })

    res.json(created)
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.put('/leave-entries/:id', requireAdmin, async (req, res) => {
  const entryId = String(req.params?.id || '').trim()
  if (!entryId) return res.status(400).json({ error: 'LeaveEntryID is required' })

  try {
    const pool = await getPool()
    const before = await fetchLeaveEntryById(pool, entryId)
    if (!before) return res.status(404).json({ error: 'Not found' })

    const employeeId = String(req.body?.EmployeeID || req.body?.employeeID || before.EmployeeID || '').trim()
    const leaveStartDate = String(req.body?.LeaveStartDate || req.body?.leaveStartDate || before.LeaveStartDate || '').trim()
    const leaveEndDate = String(req.body?.LeaveEndDate || req.body?.leaveEndDate || before.LeaveEndDate || leaveStartDate || '').trim()
    const leaveType = normalizeLeaveType(req.body?.LeaveType || req.body?.leaveType || before.LeaveType)
    const leaveUnitType = normalizeLeaveUnitType(req.body?.LeaveUnitType || req.body?.leaveUnitType || before.LeaveUnitType)
    const reason = req.body?.Reason ?? req.body?.reason ?? before.Reason ?? null

    if (!employeeId) return res.status(400).json({ error: 'EmployeeID is required' })
    if (!isValidIsoDate(leaveStartDate)) return res.status(400).json({ error: 'LeaveStartDate is required (YYYY-MM-DD)' })
    if (!isValidIsoDate(leaveEndDate)) return res.status(400).json({ error: 'LeaveEndDate is required (YYYY-MM-DD)' })
    if (leaveEndDate < leaveStartDate) return res.status(400).json({ error: 'LeaveEndDate cannot be earlier than LeaveStartDate' })
    if (leaveUnitType !== 'FULL_DAY' && leaveStartDate !== leaveEndDate) {
      return res.status(400).json({ error: 'Multi-day leave is only supported for FULL_DAY entries right now.' })
    }

    const employeeExists = await ensureEmployeeExists(pool, employeeId)
    if (!employeeExists) return res.status(404).json({ error: 'Employee not found' })

    const startTime = parseOptionalTimeValue(
      req.body?.StartTime ?? req.body?.startTime ?? before.StartTime,
      'StartTime'
    )
    const endTime = parseOptionalTimeValue(
      req.body?.EndTime ?? req.body?.endTime ?? before.EndTime,
      'EndTime'
    )
    const approvedMinutes = resolveApprovedMinutes({
      approvedMinutes: req.body?.ApprovedMinutes ?? req.body?.approvedMinutes ?? before.ApprovedMinutes,
      approvedHours: req.body?.ApprovedHours ?? req.body?.approvedHours,
      startTime,
      endTime
    })

    await pool.request()
      .input('LeaveEntryID', sql.NVarChar(36), entryId)
      .input('EmployeeID', sql.NVarChar(36), employeeId)
      .input('LeaveStartDate', sql.Date, leaveStartDate)
      .input('LeaveEndDate', sql.Date, leaveEndDate)
      .input('LeaveType', sql.NVarChar(50), leaveType)
      .input('LeaveUnitType', sql.NVarChar(30), leaveUnitType)
      .input('StartTime', sql.NVarChar(8), startTime)
      .input('EndTime', sql.NVarChar(8), endTime)
      .input('ApprovedMinutes', sql.Int, approvedMinutes)
      .input('Reason', sql.NVarChar(255), reason ? String(reason).trim() : null)
      .input('UpdatedByUserID', sql.NVarChar(36), String(req.authUser?.sub || '').trim() || null)
      .query(`
        UPDATE dbo.AdminLeaveEntries
        SET EmployeeID=@EmployeeID,
            LeaveStartDate=@LeaveStartDate,
            LeaveEndDate=@LeaveEndDate,
            LeaveType=@LeaveType,
            LeaveUnitType=@LeaveUnitType,
            StartTime=CAST(@StartTime AS TIME(7)),
            EndTime=CAST(@EndTime AS TIME(7)),
            ApprovedMinutes=@ApprovedMinutes,
            Reason=@Reason,
            UpdatedByUserID=@UpdatedByUserID,
            UpdatedAt=GETDATE()
        WHERE LeaveEntryID=@LeaveEntryID
      `)

    const updated = await fetchLeaveEntryById(pool, entryId)

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'UPDATE',
      tableName: 'AdminLeaveEntries',
      recordID: entryId,
      beforeJson: JSON.stringify(before),
      afterJson: JSON.stringify(updated || {})
    })

    res.json(updated)
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.delete('/leave-entries/:id', requireAdmin, async (req, res) => {
  const entryId = String(req.params?.id || '').trim()
  if (!entryId) return res.status(400).json({ error: 'LeaveEntryID is required' })

  try {
    const pool = await getPool()
    const before = await fetchLeaveEntryById(pool, entryId)
    if (!before) return res.status(404).json({ error: 'Not found' })

    await pool.request()
      .input('LeaveEntryID', sql.NVarChar(36), entryId)
      .query('DELETE FROM dbo.AdminLeaveEntries WHERE LeaveEntryID=@LeaveEntryID')

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'DELETE',
      tableName: 'AdminLeaveEntries',
      recordID: entryId,
      beforeJson: JSON.stringify(before)
    })

    res.json({ success: true })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

function isoDate(y, m, d) {
  const yyyy = String(y).padStart(4, '0')
  const mm = String(m).padStart(2, '0')
  const dd = String(d).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function easterSundayUtc(year) {
  // Anonymous Gregorian algorithm.
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31) // 3=March, 4=April
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day))
}

function addDaysUtc(date, days) {
  return new Date(date.getTime() + days * 86400000)
}

function lastMondayOfMonthUtc(year, month1to12) {
  const last = new Date(Date.UTC(year, month1to12, 0)) // last day of month
  const dow = last.getUTCDay() // 0=Sun..6=Sat
  const offset = (dow + 6) % 7 // days since Monday
  return addDaysUtc(last, -offset)
}

function findCalendarDateUtc(year, calendarCandidates, targetMonth, targetDay) {
  for (const calendar of calendarCandidates) {
    try {
      const formatter = new Intl.DateTimeFormat(`en-u-ca-${calendar}`, {
        day: 'numeric',
        month: 'numeric',
        year: 'numeric',
        timeZone: 'UTC'
      })

      for (let month = 0; month < 12; month += 1) {
        const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
        for (let day = 1; day <= daysInMonth; day += 1) {
          const date = new Date(Date.UTC(year, month, day))
          const parts = formatter.formatToParts(date)
          const monthPart = Number(parts.find((part) => part.type === 'month')?.value || 0)
          const dayPart = Number(parts.find((part) => part.type === 'day')?.value || 0)
          if (monthPart === targetMonth && dayPart === targetDay) return date
        }
      }
    } catch (_) {}
  }

  return null
}

function findIslamicHolidayDateUtc(year, islamicMonth, islamicDay) {
  return findCalendarDateUtc(year, ['islamic-umalqura', 'islamic', 'islamic-civil'], islamicMonth, islamicDay)
}

function findChineseHolidayDateUtc(year, chineseMonth, chineseDay) {
  return findCalendarDateUtc(year, ['chinese'], chineseMonth, chineseDay)
}

function generatePhilippinesHolidays(year) {
  const items = []

  const regularFixed = [
    { m: 1, d: 1, desc: "New Year's Day" },
    { m: 4, d: 9, desc: 'Day of Valor' },
    { m: 5, d: 1, desc: 'Labor Day' },
    { m: 6, d: 12, desc: 'Independence Day' },
    { m: 11, d: 30, desc: 'Bonifacio Day' },
    { m: 12, d: 25, desc: 'Christmas Day' },
    { m: 12, d: 30, desc: 'Rizal Day' }
  ]
  for (const h of regularFixed) {
    items.push({ SpecialDate: isoDate(year, h.m, h.d), DayType: 'HOLIDAY', Description: h.desc })
  }

  const specialNonWorkingFixed = [
    { m: 8, d: 21, desc: 'Ninoy Aquino Day' },
    { m: 11, d: 1, desc: "All Saints' Day" },
    { m: 11, d: 2, desc: "All Souls' Day" },
    { m: 12, d: 8, desc: 'Feast of the Immaculate Conception of Mary' },
    { m: 12, d: 24, desc: 'Christmas Eve' },
    { m: 12, d: 31, desc: 'Last Day of the Year' }
  ]
  for (const h of specialNonWorkingFixed) {
    items.push({ SpecialDate: isoDate(year, h.m, h.d), DayType: 'SPECIAL_NON_WORKING', Description: h.desc })
  }

  // National Heroes Day: last Monday of August
  try {
    const nhd = lastMondayOfMonthUtc(year, 8)
    items.push({ SpecialDate: isoDate(year, nhd.getUTCMonth() + 1, nhd.getUTCDate()), DayType: 'HOLIDAY', Description: 'National Heroes Day' })
  } catch (_) {}

  // Additional special non-working days declared in the yearly proclamation.
  try {
    const cny = findChineseHolidayDateUtc(year, 1, 1)
    if (cny) {
      items.push({
        SpecialDate: isoDate(year, cny.getUTCMonth() + 1, cny.getUTCDate()),
        DayType: 'SPECIAL_NON_WORKING',
        Description: 'Chinese New Year'
      })
    }
  } catch (_) {}

  // Holy Week: Maundy Thursday, Good Friday, Black Saturday
  try {
    const easter = easterSundayUtc(year)
    const maundyThu = addDaysUtc(easter, -3)
    const goodFri = addDaysUtc(easter, -2)
    const blackSat = addDaysUtc(easter, -1)
    items.push({ SpecialDate: isoDate(year, maundyThu.getUTCMonth() + 1, maundyThu.getUTCDate()), DayType: 'HOLIDAY', Description: 'Maundy Thursday' })
    items.push({ SpecialDate: isoDate(year, goodFri.getUTCMonth() + 1, goodFri.getUTCDate()), DayType: 'HOLIDAY', Description: 'Good Friday' })
    items.push({ SpecialDate: isoDate(year, blackSat.getUTCMonth() + 1, blackSat.getUTCDate()), DayType: 'SPECIAL_NON_WORKING', Description: 'Black Saturday' })
  } catch (_) {}

  // Muslim holidays observed nationally in the Philippines.
  try {
    const eidAlFitr = findIslamicHolidayDateUtc(year, 10, 1)
    if (eidAlFitr) {
      items.push({
        SpecialDate: isoDate(year, eidAlFitr.getUTCMonth() + 1, eidAlFitr.getUTCDate()),
        DayType: 'HOLIDAY',
        Description: "Eid'l Fitr"
      })
    }

    const eidAlAdha = findIslamicHolidayDateUtc(year, 12, 10)
    if (eidAlAdha) {
      items.push({
        SpecialDate: isoDate(year, eidAlAdha.getUTCMonth() + 1, eidAlAdha.getUTCDate()),
        DayType: 'HOLIDAY',
        Description: "Eid'l Adha"
      })
    }
  } catch (_) {}

  // Deduplicate in-memory (date+type)
  const seen = new Set()
  const out = []
  for (const it of items) {
    const key = `${it.SpecialDate}|${it.DayType}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(it)
  }
  return out
}

app.post('/special-days/generate-year', requireAdmin, async (req, res) => {
  const year = Number(req.body?.year || req.body?.Year || 0)
  const overwriteExisting = !!(req.body?.overwriteExisting || req.body?.OverwriteExisting)
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return res.status(400).json({ error: 'year must be a number between 2000 and 2100' })
  }

  const generated = generatePhilippinesHolidays(year)
  if (!generated.length) return res.json({ year, inserted: 0, skipped: 0, total: 0 })

  try {
    const pool = await getPool()
    let inserted = 0
    let skipped = 0

    for (const it of generated) {
      if (overwriteExisting) {
        await pool.request()
          .input('SpecialDate', sql.Date, it.SpecialDate)
          .input('DayType', sql.NVarChar(50), it.DayType)
          .query('DELETE FROM dbo.SpecialDays WHERE SpecialDate=@SpecialDate AND DayType=@DayType')
      }

      const { randomUUID } = require('crypto')
      const id = randomUUID()
      const r = await pool.request()
        .input('SpecialDayID', sql.NVarChar(36), id)
        .input('SpecialDate', sql.Date, it.SpecialDate)
        .input('DayType', sql.NVarChar(50), it.DayType)
        .input('Description', sql.NVarChar(255), it.Description || null)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.SpecialDays WHERE SpecialDate=@SpecialDate AND DayType=@DayType)
          BEGIN
            INSERT INTO dbo.SpecialDays (SpecialDayID, SpecialDate, DayType, Description)
            VALUES (@SpecialDayID, @SpecialDate, @DayType, @Description)
            SELECT 1 AS inserted
          END
          ELSE
          BEGIN
            SELECT 0 AS inserted
          END
        `)

      const didInsert = (r.recordset?.[0]?.inserted || 0) === 1
      if (didInsert) inserted += 1
      else skipped += 1
    }

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'GENERATE_YEAR',
      tableName: 'SpecialDays',
      recordID: String(year),
      afterJson: JSON.stringify({ year, inserted, skipped, overwriteExisting })
    })

    res.json({ year, inserted, skipped, total: generated.length, overwriteExisting })
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) })
  }
})

app.get('/attendance/today', async (req, res) => {
  const t0 = Date.now()
  try {
    const pool = await getPool()
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const todayDay = now.getDay() === 0 ? 7 : now.getDay()

    const result = await pool.request()
      .input('today', sql.Date, today)
      .input('todayDay', sql.Int, todayDay)
      .query(`
        SET DATEFIRST 1;

        ;WITH ShiftPick AS (
          SELECT
              e.EmployeeID,
              e.EmployeeCode,
              CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
              s.ShiftName,
              COALESCE(dss.MorningTimeIn,  s.MorningTimeIn)   AS ReqMorningIn,
              COALESCE(dss.MorningTimeOut, s.MorningTimeOut)  AS ReqMorningOut,
              COALESCE(dss.AfternoonTimeIn,  s.AfternoonTimeIn)   AS ReqAfternoonIn,
              COALESCE(dss.AfternoonTimeOut, s.AfternoonTimeOut) AS ReqAfternoonOut,
              COALESCE(dss.GracePeriodMinutes, s.GracePeriodMinutes, 0) AS GracePeriodMinutes,
              ROW_NUMBER() OVER (PARTITION BY e.EmployeeID ORDER BY sa.EffectiveFrom DESC) AS rn
          FROM dbo.EmployeeShiftAllotments sa
          JOIN dbo.ShiftDefinitions s
            ON sa.ShiftID = s.ShiftID
          JOIN dbo.Employees e
            ON e.EmployeeID = sa.EmployeeID
          LEFT JOIN dbo.ShiftDays sd
            ON sd.ShiftID = s.ShiftID AND sd.DayOfWeek = @todayDay
          LEFT JOIN dbo.ShiftDaySchedules dss
            ON dss.ShiftID = s.ShiftID AND dss.DayOfWeek = @todayDay
          WHERE @today BETWEEN sa.EffectiveFrom AND ISNULL(sa.EffectiveTo, @today)
            AND (sd.DayOfWeek IS NULL OR sd.DayOfWeek = @todayDay)
        )
        SELECT
            ISNULL(a.AttendanceID, NEWID()) AS AttendanceID,
            sp.EmployeeID,
            sp.EmployeeCode,
            sp.EmployeeName,
            CONVERT(varchar(10), @today, 23) AS AttendanceDate,
            CONVERT(varchar(5), a.MorningTimeIn, 108)    AS MorningTimeIn,
            CONVERT(varchar(5), a.MorningTimeOut, 108)   AS MorningTimeOut,
            CONVERT(varchar(5), a.AfternoonTimeIn, 108)  AS AfternoonTimeIn,
            CONVERT(varchar(5), a.AfternoonTimeOut, 108) AS AfternoonTimeOut,
            sp.ShiftName,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_PM','HALF_DAY_P.M.','HALF_DAY_PM_ONLY') THEN NULL ELSE sp.ReqMorningIn END,
            108) AS RequiredMorningIn,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_PM','HALF_DAY_P.M.','HALF_DAY_PM_ONLY') THEN NULL ELSE sp.ReqMorningOut END,
            108) AS RequiredMorningOut,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_AM','HALF_DAY_A.M.','HALF_DAY_AM_ONLY') THEN NULL ELSE sp.ReqAfternoonIn END,
            108) AS RequiredAfternoonIn,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_AM','HALF_DAY_A.M.','HALF_DAY_AM_ONLY') THEN NULL ELSE sp.ReqAfternoonOut END,
            108) AS RequiredAfternoonOut,
            sp.GracePeriodMinutes,
            sd.DayType AS SpecialDayType,
            sd.Description AS SpecialDayDescription,
            CASE
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) = 'HOLIDAY'
                THEN CASE
                  WHEN a.AttendanceID IS NULL THEN 'Holiday'
                  WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Holiday'
                  ELSE 'Holiday (Worked)'
                END
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) = 'SPECIAL_NON_WORKING'
                THEN CASE
                  WHEN a.AttendanceID IS NULL THEN 'Special Non-Working Day'
                  WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Special Non-Working Day'
                  ELSE 'Special Non-Working Day (Worked)'
                END
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) = 'REST_DAY'
                THEN CASE
                  WHEN a.AttendanceID IS NULL THEN 'Rest Day'
                  WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Rest Day'
                  ELSE 'Rest Day (Worked)'
                END
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) LIKE 'HALF_DAY%'
                THEN 'Half-Day'
              WHEN a.AttendanceID IS NULL THEN 'Absent'
              WHEN
                (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NULL)
                OR (a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NOT NULL)
                OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NULL)
                OR (a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NOT NULL) THEN 'Incomplete'
              WHEN a.MorningTimeIn > DATEADD(MINUTE, sp.GracePeriodMinutes, sp.ReqMorningIn) THEN 'Late'
              WHEN a.AfternoonTimeIn IS NOT NULL
                   AND sp.ReqAfternoonIn IS NOT NULL
                   AND a.AfternoonTimeIn > DATEADD(MINUTE, sp.GracePeriodMinutes, sp.ReqAfternoonIn) THEN 'Late'
              WHEN a.MorningTimeOut IS NOT NULL
                   AND sp.ReqMorningOut IS NOT NULL
                   AND a.MorningTimeOut < sp.ReqMorningOut THEN 'Early Leave'
              WHEN a.AfternoonTimeOut IS NOT NULL
                   AND sp.ReqAfternoonOut IS NOT NULL
                   AND a.AfternoonTimeOut < sp.ReqAfternoonOut THEN 'Early Leave'
              WHEN
                (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NOT NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL)
                OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NOT NULL AND a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL) THEN 'Half-Day'
              ELSE 'On-Time'
            END AS AttendanceSummary
        FROM ShiftPick sp
        LEFT JOIN dbo.AttendanceRecords a
               ON a.EmployeeID = sp.EmployeeID
              AND a.AttendanceDate = @today
        OUTER APPLY (
          SELECT TOP 1 DayType, Description
          FROM dbo.SpecialDays sd0
          WHERE sd0.SpecialDate = @today
          ORDER BY
            CASE
              WHEN UPPER(sd0.DayType) = 'HOLIDAY' THEN 1
              WHEN UPPER(sd0.DayType) = 'SPECIAL_NON_WORKING' THEN 2
              WHEN UPPER(sd0.DayType) = 'REST_DAY' THEN 3
              WHEN UPPER(sd0.DayType) LIKE 'HALF_DAY%' THEN 4
              ELSE 99
            END,
            sd0.DayType ASC
        ) sd
        WHERE sp.rn = 1
        ORDER BY sp.EmployeeName ASC
        OPTION (RECOMPILE);
      `)
    console.log(`[perf] /attendance/today rows=${result.recordset?.length || 0} ms=${Date.now() - t0}`)
    res.json(result.recordset)
  } catch (err) {
    console.error(`[perf] /attendance/today failed after ${Date.now() - t0}ms`, err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/attendance/range', async (req, res) => {
  const t0 = Date.now()
  const { from, to } = req.body || {}
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' })
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' })
  }
  try {
    const pool = await getPool()
    const result = await pool.request()
      .input('from', sql.Date, from)
      .input('to', sql.Date, to)
      .query(`
                SET DATEFIRST 1;

        ;WITH Dates AS (
          SELECT @from AS dt
          UNION ALL
          SELECT DATEADD(day, 1, dt) FROM Dates WHERE dt < @to
        ),
        ShiftPick AS (
          SELECT
              d.dt,
              e.EmployeeID,
              e.EmployeeCode,
              CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
              s.ShiftID,
              s.ShiftName,
              COALESCE(dss.MorningTimeIn,  s.MorningTimeIn)   AS ReqMorningIn,
              COALESCE(dss.MorningTimeOut, s.MorningTimeOut)  AS ReqMorningOut,
              COALESCE(dss.AfternoonTimeIn,  s.AfternoonTimeIn)   AS ReqAfternoonIn,
              COALESCE(dss.AfternoonTimeOut, s.AfternoonTimeOut) AS ReqAfternoonOut,
              COALESCE(dss.GracePeriodMinutes, s.GracePeriodMinutes, 0) AS GracePeriodMinutes,
              ROW_NUMBER() OVER (PARTITION BY d.dt, e.EmployeeID ORDER BY sa.EffectiveFrom DESC) AS rn
          FROM Dates d
          JOIN dbo.EmployeeShiftAllotments sa
            ON d.dt BETWEEN sa.EffectiveFrom AND ISNULL(sa.EffectiveTo, d.dt)
          JOIN dbo.ShiftDefinitions s
            ON sa.ShiftID = s.ShiftID
          LEFT JOIN dbo.ShiftDays sd
            ON sd.ShiftID = s.ShiftID
           AND sd.DayOfWeek = CASE WHEN DATEPART(WEEKDAY, d.dt) = 1 THEN 7 ELSE DATEPART(WEEKDAY, d.dt) - 1 END
          LEFT JOIN dbo.ShiftDaySchedules dss
            ON dss.ShiftID = s.ShiftID
           AND dss.DayOfWeek = ISNULL(sd.DayOfWeek, CASE WHEN DATEPART(WEEKDAY, d.dt) = 1 THEN 7 ELSE DATEPART(WEEKDAY, d.dt) - 1 END)
          JOIN dbo.Employees e
            ON e.EmployeeID = sa.EmployeeID
        )
        SELECT
            ISNULL(a.AttendanceID, NEWID()) AS AttendanceID,
            sp.EmployeeID,
            sp.EmployeeCode,
            sp.EmployeeName,
            CONVERT(varchar(10), sp.dt, 23) AS AttendanceDate,
            CONVERT(varchar(5), a.MorningTimeIn, 108)    AS MorningTimeIn,
            CONVERT(varchar(5), a.MorningTimeOut, 108)   AS MorningTimeOut,
            CONVERT(varchar(5), a.AfternoonTimeIn, 108)  AS AfternoonTimeIn,
            CONVERT(varchar(5), a.AfternoonTimeOut, 108) AS AfternoonTimeOut,
            sp.ShiftName,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_PM','HALF_DAY_P.M.','HALF_DAY_PM_ONLY') THEN NULL ELSE sp.ReqMorningIn END,
            108) AS RequiredMorningIn,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_PM','HALF_DAY_P.M.','HALF_DAY_PM_ONLY') THEN NULL ELSE sp.ReqMorningOut END,
            108) AS RequiredMorningOut,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_AM','HALF_DAY_A.M.','HALF_DAY_AM_ONLY') THEN NULL ELSE sp.ReqAfternoonIn END,
            108) AS RequiredAfternoonIn,
            CONVERT(varchar(5),
              CASE WHEN UPPER(ISNULL(sd.DayType,'')) IN ('HALF_DAY_AM','HALF_DAY_A.M.','HALF_DAY_AM_ONLY') THEN NULL ELSE sp.ReqAfternoonOut END,
            108) AS RequiredAfternoonOut,
            sp.GracePeriodMinutes,
            sd.DayType AS SpecialDayType,
            sd.Description AS SpecialDayDescription,
            CASE
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) = 'HOLIDAY'
                THEN CASE
                  WHEN a.AttendanceID IS NULL THEN 'Holiday'
                  WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Holiday'
                  ELSE 'Holiday (Worked)'
                END
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) = 'SPECIAL_NON_WORKING'
                THEN CASE
                  WHEN a.AttendanceID IS NULL THEN 'Special Non-Working Day'
                  WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Special Non-Working Day'
                  ELSE 'Special Non-Working Day (Worked)'
                END
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) = 'REST_DAY'
                THEN CASE
                  WHEN a.AttendanceID IS NULL THEN 'Rest Day'
                  WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Rest Day'
                  ELSE 'Rest Day (Worked)'
                END
              WHEN sd.DayType IS NOT NULL AND UPPER(sd.DayType) LIKE 'HALF_DAY%'
                THEN 'Half-Day'
              WHEN a.AttendanceID IS NULL THEN 'Absent'
              WHEN
                (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NULL)
                OR (a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NOT NULL)
                OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NULL)
                OR (a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NOT NULL) THEN 'Incomplete'
              WHEN a.MorningTimeIn > DATEADD(MINUTE, sp.GracePeriodMinutes, sp.ReqMorningIn) THEN 'Late'
              WHEN a.AfternoonTimeIn IS NOT NULL
                   AND sp.ReqAfternoonIn IS NOT NULL
                   AND a.AfternoonTimeIn > DATEADD(MINUTE, sp.GracePeriodMinutes, sp.ReqAfternoonIn) THEN 'Late'
              WHEN a.MorningTimeOut IS NOT NULL
                   AND sp.ReqMorningOut IS NOT NULL
                   AND a.MorningTimeOut < sp.ReqMorningOut THEN 'Early Leave'
              WHEN a.AfternoonTimeOut IS NOT NULL
                   AND sp.ReqAfternoonOut IS NOT NULL
                   AND a.AfternoonTimeOut < sp.ReqAfternoonOut THEN 'Early Leave'
              WHEN
                (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NOT NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL)
                OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NOT NULL AND a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL) THEN 'Half-Day'
              ELSE 'On-Time'
            END AS AttendanceSummary
        FROM ShiftPick sp
        LEFT JOIN dbo.AttendanceRecords a
               ON a.EmployeeID = sp.EmployeeID
              AND a.AttendanceDate = sp.dt
        OUTER APPLY (
          SELECT TOP 1 DayType, Description
          FROM dbo.SpecialDays sd0
          WHERE sd0.SpecialDate = sp.dt
          ORDER BY
            CASE
              WHEN UPPER(sd0.DayType) = 'HOLIDAY' THEN 1
              WHEN UPPER(sd0.DayType) = 'SPECIAL_NON_WORKING' THEN 2
              WHEN UPPER(sd0.DayType) = 'REST_DAY' THEN 3
              WHEN UPPER(sd0.DayType) LIKE 'HALF_DAY%' THEN 4
              ELSE 99
            END,
            sd0.DayType ASC
        ) sd
        WHERE sp.dt BETWEEN @from AND @to
          AND sp.dt <= CAST(GETDATE() AS DATE)
          AND sp.rn = 1
        OPTION (MAXRECURSION 400, RECOMPILE);

      `)
    console.log(`[perf] /attendance/range from=${from} to=${to} rows=${result.recordset?.length || 0} ms=${Date.now() - t0}`)
    res.json(result.recordset)
  } catch (err) {
    console.error(`[perf] /attendance/range failed from=${from} to=${to} after ${Date.now() - t0}ms`, err)
    res.status(500).json({ error: err.message })
  }
})

// Queue device sync jobs (Option A bridge: React -> backend -> C# bridge -> backend import).
app.post('/devices/request-sync', requireAdmin, async (req, res) => {
  const deviceCode = String(req.body?.deviceCode || req.body?.DeviceCode || '').trim()
  if (!deviceCode) return res.status(400).json({ error: 'deviceCode is required' })

  try {
    const pool = await getPool()
    const exists = await pool.request()
      .input('DeviceCode', sql.NVarChar(100), deviceCode)
      .query('SELECT TOP 1 DeviceID, DeviceCode FROM dbo.Devices WHERE DeviceCode=@DeviceCode')

    if (!exists.recordset?.length) return res.status(404).json({ error: 'Device not found' })

    const inserted = await pool.request()
      .input('DeviceCode', sql.NVarChar(100), deviceCode)
      .input('RequestedBy', sql.NVarChar(255), resolveAuditActor(req, null))
      .query(`
        INSERT INTO dbo.DeviceSyncJobs (DeviceCode, RequestedBy, Status)
        OUTPUT INSERTED.JobID, INSERTED.DeviceCode, INSERTED.Status, INSERTED.CreatedAt
        VALUES (@DeviceCode, @RequestedBy, 'PENDING')
      `)

    const job = inserted.recordset?.[0] || null

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, deviceCode),
      action: 'REQUEST_DEVICE_SYNC',
      tableName: 'DeviceSyncJobs',
      recordID: job?.JobID || null,
      afterJson: JSON.stringify(job),
      ipAddress: req.ip
    })

    res.json({ success: true, job })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/devices/request-sync-batch', requireAdmin, async (req, res) => {
  const idsRaw = req.body?.deviceIds || req.body?.DeviceIDs
  const codesRaw = req.body?.deviceCodes || req.body?.DeviceCodes
  const deviceIds = Array.isArray(idsRaw) ? Array.from(new Set(idsRaw.map(v => String(v || '').trim()).filter(Boolean))) : []
  const deviceCodes = Array.isArray(codesRaw) ? Array.from(new Set(codesRaw.map(v => String(v || '').trim()).filter(Boolean))) : []

  if (!deviceIds.length && !deviceCodes.length) {
    return res.status(400).json({ error: 'Provide deviceIds[] or deviceCodes[]' })
  }

  try {
    const pool = await getPool()

    let devices = []
    if (deviceIds.length) {
      const request = pool.request()
      deviceIds.forEach((id, idx) => request.input(`id${idx}`, sql.NVarChar(36), id))
      const values = deviceIds.map((_, idx) => `@id${idx}`).join(',')
      const result = await request.query(`SELECT DeviceID, DeviceCode FROM dbo.Devices WHERE DeviceID IN (${values})`)
      devices = result.recordset || []
    } else {
      const request = pool.request()
      deviceCodes.forEach((c, idx) => request.input(`c${idx}`, sql.NVarChar(100), c))
      const values = deviceCodes.map((_, idx) => `@c${idx}`).join(',')
      const result = await request.query(`SELECT DeviceID, DeviceCode FROM dbo.Devices WHERE DeviceCode IN (${values})`)
      devices = result.recordset || []
    }

    if (!devices.length) return res.status(404).json({ error: 'No matching devices found' })

    const requestedBy = resolveAuditActor(req, null)
    const jobs = []
    for (const d of devices) {
      const inserted = await pool.request()
        .input('DeviceCode', sql.NVarChar(100), d.DeviceCode)
        .input('RequestedBy', sql.NVarChar(255), requestedBy)
        .query(`
          INSERT INTO dbo.DeviceSyncJobs (DeviceCode, RequestedBy, Status)
          OUTPUT INSERTED.JobID, INSERTED.DeviceCode, INSERTED.Status, INSERTED.CreatedAt
          VALUES (@DeviceCode, @RequestedBy, 'PENDING')
        `)
      if (inserted.recordset?.[0]) jobs.push(inserted.recordset[0])
    }

    await writeAuditLog(pool, {
      actor: requestedBy,
      action: 'REQUEST_DEVICE_SYNC_BATCH',
      tableName: 'DeviceSyncJobs',
      afterJson: JSON.stringify({ requested: devices.length, jobs }),
      ipAddress: req.ip
    })

    res.json({ success: true, requested: devices.length, queued: jobs.length, jobs })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.get('/devices/sync-jobs', requireAdmin, async (req, res) => {
  const topRaw = Number.parseInt(String(req.query?.top || '100'), 10)
  const top = Number.isInteger(topRaw) && topRaw > 0 ? Math.min(topRaw, 500) : 100

  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT TOP (${top})
        JobID, DeviceCode, RequestedBy, Status, Error, ResultJson, CreatedAt, StartedAt, CompletedAt
      FROM dbo.DeviceSyncJobs
      ORDER BY CreatedAt DESC
    `)
    res.json(r.recordset || [])
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Bridge agent polling endpoint
app.get('/bridge/next', requireBridge, async (_req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      ;WITH NextJob AS (
        SELECT TOP 1 JobID
        FROM dbo.DeviceSyncJobs WITH (UPDLOCK, READPAST, ROWLOCK)
        WHERE Status='PENDING'
        ORDER BY CreatedAt ASC
      )
      UPDATE j
      SET Status='RUNNING', StartedAt=ISNULL(StartedAt, GETDATE())
      OUTPUT
        inserted.JobID,
        inserted.DeviceCode,
        d.IPAddress,
        d.Port,
        d.MachineID,
        d.CommPort,
        d.DevicePassword
      FROM dbo.DeviceSyncJobs j
      JOIN NextJob nj ON nj.JobID = j.JobID
      LEFT JOIN dbo.Devices d ON d.DeviceCode = j.DeviceCode;
    `)

    if (!r.recordset?.length) return res.json({ job: null })
    return res.json({ job: r.recordset[0] })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
})

app.post('/bridge/jobs/:id/complete', requireBridge, async (req, res) => {
  const id = String(req.params.id || '').trim()
  const success = req.body?.success === true
  const error = String(req.body?.error || '').trim() || null
  const result = req.body?.result ?? null

  if (!id) return res.status(400).json({ error: 'Job ID is required' })

  try {
    const pool = await getPool()
    const beforeRes = await pool.request()
      .input('JobID', sql.NVarChar(36), id)
      .query('SELECT TOP 1 * FROM dbo.DeviceSyncJobs WHERE JobID=@JobID')
    const before = beforeRes.recordset?.[0] || null

    const upd = await pool.request()
      .input('JobID', sql.NVarChar(36), id)
      .input('Status', sql.NVarChar(20), success ? 'SUCCEEDED' : 'FAILED')
      .input('Error', sql.NVarChar(2000), error)
      .input('ResultJson', sql.NVarChar(sql.MAX), result ? JSON.stringify(result) : null)
      .query(`
        UPDATE dbo.DeviceSyncJobs
        SET
          Status=@Status,
          Error=@Error,
          ResultJson=@ResultJson,
          CompletedAt=GETDATE()
        OUTPUT INSERTED.JobID, INSERTED.DeviceCode, INSERTED.Status, INSERTED.Error, INSERTED.ResultJson, INSERTED.CreatedAt, INSERTED.StartedAt, INSERTED.CompletedAt
        WHERE JobID=@JobID
      `)

    const after = upd.recordset?.[0] || null
    if (!after) return res.status(404).json({ error: 'Job not found' })

    await writeAuditLog(pool, {
      actor: before?.RequestedBy || 'BRIDGE',
      action: 'COMPLETE_DEVICE_SYNC',
      tableName: 'DeviceSyncJobs',
      recordID: id,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: JSON.stringify(after),
      ipAddress: req.ip
    })

    res.json({ success: true, job: after })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Raw attendance records for a date range (does NOT require shift assignments).
// Use this when you want to see actual stored IN/OUT times even if an employee has no schedule.
app.post('/attendance/raw-range', async (req, res) => {
  const t0 = Date.now()
  const { from, to } = req.body || {}
  if (!from || !to) {
    return res.status(400).json({ error: 'from and to are required (YYYY-MM-DD)' })
  }
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(from) || !dateRegex.test(to)) {
    return res.status(400).json({ error: 'from and to must be YYYY-MM-DD' })
  }

  try {
    const pool = await getPool()
    const result = await pool.request()
      .input('from', sql.Date, from)
      .input('to', sql.Date, to)
      .query(`
        SET DATEFIRST 1;

        SELECT
          a.AttendanceID,
          a.EmployeeID,
          e.EmployeeCode,
          CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
          CONVERT(varchar(10), a.AttendanceDate, 23) AS AttendanceDate,
          CONVERT(varchar(5), a.MorningTimeIn, 108)    AS MorningTimeIn,
          CONVERT(varchar(5), a.MorningTimeOut, 108)   AS MorningTimeOut,
          CONVERT(varchar(5), a.AfternoonTimeIn, 108)  AS AfternoonTimeIn,
          CONVERT(varchar(5), a.AfternoonTimeOut, 108) AS AfternoonTimeOut,
          sched.ShiftName,
          ISNULL(sched.GracePeriodMinutes, 0) AS GracePeriodMinutes,
          CONVERT(varchar(5), sched.ReqMorningIn, 108)     AS RequiredMorningIn,
          CONVERT(varchar(5), sched.ReqMorningOut, 108)    AS RequiredMorningOut,
          CONVERT(varchar(5), sched.ReqAfternoonIn, 108)   AS RequiredAfternoonIn,
          CONVERT(varchar(5), sched.ReqAfternoonOut, 108)  AS RequiredAfternoonOut,
          CASE
            WHEN
              (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NULL)
              OR (a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NOT NULL)
              OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NULL)
              OR (a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NOT NULL) THEN 'Incomplete'
            WHEN sched.ReqMorningIn IS NOT NULL AND a.MorningTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningIn) THEN 'Late'
            WHEN sched.ReqAfternoonIn IS NOT NULL AND a.AfternoonTimeIn IS NOT NULL
                 AND a.AfternoonTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonIn) THEN 'Late'
            WHEN a.MorningTimeOut IS NOT NULL
                 AND sched.ReqMorningOut IS NOT NULL
                 AND a.MorningTimeOut < sched.ReqMorningOut THEN 'Early Leave'
            WHEN a.AfternoonTimeOut IS NOT NULL
                 AND sched.ReqAfternoonOut IS NOT NULL
                 AND a.AfternoonTimeOut < sched.ReqAfternoonOut THEN 'Early Leave'
            WHEN
              (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NOT NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL)
              OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NOT NULL AND a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL) THEN 'Half-Day'
            ELSE 'On-Time'
          END AS AttendanceSummary
        FROM dbo.AttendanceRecords a
        JOIN dbo.Employees e ON e.EmployeeID = a.EmployeeID
        OUTER APPLY (
          SELECT TOP 1
            s.ShiftName,
            ISNULL(dss.MorningTimeIn, s.MorningTimeIn) AS ReqMorningIn,
            ISNULL(dss.MorningTimeOut, s.MorningTimeOut) AS ReqMorningOut,
            ISNULL(dss.AfternoonTimeIn, s.AfternoonTimeIn) AS ReqAfternoonIn,
            ISNULL(dss.AfternoonTimeOut, s.AfternoonTimeOut) AS ReqAfternoonOut,
            ISNULL(dss.GracePeriodMinutes, s.GracePeriodMinutes) AS GracePeriodMinutes
          FROM dbo.EmployeeShiftAllotments sa
          JOIN dbo.ShiftDefinitions s ON sa.ShiftID = s.ShiftID
          LEFT JOIN dbo.ShiftDays sd
            ON sd.ShiftID = s.ShiftID
           AND sd.DayOfWeek = CASE WHEN DATEPART(WEEKDAY, a.AttendanceDate) = 1 THEN 7 ELSE DATEPART(WEEKDAY, a.AttendanceDate) - 1 END
          LEFT JOIN dbo.ShiftDaySchedules dss
            ON dss.ShiftID = s.ShiftID
           AND dss.DayOfWeek = ISNULL(sd.DayOfWeek, CASE WHEN DATEPART(WEEKDAY, a.AttendanceDate) = 1 THEN 7 ELSE DATEPART(WEEKDAY, a.AttendanceDate) - 1 END)
          WHERE sa.EmployeeID = a.EmployeeID
            AND a.AttendanceDate BETWEEN sa.EffectiveFrom AND ISNULL(sa.EffectiveTo, a.AttendanceDate)
          ORDER BY sa.EffectiveFrom DESC
        ) sched
        WHERE a.AttendanceDate BETWEEN @from AND @to
          AND a.AttendanceDate <= CAST(GETDATE() AS DATE)
        ORDER BY a.AttendanceDate DESC, a.MorningTimeIn DESC;
      `)

    console.log(`[perf] /attendance/raw-range from=${from} to=${to} rows=${result.recordset?.length || 0} ms=${Date.now() - t0}`)
    res.json(result.recordset || [])
  } catch (err) {
    console.error(`[perf] /attendance/raw-range failed from=${from} to=${to} after ${Date.now() - t0}ms`, err)
    res.status(500).json({ error: err.message })
  }
})

app.get('/ping-db', async (req, res) => {
  try {
    const pool = await getPool()
    const ver = await pool.request().query('SELECT @@VERSION as version')
    const count = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.Employees')
    res.json({ ok: true, version: ver.recordset[0].version, employees: count.recordset[0].cnt })
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message })
  }
})

app.post('/employees', async (req, res) => {
  const { name, position, department, email, phone, biometricStaffCode, biometricUserId, BiometricStaffCode, BiometricUserID } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()

    const fullName = (name || '').trim()
    const parts = fullName.split(/\s+/)
    const firstName = parts.shift() || ''
    const lastName = parts.join(' ') || ''
    const employeeCode = `EMP${Date.now()}`
    const incomingStaffCode = (biometricStaffCode ?? BiometricStaffCode ?? null) ? String(biometricStaffCode ?? BiometricStaffCode).trim() : null
    const incomingUserId = (biometricUserId ?? BiometricUserID ?? null) ? String(biometricUserId ?? BiometricUserID).trim() : null

    const biometricConflict = await findEmployeeBiometricConflict(pool, {
      biometricStaffCode: incomingStaffCode,
      biometricUserId: incomingUserId
    })
    if (biometricConflict) {
      return res.status(409).json({ error: getBiometricConflictMessage(biometricConflict) })
    }

    request.input('EmployeeID', sql.NVarChar(36), randomUUID())
    request.input('EmployeeCode', sql.NVarChar(50), employeeCode)
    request.input('FirstName', sql.NVarChar(100), firstName)
    request.input('LastName', sql.NVarChar(100), lastName)
    request.input('ContactNumber', sql.NVarChar(50), phone || null)
    request.input('Email', sql.NVarChar(150), email || null)
    request.input('HireDate', sql.Date, new Date())
    request.input('EmploymentStatus', sql.NVarChar(50), position || 'Employee')
    request.input('Department', sql.NVarChar(100), department || null)
    request.input('BiometricStaffCode', sql.NVarChar(50), incomingStaffCode)
    request.input('BiometricUserID', sql.NVarChar(50), incomingUserId)

    const insertQ = `INSERT INTO dbo.Employees (EmployeeID, EmployeeCode, FirstName, LastName, Department, BiometricStaffCode, BiometricUserID, ContactNumber, Email, HireDate, EmploymentStatus)
      OUTPUT
        INSERTED.EmployeeID AS id,
        INSERTED.EmployeeCode AS employeeCode,
        CONCAT(INSERTED.FirstName,' ',INSERTED.LastName) AS name,
        INSERTED.Department AS department,
        INSERTED.BiometricStaffCode AS biometricStaffCode,
        INSERTED.BiometricUserID AS biometricUserId,
        INSERTED.ContactNumber AS phone,
        INSERTED.Email AS email,
        INSERTED.EmploymentStatus AS position
      VALUES (@EmployeeID, @EmployeeCode, @FirstName, @LastName, @Department, @BiometricStaffCode, @BiometricUserID, @ContactNumber, @Email, @HireDate, @EmploymentStatus)`
    const result = await request.query(insertQ)
    const created = result.recordset[0]

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'CREATE_EMPLOYEE',
      tableName: 'Employees',
      recordID: created?.id || null,
      afterJson: JSON.stringify(created),
      ipAddress: req.ip
    })

    res.json(created)
  } catch (err) {
    console.error(err)
    const friendly = getEmployeeSaveErrorMessage(err)
    if (friendly) return res.status(409).json({ error: friendly })
    res.status(500).json({ error: err.message })
  }
})

app.put('/employees/:id', async (req, res) => {
  const id = req.params.id
  const { name, position, department, email, phone, biometricStaffCode, biometricUserId, BiometricStaffCode, BiometricUserID } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()

    const fullName = (name || '').trim()
    const parts = fullName.split(/\s+/)
    const firstName = parts.shift() || ''
    const lastName = parts.join(' ') || ''
    const incomingStaffCode = (biometricStaffCode ?? BiometricStaffCode ?? null) ? String(biometricStaffCode ?? BiometricStaffCode).trim() : null
    const incomingUserId = (biometricUserId ?? BiometricUserID ?? null) ? String(biometricUserId ?? BiometricUserID).trim() : null

    const biometricConflict = await findEmployeeBiometricConflict(pool, {
      employeeID: id,
      biometricStaffCode: incomingStaffCode,
      biometricUserId: incomingUserId
    })
    if (biometricConflict) {
      return res.status(409).json({ error: getBiometricConflictMessage(biometricConflict) })
    }

    const beforeRes = await pool.request()
      .input('EmployeeID', sql.NVarChar(36), id)
      .query(`
        SELECT
          EmployeeID AS id,
          EmployeeCode AS employeeCode,
          CONCAT(FirstName,' ',LastName) AS name,
          Department AS department,
          BiometricStaffCode AS biometricStaffCode,
          BiometricUserID AS biometricUserId,
          ContactNumber AS phone,
          Email AS email,
          EmploymentStatus AS position
        FROM dbo.Employees
        WHERE EmployeeID=@EmployeeID
      `)
    const before = beforeRes.recordset?.[0] || null

    request.input('EmployeeID', sql.NVarChar(36), id)
    request.input('FirstName', sql.NVarChar(100), firstName)
    request.input('LastName', sql.NVarChar(100), lastName)
    request.input('ContactNumber', sql.NVarChar(50), phone || null)
    request.input('Email', sql.NVarChar(150), email || null)
    request.input('EmploymentStatus', sql.NVarChar(50), position || 'Employee')
    request.input('Department', sql.NVarChar(100), department || null)
    request.input('BiometricStaffCode', sql.NVarChar(50), incomingStaffCode)
    request.input('BiometricUserID', sql.NVarChar(50), incomingUserId)

    const updateQ = `UPDATE dbo.Employees
      SET
        FirstName=@FirstName,
        LastName=@LastName,
        Department=@Department,
        BiometricStaffCode=@BiometricStaffCode,
        BiometricUserID=@BiometricUserID,
        ContactNumber=@ContactNumber,
        Email=@Email,
        EmploymentStatus=@EmploymentStatus
      OUTPUT
        INSERTED.EmployeeID AS id,
        INSERTED.EmployeeCode AS employeeCode,
        CONCAT(INSERTED.FirstName,' ',INSERTED.LastName) AS name,
        INSERTED.Department AS department,
        INSERTED.BiometricStaffCode AS biometricStaffCode,
        INSERTED.BiometricUserID AS biometricUserId,
        INSERTED.ContactNumber AS phone,
        INSERTED.Email AS email,
        INSERTED.EmploymentStatus AS position
      WHERE EmployeeID=@EmployeeID`
    const result = await request.query(updateQ)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    const updated = result.recordset[0]

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'UPDATE_EMPLOYEE',
      tableName: 'Employees',
      recordID: id,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: JSON.stringify(updated),
      ipAddress: req.ip
    })

    res.json(updated)
  } catch (err) {
    console.error(err)
    const friendly = getEmployeeSaveErrorMessage(err)
    if (friendly) return res.status(409).json({ error: friendly })
    res.status(500).json({ error: err.message })
  }
})

app.post('/employees/bulk-delete', async (req, res) => {
  const idsRaw = req.body?.ids
  const ids = Array.isArray(idsRaw)
    ? Array.from(new Set(idsRaw.map(v => String(v || '').trim()).filter(Boolean)))
    : []

  if (!ids.length) return res.status(400).json({ error: 'No employee IDs provided.' })

  let transaction = null
  try {
    const pool = await getPool()
    transaction = new sql.Transaction(pool)
    await transaction.begin()

    const chunkSize = 500
    let deletedTotal = 0

    for (let offset = 0; offset < ids.length; offset += chunkSize) {
      const chunk = ids.slice(offset, offset + chunkSize)
      const request = new sql.Request(transaction)

      chunk.forEach((id, idx) => {
        request.input(`id${idx}`, sql.NVarChar(36), id)
      })

      const values = chunk.map((_, idx) => `(@id${idx})`).join(',')
      const q = `
        DECLARE @Ids TABLE (EmployeeID nvarchar(36) NOT NULL PRIMARY KEY);
        INSERT INTO @Ids (EmployeeID) VALUES ${values};

        DELETE FROM dbo.EmployeeShiftAllotments WHERE EmployeeID IN (SELECT EmployeeID FROM @Ids);
        DELETE FROM dbo.AttendanceRecords WHERE EmployeeID IN (SELECT EmployeeID FROM @Ids);
        DELETE FROM dbo.BiometricScans WHERE EmployeeID IN (SELECT EmployeeID FROM @Ids);
        IF OBJECT_ID('dbo.DeviceAttendanceEvents','U') IS NOT NULL
          DELETE FROM dbo.DeviceAttendanceEvents WHERE EmployeeID IN (SELECT EmployeeID FROM @Ids);
        DELETE FROM dbo.FaceProfiles WHERE EmployeeID IN (SELECT EmployeeID FROM @Ids);
        DELETE FROM dbo.Employees WHERE EmployeeID IN (SELECT EmployeeID FROM @Ids);

        SELECT @@ROWCOUNT AS deletedEmployees;
      `

      const result = await request.query(q)
      const deletedChunk = Number(result?.recordset?.[0]?.deletedEmployees || 0)
      deletedTotal += Number.isFinite(deletedChunk) ? deletedChunk : 0
    }

    await transaction.commit()

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: ids.length === 1 ? 'DELETE_EMPLOYEE' : 'BULK_DELETE_EMPLOYEES',
      tableName: 'Employees',
      recordID: ids.length === 1 ? ids[0] : null,
      afterJson: JSON.stringify({ requested: ids.length, ids, deleted: deletedTotal }),
      ipAddress: req.ip
    })

    res.json({ success: true, requested: ids.length, deleted: deletedTotal })
  } catch (err) {
    try {
      if (transaction) await transaction.rollback()
    } catch (_) {}
    console.error(err)
    if (err?.number === 547) {
      return res.status(400).json({ error: 'Cannot delete employees because related records still exist.' })
    }
    res.status(500).json({ error: 'Bulk delete employees failed.' })
  }
})

app.delete('/employees/:id', async (req, res) => {
  const id = req.params.id
  let transaction = null
  try {
    const pool = await getPool()
    transaction = new sql.Transaction(pool)
    await transaction.begin()
    const request = new sql.Request(transaction)
    request.input('EmployeeID', sql.NVarChar(36), id)

    const exists = await request.query('SELECT 1 AS ok FROM dbo.Employees WHERE EmployeeID=@EmployeeID')
    if (!exists.recordset.length) {
      await transaction.rollback()
      return res.status(404).json({ error: 'Not found' })
    }

    const beforeRes = await request.query(`
      SELECT
        EmployeeID AS id,
        EmployeeCode AS employeeCode,
        CONCAT(FirstName,' ',LastName) AS name,
        Department AS department,
        BiometricStaffCode AS biometricStaffCode,
        BiometricUserID AS biometricUserId,
        ContactNumber AS phone,
        Email AS email,
        EmploymentStatus AS position
      FROM dbo.Employees
      WHERE EmployeeID=@EmployeeID
    `)
    const before = beforeRes.recordset?.[0] || null

    await request.query(`
      DELETE FROM dbo.EmployeeShiftAllotments WHERE EmployeeID=@EmployeeID;
      DELETE FROM dbo.AttendanceRecords WHERE EmployeeID=@EmployeeID;
      DELETE FROM dbo.BiometricScans WHERE EmployeeID=@EmployeeID;
      IF OBJECT_ID('dbo.DeviceAttendanceEvents','U') IS NOT NULL
        DELETE FROM dbo.DeviceAttendanceEvents WHERE EmployeeID=@EmployeeID;
      DELETE FROM dbo.FaceProfiles WHERE EmployeeID=@EmployeeID;
      DELETE FROM dbo.Employees WHERE EmployeeID=@EmployeeID;
    `)

    await transaction.commit()

    await writeAuditLog(pool, {
      actor: resolveAuditActor(req, null),
      action: 'DELETE_EMPLOYEE',
      tableName: 'Employees',
      recordID: id,
      beforeJson: before ? JSON.stringify(before) : null,
      ipAddress: req.ip
    })

    res.json({ success: true })
  } catch (err) {
    try {
      if (transaction) await transaction.rollback()
    } catch (_) {}
    console.error(err)
    if (err?.number === 547) {
      return res.status(400).json({ error: 'Cannot delete employee because related records still exist.' })
    }
    res.status(500).json({ error: 'Delete employee failed.' })
  }
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

process.on('SIGINT', async () => {
  try { await sql.close() } catch (e) {}
  process.exit(0)
})
