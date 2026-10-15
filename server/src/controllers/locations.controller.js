import { z } from 'zod';
import { Building, Floor, Hall, SeatingAllocation, AuditLog } from '../models/index.js';
import { wrap } from './shared.js';

export const get_buildings_3 = wrap(async (q, s) => {
  const scope = q.user.scope?.buildings || [];
  s.json(await Building.find(q.user.role === 'officer' && scope.length ? { _id: { $in: scope } } : { active: true }));
});

export const post_buildings_4 = wrap(async (q, s) => {
  const body = z.object({ name: z.string().trim().min(1), code: z.string().trim().min(1) }).strict().parse(q.body);
  const result = await Building.create(body);
  await AuditLog.create({ actor: q.user.id, action: 'building.create', target: result.id });
  s.status(201).json(result);
});

export const put_buildings_id_32 = wrap(async (q, s) => {
  const body = z.object({ name: z.string().trim().min(1).max(120), code: z.string().trim().min(1).max(30) }).strict().parse(q.body);
  const building = await Building.findById(q.params.id);
  if (!building) return s.status(404).json({ error: 'Building not found' });
  if (await Building.exists({ code: body.code, _id: { $ne: building._id } })) {
    return s.status(409).json({ error: 'A building with that code already exists.' });
  }
  building.name = body.name;
  building.code = body.code;
  await building.save();
  await AuditLog.create({ actor: q.user.id, action: 'building.update', target: building.id });
  s.json(building);
});

export const get_floors_5 = wrap(async (q, s) => {
  const buildingId = q.query.buildingId ? z.string().parse(q.query.buildingId) : undefined;
  const scope = q.user.scope?.buildings || [];
  if (q.user.role === 'officer' && scope.length && buildingId && !scope.some((id) => String(id) === buildingId)) {
    return s.status(403).json({ error: 'Officer is not assigned to this building' });
  }
  const filter = { active: true, ...(buildingId && { building: buildingId }) };
  if (q.user.role === 'officer' && scope.length) filter.building = buildingId || { $in: scope };
  s.json(await Floor.find(filter).populate('building').sort('building name'));
});

export const post_floors_6 = wrap(async (q, s) => {
  const body = z.object({ name: z.string().trim().min(1), code: z.string().trim().min(1), building: z.string() }).strict().parse(q.body);
  const scope = q.user.scope?.buildings || [];
  if (q.user.role === 'officer' && scope.length && !scope.some((id) => String(id) === body.building)) {
    return s.status(403).json({ error: 'Officer is not assigned to this building' });
  }
  if (!await Building.exists({ _id: body.building, active: true })) return s.status(400).json({ error: 'Select a valid building' });
  const floor = await Floor.create(body);
  await AuditLog.create({ actor: q.user.id, action: 'floor.create', target: floor.id });
  s.status(201).json(floor);
});

export const put_floors_id_33 = wrap(async (q, s) => {
  const body = z.object({ name: z.string().trim().min(1).max(120), code: z.string().trim().min(1).max(30), building: z.string() }).strict().parse(q.body);
  const floor = await Floor.findById(q.params.id);
  if (!floor) return s.status(404).json({ error: 'Floor not found' });
  if (await Floor.exists({ building: body.building, code: body.code, _id: { $ne: floor._id } })) {
    return s.status(409).json({ error: 'A floor with that code already exists in the selected building.' });
  }
  if (!await Building.exists({ _id: body.building, active: true })) return s.status(400).json({ error: 'Select a valid building' });
  if (String(floor.building) !== body.building && await Hall.exists({ floor: floor._id })) {
    return s.status(409).json({ error: 'A floor with halls cannot be moved to another building. Move or edit its halls first.' });
  }
  floor.name = body.name;
  floor.code = body.code;
  floor.building = body.building;
  await floor.save();
  await AuditLog.create({ actor: q.user.id, action: 'floor.update', target: floor.id });
  s.json(await floor.populate('building'));
});

export const patch_halls_id_34 = wrap(async (q, s) => {
  const body = z.object({
    name: z.string().trim().min(1).max(120), code: z.string().trim().min(1).max(30),
    building: z.string(), floor: z.string(),
    rows: z.coerce.number().int().min(1).max(100), cols: z.coerce.number().int().min(1).max(100),
    blocked: z.array(z.object({ r: z.number().int().min(0), c: z.number().int().min(0) })).max(1000)
  }).strict().parse(q.body);
  const hall = await Hall.findById(q.params.id);
  if (!hall) return s.status(404).json({ error: 'Hall not found' });
  if (await Hall.exists({ code: body.code, _id: { $ne: hall._id } })) {
    return s.status(409).json({ error: 'A hall with that code already exists.' });
  }
  if (!await Building.exists({ _id: body.building, active: true })) return s.status(400).json({ error: 'Select a valid building' });
  if (!await Floor.exists({ _id: body.floor, building: body.building, active: true })) {
    return s.status(400).json({ error: 'Select a valid floor in the chosen building' });
  }
  const blocked = new Set();
  for (const seat of body.blocked) {
    if (seat.r >= body.rows || seat.c >= body.cols) return s.status(400).json({ error: 'Blocked seat is outside this hall layout' });
    const key = `${seat.r},${seat.c}`;
    if (blocked.has(key)) return s.status(400).json({ error: 'Blocked seat coordinates must be unique' });
    blocked.add(key);
  }
  const occupied = await SeatingAllocation.find({ hall: hall._id }).select('r c').lean();
  if (occupied.length && (String(hall.building) !== body.building || String(hall.floor) !== body.floor)) {
    return s.status(409).json({ error: 'A hall with allocated seats cannot be moved to another building or floor.' });
  }
  if (occupied.some((seat) => seat.r >= body.rows || seat.c >= body.cols || blocked.has(`${seat.r},${seat.c}`))) {
    return s.status(409).json({ error: 'Layout changes cannot remove or block an allocated seat. Create a new plan or clear allocations first.' });
  }
  Object.assign(hall, body);
  await hall.save();
  await AuditLog.create({ actor: q.user.id, action: 'hall.update', target: hall.id });
  s.json(await hall.populate('building floor'));
});
