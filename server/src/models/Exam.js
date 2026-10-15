import { Schema, model, ref } from './schema.js';

export const Exam = model('Exam', new Schema({
  name: String, examType: { type: String, default: 'Other' }, subject: String, subjectCode: String, program: String, year: Number, semester: Number, date: Date, startTime: String, endTime: String,
  departments: { type: [String], default: [] }, department: String,
  eligible: [ref('Student')], status: { type: String, enum: ['draft', 'allocated', 'published'], default: 'draft' } }, { timestamps: true }));
export const ExamResource = model('ExamResource', new Schema({
  exam: { ...ref('Exam'), required: true, index: true },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, maxlength: 500 },
  kind: { type: String, enum: ['link', 'file'], required: true },
  url: String,
  fileName: String,
  contentType: String,
  data: Buffer,
  size: Number,
  createdBy: ref('User')
}, { timestamps: true }));
