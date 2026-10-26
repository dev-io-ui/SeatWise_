import { Schema, model, ref } from './schema.js';

export const Subject = model('Subject', new Schema({
  name: String,
  code: { type: String, required: true, unique: true, minlength: 6, maxlength: 6, match: /^[A-Z0-9]{2}\d{4}$/ },
  program: String,
  department: String,
  departments: { type: [String], default: [] },
  year: Number,
  semester: Number
}));
