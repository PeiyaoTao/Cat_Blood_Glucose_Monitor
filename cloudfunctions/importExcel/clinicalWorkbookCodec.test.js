const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const {
  buildClinicalWorkbookBuffer,
  parseClinicalWorkbookBuffer
} = require('./clinicalWorkbookCodec')

const {
  makeTimestamp,
  getRecordExactTimestampCST,
  compareRecordsDescendingCST,
  getCSTDateRangeCutoff,
  validateAndNormalizeRecord,
  sanitizeImportItems,
  summarizeImportBatchesFromRecords,
  getRecordDedupeKeys
} = require('./recordDomainSpec')

// 忠实复刻 ExcelJS Workbook 行为（特别是 mergeCells 将从属单元格 value 指向 masterCell 且设置 cell.isMerged / cell.master）的进程内替身
class InMemoryCell {
  constructor(rowNum, colNum, value = null) {
    this.row = rowNum
    this.col = colNum
    this.address = `R${rowNum}C${colNum}`
    this._value = value
    this.isMerged = false
    this.master = this
    this.fill = null
    this.border = null
    this.numFmt = null
  }
  get value() {
    return this.isMerged && this.master !== this ? this.master._value : this._value
  }
  set value(v) {
    if (this.isMerged && this.master !== this) {
      this.master._value = v
    } else {
      this._value = v
    }
  }
}

class InMemoryRow {
  constructor(rowNum, values = []) {
    this.number = rowNum
    this.cells = new Map()
    values.forEach((v, idx) => {
      this.cells.set(idx + 1, new InMemoryCell(rowNum, idx + 1, v))
    })
  }
  get cellCount() {
    let maxCol = 0
    for (const [col, cell] of this.cells.entries()) {
      if (cell.value !== null && cell.value !== undefined && cell.value !== '') {
        if (col > maxCol) maxCol = col
      }
    }
    return maxCol
  }
  getCell(colNum) {
    if (!this.cells.has(colNum)) {
      this.cells.set(colNum, new InMemoryCell(this.number, colNum, null))
    }
    return this.cells.get(colNum)
  }
  eachCell(opts, cb) {
    const callback = typeof opts === 'function' ? opts : cb
    const includeEmpty = typeof opts === 'object' && opts ? Boolean(opts.includeEmpty) : false
    const cols = [...this.cells.keys()].sort((a, b) => a - b)
    for (const colNum of cols) {
      const cell = this.cells.get(colNum)
      if (includeEmpty || (cell.value !== null && cell.value !== undefined && cell.value !== '')) {
        callback(cell, colNum)
      }
    }
  }
}

class InMemoryWorksheet {
  constructor(name) {
    this.name = name
    this.rows = []
    this.merges = []
    this.columns = new Map()
  }
  get rowCount() {
    return this.rows.length
  }
  addRow(values) {
    const row = new InMemoryRow(this.rows.length + 1, values)
    this.rows.push(row)
    return row
  }
  getRow(r) {
    return this.rows[r - 1]
  }
  getColumn(c) {
    if (!this.columns.has(c)) this.columns.set(c, { width: 10 })
    return this.columns.get(c)
  }
  mergeCells(startRow, startCol, endRow, endCol) {
    this.merges.push([startRow, startCol, endRow, endCol])
    const masterCell = this.getRow(startRow).getCell(startCol)
    masterCell.isMerged = true
    masterCell.master = masterCell
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        const cell = this.getRow(r).getCell(c)
        cell.isMerged = true
        cell.master = masterCell
      }
    }
  }
}

class InMemoryWorkbook {
  constructor() {
    this.worksheets = []
    this.xlsx = {
      writeBuffer: async () => {
        const payload = this.worksheets.map(ws => ({
          name: ws.name,
          rows: ws.rows.map(r => {
            const maxCol = Math.max(0, ...r.cells.keys())
            const arr = []
            for (let c = 1; c <= maxCol; c++) {
              const cell = r.cells.get(c)
              arr.push(cell ? cell._value : null)
            }
            return arr
          }),
          merges: ws.merges
        }))
        return Buffer.from(JSON.stringify(payload), 'utf8')
      },
      load: async (buffer) => {
        const payload = JSON.parse(Buffer.from(buffer).toString('utf8'))
        this.worksheets = payload.map(wsData => {
          const ws = new InMemoryWorksheet(wsData.name)
          wsData.rows.forEach(rowVals => ws.addRow(rowVals))
          ;(wsData.merges || []).forEach(([sr, sc, er, ec]) => ws.mergeCells(sr, sc, er, ec))
          return ws
        })
      }
    }
  }
  addWorksheet(name) {
    const ws = new InMemoryWorksheet(name)
    this.worksheets.push(ws)
    return ws
  }
}

