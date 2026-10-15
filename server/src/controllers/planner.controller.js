import { z } from 'zod';
import { Exam, SeatingAllocation, AllocationPlan, Hall, AuditLog, Student } from '../models/index.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { validateAllocation } from '../allocation/engine.js';
import { withExamLock } from '../allocation/lock.js';
import { departmentsForExam, examVisibleWithinDepartmentScope, resolveExamDepartments } from '../academics/exam-departments.js';
const staff = requireRole('superadmin', 'officer');
const wrap = (f) => (q, s, n) => f(q, s, n).catch(n);
async function load(examId) {
  const last = await SeatingAllocation.findOne({ exam: examId }).sort('-version');
  if (!last) return { version: 0, rows: [], rules: { horizontal: true, vertical: true, diagonal: false }, plannedHalls: [] };
  const rows = await SeatingAllocation.find({ exam: examId, version: last.version })
    .populate('student').populate('exam').populate({ path: 'hall', populate: ['building', 'floor'] });
  const plan = await AllocationPlan.findOne({ exam: examId, version: last.version }).populate({ path: 'halls', populate: ['building', 'floor'] });
  return { version: last.version, rows, rules: plan?.rules || { horizontal: true, vertical: true, diagonal: false }, plannedHalls: plan?.halls || [] };
}
const flat = (rows) => rows.map(x => ({ id: x.id, hallId: String(x.hall._id), r: x.r, c: x.c, studentId: String(x.student._id), dept: x.student.department }));

export { authenticate, staff };

export const get_exams_1 = wrap(async (q, s) => {
  const exams = await Exam.find().sort('date');
  const departments = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  const resolvedDepartments = await resolveExamDepartments(exams, Student);
  const visible = departments.length
    ? exams.filter((exam) => examVisibleWithinDepartmentScope(
      exam, departments, resolvedDepartments.get(String(exam._id)) || []
    ))
    : exams;
  s.json(visible.map((exam) => {
    const result = exam.toObject();
    delete result.eligible;
    result.cohortDepartments = departmentsForExam(exam, resolvedDepartments.get(String(exam._id)) || []);
    if (q.user.role === 'officer' && departments.length) {
      const cohort = departmentsForExam(exam, resolvedDepartments.get(String(exam._id)) || []);
      result.officerReadOnly = cohort.some((department) => !departments.includes(department));
    }
    return result;
  }));
});

export const get_exams_id_allocations_2 = wrap(async (q, s) => {
  const exam = await Exam.findById(q.params.id);
  if (!exam) return s.status(404).json({ error: 'Exam not found' });
  const departmentScope = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  const eligibleDepartments = departmentScope.length && !exam.departments?.length && !exam.department
    ? await Student.distinct('department', { _id: { $in: exam.eligible } })
    : [];
  if (q.user.role === 'officer' && !examVisibleWithinDepartmentScope(exam, departmentScope, eligibleDepartments)) {
    return s.status(403).json({ error: 'Exam is outside the officer department scope' });
  }
  const { version, rows, rules, plannedHalls } = await load(q.params.id);
  const buildingScope = q.user.role === 'officer' ? q.user.scope?.buildings || [] : [];
  const visibleRows = rows.filter((row) =>
    (!departmentScope.length || departmentScope.includes(row.student.department)) &&
    (!buildingScope.length || buildingScope.some((id) => String(id) === String(row.hall.building?._id || row.hall.building)))
  );
  const visibleHalls = plannedHalls.filter((hall) =>
    !buildingScope.length || buildingScope.some((id) => String(id) === String(hall.building?._id || hall.building))
  );
  const examDepartments = departmentsForExam(exam, eligibleDepartments);
  const hasHiddenDepartments = departmentScope.length && examDepartments.some((department) => !departmentScope.includes(department));
  const restrictedView = visibleRows.length !== rows.length || visibleHalls.length !== plannedHalls.length || hasHiddenDepartments;
  const visibleBuildingIds = new Set([
    ...visibleHalls.map((hall) => String(hall.building?._id || hall.building)),
    ...visibleRows.map((row) => String(row.hall.building?._id || row.hall.building))
  ]);
  const restrictedSeats = rows.filter((row) =>
    departmentScope.length && !departmentScope.includes(row.student.department) &&
    visibleBuildingIds.has(String(row.hall.building?._id || row.hall.building))
  ).map((row) => ({ hallId: String(row.hall._id), r: row.r, c: row.c }));
  const halls = {};
  for (const hall of visibleHalls) halls[hall.id] = { id: hall.id, name: hall.name, buildingId: String(hall.building?._id || hall.building),
    building: hall.building?.name, floorId: String(hall.floor?._id || hall.floor), floor: hall.floor?.name || hall.floor,
    rows: hall.rows, cols: hall.cols, blocked: hall.blocked };
  for (const x of visibleRows) halls[x.hall.id] = { id: x.hall.id, name: x.hall.name, buildingId: String(x.hall.building?._id || x.hall.building),
    building: x.hall.building?.name, floorId: String(x.hall.floor?._id || x.hall.floor), floor: x.hall.floor?.name || x.hall.floor,
    rows: x.hall.rows, cols: x.hall.cols, blocked: x.hall.blocked };
  s.json({ version, halls: Object.values(halls), readOnly: restrictedView, restrictedSeats,
    seats: visibleRows.map(x => ({ id: x.id, hallId: String(x.hall._id), r: x.r, c: x.c, published: x.published,
    student: { id: x.student.id, name: x.student.name, roll: x.student.rollNumber, dept: x.student.department, year: x.student.year, semester: x.student.semester, subject: x.exam?.subject } })),
    rules, issues: restrictedView ? [] : validateAllocation(flat(rows), rules) });
});

