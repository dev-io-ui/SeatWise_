import test from 'node:test';
import assert from 'node:assert/strict';
import { allocate, validateAllocation } from '../allocation/engine.js';
const mk = (d, n) => Array.from({ length: n }, (_, i) => ({ studentId: `${d}${String(i).padStart(3, '0')}`, dept: d }));
const hall = (id, rows, cols, blocked = []) => ({ id, rows, cols, blocked });

test('four departments: no horizontal/vertical same-dept neighbours', () => {
  const s = [...mk('CSE', 20), ...mk('EEE', 20), ...mk('ECE', 20), ...mk('MECH', 20)];
  const r = allocate(s, [hall('H1', 8, 10)], { seed: 7 });
  assert.equal(r.ok, true); assert.equal(r.assignments.length, 80);
  assert.deepEqual(validateAllocation(r.assignments), []);
});
test('blocked seats are never used', () => {
  const r = allocate([...mk('CSE', 10), ...mk('EEE', 10)], [hall('H1', 5, 5, [{ r: 0, c: 0 }, { r: 2, c: 2 }])]);
  assert.equal(r.ok, true);
  assert.ok(!r.assignments.some(a => (a.r === 0 && a.c === 0) || (a.r === 2 && a.c === 2)));
});
test('insufficient capacity is reported, not forced', () => {
  const r = allocate([...mk('CSE', 30), ...mk('EEE', 30)], [hall('H1', 4, 4)]);
  assert.equal(r.ok, false); assert.equal(r.diagnostics[0].type, 'INSUFFICIENT_CAPACITY');
});
test('single department with hard rule is rejected with explanation', () => {
  const r = allocate(mk('CSE', 14), [hall('H1', 5, 5)]);
  assert.equal(r.ok, false); assert.equal(r.diagnostics[0].type, 'SINGLE_DEPARTMENT');
});
test('one department is allowed when empty seats can preserve separation', () => {
  const r = allocate(mk('CSE', 10), [hall('H1', 5, 5)]);
  assert.equal(r.ok, true);
  assert.deepEqual(validateAllocation(r.assignments), []);
});
test('unseparable unbalanced departments fail clearly', () => {
  const r = allocate([...mk('CSE', 24), ...mk('EEE', 1)], [hall('H1', 5, 5)]);
  assert.equal(r.ok, false);
});
test('no student or seat assigned twice', () => {
  const r = allocate([...mk('CSE', 12), ...mk('EEE', 12), ...mk('ECE', 12)], [hall('H1', 6, 6)], { seed: 3 });
  assert.equal(new Set(r.assignments.map(a => a.studentId)).size, r.assignments.length);
  assert.equal(new Set(r.assignments.map(a => `${a.r},${a.c}`)).size, r.assignments.length);
});
test('validator flags a manual adjacent placement', () => {
  const bad = [{ hallId: 'H', r: 0, c: 0, studentId: 'a', dept: 'CSE' }, { hallId: 'H', r: 0, c: 1, studentId: 'b', dept: 'CSE' }];
  assert.equal(validateAllocation(bad)[0].type, 'ADJACENT_SAME_DEPT');
});

test('validator rejects duplicate students and duplicate seats', () => {
  const duplicate = [
    { hallId: 'H', r: 0, c: 0, studentId: 'a', dept: 'CSE' },
    { hallId: 'H', r: 0, c: 0, studentId: 'a', dept: 'CSE' }
  ];
  const types = validateAllocation(duplicate).map((issue) => issue.type);
  assert.ok(types.includes('DUPLICATE_SEAT'));
  assert.ok(types.includes('DUPLICATE_STUDENT'));
});

test('optional diagonal separation is validated', () => {
  const diagonal = [
    { hallId: 'H', r: 0, c: 0, studentId: 'a', dept: 'CSE' },
    { hallId: 'H', r: 1, c: 1, studentId: 'b', dept: 'CSE' }
  ];
  assert.equal(validateAllocation(diagonal).length, 0);
  assert.equal(validateAllocation(diagonal, { horizontal: true, vertical: true, diagonal: true })[0].type, 'ADJACENT_SAME_DEPT');
});
