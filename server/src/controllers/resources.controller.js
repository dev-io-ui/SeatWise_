import { Exam, ExamResource, SeatingAllocation } from '../models/index.js';
import { examWithinDepartmentScope } from '../academics/exam-departments.js';
import { wrap } from './shared.js';

export const get_resources_id_24 = wrap(async (q, s) => {
  const resource = await ExamResource.findById(q.params.id);
  if (!resource || resource.kind !== 'file' || !resource.data) return s.status(404).json({ error: 'Learning file not found' });
  const exam = await Exam.findById(resource.exam).select('status department departments');
  if (!exam) return s.status(404).json({ error: 'Exam not found' });
  if (q.user.role === 'student') {
    const studentId = q.user.student?._id || q.user.student;
    const assigned = exam.status === 'published' && await SeatingAllocation.exists({
      exam: exam._id, student: studentId, published: true
    });
    if (!assigned) return s.status(404).json({ error: 'Learning file not found' });
  } else if (q.user.role === 'officer') {
      const departments = q.user.scope?.departments || [];
      if (!examWithinDepartmentScope(exam, departments)) {
      return s.status(403).json({ error: 'This exam is outside the officer department scope' });
    }
  }
  const safeName = encodeURIComponent(resource.fileName || `${resource.title}.pdf`);
  s.set({
    'Content-Type': resource.contentType,
    'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
    'Content-Length': String(resource.size),
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff'
  }).send(Buffer.from(resource.data));
});
