import { Schema, model, ref } from './schema.js';

export const Program = model('Program', new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  years: [{ type: Number, min: 1 }],
  semesters: [{ type: Number, min: 1 }]
}, { timestamps: true }));
export const Department = model('Department', new Schema({
  name: { type: String, required: true, trim: true, unique: true, maxlength: 80 },
  code: { type: String, required: true, trim: true, uppercase: true, unique: true, maxlength: 12 },
  active: { type: Boolean, default: true }
}, { timestamps: true }));
