import jwt from 'jsonwebtoken';
import { User } from '../models/index.js';
export const sign = (u) => jwt.sign({ id: u.id }, process.env.JWT_SECRET, { expiresIn: '8h' });
export async function authenticate(req, res, next) {
  let token;
  try {
    token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Not authenticated' });
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const u = await User.findById(payload.id).populate('student');
    if (!u?.active) return res.status(401).json({ error: 'Account inactive' });
    if (u.role === 'student' && (!u.student?.active || u.registrationStatus !== 'approved' || u.student.registrationStatus !== 'approved')) {
      return res.status(403).json({ error: 'Student registration is awaiting approval.' });
    }
    req.user = u;
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Invalid token' });
    }
    next(error);
  }
}
export const requireRole = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : res.status(403).json({ error: 'Forbidden' });

export function officerBuildingAccess(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  const allowed = req.user.scope?.buildings || [];
  const buildingId = req.params?.buildingId || req.body?.building || req.query?.buildingId;
  if (!allowed.length || allowed.some((id) => String(id) === String(buildingId))) return next();
  return res.status(403).json({ error: 'Officer is not assigned to this building' });
}

export function officerDepartmentAccess(req, res, next) {
  if (req.user.role === 'superadmin') return next();
  const allowed = req.user.scope?.departments || [];
  const department = req.body?.department || req.query?.department;
  if (!allowed.length || !department || allowed.includes(department)) return next();
  return res.status(403).json({ error: 'Officer is not assigned to this department' });
}
