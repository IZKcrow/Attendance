There are 3 main parts:

The Biometric device (the scanner)
The Server + Database (the brain + filing cabinet)
The Website (the screen that admins use)
1) What the biometric device really gives you
The device is like a punch clock on a wall.

When someone scans, the device usually stores only things like:

“User 248 scanned”
“Time: 8:02 AM”
maybe a mode (finger/face)
It does not reliably store the full employee profile (full name, department, schedule rules).
That’s why you can have logs with StaffCode/UserID but blank names.

So the device is not your “employee database”. It’s only a “scan event recorder”.

2) Why the server/database is needed
The server + SQL Server database is where the real company rules live:

Employee list (names, departments, codes)
Shift schedules (8–12 and 1–5, grace period, etc.)
Attendance rules (late, early leave, half-day)
Reports (weekly/monthly)
Audit log (which admin changed what)
This is why your system can become “smart”.
The device alone can’t do that.

3) What the website does
The website is like your admin dashboard:

Add/edit employees
Assign shifts
View attendance today / range
Generate reports
See imported device logs
Manage admin accounts
The website does not compute everything by itself.
It mostly asks the server for data, then displays it nicely.

The most important concept: “Raw logs” vs “Attendance record”
Your system stores two different kinds of data:

A) Imported Logs (Raw device events)
This is the “paper trail” of what the device said.

Example:

Device 88
StaffCode 248
EventTime 2026-04-13 08:02
This is stored in something like DeviceAttendanceEvents.

It’s useful because:

You can re-check what the scanner actually produced
You can deduplicate (avoid importing the same scan twice)
It’s evidence
But raw logs don’t automatically mean “attendance is complete”.

B) AttendanceRecords (Daily summary per employee)
This is where the system becomes “attendance” instead of “just logs”.

For each employee per day, you store:

Morning Time In
Morning Time Out
Afternoon Time In
Afternoon Time Out
Status (On-Time, Late, Early Leave, Half-Day, Absent, etc.)
This is what your dashboard and reports mainly use.

So the flow is basically:
Device Logs → Imported Logs → AttendanceRecords → Dashboard/Reports

How it decides Late / Early Leave / Half-day / Absent
The server compares:

what time they scanned
vs
what time they were supposed to scan (shift schedule)
Your policy update means:

If they time in early → no extra credit
If they time in late → deduct
If they time out late → no extra credit
If they time out early → deduct
So the system clamps the “paid hours” to the shift window:

early does not add
late reduces
And that’s why you changed Hours display to “7 hrs 55 mins” instead of “7.92”.

Why you have both React and C# (and how they communicate)
React/Node is great for the website and database, but it cannot talk to the biometric SDK directly.

The C# app can talk to the device because:

It loads the TM200 SDK DLLs
It opens CommPort / IP / device ID
It reads logs from the device
So your architecture becomes:

Website tells the server: “Sync device 88”
Server places a “job”
C# bridge picks up the job, connects to the device, downloads logs
C# sends the results back to the server
Server stores them → website displays them
That makes the website able to “command” a sync without the browser needing device drivers.

