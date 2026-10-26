import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Student, Program, Department, AuditLog } from '../models/index.js';
import { authenticate, sign } from '../middleware/auth.js';
import { wrap } from './shared.js';

export { authenticate };

export const post_auth_login_1 = wrap(async (q, s) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(q.body);
  const u = await User.findOne({ email: email.toLowerCase() }).populate('student');
  if (!u || !(await bcrypt.compare(password, u.passwordHash))) return s.status(401).json({ error: 'Invalid credentials' });
  if (u.registrationStatus === 'pending' || (u.role === 'student' && u.student?.registrationStatus === 'pending')) {
    return s.status(403).json({ error: 'Your student registration is awaiting Super Admin approval.' });
  }
  if (u.registrationStatus === 'rejected' || (u.role === 'student' && u.student?.registrationStatus === 'rejected')) {
    return s.status(403).json({ error: 'Your student registration was not approved. Contact your institution administrator.' });
  }
  if (u.role === 'student' && (!u.student || !u.student.active || u.student.registrationStatus !== 'approved')) {
    return s.status(403).json({ error: 'Your student account is not ready. Contact your institution administrator.' });
  }
  if (!u.active) return s.status(401).json({ error: 'Invalid credentials' });
  s.cookie('token', sign(u), { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
  s.json({ user: profileUser(u) });
});

export const get_auth_registration_options_2 = wrap(async (q, s) => {
  const [programs, departments] = await Promise.all([
    Program.find().sort('name').select('name code years semesters').lean(),
    Department.find({ active: true }).sort('name').select('name').lean()
  ]);
  s.json({ programs, departments: departments.map((item) => item.name) });
});

export const post_auth_register_3 = wrap(async (q, s) => {
  const body = z.object({
    studentId: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(120),
    rollNumber: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(254),
    password: z.string().min(5).max(128),
    program: z.string().trim().min(1).max(100),
    department: z.string().trim().min(1).max(80),
    year: z.coerce.number().int().min(1),
    semester: z.coerce.number().int().min(1),
    section: z.string().trim().max(40).optional().default('')
  }).strict().parse(q.body);
  const [program, department, studentExists, userExists] = await Promise.all([
    Program.findOne({ name: body.program }),
    Department.exists({ name: body.department, active: true }),
    Student.exists({ $or: [
      { studentId: body.studentId }, { rollNumber: body.rollNumber }, { email: body.email.toLowerCase() }
    ] }),
    User.exists({ email: body.email.toLowerCase() })
  ]);
  if (!program?.years.includes(body.year) || !program.semesters.includes(body.semester)) {
    return s.status(400).json({ error: 'Select a valid program, year and semester combination.' });
  }
  if (!department) return s.status(400).json({ error: 'Select an active department from the list.' });
  if (studentExists || userExists) {
    return s.status(409).json({ error: 'A student ID, roll number or email is already registered. Check the details or contact your administrator.' });
  }
  const email = body.email.toLowerCase();
  const passwordHash = await bcrypt.hash(body.password, 12);
  let student;
  try {
    student = await Student.create({
      studentId: body.studentId, name: body.name, rollNumber: body.rollNumber, email,
      program: body.program, department: body.department, year: body.year, semester: body.semester,
      section: body.section, active: false, registrationStatus: 'pending'
    });
    await User.create({
      name: body.name, email, passwordHash, role: 'student', student: student._id,
      active: false, registrationStatus: 'pending'
    });
  } catch (error) {
    if (student) await Student.deleteOne({ _id: student._id });
    if (error.code === 11000) {
      return s.status(409).json({ error: 'A student ID, roll number or email is already registered. Check the details or contact your administrator.' });
    }
    throw error;
  }
  s.status(202).json({ message: 'Registration submitted. You can sign in after a Super Admin approves your account.' });
});

export const post_auth_logout_4 = (q, s) => s.clearCookie('token').json({ ok: true });

function profileUser(user) {
  const student = user.student && typeof user.student === 'object' ? {
    studentId: user.student.studentId,
    rollNumber: user.student.rollNumber,
    program: user.student.program,
    department: user.student.department,
    year: user.student.year,
    semester: user.student.semester,
    section: user.student.section
  } : undefined;
  return { id: user.id, name: user.name, email: user.email, role: user.role, ...(student ? { student } : {}) };
}

export const get_auth_me_5 = (q, s) => s.json({ user: profileUser(q.user) });

export const patch_auth_profile_6 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(254),
    currentPassword: z.string().min(1).optional(),
    newPassword: z.string().min(5).max(128).optional()
  }).strict().parse(q.body);

  if (Boolean(body.currentPassword) !== Boolean(body.newPassword)) {
    return s.status(400).json({ error: 'Enter both your current and new password to change your password.' });
  }
  if (body.newPassword && !(await bcrypt.compare(body.currentPassword, q.user.passwordHash))) {
    return s.status(400).json({ error: 'Current password is incorrect.' });
  }

  const email = body.email.toLowerCase();
  const existingUser = await User.exists({ email, _id: { $ne: q.user._id } });
  if (existingUser) return s.status(409).json({ error: 'That email address is already in use.' });

  q.user.name = body.name;
  q.user.email = email;
  if (body.newPassword) q.user.passwordHash = await bcrypt.hash(body.newPassword, 12);
  await q.user.save();
  if (q.user.role === 'student' && q.user.student) {
    q.user.student.name = body.name;
    q.user.student.email = email;
    await q.user.student.save();
  }

  await AuditLog.create({ actor: q.user._id, action: 'user.profile.update', target: String(q.user._id), meta: { name: true, email: true, passwordChanged: Boolean(body.newPassword) } });
  s.json({ user: profileUser(q.user) });
});
