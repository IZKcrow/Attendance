const express = require('express')
const cors = require('cors')
const bodyParser = require('body-parser')
const sql = require('mssql')

const app = express()
const PORT = process.env.PORT || 4000

app.use(cors())
app.use(bodyParser.json())

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
  requestTimeout: 15000
}

// Log the effective DB connection (without password)
console.log('DB config:', {
  user: dbConfig.user,
  server: dbConfig.server,
  instanceName: dbConfig.options.instanceName,
  database: dbConfig.database,
  port: dbConfig.port
})

let poolPromise = null

// Helper to normalize various time inputs into HH:mm:ss.
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

  // ISO-like datetime: keep literal clock part to avoid timezone shifts.
  const isoMatch = raw.match(/T(\d{2}):(\d{2})(?::(\d{2}))?/)
  if (isoMatch) {
    return toLiteral(Number(isoMatch[1]), Number(isoMatch[2]), Number(isoMatch[3] || 0))
  }

  // 12-hour input, e.g. 8:00 AM
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

  // 24-hour input, e.g. 08:00 or 08:00:00
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

async function initDbIfNeeded(pool) {
  // Create FlexiAttendanceSystem schema tables if they don't exist
  // Split into separate statements to avoid SQL batch issues

  const tableStatements = [
    // Employees
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

    // ShiftDefinitions
    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftDefinitions' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftDefinitions (
    ShiftID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftName NVARCHAR(100) NOT NULL,
    MorningTimeIn TIME(7) NOT NULL,
    MorningTimeOut TIME(7) NOT NULL,
    AfternoonTimeIn TIME(7) NOT NULL,
    AfternoonTimeOut TIME(7) NOT NULL,
    GracePeriodMinutes INT DEFAULT 5,
    CreatedAt DATETIME DEFAULT GETDATE(),
    UpdatedAt DATETIME NULL
  )
END`,

    // ShiftDays
    `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ShiftDays' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.ShiftDays (
    ShiftDayID UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    ShiftID UNIQUEIDENTIFIER NOT NULL,
    DayOfWeek INT NOT NULL CHECK (DayOfWeek BETWEEN 1 AND 7),
    FOREIGN KEY (ShiftID) REFERENCES dbo.ShiftDefinitions(ShiftID) ON DELETE CASCADE
  )
END`,

    // ShiftDaySchedules (day-specific times under one ShiftID)
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

    // EmployeeShiftAllotments
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

    // AttendanceRecords
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

    // View (split DROP and CREATE so CREATE is first in its batch)
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

    // Stored Procedure
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
    // Migration: add missing columns to existing tables if needed
    const migrationStatements = [
      `IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Employees') AND name = 'Department')
BEGIN
  ALTER TABLE dbo.Employees ADD Department NVARCHAR(100) NULL
