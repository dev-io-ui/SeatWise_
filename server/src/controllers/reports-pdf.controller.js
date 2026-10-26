import { z } from 'zod';
import { Exam, SeatingAllocation, Student } from '../models/index.js';
import { departmentsForExam, examVisibleWithinDepartmentScope, resolveExamDepartments } from '../academics/exam-departments.js';
import { checkOfficerScope, drawTable, loadPlan, rowLabel, seatLabel, sendPdf } from './report-helpers.js';
import { wrap } from './shared.js';

const departmentColors = ['#4F6BFF', '#7567F8', '#16876A', '#F0BB58', '#0B7285', '#9C36B5'];

export const get_reports_hall_chart_pdf_1 = wrap(async (q, s) => {
  const query = z.object({ examId: z.string(), hallId: z.string() }).parse(q.query);
  const plan = await loadPlan(query.examId, query.hallId);
  if (plan.error) return s.status(404).json({ error: plan.error });
  if (!checkOfficerScope(q, s, plan.rows)) return;
  const hall = plan.rows[0].hall;
  const assigned = new Map(plan.rows.map((row) => [`${row.r},${row.c}`, row]));
  const departments = [...new Set(plan.rows.map((row) => row.student.department))].sort();
  const departmentColorsByName = new Map(departments.map((name, index) =>
    [name, departmentColors[index % departmentColors.length]]
  ));
  sendPdf(s, `${hall.code}-seating-chart.pdf`, (doc) => {
    const contentWidth = doc.page.width - 64, contentHeight = doc.page.height - 110;
    const colsPerPage = Math.max(1, Math.floor((contentWidth - 36) / 31));
    const rowsPerPage = Math.max(1, Math.floor((contentHeight - 65) / 31));
    for (let rowStart = 0; rowStart < hall.rows; rowStart += rowsPerPage) {
      for (let colStart = 0; colStart < hall.cols; colStart += colsPerPage) {
        if (rowStart || colStart) doc.addPage();
        doc.font('Helvetica-Bold').fontSize(16).text(`${plan.exam.subject} — ${hall.name}`, 32, 24);
        doc.font('Helvetica').fontSize(9).text(`${hall.building.name} · ${hall.floor.name} · ${plan.exam.date.toLocaleDateString()} · Version ${plan.version}`, 32, 47);
        const legendWidth = (doc.page.width - 64) / Math.max(1, departments.length);
        departments.forEach((department, index) => {
          const x = 32 + index * legendWidth;
          doc.fillColor(departmentColorsByName.get(department)).rect(x, 67, 9, 9).fill();
          doc.fillColor('#182033').fontSize(8).text(department, x + 13, 67, {
            width: Math.max(0, legendWidth - 16), lineBreak: false, ellipsis: true
          });
        });
        const visibleRows = Math.min(rowsPerPage, hall.rows - rowStart);
        const visibleCols = Math.min(colsPerPage, hall.cols - colStart);
        const cell = Math.min(31, (contentWidth - 36) / visibleCols, (contentHeight - 65) / visibleRows);
        const x0 = 50, y0 = 118;
        doc.fillColor('#151d3b').rect(x0, 88, visibleCols * cell, 20).fill();
        doc.fillColor('#ffffff').fontSize(9).text('FRONT / INVIGILATOR', x0, 94, { width: visibleCols * cell, align: 'center' });
        doc.font('Helvetica').fontSize(8);
        for (let row = rowStart; row < rowStart + visibleRows; row++) {
          const y = y0 + (row - rowStart) * cell;
          doc.fillColor('#182033').text(rowLabel(row), 32, y + Math.max(2, (cell - 8) / 2));
          for (let col = colStart; col < colStart + visibleCols; col++) {
            const x = x0 + (col - colStart) * cell;
            const isBlocked = hall.blocked.some((seat) => seat.r === row && seat.c === col);
            const seat = assigned.get(`${row},${col}`);
            const seatColor = seat ? departmentColorsByName.get(seat.student.department) : '#f5f7fc';
            doc.fillColor(isBlocked ? '#e4e6ed' : seatColor)
              .rect(x, y, cell - 2, cell - 2).fillAndStroke(isBlocked ? '#e4e6ed' : seatColor, '#8a93a8');
            if (isBlocked) {
              doc.moveTo(x + 3, y + 3).lineTo(x + cell - 5, y + cell - 5).stroke('#7d8495');
              doc.moveTo(x + cell - 5, y + 3).lineTo(x + 3, y + cell - 5).stroke('#7d8495');
            } else if (seat) {
              const textColor = seat.student.department && departments.indexOf(seat.student.department) % departmentColors.length === 3
                ? '#182033'
                : '#ffffff';
              doc.fillColor(textColor).fontSize(Math.max(5, Math.min(8, cell / 4)))
                .text(seat.student.department.slice(0, 3), x + 1, y + cell / 2 - 4, { width: cell - 4, align: 'center', lineBreak: false });
            } else {
              doc.fillColor('#6b7280').fontSize(7).text(String(col + 1), x + 1, y + cell / 2 - 4, { width: cell - 4, align: 'center', lineBreak: false });
            }
          }
        }
      }
    }
    const y = doc.page.height - 52;
    doc.moveTo(32, y).lineTo(280, y).stroke('#182033');
    doc.fillColor('#182033').fontSize(9).text('Invigilator signature', 32, y + 5);
    doc.text('X = blocked seat · Colors identify departments', 420, y + 5);
  });
});

