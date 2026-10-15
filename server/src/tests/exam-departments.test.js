import test from 'node:test';
import assert from 'node:assert/strict';
import { departmentsForExam, examVisibleWithinDepartmentScope, examWithinDepartmentScope } from '../academics/exam-departments.js';

test('department helper prefers canonical multi-department data and removes duplicates', () => {
  assert.deepEqual(departmentsForExam({ departments: ['CSE', 'ECE', 'CSE'], department: 'MECH' }), ['CSE', 'ECE']);
});

test('legacy single-department exams remain compatible with scoped officer access', () => {
  const legacyExam = { department: 'CSE' };
  assert.deepEqual(departmentsForExam(legacyExam), ['CSE']);
  assert.equal(examWithinDepartmentScope(legacyExam, ['CSE']), true);
  assert.equal(examWithinDepartmentScope(legacyExam, ['ECE']), false);
});

test('scoped officers can access a shared exam only when every department is in scope', () => {
  const exam = { departments: ['CSE', 'ECE'] };
  assert.equal(examWithinDepartmentScope(exam, ['CSE', 'ECE']), true);
  assert.equal(examWithinDepartmentScope(exam, ['CSE']), false);
  assert.equal(examWithinDepartmentScope({ departments: [] }, ['CSE']), false);
  assert.equal(examWithinDepartmentScope(exam, []), true);
});

test('officers can see shared exams that include their department without gaining full-plan edit scope', () => {
  const sharedExam = { departments: ['CSE', 'ECE'] };
  assert.equal(examVisibleWithinDepartmentScope(sharedExam, ['CSE']), true);
  assert.equal(examWithinDepartmentScope(sharedExam, ['CSE']), false);
  assert.equal(examVisibleWithinDepartmentScope(sharedExam, ['EEE']), false);
});

test('all-eligible exams use their eligible student departments for officer visibility', () => {
  const allEligibleExam = { departments: [], eligible: ['student-1', 'student-2'] };
  assert.equal(examVisibleWithinDepartmentScope(allEligibleExam, ['CSE'], ['CSE', 'MECH']), true);
  assert.equal(examVisibleWithinDepartmentScope(allEligibleExam, ['EEE'], ['CSE', 'MECH']), false);
  assert.equal(examWithinDepartmentScope(allEligibleExam, ['CSE']), false);
});
