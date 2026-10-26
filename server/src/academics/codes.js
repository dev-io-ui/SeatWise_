import { AcademicCodeSequence, Department, Program, Subject } from '../models/index.js';

export function academicCodePrefix(value) {
  const prefix = String(value || '').replace(/[^a-z0-9]/gi, '').slice(0, 2).toUpperCase();
  return prefix.padEnd(2, 'X');
}

export function formatAcademicCode(prefix, sequence) {
  if (!/^[A-Z0-9]{2}$/.test(prefix) || !Number.isInteger(sequence) || sequence < 1 || sequence > 9999) {
    throw new RangeError('Academic codes require a two-character prefix and a sequence from 1 to 9999.');
  }
  return `${prefix}${String(sequence).padStart(4, '0')}`;
}

export async function generateAcademicCode(prefixValue) {
  const prefix = academicCodePrefix(prefixValue);
  while (true) {
    let counter;
    try {
      counter = await AcademicCodeSequence.findOneAndUpdate(
        { _id: prefix },
        { $inc: { value: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
    } catch (error) {
      if (error.code === 11000) continue;
      throw error;
    }
    if (counter.value > 9999) throw new RangeError(`No academic codes remain for prefix ${prefix}.`);
    const code = formatAcademicCode(prefix, counter.value);
    const exists = await Promise.all([
      Program.exists({ code }),
      Department.exists({ code }),
      Subject.exists({ code })
    ]);
    if (!exists.some(Boolean)) return code;
  }
}
