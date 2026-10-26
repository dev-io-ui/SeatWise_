import { createHash } from 'node:crypto';
import { AllocationPlan, Building, Department, Exam, Floor, Hall, Program, SeatingAllocation, Student, Subject } from '../models/index.js';
import { academicCodePrefix, generateAcademicCode } from '../academics/codes.js';
import { subjectDepartmentNames } from '../academics/subject-departments.js';

const floorCode = (name) => `LEGACY-${createHash('sha1').update(name).digest('hex').slice(0, 10).toUpperCase()}`;
const sharedFirstYearSubjects = new Set([
  'Engineering Mathematics I',
  'Engineering Physics',
  'Engineering Mathematics II',
  'Engineering Chemistry'
]);

export async function migrateLegacyData() {
  let migratedFloors = 0;
  const legacyHalls = await Hall.collection.find({ floor: { $type: 'string' } }).toArray();
  for (const hall of legacyHalls) {
    const name = String(hall.floor || '').trim() || 'Unspecified Floor';
    const building = await Building.findById(hall.building);
    if (!building) throw new Error(`Cannot migrate hall ${hall.code || hall._id}: building is missing`);
    let floor = await Floor.findOne({ building: building._id, code: floorCode(name) });
    if (!floor) floor = await Floor.create({ name, code: floorCode(name), building: building._id });
    await Hall.collection.updateOne({ _id: hall._id }, { $set: { floor: floor._id } });
    migratedFloors++;
  }

  const [students, subjects] = await Promise.all([
    Student.find({}, 'program year semester').lean(),
    Subject.find({}, 'program year semester').lean()
  ]);
  const cohorts = new Map();
  for (const item of [...students, ...subjects]) {
    if (!item.program) continue;
    if (!cohorts.has(item.program)) cohorts.set(item.program, { years: new Set(), semesters: new Set() });
    if (Number.isInteger(item.year) && item.year > 0) cohorts.get(item.program).years.add(item.year);
    if (Number.isInteger(item.semester) && item.semester > 0) cohorts.get(item.program).semesters.add(item.semester);
  }
  for (const [name, cohort] of cohorts) {
    let program = await Program.findOne({ name });
    if (!program) {
      program = await Program.create({
        name, code: await generateAcademicCode(name),
        years: [...cohort.years].sort((a, b) => a - b),
        semesters: [...cohort.semesters].sort((a, b) => a - b)
      });
    } else {
      await Program.updateOne(
        { _id: program._id },
        { $addToSet: {
          years: { $each: [...cohort.years].sort((a, b) => a - b) },
          semesters: { $each: [...cohort.semesters].sort((a, b) => a - b) }
        } }
      );
    }
  }
  const departmentNames = await Student.distinct('department', { active: true });
  for (const name of departmentNames.map((value) => String(value || '').trim()).filter(Boolean)) {
    let code = name.replace(/[^a-z0-9]/gi, '').slice(0, 12).toUpperCase();
    if (!code) code = createHash('sha1').update(name).digest('hex').slice(0, 8).toUpperCase();
    if (await Department.exists({ code, name: { $ne: name } })) {
      code = `${code.slice(0, 7)}${createHash('sha1').update(name).digest('hex').slice(0, 4).toUpperCase()}`;
    }
    await Department.updateOne({ name }, { $setOnInsert: { name, code } }, { upsert: true });
  }
  const usedAcademicCodes = new Set();
  for (const program of await Program.find()) {
    const prefix = academicCodePrefix(program.name);
    if (!new RegExp(`^${prefix}\\d{4}$`).test(program.code || '') || usedAcademicCodes.has(program.code)) {
      program.code = await generateAcademicCode(program.name);
      await program.save();
    }
    usedAcademicCodes.add(program.code);
  }
  for (const department of await Department.find()) {
    const prefix = academicCodePrefix(department.name);
    if (!new RegExp(`^${prefix}\\d{4}$`).test(department.code || '') || usedAcademicCodes.has(department.code)) {
      department.code = await generateAcademicCode(department.name);
      await department.save();
    }
    usedAcademicCodes.add(department.code);
  }
  const departmentCodes = new Map((await Department.find({}, 'name code')).map((department) => [department.name, department.code]));
  for (const subject of await Subject.find()) {
    const prefix = subject.department && departmentCodes.has(subject.department)
      ? departmentCodes.get(subject.department).slice(0, 2)
      : academicCodePrefix(subject.program || subject.name);
    if (!new RegExp(`^${prefix}\\d{4}$`).test(subject.code || '') || usedAcademicCodes.has(subject.code)) {
      const previousCode = subject.code;
      subject.code = await generateAcademicCode(prefix);
      await subject.save();
      if (previousCode) {
        await Exam.updateMany(
          { subject: subject.name, subjectCode: previousCode, program: subject.program, year: subject.year, semester: subject.semester },
          { $set: { subjectCode: subject.code } }
        );
      }
    }
    usedAcademicCodes.add(subject.code);
  }
  let mergedCommonSubjects = 0;
  for (const commonName of sharedFirstYearSubjects) {
    for (const semester of [1, 2]) {
      const matches = await Subject.find({
        name: commonName, year: 1, semester, program: { $exists: true }
      }).sort('_id');
      if (matches.length < 2) continue;
      const [canonical, ...duplicates] = matches;
      const mappedDepartments = [...new Set(matches.flatMap(subjectDepartmentNames))];
      canonical.department = undefined;
      canonical.departments = mappedDepartments;
      await canonical.save();
      for (const duplicate of duplicates) {
        await Exam.updateMany(
          { subject: duplicate.name, subjectCode: duplicate.code, program: duplicate.program, year: duplicate.year, semester: duplicate.semester },
          { $set: { subjectCode: canonical.code } }
        );
        await Subject.deleteOne({ _id: duplicate._id });
        mergedCommonSubjects++;
      }
    }
  }
  await Exam.collection.updateMany(
    { $or: [{ departments: { $exists: false } }, { departments: { $size: 0 } }], department: { $type: 'string', $ne: '' } },
    [{ $set: { departments: ['$department'] } }]
  );

  let migratedPlans = 0;
  const versions = await SeatingAllocation.aggregate([
    { $group: { _id: { exam: '$exam', version: '$version' }, halls: { $addToSet: '$hall' } } }
  ]);
  for (const allocationVersion of versions) {
    const { exam, version } = allocationVersion._id;
    if (!await Exam.exists({ _id: exam })) continue;
    const result = await AllocationPlan.updateOne(
      { exam, version },
      { $setOnInsert: { exam, version, halls: allocationVersion.halls } },
      { upsert: true }
    );
    if (result.upsertedCount) migratedPlans++;
  }
  return { migratedFloors, migratedPlans, synchronizedPrograms: cohorts.size, mergedCommonSubjects };
}
