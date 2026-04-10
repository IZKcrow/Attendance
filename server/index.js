const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const sql = require('mssql')
const crypto = require('crypto')

const app = express()
const PORT = process.env.PORT || 4000
const BRIDGE_TOKEN = process.env.BRIDGE_TOKEN || 'dev-bridge-token'

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
  const email = String(req.body?.email || req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '').trim()
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Valid email is required' })
  if (!password || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

  try {
    const pool = await getPool()

    const already = await hasAnyAdminAuth(pool)
    if (already) return res.status(409).json({ error: 'Admin already exists. Use an invitation token.' })

    const { randomUUID } = require('crypto')
    const userId = randomUUID()

    await pool.request()
      .input('UserID', sql.NVarChar(36), userId)
      .input('Email', sql.NVarChar(255), email)
      .input('PasswordHash', sql.NVarChar(500), hashPassword(password))
      .input('Role', sql.NVarChar(30), 'ADMIN')
      .query('INSERT INTO dbo.AppUsers (UserID, Email, PasswordHash, Role, IsActive) VALUES (@UserID, @Email, @PasswordHash, @Role, 1)')

    const token = signToken({ sub: userId, email, role: 'ADMIN' })
    res.json({ success: true, token, user: { email, role: 'ADMIN' } })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/login', async (req, res) => {
  const email = String(req.body?.email || req.body?.username || '').trim().toLowerCase()
  const password = String(req.body?.password || '').trim()

  if (!email || !password) return res.status(400).json({ error: 'email and password are required' })

  try {
    const pool = await getPool()

    if (email === 'admin' && password === 'admin') {
      const already = await hasAnyAdminAuth(pool)
      if (!already) {
        const token = signToken({ sub: 'bootstrap', email: 'bootstrap-admin', role: 'ADMIN' }, 60 * 60)
        return res.json({ success: true, token, user: { email: 'bootstrap-admin', role: 'ADMIN' }, bootstrap: true })
      }
    }

    const r = await pool.request()
      .input('Email', sql.NVarChar(255), email)
      .query('SELECT TOP 1 UserID, Email, PasswordHash, Role, IsActive FROM dbo.AppUsers WHERE LOWER(Email)=@Email')

    if (!r.recordset?.length) return res.status(401).json({ error: 'Invalid credentials' })
    const u = r.recordset[0]
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

    const token = signToken({ sub: String(u.UserID), email: String(u.Email), role: String(u.Role) })
    res.json({ success: true, token, user: { email: u.Email, role: u.Role } })
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
  res.json({ user: { email: req.authUser.email, role: req.authUser.role } })
})

app.get('/auth/admin-users', requireAdmin, async (req, res) => {
  try {
    const pool = await getPool()
    const r = await pool.request().query(`
      SELECT Email, Role, CreatedAt, LastLoginAt
      FROM dbo.AppUsers
      WHERE Role='ADMIN' AND IsActive=1
      ORDER BY CreatedAt DESC
    `)
    res.json(r.recordset || [])
  } catch (err) {
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

    res.json({
      success: true,
      token,
      registerPath: `/register-admin?token=${encodeURIComponent(token)}${inviteEmail ? `&email=${encodeURIComponent(inviteEmail)}` : ''}`
    })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/auth/register-admin', async (req, res) => {
  const token = String(req.body?.token || '').trim()
  const email = String(req.body?.email || '').trim().toLowerCase()
  const password = String(req.body?.password || '').trim()

  if (!token) return res.status(400).json({ error: 'Invitation token is required' })
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

    const existing = await pool.request().input('Email', sql.NVarChar(255), email).query('SELECT TOP 1 UserID FROM dbo.AppUsers WHERE LOWER(Email)=@Email')
    if (existing.recordset?.length) return res.status(409).json({ error: 'Email already registered' })

    const { randomUUID } = require('crypto')
    const userId = randomUUID()

    await pool.request()
      .input('UserID', sql.NVarChar(36), userId)
      .input('Email', sql.NVarChar(255), email)
      .input('PasswordHash', sql.NVarChar(500), hashPassword(password))
      .input('Role', sql.NVarChar(30), 'ADMIN')
      .query('INSERT INTO dbo.AppUsers (UserID, Email, PasswordHash, Role, IsActive) VALUES (@UserID, @Email, @PasswordHash, @Role, 1)')

    await pool.request().input('InvitationID', sql.NVarChar(36), row.InvitationID).query('UPDATE dbo.AdminInvitations SET UsedAt=GETDATE() WHERE InvitationID=@InvitationID')

    const jwt = signToken({ sub: userId, email, role: 'ADMIN' })
    res.json({ success: true, token: jwt, user: { email, role: 'ADMIN' } })
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

    if (!u.recordset?.length) return res.json({ success: true })
    const row = u.recordset[0]
    if (!row.IsActive || String(row.Role || '').toUpperCase() !== 'ADMIN') return res.json({ success: true })

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
    res.json({ success: true, resetPath, token })
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
      SELECT TOP 1 pr.ResetID, pr.UserID, pr.Email, pr.ExpiresAt, pr.UsedAt, u.Role, u.IsActive
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

    const jwt = signToken({ sub: String(row.UserID), email: String(row.Email), role: 'ADMIN' })
    res.json({ success: true, token: jwt, user: { email: row.Email, role: 'ADMIN' } })
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

      DECLARE @EffFrom DATE = TRY_CONVERT(DATE, @EffectiveFrom);
      DECLARE @EffTo   DATE = TRY_CONVERT(DATE, @EffectiveTo);
      IF @EffFrom IS NULL BEGIN RAISERROR('Invalid effectiveFrom date', 16, 1); END
      IF (@HasEffectiveTo = 1 AND @EffTo IS NULL) BEGIN RAISERROR('Invalid effectiveTo date', 16, 1); END

      -- hard replace: remove all existing assignments for these employees
      DELETE A
      FROM dbo.EmployeeShiftAllotments A
      INNER JOIN @Emp E ON A.EmployeeID = E.EmployeeID;

      -- insert new assignments (one per employee)
      INSERT INTO dbo.EmployeeShiftAllotments (AllotmentID, EmployeeID, ShiftID, EffectiveFrom, EffectiveTo)
      SELECT NEWID(), E.EmployeeID, @ShiftID, @EffFrom, CASE WHEN @HasEffectiveTo=1 THEN @EffTo ELSE NULL END
      FROM @Emp E;
    `)

    await transaction.commit()
    const assigned = result?.rowsAffected?.[result.rowsAffected.length - 1] || 0
    res.json({ success: true, assigned, shiftID })
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
          IsActive = 1,
          LastSeenAt = GETDATE(),
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
      status,
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

app.get('/special-days', async (req, res) => res.json([]))
app.post('/special-days', async (req, res) => res.status(501).json({ error: 'Special days are not implemented in new schema' }))

app.get('/attendance/today', async (req, res) => {
  const t0 = Date.now()
  try {
    const pool = await getPool()
    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const todayDay = now.getDay() === 0 ? 7 : now.getDay()
    const q = `SELECT
      a.AttendanceID,
      a.EmployeeID,
      e.EmployeeCode,
      CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName,
      CONVERT(varchar(10), a.AttendanceDate, 23) AS AttendanceDate,
      CONVERT(varchar(5), a.MorningTimeIn, 108) AS MorningTimeIn,
      CONVERT(varchar(5), a.MorningTimeOut, 108) AS MorningTimeOut,
      CONVERT(varchar(5), a.AfternoonTimeIn, 108) AS AfternoonTimeIn,
      CONVERT(varchar(5), a.AfternoonTimeOut, 108) AS AfternoonTimeOut,
      sched.ShiftName,
      ISNULL(sched.GracePeriodMinutes, 0) AS GracePeriodMinutes,
      CONVERT(varchar(5), sched.ReqMorningIn, 108) AS RequiredMorningIn,
      CONVERT(varchar(5), sched.ReqMorningOut, 108) AS RequiredMorningOut,
      CONVERT(varchar(5), sched.ReqAfternoonIn, 108) AS RequiredAfternoonIn,
      CONVERT(varchar(5), sched.ReqAfternoonOut, 108) AS RequiredAfternoonOut,
      CASE
        WHEN sched.ReqMorningIn IS NULL THEN 'No Shift'
        WHEN a.MorningTimeIn IS NULL THEN 'Absent'
        WHEN a.MorningTimeIn < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningIn) THEN 'Early-In'
        WHEN a.MorningTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningIn) THEN 'Late'
        ELSE 'On-Time'
      END AS MorningInStatus,
      CASE
        WHEN sched.ReqMorningOut IS NULL THEN 'No Shift'
        WHEN a.MorningTimeOut IS NULL THEN 'Missing'
        WHEN a.MorningTimeOut < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningOut) THEN 'Early-Out'
        WHEN a.MorningTimeOut > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningOut) THEN 'Late-Out'
        ELSE 'On-Time'
      END AS MorningOutStatus,
      CASE
        WHEN sched.ReqAfternoonIn IS NULL THEN 'No Shift'
        WHEN a.AfternoonTimeIn IS NULL THEN 'Absent'
        WHEN a.AfternoonTimeIn < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonIn) THEN 'Early-In'
        WHEN a.AfternoonTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonIn) THEN 'Late'
        ELSE 'On-Time'
      END AS AfternoonInStatus,
      CASE
        WHEN sched.ReqAfternoonOut IS NULL THEN 'No Shift'
        WHEN a.AfternoonTimeOut IS NULL THEN 'Missing'
        WHEN a.AfternoonTimeOut < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonOut) THEN 'Early-Out'
        WHEN a.AfternoonTimeOut > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonOut) THEN 'Late-Out'
        ELSE 'On-Time'
      END AS AfternoonOutStatus,
      CASE
        WHEN a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL THEN 'Absent'
        WHEN
          (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NULL)
          OR (a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NOT NULL)
          OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NULL)
          OR (a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NOT NULL)
        THEN 'Incomplete'
        WHEN
          (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NOT NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL)
          OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NOT NULL AND a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL)
        THEN 'Half-Day'
        WHEN
          (CASE
            WHEN sched.ReqMorningIn IS NULL THEN 'No Shift'
            WHEN a.MorningTimeIn IS NULL THEN 'Absent'
            WHEN a.MorningTimeIn < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningIn) THEN 'Early-In'
            WHEN a.MorningTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningIn) THEN 'Late'
            ELSE 'On-Time'
          END) = 'Late'
          OR
          (CASE
            WHEN sched.ReqAfternoonIn IS NULL THEN 'No Shift'
            WHEN a.AfternoonTimeIn IS NULL THEN 'Absent'
            WHEN a.AfternoonTimeIn < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonIn) THEN 'Early-In'
            WHEN a.AfternoonTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonIn) THEN 'Late'
            ELSE 'On-Time'
          END) = 'Late'
        THEN 'Late'
        WHEN
          (CASE
            WHEN sched.ReqMorningOut IS NULL THEN 'No Shift'
            WHEN a.MorningTimeOut IS NULL THEN 'Missing'
            WHEN a.MorningTimeOut < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningOut) THEN 'Early-Out'
            WHEN a.MorningTimeOut > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningOut) THEN 'Late-Out'
            ELSE 'On-Time'
          END) = 'Early-Out'
          OR
          (CASE
            WHEN sched.ReqAfternoonOut IS NULL THEN 'No Shift'
            WHEN a.AfternoonTimeOut IS NULL THEN 'Missing'
            WHEN a.AfternoonTimeOut < DATEADD(MINUTE, -ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonOut) THEN 'Early-Out'
            WHEN a.AfternoonTimeOut > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonOut) THEN 'Late-Out'
            ELSE 'On-Time'
          END) = 'Early-Out'
        THEN 'Early Leave'
        ELSE ISNULL(a.Status, 'Present')
      END AS AttendanceSummary
      FROM dbo.AttendanceRecords a
      JOIN dbo.Employees e ON a.EmployeeID = e.EmployeeID
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
        JOIN dbo.ShiftDays sd ON sd.ShiftID = s.ShiftID AND sd.DayOfWeek = @todayDay
        LEFT JOIN dbo.ShiftDaySchedules dss ON dss.ShiftID = s.ShiftID AND dss.DayOfWeek = @todayDay
        WHERE sa.EmployeeID = a.EmployeeID
          AND @today BETWEEN sa.EffectiveFrom AND ISNULL(sa.EffectiveTo, @today)
        ORDER BY sa.EffectiveFrom DESC
      ) sched
      WHERE AttendanceDate = @today
      ORDER BY a.MorningTimeIn DESC`
    const result = await pool.request()
      .input('today', sql.Date, today)
      .input('todayDay', sql.Int, todayDay)
      .query(q)
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
            CONVERT(varchar(5), sp.ReqMorningIn, 108)     AS RequiredMorningIn,
            CONVERT(varchar(5), sp.ReqMorningOut, 108)    AS RequiredMorningOut,
            CONVERT(varchar(5), sp.ReqAfternoonIn, 108)   AS RequiredAfternoonIn,
            CONVERT(varchar(5), sp.ReqAfternoonOut, 108)  AS RequiredAfternoonOut,
            sp.GracePeriodMinutes,
            CASE
              WHEN a.AttendanceID IS NULL THEN 'Absent'
              WHEN
                (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NULL)
                OR (a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NOT NULL)
                OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NULL)
                OR (a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NOT NULL) THEN 'Incomplete'
              WHEN
                (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NOT NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL)
                OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NOT NULL AND a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL) THEN 'Half-Day'
              WHEN a.MorningTimeIn > DATEADD(MINUTE, sp.GracePeriodMinutes, sp.ReqMorningIn) THEN 'Late'
              WHEN a.AfternoonTimeIn IS NOT NULL
                   AND a.AfternoonTimeIn > DATEADD(MINUTE, sp.GracePeriodMinutes, sp.ReqAfternoonIn) THEN 'Late'
              WHEN a.MorningTimeOut IS NOT NULL
                   AND sp.ReqMorningOut IS NOT NULL
                   AND a.MorningTimeOut < sp.ReqMorningOut THEN 'Early Leave'
              WHEN a.AfternoonTimeOut IS NOT NULL
                   AND sp.ReqAfternoonOut IS NOT NULL
                   AND a.AfternoonTimeOut < sp.ReqAfternoonOut THEN 'Early Leave'
              ELSE 'On-Time'
            END AS AttendanceSummary
        FROM ShiftPick sp
        LEFT JOIN dbo.AttendanceRecords a
               ON a.EmployeeID = sp.EmployeeID
              AND a.AttendanceDate = sp.dt
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
            WHEN
              (a.MorningTimeIn IS NOT NULL AND a.MorningTimeOut IS NOT NULL AND a.AfternoonTimeIn IS NULL AND a.AfternoonTimeOut IS NULL)
              OR (a.AfternoonTimeIn IS NOT NULL AND a.AfternoonTimeOut IS NOT NULL AND a.MorningTimeIn IS NULL AND a.MorningTimeOut IS NULL) THEN 'Half-Day'
            WHEN sched.ReqMorningIn IS NOT NULL AND a.MorningTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqMorningIn) THEN 'Late'
            WHEN sched.ReqAfternoonIn IS NOT NULL AND a.AfternoonTimeIn IS NOT NULL
                 AND a.AfternoonTimeIn > DATEADD(MINUTE, ISNULL(sched.GracePeriodMinutes, 0), sched.ReqAfternoonIn) THEN 'Late'
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

    request.input('EmployeeID', sql.NVarChar(36), randomUUID())
    request.input('EmployeeCode', sql.NVarChar(50), employeeCode)
    request.input('FirstName', sql.NVarChar(100), firstName)
    request.input('LastName', sql.NVarChar(100), lastName)
    request.input('ContactNumber', sql.NVarChar(50), phone || null)
    request.input('Email', sql.NVarChar(150), email || null)
    request.input('HireDate', sql.Date, new Date())
    request.input('EmploymentStatus', sql.NVarChar(50), position || 'Employee')
    request.input('Department', sql.NVarChar(100), department || null)
    request.input('BiometricStaffCode', sql.NVarChar(50), (biometricStaffCode ?? BiometricStaffCode ?? null) ? String(biometricStaffCode ?? BiometricStaffCode).trim() : null)
    request.input('BiometricUserID', sql.NVarChar(50), (biometricUserId ?? BiometricUserID ?? null) ? String(biometricUserId ?? BiometricUserID).trim() : null)

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
      actor: resolveAuditActor(req, created?.employeeCode || 'UI'),
      action: 'CREATE_EMPLOYEE',
      tableName: 'Employees',
      recordID: created?.id || null,
      afterJson: JSON.stringify(created),
      ipAddress: req.ip
    })

    res.json(created)
  } catch (err) {
    console.error(err)
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
    request.input('BiometricStaffCode', sql.NVarChar(50), (biometricStaffCode ?? BiometricStaffCode ?? null) ? String(biometricStaffCode ?? BiometricStaffCode).trim() : null)
    request.input('BiometricUserID', sql.NVarChar(50), (biometricUserId ?? BiometricUserID ?? null) ? String(biometricUserId ?? BiometricUserID).trim() : null)

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
      actor: resolveAuditActor(req, updated?.employeeCode || id),
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
      actor: resolveAuditActor(req, 'UI'),
      action: 'BULK_DELETE_EMPLOYEES',
      tableName: 'Employees',
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
      actor: resolveAuditActor(req, id),
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












