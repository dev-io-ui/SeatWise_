import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import planner from './planner.js';
import extra from './extra.js';
import reports from './reports.js';
import { requireRole } from '../middleware/auth.js';
import { authenticate, staff, post_auth_login_1, get_auth_registration_options_2, post_auth_register_3, post_auth_logout_4, get_auth_me_5, patch_auth_profile_6, get_halls_6, post_halls_7, post_exams_id_allocations_generate_8, post_exams_id_allocations_publish_9, get_students_me_exams_10 } from '../controllers/core.controller.js';
import { patch_halls_id_34 } from '../controllers/academic.controller.js';

const r = Router();

r.post('/auth/login', rateLimit({ windowMs: 15 * 60e3, max: 20 }), post_auth_login_1);
r.get('/auth/registration-options', rateLimit({ windowMs: 60_000, max: 60, standardHeaders: true, legacyHeaders: false }), get_auth_registration_options_2);
r.post('/auth/register', rateLimit({ windowMs: 15 * 60_000, max: 5, standardHeaders: true, legacyHeaders: false }), post_auth_register_3);
r.post('/auth/logout', post_auth_logout_4);
r.get('/auth/me', authenticate, get_auth_me_5);
r.patch('/auth/profile', authenticate, patch_auth_profile_6);
r.get('/halls', authenticate, staff, get_halls_6);
r.post('/halls', authenticate, staff, post_halls_7);
r.patch('/halls/:id', authenticate, requireRole('superadmin'), patch_halls_id_34);
r.post('/exams/:id/allocations/generate', authenticate, staff, post_exams_id_allocations_generate_8);
r.post('/exams/:id/allocations/publish', authenticate, staff, post_exams_id_allocations_publish_9);
r.get('/students/me/exams', authenticate, requireRole('student'), get_students_me_exams_10);
r.use(planner);
r.use(extra);
r.use(reports);

export default r;
