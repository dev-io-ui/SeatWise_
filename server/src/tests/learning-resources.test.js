import test from 'node:test';
import assert from 'node:assert/strict';
import { learningFileType } from '../resources/files.js';

test('learning files must match a supported document signature and extension', () => {
  assert.deepEqual(learningFileType({
    originalname: 'notes.PDF',
    buffer: Buffer.from('%PDF-1.7')
  }), { extension: 'pdf', contentType: 'application/pdf' });
  assert.deepEqual(learningFileType({
    originalname: 'notes.docx',
    buffer: Buffer.from([0x50, 0x4B, 0x03, 0x04, 0x00])
  }), {
    extension: 'docx',
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  });
  assert.equal(learningFileType({
    originalname: 'notes.pdf',
    buffer: Buffer.from('plain text, not a PDF')
  }), null);
  assert.equal(learningFileType({
    originalname: 'notes.exe',
    buffer: Buffer.from('%PDF-1.7')
  }), null);
});