let WorkbookClass = InMemoryWorkbook
try {
  WorkbookClass = require('exceljs').Workbook
} catch (e) {
  WorkbookClass = InMemoryWorkbook
}

test('Module sync check: recordDomainSpec and clinicalWorkbookCodec are identical across cloud functions', () => {
  const importSpec = fs.readFileSync(path.join(__dirname, 'recordDomainSpec.js'), 'utf8')
  const exportSpec = fs.readFileSync(path.join(__dirname, '../exportExcel/recordDomainSpec.js'), 'utf8')
  const apiSpec = fs.readFileSync(path.join(__dirname, '../api/recordDomainSpec.js'), 'utf8')
  assert.equal(importSpec, exportSpec, 'exportExcel/recordDomainSpec.js must match importExcel/recordDomainSpec.js')
  assert.equal(importSpec, apiSpec, 'api/recordDomainSpec.js must match importExcel/recordDomainSpec.js')

  const importCodec = fs.readFileSync(path.join(__dirname, 'clinicalWorkbookCodec.js'), 'utf8')
  const exportCodec = fs.readFileSync(path.join(__dirname, '../exportExcel/clinicalWorkbookCodec.js'), 'utf8')
  assert.equal(importCodec, exportCodec, 'exportExcel/clinicalWorkbookCodec.js must match importExcel/clinicalWorkbookCodec.js')
})

