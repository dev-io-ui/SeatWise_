import { z } from 'zod';
import { Student, Subject, Exam, ExamResource, Program, Department, AuditLog, SeatingAllocation } from '../models/index.js';
import { findConflicts } from '../allocation/conflicts.js';
import { learningFileType } from '../resources/files.js';
import { subjectDepartmentNames } from '../academics/subject-departments.js';
import { day, wrap } from './shared.js';

export const post_exams_25 = wrap(async (q, s) => {
  const departmentsSchema = z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }, z.array(z.string().trim().min(1)).max(100).default([]));
  const resourcesSchema = z.preprocess((value) => {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }, z.array(z.object({
    title: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional().default(''),
    url: z.string().url().max(2048).refine((value) => new URL(value).protocol === 'https:', 'Resource links must use HTTPS')
  }).strict()).max(10).default([]));
  const body = z.object({
    name: z.string().trim().max(120).default(''), examType: z.enum(['Mid-semester', 'End-semester', 'Class Test (CL)', 'Quiz', 'Practical', 'Other']).default('Other'),
    subjectId: z.string(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d\d:\d\d$/), endTime: z.string().regex(/^\d\d:\d\d$/),
    departments: departmentsSchema, department: z.string().trim().optional(), resources: resourcesSchema
  }).strict().parse(q.body);
  const departments = [...new Set([...body.departments, ...(body.department ? [body.department] : [])])];
  const files = q.files || [];
  const typedFiles = files.map((file) => ({ file, type: learningFileType(file) }));
  if (typedFiles.some(({ type }) => !type)) return s.status(400).json({ error: 'A learning file does not match its PDF, DOC or DOCX extension' });
  if (body.resources.length + files.length > 10) return s.status(400).json({ error: 'An exam can have at most 10 learning resources' });
  if (body.endTime <= body.startTime) return s.status(400).json({ error: 'End time must be after start time' });
  const date = new Date(`${body.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body.date) return s.status(400).json({ error: 'Invalid exam date' });
  if (body.date < new Date().toISOString().slice(0, 10)) return s.status(400).json({ error: 'Exam date must be today or later' });
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(body.endTime)) {
    return s.status(400).json({ error: 'Exam time must be a valid 24-hour time' });
  }
  const subject = await Subject.findById(body.subjectId);
  if (!subject) return s.status(400).json({ error: 'Select a valid subject' });
  const program = await Program.findOne({ name: subject.program });
  if (!program?.years.includes(subject.year) || !program.semesters.includes(subject.semester)) {
    return s.status(400).json({ error: 'Subject has an invalid program, year or semester combination' });
  }
  const departmentScope = q.user.scope?.departments || [];
  if (q.user.role === 'officer' && departmentScope.length &&
      (!departments.length || departments.some((name) => !departmentScope.includes(name)))) {
    return s.status(403).json({ error: 'Select one or more departments assigned to your officer account' });
  }
  const validDepartments = new Set([
    ...await Department.distinct('name', { active: true }),
    ...await Student.distinct('department', {
      active: true, program: subject.program, year: subject.year, semester: subject.semester
    })
  ]);
  const unknownDepartments = departments.filter((name) => !validDepartments.has(name));
  if (unknownDepartments.length) return s.status(400).json({ error: `Unknown or inactive departments: ${unknownDepartments.join(', ')}` });
  const mappedDepartments = subjectDepartmentNames(subject);
  if (mappedDepartments.length && departments.some((name) => !mappedDepartments.includes(name))) {
    return s.status(400).json({ error: `This subject is mapped to ${mappedDepartments.join(', ')}.` });
  }
  const eligibleDepartments = departments.length ? departments : mappedDepartments;
  const eligibleFilter = {
    active: true, program: subject.program, year: subject.year, semester: subject.semester
  };
  if (eligibleDepartments.length) eligibleFilter.department = { $in: eligibleDepartments };
  const eligible = await Student.find(eligibleFilter).select('_id');
  if (!eligible.length) return s.status(400).json({
    error: 'No active students match the selected subject cohort and departments',
    details: { program: subject.program, year: subject.year, semester: subject.semester, departments }
  });
  const start = date;
  const sameDay = await Exam.find({ date: { $gte: start, $lt: new Date(start.getTime() + 86_400_000) } });
  const candidate = { id: 'new', date: body.date, startTime: body.startTime, endTime: body.endTime, studentIds: eligible.map((x) => String(x._id)) };
  const conflicts = findConflicts([candidate, ...sameDay.map((exam) => ({
    id: exam.id, date: day(exam.date), startTime: exam.startTime, endTime: exam.endTime,
    studentIds: exam.eligible.map(String)
  }))]);
  if (conflicts.length) return s.status(409).json({ error: 'Timetable clash: some students already have an exam at this time', diagnostics: conflicts });
  const examName = body.name || `${body.examType} · ${subject.name}`;
  const examDepartments = eligibleDepartments.length ? eligibleDepartments : departments;
  const exam = await Exam.create({
    name: examName, examType: body.examType, subject: subject.name, subjectCode: subject.code, program: subject.program,
    year: subject.year, semester: subject.semester, departments: examDepartments,
    department: examDepartments.length === 1 ? examDepartments[0] : undefined,
    date: start, startTime: body.startTime, endTime: body.endTime, eligible: eligible.map((x) => x._id)
  });
  const links = body.resources.map((resource) => ({ ...resource, exam: exam._id, kind: 'link', createdBy: q.user._id }));
  const attachments = typedFiles.map(({ file, type }) => ({
    exam: exam._id,
    title: file.originalname.replace(/\.[^.]+$/, '').replace(/[\r\n\0]/g, ' ').trim().slice(0, 120) || 'Learning material',
    kind: 'file',
    fileName: file.originalname.replace(/[\r\n\0]/g, '_').slice(0, 180),
    contentType: type.contentType,
    data: file.buffer,
    size: file.size,
    createdBy: q.user._id
  }));
  const newResources = [...links, ...attachments];
  let savedResources = [];
  try {
    if (newResources.length) savedResources = await ExamResource.insertMany(newResources);
  } catch (error) {
    await ExamResource.deleteMany({ exam: exam._id });
    await Exam.deleteOne({ _id: exam._id });
    throw error;
  }
  await AuditLog.create({ actor: q.user.id, action: 'exam.create', target: exam.id });
  if (savedResources.length) await AuditLog.create({ actor: q.user.id, action: 'exam.resources.add', target: exam.id, meta: { count: savedResources.length } });
  s.status(201).json({ ...exam.toObject(), resourceCount: savedResources.length });
});

export const put_exams_id_37 = wrap(async (q, s) => {
  const departmentsSchema = z.preprocess((value) => {
    if (Array.isArray(value)) return value;
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch { return null; }
  }, z.array(z.string().trim().min(1)).max(100));
  const body = z.object({
    name: z.string().trim().min(1).max(120),
    examType: z.enum(['Mid-semester', 'End-semester', 'Class Test (CL)', 'Quiz', 'Practical', 'Other']),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    endTime: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/),
    departments: departmentsSchema
  }).strict().parse(q.body);
  const exam = await Exam.findById(q.params.id);
  if (!exam) return s.status(404).json({ error: 'Exam not found' });
  if (exam.status !== 'draft') return s.status(409).json({ error: 'Only draft exams can be edited. Allocated and published plans are locked.' });
  if (await SeatingAllocation.exists({ exam: exam._id })) {
    return s.status(409).json({ error: 'This draft already has seat allocations. Clear or version the plan before changing its timetable or eligible students.' });
  }
  if (body.endTime <= body.startTime) return s.status(400).json({ error: 'End time must be after start time' });
  const date = new Date(`${body.date}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== body.date) {
    return s.status(400).json({ error: 'Invalid exam date' });
  }
  if (body.date < new Date().toISOString().slice(0, 10)) return s.status(400).json({ error: 'Exam date must be today or later' });
  const departments = [...new Set(body.departments)];
  const departmentScope = q.user.scope?.departments || [];
  if (q.user.role === 'officer' && departmentScope.length) {
    const examOutsideScope = exam.departments?.length
      ? exam.departments.some((name) => !departmentScope.includes(name))
      : await Student.exists({ _id: { $in: exam.eligible }, department: { $nin: departmentScope } });
    if (examOutsideScope || !departments.length || departments.some((name) => !departmentScope.includes(name))) {
      return s.status(403).json({ error: 'This exam or department selection is outside your officer department scope.' });
    }
  }
  const validDepartments = new Set([
    ...await Department.distinct('name', { active: true }),
    ...await Student.distinct('department', {
      active: true, program: exam.program, year: exam.year, semester: exam.semester
    })
  ]);
  const unknownDepartments = departments.filter((name) => !validDepartments.has(name));
  if (unknownDepartments.length) return s.status(400).json({ error: `Unknown or inactive departments: ${unknownDepartments.join(', ')}` });
  const subject = await Subject.findOne({
    name: exam.subject, code: exam.subjectCode, program: exam.program, year: exam.year, semester: exam.semester
  });
  const mappedDepartments = subject ? subjectDepartmentNames(subject) : [];
  if (mappedDepartments.length && departments.some((name) => !mappedDepartments.includes(name))) {
    return s.status(400).json({ error: `This subject is mapped to ${mappedDepartments.join(', ')}.` });
  }
  const eligibleDepartments = departments.length ? departments : mappedDepartments;
  const eligibleFilter = { active: true, program: exam.program, year: exam.year, semester: exam.semester };
  if (eligibleDepartments.length) eligibleFilter.department = { $in: eligibleDepartments };
  const eligible = await Student.find(eligibleFilter).select('_id');
  if (!eligible.length) return s.status(400).json({ error: 'No active students match the selected cohort and departments' });
  const sameDay = await Exam.find({
    _id: { $ne: exam._id },
    date: { $gte: date, $lt: new Date(date.getTime() + 86_400_000) }
  });
  const diagnostics = findConflicts([{
    id: String(exam._id), date: body.date, startTime: body.startTime, endTime: body.endTime,
    studentIds: eligible.map((student) => String(student._id))
  }, ...sameDay.map((other) => ({
    id: String(other._id), date: day(other.date), startTime: other.startTime, endTime: other.endTime,
    studentIds: other.eligible.map(String)
  }))]);
  if (diagnostics.length) {
    return s.status(409).json({ error: 'Timetable clash: some students already have an exam at this time', diagnostics });
  }
  exam.name = body.name;
  exam.examType = body.examType;
  exam.date = date;
  exam.startTime = body.startTime;
  exam.endTime = body.endTime;
  exam.departments = eligibleDepartments.length ? eligibleDepartments : departments;
  exam.department = exam.departments.length === 1 ? exam.departments[0] : undefined;
  exam.eligible = eligible.map((student) => student._id);
  await exam.save();
  await AuditLog.create({ actor: q.user.id, action: 'exam.update', target: exam.id });
  s.json(exam);
});
