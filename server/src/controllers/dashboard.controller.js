import { z } from 'zod';
import { Student, User, Building, Hall, Exam, SeatingAllocation } from '../models/index.js';
import { expandSeats } from '../allocation/engine.js';
import { examVisibleWithinDepartmentScope, resolveExamDepartments } from '../academics/exam-departments.js';
import { wrap } from './shared.js';

export const get_dashboard_1 = wrap(async (q, s) => {
  const departmentScope = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  const buildingScope = q.user.role === 'officer' ? q.user.scope?.buildings || [] : [];
  const studentFilter = { active: true, ...(departmentScope.length && { department: { $in: departmentScope } }) };
  const [students, officers, buildings, halls, exams, published] = await Promise.all([
    Student.countDocuments(studentFilter),
    User.countDocuments({ role: 'officer', active: true }),
    Building.countDocuments({ active: true, ...(buildingScope.length && { _id: { $in: buildingScope } }) }),
    Hall.find({ active: true, ...(buildingScope.length && { building: { $in: buildingScope } }) }),
    Exam.find().sort('date'),
    SeatingAllocation.distinct('exam', { published: true })
  ]);
  const byDept = await Student.aggregate([{ $match: studentFilter }, { $group: { _id: '$department', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]);
  const capacity = halls.reduce((total, hall) => total + expandSeats({
    id: hall.id, rows: hall.rows, cols: hall.cols, blocked: hall.blocked
  }).length, 0);
  const resolvedDepartments = departmentScope.length ? await resolveExamDepartments(exams, Student) : new Map();
  const visibleExams = exams.filter((exam) => examVisibleWithinDepartmentScope(
    exam, departmentScope, resolvedDepartments.get(String(exam._id)) || []
  ));
  const visibleExamIds = new Set(visibleExams.map((exam) => String(exam._id)));
  s.json({
    students, officers, buildings, halls: halls.length, capacity, exams: visibleExams.length,
    published: published.filter((id) => visibleExamIds.has(String(id))).length, pending: visibleExams.filter((exam) => exam.status === 'draft').length,
    upcoming: visibleExams.filter((exam) => exam.date >= new Date()).slice(0, 5).map((exam) => {
      const result = exam.toObject();
      delete result.eligible;
      return result;
    }), byDept
  });
});

export const get_public_seat_2 = wrap(async (q, s) => {
  const roll = z.string().trim().min(1).max(40).parse(String(q.query.roll || ''));
  const student = await Student.findOne({ rollNumber: roll, active: true }).select('_id');
  const rows = student ? await SeatingAllocation.find({ student: student._id, published: true })
    .populate('exam').populate({ path: 'hall', populate: ['building', 'floor'] }) : [];
  s.json(rows.map((row) => ({
    subject: row.exam.subject, code: row.exam.subjectCode, date: row.exam.date, start: row.exam.startTime, end: row.exam.endTime,
    building: row.hall.building.name, floor: row.hall.floor.name, hall: row.hall.name,
    seat: `${String.fromCharCode(65 + row.r)}${row.c + 1}`
  })));
});
