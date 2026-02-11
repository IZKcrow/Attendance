# Attendance Frontend (Employees Directory)

Minimal React + Vite frontend showing employee data using MUI.

Setup

1. Install dependencies

```bash
npm install
```

2. Run dev server

```bash
npm run dev
```

Open the URL printed by Vite (typically http://localhost:5173).

Notes
- This project uses MUI for components. Sample employee data is in `src/data/employees.json`.

Mock API (optional)

You can run a local mock API using `json-server`. This project includes a `mock` script that serves `src/data/employees.json` at `http://localhost:4000/employees`.

Install dev deps and start the mock server:

```bash
npm install
npm run mock
```

Then start the frontend in another terminal:

```bash
npm run dev
```

The frontend will call `http://localhost:4000` by default. To change the API base URL, set `VITE_API_URL` in your environment.

Real MSSQL-backed API

1. Copy `.env.example` to `.env` and fill in your MSSQL credentials.

2. Install dependencies (includes server packages):

```bash
npm install
```

3. Start the backend server:

```bash
npm run server
```

4. In another terminal start the frontend:

```bash
npm run dev
```

The frontend uses `VITE_API_URL` (defaults to `http://localhost:4000`) to reach the backend.