test('Round-trip invariance: buildClinicalWorkbookBuffer -> parseClinicalWorkbookBuffer preserves all 5 record types without multiplying merged excretions or losing blank adjacent timings', async () => {
  const catId = 'cat_001'
  const inputRecords = {
    glucoses: [
      {
        cat_id: catId,
        bg_value: 14.2,
        period: '早针',
        status: '早针',
        record_date: '2026-08-01',
        measure_time: '07:30',
        note: '精神好',
        createTime: makeTimestamp('2026-08-01', '07:30')
      },
      {
        cat_id: catId,
        bg_value: 6.8,
        period: '针后5小时',
        status: '针后5小时',
        record_date: '2026-08-01',
        measure_time: '12:30',
        note: '',
        createTime: makeTimestamp('2026-08-01', '12:30')
      },
      {
        // 相邻相同时效 ('针后5小时')：导出时第二行时效留白，导入时必须向下继承为 '针后5小时'
        cat_id: catId,
        bg_value: 5.9,
        period: '针后5小时',
        status: '针后5小时',
        record_date: '2026-08-01',
        measure_time: '13:30',
        note: '复测确认',
        createTime: makeTimestamp('2026-08-01', '13:30')
      },
      {
        cat_id: catId,
        bg_value: 11.5,
        period: '晚针',
        status: '晚针',
        record_date: '2026-08-01',
        measure_time: '19:30',
        note: '',
        createTime: makeTimestamp('2026-08-01', '19:30')
      }
    ],
    insulins: [
      {
        cat_id: catId,
        dose: 1.5,
        period: '早针',
        dose_adjustment: '维持原量',
        insulin_type: '甘精胰岛素 (Glargine)',
        record_date: '2026-08-01',
        inject_time: '07:30',
        note: '精神好',
        createTime: makeTimestamp('2026-08-01', '07:30')
      },
      {
        cat_id: catId,
        dose: 1.25,
        period: '晚针',
        dose_adjustment: '减少 -0.25U',
        insulin_type: '甘精胰岛素 (Glargine)',
        record_date: '2026-08-01',
        inject_time: '19:30',
        note: '',
        createTime: makeTimestamp('2026-08-01', '19:30')
      }
    ],
    meals: [
      {
        cat_id: catId,
        food_grams: 85,
        period: '早餐 (早针餐)',
        food_brand: '巅峰牛肉',
        extras: '益生菌',
        record_date: '2026-08-01',
        meal_time: '07:45',
        note: '秒光盘',
        createTime: makeTimestamp('2026-08-01', '07:45')
      },
      {
        cat_id: catId,
        food_grams: 80,
        period: '晚餐 (晚针餐)',
        food_brand: 'K9羊肉',
        extras: '鱼油',
        record_date: '2026-08-01',
        meal_time: '19:45',
        note: '',
        createTime: makeTimestamp('2026-08-01', '19:45')
      }
    ],
    excretions: [
      {
        cat_id: catId,
        urine: '正常 (3~4团)',
        stool_status: '干硬颗粒 (轻度便秘)',
        stool_color: '正常深褐色',
        record_date: '2026-08-01',
        record_time: '14:20',
        note: '',
        createTime: makeTimestamp('2026-08-01', '14:20')
      }
    ],
    weights: [
      {
        cat_id: catId,
        weight_value: 4.85,
        record_date: '2026-08-01',
        measure_time: '07:30',
        note: '',
        createTime: makeTimestamp('2026-08-01', '07:30')
      }
    ]
  }

  const { buffer, fileName } = await buildClinicalWorkbookBuffer({
    catName: '咪咪',
    records: inputRecords,
    WorkbookClass
  })

  assert.equal(fileName, '咪咪_8月1日血糖报告.xlsx')

  const parsed = await parseClinicalWorkbookBuffer(buffer, { catId, WorkbookClass })

  // 1. 数量完全吻合（尤其是纵向合并 4 行的排泄记录绝不能翻 4 倍，体重记录绝不能丢失）
  assert.equal(parsed.summary.glucoseCount, 4)
  assert.equal(parsed.summary.insulinCount, 2)
  assert.equal(parsed.summary.mealCount, 2)
  assert.equal(parsed.summary.excretionCount, 1)
  assert.equal(parsed.summary.weightCount, 1)

  // 2. 相邻相同时效留白行 ('13:30') 准确恢复为 '针后5小时'
  const thirdBg = parsed.parsedData.glucoses.find(g => g.measure_time === '13:30')
  assert.ok(thirdBg)
  assert.equal(thirdBg.period, '针后5小时')
  assert.equal(thirdBg.bg_value, 5.9)
  assert.equal(thirdBg.note, '复测确认')

  // 3. 首行医疗备注 ('精神好') 与饮食备注 ('秒光盘') 互不污染
  const firstBg = parsed.parsedData.glucoses.find(g => g.measure_time === '07:30')
  const firstMeal = parsed.parsedData.meals.find(m => m.meal_time === '07:45')
  assert.equal(firstBg.note, '精神好')
  assert.equal(firstMeal.note, '秒光盘')
  assert.equal(firstMeal.period, '早餐 (早针餐)')

  // 4. 排泄记录精确恢复包含括号的形态 ('干硬颗粒 (轻度便秘)') 与颜色 ('正常深褐色')
  const ex = parsed.parsedData.excretions[0]
  assert.equal(ex.urine, '正常 (3~4团)')
  assert.equal(ex.stool_status, '干硬颗粒 (轻度便秘)')
  assert.equal(ex.stool_color, '正常深褐色')

  // 5. 体重记录无损恢复
  const w = parsed.parsedData.weights[0]
  assert.equal(w.weight_value, 4.85)
  assert.equal(w.record_date, '2026-08-01')

  // 6. 查重指纹往返一致性：原始数据库记录生成的查重键集合能够 100% 命中重新解析出的记录
  for (const [colName, origList, parsedList] of [
    ['blood_glucose', inputRecords.glucoses, parsed.parsedData.glucoses],
    ['insulin_records', inputRecords.insulins, parsed.parsedData.insulins],
    ['meal_records', inputRecords.meals, parsed.parsedData.meals],
    ['excretion_records', inputRecords.excretions, parsed.parsedData.excretions],
    ['weight_records', inputRecords.weights, parsed.parsedData.weights]
  ]) {
    const existingSet = new Set()
    origList.forEach(rec => getRecordDedupeKeys(colName, rec).forEach(k => existingSet.add(k)))
    parsedList.forEach(item => {
      const matched = getRecordDedupeKeys(colName, item).some(k => existingSet.has(k))
      assert.ok(matched, `Expected ${colName} item to match existing dedupe key set`)
    })
  }
})

test('Empty report export -> import produces 0 records and ignores placeholder note', async () => {
  const { buffer } = await buildClinicalWorkbookBuffer({
    catName: '空档案猫',
    records: {},
    WorkbookClass
  })
  const parsed = await parseClinicalWorkbookBuffer(buffer, { catId: 'cat_empty', WorkbookClass })
  assert.equal(parsed.summary.glucoseCount, 0)
  assert.equal(parsed.summary.insulinCount, 0)
  assert.equal(parsed.summary.mealCount, 0)
  assert.equal(parsed.summary.excretionCount, 0)
  assert.equal(parsed.summary.weightCount, 0)
})

