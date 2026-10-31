const fs = require('node:fs');
const path = require('node:path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

// Header aliases for the six fields the bus owner import accepts. Anything else
// in the sheet (route, nominee, NID, photo, remarks...) is deliberately ignored.
const BUS_HEADER_ALIASES = {
  owner_name: [
    'bus owner name', 'owner name', 'bus owner', 'owner', 'owner full name', 'name of owner', 'name',
    'মালিকের নাম', 'বাস মালিকের নাম', 'বাস মালিক', 'মালিক', 'নাম'
  ],
  bus_number: [
    'bus number', 'bus no', 'bus no.', 'bus number no', 'bus registration number', 'registration number',
    'bus registration', 'bus reg number', 'vehicle number', 'bus number registration',
    'বাস নম্বর', 'বাস নাম্বার', 'বাসের নম্বর', 'বাসের নাম্বার', 'বাস নং', 'বাসের নং',
    'বাসের রেজিস্ট্রেশন নম্বর', 'রেজিস্ট্রেশন নম্বর', 'গাড়ির নম্বর', 'গাড়ির নম্বর'
  ],
  father_name: [
    "father's name", 'father name', 'fathers name', 'father', 'guardian name',
    'পিতার নাম', 'পিতা', 'পিতার নাম বাংলা'
  ],
  mobile: [
    'mobile number', 'mobile no', 'mobile no.', 'mobile', 'phone number', 'phone no', 'phone',
    'owner mobile', 'contact number', 'contact no',
    'মোবাইল নম্বর', 'মোবাইল নাম্বার', 'মোবাইল নং', 'মোবাইল', 'ফোন নম্বর', 'ফোন', 'যোগাযোগ নম্বর'
  ],
  address: [
    'address', 'present address', 'permanent address',
    'ঠিকানা', 'বর্তমান ঠিকানা', 'স্থায়ী ঠিকানা', 'স্থায়ী ঠিকানা'
  ],
  status: ['status', 'অবস্থা', 'স্ট্যাটাস', 'স্টেটাস']
};

const BUS_FIELD_ORDER = ['owner_name', 'bus_number', 'father_name', 'mobile', 'address', 'status'];

// Fund sheets: the route is matched by name against the routes already saved,
// and the two money columns are read as taka.
const FUND_HEADER_ALIASES = {
  fund_name: [
    'fund name', 'fund', 'funds name', 'name of fund', 'fund title', 'name',
    'তহবিলের নাম', 'তহবিল নাম', 'তহবিল', 'ফান্ডের নাম', 'ফান্ড নাম', 'ফান্ড', 'নাম'
  ],
  route_name: [
    'route name', 'route', 'rout', 'routes', 'name of route', 'route number',
    'রুটের নাম', 'রুট নাম', 'রুট', 'রুটের নম্বর'
  ],
  per_trip_amount: [
    'per trip fund amount', 'per trip amount', 'per trip fund', 'trip amount', 'per trip',
    'fund amount', 'amount', 'monthly amount', 'amount bdt', 'per trip taka',
    'প্রতি ট্রিপের তহবিল পরিমাণ', 'প্রতি ট্রিপের তহবিল', 'প্রতি ট্রিপ', 'ট্রিপের টাকা',
    'তহবিলের পরিমাণ', 'প্রতি ট্রিপের টাকা'
  ],
  opening_balance: [
    'opening balance', 'opening', 'opening balance bdt', 'initial balance', 'start balance',
    'প্রারম্ভিক ব্যালেন্স', 'প্রারম্ভিক জমা', 'প্রারম্ভিক পরিমাণ', 'প্রারম্ভিক'
  ],
  status: ['status', 'অবস্থা', 'স্ট্যাটাস', 'স্টেটাস']
};
const FUND_FIELD_ORDER = ['fund_name', 'route_name', 'per_trip_amount', 'opening_balance', 'status'];

const BUS_IMPORT_SPEC = {
  aliases: BUS_HEADER_ALIASES, fields: BUS_FIELD_ORDER,
  // A real heading names at least three fields. A data row can accidentally look
  // like a one- or two-field heading ("মালিক ১", "ঠিকানা ১"), never a full one.
  minHeaderFields: 3,
  // Pages of a printed sheet often repeat the heading; only a row that reads as
  // a near-complete heading is dropped.
  repeatHeaderFields: 4
};
const FUND_IMPORT_SPEC = {
  aliases: FUND_HEADER_ALIASES, fields: FUND_FIELD_ORDER, minHeaderFields: 3, repeatHeaderFields: 5
};
const HEADER_SEARCH_LIMIT = 30;
const MAX_ROWS = 25000;
const BANGLA_PATTERN = /[\u0980-\u09ff]/;

function headerKey(value) {
  return String(value ?? '').normalize('NFKC').toLowerCase()
    .replace(/[’'`´]/g, '')
    .replace(/[^0-9a-z\u0980-\u09ff]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// A header may be worded differently ("Mobile No.", "মোবাইল নাম্বার"), so an
// alias also matches when it is a meaningful part of the header text. Short
// generic aliases ("নাম", "name") only match exactly, otherwise "Nominee Name"
// or "Driver Mobile" would steal the owner or mobile column.
function matchScore(key, aliases) {
  let best = 0;
  for (const alias of aliases) {
    const aliasKey = headerKey(alias);
    if (!aliasKey) continue;
    if (key === aliasKey) return 1000 + aliasKey.length;
    const threshold = BANGLA_PATTERN.test(aliasKey) ? 5 : 8;
    if (aliasKey.length < threshold || key.length < threshold) continue;
    if (key.includes(aliasKey) || aliasKey.includes(key)) {
      best = Math.max(best, 100 + Math.min(key.length, aliasKey.length));
    }
  }
  return best;
}

function analyzeHeaderRow(cells, spec = BUS_IMPORT_SPEC) {
  const candidates = [];
  cells.forEach((cell, index) => {
    const key = headerKey(cell);
    if (!key) return;
    for (const field of spec.fields) {
      const score = matchScore(key, spec.aliases[field]);
      if (score) candidates.push({ field, index, score });
    }
  });
  candidates.sort((left, right) => right.score - left.score || left.index - right.index);
  const fields = new Map();
  const usedColumns = new Set();
  for (const candidate of candidates) {
    if (fields.has(candidate.field) || usedColumns.has(candidate.index)) continue;
    fields.set(candidate.field, candidate.index);
    usedColumns.add(candidate.index);
  }
  return { fields, score: fields.size };
}

// Header rows are often stacked (English heading above a Bangla heading, or a
// two-line heading). The deepest row of the header block is the one the data
// columns actually line up with, so that row is returned.
function findHeaderRow(rows, spec) {
  const limit = Math.min(rows.length, HEADER_SEARCH_LIMIT);
  const candidates = [];
  for (let index = 0; index < limit; index += 1) {
    const cells = rows[index];
    if (!Array.isArray(cells)) continue;
    const analysis = analyzeHeaderRow(cells, spec);
    if (analysis.score >= spec.minHeaderFields) candidates.push({ index, analysis });
  }
  if (!candidates.length) {
    return rows.findIndex((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
  }
  const groups = [];
  for (const candidate of candidates) {
    const current = groups[groups.length - 1];
    if (current && candidate.index === current[current.length - 1].index + 1) current.push(candidate);
    else groups.push([candidate]);
  }
  let bestGroup = groups[0];
  let bestScore = Math.max(...bestGroup.map((candidate) => candidate.analysis.score));
  for (const group of groups.slice(1)) {
    const score = Math.max(...group.map((candidate) => candidate.analysis.score));
    if (score > bestScore) {
      bestGroup = group;
      bestScore = score;
    }
  }
  return bestGroup[bestGroup.length - 1].index;
}

function cellText(cell) {
  if (cell instanceof Date && !Number.isNaN(cell.getTime())) {
    const month = String(cell.getMonth() + 1).padStart(2, '0');
    const day = String(cell.getDate()).padStart(2, '0');
    return `${cell.getFullYear()}-${month}-${day}`;
  }
  return String(cell ?? '');
}

function buildMapping(headers, spec) {
  const { fields } = analyzeHeaderRow(headers, spec);
  const mapping = {};
  for (const field of spec.fields) mapping[field] = fields.has(field) ? fields.get(field) : '';
  return { mapping, fieldCount: fields.size };
}

function importRows(rows, sheetName, spec) {
  const headerIndex = findHeaderRow(rows, spec);
  if (headerIndex < 0 || headerIndex >= rows.length) throw new Error('The file has no data.');

  const headers = rows[headerIndex].map((cell, index) => {
    const text = String(cell ?? '').replace(/\s+/g, ' ').trim();
    return text || `Column ${index + 1}`;
  });
  const { mapping, fieldCount } = buildMapping(rows[headerIndex], spec);
  const data = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const cells = rows[index];
    if (!Array.isArray(cells) || !cells.some((cell) => String(cell ?? '').trim())) continue;
    // Pages of a printed sheet often repeat the heading; those rows are not records.
    if (analyzeHeaderRow(cells, spec).score >= spec.repeatHeaderFields) continue;
    data.push({ rowNumber: index + 1, cells: cells.map(cellText) });
  }
  if (!data.length) throw new Error('The file has no data rows.');
  if (data.length > MAX_ROWS) throw new Error('Only up to 25,000 rows can be imported at once.');
  return { sheetName, headers, headerRow: headerIndex + 1, mapping, fieldCount, rows: data };
}

function readExcel(filePath, spec) {
  const workbook = XLSX.readFile(filePath, { cellDates: true, cellNF: false });
  let best = null;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;
    const matrix = XLSX.utils.sheet_to_json(sheet, {
      header: 1, defval: '', raw: true, dateNF: 'yyyy-mm-dd', blankrows: true
    });
    let parsed;
    try {
      parsed = importRows(matrix, sheetName, spec);
    } catch (error) {
      continue;
    }
    if (!best || parsed.fieldCount > best.fieldCount
      || (parsed.fieldCount === best.fieldCount && parsed.rows.length > best.rows.length)) {
      best = parsed;
    }
  }
  if (!best) throw new Error('The Excel file has no data rows.');
  return best;
}

function decodeXmlText(value) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (entity, code) => {
    if (code[0] !== '#') {
      return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[code.toLowerCase()];
    }
    const point = code[1].toLowerCase() === 'x'
      ? Number.parseInt(code.slice(2), 16)
      : Number.parseInt(code.slice(1), 10);
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : entity;
  });
}

function wordCellText(xml) {
  const parts = [];
  const tokenPattern = /<(?:[A-Za-z0-9_]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?t\s*>|<(?:[A-Za-z0-9_]+:)?(?:tab|br|cr)\b[^>]*\/?>/g;
  for (const match of xml.matchAll(tokenPattern)) {
    parts.push(match[1] === undefined ? '\t' : decodeXmlText(match[1]));
  }
  return parts.join('').replace(/[ \r\n]+/g, ' ').trim();
}

function wordTableRows(xml) {
  const rows = [];
  for (const rowMatch of xml.matchAll(/<(?:[A-Za-z0-9_]+:)?tr\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?tr\s*>/g)) {
    const cells = [...rowMatch[1].matchAll(/<(?:[A-Za-z0-9_]+:)?tc\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?tc\s*>/g)]
      .map((cellMatch) => wordCellText(cellMatch[1]));
    if (cells.length) rows.push(cells);
  }
  return rows;
}

async function readWord(filePath, spec) {
  const zip = await JSZip.loadAsync(fs.readFileSync(filePath));
  const document = zip.file('word/document.xml');
  if (!document) throw new Error('The Word file does not contain a document body.');
  const xml = await document.async('string');

  // Each table is scored on its own so a heading table or a signature table
  // cannot swallow the real owner table.
  let best = null;
  const tables = xml.split(/<\/(?:[A-Za-z0-9_]+:)?tbl\s*>/);
  for (const table of tables) {
    const rows = wordTableRows(table);
    if (rows.length < 2) continue;
    let parsed;
    try {
      parsed = importRows(rows, 'Document', spec);
    } catch (error) {
      continue;
    }
    if (!best || parsed.fieldCount > best.fieldCount
      || (parsed.fieldCount === best.fieldCount && parsed.rows.length > best.rows.length)) {
      best = parsed;
    }
  }
  if (best) return best;

  const rows = [];
  for (const paragraph of xml.matchAll(/<(?:[A-Za-z0-9_]+:)?p\b[^>]*>([\s\S]*?)<\/(?:[A-Za-z0-9_]+:)?p\s*>/g)) {
    const text = wordCellText(paragraph[1]);
    if (text) rows.push(text.split('\t'));
  }
  return importRows(rows, 'Document', spec);
}

async function readImportFile(filePath, spec) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.xlsx' || extension === '.xls') return readExcel(filePath, spec);
  if (extension === '.docx') return readWord(filePath, spec);
  throw new Error('Choose an .xlsx, .xls or .docx file.');
}

module.exports = {
  readBusOwnerImport: (filePath) => readImportFile(filePath, BUS_IMPORT_SPEC),
  readFundImport: (filePath) => readImportFile(filePath, FUND_IMPORT_SPEC),
  analyzeHeaderRow, headerKey,
  HEADER_ALIASES: BUS_HEADER_ALIASES,
  FIELD_ORDER: BUS_FIELD_ORDER,
  FUND_HEADER_ALIASES, FUND_FIELD_ORDER
};
