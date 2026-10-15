import test from 'node:test';
import assert from 'node:assert/strict';
import { findConflicts } from '../allocation/conflicts.js';
const e = (id, s, en, ids, date = '2026-11-02') => ({ id, date, startTime: s, endTime: en, studentIds: ids });
test('overlapping exams with a shared student conflict', () => {
  const c = findConflicts([e('A', '09:00', '12:00', ['1', '2']), e('B', '11:00', '13:00', ['2', '3'])]);
  assert.deepEqual(c, [{ a: 'A', b: 'B', students: ['2'] }]);
});
test('back-to-back, different day, or disjoint students do not conflict', () => {
  assert.equal(findConflicts([e('A', '09:00', '12:00', ['1']), e('B', '12:00', '14:00', ['1'])]).length, 0);
  assert.equal(findConflicts([e('A', '09:00', '12:00', ['1']), e('B', '09:00', '12:00', ['1'], '2026-11-03')]).length, 0);
  assert.equal(findConflicts([e('A', '09:00', '12:00', ['1']), e('B', '10:00', '12:00', ['2'])]).length, 0);
});
