import { Schema, model, ref } from './schema.js';

export const User = model('User', new Schema({
  name: String, email: { type: String, unique: true, lowercase: true }, passwordHash: String,
  role: { type: String, enum: ['superadmin', 'officer', 'student'], required: true },
  student: ref('Student'), scope: { buildings: [ref('Building')], departments: [String] },
  registrationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  active: { type: Boolean, default: true } }, { timestamps: true }));
