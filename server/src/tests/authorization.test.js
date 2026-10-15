import test from 'node:test';
import assert from 'node:assert/strict';
import { officerBuildingAccess, officerDepartmentAccess, requireRole } from '../middleware/auth.js';

function response() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

test('role guard rejects students from staff operations', () => {
  const res = response();
  let continued = false;
  requireRole('superadmin', 'officer')({ user: { role: 'student' } }, res, () => { continued = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(continued, false);
});

test('officer scope rejects unassigned buildings and departments', () => {
  const req = { user: { role: 'officer', scope: { buildings: ['b1'], departments: ['CSE'] } }, body: { building: 'b2', department: 'MECH' } };
  const buildingResponse = response();
  officerBuildingAccess(req, buildingResponse, () => assert.fail('unassigned building must not pass'));
  assert.equal(buildingResponse.statusCode, 403);
  const departmentResponse = response();
  officerDepartmentAccess(req, departmentResponse, () => assert.fail('unassigned department must not pass'));
  assert.equal(departmentResponse.statusCode, 403);
});

test('super admins pass officer scope guards', () => {
  const req = { user: { role: 'superadmin' }, body: { building: 'b2', department: 'MECH' } };
  assert.doesNotThrow(() => officerBuildingAccess(req, response(), () => {}));
  assert.doesNotThrow(() => officerDepartmentAccess(req, response(), () => {}));
});
