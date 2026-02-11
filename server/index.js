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
  database: process.env.MSSQL_DATABASE || process.env.DB_NAME || 'FlexiAttendance',
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

async function initDbIfNeeded(pool) {
  // Create table if it doesn't exist, and seed one row if empty
  const createTable = `IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'Employees' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.Employees (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(200) NOT NULL,
    position NVARCHAR(200) NULL,
    department NVARCHAR(200) NULL,
    email NVARCHAR(200) NULL,
    phone NVARCHAR(100) NULL
  )
END`

  const seed = `IF NOT EXISTS (SELECT TOP 1 1 FROM dbo.Employees)
BEGIN
  INSERT INTO dbo.Employees (name, position, department, email, phone)
  VALUES ('John Doe','Developer','Engineering','john@example.com','555-0100')
END`

  try {
    await pool.request().batch(createTable)
    await pool.request().batch(seed)
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
    const result = await pool.request().query('SELECT id, name, position, department, email, phone FROM Employees')
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
    const request = pool.request()
    request.input('name', sql.NVarChar(200), name || '')
    request.input('position', sql.NVarChar(200), position || '')
    request.input('department', sql.NVarChar(200), department || '')
    request.input('email', sql.NVarChar(200), email || '')
    request.input('phone', sql.NVarChar(100), phone || '')
    const insertQ = `INSERT INTO Employees (name, position, department, email, phone)
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.position, INSERTED.department, INSERTED.email, INSERTED.phone
      VALUES (@name, @position, @department, @email, @phone)`
    const result = await request.query(insertQ)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/employees/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  const { name, position, department, email, phone } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('id', sql.Int, id)
    request.input('name', sql.NVarChar(200), name || '')
    request.input('position', sql.NVarChar(200), position || '')
    request.input('department', sql.NVarChar(200), department || '')
    request.input('email', sql.NVarChar(200), email || '')
    request.input('phone', sql.NVarChar(100), phone || '')
    const updateQ = `UPDATE Employees SET name=@name, position=@position, department=@department, email=@email, phone=@phone
      OUTPUT INSERTED.id, INSERTED.name, INSERTED.position, INSERTED.department, INSERTED.email, INSERTED.phone
      WHERE id=@id`
    const result = await request.query(updateQ)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/employees/:id', async (req, res) => {
  const id = parseInt(req.params.id, 10)
  try {
    const pool = await getPool()
    const result = await pool.request().input('id', sql.Int, id).query('DELETE FROM Employees WHERE id=@id')
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: 'Not found' })
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ USERS ============
app.get('/users', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM Users')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/users', async (req, res) => {
  const { FirstName, LastName, Email, PasswordHash, EmployeeID, BiometricID, FaceIDData, Role } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('UserID', sql.NVarChar(36), randomUUID())
    request.input('FirstName', sql.NVarChar(100), FirstName || '')
    request.input('LastName', sql.NVarChar(100), LastName || '')
    request.input('Email', sql.NVarChar(255), Email || '')
    request.input('PasswordHash', sql.NVarChar(255), PasswordHash || '')
    request.input('EmployeeID', sql.NVarChar(50), EmployeeID || '')
    request.input('BiometricID', sql.NVarChar(100), BiometricID || null)
    request.input('FaceIDData', sql.NVarChar(sql.MAX), FaceIDData || null)
    request.input('Role', sql.NVarChar(50), Role || 'employee')
    const q = `INSERT INTO Users (UserID, FirstName, LastName, Email, PasswordHash, EmployeeID, BiometricID, FaceIDData, Role)
      OUTPUT INSERTED.*
      VALUES (@UserID, @FirstName, @LastName, @Email, @PasswordHash, @EmployeeID, @BiometricID, @FaceIDData, @Role)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/users/:id', async (req, res) => {
  const { FirstName, LastName, Email, PasswordHash, BiometricID, FaceIDData, Role, IsActive } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('UserID', sql.NVarChar(36), req.params.id)
    request.input('FirstName', sql.NVarChar(100), FirstName || '')
    request.input('LastName', sql.NVarChar(100), LastName || '')
    request.input('Email', sql.NVarChar(255), Email || '')
    request.input('PasswordHash', sql.NVarChar(255), PasswordHash || '')
    request.input('BiometricID', sql.NVarChar(100), BiometricID || null)
    request.input('FaceIDData', sql.NVarChar(sql.MAX), FaceIDData || null)
    request.input('Role', sql.NVarChar(50), Role || 'employee')
    request.input('IsActive', sql.Bit, IsActive !== undefined ? IsActive : 1)
    const q = `UPDATE Users SET FirstName=@FirstName, LastName=@LastName, Email=@Email, PasswordHash=@PasswordHash, BiometricID=@BiometricID, FaceIDData=@FaceIDData, Role=@Role, IsActive=@IsActive
      OUTPUT INSERTED.*
      WHERE UserID=@UserID`
    const result = await request.query(q)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/users/:id', async (req, res) => {
  try {
    const pool = await getPool()
    await pool.request().input('UserID', sql.NVarChar(36), req.params.id).query('DELETE FROM Users WHERE UserID=@UserID')
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ SCHEDULE PERIODS ============
app.get('/schedule-periods', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM SchedulePeriods')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/schedule-periods', async (req, res) => {
  const { EmployeeID, PeriodName, StartDate, EndDate, CreatedBy } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('SchedulePeriodID', sql.NVarChar(36), randomUUID())
    request.input('EmployeeID', sql.NVarChar(50), EmployeeID || '')
    request.input('PeriodName', sql.NVarChar(100), PeriodName || '')
    request.input('StartDate', sql.Date, StartDate || new Date())
    request.input('EndDate', sql.Date, EndDate || new Date())
    request.input('CreatedBy', sql.NVarChar(36), CreatedBy || null)
    const q = `INSERT INTO SchedulePeriods (SchedulePeriodID, EmployeeID, PeriodName, StartDate, EndDate, CreatedBy)
      OUTPUT INSERTED.*
      VALUES (@SchedulePeriodID, @EmployeeID, @PeriodName, @StartDate, @EndDate, @CreatedBy)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/schedule-periods/:id', async (req, res) => {
  const { PeriodName, StartDate, EndDate, IsActive, UpdatedBy } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('SchedulePeriodID', sql.NVarChar(36), req.params.id)
    request.input('PeriodName', sql.NVarChar(100), PeriodName || '')
    request.input('StartDate', sql.Date, StartDate || new Date())
    request.input('EndDate', sql.Date, EndDate || new Date())
    request.input('IsActive', sql.Bit, IsActive !== undefined ? IsActive : 1)
    request.input('UpdatedBy', sql.NVarChar(36), UpdatedBy || null)
    const q = `UPDATE SchedulePeriods SET PeriodName=@PeriodName, StartDate=@StartDate, EndDate=@EndDate, IsActive=@IsActive, UpdatedBy=@UpdatedBy
      OUTPUT INSERTED.*
      WHERE SchedulePeriodID=@SchedulePeriodID`
    const result = await request.query(q)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/schedule-periods/:id', async (req, res) => {
  try {
    const pool = await getPool()
    await pool.request().input('SchedulePeriodID', sql.NVarChar(36), req.params.id).query('DELETE FROM SchedulePeriods WHERE SchedulePeriodID=@SchedulePeriodID')
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ SCHEDULE DETAILS ============
app.get('/schedule-details', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM ScheduleDetails')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/schedule-details', async (req, res) => {
  const { SchedulePeriodID, DayOfWeek, DayName, IsWorkingDay, ShiftStartTime, ShiftEndTime, BreakStartTime, BreakEndTime } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('ScheduleDetailID', sql.NVarChar(36), randomUUID())
    request.input('SchedulePeriodID', sql.NVarChar(36), SchedulePeriodID || '')
    request.input('DayOfWeek', sql.Int, DayOfWeek || 0)
    request.input('DayName', sql.NVarChar(20), DayName || '')
    request.input('IsWorkingDay', sql.Bit, IsWorkingDay !== undefined ? IsWorkingDay : 1)
    request.input('ShiftStartTime', sql.Time, ShiftStartTime || null)
    request.input('ShiftEndTime', sql.Time, ShiftEndTime || null)
    request.input('BreakStartTime', sql.Time, BreakStartTime || null)
    request.input('BreakEndTime', sql.Time, BreakEndTime || null)
    const q = `INSERT INTO ScheduleDetails (ScheduleDetailID, SchedulePeriodID, DayOfWeek, DayName, IsWorkingDay, ShiftStartTime, ShiftEndTime, BreakStartTime, BreakEndTime)
      OUTPUT INSERTED.*
      VALUES (@ScheduleDetailID, @SchedulePeriodID, @DayOfWeek, @DayName, @IsWorkingDay, @ShiftStartTime, @ShiftEndTime, @BreakStartTime, @BreakEndTime)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/schedule-details/:id', async (req, res) => {
  const { DayOfWeek, DayName, IsWorkingDay, ShiftStartTime, ShiftEndTime, BreakStartTime, BreakEndTime } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('ScheduleDetailID', sql.NVarChar(36), req.params.id)
    request.input('DayOfWeek', sql.Int, DayOfWeek || 0)
    request.input('DayName', sql.NVarChar(20), DayName || '')
    request.input('IsWorkingDay', sql.Bit, IsWorkingDay !== undefined ? IsWorkingDay : 1)
    request.input('ShiftStartTime', sql.Time, ShiftStartTime || null)
    request.input('ShiftEndTime', sql.Time, ShiftEndTime || null)
    request.input('BreakStartTime', sql.Time, BreakStartTime || null)
    request.input('BreakEndTime', sql.Time, BreakEndTime || null)
    const q = `UPDATE ScheduleDetails SET DayOfWeek=@DayOfWeek, DayName=@DayName, IsWorkingDay=@IsWorkingDay, ShiftStartTime=@ShiftStartTime, ShiftEndTime=@ShiftEndTime, BreakStartTime=@BreakStartTime, BreakEndTime=@BreakEndTime
      OUTPUT INSERTED.*
      WHERE ScheduleDetailID=@ScheduleDetailID`
    const result = await request.query(q)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/schedule-details/:id', async (req, res) => {
  try {
    const pool = await getPool()
    await pool.request().input('ScheduleDetailID', sql.NVarChar(36), req.params.id).query('DELETE FROM ScheduleDetails WHERE ScheduleDetailID=@ScheduleDetailID')
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ ATTENDANCE RECORDS ============
app.get('/attendance-records', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM AttendanceRecords')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/attendance-records', async (req, res) => {
  const { EmployeeID, AttendanceDate, SchedulePeriodID, ExpectedShiftStart, ExpectedShiftEnd, ActualTimeIn, ActualTimeOut, Status, AuthenticationSource, Notes } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('AttendanceRecordID', sql.NVarChar(36), randomUUID())
    request.input('EmployeeID', sql.NVarChar(50), EmployeeID || '')
    request.input('AttendanceDate', sql.Date, AttendanceDate || new Date())
    request.input('SchedulePeriodID', sql.NVarChar(36), SchedulePeriodID || null)
    request.input('ExpectedShiftStart', sql.Time, ExpectedShiftStart || null)
    request.input('ExpectedShiftEnd', sql.Time, ExpectedShiftEnd || null)
    request.input('ActualTimeIn', sql.Time, ActualTimeIn || null)
    request.input('ActualTimeOut', sql.Time, ActualTimeOut || null)
    request.input('Status', sql.NVarChar(50), Status || 'absent')
    request.input('AuthenticationSource', sql.NVarChar(50), AuthenticationSource || null)
    request.input('Notes', sql.NVarChar(500), Notes || null)
    const q = `INSERT INTO AttendanceRecords (AttendanceRecordID, EmployeeID, AttendanceDate, SchedulePeriodID, ExpectedShiftStart, ExpectedShiftEnd, ActualTimeIn, ActualTimeOut, Status, AuthenticationSource, Notes)
      OUTPUT INSERTED.*
      VALUES (@AttendanceRecordID, @EmployeeID, @AttendanceDate, @SchedulePeriodID, @ExpectedShiftStart, @ExpectedShiftEnd, @ActualTimeIn, @ActualTimeOut, @Status, @AuthenticationSource, @Notes)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/attendance-records/:id', async (req, res) => {
  const { ActualTimeIn, ActualTimeOut, Status, AuthenticationSource, Notes } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('AttendanceRecordID', sql.NVarChar(36), req.params.id)
    request.input('ActualTimeIn', sql.Time, ActualTimeIn || null)
    request.input('ActualTimeOut', sql.Time, ActualTimeOut || null)
    request.input('Status', sql.NVarChar(50), Status || 'absent')
    request.input('AuthenticationSource', sql.NVarChar(50), AuthenticationSource || null)
    request.input('Notes', sql.NVarChar(500), Notes || null)
    const q = `UPDATE AttendanceRecords SET ActualTimeIn=@ActualTimeIn, ActualTimeOut=@ActualTimeOut, Status=@Status, AuthenticationSource=@AuthenticationSource, Notes=@Notes
      OUTPUT INSERTED.*
      WHERE AttendanceRecordID=@AttendanceRecordID`
    const result = await request.query(q)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/attendance-records/:id', async (req, res) => {
  try {
    const pool = await getPool()
    await pool.request().input('AttendanceRecordID', sql.NVarChar(36), req.params.id).query('DELETE FROM AttendanceRecords WHERE AttendanceRecordID=@AttendanceRecordID')
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ BIOMETRIC SCANS ============
app.get('/biometric-scans', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM BiometricScans')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/biometric-scans', async (req, res) => {
  const { EmployeeID, ScanTime, ScanType, AuthenticationMethod, IsSuccessful, Latitude, Longitude, DeviceID } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('BiometricScanID', sql.NVarChar(36), randomUUID())
    request.input('EmployeeID', sql.NVarChar(50), EmployeeID || '')
    request.input('ScanTime', sql.DateTime, ScanTime || new Date())
    request.input('ScanType', sql.NVarChar(50), ScanType || '')
    request.input('AuthenticationMethod', sql.NVarChar(50), AuthenticationMethod || '')
    request.input('IsSuccessful', sql.Bit, IsSuccessful !== undefined ? IsSuccessful : 1)
    request.input('Latitude', sql.Decimal(10,8), Latitude || null)
    request.input('Longitude', sql.Decimal(11,8), Longitude || null)
    request.input('DeviceID', sql.NVarChar(100), DeviceID || null)
    const q = `INSERT INTO BiometricScans (BiometricScanID, EmployeeID, ScanTime, ScanType, AuthenticationMethod, IsSuccessful, Latitude, Longitude, DeviceID)
      OUTPUT INSERTED.*
      VALUES (@BiometricScanID, @EmployeeID, @ScanTime, @ScanType, @AuthenticationMethod, @IsSuccessful, @Latitude, @Longitude, @DeviceID)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/biometric-scans/:id', async (req, res) => {
  try {
    const pool = await getPool()
    await pool.request().input('BiometricScanID', sql.NVarChar(36), req.params.id).query('DELETE FROM BiometricScans WHERE BiometricScanID=@BiometricScanID')
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ AUDIT LOGS ============
app.get('/audit-logs', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM AuditLogs ORDER BY CreatedAt DESC')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/audit-logs', async (req, res) => {
  const { UserID, Action, TableName, RecordID, OldValues, NewValues } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('AuditLogID', sql.NVarChar(36), randomUUID())
    request.input('UserID', sql.NVarChar(36), UserID || null)
    request.input('Action', sql.NVarChar(100), Action || '')
    request.input('TableName', sql.NVarChar(100), TableName || null)
    request.input('RecordID', sql.NVarChar(36), RecordID || null)
    request.input('OldValues', sql.NVarChar(sql.MAX), OldValues || null)
    request.input('NewValues', sql.NVarChar(sql.MAX), NewValues || null)
    const q = `INSERT INTO AuditLogs (AuditLogID, UserID, Action, TableName, RecordID, OldValues, NewValues)
      OUTPUT INSERTED.*
      VALUES (@AuditLogID, @UserID, @Action, @TableName, @RecordID, @OldValues, @NewValues)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

// ============ SPECIAL DAYS ============
app.get('/special-days', async (req, res) => {
  try {
    const pool = await getPool()
    const result = await pool.request().query('SELECT * FROM SpecialDays')
    res.json(result.recordset)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/special-days', async (req, res) => {
  const { SpecialDate, DayType, Description, CreatedBy } = req.body
  try {
    const pool = await getPool()
    const { randomUUID } = require('crypto')
    const request = pool.request()
    request.input('SpecialDayID', sql.NVarChar(36), randomUUID())
    request.input('SpecialDate', sql.Date, SpecialDate || new Date())
    request.input('DayType', sql.NVarChar(50), DayType || '')
    request.input('Description', sql.NVarChar(200), Description || null)
    request.input('CreatedBy', sql.NVarChar(36), CreatedBy || null)
    const q = `INSERT INTO SpecialDays (SpecialDayID, SpecialDate, DayType, Description, CreatedBy)
      OUTPUT INSERTED.*
      VALUES (@SpecialDayID, @SpecialDate, @DayType, @Description, @CreatedBy)`
    const result = await request.query(q)
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.put('/special-days/:id', async (req, res) => {
  const { SpecialDate, DayType, Description } = req.body
  try {
    const pool = await getPool()
    const request = pool.request()
    request.input('SpecialDayID', sql.NVarChar(36), req.params.id)
    request.input('SpecialDate', sql.Date, SpecialDate || new Date())
    request.input('DayType', sql.NVarChar(50), DayType || '')
    request.input('Description', sql.NVarChar(200), Description || null)
    const q = `UPDATE SpecialDays SET SpecialDate=@SpecialDate, DayType=@DayType, Description=@Description
      OUTPUT INSERTED.*
      WHERE SpecialDayID=@SpecialDayID`
    const result = await request.query(q)
    if (!result.recordset.length) return res.status(404).json({ error: 'Not found' })
    res.json(result.recordset[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.delete('/special-days/:id', async (req, res) => {
  try {
    const pool = await getPool()
    await pool.request().input('SpecialDayID', sql.NVarChar(36), req.params.id).query('DELETE FROM SpecialDays WHERE SpecialDayID=@SpecialDayID')
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`)
})

process.on('SIGINT', async () => {
  try { await sql.close() } catch (e) {}
  process.exit(0)
})
