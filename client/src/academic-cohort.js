export function semestersForYear(program, year) {
  const years = program?.years || [];
  const semesters = program?.semesters || [];
  const yearIndex = years.indexOf(Number(year));
  if (yearIndex < 0 || years.length === 0 || semesters.length === 0) return [];
  return semesters.filter((_, index) =>
    Math.floor(index * years.length / semesters.length) === yearIndex
  );
}