END`
    ]
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
    // ensure initialization completes after connection
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
          e.ContactNumber AS phone,
          e.Email AS email,
          e.HireDate,
          latestShift.ShiftName AS assignedShift
        FROM dbo.Employees e
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

// Compatibility: map old Users endpoint to Employees (lightweight)
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



// Compatibility: schedule-periods -> list shift definitions (periods)
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

    // Remove allotments first to satisfy FK constraints, then remove shift definition.
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

// Create a shift definition
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
    // insert days
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

// Bulk: create shifts/allotments for an employee (used by Scheduler)
app.post('/schedule-details/bulk', async (req, res) => {
  const { employeeID, schedule, EffectiveFrom, EffectiveTo } = req.body
  if (!Array.isArray(schedule)) return res.status(400).json({ error: 'schedule must be an array' })
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    // Group schedule rows by identical time patterns to create one shift with multiple days
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
      // create allotment for employee
      // Use provided EffectiveFrom/EffectiveTo if supplied; otherwise EffectiveFrom defaults to today and EffectiveTo remains NULL (ongoing)
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

// Assign an existing shift to many employees (or all employees)
app.post('/shift-assignments/bulk', async (req, res) => {
  const { shiftID, employeeIDs, assignAll, effectiveFrom, effectiveTo } = req.body

  if (!shiftID) return res.status(400).json({ error: 'shiftID is required' })

  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')

    const shiftExists = await pool.request()
      .input('ShiftID', sql.NVarChar(36), shiftID)
      .query('SELECT 1 AS ok FROM dbo.ShiftDefinitions WHERE ShiftID=@ShiftID')
    if (!shiftExists.recordset.length) return res.status(404).json({ error: 'Shift not found' })

    let targetEmployeeIDs = []
    if (assignAll) {
      const allEmp = await pool.request().query('SELECT EmployeeID FROM dbo.Employees')
      targetEmployeeIDs = allEmp.recordset.map((r) => r.EmployeeID)
    } else if (Array.isArray(employeeIDs)) {
      targetEmployeeIDs = employeeIDs.filter(Boolean)
    }

    if (!targetEmployeeIDs.length) return res.status(400).json({ error: 'No employees selected' })

    const effFrom = effectiveFrom ? new Date(effectiveFrom) : new Date()
    if (Number.isNaN(effFrom.getTime())) return res.status(400).json({ error: 'Invalid effectiveFrom date' })
    const effTo = effectiveTo ? new Date(effectiveTo) : null
    if (effTo && Number.isNaN(effTo.getTime())) return res.status(400).json({ error: 'Invalid effectiveTo date' })

    let assigned = 0
    for (const empID of targetEmployeeIDs) {
      // Keep one assignment per employee/effective date and close open overlaps.
      await pool.request()
        .input('EmployeeID', sql.NVarChar(36), empID)
        .input('EffectiveFrom', sql.Date, effFrom)
        .query(`
          DELETE FROM dbo.EmployeeShiftAllotments
          WHERE EmployeeID=@EmployeeID AND EffectiveFrom=@EffectiveFrom;

          UPDATE dbo.EmployeeShiftAllotments
          SET EffectiveTo = DATEADD(DAY, -1, @EffectiveFrom)
          WHERE EmployeeID=@EmployeeID
            AND EffectiveFrom < @EffectiveFrom
            AND (EffectiveTo IS NULL OR EffectiveTo >= @EffectiveFrom);
        `)

      const reqAll = pool.request()
      reqAll.input('AllotmentID', sql.NVarChar(36), randomUUID())
      reqAll.input('EmployeeID', sql.NVarChar(36), empID)
      reqAll.input('ShiftID', sql.NVarChar(36), shiftID)
      reqAll.input('EffectiveFrom', sql.Date, effFrom)
      reqAll.input('EffectiveTo', sql.Date, effTo)
      await reqAll.query(`
        INSERT INTO dbo.EmployeeShiftAllotments (AllotmentID, EmployeeID, ShiftID, EffectiveFrom, EffectiveTo)
        VALUES (@AllotmentID, @EmployeeID, @ShiftID, @EffectiveFrom, @EffectiveTo)
      `)
      assigned += 1
    }

    res.json({ success: true, assigned, shiftID })
  } catch (err) {
    console.error('shift assignment failed', err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/attendance/log', async (req, res) => {
  const { employeeCode, logType } = req.body

  try {
    const pool = await getPool()

    const today = new Date()
    const todayStr = today.toISOString().split('T')[0]
    const currentTime = today.toTimeString().split(' ')[0]
    const todayDay = today.getDay() === 0 ? 7 : today.getDay() // Monday=1 ... Sunday=7

    // 1️⃣ Get employee
    const empResult = await pool.request()
      .input('EmployeeCode', sql.NVarChar(50), employeeCode)
      .query(`SELECT EmployeeID FROM dbo.Employees WHERE EmployeeCode=@EmployeeCode`)

    if (!empResult.recordset.length)
      return res.status(404).json({ error: 'Employee not found' })

    const employeeID = empResult.recordset[0].EmployeeID

    // 2️⃣ Get active shift
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

    if (!shiftResult.recordset.length)
      return res.status(400).json({ error: 'No shift assigned' })

    const shift = shiftResult.recordset[0]

    // 3️⃣ Ensure attendance row exists
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

    // 4️⃣ Determine late / early
    let minutesLate = 0
    let minutesEarly = 0
    let status = 'On-Time'

    if (logType === 'MORNING_IN') {
      const diff = await pool.request()
        .input('Actual', sql.NVarChar(8), parseTimeString(currentTime))
        .input('Required', sql.NVarChar(8), toTimeLiteral(shift.MorningTimeIn))
        .query(`SELECT DATEDIFF(MINUTE, CAST(@Required AS TIME(7)), CAST(@Actual AS TIME(7))) AS diff`)
      
      minutesLate = Math.max(0, diff.recordset[0].diff - shift.GracePeriodMinutes)
      if (minutesLate > 0) status = 'Late'
    }

    if (logType === 'AFTERNOON_OUT') {
      const diff = await pool.request()
        .input('Actual', sql.NVarChar(8), parseTimeString(currentTime))
        .input('Required', sql.NVarChar(8), toTimeLiteral(shift.AfternoonTimeOut))
        .query(`SELECT DATEDIFF(MINUTE, CAST(@Actual AS TIME(7)), CAST(@Required AS TIME(7))) AS diff`)
      
      minutesEarly = Math.max(0, diff.recordset[0].diff)
      if (minutesEarly > 0) status = 'Early Leave'
    }

    // 5️⃣ Update attendance record
    const columnMap = {
      MORNING_IN: 'MorningTimeIn',
      MORNING_OUT: 'MorningTimeOut',
      AFTERNOON_IN: 'AfternoonTimeIn',
      AFTERNOON_OUT: 'AfternoonTimeOut'
    }

    const column = columnMap[logType]

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

    res.json({
      success: true,
      logType,
      time: currentTime,
      minutesLate,
      minutesEarly,
      status
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})


// Compatibility stubs for other old endpoints to avoid 500s
app.get('/biometric-scans', async (req, res) => res.json([]))
app.post('/biometric-scans', async (req, res) => res.status(501).json({ error: 'Biometric scans are not implemented in new schema' }))
app.get('/audit-logs', async (req, res) => res.json([]))
app.post('/audit-logs', async (req, res) => res.status(501).json({ error: 'Audit logs are not implemented in new schema' }))
app.get('/special-days', async (req, res) => res.json([]))
app.post('/special-days', async (req, res) => res.status(501).json({ error: 'Special days are not implemented in new schema' }))

// Today's attendance (compatibility for /attendance/today)
app.get('/attendance/today', async (req, res) => {
  try {
    const pool = await getPool()
    const today = new Date().toISOString().split('T')[0]
    const q = `SELECT a.AttendanceID, a.EmployeeID, e.EmployeeCode, CONCAT(e.FirstName,' ',e.LastName) AS EmployeeName, a.AttendanceDate, a.MorningTimeIn, a.MorningTimeOut, a.AfternoonTimeIn, a.AfternoonTimeOut, a.Status
      FROM dbo.AttendanceRecords a
      JOIN dbo.Employees e ON a.EmployeeID = e.EmployeeID
      WHERE AttendanceDate = @today
      ORDER BY a.MorningTimeIn DESC`
    const result = await pool.request().input('today', sql.Date, today).query(q)
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Health endpoint to verify DB connection and row count
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
  const { name, position, department, email, phone } = req.body
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

    const insertQ = `INSERT INTO dbo.Employees (EmployeeID, EmployeeCode, FirstName, LastName, Department, ContactNumber, Email, HireDate, EmploymentStatus)
      OUTPUT INSERTED.EmployeeID AS id, INSERTED.EmployeeCode AS employeeCode, CONCAT(INSERTED.FirstName,' ',INSERTED.LastName) AS name, INSERTED.Department AS department, INSERTED.ContactNumber AS phone, INSERTED.Email AS email, INSERTED.EmploymentStatus AS position
      VALUES (@EmployeeID, @EmployeeCode, @FirstName, @LastName, @Department, @ContactNumber, @Email, @HireDate, @EmploymentStatus)`
    const result = await request.query(insertQ)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/employees/:id', async (req, res) => {
  const id = req.params.id
  const { name, position, department, email, phone } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()

    const fullName = (name || '').trim()
    const parts = fullName.split(/\s+/)
    const firstName = parts.shift() || ''
    const lastName = parts.join(' ') || ''

    request.input('EmployeeID', sql.NVarChar(36), id)
    request.input('FirstName', sql.NVarChar(100), firstName)
    request.input('LastName', sql.NVarChar(100), lastName)
    request.input('ContactNumber', sql.NVarChar(50), phone || null)
    request.input('Email', sql.NVarChar(150), email || null)
    request.input('EmploymentStatus', sql.NVarChar(50), position || 'Employee')
    request.input('Department', sql.NVarChar(100), department || null)

    const updateQ = `UPDATE dbo.Employees SET FirstName=@FirstName, LastName=@LastName, Department=@Department, ContactNumber=@ContactNumber, Email=@Email, EmploymentStatus=@EmploymentStatus
      OUTPUT INSERTED.EmployeeID AS id, INSERTED.EmployeeCode AS employeeCode, CONCAT(INSERTED.FirstName,' ',INSERTED.LastName) AS name, INSERTED.Department AS department, INSERTED.ContactNumber AS phone, INSERTED.Email AS email, INSERTED.EmploymentStatus AS position
      WHERE EmployeeID=@EmployeeID`
    const result = await request.query(updateQ)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/employees/:id', async (req, res) => {
  const id = req.params.id
  try {
    const pool = await getPool()
    const result = await pool.request().input('EmployeeID', sql.NVarChar(36), id).query('DELETE FROM dbo.Employees WHERE EmployeeID=@EmployeeID')
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// Old Users and SchedulePeriods endpoints removed - tables no longer exist in FlexiAttendanceSystem schema

// Old ScheduleDetails endpoints removed - table no longer exists in FlexiAttendanceSystem schema

// Old endpoint sections removed - tables no longer exist in FlexiAttendanceSystem schema

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

process.on('SIGINT', async () => {
  try { await sql.close() } catch (e) {}
  process.exit(0)
})
