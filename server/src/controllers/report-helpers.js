import PDFDocument from 'pdfkit';
import { Exam, SeatingAllocation } from '../models/index.js';

export const rowLabel = (n) => {
  let value = '';
  for (let x = n + 1; x; x = Math.floor((x - 1) / 26)) value = String.fromCharCode(65 + ((x - 1) % 26)) + value;
  return value;
};
export const safeExcelText = (value) => {
  const text = String(value ?? '');
  return /^[=+\-@]/.test(text) ? `'${text}` : value;
};
export const seatLabel = (row, column) => `${rowLabel(row)}${column + 1}`;
export const safeCsv = (value) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};
export const outputCsv = (res, name, headers, rows) => {
  res.type('text/csv').attachment(name).send([headers, ...rows].map((row) => row.map(safeCsv).join(',')).join('\r\n'));
};

export async function loadPlan(examId, hallId) {
  const exam = await Exam.findById(examId);
  if (!exam) return { error: 'Exam not found' };
  const latest = await SeatingAllocation.findOne({ exam: examId }).sort('-version');
  if (!latest) return { error: 'No allocation exists for this exam' };
  const filter = { exam: examId, version: latest.version, ...(hallId && { hall: hallId }) };
  const rows = await SeatingAllocation.find(filter).sort('hall r c')
    .populate('student').populate('exam').populate({ path: 'hall', populate: ['building', 'floor'] });
  if (hallId && !rows.length) return { error: 'No allocation found for that hall' };
  return { exam, version: latest.version, rows };
}

export function drawTable(doc, title, headers, widths, rows) {
  const margin = 32, pageBottom = doc.page.height - 32, rowHeight = 23;
  const availableWidth = doc.page.width - margin * 2;
  const requestedWidth = widths.reduce((total, width) => total + width, 0);
  const scale = requestedWidth > availableWidth ? availableWidth / requestedWidth : 1;
  const columnWidths = widths.map((width) => width * scale);
  const renderTitle = () => {
    doc.font('Helvetica-Bold').fontSize(15).text(title, margin, 24, { width: availableWidth, lineBreak: false, ellipsis: true });
    doc.font('Helvetica').fontSize(8).text(`Generated ${new Date().toLocaleString()}`, margin, 44, { lineBreak: false });
  };
  const renderHeader = () => {
    const headerY = doc.y;
    let x = margin;
    doc.font('Helvetica-Bold').fontSize(8);
    headers.forEach((header, i) => {
      const width = columnWidths[i];
      doc.rect(x, headerY, width, rowHeight).fill('#e9edfb').stroke('#c8d0e3');
      doc.fillColor('#182033').text(header, x + 4, headerY + 7, {
        width: Math.max(0, width - 8), lineBreak: false, ellipsis: true, align: 'center'
      });
      x += width;
    });
    doc.y = headerY + rowHeight;
    doc.font('Helvetica').fontSize(8);
  };
  renderTitle();
  doc.y = 62;
  renderHeader();
  rows.forEach((row) => {
    if (doc.y + rowHeight > pageBottom) {
      doc.addPage();
      renderTitle();
      doc.y = 62;
      renderHeader();
    }
    const y = doc.y;
    let x = margin;
    row.forEach((value, i) => {
      const width = columnWidths[i];
      doc.rect(x, y, width, rowHeight).stroke('#dfe4ef');
      const text = String(value ?? '');
      const maxWidth = width - 8;
      let fitted = text;
      while (fitted.length > 1 && doc.widthOfString(fitted) > maxWidth) fitted = `${fitted.slice(0, -2)}…`;
      doc.fillColor('#182033').text(fitted, x + 4, y + 7, {
        width: Math.max(0, maxWidth), lineBreak: false, ellipsis: true
      });
      x += width;
    });
    doc.y += rowHeight;
  });
}

export function sendPdf(res, filename, render) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 32, bufferPages: true });
  res.type('application/pdf').attachment(filename);
  doc.pipe(res);
  render(doc);
  doc.end();
}

export function checkOfficerScope(req, res, rows) {
  if (req.user.role !== 'officer') return true;
  const buildings = req.user.scope?.buildings || [];
  if (buildings.length && rows.some((row) => !buildings.some((id) => String(id) === String(row.hall.building._id)))) {
    res.status(403).json({ error: 'Report includes a building outside the officer scope' });
    return false;
  }
  const departments = req.user.scope.departments || [];
  if (departments.length && rows.some((row) => !departments.includes(row.student.department))) {
    res.status(403).json({ error: 'Report includes a department outside the officer scope' });
    return false;
  }
  return true;
}
