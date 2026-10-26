import { z } from 'zod';
import { Exam, SeatingAllocation, Student } from '../models/index.js';
import { departmentsForExam, examVisibleWithinDepartmentScope, resolveExamDepartments } from '../academics/exam-departments.js';
import { checkOfficerScope, drawTable, loadPlan, rowLabel, seatLabel, sendPdf } from './report-helpers.js';
import { wrap } from './shared.js';

const departmentColors = ['#4F6BFF', '#7567F8', '#16876A', '#F0BB58', '#0B7285', '#9C36B5'];

function fitSeatText(doc, value, width) {
  const source = String(value ?? '');
  if (width <= 0) return '';
  if (doc.widthOfString(source) <= width) return source;
  let text = source;
  while (text.length && doc.widthOfString(`${text}…`) > width) text = text.slice(0, -1);
  return text ? `${text}…` : '';
}

async function studentSchedule(studentId) {
  const exams = await Exam.find({ eligible: studentId, status: { $in: ['allocated', 'published'] } })
    .sort('date startTime').lean();
  const versions = exams.length ? await SeatingAllocation.aggregate([
    { $match: { student: studentId, exam: { $in: exams.map((exam) => exam._id) } } },
    { $group: { _id: '$exam', version: { $max: '$version' } } }
  ]) : [];
  const rows = versions.length ? await SeatingAllocation.find({ student: studentId, $or: versions.map(({ _id, version }) => ({ exam: _id, version })) })
    .populate('exam').populate({ path: 'hall', populate: ['building', 'floor'] }).lean() : [];
  const byExam = new Map(rows.map((row) => [String(row.exam._id), row]));
  return exams.map((exam) => ({ exam, allocation: byExam.get(String(exam._id)) }));
}

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
    const x0 = 50, y0 = 116, chartWidth = doc.page.width - x0 - 32;
    const chartHeight = doc.page.height - y0 - 65;
    const cellW = chartWidth / hall.cols, cellH = chartHeight / hall.rows;
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
        doc.fillColor('#151d3b').rect(x0, 88, chartWidth, 20).fill();
        doc.fillColor('#ffffff').fontSize(9).text('FRONT / INVIGILATOR', x0, 94, { width: chartWidth, align: 'center' });
        doc.font('Helvetica').fontSize(8);
        for (let row = 0; row < hall.rows; row++) {
          const y = y0 + row * cellH;
          doc.fillColor('#182033').fontSize(Math.min(8, cellH * 0.6)).text(rowLabel(row), 32, y + Math.max(0, (cellH - 8) / 2));
          for (let col = 0; col < hall.cols; col++) {
            const x = x0 + col * cellW;
            const isBlocked = hall.blocked.some((seat) => seat.r === row && seat.c === col);
            const seat = assigned.get(`${row},${col}`);
            const seatColor = seat ? departmentColorsByName.get(seat.student.department) : '#f5f7fc';
            doc.fillColor(isBlocked ? '#e4e6ed' : seatColor)
              .rect(x, y, Math.max(0, cellW - 1), Math.max(0, cellH - 1)).fillAndStroke(isBlocked ? '#e4e6ed' : seatColor, '#8a93a8');
            if (isBlocked) {
              doc.moveTo(x + 1, y + 1).lineTo(x + cellW - 2, y + cellH - 2).stroke('#7d8495');
              doc.moveTo(x + cellW - 2, y + 1).lineTo(x + 1, y + cellH - 2).stroke('#7d8495');
            } else if (seat) {
              const textColor = departments.indexOf(seat.student.department) % departmentColors.length === 3 ? '#182033' : '#ffffff';
              const fontSize = Math.min(7, cellW * 0.12, cellH * 0.15);
              const textX = x + 2, textWidth = Math.max(0, cellW - 4);
              const lineStep = cellH / 4;
              const textY = (line) => y + lineStep * line + (lineStep - fontSize) / 2;
              doc.fillColor(textColor).font('Helvetica-Bold').fontSize(fontSize)
                .text(fitSeatText(doc, seat.student.department, textWidth), textX, textY(0), { lineBreak: false });
              doc.font('Helvetica').fontSize(fontSize)
                .text(fitSeatText(doc, seat.student.name, textWidth), textX, textY(1), { lineBreak: false })
                .text(fitSeatText(doc, seat.student.rollNumber, textWidth), textX, textY(2), { lineBreak: false })
                .text(fitSeatText(doc, `Seat ${seatLabel(row, col)}`, textWidth), textX, textY(3), { lineBreak: false });
            } else {
              doc.fillColor('#6b7280').fontSize(Math.min(7, cellW * 0.15, cellH * 0.3))
                .text(String(col + 1), x + 1, y + cellH / 2 - 4, { width: Math.max(0, cellW - 2), align: 'center', lineBreak: false });
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
  const schedule = await studentSchedule(studentId);
  const data = schedule.map(({ exam, allocation }) => [
    exam.subject, exam.examType || 'Other', new Date(exam.date).toLocaleDateString(), `${exam.startTime}–${exam.endTime}`,
    allocation?.hall?.building?.name || 'Pending', allocation?.hall?.floor?.name || 'Pending',
    allocation?.hall?.name || 'Pending', allocation ? seatLabel(allocation.r, allocation.c) : 'Pending'
  ]);
  sendPdf(s, 'my-exam-timetable.pdf', (doc) => drawTable(doc, `My exam timetable — ${q.user.student.name}`,
    ['Subject', 'Exam type', 'Date', 'Time', 'Building', 'Floor', 'Hall', 'Seat'], [128, 82, 84, 86, 120, 78, 85, 48], data));
});

export const get_reports_student_hall_ticket_pdf_5 = wrap(async (q, s) => {
  const studentId = q.user.student?._id || q.user.student;
  const query = z.object({ examId: z.string().optional() }).parse(q.query);
  const schedule = await studentSchedule(studentId);
  const data = schedule.filter(({ exam }) => !query.examId || String(exam._id) === query.examId).map(({ exam, allocation }) => [
    exam.subject, exam.examType || 'Other', new Date(exam.date).toLocaleDateString(), `${exam.startTime}–${exam.endTime}`,
    allocation?.hall?.building?.name || 'Pending', allocation?.hall?.floor?.name || 'Pending',
    allocation?.hall?.name || 'Pending', allocation ? seatLabel(allocation.r, allocation.c) : 'Pending'
  ]);
  sendPdf(s, 'my-hall-ticket.pdf', (doc) => drawTable(doc,
    `Hall ticket — ${q.user.student.name} · ${q.user.student.rollNumber}`,
    ['Subject', 'Exam type', 'Date', 'Time', 'Building', 'Floor', 'Hall', 'Seat'],
    [128, 82, 84, 86, 120, 78, 85, 48], data));
});
