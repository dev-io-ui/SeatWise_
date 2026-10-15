import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Student, User, Program, Department, AuditLog, ImportBatch, Exam, SeatingAllocation } from '../models/index.js';
import { pageData, parseUpload, wrap } from './shared.js';

export const get_students_14 = wrap(async (q, s) => {
  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    search: z.string().trim().max(100).default('')
  }).parse(q.query);
  const search = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const filter = {
    active: true,
    ...(search && { $or: ['name', 'rollNumber', 'department'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) })
  };
  const [items, total] = await Promise.all([
    Student.find(filter).sort('rollNumber').skip((query.page - 1) * query.limit).limit(query.limit),
    Student.countDocuments(filter)
  ]);
  s.json({ items, total, page: query.page, pageSize: query.limit, totalPages: Math.ceil(total / query.limit) });
});

export const get_officer_students_30 = wrap(async (q, s) => {
  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(10).default(10),
    search: z.string().trim().max(100).default('')
  }).parse(q.query);
  const search = query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const departments = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  const filter = {
    active: true,
    ...(departments.length && { department: { $in: departments } }),
    ...(search && { $or: ['name', 'rollNumber', 'department'].map((field) => ({ [field]: { $regex: search, $options: 'i' } })) })
  };
  const [items, total] = await Promise.all([
    Student.find(filter).select('name rollNumber department program year semester section')
      .sort('rollNumber').skip((query.page - 1) * query.limit).limit(query.limit).lean(),
    Student.countDocuments(filter)
  ]);
  s.json({ items, total, page: query.page, pageSize: query.limit, totalPages: Math.ceil(total / query.limit) });
});

export const get_students_registrations_pending_15 = wrap(async (q, s) => {
  const page = z.coerce.number().int().min(1).default(1).parse(q.query.page);
  const pageSize = 10;
  const filter = { registrationStatus: 'pending', active: false };
  const total = await Student.countDocuments(filter);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const items = await Student.find(filter).sort('createdAt').skip((currentPage - 1) * pageSize).limit(pageSize).select('-__v');
  s.json({ items, total, page: currentPage, pageSize, totalPages });
});

export const post_students_registrations_id_approve_16 = wrap(async (q, s) => {
  const student = await Student.findOne({ _id: q.params.id, registrationStatus: 'pending', active: false });
  if (!student) return s.status(404).json({ error: 'Pending student registration not found.' });
  let user = await User.findOne({ student: student._id, role: 'student' });
  if (!user) return s.status(409).json({ error: 'The student login account is missing or is no longer pending.' });
  let activatedAccount = false;
  if (user.registrationStatus === 'pending' && !user.active) {
    const claim = await User.updateOne(
      { _id: user._id, registrationStatus: 'pending', active: false },
      { $set: { active: true, registrationStatus: 'approved' } }
    );
    activatedAccount = claim.modifiedCount > 0;
    if (activatedAccount) {
      user.registrationStatus = 'approved';
      user.active = true;
    } else user = await User.findById(user._id);
  }
  if (!user || user.registrationStatus !== 'approved' || !user.active) {
    return s.status(409).json({ error: 'The registration changed while it was being approved. Refresh and try again.' });
  }
  let result;
  try {
    result = await Student.updateOne(
      { _id: student._id, registrationStatus: 'pending', active: false },
      { $set: { active: true, registrationStatus: 'approved' } }
    );
  } catch (error) {
    if (activatedAccount) {
      await User.updateOne(
        { _id: user._id, registrationStatus: 'approved', active: true },
        { $set: { active: false, registrationStatus: 'pending' } }
      );
    }
    throw error;
  }
  if (!result.modifiedCount) {
    const latest = await Student.findById(student._id).select('active registrationStatus');
    if (latest?.active && latest.registrationStatus === 'approved') {
      return s.json({ approved: true, studentId: student.id });
    }
    if (activatedAccount) {
      await User.updateOne(
        { _id: user._id, registrationStatus: 'approved', active: true },
        { $set: { active: false, registrationStatus: 'pending' } }
      );
    }
    return s.status(409).json({ error: 'The registration changed while it was being approved. Refresh and try again.' });
  }
  await AuditLog.create({ actor: q.user.id, action: 'student.registration.approve', target: student.id });
  s.json({ approved: true, studentId: student.id });
});

