import { Schema, model, ref } from './schema.js';

const alloc = new Schema({ exam: ref('Exam'), version: Number, student: ref('Student'), hall: ref('Hall'), r: Number, c: Number, published: { type: Boolean, default: false } });
alloc.index({ exam: 1, version: 1, student: 1 }, { unique: true });
alloc.index({ exam: 1, version: 1, hall: 1, r: 1, c: 1 }, { unique: true });
export const SeatingAllocation = model('SeatingAllocation', alloc);
export const AllocationPlan = model('AllocationPlan', new Schema({
  exam: { ...ref('Exam'), required: true },
  version: { type: Number, required: true },
  halls: [ref('Hall')],
  rules: { horizontal: { type: Boolean, default: true }, vertical: { type: Boolean, default: true }, diagonal: { type: Boolean, default: false } },
  publishedAt: Date
}, { timestamps: true }));
AllocationPlan.schema.index({ exam: 1, version: 1 }, { unique: true });