test('Third-party / user custom Excel table with units, Chinese times, and free-form excretion text is parsed accurately', async () => {
  const wb = new WorkbookClass()
  const ws = wb.addWorksheet('Sheet1')
  ws.addRow(['测量日期', '时刻', '时段', '耳血数值', '胰岛素用量', '胰岛素品牌', '罐头', '喂食量', '排泄', '称重', '护理说明'])
  ws.addRow(['2026/09/05', '7点30', '早针', '12.6 mmol/L', '2.0u', '地特胰岛素 (Detemir)', '小李子', '75g', '尿多，软便', '5.2kg', '状态稳定'])

  const buffer = await wb.xlsx.writeBuffer()
  const parsed = await parseClinicalWorkbookBuffer(buffer, { catId: 'cat_custom', WorkbookClass })

  assert.equal(parsed.summary.glucoseCount, 1)
  assert.equal(parsed.summary.insulinCount, 1)
  assert.equal(parsed.summary.mealCount, 1)
  assert.equal(parsed.summary.excretionCount, 1)
  assert.equal(parsed.summary.weightCount, 1)

  assert.equal(parsed.parsedData.glucoses[0].record_date, '2026-09-05')
  assert.equal(parsed.parsedData.glucoses[0].measure_time, '07:30')
  assert.equal(parsed.parsedData.glucoses[0].bg_value, 12.6)
  assert.equal(parsed.parsedData.insulins[0].dose, 2.0)
  assert.equal(parsed.parsedData.insulins[0].insulin_type, '地特胰岛素 (Detemir)')
  assert.equal(parsed.parsedData.excretions[0].urine, '偏多 (>5团)')
  assert.equal(parsed.parsedData.excretions[0].stool_status, '软便糊状')
  assert.equal(parsed.parsedData.weights[0].weight_value, 5.2)
})

test('Polymorphic CSV import: parses multi-type CSV with combined date-time column and shifted meal/weight rows', async () => {
  const csvSample = [
    '记录类型,血糖值,单位,测量类型,测量时间,备注,创建时间',
    '血糖,10.7,mmol/L,饭后,2026-08-15 14:33:00,,2026-08-15 14:33:27,,,,,',
    '血糖,16.1,mmol/L,饭后,2026-08-04 21:21:00,偷吃了面包,2026-08-04 21:22:03,,,,,',
    ',饮食,小李子,150,g,2026-08-11 08:30:00,,2026-08-11 12:22:48,,,',
    ',饮食,鸡胸肉,75,g,2026-07-07 08:50:00,8-9,2026-07-07 09:12:37,,,',
    ',,,,体重,5.9,2026-08-02 15:32:00,,2026-08-02 15:32:07'
  ].join('\r\n')

  const parsed = await parseClinicalWorkbookBuffer(Buffer.from(csvSample, 'utf8'), { catId: 'cat_csv' })

  assert.equal(parsed.summary.glucoseCount, 2)
  assert.equal(parsed.summary.insulinCount, 0)
  assert.equal(parsed.summary.mealCount, 2)
  assert.equal(parsed.summary.weightCount, 1)

  assert.equal(parsed.parsedData.glucoses[0].bg_value, 10.7)
  assert.equal(parsed.parsedData.glucoses[0].period, '饭后')
  assert.equal(parsed.parsedData.glucoses[0].record_date, '2026-08-15')
  assert.equal(parsed.parsedData.glucoses[0].measure_time, '14:33')
  assert.equal(parsed.parsedData.glucoses[1].note, '偷吃了面包')

  assert.equal(parsed.parsedData.meals[0].food_brand, '小李子')
  assert.equal(parsed.parsedData.meals[0].food_grams, 150)
  assert.equal(parsed.parsedData.meals[0].record_date, '2026-08-11')
  assert.equal(parsed.parsedData.meals[0].meal_time, '08:30')
  assert.equal(parsed.parsedData.meals[1].note, '8-9')

  assert.equal(parsed.parsedData.weights[0].weight_value, 5.9)
  assert.equal(parsed.parsedData.weights[0].record_date, '2026-08-02')
  assert.equal(parsed.parsedData.weights[0].measure_time, '15:32')

  const realCsvPath = 'c:\\Users\\13673\\xwechat_files\\wxid_85r845bjgwjq22_e4ef\\msg\\file\\2026-10\\猫咪血糖记录_2026-10-20_145210(1).csv'
  if (fs.existsSync(realCsvPath)) {
    const realBuf = fs.readFileSync(realCsvPath)
    const realParsed = await parseClinicalWorkbookBuffer(realBuf, { catId: 'cat_real' })
    assert.equal(realParsed.summary.glucoseCount, 76)
    assert.equal(realParsed.summary.insulinCount, 0)
    assert.equal(realParsed.summary.mealCount, 22)
    assert.equal(realParsed.summary.excretionCount, 0)
    assert.equal(realParsed.summary.weightCount, 1)
    assert.equal(realParsed.summary.startDate, '2026-06-27')
    assert.equal(realParsed.summary.endDate, '2026-08-15')
  }
})

