import test from 'node:test';
import assert from 'node:assert/strict';
import { subjectDepartmentNames } from '../academics/subject-departments.js';

test('shared subjects return all unique mapped departments', () => {
  assert.deepEqual(
    subjectDepartmentNames({ departments: ['CSE', 'AIML', 'CSE', 'ETC'] }),
    ['CSE', 'AIML', 'ETC']
  );
});

test('legacy single-department subject mappings remain supported', () => {
  assert.deepEqual(subjectDepartmentNames({ department: 'CIVIL' }), ['CIVIL']);
  assert.deepEqual(subjectDepartmentNames({}), []);
});
