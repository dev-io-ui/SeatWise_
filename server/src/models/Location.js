import { Schema, model, ref } from './schema.js';

export const Building = model('Building', new Schema({ name: String, code: { type: String, unique: true }, active: { type: Boolean, default: true } }));
export const Floor = model('Floor', new Schema({
  name: { type: String, required: true },
  code: { type: String, required: true },
  building: { ...ref('Building'), required: true },
  active: { type: Boolean, default: true }
}, { timestamps: true }));
Floor.schema.index({ building: 1, code: 1 }, { unique: true });
export const Hall = model('Hall', Object.assign(new Schema({
  name: String, code: { type: String, unique: true }, building: ref('Building'), floor: ref('Floor'),
  rows: { type: Number, min: 1 }, cols: { type: Number, min: 1 }, blocked: [{ r: Number, c: Number }], active: { type: Boolean, default: true } })));
