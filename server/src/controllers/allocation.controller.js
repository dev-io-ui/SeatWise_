import { z } from 'zod';
import { Building, Floor, Hall, Exam, Student, ExamResource, SeatingAllocation, AllocationPlan, AuditLog } from '../models/index.js';
import { authenticate } from '../middleware/auth.js';
import { allocate, defaultRules, validateAllocation, expandSeats } from '../allocation/engine.js';
import { withExamLock } from '../allocation/lock.js';
import { staff } from './middleware.js';
import { wrap } from './shared.js';

export { authenticate, staff };

export const get_halls_6 = wrap(async (q, s) => {
  const filter = q.user.role === 'officer' && q.user.scope?.buildings?.length
    ? { building: { $in: q.user.scope.buildings } } : {};
  s.json(await Hall.find(filter).populate('building').populate('floor'));
});

export const post_halls_7 = wrap(async (q, s) => {
  const b = z.object({
    name: z.string().trim().min(1), code: z.string().trim().min(1), building: z.string(), floor: z.string(),
    rows: z.number().int().min(1).max(100), cols: z.number().int().min(1).max(100),
    blocked: z.array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0) })).default([])
  }).strict().parse(q.body);
  if (q.user.role === 'officer' && q.user.scope?.buildings?.length &&
      !q.user.scope.buildings.some((id) => String(id) === b.building)) return s.status(403).json({ error: 'Officer is not assigned to this building' });
  if (!await Building.exists({ _id: b.building, active: true })) return s.status(400).json({ error: 'Select a valid building' });
  const floor = await Floor.findOne({ _id: b.floor, building: b.building, active: true });
  if (!floor) return s.status(400).json({ error: 'Select a valid floor in the chosen building' });
  const blocked = new Set();
  for (const seat of b.blocked) {
    if (seat.r >= b.rows || seat.c >= b.cols) return s.status(400).json({ error: 'Blocked seat is outside this hall layout' });
    const key = `${seat.r},${seat.c}`;
    if (blocked.has(key)) return s.status(400).json({ error: 'Blocked seat coordinates must be unique' });
    blocked.add(key);
  }
  const hall = await Hall.create(b);
  await AuditLog.create({ actor: q.user.id, action: 'hall.create', target: hall.id });
  s.status(201).json(await hall.populate('building floor'));
});

export const post_exams_id_allocations_generate_8 = wrap(async (q, s) => {
  const { hallIds, seed = 1, rules } = z.object({ hallIds: z.array(z.string()).min(1), seed: z.number().optional(),
    rules: z.object({ horizontal: z.boolean(), vertical: z.boolean(), diagonal: z.boolean() }).optional() }).parse(q.body);
  if (new Set(hallIds).size !== hallIds.length) return s.status(400).json({ error: 'Each hall can be selected only once' });
  await withExamLock(q.params.id, async () => {
    const exam = await Exam.findById(q.params.id).populate('eligible');
    if (!exam) return s.status(404).json({ error: 'Exam not found' });
    if (exam.status === 'published') return s.status(409).json({ error: 'Published plans cannot be regenerated silently' });
    const found = await Hall.find({ _id: { $in: hallIds }, active: true });
    if (found.length !== hallIds.length) return s.status(400).json({ error: 'One or more halls are missing or inactive' });
    const buildingScope = q.user.scope?.buildings || [];
    if (q.user.role === 'officer' && buildingScope.length &&
        found.some((hall) => !buildingScope.some((id) => String(id) === String(hall.building)))) {
      return s.status(403).json({ error: 'Officer is not assigned to every selected building' });
    }
    const departmentScope = q.user.scope?.departments || [];
    if (q.user.role === 'officer' && departmentScope.length &&
        exam.eligible.some((student) => !departmentScope.includes(student.department))) {
      return s.status(403).json({ error: 'Exam includes departments outside the officer scope' });
    }
    const halls = found.map(h => ({ id: h.id, rows: h.rows, cols: h.cols, blocked: h.blocked }));
    const res = allocate(exam.eligible.map(e => ({ studentId: e.id, dept: e.department })), halls, { seed, rules: rules || defaultRules });
    if (!res.ok) return s.status(422).json({ error: 'No valid allocation', diagnostics: res.diagnostics });
    const latest = await SeatingAllocation.findOne({ exam: exam.id }).sort('-version');
    const version = latest ? latest.version + 1 : 1;
    await SeatingAllocation.insertMany(res.assignments.map(a => ({ exam: exam.id, version, student: a.studentId, hall: a.hallId, r: a.r, c: a.c })));
    await AllocationPlan.create({ exam: exam.id, version, rules: rules || defaultRules, halls: found.map((hall) => hall._id) });
    exam.status = 'allocated'; await exam.save();
    await AuditLog.create({ actor: q.user.id, action: 'allocation.generate', target: exam.id, meta: { version, seed, rules: rules || defaultRules } });
    s.json({ version, count: res.assignments.length });
  });
});

