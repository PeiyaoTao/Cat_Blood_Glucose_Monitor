// 领域规范深模块 (Deep Module): 统一 5 类临床记录字段白名单、数值边界、CST (UTC+8) 时间戳计算与查重指纹
const CST_OFFSET_MS = 8 * 3600 * 1000

const RECORD_COLLECTIONS = [
  'blood_glucose',
  'insulin_records',
  'meal_records',
  'excretion_records',
  'weight_records'
]

const RECORD_FIELDS = {
  blood_glucose: ['bg_value', 'period', 'status', 'record_date', 'measure_time', 'note', 'createTime'],
  insulin_records: ['dose', 'period', 'dose_adjustment', 'insulin_type', 'record_date', 'inject_time', 'note', 'createTime'],
  meal_records: ['food_grams', 'period', 'food_brand', 'extras', 'record_date', 'meal_time', 'note', 'createTime'],
  excretion_records: ['urine', 'stool_status', 'stool_color', 'record_date', 'record_time', 'note', 'createTime'],
  weight_records: ['weight_value', 'record_date', 'measure_time', 'note', 'createTime']
}

const RECORD_BOUNDS = {
  blood_glucose: { field: 'bg_value', minExclusive: 0, max: 100 },
  insulin_records: { field: 'dose', minExclusive: 0, max: 50 },
  meal_records: { field: 'food_grams', min: 0, max: 2000 },
  weight_records: { field: 'weight_value', minExclusive: 0, max: 50 }
}

const MAX_IMPORT_PER_TYPE = 5000
const MAX_NOTE_LENGTH = 500

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/

const pickRecordFields = (obj, keys) => {
  const out = {}
  if (!obj || typeof obj !== 'object') return out
  keys.forEach(k => {
    if (obj[k] !== undefined) out[k] = obj[k]
  })
  return out
}

const assertRecordType = (type) => {
  if (!RECORD_COLLECTIONS.includes(type)) {
    throw new Error('Invalid record type')
  }
}

// 清洗并标准化日期格式为 YYYY-MM-DD
const cleanDateStr = (raw, fallbackYear) => {
  if (raw === undefined || raw === null || raw === '') return ''
  const str = String(raw).trim()
  if (!str) return ''

  // 1. 标准 YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD（兼容末尾带 HH:mm[:ss] 的日期时间合一字符串）
  const m1 = str.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[\sT]+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/)
  if (m1) {
    const y = m1[1]
    const m = m1[2].padStart(2, '0')
    const d = m1[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // 2. M月D日 或 MM-DD 或 MM/DD (默认补充北京时间当年年份)
  if (/^\d{1,2}[月/-]\d{1,2}日?$/.test(str)) {
    const m2 = str.match(/^(\d{1,2})[月/-](\d{1,2})(?:日)?$/)
    if (m2) {
      const year = fallbackYear || toCST(Date.now()).year
      const m = m2[1].padStart(2, '0')
      const d = m2[2].padStart(2, '0')
      return `${year}-${m}-${d}`
    }
  }

  // 3. Excel 序列号日期 (如 45521)
  if (/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str)
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000))
      const y = dateObj.getUTCFullYear()
      const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0')
      const d = String(dateObj.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
  }

  return ''
}

