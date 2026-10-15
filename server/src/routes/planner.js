import { Router } from 'express';
import { authenticate, staff, get_exams_1, get_exams_id_allocations_2, post_exams_id_allocations_swap_3, post_exams_id_allocations_versions_4, post_exams_id_allocations_move_5 } from '../controllers/planner.controller.js';

const r = Router();

r.get('/exams', authenticate, staff, get_exams_1);
r.get('/exams/:id/allocations', authenticate, staff, get_exams_id_allocations_2);
r.post('/exams/:id/allocations/swap', authenticate, staff, post_exams_id_allocations_swap_3);
r.post('/exams/:id/allocations/versions', authenticate, staff, post_exams_id_allocations_versions_4);
r.post('/exams/:id/allocations/move', authenticate, staff, post_exams_id_allocations_move_5);

export default r;