export const post_exams_id_allocations_publish_9 = wrap(async (q, s) => {
  await withExamLock(q.params.id, async () => {
    const exam = await Exam.findById(q.params.id);
    if (!exam) return s.status(404).json({ error: 'Exam not found' });
    const departmentScope = q.user.scope?.departments || [];
    const last = await SeatingAllocation.findOne({ exam: q.params.id }).sort('-version');
    if (!last) return s.status(400).json({ error: 'Nothing to publish' });
    const allocationPlan = await AllocationPlan.findOne({ exam: q.params.id, version: last.version });
    if (!allocationPlan) return s.status(409).json({ error: 'Allocation rules are missing; generate a new version' });
    const rows = await SeatingAllocation.find({ exam: q.params.id, version: last.version }).populate('student');
    if (q.user.role === 'officer' && departmentScope.length &&
        rows.some((row) => !departmentScope.includes(row.student.department))) {
      return s.status(403).json({ error: 'Plan includes a department outside the officer scope' });
    }
    const buildingScope = q.user.scope?.buildings || [];
    if (q.user.role === 'officer' && buildingScope.length) {
      const halls = await Hall.find({ _id: { $in: rows.map((row) => row.hall) } }).select('building');
      if (halls.some((hall) => !buildingScope.some((id) => String(id) === String(hall.building)))) {
        return s.status(403).json({ error: 'Plan includes a building outside the officer scope' });
      }
    }
    const issues = validateAllocation(rows.map(x => ({ hallId: String(x.hall), r: x.r, c: x.c, studentId: String(x.student._id), dept: x.student.department })), allocationPlan.rules);
    if (issues.length) return s.status(422).json({ error: 'Validation failed', diagnostics: issues });
    await SeatingAllocation.updateMany({ exam: q.params.id, published: true }, { published: false });
    await SeatingAllocation.updateMany({ exam: q.params.id, version: last.version }, { published: true });
    allocationPlan.publishedAt = new Date();
    await allocationPlan.save();
    await Exam.findByIdAndUpdate(q.params.id, { status: 'published' });
    await AuditLog.create({ actor: q.user.id, action: 'allocation.publish', target: q.params.id, meta: { version: last.version } });
    s.json({ published: true, version: last.version });
  });
});

export const get_students_me_exams_10 = wrap(async (q, s) => {
  const student = q.user.student;
  if (!student?._id) return s.status(403).json({ error: 'Your student profile is not linked to this login. Contact your institution administrator.' });
  const exams = await Exam.find({ eligible: student._id, status: { $in: ['allocated', 'published'] } })
    .sort('date startTime').lean();
  const examIds = exams.map((exam) => exam._id);
  const allSeats = await SeatingAllocation.find({ student: student._id, exam: { $in: examIds } })
    .populate({ path: 'hall', populate: ['building', 'floor'] }).lean();
  const seatByExam = new Map();
  for (const seat of allSeats.sort((a, b) => b.version - a.version)) {
    if (!seatByExam.has(String(seat.exam))) seatByExam.set(String(seat.exam), seat);
  }
  const resources = await ExamResource.find({ exam: { $in: examIds } }).select('-data').sort('createdAt');
  const byExam = new Map();
  for (const resource of resources) {
    const examId = String(resource.exam);
    if (!byExam.has(examId)) byExam.set(examId, []);
    byExam.get(examId).push({
      id: String(resource._id), title: resource.title, description: resource.description,
      kind: resource.kind, url: resource.url,
      downloadUrl: resource.kind === 'file' ? `/api/v1/resources/${resource.id}` : null,
      fileName: resource.fileName, size: resource.size
    });
  }
  s.json(exams.map((exam) => {
    const seat = seatByExam.get(String(exam._id));
    return {
      subject: exam.subject, code: exam.subjectCode, examType: exam.examType || 'Other', date: exam.date,
      start: exam.startTime, end: exam.endTime, planStatus: exam.status,
      building: seat?.hall?.building?.name, floor: seat?.hall?.floor?.name || seat?.hall?.floor?.toString(),
      hall: seat?.hall?.name, seat: seat ? `${String.fromCharCode(65 + seat.r)}${seat.c + 1}` : null,
      student: { name: student.name, rollNumber: student.rollNumber },
      department: student.department, year: student.year, semester: student.semester,
      resources: byExam.get(String(exam._id)) || []
    };
  }));
});