export const post_students_17 = wrap(async (q, s) => {
  const body = z.object({
    studentId: z.string().trim().min(1), name: z.string().trim().min(1), rollNumber: z.string().trim().min(1),
    email: z.string().email(), password: z.string().min(12), program: z.string(), department: z.string().trim().min(1),
    year: z.coerce.number().int().min(1), semester: z.coerce.number().int().min(1), section: z.string().optional()
  }).strict().parse(q.body);
  const program = await Program.findOne({ name: body.program });
  if (!program?.years.includes(body.year) || !program.semesters.includes(body.semester)) return s.status(400).json({ error: 'Invalid program, year or semester combination' });
  if (!await Department.exists({ name: body.department, active: true })) return s.status(400).json({ error: 'Select a configured department' });
  if (await Student.exists({ $or: [{ studentId: body.studentId }, { rollNumber: body.rollNumber }, { email: body.email.toLowerCase() }] }) ||
      await User.exists({ email: body.email.toLowerCase() })) {
    return s.status(409).json({ error: 'Duplicate student ID, roll number or email' });
  }
  const { password, ...studentFields } = body;
  const student = await Student.create({ ...studentFields, email: body.email.toLowerCase() });
  try {
    await User.create({
      name: body.name, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(password, 12),
      role: 'student', student: student._id
    });
  } catch (error) {
    await Student.deleteOne({ _id: student._id });
    throw error;
  }
  await AuditLog.create({ actor: q.user.id, action: 'student.create', target: student.id });
  s.status(201).json(student);
});

export const put_students_id_31 = wrap(async (q, s) => {
  const body = z.object({
    studentId: z.string().trim().min(1).max(60),
    name: z.string().trim().min(2).max(120),
    rollNumber: z.string().trim().min(1).max(60),
    email: z.string().trim().email().max(254),
    program: z.string().trim().min(1).max(100),
    department: z.string().trim().min(1).max(80),
    year: z.coerce.number().int().min(1),
    semester: z.coerce.number().int().min(1),
    section: z.string().trim().max(40).optional().default('')
  }).strict().parse(q.body);
  const student = await Student.findById(q.params.id);
  if (!student) return s.status(404).json({ error: 'Student not found' });
  const nextEmail = body.email.toLowerCase();
  const user = await User.findOne({ student: student._id, role: 'student' });
  const [program, department, duplicateStudent, duplicateUser] = await Promise.all([
    Program.findOne({ name: body.program }),
    Department.exists({ name: body.department, active: true }),
    Student.exists({ _id: { $ne: student._id }, $or: [
      { studentId: body.studentId }, { rollNumber: body.rollNumber }, { email: nextEmail }
    ] }),
    User.exists({ email: nextEmail, ...(user && { _id: { $ne: user._id } }) })
  ]);
  if (!program?.years.includes(body.year) || !program.semesters.includes(body.semester)) {
    return s.status(400).json({ error: 'Select a valid program, year and semester combination.' });
  }
  if (!department) return s.status(400).json({ error: 'Select an active department from the list.' });
  if (duplicateStudent || duplicateUser) return s.status(409).json({ error: 'Student ID, roll number or email is already in use.' });

  const cohortChanged = student.program !== body.program || student.department !== body.department ||
    student.year !== body.year || student.semester !== body.semester;
  if (cohortChanged) {
    const [hasAllocation, hasExam] = await Promise.all([
      SeatingAllocation.exists({ student: student._id }),
      Exam.exists({ eligible: student._id })
    ]);
    if (hasAllocation || hasExam) {
      return s.status(409).json({ error: 'This student is already assigned to an exam. Remove or update the affected exam before changing academic cohort details.' });
    }
  }
  Object.assign(student, body, { email: nextEmail });
  await student.save();
  if (user) {
    user.name = body.name;
    user.email = nextEmail;
    await user.save();
  }
  await AuditLog.create({ actor: q.user.id, action: 'student.update', target: student.id, meta: { cohortChanged } });
  s.json(student);
});

