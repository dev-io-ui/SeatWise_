import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { authenticate, requireRole } from '../middleware/auth.js';

export { authenticate };
export const staff = requireRole('superadmin', 'officer');
export const admin = requireRole('superadmin');
export const adminOrOfficer = [authenticate, staff];
export const publicLookupLimit = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, done) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!['csv', 'xlsx'].includes(ext)) return done(Object.assign(new Error('Upload a .csv or .xlsx file'), { status: 400 }));
    done(null, true);
  }
});

export const resourceUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, done) => {
    const ext = file.originalname.toLowerCase().split('.').pop();
    if (!['pdf', 'doc', 'docx'].includes(ext)) return done(Object.assign(new Error('Learning materials must be PDF, DOC or DOCX files'), { status: 400 }));
    done(null, true);
  }
});
