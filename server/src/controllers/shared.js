export const wrap = (handler) => (req, res, next) => handler(req, res, next).catch(next);

export const day = (date) => new Date(date).toISOString().slice(0, 10);

export function pageData(items, page) {
  const pageSize = 10;
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  return {
    items: items.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    page: currentPage, pageSize, total, totalPages
  };
}

function parseCsv(text) {
  const rows = [];
  let row = [], value = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { value += '"'; i++; }
      else if (char === '"') quoted = false;
      else value += char;
    } else if (char === '"' && value.length === 0) quoted = true;
    else if (char === ',') { row.push(value); value = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++;
      row.push(value); value = '';
      if (row.some((item) => item.length)) rows.push(row);
      row = [];
    } else value += char;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted value');
  if (value.length || row.length) { row.push(value); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows.shift().map((item) => item.trim().toLowerCase());
  return rows.map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export async function parseUpload(file) {
  const extension = file.originalname.toLowerCase().split('.').pop();
  if (extension === 'csv') return parseCsv(file.buffer.toString('utf8').replace(/^\uFEFF/, ''));
  const workbook = new (await import('exceljs')).default.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error('Workbook has no worksheets');
  if (sheet.rowCount < 2) return [];
  const headers = sheet.getRow(1).values.slice(1).map((value) => String(value || '').trim().toLowerCase());
  return sheet.getRows(2, Math.max(0, sheet.rowCount - 1)).map((item) =>
    Object.fromEntries(headers.map((header, index) => [header, item.getCell(index + 1).text])));
}
