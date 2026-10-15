import { Schema, model, ref } from './schema.js';

export const AuditLog = model('AuditLog', new Schema({ actor: ref('User'), action: String, target: String, meta: Object }, { timestamps: true }));
export const AllocationLock = model('AllocationLock', new Schema({
  exam: { ...ref('Exam'), required: true, unique: true },
  owner: { type: String, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true }));
export const ImportBatch = model('ImportBatch', new Schema({
  owner: { ...ref('User'), required: true },
  rows: { type: [Object], required: true },
  validationErrors: { type: [Object], default: [] },
  expiresAt: { type: Date, required: true }
}, { timestamps: true }));
