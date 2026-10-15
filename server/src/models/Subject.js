import { Schema, model, ref } from './schema.js';

export const Subject = model('Subject', new Schema({ name: String, code: { type: String, unique: true }, program: String, year: Number, semester: Number }));
