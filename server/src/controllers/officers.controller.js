import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { User, Building, Department, AuditLog } from '../models/index.js';
import { wrap } from './shared.js';

export const get_officers_26 = wrap(async (q, s) => s.json(await User.find({ role: 'officer' }).select('name email role scope active createdAt')));

export const post_officers_27 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(1), email: z.string().email(), password: z.string().min(12),
    buildings: z.array(z.string()).default([]), departments: z.array(z.string()).default([])
  }).strict().parse(q.body);
  const user = await User.create({
    name: body.name, email: body.email.toLowerCase(), passwordHash: await bcrypt.hash(body.password, 12),
    role: 'officer', scope: { buildings: body.buildings, departments: body.departments }
  });
  await AuditLog.create({ actor: q.user.id, action: 'officer.create', target: user.id });
  s.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
});

export const patch_officers_id_28 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    email: z.string().trim().email().max(254).optional(),
    active: z.boolean().optional(), buildings: z.array(z.string()).optional(),
    departments: z.array(z.string()).optional()
  }).strict().refine((value) => Object.keys(value).length > 0).parse(q.body);
  const user = await User.findOne({ _id: q.params.id, role: 'officer' });
  if (!user) return s.status(404).json({ error: 'Officer not found' });
  if (body.email) {
    const email = body.email.toLowerCase();
    if (await User.exists({ email, _id: { $ne: user._id } })) return s.status(409).json({ error: 'That email address is already in use.' });
    user.email = email;
  }
  if (body.name) user.name = body.name;
  if (body.active !== undefined) user.active = body.active;
  if (body.buildings) {
    const validBuildings = await Building.countDocuments({ _id: { $in: body.buildings }, active: true });
    if (validBuildings !== new Set(body.buildings).size) return s.status(400).json({ error: 'Select valid buildings for this officer' });
  }
  if (body.departments) {
    const validDepartments = await Department.countDocuments({ name: { $in: body.departments }, active: true });
    if (validDepartments !== new Set(body.departments).size) return s.status(400).json({ error: 'Select valid active departments for this officer' });
  }
  user.scope = {
    buildings: body.buildings ?? user.scope?.buildings ?? [],
    departments: body.departments ?? user.scope?.departments ?? []
  };
  await user.save();
  await AuditLog.create({ actor: q.user.id, action: 'officer.update', target: user.id, meta: { active: user.active, scope: user.scope } });
  s.json({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active, scope: user.scope });
});

export const get_audit_logs_29 = wrap(async (q, s) => {
  const page = z.coerce.number().int().min(1).default(1).parse(q.query.page);
  const pageSize = 10;
  const [items, total] = await Promise.all([
    AuditLog.find().sort('-createdAt').skip((page - 1) * pageSize).limit(pageSize).populate('actor', 'name email'),
    AuditLog.countDocuments()
  ]);
  s.json({ items, total, page, pageSize, totalPages: Math.ceil(total / pageSize) });
});
