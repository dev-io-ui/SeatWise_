import { z } from 'zod';
import { Program, Department, Student, Subject, Exam, User, AuditLog } from '../models/index.js';
import { generateAcademicCode } from '../academics/codes.js';
import { subjectDepartmentNames } from '../academics/subject-departments.js';
import { wrap } from './shared.js';

export const get_programs_7 = wrap(async (q, s) => s.json(await Program.find().sort('name')));

export const get_departments_catalog_8 = wrap(async (q, s) => {
  const departmentScope = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  const [configured, legacy] = await Promise.all([
    Department.find({ active: true, ...(departmentScope.length && { name: { $in: departmentScope } }) }).sort('name').lean(),
    Student.distinct('department', { active: true, ...(departmentScope.length && { department: { $in: departmentScope } }) })
  ]);
  const known = new Set(configured.map((department) => department.name));
  const inferred = legacy.filter((name) => name && !known.has(name)).map((name) => ({
    name, code: name.replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase(), legacy: true
  }));
  s.json([...configured, ...inferred].sort((a, b) => a.name.localeCompare(b.name)));
});

export const get_exams_eligibility_9 = wrap(async (q, s) => {
  const query = z.object({
    subjectId: z.string().min(1),
    departments: z.string().default('')
  }).parse(q.query);
  const subject = await Subject.findById(query.subjectId);
  if (!subject) return s.status(400).json({ error: 'Select a valid subject' });
  const selected = [...new Set(query.departments.split(',').map((name) => name.trim()).filter(Boolean))];
  const departmentScope = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  if (selected.some((name) => departmentScope.length && !departmentScope.includes(name))) {
    return s.status(403).json({ error: 'Select only departments assigned to your officer account' });
  }
  const mappedDepartments = subjectDepartmentNames(subject);
  if (mappedDepartments.length && selected.some((name) => !mappedDepartments.includes(name))) {
    return s.status(400).json({ error: `This subject is mapped to ${mappedDepartments.join(', ')}.` });
  }
  const cohortFilter = {
    active: true, program: subject.program, year: subject.year, semester: subject.semester
  };
  const allowedDepartments = mappedDepartments.length && departmentScope.length
    ? mappedDepartments.filter((name) => departmentScope.includes(name))
    : mappedDepartments.length ? mappedDepartments : departmentScope;
  if (allowedDepartments.length) cohortFilter.department = { $in: allowedDepartments };
  const countFilter = { ...cohortFilter, ...(selected.length && { department: { $in: selected } }) };
  const [total, groups] = await Promise.all([
    Student.countDocuments(countFilter),
    Student.aggregate([{ $match: cohortFilter }, { $group: { _id: '$department', count: { $sum: 1 } } }, { $sort: { _id: 1 } }])
  ]);
  s.json({
    total,
    allDepartmentsAllowed: q.user.role !== 'officer' || !departmentScope.length,
    departments: groups.map((group) => ({ name: group._id, count: group.count }))
  });
});

export const get_departments_10 = wrap(async (q, s) => {
  const [configured, legacy] = await Promise.all([
    Department.find({ active: true }).sort('name').select('name').lean(),
    Student.distinct('department', { active: true })
  ]);
  const values = [...new Set([...configured.map((item) => item.name), ...legacy].filter(Boolean))].sort();
  const allowed = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  s.json(allowed.length ? values.filter((value) => allowed.includes(value)) : values);
});

export const post_departments_11 = wrap(async (q, s) => {
  const body = z.object({ name: z.string().trim().min(2).max(80) }).strict().parse(q.body);
  const department = await Department.create({
    name: body.name,
    code: await generateAcademicCode(body.name)
  });
  await AuditLog.create({ actor: q.user.id, action: 'department.create', target: department.id });
  s.status(201).json(department);
});

export const put_departments_id_35 = wrap(async (q, s) => {
  const body = z.object({ name: z.string().trim().min(2).max(80) }).strict().parse(q.body);
  const department = await Department.findById(q.params.id);
  if (!department) return s.status(404).json({ error: 'Department not found' });
  const previousName = department.name;
  const previousCode = department.code;
  if (await Department.exists({ _id: { $ne: department._id }, name: body.name })) {
    return s.status(409).json({ error: 'A department with that name already exists.' });
  }
  department.name = body.name;
  await department.save();
  if (previousName !== body.name) {
    await Promise.all([
      Student.updateMany({ department: previousName }, { $set: { department: body.name } }),
      Subject.updateMany({ department: previousName }, { $set: { department: body.name } }),
      Exam.updateMany({ department: previousName }, { $set: { department: body.name } }),
      Exam.updateMany(
        { departments: previousName },
        { $set: { 'departments.$[department]': body.name } },
        { arrayFilters: [{ department: previousName }] }
      ),
      User.updateMany(
        { role: 'officer', 'scope.departments': previousName },
        { $set: { 'scope.departments.$[department]': body.name } },
        { arrayFilters: [{ department: previousName }] }
      )
    ]);
  }
  await AuditLog.create({ actor: q.user.id, action: 'department.update', target: department.id, meta: {
    previousName, previousCode, name: body.name, code: department.code
  } });
  s.json(department);
});

export const post_programs_12 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(1), years: z.array(z.number().int().min(1)).min(1),
    semesters: z.array(z.number().int().min(1)).min(1)
  }).strict().parse(q.body);
  const program = await Program.create({ ...body, code: await generateAcademicCode(body.name) });
  await AuditLog.create({ actor: q.user.id, action: 'program.create', target: program.id });
  s.status(201).json(program);
});

export const put_programs_id_13 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(1), years: z.array(z.number().int().min(1)).min(1),
    semesters: z.array(z.number().int().min(1)).min(1)
  }).strict().parse(q.body);
  const program = await Program.findById(q.params.id);
  if (!program) return s.status(404).json({ error: 'Program not found' });
  const previousName = program.name;
  if (body.name !== previousName && await Program.exists({ _id: { $ne: program._id }, name: body.name })) {
    return s.status(409).json({ error: 'A degree or program with that name already exists.' });
  }
  const [invalidStudent, invalidSubject, invalidExam] = await Promise.all([
    Student.exists({ program: previousName, $or: [{ year: { $nin: body.years } }, { semester: { $nin: body.semesters } }] }),
    Subject.exists({ program: previousName, $or: [{ year: { $nin: body.years } }, { semester: { $nin: body.semesters } }] }),
    Exam.exists({ program: previousName, $or: [{ year: { $nin: body.years } }, { semester: { $nin: body.semesters } }] })
  ]);
  if (invalidStudent || invalidSubject || invalidExam) {
    return s.status(409).json({ error: 'Years or semesters cannot be removed while students, subjects or exams still use them.' });
  }
  program.name = body.name;
  program.years = body.years;
  program.semesters = body.semesters;
  await program.save();
  if (previousName !== body.name) {
    await Promise.all([
      Student.updateMany({ program: previousName }, { $set: { program: body.name } }),
      Subject.updateMany({ program: previousName }, { $set: { program: body.name } }),
      Exam.updateMany({ program: previousName }, { $set: { program: body.name } })
    ]);
  }
  await AuditLog.create({ actor: q.user.id, action: 'program.update', target: program.id });
  s.json(program);
});
