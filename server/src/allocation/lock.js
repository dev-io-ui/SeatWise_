import { randomUUID } from 'node:crypto';
import { AllocationLock } from '../models/index.js';

export async function withExamLock(examId, operation) {
  const owner = randomUUID();
  let lock;
  try {
    lock = await AllocationLock.create({
      exam: examId,
      owner,
      expiresAt: new Date(Date.now() + 300_000)
    });
  } catch (error) {
    if (error.code !== 11000) throw error;
    lock = await AllocationLock.findOneAndUpdate(
      { exam: examId, expiresAt: { $lte: new Date() } },
      { owner, expiresAt: new Date(Date.now() + 300_000) },
      { new: true }
    );
    if (!lock) {
      const conflict = new Error('Another allocation operation is in progress');
      conflict.status = 409;
      throw conflict;
    }
  }

  try {
    return await operation();
  } finally {
    await AllocationLock.deleteOne({ _id: lock._id, owner });
  }
}
