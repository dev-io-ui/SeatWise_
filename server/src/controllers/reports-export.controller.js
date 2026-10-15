import ExcelJS from 'exceljs';
import { z } from 'zod';
import { expandSeats } from '../allocation/engine.js';
import { departmentsForExam } from '../academics/exam-departments.js';
import { checkOfficerScope, loadPlan, outputCsv, safeExcelText, seatLabel } from './report-helpers.js';
import { wrap } from './shared.js';

export const get_reports_allocation_csv_6 = wrap(async (q, s) => {
  const query = z.object({ examId: z.string(), hallId: z.string().optional(), buildingId: z.string().optional() }).parse(q.query);
  const plan = await loadPlan(query.examId, query.hallId);
  if (plan.error) return s.status(404).json({ error: plan.error });
  const rows = plan.rows.filter((x) => !query.buildingId || String(x.hall.building._id) === query.buildingId);
  if (!checkOfficerScope(q, s, rows)) return;
  outputCsv(s, 'allocation.csv',
    ['Subject', 'Exam type', 'Student', 'Roll', 'Department', 'Year', 'Semester', 'Building', 'Floor', 'Hall', 'Seat'],
    rows.map((x) => [x.exam.subject, x.exam.examType || 'Other', x.student.name, x.student.rollNumber, x.student.department, x.student.year, x.student.semester,
      x.hall.building.name, x.hall.floor.name, x.hall.name, seatLabel(x.r, x.c)]));
});

export const get_reports_student_allocation_csv_7 = (q, s) =>
  s.redirect(307, `/api/v1/reports/allocation.csv${q.url.includes('?') ? q.url.slice(q.url.indexOf('?')) : ''}`);

export const get_reports_allocation_xlsx_8 = wrap(async (q, s) => {
  const query = z.object({ examId: z.string(), hallId: z.string().optional(), buildingId: z.string().optional() }).parse(q.query);
  const plan = await loadPlan(query.examId, query.hallId);
  if (plan.error) return s.status(404).json({ error: plan.error });
  const rows = plan.rows.filter((x) => !query.buildingId || String(x.hall.building._id) === query.buildingId);
  if (!checkOfficerScope(q, s, rows)) return;
  const workbook = new ExcelJS.Workbook();
  const halls = new Map();
  for (const row of rows) {
    const key = String(row.hall._id);
    if (!halls.has(key)) halls.set(key, { hall: row.hall, assigned: 0 });
    halls.get(key).assigned++;
  }
  const hallsSheet = workbook.addWorksheet('halls');
  hallsSheet.addRows([['Building', 'Floor', 'Hall', 'Code', 'Capacity', 'Assigned'],
    ...[...halls.values()].map(({ hall, assigned }) => [
      hall.building.name, hall.floor.name, hall.name, hall.code, expandSeats(hall).length, assigned
    ].map(safeExcelText))]);
  const studentsSheet = workbook.addWorksheet('students');
  studentsSheet.addRows([['Name', 'Roll number', 'Department', 'Year', 'Semester', 'Exam type', 'Building', 'Floor', 'Hall', 'Seat'],
    ...rows.map((x) => [x.student.name, x.student.rollNumber, x.student.department, x.student.year, x.student.semester, x.exam.examType || 'Other',
      x.hall.building.name, x.hall.floor.name, x.hall.name, seatLabel(x.r, x.c)].map(safeExcelText))]);
  const timetable = workbook.addWorksheet('timetable');
  timetable.addRows([['Subject', 'Exam type', 'Code', 'Program', 'Year', 'Semester', 'Departments', 'Date', 'Start', 'End', 'Status'],
    [plan.exam.subject, plan.exam.examType || 'Other', plan.exam.subjectCode, plan.exam.program, plan.exam.year, plan.exam.semester,
      departmentsForExam(plan.exam).join(', ') || 'All eligible departments',
      plan.exam.date, plan.exam.startTime, plan.exam.endTime, plan.exam.status].map(safeExcelText)]);
  const summary = workbook.addWorksheet('summary');
  summary.addRows([['Exam', plan.exam.name], ['Exam type', plan.exam.examType || 'Other'], ['Subject', plan.exam.subject], ['Date', plan.exam.date],
    ['Departments', departmentsForExam(plan.exam).join(', ') || 'All eligible departments'],
    ['Version', plan.version], ['Students allocated', rows.length], ['Halls used', halls.size]]);
  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF151D3B' } };
    sheet.columns.forEach((column) => { column.width = Math.min(34, Math.max(14, ...column.values.map((value) => String(value ?? '').length + 2))); });
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  }
  s.type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').attachment('allocation.xlsx');
  await workbook.xlsx.write(s);
  s.end();
});
