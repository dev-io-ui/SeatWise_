// Constraint-aware seat allocation. Pure functions, no DB access.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function expandSeats(hall) {
  const blocked = new Set((hall.blocked || []).map(b => `${b.r},${b.c}`));
  const seats = [];
  for (let r = 0; r < hall.rows; r++) for (let c = 0; c < hall.cols; c++)
    if (!blocked.has(`${r},${c}`)) seats.push({ hallId: hall.id, r, c });
  return seats;
}
const key = (h, r, c) => `${h}:${r}:${c}`;
const neighbours = (rules) => {
  const d = [];
  if (rules.horizontal) d.push([0, 1], [0, -1]);
  if (rules.vertical) d.push([1, 0], [-1, 0]);
  if (rules.diagonal) d.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  return d;
};
export const defaultRules = { horizontal: true, vertical: true, diagonal: false };

export function conflictsAt(map, seat, student, rules) {
  const out = [];
  for (const [dr, dc] of neighbours(rules)) {
    const n = map.get(key(seat.hallId, seat.r + dr, seat.c + dc));
    if (n && n.dept === student.dept) out.push(n);
  }
  return out;
}

// Full validation of a finished allocation: returns list of problems.
export function validateAllocation(assignments, rules = defaultRules) {
  const map = new Map(), seatUsed = new Set(), stuUsed = new Set(), issues = [];
  for (const a of assignments) {
    const k = key(a.hallId, a.r, a.c);
    if (seatUsed.has(k)) issues.push({ type: 'DUPLICATE_SEAT', seat: a });
    if (stuUsed.has(a.studentId)) issues.push({ type: 'DUPLICATE_STUDENT', studentId: a.studentId });
    seatUsed.add(k); stuUsed.add(a.studentId); map.set(k, a);
  }
  for (const a of assignments)
    for (const [dr, dc] of neighbours(rules)) {
      const n = map.get(key(a.hallId, a.r + dr, a.c + dc));
      if (n && n.dept === a.dept && a.studentId < n.studentId)
        issues.push({ type: 'ADJACENT_SAME_DEPT', dept: a.dept, a, b: n });
    }
  return issues;
}

export function precheck(students, seats, rules) {
  const issues = [];
  if (students.length > seats.length)
    issues.push({ type: 'INSUFFICIENT_CAPACITY', students: students.length, seats: seats.length,
      suggestion: 'Add another hall or unblock seats.' });
  const depts = new Set(students.map(s => s.dept));
  if (depts.size === 1 && students.length > 1 && (rules.horizontal || rules.vertical) &&
      seats.length && seats.length < students.length) {
    issues.push({ type: 'SINGLE_DEPARTMENT', dept: [...depts][0],
      suggestion: 'Add another hall, add another department group, or explicitly relax horizontal or vertical separation.' });
  }
  return issues;
}

// students: [{studentId, dept}]. Returns {ok, assignments, diagnostics}.
export function allocate(students, halls, { rules = defaultRules, seed = 1, nodeBudget = 200000 } = {}) {
  const seats = halls.flatMap(expandSeats);
  const diagnostics = precheck(students, seats, rules);
  if (diagnostics.length) return { ok: false, assignments: [], diagnostics };
  if (new Set(students.map((student) => student.dept)).size === 1 && (rules.horizontal || rules.vertical)) {
    const theoreticalCapacity = halls.reduce((total, hall) => {
      if ((hall.blocked || []).length) return total + expandSeats(hall).length;
      if (rules.diagonal) return total + Math.ceil(hall.rows / 2) * Math.ceil(hall.cols / 2);
      if (rules.horizontal && rules.vertical) return total + Math.ceil(hall.rows * hall.cols / 2);
      if (rules.horizontal) return total + hall.rows * Math.ceil(hall.cols / 2);
      return total + hall.cols * Math.ceil(hall.rows / 2);
    }, 0);
    if (students.length > theoreticalCapacity) return {
      ok: false, assignments: [], diagnostics: [{
        type: 'SINGLE_DEPARTMENT', dept: students[0].dept, students: students.length, separatedCapacity: theoreticalCapacity,
        suggestion: 'Add another hall, add another department group, or explicitly relax horizontal or vertical separation.'
      }]
    };
  }
  const rnd = mulberry32(seed);
  const groups = new Map();
  for (const s of students) { if (!groups.has(s.dept)) groups.set(s.dept, []); groups.get(s.dept).push(s); }
  for (const g of groups.values()) for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
  const remaining = groups;
  const map = new Map(), out = []; let nodes = 0;
  const total = students.length;
  function place(i, placed) {
    if (placed === total) return true;
    if (i >= seats.length || seats.length - i < total - placed) return false;
    if (++nodes > nodeBudget) return false;
    const seat = seats[i];
    const depts = [...remaining.entries()].filter(([, l]) => l.length).sort((a, b) => b[1].length - a[1].length);
    for (const [d, l] of depts) {
      const stu = l[l.length - 1];
      if (conflictsAt(map, seat, stu, rules).length) continue;
      l.pop(); const a = { ...seat, studentId: stu.studentId, dept: d };
      map.set(key(seat.hallId, seat.r, seat.c), a); out.push(a);
      if (place(i + 1, placed + 1)) return true;
      out.pop(); map.delete(key(seat.hallId, seat.r, seat.c)); l.push(stu);
    }
    return place(i + 1, placed);
  }
  const ok = place(0, 0);
  if (!ok) return { ok: false, assignments: [], diagnostics: [{ type: 'NO_VALID_ARRANGEMENT',
    nodesSearched: nodes, suggestion: 'Add another hall, add another department group, or explicitly relax horizontal, vertical, or diagonal separation.' }] };
  const issues = validateAllocation(out, rules);
  return issues.length ? { ok: false, assignments: out, diagnostics: issues } : { ok: true, assignments: out, diagnostics: [] };
}
