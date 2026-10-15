import { Schema, model, ref } from './schema.js';

export const Student = model('Student', new Schema({
  studentId: { type: String, unique: true }, name: String, rollNumber: { type: String, unique: true }, email: String,
  program: String, department: String, year: Number, semester: Number, section: String,
  registrationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved' },
  active: { type: Boolean, default: true } }, { timestamps: true }));