export const get_reports_attendance_pdf_2 = wrap(async (q, s) => {
  const query = z.object({ examId: z.string(), hallId: z.string().optional() }).parse(q.query);
  const plan = await loadPlan(query.examId, query.hallId);
  if (plan.error) return s.status(404).json({ error: plan.error });
  if (!checkOfficerScope(q, s, plan.rows)) return;
  const rows = plan.rows.map((x) => [
    x.hall.name, seatLabel(x.r, x.c), x.student.rollNumber, x.student.name, x.student.department, ''
  ]);
  sendPdf(s, 'attendance-sheet.pdf', (doc) => drawTable(doc, `${plan.exam.subject} — attendance · ${plan.exam.date.toLocaleDateString()}`,
    ['Hall', 'Seat', 'Roll number', 'Student', 'Department', 'Signature'], [115, 70, 120, 200, 130, 105], rows));
});

export const get_reports_timetable_pdf_3 = wrap(async (q, s) => {
  const departments = q.user.role === 'officer' ? q.user.scope?.departments || [] : [];
  const allExams = await Exam.find().sort('date startTime');
  const resolvedDepartments = departments.length ? await resolveExamDepartments(allExams, Student) : new Map();
  const exams = allExams.filter((exam) => examVisibleWithinDepartmentScope(
    exam, departments, resolvedDepartments.get(String(exam._id)) || []
  ));
  const rows = exams.map((exam) => [
    exam.subject, exam.examType || 'Other', exam.program, `Y${exam.year} · S${exam.semester}`, departmentsForExam(exam).join(', ') || 'All eligible departments',
    exam.date.toLocaleDateString(), `${exam.startTime}–${exam.endTime}`, exam.status
  ]);
  sendPdf(s, 'exam-timetable.pdf', (doc) => drawTable(doc, 'SeatWise — examination timetable',
    ['Subject', 'Exam type', 'Program', 'Cohort', 'Department', 'Date', 'Time', 'Status'], [130, 78, 94, 78, 136, 82, 88, 48], rows));
});

export const get_reports_student_timetable_pdf_4 = wrap(async (q, s) => {
  const studentId = q.user.student?._id || q.user.student;
  const rows = await SeatingAllocation.find({ student: studentId, published: true }).populate('exam')
    .populate({ path: 'hall', populate: ['building', 'floor'] }).sort('exam.date exam.startTime');
  const data = rows.map((x) => [
    x.exam.subject, x.exam.examType || 'Other', x.exam.date.toLocaleDateString(), `${x.exam.startTime}–${x.exam.endTime}`,
    x.hall.building.name, x.hall.floor.name, x.hall.name, seatLabel(x.r, x.c)
  ]);
  sendPdf(s, 'my-exam-timetable.pdf', (doc) => drawTable(doc, `My exam timetable — ${q.user.student.name}`,
    ['Subject', 'Exam type', 'Date', 'Time', 'Building', 'Floor', 'Hall', 'Seat'], [128, 82, 84, 86, 120, 78, 85, 48], data));
});

export const get_reports_student_hall_ticket_pdf_5 = wrap(async (q, s) => {
  const studentId = q.user.student?._id || q.user.student;
  const query = z.object({ examId: z.string().optional() }).parse(q.query);
  const rows = await SeatingAllocation.find({
    student: studentId, published: true, ...(query.examId && { exam: query.examId })
  }).populate('exam').populate({ path: 'hall', populate: ['building', 'floor'] }).sort('exam.date');
  const data = rows.map((x) => [
    x.exam.subject, x.exam.examType || 'Other', x.exam.date.toLocaleDateString(), `${x.exam.startTime}–${x.exam.endTime}`,
    x.hall.building.name, x.hall.floor.name, x.hall.name, seatLabel(x.r, x.c)
  ]);
  sendPdf(s, 'my-hall-ticket.pdf', (doc) => drawTable(doc,
    `Hall ticket — ${q.user.student.name} · ${q.user.student.rollNumber}`,
    ['Subject', 'Exam type', 'Date', 'Time', 'Building', 'Floor', 'Hall', 'Seat'],
    [128, 82, 84, 86, 120, 78, 85, 48], data));
});
