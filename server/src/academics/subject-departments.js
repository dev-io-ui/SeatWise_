export function subjectDepartmentNames(subject) {
  const departments = Array.isArray(subject.departments) ? subject.departments : [];
  return [...new Set(departments.length ? departments : subject.department ? [subject.department] : [])];
}