// 清洗并标准化时间格式为 HH:mm 或 HH:mm:ss
const cleanTimeStr = (raw) => {
  if (raw === undefined || raw === null || raw === '') return ''
  const str = String(raw).trim()
  if (!str) return ''

  // 1. 匹配 HH:mm 或 HH:mm:ss（若秒数为 00 则标准化为 HH:mm，非零秒数予以保留）
  const m1 = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (m1) {
    const hNum = parseInt(m1[1], 10)
    const minNum = parseInt(m1[2], 10)
    if (hNum >= 0 && hNum <= 23 && minNum >= 0 && minNum <= 59) {
      const h = String(hNum).padStart(2, '0')
      const min = String(minNum).padStart(2, '0')
      if (m1[3] !== undefined) {
        const sNum = parseInt(m1[3], 10)
        if (sNum > 0 && sNum <= 59) {
          return `${h}:${min}:${String(sNum).padStart(2, '0')}`
        }
      }
      return `${h}:${min}`
    }
  }

  // 2. 匹配 "7点30" 或 "下午3点" 或 "7点"
  const m2 = str.match(/(\d{1,2})点(?:(\d{1,2})分?)?/)
  if (m2) {
    let h = parseInt(m2[1], 10)
    if (str.includes('下午') || str.includes('晚')) {
      if (h < 12) h += 12
    }
    if (h >= 0 && h <= 23) {
      const hStr = String(h).padStart(2, '0')
      const minStr = (m2[2] || '0').padStart(2, '0')
      return `${hStr}:${minStr}`
    }
  }

  // 3. 匹配 Excel 小数时间 (0.3125 代表 07:30)
  if (/^0\.\d+$/.test(str)) {
    const num = parseFloat(str)
    if (!isNaN(num) && num > 0 && num < 1) {
      const totalSecs = Math.round(num * 86400)
      const h = String(Math.floor(totalSecs / 3600) % 24).padStart(2, '0')
      const min = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0')
      return `${h}:${min}`
    }
  }

  return ''
}