test('RecordDomainSpec: CST chronological sorting handles explicit seconds and updated dates accurately', () => {
  const recA = {
    _id: 'a',
    record_date: '2026-08-10',
    measure_time: '08:00:15',
    createTime: makeTimestamp('2026-08-10', '08:00:15')
  }
  const recB = {
    _id: 'b',
    record_date: '2026-08-10',
    measure_time: '10:00',
    createTime: makeTimestamp('2026-08-10', '10:00')
  }
  const recC = {
    _id: 'c',
    record_date: '2026-08-09',
    measure_time: '09:00',
    createTime: makeTimestamp('2026-08-12', '09:00')
  }

  const list = [recA, recB, recC]
  list.sort(compareRecordsDescendingCST)

  assert.deepEqual(list.map(r => r._id), ['b', 'a', 'c'])
})

test('RecordDomainSpec: validateAndNormalizeRecord & sanitizeImportItems enforce unified bounds', () => {
  const validWeight = validateAndNormalizeRecord('weight_records', {
    weight_value: '35.5',
    record_date: '2026-08-01',
    measure_time: '08:00'
  })
  assert.equal(validWeight.weight_value, 35.5)

  assert.throws(() => {
    validateAndNormalizeRecord('blood_glucose', { bg_value: 150 })
  }, /Invalid bg_value/)

  const sanitized = sanitizeImportItems(
    [{ weight_value: 35.5, record_date: '2026-08-01', measure_time: '08:00' }],
    'weight_records',
    'cat_1',
    'openid_1'
  )
  assert.equal(sanitized.length, 1)
  assert.equal(sanitized[0].weight_value, 35.5)

  const cutoff = getCSTDateRangeCutoff(30, makeTimestamp('2026-08-31', '20:30'))
  assert.equal(cutoff.cutoffDateStr, '2026-08-01')
})

test('ImportBatch rollback metadata: sanitizeImportItems stamps batch metadata and summarizeImportBatchesFromRecords aggregates batches accurately', () => {
  const batchMeta1 = {
    batchId: 'imp_1700000001_aaa',
    importedAt: 1700000001000,
    fileName: '猫咪血糖记录_批次1.csv'
  }
  const batchMeta2 = {
    batchId: 'imp_1700000002_bbb',
    importedAt: 1700000002000,
    fileName: '猫咪血糖记录_批次2.xlsx'
  }

  const b1Glucoses = sanitizeImportItems(
    [
      { bg_value: 10.5, record_date: '2026-07-01', measure_time: '08:00' },
      { bg_value: 8.2, record_date: '2026-07-05', measure_time: '20:00' }
    ],
    'blood_glucose',
    'cat_1',
    'openid_1',
    batchMeta1
  )
  const b1Meals = sanitizeImportItems(
    [{ food_grams: 80, food_brand: '巅峰', record_date: '2026-07-03', meal_time: '08:15' }],
    'meal_records',
    'cat_1',
    'openid_1',
    batchMeta1
  )
  const b2Weights = sanitizeImportItems(
    [{ weight_value: 5.4, record_date: '2026-08-10', measure_time: '09:00' }],
    'weight_records',
    'cat_1',
    'openid_1',
    batchMeta2
  )

  assert.equal(b1Glucoses[0].import_batch_id, 'imp_1700000001_aaa')
  assert.equal(b1Glucoses[0].imported_at, 1700000001000)
  assert.equal(b1Glucoses[0].import_file_name, '猫咪血糖记录_批次1.csv')

  const batches = summarizeImportBatchesFromRecords({
    blood_glucose: b1Glucoses,
    meal_records: b1Meals,
    weight_records: b2Weights
  })

  assert.equal(batches.length, 2)
  // 按导入时间倒序，批次2在前，批次1在后
  assert.equal(batches[0].batchId, 'imp_1700000002_bbb')
  assert.equal(batches[0].fileName, '猫咪血糖记录_批次2.xlsx')
  assert.equal(batches[0].totalCount, 1)
  assert.equal(batches[0].counts.weight, 1)
  assert.equal(batches[0].startDate, '2026-08-10')
  assert.equal(batches[0].endDate, '2026-08-10')

  assert.equal(batches[1].batchId, 'imp_1700000001_aaa')
  assert.equal(batches[1].fileName, '猫咪血糖记录_批次1.csv')
  assert.equal(batches[1].totalCount, 3)
  assert.equal(batches[1].counts.glucose, 2)
  assert.equal(batches[1].counts.meal, 1)
  assert.equal(batches[1].startDate, '2026-07-01')
  assert.equal(batches[1].endDate, '2026-07-05')
})