export const post_exams_id_allocations_swap_3 = wrap(async (q, s) => {
  const { a, b } = z.object({ a: z.string(), b: z.string() }).parse(q.body);
  await withExamLock(q.params.id, async () => {
    const { version, rows, rules } = await load(q.params.id);
    const exam = await Exam.findById(q.params.id);
    if (!exam) return s.status(404).json({ error: 'Exam not found' });
    const buildingScope = q.user.scope?.buildings || [];
    if (q.user.role === 'officer' && buildingScope.length &&
        rows.some((row) => !buildingScope.some((id) => String(id) === String(row.hall.building?._id || row.hall.building)))) {
      return s.status(403).json({ error: 'Plan includes a building outside the officer scope' });
    }
    const departmentScope = q.user.scope?.departments || [];
    if (q.user.role === 'officer' && departmentScope.length &&
        rows.some((row) => !departmentScope.includes(row.student.department))) {
      return s.status(403).json({ error: 'Plan includes a department outside the officer scope' });
    }
    if (rows.some(x => x.published)) return s.status(409).json({ error: 'Plan is published. Create a new version to change it.' });
    const A = rows.find(x => x.id === a), B = rows.find(x => x.id === b);
    if (!A || !B) return s.status(404).json({ error: 'Seat not found' });
    const next = flat(rows).map(x => x.id === a ? { ...x, studentId: String(B.student._id), dept: B.student.department }
      : x.id === b ? { ...x, studentId: String(A.student._id), dept: A.student.department } : x);
    const issues = validateAllocation(next, rules);
    if (issues.length) return s.status(422).json({ error: 'Swap breaks a hard rule', diagnostics: issues });
    const sa = A.student._id, sb = B.student._id;
    await SeatingAllocation.updateOne({ _id: A._id }, { student: null });
    try {
      await SeatingAllocation.updateOne({ _id: B._id }, { student: sa });
      await SeatingAllocation.updateOne({ _id: A._id }, { student: sb });
    } catch (error) {
      await SeatingAllocation.updateOne({ _id: B._id }, { student: sb });
      await SeatingAllocation.updateOne({ _id: A._id }, { student: sa });
      throw error;
    }
    await AuditLog.create({ actor: q.user.id, action: 'allocation.swap', target: q.params.id, meta: { version, a, b } });
    s.json({ ok: true });
  });
});

