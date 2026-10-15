import 'dotenv/config';
import mongoose from 'mongoose'; import bcrypt from 'bcryptjs';
import { User, Student, Subject, Building, Floor, Hall, Exam, ExamResource, Program, Department, SeatingAllocation, AllocationPlan, AuditLog, ImportBatch, AllocationLock } from './models/index.js';
const pw = process.env.SEED_PASSWORD; if (!pw) throw new Error('Set SEED_PASSWORD in .env');
await mongoose.connect(process.env.MONGO_URI);
await Promise.all([AllocationLock, SeatingAllocation, AllocationPlan, AuditLog, ImportBatch, ExamResource, User, Student, Subject, Hall, Floor, Building, Exam, Program, Department].map(m => m.deleteMany({})));
const hash = await bcrypt.hash(pw, 10);
await Program.insertMany([
  { name: 'Graduation', years: [1, 2, 3, 4], semesters: [1, 2, 3, 4, 5, 6, 7, 8] },
  { name: 'Diploma', years: [1, 2, 3], semesters: [1, 2, 3, 4, 5, 6] },
  { name: 'Postgraduate', years: [1, 2], semesters: [1, 2, 3, 4] }
]);
await User.create([
  { name: 'Super Admin', email: 'admin@test.com', passwordHash: hash, role: 'superadmin' },
  { name: 'Officer', email: 'officer@test.com', passwordHash: hash, role: 'officer' }
]);
const b = await Building.create({ name: 'Building A', code: 'A' });
const floor = await Floor.create({ name: 'First Floor', code: 'F1', building: b.id });
const hall = await Hall.create({ name: 'Hall A-101', code: 'A-101', building: b.id, floor: floor.id, rows: 8, cols: 10, blocked: [{ r: 0, c: 0 }] });
const depts = ['CSE', 'EEE', 'ECE', 'MECH']; const studs = [];
await Department.insertMany(depts.map((name) => ({ name, code: name })));
for (const d of depts) for (let i = 1; i <= 15; i++) studs.push({ studentId: `${d}${i}`, name: `${d} Student ${i}`, rollNumber: `${d}-${100 + i}`, email: `${d}${i}@test.com`, program: 'Graduation', department: d, year: 2, semester: 3, section: 'A' });
const created = await Student.insertMany(studs);
for (const s of created) await User.create({ name: s.name, email: s.email.toLowerCase(), passwordHash: hash, role: 'student', student: s.id });
const subs = await Subject.insertMany([['Data Structures', 'CS201', 'Graduation', 2, 3], ['Digital Logic', 'EC202', 'Graduation', 2, 3], ['Engineering Maths I', 'MA101', 'Graduation', 1, 1], ['Workshop Practice', 'DP101', 'Diploma', 1, 1]].map(([name, code, program, year, semester]) => ({ name, code, program, year, semester })));
await Exam.create({ name: 'Mid-Sem', examType: 'Mid-semester', subject: 'Data Structures', subjectCode: 'CS201', program: 'Graduation', year: 2, semester: 3, date: new Date('2026-11-02'), startTime: '09:00', endTime: '12:00', eligible: created.map(s => s.id) });
console.log(`Seeded SeatWise. Admin: admin@test.com, Officer: officer@test.com, password: SEED_PASSWORD. Hall: ${hall.code}`);
await mongoose.disconnect();
