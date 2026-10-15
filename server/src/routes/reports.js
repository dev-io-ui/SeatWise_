import { Router } from 'express';
import { requireRole } from '../middleware/auth.js';
import { authenticate, staff, adminOrOfficer, get_reports_hall_chart_pdf_1, get_reports_attendance_pdf_2, get_reports_timetable_pdf_3, get_reports_student_timetable_pdf_4, get_reports_student_hall_ticket_pdf_5, get_reports_allocation_csv_6, get_reports_student_allocation_csv_7, get_reports_allocation_xlsx_8 } from '../controllers/reports.controller.js';

const r = Router();

r.get('/reports/hall-chart.pdf', ...adminOrOfficer, get_reports_hall_chart_pdf_1);
r.get('/reports/attendance.pdf', ...adminOrOfficer, get_reports_attendance_pdf_2);
r.get('/reports/timetable.pdf', ...adminOrOfficer, get_reports_timetable_pdf_3);
r.get('/reports/student-timetable.pdf', authenticate, requireRole('student'), get_reports_student_timetable_pdf_4);
r.get('/reports/student-hall-ticket.pdf', authenticate, requireRole('student'), get_reports_student_hall_ticket_pdf_5);
r.get('/reports/allocation.csv', ...adminOrOfficer, get_reports_allocation_csv_6);
r.get('/reports/student-allocation.csv', ...adminOrOfficer, get_reports_student_allocation_csv_7);
r.get('/reports/allocation.xlsx', ...adminOrOfficer, get_reports_allocation_xlsx_8);

export default r;
