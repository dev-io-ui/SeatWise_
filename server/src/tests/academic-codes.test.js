import test from 'node:test';
import assert from 'node:assert/strict';
import { academicCodePrefix, formatAcademicCode } from '../academics/codes.js';

test('academic code prefixes use the first two alphanumeric characters', () => {
  assert.equal(academicCodePrefix('B.Tech'), 'BT');
  assert.equal(academicCodePrefix('CIVIL'), 'CI');
  assert.equal(academicCodePrefix('A'), 'AX');
});

test('academic codes have exactly two prefix characters and four digits', () => {
  assert.equal(formatAcademicCode('CS', 1), 'CS0001');
  assert.equal(formatAcademicCode('AI', 9999), 'AI9999');
  assert.throws(() => formatAcademicCode('CS', 10000), RangeError);
});
