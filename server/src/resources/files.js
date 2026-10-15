const signatures = {
  pdf: (buffer) => buffer.subarray(0, 5).toString('ascii') === '%PDF-',
  doc: (buffer) => buffer.subarray(0, 8).equals(Buffer.from([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1])),
  docx: (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0x50, 0x4B, 0x03, 0x04]))
};

const contentTypes = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

export function learningFileType(file) {
  const extension = file.originalname.split('.').pop()?.toLowerCase();
  if (!extension || !signatures[extension] || !signatures[extension](file.buffer)) return null;
  return { extension, contentType: contentTypes[extension] };
}
