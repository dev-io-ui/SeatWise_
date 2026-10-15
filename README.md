# SeatWise

SeatWise is an exam timetable and seating allocation application. It contains a React/Vite client and a Node/Express API backed by MongoDB/Mongoose. The REST API is rooted at `/api/v1`.

## Requirements

- Node.js 20 or newer and npm
- MongoDB 6 or newer (local or a managed MongoDB URI)

## Setup and development

From the project root:

```powershell
npm install
Copy-Item server\.env.example server\.env
```

Edit `server\.env` before seeding:

| Variable | Purpose |
| --- | --- |
| `MONGO_URI` | MongoDB connection URI and database name |
| `JWT_SECRET` | Long, random secret used to sign login tokens |
| `CLIENT_ORIGIN` | Comma-separated browser origin allowlist; default Vite origin is `http://localhost:5173` |
| `PORT` | API port; defaults to `5000` |
| `SEED_PASSWORD` | Password assigned to the seeded Super Admin, Officer and demo students |

Use a private, randomly generated `JWT_SECRET` and `SEED_PASSWORD`; do not commit `.env`. The seed command **clears SeatWise application collections in the database named by `MONGO_URI`**, then recreates the demo dataset. Back up any existing data first.

```powershell
npm run seed
npm run dev
```

Open `http://localhost:5173`. The API listens on `http://localhost:5000`. The Vite development server proxies `/api` to the API.

Useful commands:

```powershell
npm test
npm run build
```

## Backend structure

The frontend keeps the app shell in `client/src/App.jsx`, individual screens in `client/src/pages/`, reusable interface elements in `client/src/components/`, and shared styles in `client/src/styles.css`. `client/src/Pages.jsx` and `client/src/Landing.jsx` remain compatibility exports for existing imports.

The Express API follows an MVC-style layout: `server/src/routes/` declares endpoints and applies route middleware, `server/src/controllers/` contains feature-focused handlers (students, academics, locations, exams, allocations, and reports), and `server/src/models/` contains domain-specific Mongoose schemas. The `*.controller.js` compatibility modules and `server/src/models/index.js` re-export domain modules. Shared authentication and authorization live in `server/src/middleware/`; allocation, academic conflict checks, and resource handling live in their respective domain modules.

## Seeded logins

The seed creates:

- Super Admin: `admin@test.com`
- Officer: `officer@test.com`
- Demo students: `CSE1@test.com` through `CSE15@test.com`, and corresponding EEE, ECE and MECH addresses

All seeded accounts use the exact password configured in `SEED_PASSWORD`. The demo data has Graduation, Diploma and Postgraduate programs, four departments, subjects, one building/floor/hall and a draft examination. The Officer starts unrestricted; a Super Admin can apply building and department scopes from **Officers**.

Students added manually or through the import workflow receive student accounts with the initial password specified by the administrator (minimum 12 characters). Imported password values are hashed before they are stored; the preview never returns them.

## Main workflows

1. Super Admin configures degree programs, departments and subjects, adds students and officers, and assigns officer scopes. Students can also self-register from the landing page by entering their student ID, roll number, email and program/department/year/semester. Self-registered accounts remain inactive and cannot sign in or be included in exam cohorts until a Super Admin approves them in **Students → Student registrations awaiting approval**. Existing student departments are migrated into the department catalogue on startup.
2. Staff create Buildings → Floors → Halls, with blocked seat coordinates excluded from capacity.
3. Staff create a Mid-semester, End-semester, Class Test (CL), Quiz, Practical or Other exam using a valid Degree → Year → Semester → Subject combination. The guided form separates course, schedule, optional study resources and review. A subject may be shared across multiple selected departments, and the form previews the eligible student count before creation. Leaving department selection at “All eligible departments” includes the complete active subject cohort. Student eligibility is resolved before timetable conflict checks, so overlapping exams for any shared eligible students are rejected. Restricted officers can only create exams for departments in their scope.
4. Staff select halls and auto-allocate. The seeded allocator checks row/column separation, blocked seats, capacity and duplicates before saving; failed allocations return diagnostics and suggestions.
5. While creating an exam, staff can attach up to 10 learning resources: HTTPS study links and up to five PDF/Word files (8 MiB each). Once the exam is published, assigned students find them in **Study resources**; file downloads require the student's authenticated account and published seat assignment.
6. Staff inspect and search the seat plan, swap or move a student, create a new version for a published plan, and publish. Published versions are locked. Admin and allocation actions are recorded in Audit Log.
7. Students sign in to see only their own published timetable, seat and exam learning resources, and download their server-generated timetable or hall-ticket PDF. The public landing-page lookup returns only the published exam, location and seat for the submitted roll number.
8. Any signed-in user can open **View profile** from the account control to update their name or email. Student account updates are synchronized with the student record; password changes require the current password.

Officers have read-only access to the Academic setup catalog and a paginated student directory limited to assigned departments; only Super Admins can create or change degrees, subjects, departments, and student records. Officers can see exams whose cohort overlaps their assigned departments. Shared-cohort seat plans are read-only and only show students within the officer's department and building scopes; editing, allocation changes, and reports remain restricted to plans fully within scope.

## Reports and import

Staff report URLs are under `/api/v1/reports` and require authentication. Available files include a hall seating chart PDF, attendance PDF, full timetable PDF, filtered allocation CSV and filtered Excel workbook (`halls`, `students`, `timetable`, `summary`). Student timetable and hall-ticket PDFs require the student's authenticated session.

Student import accepts `.csv` and `.xlsx` files up to 5 MiB. Use the downloadable CSV template, preview the row-level validation and duplicate errors, then explicitly commit valid rows. Import previews expire after 30 minutes.

Student lists are searched and paginated by the API. Student, exam, hall, academic catalog, officer, audit, import preview, and import error tables show at most 10 rows per page. Exam lists and timetable reports show the selected department set, with legacy single-department exams retained.

## Backup and recovery

Back up before running the seed script or performing a destructive database operation. With MongoDB Database Tools installed:

```powershell
mongodump --uri="$env:MONGO_URI" --out=.\backups\seatwise
mongorestore --uri="$env:MONGO_URI" .\backups\seatwise
```

Keep backups outside the public web root, protect them as personal data, and verify recovery in a separate database before restoring over production. `npm run seed` is a demo reset, not a recovery mechanism.

## Security notes

- Passwords are hashed with bcrypt; authentication uses a JWT in an HTTP-only cookie.
- The API enforces role checks, officer scopes, strict request schemas, CORS allowlisting, Helmet headers, and rate limits for login and public roll lookup.
- CSV values are escaped against spreadsheet formula injection. Uploads are held in memory with extension, file-count and size limits; the student importer accepts CSV/XLSX, and exam resources accept PDF/DOC/DOCX with document-signature checks.
- Keep all credentials and signing keys in environment variables. Terminate TLS at the deployment edge and set `NODE_ENV=production` so the cookie is marked `Secure`.
