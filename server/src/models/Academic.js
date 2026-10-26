import { Schema, model, ref } from './schema.js';

export const Program = model('Program', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true, sparse: true, minlength: 6, maxlength: 6, match: /^[A-Z0-9]{2}\d{4}$/ },
  years: [{ type: Number, min: 1 }],
  semesters: [{ type: Number, min: 1 }]
}, { timestamps: true }));
export const Department = model('Department', new Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true, minlength: 6, maxlength: 6, match: /^[A-Z0-9]{2}\d{4}$/ },
  active: { type: Boolean, default: true }
}, { timestamps: true }));
export const AcademicCodeSequence = model('AcademicCodeSequence', new Schema({
  _id: { type: String, required: true },
  value: { type: Number, required: true, default: 0 }
}));
