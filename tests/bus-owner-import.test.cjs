const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const XLSX = require('xlsx');
const JSZip = require('jszip');
const { readBusOwnerImport } = require('../src/bus-owner-import.cjs');

function createWordDocument(rows) {
  const cell = (value) => `<w:tc><w:p><w:r><w:t>${String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p></w:tc>`;
  const tableRows = rows.map((row) => `<w:tr>${row.map(cell).join('')}</w:tr>`).join('');
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:tbl>${tableRows}</w:tbl></w:body></w:document>`);
  return zip;
}

test('Excel and Word import readers preserve all six Bangla columns and rows', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-import-reader-'));
  const headers = ['মালিকের নাম', 'বাস নম্বর', 'পিতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'স্ট্যাটাস'];
  const rows = Array.from({ length: 10 }, (_, index) => [
    `মালিক ${index + 1}`, `ঢাকা-${index + 1}`, `পিতা ${index + 1}`,
    `০১৭০০০০০০${String(index + 1).padStart(2, '0')}`, `ঠিকানা ${index + 1}`, 'সক্রিয়'
  ]);
  try {
    const xlsxPath = path.join(directory, 'owners.xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers, ...rows]), 'Owners');
    XLSX.writeFile(workbook, xlsxPath);

    const docxPath = path.join(directory, 'owners.docx');
    fs.writeFileSync(docxPath, await createWordDocument([headers, ...rows]).generateAsync({ type: 'nodebuffer' }));

    const xlsPath = path.join(directory, 'owners.xls');
    fs.writeFileSync(xlsPath, XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }));

    for (const filePath of [xlsxPath, xlsPath, docxPath]) {
      const parsed = await readBusOwnerImport(filePath);
      assert.deepEqual(parsed.headers, headers);
      assert.equal(parsed.rows.length, 10);
      assert.deepEqual(parsed.rows[9].cells, rows[9]);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Excel import detects Bangla headers after title and blank rows', async () => {  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-import-header-'));
  try {
    const filePath = path.join(directory, 'owners.xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ['বাস মালিক সমিতির তালিকা'],
      [],
      ['মালিকের নাম', 'বাস নম্বর', 'পিতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'স্ট্যাটাস'],
      ['রহিম উদ্দিন', 'ঢাকা-মেট্রো-১১-১২৩৪', 'করিম উদ্দিন', '০১৭১২৩৪৫৬৭৮', 'ঢাকা', 'সক্রিয়']
    ]), 'Owners');
    XLSX.writeFile(workbook, filePath);

    const parsed = await readBusOwnerImport(filePath);
    assert.deepEqual(parsed.headers, ['মালিকের নাম', 'বাস নম্বর', 'পিতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'স্ট্যাটাস']);
    assert.equal(parsed.rows.length, 1);
    assert.equal(parsed.rows[0].rowNumber, 4);
    assert.deepEqual(parsed.rows[0].cells, ['রহিম উদ্দিন', 'ঢাকা-মেট্রো-১১-১২৩৪', 'করিম উদ্দিন', '০১৭১২৩৪৫৬৭৮', 'ঢাকা', 'সক্রিয়']);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function writeWorkbook(directory, sheets, fileName = 'owners.xlsx') {
  const workbook = XLSX.utils.book_new();
  for (const [name, matrix] of sheets) XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(matrix), name);
  const filePath = path.join(directory, fileName);
  XLSX.writeFile(workbook, filePath);
  return filePath;
}

const OLD_ENGLISH_HEADERS = [
  'Bus Owner Name', 'Bus Number', 'Nominee Name', "Father's Name", 'Mobile Number', 'Route Name',
  'Address', 'Joining Date', 'Bus Type', 'Driver Name', 'Driver Mobile', 'Helper Name', 'Status'
];

function tenBanglaOwners() {
  return [
    ['মোঃ রহিম উদ্দিন', 'ঢাকা-১১-১১০১', 'আব্দুল জলিল', '০১৭১২৩৪৫৬৭৮', 'সোনাডাঙ্গা, খুলনা', 'Active'],
    ['মোঃ করিম হোসেন', 'ঢাকা-১১-১১০২', 'নুরুল ইসলাম', '০১৮১২৩৪৫৬৭৮', 'বয়রা, খুলনা', 'Active'],
    ['মোঃ জামাল আহমেদ', 'চট্টগ্রাম-১১-২২০১', 'আব্দুল করিম', '০১৯১২৩৪৫৬৭৮', 'আগ্রাবাদ, চট্টগ্রাম', 'Inactive'],
    ['মোঃ সেলিম মিয়া', 'সিলেট-১১-৩৩০১', 'মোকবুল হোসেন', '০১৬১২৩৪৫৬৭৮', 'জিন্দাবাজার, সিলেট', 'Active'],
    ['মোঃ হাসান আলী', 'রাজশাহী-১১-৪৪০১', 'আব্দুর রহমান', '০১৫১২৩৪৫৬৭৮', 'সাহেব বাজার, রাজশাহী', 'Active'],
    ['মোঃ রফিক উদ্দিন', 'খুলনা-১১-৫৫০১', 'আব্দুল গফুর', '০১৩১২৩৪৫৬৭৮', 'খালিশপুর, খুলনা', 'Inactive'],
    ['মোঃ মাহমুদ হাসান', 'বরিশাল-১১-৬৬০১', 'হাবিবুর রহমান', '০১৪১২৩৪৫৬৭৮', 'সদর রোড, বরিশাল', 'Active'],
    ['মোঃ নুর ইসলাম', 'ঢাকা-১১-১১০৩', 'শামসুল হক', '০১৭৯৮৭৬৫৪৩২', 'মিরপুর, ঢাকা', 'Active'],
    ['মোঃ মিজানুর রহমান', 'চট্টগ্রাম-১১-২২০২', 'আমিন উদ্দিন', '০১৮৯৮৭৬৫৪৩২', 'হালিশহর, চট্টগ্রাম', 'Inactive'],
    ['মোঃ বাবুল হোসেন', 'খুলনা-১১-৫৫০২', 'কাশেম আলী', '০১৯৯৮৭৬৫৪৩২', 'দৌলতপুর, খুলনা', 'Active']
  ];
}

test('an old 13-column template with a Bangla heading row underneath maps the six columns', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-import-old-'));
  try {
    const banglaHeading = ['বাস মালিকের নাম', 'বাস নম্বর', 'পিতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'অবস্থা'];
    const filePath = writeWorkbook(directory, [['Bus Owner Import Template', [
      OLD_ENGLISH_HEADERS, banglaHeading, ...tenBanglaOwners()
    ]]]);

    const parsed = await readBusOwnerImport(filePath);
    assert.equal(parsed.headerRow, 2, 'the Bangla heading under the English one is the row the data lines up with');
    assert.deepEqual(parsed.mapping, { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: 4, status: 5 });
    assert.equal(parsed.rows.length, 10);
    assert.equal(parsed.rows[0].rowNumber, 3);
    assert.deepEqual(parsed.rows[9].cells.slice(0, 6), tenBanglaOwners()[9]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a 13-column sheet with aligned data keeps route and nominee columns out of the import', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-import-aligned-'));
  try {
    const aligned = tenBanglaOwners().map((row) => [
      row[0], row[1], 'মনোনীত ব্যক্তি', row[2], row[3], 'রুটের নাম', row[4],
      '2026-01-01', 'AC', 'ড্রাইভার', '01700000000', 'হেল্পার', row[5]
    ]);
    const filePath = writeWorkbook(directory, [['Owners', [OLD_ENGLISH_HEADERS, ...aligned]]]);

    const parsed = await readBusOwnerImport(filePath);
    assert.equal(parsed.headerRow, 1);
    assert.deepEqual(parsed.mapping, { owner_name: 0, bus_number: 1, father_name: 3, mobile: 4, address: 6, status: 12 });
    assert.equal(parsed.rows.length, 10);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an instruction sheet before the data sheet does not hide the owners', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-import-sheets-'));
  try {
    const filePath = writeWorkbook(directory, [
      ['নির্দেশনা', [
        ['বাস মালিক সমিতি — বাল্ক আমদানি'],
        ['এই ফাইলে মালিকের নাম, বাস নম্বর, পিতার নাম, মোবাইল নম্বর, ঠিকানা ও স্ট্যাটাস দিন।'],
        [],
        ['শেষ কলামে স্ট্যাটাস Active অথবা Inactive লিখুন।']
      ]],
      ['তালিকা', [[
        'বাস মালিকের নাম', 'বাস নম্বর', 'পিতার নাম', 'মোবাইল নম্বর', 'ঠিকানা', 'স্ট্যাটাস'
      ], ...tenBanglaOwners()]]
    ]);

    const parsed = await readBusOwnerImport(filePath);
    assert.equal(parsed.sheetName, 'তালিকা');
    assert.deepEqual(parsed.mapping, { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: 4, status: 5 });
    assert.equal(parsed.rows.length, 10);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('header spelling variants, padding and column order are still recognised', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'somiti-import-variants-'));
  try {
    const scenarios = [
      {
        headers: ['  মালিকের নাম  ', 'বাস নাম্বার', 'পিতার নাম', 'মোবাইল নাম্বার', 'ঠিকানা', 'অবস্থা'],
        data: ['মোঃ রহিম উদ্দিন', 'ঢাকা-১১-১১০১', 'করিম উদ্দিন', '০১৭১২৩৪৫৬৭৮', 'ঢাকা', 'Active'],
        mapping: { owner_name: 0, bus_number: 1, father_name: 2, mobile: 3, address: 4, status: 5 }
      },
      {
        headers: ['STATUS', ' BUS NUMBER ', 'FATHER’S NAME', ' Mobile Number ', 'BUS OWNER NAME', 'Address'],
        data: ['Active', 'ঢাকা-১১-১১০১', 'করিম উদ্দিন', '০১৭১২৩৪৫৬৭৮', 'মোঃ রহিম উদ্দিন', 'ঢাকা'],
        mapping: { owner_name: 4, bus_number: 1, father_name: 2, mobile: 3, address: 5, status: 0 }
      },
      {
        headers: ['Name', 'Father Name', 'Mobile No.', 'Bus No.', 'ঠিকানা', 'Status'],
        data: ['মোঃ রহিম উদ্দিন', 'করিম উদ্দিন', '০১৭১২৩৪৫৬৭৮', 'ঢাকা-১১-১১০১', 'ঢাকা', 'Active'],
        mapping: { owner_name: 0, bus_number: 3, father_name: 1, mobile: 2, address: 4, status: 5 }
      }
    ];
    for (const [index, scenario] of scenarios.entries()) {
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([scenario.headers, scenario.data]), 'Owners');
      const filePath = path.join(directory, `variant-${index}.xlsx`);
      XLSX.writeFile(workbook, filePath);

      const parsed = await readBusOwnerImport(filePath);
      assert.deepEqual(parsed.mapping, scenario.mapping, `columns mapped by header name for variant ${index + 1}`);
      assert.equal(parsed.rows[0].cells[parsed.mapping.owner_name], 'মোঃ রহিম উদ্দিন');
      assert.equal(parsed.rows[0].cells[parsed.mapping.bus_number], 'ঢাকা-১১-১১০১');
      assert.equal(parsed.rows[0].cells[parsed.mapping.father_name], 'করিম উদ্দিন');
      assert.equal(parsed.rows[0].cells[parsed.mapping.mobile], '০১৭১২৩৪৫৬৭৮');
      assert.equal(parsed.rows[0].cells[parsed.mapping.status], 'Active');
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