export const post_students_import_preview_18 = wrap(async (q, s) => {
  if (!q.file) return s.status(400).json({ error: 'Select a CSV or Excel workbook' });
  const inputRows = await parseUpload(q.file);
  if (!inputRows.length) return s.status(400).json({ error: 'The file contains no student rows' });
  if (inputRows.length > 10_000) return s.status(413).json({ error: 'Import is limited to 10,000 rows' });
  const schema = z.object({
    studentid: z.string().trim().min(1), name: z.string().trim().min(1), rollnumber: z.string().trim().min(1),
    email: z.string().trim().email(), password: z.string().min(12), program: z.string().trim().min(1), department: z.string().trim().min(1),
    year: z.coerce.number().int().min(1), semester: z.coerce.number().int().min(1), section: z.string().optional()
  });
  const errors = [], rows = [], seen = new Set();
  const programs = new Map((await Program.find()).map((program) => [program.name, program]));
  const [existing, existingUsers, configuredDepartments, legacyDepartments] = await Promise.all([
    Student.find({}, 'studentId rollNumber email'), User.find({}, 'email'),
    Department.distinct('name', { active: true }), Student.distinct('department', { active: true })
  ]);
  const validDepartments = new Set([...configuredDepartments, ...legacyDepartments]);
  const known = new Set([
    ...existing.flatMap((student) => [student.studentId, student.rollNumber, student.email.toLowerCase()]),
    ...existingUsers.map((user) => user.email.toLowerCase())
  ]);
  for (const [index, input] of inputRows.entries()) {
    const rowNumber = index + 2;
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      errors.push({ row: rowNumber, messages: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) });
      continue;
    }
    const value = parsed.data;
    if (!validDepartments.has(value.department)) {
      errors.push({ row: rowNumber, messages: [`Unknown department "${value.department}"`] });
      continue;
    }
    const program = programs.get(value.program);
    if (!program?.years.includes(value.year) || !program.semesters.includes(value.semester)) {
      errors.push({ row: rowNumber, messages: ['Invalid program, year or semester combination'] });
      continue;
    }
    const ids = [value.studentid, value.rollnumber, value.email.toLowerCase()];
    if (ids.some((id) => known.has(id) || seen.has(id))) {
      errors.push({ row: rowNumber, messages: ['Duplicate student ID, roll number or email'] });
      continue;
    }
    ids.forEach((id) => seen.add(id));
    rows.push({
      studentId: value.studentid, name: value.name, rollNumber: value.rollnumber, email: value.email.toLowerCase(),
      passwordHash: await bcrypt.hash(value.password, 12), program: value.program,
      department: value.department, year: value.year, semester: value.semester, section: value.section
    });
  }
  const batch = await ImportBatch.create({ owner: q.user.id, rows, validationErrors: errors, expiresAt: new Date(Date.now() + 30 * 60_000) });
  s.status(201).json({
    batchId: batch.id, validCount: rows.length,
    preview: pageData(rows.map(({ passwordHash, ...student }) => student), 1),
    errors: pageData(errors, 1)
  });
});

export const get_students_import_batchid_preview_19 = wrap(async (q, s) => {
  const query = z.object({
    page: z.coerce.number().int().min(1).default(1),
    errorPage: z.coerce.number().int().min(1).default(1)
  }).strict().parse(q.query);
  const batch = await ImportBatch.findOne({
    _id: q.params.batchId, owner: q.user.id, expiresAt: { $gt: new Date() }
  }).lean();
  if (!batch) return s.status(404).json({ error: 'Import preview expired or not found' });
  s.json({
    validCount: batch.rows.length,
    preview: pageData(batch.rows.map(({ passwordHash, ...student }) => student), query.page),
    errors: pageData(batch.validationErrors, query.errorPage)
  });
});

export const post_students_import_batchid_commit_20 = wrap(async (q, s) => {
  const batch = await ImportBatch.findOne({ _id: q.params.batchId, owner: q.user.id, expiresAt: { $gt: new Date() } });
  if (!batch) return s.status(404).json({ error: 'Import preview expired or not found' });
  let inserted = [];
  if (batch.rows.length) {
    const documents = batch.rows.map(({ passwordHash, ...student }) => student);
    inserted = await Student.insertMany(documents);
    try {
      await User.insertMany(inserted.map((student, index) => ({
        name: student.name, email: student.email, passwordHash: batch.rows[index].passwordHash,
        role: 'student', student: student._id
      })));
    } catch (error) {
      await User.deleteMany({ student: { $in: inserted.map((student) => student._id) } });
      await Student.deleteMany({ _id: { $in: inserted.map((student) => student._id) } });
      throw error;
    }
  }
  await ImportBatch.deleteOne({ _id: batch.id });
  await AuditLog.create({ actor: q.user.id, action: 'student.import', target: batch.id, meta: { count: inserted.length, rejected: batch.validationErrors.length } });
  s.json({ imported: inserted.length, skipped: batch.validationErrors.length, errors: batch.validationErrors });
});

export const get_students_import_template_csv_21 = (q, s) => {
  s.type('text/csv').attachment('seatwise-student-template.csv').send(
    'studentId,name,rollNumber,email,password,program,department,year,semester,section\r\n'
  );
};