const parsePureNumber = (val) => {
  if (val === undefined || val === null || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(val)
  return isNaN(n) ? null : n
}

const parseNumberWithUnit = (raw) => {
  if (raw === undefined || raw === null || raw === '') return null
  const str = String(raw).replace(/,/g, '').trim()
  const match = str.match(/[-+]?[0-9]*\.?[0-9]+/)
  if (match) {
    const n = parseFloat(match[0])
    return isNaN(n) ? null : n
  }
  return null
}

// 将时间戳转换为北京时间的 { date: 'YYYY-MM-DD', time: 'HH:mm', year, month, day, hour, minute, second }
const toCST = (ts) => {
  const d = new Date(Number(ts) + CST_OFFSET_MS)
  const pad = (n) => String(n).padStart(2, '0')
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  const day = d.getUTCDate()
  const hour = d.getUTCHours()
  const minute = d.getUTCMinutes()
  const second = d.getUTCSeconds()
  return {
    date: `${year}-${pad(month)}-${pad(day)}`,
    time: `${pad(hour)}:${pad(minute)}`,
    year,
    month,
    day,
    hour,
    minute,
    second
  }
}

// 根据北京时间日期 (YYYY-MM-DD) 和时分 (HH:mm[:ss]) 构造 UTC 时间戳
const makeTimestamp = (dateStr, timeStr) => {
  const cleanedDate = cleanDateStr(dateStr)
  if (!cleanedDate) return Date.now()
  const parts = cleanedDate.split('-').map(Number)
  const y = parts[0]
  const m = parts[1] - 1
  const d = parts[2]
  let h = 0
  let min = 0
  let sec = 0
  const cleanedTime = cleanTimeStr(timeStr) || String(timeStr || '')
  if (cleanedTime && cleanedTime.includes(':')) {
    const tParts = cleanedTime.split(':').map(Number)
    h = tParts[0] || 0
    min = tParts[1] || 0
    sec = tParts[2] || 0
  }
  return Date.UTC(y, m, d, h, min, sec) - CST_OFFSET_MS
}

// 提取记录的业务日期 (YYYY-MM-DD)，优先使用 record_date，否则按北京时间解析 createTime
const extractRecordDate = (item) => {
  if (!item) return toCST(Date.now()).date
  const cleaned = cleanDateStr(item.record_date)
  if (cleaned) return cleaned
  const ts = typeof item.createTime === 'number' && !isNaN(item.createTime) ? item.createTime : Date.now()
  return toCST(ts).date
}

// 提取记录的业务时间字符串 (HH:mm 或 HH:mm:ss)
const extractTimeStr = (item) => {
  if (!item) return ''
  const raw = item.measure_time || item.inject_time || item.meal_time || item.record_time || ''
  return cleanTimeStr(raw) || String(raw).trim()
}

// 计算记录在北京时间下的精确比较时间戳（毫秒级），消除 UTC/CST 混用与旧 createTime 残留导致的乱序
const getRecordExactTimestampCST = (doc) => {
  if (!doc) return 0
  const dStr = cleanDateStr(doc.record_date)
  const tStr = extractTimeStr(doc)
  if (dStr) {
    const parts = dStr.split('-').map(Number)
    const y = parts[0]
    const m = parts[1]
    const d = parts[2]
    let h = 0
    let min = 0
    let s = 0
    if (tStr) {
      const mt = tStr.match(/(\d{1,2}):(\d{2})(?::(\d{1,2}))?/)
      if (mt) {
        h = Number(mt[1]) || 0
        min = Number(mt[2]) || 0
        if (mt[3] !== undefined) s = Number(mt[3]) || 0
      }
    }
    const baseMs = Date.UTC(y, m - 1, d, h, min, s) - CST_OFFSET_MS
    // 若时间字符串未显式包含秒数，且 createTime 在北京时间下与当前的年/月/日/时/分完全吻合，保留其秒与毫秒偏移
    if (s === 0 && typeof doc.createTime === 'number' && !isNaN(doc.createTime)) {
      const cst = toCST(doc.createTime)
      if (cst.year === y && cst.month === m && cst.day === d && cst.hour === h && cst.minute === min) {
        return doc.createTime
      }
    }
    return baseMs
  }
  return typeof doc.createTime === 'number' && !isNaN(doc.createTime) ? doc.createTime : 0
}

// 按业务时间升序排列（最早在前，最新在后）
const compareRecordsChronologicalCST = (a, b) => {
  const tsA = getRecordExactTimestampCST(a)
  const tsB = getRecordExactTimestampCST(b)
  if (tsA !== tsB) return tsA - tsB
  if (a.createTime && b.createTime && a.createTime !== b.createTime) {
    return a.createTime - b.createTime
  }
  return String(a._id || '').localeCompare(String(b._id || ''))
}

// 按业务时间降序排列（最新在前，最早在后）
const compareRecordsDescendingCST = (a, b) => {
  return compareRecordsChronologicalCST(b, a)
}

// 计算按北京时间自然日回溯 days 天的零点起始日期与时间戳
const getCSTDateRangeCutoff = (days, nowMs = Date.now()) => {
  if (!days || days <= 0) {
    return { cutoffDateStr: '', cutoffTimestamp: 0 }
  }
  const todayCST = toCST(nowMs)
  const todayMidnightUTC = Date.UTC(todayCST.year, todayCST.month - 1, todayCST.day, 0, 0, 0) - CST_OFFSET_MS
  const cutoffTimestamp = todayMidnightUTC - days * 24 * 3600 * 1000
  const cutoffDateStr = toCST(cutoffTimestamp).date
  return { cutoffDateStr, cutoffTimestamp }
}

// 根据进食时间推断与前端一致的用餐时段枚举
const inferMealPeriod = (mealTime) => {
  const cleaned = cleanTimeStr(mealTime) || '12:00'
  const h = parseInt(cleaned.split(':')[0], 10)
  if (h >= 5 && h < 11) return '早餐 (早针餐)'
  if (h >= 11 && h < 16) return '午餐/加餐'
  if (h >= 16 && h < 21) return '晚餐 (晚针餐)'
  return '夜宵/夜间加餐'
}

// 校验并规范化单条记录（支持 addRecord 全量校验与 updateRecord 局部校验）
const validateAndNormalizeRecord = (type, raw, options = {}) => {
  const { partial = false } = options
  assertRecordType(type)
  const recordData = pickRecordFields(raw, RECORD_FIELDS[type])

  const rule = RECORD_BOUNDS[type]
  if (rule) {
    const rawVal = recordData[rule.field]
    if (!partial || rawVal !== undefined) {
      const val = Number(rawVal)
      const minOk = rule.minExclusive !== undefined ? val > rule.minExclusive : val >= rule.min
      if (isNaN(val) || !minOk || val > rule.max) {
        throw new Error(`Invalid ${rule.field}`)
      }
      recordData[rule.field] = val
    }
  }

  if (recordData.note !== undefined) {
    recordData.note = String(recordData.note).slice(0, MAX_NOTE_LENGTH)
  }

  if (partial) {
    if (recordData.createTime !== undefined) {
      const ts = Number(recordData.createTime)
      if (!isNaN(ts) && ts > 0) recordData.createTime = ts
      else delete recordData.createTime
    }
  } else {
    if (typeof recordData.createTime !== 'number' || isNaN(recordData.createTime)) {
      const dStr = cleanDateStr(recordData.record_date)
      const tStr = extractTimeStr(recordData)
      recordData.createTime = dStr ? makeTimestamp(dStr, tStr) : Date.now()
    }
  }

  return recordData
}

// 批量导入记录清洗与边界过滤（支持绑定导入批次标识以便精准回滚）
const sanitizeImportItems = (items, collectionName, catId, openid, batchMeta = {}) => {
  if (!Array.isArray(items)) return []
  assertRecordType(collectionName)
  const fields = RECORD_FIELDS[collectionName]
  const batchId = batchMeta && typeof batchMeta.batchId === 'string' ? batchMeta.batchId.trim() : ''
  const importedAt = batchMeta && typeof batchMeta.importedAt === 'number' && !isNaN(batchMeta.importedAt)
    ? batchMeta.importedAt
    : Date.now()
  const fileName = batchMeta && typeof batchMeta.fileName === 'string'
    ? batchMeta.fileName.trim().slice(0, 120)
    : ''

  return items
    .slice(0, MAX_IMPORT_PER_TYPE)
    .filter(item => item && typeof item === 'object' && DATE_RE.test(cleanDateStr(item.record_date)))
    .map(item => {
      const doc = pickRecordFields(item, fields)
      doc.record_date = cleanDateStr(doc.record_date)
      if (collectionName === 'blood_glucose') doc.bg_value = Number(doc.bg_value)
      if (collectionName === 'insulin_records') doc.dose = Number(doc.dose)
      if (collectionName === 'meal_records') doc.food_grams = Number(doc.food_grams) || 0
      if (collectionName === 'weight_records') doc.weight_value = Number(doc.weight_value)
      if (typeof doc.createTime !== 'number' || isNaN(doc.createTime)) {
        doc.createTime = makeTimestamp(doc.record_date, extractTimeStr(doc))
      }
      if (doc.note !== undefined) doc.note = String(doc.note).slice(0, MAX_NOTE_LENGTH)
      doc.cat_id = catId
      doc.created_by = openid
      doc.source = 'excel_import'
      if (batchId) {
        doc.import_batch_id = batchId
        doc.imported_at = importedAt
        if (fileName) doc.import_file_name = fileName
      }
      return doc
    })
    .filter(doc => {
      const rule = RECORD_BOUNDS[collectionName]
      if (!rule) return true
      const val = doc[rule.field]
      const minOk = rule.minExclusive !== undefined ? val > rule.minExclusive : val >= rule.min
      return !isNaN(val) && minOk && val <= rule.max
    })
}

// 聚合各集合中带有 import_batch_id 的记录，生成按导入时间倒序排列的可回滚批次摘要
const summarizeImportBatchesFromRecords = (recordsByType = {}, maxBatches = 10) => {
  const batchMap = new Map()
  const typeMapping = [
    ['blood_glucose', 'glucose'],
    ['insulin_records', 'insulin'],
    ['meal_records', 'meal'],
    ['excretion_records', 'excretion'],
    ['weight_records', 'weight']
  ]

  for (const [colName, countKey] of typeMapping) {
    const list = Array.isArray(recordsByType[colName])
      ? recordsByType[colName]
      : (Array.isArray(recordsByType[countKey]) ? recordsByType[countKey] : [])

    for (const rec of list) {
      if (!rec || typeof rec.import_batch_id !== 'string' || !rec.import_batch_id.trim()) continue
      const batchId = rec.import_batch_id.trim()
      let entry = batchMap.get(batchId)
      if (!entry) {
        entry = {
          batchId,
          fileName: '',
          importedAt: 0,
          counts: {
            glucose: 0,
            insulin: 0,
            meal: 0,
            excretion: 0,
            weight: 0
          },
          totalCount: 0,
          startDate: '',
          endDate: ''
        }
        batchMap.set(batchId, entry)
      }

      entry.counts[countKey]++
      entry.totalCount++

      if (!entry.fileName && typeof rec.import_file_name === 'string' && rec.import_file_name.trim()) {
        entry.fileName = rec.import_file_name.trim()
      }
      const ts = typeof rec.imported_at === 'number' && !isNaN(rec.imported_at) ? rec.imported_at : 0
      if (ts > entry.importedAt) {
        entry.importedAt = ts
      }

      const dStr = cleanDateStr(rec.record_date)
      if (dStr) {
        if (!entry.startDate || dStr < entry.startDate) entry.startDate = dStr
        if (!entry.endDate || dStr > entry.endDate) entry.endDate = dStr
      }
    }
  }

  return Array.from(batchMap.values())
    .filter(b => b.totalCount > 0)
    .sort((a, b) => (b.importedAt - a.importedAt) || b.batchId.localeCompare(a.batchId))
    .slice(0, maxBatches)
}

const getDedupeDate = (doc) => {
  if (!doc) return ''
  if (doc.record_date) {
    const cleaned = cleanDateStr(doc.record_date)
    if (cleaned) return cleaned
  }
  if (doc.createTime) return toCST(doc.createTime).date
  return ''
}

const getDedupeTime = (doc) => {
  if (!doc) return ''
  const raw = doc.measure_time || doc.inject_time || doc.meal_time || doc.record_time || ''
  if (raw) {
    const cleaned = cleanTimeStr(raw)
    if (cleaned) return cleaned
  }
  if (doc.createTime) return toCST(doc.createTime).time
  return ''
}

// 生成单条记录的主查重指纹
const getPrimaryDedupeKey = (collectionName, doc) => {
  const d = getDedupeDate(doc)
  const t = getDedupeTime(doc)
  switch (collectionName) {
    case 'blood_glucose':
      return `${d}_${t}_${parseFloat(doc.bg_value || 0).toFixed(1)}`
    case 'insulin_records':
      return `${d}_${t}_${parseFloat(doc.dose || 0).toFixed(2)}`
    case 'meal_records':
      return `${d}_${t}_${parseFloat(doc.food_grams || 0).toFixed(0)}_${doc.food_brand || ''}`
    case 'excretion_records':
      return `${d}_${t}_${doc.urine || ''}_${doc.stool_status || ''}`
    case 'weight_records':
      return `${d}_${parseFloat(doc.weight_value || 0).toFixed(2)}`
    default:
      return `${d}_${t}`
  }
}

// 生成用于已有数据库记录匹配的查重指纹集合（兼容临床表按天汇总排泄记录的无损往返查重）
const getRecordDedupeKeys = (collectionName, doc) => {
  const primary = getPrimaryDedupeKey(collectionName, doc)
  if (collectionName === 'excretion_records') {
    const d = getDedupeDate(doc)
    const t = getDedupeTime(doc)
    return [
      primary,
      `${d}_${t}_${doc.urine || ''}`,
      `${d}_DAILY_${doc.urine || ''}_${doc.stool_status || ''}`
    ]
  }
  return [primary]
}

module.exports = {
  CST_OFFSET_MS,
  RECORD_COLLECTIONS,
  RECORD_FIELDS,
  RECORD_BOUNDS,
  MAX_IMPORT_PER_TYPE,
  MAX_NOTE_LENGTH,
  DATE_RE,
  TIME_RE,
  pickRecordFields,
  assertRecordType,
  cleanDateStr,
  cleanTimeStr,
  parsePureNumber,
  parseNumberWithUnit,
  toCST,
  makeTimestamp,
  extractRecordDate,
  extractTimeStr,
  getRecordExactTimestampCST,
  compareRecordsChronologicalCST,
  compareRecordsDescendingCST,
  getCSTDateRangeCutoff,
  inferMealPeriod,
  validateAndNormalizeRecord,
  sanitizeImportItems,
  summarizeImportBatchesFromRecords,
  getDedupeDate,
  getDedupeTime,
  getPrimaryDedupeKey,
  getRecordDedupeKeys
}
