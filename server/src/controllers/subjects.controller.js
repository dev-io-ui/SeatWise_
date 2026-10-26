import { z } from 'zod';
import { Program, Department, Subject, Exam, AuditLog } from '../models/index.js';
import { generateAcademicCode } from '../academics/codes.js';
import { subjectDepartmentNames } from '../academics/subject-departments.js';
import { wrap } from './shared.js';

export const get_subjects_22 = wrap(async (q, s) => s.json(await Subject.find().sort('program year semester name')));

export const post_subjects_23 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(1), program: z.string(),
    department: z.string().trim().min(1).optional(),
    departments: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
    year: z.coerce.number().int().min(1), semester: z.coerce.number().int().min(1)
  }).strict().parse(q.body);
  const program = await Program.findOne({ name: body.program });
  if (!program?.years.includes(body.year) || !program.semesters.includes(body.semester)) return s.status(400).json({ error: 'Invalid program, year or semester combination' });
  const mappedDepartments = [...new Set([...(body.departments || []), ...(body.department ? [body.department] : [])])];
  const departmentRecords = await Department.find({ name: { $in: mappedDepartments }, active: true }).sort('name');
  if (!mappedDepartments.length || departmentRecords.length !== mappedDepartments.length) {
    return s.status(400).json({ error: 'Select one or more valid active departments.' });
  }
  s.status(201).json(await Subject.create({
    name: body.name, program: body.program, year: body.year, semester: body.semester,
    department: mappedDepartments.length === 1 ? mappedDepartments[0] : undefined,
    departments: mappedDepartments,
    code: await generateAcademicCode(departmentRecords[0].code.slice(0, 2))
  }));
});

export const put_subjects_id_36 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(1).max(120),
    program: z.string().trim().min(1),
    department: z.string().trim().min(1).optional(),
    departments: z.array(z.string().trim().min(1)).min(1).max(100).optional(),
    year: z.coerce.number().int().min(1), semester: z.coerce.number().int().min(1)
  }).strict().parse(q.body);
  const subject = await Subject.findById(q.params.id);
  if (!subject) return s.status(404).json({ error: 'Subject not found' });
  const program = await Program.findOne({ name: body.program });
  if (!program?.years.includes(body.year) || !program.semesters.includes(body.semester)) {
    return s.status(400).json({ error: 'Select a valid program, year and semester combination.' });
  }
  const mappedDepartments = [...new Set([...(body.departments || []), ...(body.department ? [body.department] : [])])];
  const departmentRecords = await Department.find({ name: { $in: mappedDepartments }, active: true }).sort('name');
  if (!mappedDepartments.length || departmentRecords.length !== mappedDepartments.length) {
    return s.status(400).json({ error: 'Select one or more valid active departments.' });
  }
  const linkedExam = await Exam.exists({
    subject: subject.name, subjectCode: subject.code, program: subject.program, year: subject.year, semester: subject.semester
  });
  const oldValues = { name: subject.name, code: subject.code, program: subject.program, year: subject.year, semester: subject.semester };
  const previousDepartments = subjectDepartmentNames(subject);
  if (linkedExam && (body.program !== subject.program || body.year !== subject.year ||
      body.semester !== subject.semester ||
      mappedDepartments.some((name) => !previousDepartments.includes(name)) ||
      previousDepartments.some((name) => !mappedDepartments.includes(name)))) {
    return s.status(409).json({ error: 'Program, department, year and semester cannot change after exams have been created for this subject.' });
  }
  const mappingChanged = mappedDepartments.some((name) => !previousDepartments.includes(name)) ||
    previousDepartments.some((name) => !mappedDepartments.includes(name));
  const code = !mappingChanged && subject.code
    ? subject.code
    : await generateAcademicCode(departmentRecords[0].code.slice(0, 2));
  Object.assign(subject, {
    name: body.name, program: body.program, year: body.year, semester: body.semester,
    department: mappedDepartments.length === 1 ? mappedDepartments[0] : undefined,
    departments: mappedDepartments, code
  });
  await subject.save();
  if (linkedExam) await Exam.updateMany(
    { subject: oldValues.name, subjectCode: oldValues.code, program: oldValues.program, year: oldValues.year, semester: oldValues.semester },
    { $set: { subject: body.name, subjectCode: subject.code } }
  );
  await AuditLog.create({ actor: q.user.id, action: 'subject.update', target: subject.id });
  s.json(subject);
});
