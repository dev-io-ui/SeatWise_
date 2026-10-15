import { createHash } from 'node:crypto';
import { AllocationPlan, Building, Department, Exam, Floor, Hall, Program, SeatingAllocation, Student, Subject } from '../models/index.js';

const floorCode = (name) => `LEGACY-${createHash('sha1').update(name).digest('hex').slice(0, 10).toUpperCase()}`;

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
    await Program.updateOne(
      { name },
      {
        $setOnInsert: { name },
        $addToSet: { years: { $each: [...cohort.years].sort((a, b) => a - b) }, semesters: { $each: [...cohort.semesters].sort((a, b) => a - b) } }
      },
      { upsert: true }
    );
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
  return { migratedFloors, migratedPlans, synchronizedPrograms: cohorts.size };
}