export const post_exams_id_allocations_versions_4 = wrap(async (q, s) => {
  await withExamLock(q.params.id, async () => {
    const exam = await Exam.findById(q.params.id);
    if (!exam) return s.status(404).json({ error: 'Exam not found' });
    const latest = await SeatingAllocation.findOne({ exam: exam.id }).sort('-version');
    if (!latest) return s.status(400).json({ error: 'There is no plan to version' });
    const scope = q.user.scope?.buildings || [];
    const source = await SeatingAllocation.find({ exam: exam.id, version: latest.version }).populate('student').populate('hall');
    if (q.user.role === 'officer' && scope.length &&
        source.some((row) => !scope.some((id) => String(id) === String(row.hall.building)))) {
      return s.status(403).json({ error: 'Plan includes a building outside the officer scope' });
    }
    const departmentScope = q.user.scope?.departments || [];
    if (q.user.role === 'officer' && departmentScope.length &&
        source.some((row) => !departmentScope.includes(row.student.department))) {
      return s.status(403).json({ error: 'Plan includes a department outside the officer scope' });
    }
    const version = latest.version + 1;
    await SeatingAllocation.insertMany(source.map((row) => ({
      exam: exam.id, version, student: row.student._id, hall: row.hall._id, r: row.r, c: row.c
    })));
    const sourcePlan = await AllocationPlan.findOne({ exam: exam.id, version: latest.version });
    await AllocationPlan.create({ exam: exam.id, version, rules: sourcePlan?.rules, halls: sourcePlan?.halls || [...new Set(source.map((row) => String(row.hall._id)))] });
    exam.status = 'allocated';
    await exam.save();
    await AuditLog.create({ actor: q.user.id, action: 'allocation.version', target: exam.id, meta: { version } });
    s.json({ version, count: source.length });
  });
});

export const post_exams_id_allocations_move_5 = wrap(async (q, s) => {
  const { allocationId, hallId, r: row, c: col } = z.object({
    allocationId: z.string(), hallId: z.string(), r: z.number().int().min(0), c: z.number().int().min(0)
  }).strict().parse(q.body);
  await withExamLock(q.params.id, async () => {
    const { version, rows, rules } = await load(q.params.id);
    const exam = await Exam.findById(q.params.id);
    if (!exam) return s.status(404).json({ error: 'Exam not found' });
    if (rows.some((item) => item.published)) return s.status(409).json({ error: 'Published plans are locked; create a new version first' });
    const departmentScope = q.user.scope?.departments || [];
    if (q.user.role === 'officer' && departmentScope.length &&
        rows.some((item) => !departmentScope.includes(item.student.department))) {
      return s.status(403).json({ error: 'Plan includes a department outside the officer scope' });
    }
    const allocation = rows.find((item) => item.id === allocationId);
    if (!allocation) return s.status(404).json({ error: 'Student allocation not found' });
    const hall = await Hall.findById(hallId);
    if (!hall?.active || row >= hall.rows || col >= hall.cols) return s.status(400).json({ error: 'Select a valid seat in an active hall' });
    const buildingScope = q.user.scope?.buildings || [];
    if (q.user.role === 'officer' && buildingScope.length &&
        rows.some((item) => !buildingScope.some((id) => String(id) === String(item.hall.building?._id || item.hall.building)))) {
      return s.status(403).json({ error: 'Plan includes a building outside the officer scope' });
    }
    if (q.user.role === 'officer' && buildingScope.length &&
        !buildingScope.some((id) => String(id) === String(hall.building))) return s.status(403).json({ error: 'Officer is not assigned to this building' });
    if (hall.blocked.some((seat) => seat.r === row && seat.c === col)) return s.status(400).json({ error: 'That seat is blocked' });
    if (rows.some((item) => item.id !== allocationId && String(item.hall._id) === hallId && item.r === row && item.c === col)) {
      return s.status(409).json({ error: 'That seat is already occupied' });
    }
    const next = flat(rows).map((item) => item.id === allocationId ? {
      ...item, hallId, r: row, c: col
    } : item);
    const issues = validateAllocation(next, rules);
    if (issues.length) return s.status(422).json({ error: 'Move breaks a hard rule', diagnostics: issues });
    await SeatingAllocation.updateOne({ _id: allocation._id }, { hall: hallId, r: row, c: col });
    await AuditLog.create({ actor: q.user.id, action: 'allocation.move', target: q.params.id, meta: { version, allocationId, hallId, r: row, c: col } });
    s.json({ ok: true });
  });
});
