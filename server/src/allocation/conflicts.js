// Timetable conflict detection: exams that overlap in time and share at least one student.
const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export function overlaps(a, b) {
  return a.date === b.date && toMin(a.startTime) < toMin(b.endTime) && toMin(b.startTime) < toMin(a.endTime);
}
// exams: [{id, date:'YYYY-MM-DD', startTime, endTime, studentIds:[]}]
export function findConflicts(exams) {
  const out = [];
  for (let i = 0; i < exams.length; i++) for (let j = i + 1; j < exams.length; j++) {
    if (!overlaps(exams[i], exams[j])) continue;
    const set = new Set(exams[j].studentIds);
    const shared = exams[i].studentIds.filter(s => set.has(s));
    if (shared.length) out.push({ a: exams[i].id, b: exams[j].id, students: shared });
  }
  return out;
}
