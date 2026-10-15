export function departmentsForExam(exam, eligibleDepartments = []) {
  const departments = exam.departments?.length
    ? exam.departments
    : exam.department
      ? [exam.department]
      : exam.eligible?.some((student) => student && typeof student === 'object' && student.department)
        ? exam.eligible.map((student) => student.department)
        : eligibleDepartments;
  return [...new Set(departments)];
}

export function examWithinDepartmentScope(exam, departments) {
  if (!departments.length) return true;
  const cohort = departmentsForExam(exam);
  return cohort.length > 0 && cohort.every((department) => departments.includes(department));
}

export function examVisibleWithinDepartmentScope(exam, departments, eligibleDepartments = []) {
  if (!departments.length) return true;
  return departmentsForExam(exam, eligibleDepartments).some((department) => departments.includes(department));
}

export async function resolveExamDepartments(exams, Student) {
  const unresolved = exams.filter((exam) => !departmentsForExam(exam).length);
  const studentIds = [...new Set(unresolved.flatMap((exam) => exam.eligible || []).map(String))];
  if (!studentIds.length) return new Map();
  const students = await Student.find({ _id: { $in: studentIds } }).select('_id department').lean();
  const byId = new Map(students.map((student) => [String(student._id), student.department]));
  return new Map(unresolved.map((exam) => [
    String(exam._id || exam.id),
    [...new Set((exam.eligible || []).map((id) => byId.get(String(id))).filter(Boolean))]
  ]));
}
