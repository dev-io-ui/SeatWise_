import 'dotenv/config';
import mongoose from 'mongoose'; import bcrypt from 'bcryptjs';
import { User, Student, Subject, Building, Floor, Hall, Exam, ExamResource, Program, Department, AcademicCodeSequence, SeatingAllocation, AllocationPlan, AuditLog, ImportBatch, AllocationLock } from './models/index.js';
import { generateAcademicCode } from './academics/codes.js';
const pw = process.env.SEED_PASSWORD; if (!pw) throw new Error('Set SEED_PASSWORD in .env');
await mongoose.connect(process.env.MONGO_URI);
await Promise.all([AllocationLock, SeatingAllocation, AllocationPlan, AuditLog, ImportBatch, ExamResource, User, Student, Subject, Hall, Floor, Building, Exam, Program, Department, AcademicCodeSequence].map(m => m.deleteMany({})));
const hash = await bcrypt.hash(pw, 10);
const programName = 'B.Tech';
await Program.create({
  name: programName, code: await generateAcademicCode(programName),
  years: [1, 2, 3, 4], semesters: [1, 2, 3, 4, 5, 6, 7, 8]
});
await User.create([
  { name: 'Super Admin', email: 'admin@gmail.com', passwordHash: hash, role: 'superadmin' },
  { name: 'Exam Officer', email: 'examofficer@gmail.com', passwordHash: hash, role: 'officer' }
]);
const b = await Building.create({ name: 'Building A', code: 'A' });
const floor = await Floor.create({ name: 'First Floor', code: 'F1', building: b.id });
const hall = await Hall.create({ name: 'Hall A-101', code: 'A-101', building: b.id, floor: floor.id, rows: 8, cols: 10, blocked: [{ r: 0, c: 0 }] });
const departments = ['CSE', 'AIML', 'ETC', 'CIVIL'];
const departmentRecords = new Map();
for (const name of departments) {
  const code = await generateAcademicCode(name);
  departmentRecords.set(name, await Department.create({ name, code }));
}
const studs = [];
for (const department of departments) {
  for (let semester = 1; semester <= 8; semester++) {
    const year = Math.ceil(semester / 2);
    for (let i = 1; i <= 30; i++) {
      const suffix = String(i).padStart(3, '0');
      const cohortId = `${department}S${semester}${suffix}`;
      studs.push({
        studentId: cohortId, name: `${department} Y${year} S${semester} Student ${i}`,
        rollNumber: `${cohortId}-R`, email: `${cohortId.toLowerCase()}@gmail.com`,
        program: programName, department, year, semester, section: 'A'
      });
    }
  }
}
if (studs.length !== departments.length * 8 * 30) {
  throw new Error('Seed data must include 30 students for every department and semester.');
}
const created = await Student.insertMany(studs);
for (const s of created) await User.create({ name: s.name, email: s.email.toLowerCase(), passwordHash: hash, role: 'student', student: s.id });
const departmentSubjects = {
  CSE: [
    ['Programming in C', 'Computer Fundamentals', 'Discrete Mathematics', 'Digital Logic', 'Problem Solving'],
    ['Data Structures', 'Object-Oriented Programming', 'Database Systems', 'Computer Organization', 'Web Technologies'],
    ['Design and Analysis of Algorithms', 'Operating Systems', 'Software Engineering', 'Theory of Computation', 'Probability and Statistics'],
    ['Computer Networks', 'Compiler Design', 'Artificial Intelligence', 'Software Testing', 'Microprocessors'],
    ['Machine Learning', 'Distributed Systems', 'Information Security', 'Data Mining', 'Cloud Computing'],
    ['Deep Learning', 'Natural Language Processing', 'Mobile Computing', 'Big Data Analytics', 'Computer Graphics'],
    ['Internet of Things', 'Blockchain Technology', 'Advanced Database Systems', 'DevOps Engineering', 'Elective I'],
    ['Advanced Artificial Intelligence', 'High Performance Computing', 'Research Project', 'Elective II', 'Industry Internship']
  ],
  AIML: [
    ['Programming in C', 'Computer Fundamentals', 'Discrete Mathematics', 'Digital Logic', 'Problem Solving'],
    ['Python Programming', 'Data Structures', 'Linear Algebra', 'Database Systems', 'Computer Organization'],
    ['Machine Learning Fundamentals', 'Probability and Statistics', 'Object-Oriented Programming', 'Data Analysis', 'Operating Systems'],
    ['Deep Learning', 'Algorithms', 'Computer Networks', 'Feature Engineering', 'Optimization Methods'],
    ['Natural Language Processing', 'Computer Vision', 'Reinforcement Learning', 'Big Data Analytics', 'Model Deployment'],
    ['Generative AI', 'Speech Processing', 'MLOps', 'AI Ethics', 'Time Series Analysis'],
    ['Advanced Computer Vision', 'Large Language Models', 'Robotics', 'Explainable AI', 'Elective I'],
    ['AI Research Project', 'Autonomous Systems', 'Advanced Deep Learning', 'Elective II', 'Industry Internship']
  ],
  ETC: [
    ['Programming in C', 'Engineering Drawing', 'Basic Electrical Engineering', 'Digital Logic', 'Problem Solving'],
    ['Electronic Devices', 'Circuit Theory', 'Data Structures', 'Signals and Systems', 'Network Analysis'],
    ['Analog Electronics', 'Digital System Design', 'Electromagnetic Fields', 'Engineering Mathematics III', 'Measurement Systems'],
    ['Microprocessors', 'Communication Systems I', 'Control Systems', 'VLSI Design', 'Signal Processing'],
    ['Digital Communications', 'Antenna and Wave Propagation', 'Embedded Systems', 'Electronic Measurements', 'Optical Communication'],
    ['Wireless Communications', 'Microwave Engineering', 'FPGA Design', 'Internet of Things', 'Digital Signal Processing'],
    ['Satellite Communications', 'RF Circuit Design', 'Advanced VLSI', 'Radar Systems', 'Elective I'],
    ['5G and 6G Networks', 'Wireless Sensor Networks', 'Thesis Project', 'Elective II', 'Industry Internship']
  ],
  CIVIL: [
    ['Engineering Drawing', 'Surveying I', 'Building Materials', 'Basic Electrical Engineering', 'Problem Solving'],
    ['Surveying II', 'Engineering Mechanics', 'Building Construction', 'Fluid Mechanics', 'Computer Applications in Civil Engineering'],
    ['Structural Analysis I', 'Geotechnical Engineering I', 'Hydraulics', 'Transportation Engineering I', 'Construction Materials'],
    ['Structural Analysis II', 'Geotechnical Engineering II', 'Water Resources Engineering', 'Concrete Technology', 'Environmental Engineering'],
    ['Reinforced Concrete Design', 'Foundation Engineering', 'Transportation Engineering II', 'Wastewater Engineering', 'Estimation and Costing'],
    ['Steel Structure Design', 'Irrigation Engineering', 'Construction Management', 'Urban Planning', 'Earthquake Engineering'],
    ['Bridge Engineering', 'Advanced Foundation Design', 'Remote Sensing and GIS', 'Sustainable Construction', 'Elective I'],
    ['Advanced Structural Design', 'Disaster Management', 'Civil Engineering Project', 'Elective II', 'Industry Internship']
  ]
};
const commonSubjects = [
  { semester: 1, names: ['Engineering Mathematics I', 'Engineering Physics'] },
  { semester: 2, names: ['Engineering Mathematics II', 'Engineering Chemistry'] }
];
const subjects = [];
for (const department of departments) {
  for (let semester = 1; semester <= 8; semester++) {
    const year = Math.ceil(semester / 2);
    const names = departmentSubjects[department][semester - 1];
    if (names.length !== 5) throw new Error(`Expected five seeded subjects for ${department}, semester ${semester}`);
    for (const name of names) {
      subjects.push(await Subject.create({
        name, code: await generateAcademicCode(departmentRecords.get(department).code.slice(0, 2)),
        program: programName, department, year, semester
      }));
    }
  }
}
for (const { semester, names } of commonSubjects) {
  const year = Math.ceil(semester / 2);
  for (const name of names) {
    subjects.push(await Subject.create({
      name, code: await generateAcademicCode('CM'),
      program: programName, departments, year, semester
    }));
  }
}
const examDate = new Date();
examDate.setUTCDate(examDate.getUTCDate() + 7);
examDate.setUTCHours(0, 0, 0, 0);
const examSubject = subjects.find((subject) =>
  subject.department === 'CSE' && subject.year === 2 && subject.semester === 3
);
if (!examSubject) throw new Error('The seeded CSE semester 3 exam subject is missing.');
await Exam.create({
  name: 'Mid-Sem', examType: 'Mid-semester', subject: examSubject.name, subjectCode: examSubject.code,
  program: programName, year: 2, semester: 3, departments: ['CSE'], department: 'CSE',
  date: examDate, startTime: '09:00', endTime: '12:00',
  eligible: created.filter((student) =>
    student.department === 'CSE' && student.year === 2 && student.semester === 3
  ).map((student) => student.id)
});
console.log(`Seeded SeatWise. Admin: admin@gmail.com, Officer: examofficer@gmail.com, password: SEED_PASSWORD. Hall: ${hall.code}`);
await mongoose.disconnect();
