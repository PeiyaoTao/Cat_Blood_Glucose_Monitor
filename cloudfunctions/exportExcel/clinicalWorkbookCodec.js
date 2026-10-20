// 临床就诊表编解码深模块 (In-Process Deep Module)
// 封装 ExcelJS (.xlsx) 与 CSV 工作簿构建与解析、合并单元格主从识别、相邻时效向下继承、多态事件行识别与结构化排泄编解码
const resolveWorkbookClass = (WorkbookClass) => {
  if (WorkbookClass) return WorkbookClass
  return require('exceljs').Workbook
}
const {
  RECORD_BOUNDS,
  cleanDateStr,
  cleanTimeStr,
  parsePureNumber,
  parseNumberWithUnit,
  makeTimestamp,
  extractRecordDate,
  extractTimeStr,
  inferMealPeriod
} = require('./recordDomainSpec')

const EMPTY_REPORT_NOTE = '暂无历史记录'
const MEAL_NOTE_TAG = '[饮食备注]'

const KNOWN_STOOL_STATUSES = [
  '干硬颗粒 (轻度便秘)',
  '正常条状成型',
  '软便糊状',
  '水样腹泻',
  '未排便'
]

// ==================== 模糊表头匹配字典 ====================
const HEADER_KEYWORD_MAP = {
  recordType: ['记录类型', '事件类型', '记录类别'],
  date: ['日期', 'date', 'day', '记录日期', '测量日期'],
  mealTime: ['吃饭时间', '进食时间', '用餐时间', '喂食时间', '进食时刻', '吃饭时刻'],
  foodGrams: ['吃饭克数(g)', '吃饭克数', '进食克数', '克数', '食量', '喂食量', '罐头克数', '进食量', '餐量', 'food', 'grams'],
  foodBrand: ['罐头品牌/批次', '罐头品牌', '罐头', '品牌', '批次', '猫粮', '主食', 'brand', 'diet'],
  totalFood: ['总量', '总克数', '总食量', '合计', 'total'],
  doseAdj: ['剂量选择', '剂量调整', '调整', '增减', '加减', 'adjustment'],
  insulinType: ['胰岛素类型', '胰岛素种类', '胰岛素品牌', '针剂', 'insulintype'],
  dose: ['打针剂量(u)', '打针剂量', '打针', '剂量', '胰岛素', '注射', 'dose', 'insulin', '用量'],
  unit: ['单位', 'unit'],
  glucose: ['血糖', '耳血', '数值', 'bg', 'glu', 'blood glucose', '血糖值', 'mmol'],
  timing: ['时效', '测量类型', '测糖类型', '阶段', '针次', '时段', '时点', 'period', 'stage'],
  time: ['时间', 'time', '时刻', '时分', '测糖时间', '注射时间', '测量时间'],
  extras: ['附带东西', '附带', '加料', '补剂', '用药', '营养品', 'extras', 'supplements'],
  excretion: ['尿量', '排便', '尿量 / 排便', '排泄', '便便', '粪便', '尿', '便', 'urine', 'stool'],
  weight: ['体重(kg)', '体重', '称重', 'weight', 'kg', '斤'],
  note: ['备注', '说明', 'note', 'notes', '情况', '症状', '精神', '护理'],
  createTime: ['创建时间', '录入时间', '记录创建时间']
}

const matchHeaderType = (headerText) => {
  if (!headerText) return null
  const text = String(headerText).toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '')

  // 1. 第一优先级：全等精准匹配
  for (const [colKey, keywords] of Object.entries(HEADER_KEYWORD_MAP)) {
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '')
      if (text === cleanKw) {
        return colKey
      }
    }
  }

  // 2. 第二优先级：按关键词长度降序包含匹配
  const allKeywords = []
  for (const [colKey, keywords] of Object.entries(HEADER_KEYWORD_MAP)) {
    for (const kw of keywords) {
      allKeywords.push({ colKey, kw: kw.toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '') })
    }
  }
  allKeywords.sort((a, b) => b.kw.length - a.kw.length)

  for (const item of allKeywords) {
    if (text.includes(item.kw)) {
      return item.colKey
    }
  }
  return null
}

// ==================== CSV 文本识别与解析器 ====================
const isZipBuffer = (buf) => {
  if (!buf || buf.length < 4) return false
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04
}

const isInMemoryJsonBuffer = (buf) => {
  if (!buf || buf.length < 2) return false
  const str = Buffer.from(buf).slice(0, 30).toString('utf8').trim()
  return str.startsWith('[{"name":')
}

const decodeCsvBufferToString = (buffer) => {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer)
  let utf8Str = buf.toString('utf8')
  if (utf8Str.charCodeAt(0) === 0xFEFF) {
    utf8Str = utf8Str.slice(1)
  }
  // 若包含大量 UTF-8 替换字符 \uFFFD，尝试使用 GBK / GB18030 解码（兼容 Windows Excel 导出的 ANSI CSV）
  if (utf8Str.includes('\uFFFD') && typeof TextDecoder !== 'undefined') {
    try {
      const gbkDecoder = new TextDecoder('gb18030')
      return gbkDecoder.decode(buf)
    } catch (e) {}
  }
  return utf8Str
}

const parseCsvTextToRows = (csvText) => {
  const rows = []
  let currentRow = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const ch = csvText[i]
    const nextCh = csvText[i + 1]

    if (inQuotes) {
      if (ch === '"' && nextCh === '"') {
        currentField += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        currentField += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        currentRow.push(currentField.trim())
        currentField = ''
      } else if (ch === '\r' || ch === '\n') {
        if (ch === '\r' && nextCh === '\n') i++
        currentRow.push(currentField.trim())
        if (currentRow.some(cell => cell !== '')) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ''
      } else {
        currentField += ch
      }
    }
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(cell => cell !== '')) {
      rows.push(currentRow)
    }
  }
  return rows
}

const buildCsvWorksheetStandIn = (rows) => {
  return {
    rowCount: rows.length,
    getRow(r) {
      const vals = rows[r - 1] || []
      return {
        cellCount: vals.length,
        getCell(colNum) {
          const val = vals[colNum - 1]
          return {
            value: val !== undefined ? val : '',
            isMerged: false,
            address: `R${r}C${colNum}`,
            master: { address: `R${r}C${colNum}` }
          }
        },
        eachCell(opts, cb) {
          const callback = typeof opts === 'function' ? opts : cb
          vals.forEach((v, idx) => {
            if (v !== undefined && v !== null && v !== '') {
              callback({ value: v, isMerged: false, address: `R${r}C${idx + 1}`, master: { address: `R${r}C${idx + 1}` } }, idx + 1)
            }
          })
        }
      }
    }
  }
}

// 识别多态事件流表格中的错位行（如第 1 部分为血糖行，后续行以 `,饮食,品牌,克数,g,日期时间,备注,创建时间` 或 `,,,,体重,数值,日期时间,备注,创建时间` 排列）
const tryParseShiftedEventRow = (rawCells, catId) => {
  // 找到第一个非空单元格
  let firstIdx = -1
  for (let i = 0; i < rawCells.length; i++) {
    if (rawCells[i] !== '') {
      firstIdx = i
      break
    }
  }
  if (firstIdx === -1) return null

  const tag = rawCells[firstIdx]
  const rest = rawCells.slice(firstIdx + 1)

  // 判断一个字符串是否是完整日期时间（如 "2026-08-11 08:30:00"）
  const isDateTimeCell = (s) => Boolean(cleanDateStr(s) && cleanTimeStr(s))

  // 模式 A: 错位饮食行 `,饮食,小李子,150,g,2026-08-11 08:30:00,备注,2026-08-11 12:22:48`
  if (tag === '饮食' || tag === '进食' || tag === '喂食') {
    const dtIdx = rest.findIndex(isDateTimeCell)
    if (dtIdx === -1) return null
    const dateTimeRaw = rest[dtIdx]
    const recordDate = cleanDateStr(dateTimeRaw)
    const mealTime = cleanTimeStr(dateTimeRaw) || '12:00'

    let foodBrand = ''
    let foodGrams = 0
    for (let j = 0; j < dtIdx; j++) {
      const cellStr = rest[j]
      if (!cellStr || /^(g|克|ml|毫升)$/i.test(cellStr)) continue
      const num = parsePureNumber(cellStr)
      if (num !== null && /^\d+(\.\d+)?\s*(g|克)?$/i.test(cellStr)) {
        foodGrams = num
      } else if (!foodBrand) {
        foodBrand = cellStr
      }
    }

    // dtIdx 之后若有非日期时间的文本则为备注
    let note = ''
    for (let j = dtIdx + 1; j < rest.length; j++) {
      if (rest[j] && !isDateTimeCell(rest[j])) {
        note = rest[j]
        break
      }
    }

    return {
      type: 'meal',
      record: {
        cat_id: catId,
        food_grams: foodGrams,
        period: inferMealPeriod(mealTime),
        food_brand: foodBrand,
        extras: '',
        record_date: recordDate,
        meal_time: mealTime,
        note,
        createTime: makeTimestamp(recordDate, mealTime)
      }
    }
  }

  // 模式 B: 错位体重行 `,,,,体重,5.9,2026-08-02 15:32:00,,2026-08-02 15:32:07`
  if (tag === '体重' || tag === '称重') {
    const dtIdx = rest.findIndex(isDateTimeCell)
    if (dtIdx === -1) return null
    const dateTimeRaw = rest[dtIdx]
    const recordDate = cleanDateStr(dateTimeRaw)
    const measureTime = cleanTimeStr(dateTimeRaw) || '08:00'

    let weightVal = null
    for (let j = 0; j < dtIdx; j++) {
      const num = parseNumberWithUnit(rest[j])
      if (num !== null && num > 0 && num <= RECORD_BOUNDS.weight_records.max) {
        weightVal = num
        break
      }
    }
    if (weightVal === null) return null

    let note = ''
    for (let j = dtIdx + 1; j < rest.length; j++) {
      if (rest[j] && !isDateTimeCell(rest[j])) {
        note = rest[j]
        break
      }
    }

    return {
      type: 'weight',
      record: {
        cat_id: catId,
        weight_value: weightVal,
        record_date: recordDate,
        measure_time: measureTime,
        note,
        createTime: makeTimestamp(recordDate, measureTime)
      }
    }
  }

  // 模式 C: 错位打针/胰岛素行
  if (tag === '打针' || tag === '胰岛素' || tag === '注射') {
    const dtIdx = rest.findIndex(isDateTimeCell)
    if (dtIdx === -1) return null
    const dateTimeRaw = rest[dtIdx]
    const recordDate = cleanDateStr(dateTimeRaw)
    const injectTime = cleanTimeStr(dateTimeRaw) || '08:00'

    let doseVal = null
    let insulinType = '常用胰岛素'
    for (let j = 0; j < dtIdx; j++) {
      const cellStr = rest[j]
      if (!cellStr || /^(u|iu|单位)$/i.test(cellStr)) continue
      const num = parsePureNumber(cellStr)
      if (num !== null && /^\d+(\.\d+)?\s*(u|iu|单位)?$/i.test(cellStr) && num > 0 && num <= RECORD_BOUNDS.insulin_records.max) {
        doseVal = num
      } else if (cellStr) {
        insulinType = cellStr
      }
    }
    if (doseVal === null) return null

    let note = ''
    for (let j = dtIdx + 1; j < rest.length; j++) {
      if (rest[j] && !isDateTimeCell(rest[j])) {
        note = rest[j]
        break
      }
    }

    return {
      type: 'insulin',
      record: {
        cat_id: catId,
        dose: doseVal,
        period: injectTime < '12:00' ? '早针' : '晚针',
        dose_adjustment: '维持原量',
        insulin_type: insulinType,
        record_date: recordDate,
        inject_time: injectTime,
        note,
        createTime: makeTimestamp(recordDate, injectTime)
      }
    }
  }

  return null
}

// 提取单元格文本；当 ignoreMergedSubordinate 为 true 时，纵向/横向合并区域的从属单元格返回空字符串，防止按天合并的排泄等列被每行重复读取
const getCellText = (cell, options = {}) => {
  const { ignoreMergedSubordinate = false } = options
  if (!cell || cell.value === null || cell.value === undefined) return ''
  if (ignoreMergedSubordinate && cell.isMerged && cell.master && cell.master.address !== cell.address) {
    return ''
  }
  if (typeof cell.value === 'object') {
    if (cell.value.text !== undefined) return String(cell.value.text).trim()
    if (cell.value.result !== undefined) return String(cell.value.result).trim()
    if (Array.isArray(cell.value.richText)) {
      return cell.value.richText.map(rt => rt.text || '').join('').trim()
    }
    if (cell.value instanceof Date) {
      const d = cell.value
      if (d.getUTCFullYear() < 1901) {
        return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`
      }
      const y = d.getUTCFullYear()
      const m = String(d.getUTCMonth() + 1).padStart(2, '0')
      const date = String(d.getUTCDate()).padStart(2, '0')
      return `${y}-${m}-${date}`
    }
  }
  return String(cell.value).trim()
}

const compareRecordTime = (a, b) => {
  const tA = a.time || extractTimeStr(a)
  const tB = b.time || extractTimeStr(b)
  if (tA && tB && tA !== tB) return tA.localeCompare(tB)
  return (a.createTime || 0) - (b.createTime || 0)
}

const getPeriodColorArgb = (timing) => {
  if (!timing) return null
  if (timing.includes('早针')) return 'FFFFF2CC'
  if (timing.includes('5小时') || timing.includes('5h')) return 'FFD9E1F2'
  if (timing.includes('晚针')) return 'FFE2EFDA'
  if (timing.includes('空腹') || timing.includes('饭前') || timing.includes('餐前')) return 'FFFCE4D6'
  if (timing.includes('餐后') || timing.includes('饭后')) return 'FFFFF9D2'
  if (timing.includes('加测') || timing.includes('加针') || timing.includes('随机')) return 'FFEEDDFF'
  return null
}

// 序列化单日排泄记录文本（兼容单条汇总与同日多条记录）
const formatDayExcretionText = (group) => {
  const excretions = Array.isArray(group.excretions) ? [...group.excretions].sort(compareRecordTime) : []
  const lines = []

  if (excretions.length === 1) {
    const ex = excretions[0]
    if (ex.urine) lines.push(`尿: ${ex.urine}`)
    if (ex.stool_status) {
      lines.push(`便: ${ex.stool_status}${ex.stool_color ? `(${ex.stool_color})` : ''}`)
    }
  } else if (excretions.length > 1) {
    excretions.forEach(ex => {
      const tPrefix = ex.record_time ? `[${ex.record_time}] ` : ''
      const parts = []
      if (ex.urine) parts.push(`尿: ${ex.urine}`)
      if (ex.stool_status) {
        parts.push(`便: ${ex.stool_status}${ex.stool_color ? `(${ex.stool_color})` : ''}`)
      }
      if (parts.length > 0) {
        lines.push(`${tPrefix}${parts.join(' | ')}`)
      }
    })
  }

  // 兼容旧版附着在饮食或打针记录上的 urine 字段
  ;(group.meals || []).forEach(m => {
    if (m.urine && !lines.some(l => l.includes(m.urine))) {
      lines.push(`尿: ${m.urine}`)
    }
  })
  ;(group.insulins || []).forEach(i => {
    if (i.urine && !lines.some(l => l.includes(i.urine))) {
      lines.push(`尿: ${i.urine}`)
    }
  })

  return lines.join('\n')
}

// 解析排便文本中的状态与括号颜色，准确区分 '干硬颗粒 (轻度便秘)' 与 '(正常深褐色)'
const parseStoolPart = (rawStoolText) => {
  const text = String(rawStoolText || '').trim()
  if (!text) return { stoolStatus: '正常条状成型', stoolColor: '' }

  for (const knownStatus of KNOWN_STOOL_STATUSES) {
    if (text.startsWith(knownStatus)) {
      const rest = text.slice(knownStatus.length).trim()
      const colorMatch = rest.match(/^\((.+)\)$/) || rest.match(/^（(.+)）$/)
      return {
        stoolStatus: knownStatus,
        stoolColor: colorMatch ? colorMatch[1].trim() : ''
      }
    }
  }

  // 通用 `状态(颜色)` 拆分
  const genericMatch = text.match(/^(.+?)\(([^()]+)\)$/)
  if (genericMatch) {
    return {
      stoolStatus: genericMatch[1].trim(),
      stoolColor: genericMatch[2].trim()
    }
  }

  if (text.includes('软')) return { stoolStatus: '软便糊状', stoolColor: '' }
  if (text.includes('硬') || text.includes('干')) return { stoolStatus: '干硬颗粒 (轻度便秘)', stoolColor: '' }
  if (text.includes('泻') || text.includes('水')) return { stoolStatus: '水样腹泻', stoolColor: '' }
  if (text.includes('未排便')) return { stoolStatus: '未排便', stoolColor: '' }
  return { stoolStatus: text, stoolColor: '' }
}

const parseUrinePart = (rawUrineText) => {
  const text = String(rawUrineText || '').trim()
  if (!text) return '正常 (3~4团)'
  if (
    text === '正常 (3~4团)' ||
    text === '偏多 (>5团)' ||
    text === '偏少 (<2团)' ||
    text === '多饮多尿' ||
    text === '未排尿/未清理'
  ) {
    return text
  }
  if (text.includes('多饮多尿')) return '多饮多尿'
  if (text.includes('多') || text.includes('5')) return '偏多 (>5团)'
  if (text.includes('少') || text.includes('2')) return '偏少 (<2团)'
  if (text.includes('未排尿')) return '未排尿/未清理'
  return text
}

// 解析单元格中的排泄文本（同时支持临床导出结构化文本与用户手写自由文本）
const parseExcretionCell = (excretionVal, currentDate, fallbackTime, noteVal, catId) => {
  const raw = String(excretionVal || '').trim()
  if (!raw) return []

  const lines = raw.split(/\r?\n/).map(l => l.trim()).filter(Boolean)

  // 情况 1: 同日多条带时间前缀的结构化排泄记录 `[09:00] 尿: ... | 便: ...`
  if (lines.some(l => /^\[\d{1,2}:\d{2}(?::\d{2})?\]/.test(l))) {
    const results = []
    lines.forEach(line => {
      const timeMatch = line.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.+)$/)
      const exTime = timeMatch ? cleanTimeStr(timeMatch[1]) : (fallbackTime || '12:00')
      const content = timeMatch ? timeMatch[2] : line
      const segments = content.split('|').map(s => s.trim())
      let urine = '正常 (3~4团)'
      let stoolStatus = '正常条状成型'
      let stoolColor = ''

      segments.forEach(seg => {
        if (/^尿[:：]/.test(seg)) {
          urine = parseUrinePart(seg.replace(/^尿[:：]\s*/, ''))
        } else if (/^便[:：]/.test(seg)) {
          const parsedStool = parseStoolPart(seg.replace(/^便[:：]\s*/, ''))
          stoolStatus = parsedStool.stoolStatus
          stoolColor = parsedStool.stoolColor
        }
      })

      results.push({
        cat_id: catId,
        urine,
        stool_status: stoolStatus,
        stool_color: stoolColor,
        record_date: currentDate,
        record_time: exTime,
        note: noteVal || '',
        createTime: makeTimestamp(currentDate, exTime)
      })
    })
    return results
  }

  // 情况 2: 临床表标准结构化汇总 `尿: ...\n便: ...`
  const hasStructuredPrefix = lines.some(l => /^(尿|便)[:：]/.test(l))
  if (hasStructuredPrefix) {
    let urine = '正常 (3~4团)'
    let stoolStatus = '正常条状成型'
    let stoolColor = ''
    lines.forEach(line => {
      if (/^尿[:：]/.test(line)) {
        urine = parseUrinePart(line.replace(/^尿[:：]\s*/, ''))
      } else if (/^便[:：]/.test(line)) {
        const parsedStool = parseStoolPart(line.replace(/^便[:：]\s*/, ''))
        stoolStatus = parsedStool.stoolStatus
        stoolColor = parsedStool.stoolColor
      }
    })
    const exTime = fallbackTime || '12:00'
    return [{
      cat_id: catId,
      urine,
      stool_status: stoolStatus,
      stool_color: stoolColor,
      record_date: currentDate,
      record_time: exTime,
      note: noteVal || '',
      createTime: makeTimestamp(currentDate, exTime)
    }]
  }

  // 情况 3: 外部自由手写表格（如 "尿多，软便"）
  const exTime = fallbackTime || '12:00'
  let urine = '正常 (3~4团)'
  let stoolStatus = '正常条状成型'
  const stoolColor = ''

  if (raw.includes('多') || raw.includes('5')) urine = '偏多 (>5团)'
  if (raw.includes('少') || raw.includes('2')) urine = '偏少 (<2团)'
  if (raw.includes('多饮多尿')) urine = '多饮多尿'
  if (raw.includes('软')) stoolStatus = '软便糊状'
  if (raw.includes('硬') || raw.includes('干')) stoolStatus = '干硬颗粒 (轻度便秘)'
  if (raw.includes('泻') || raw.includes('水')) stoolStatus = '水样腹泻'

  return [{
    cat_id: catId,
    urine,
    stool_status: stoolStatus,
    stool_color: stoolColor,
    record_date: currentDate,
    record_time: exTime,
    note: `${raw}${noteVal ? `；${noteVal}` : ''}`,
    createTime: makeTimestamp(currentDate, exTime)
  }]
}

// 组合同行医疗备注与饮食备注，使用轻量标记避免导入时互相污染
const combineRowNotes = (medNote, mealNote, hasMed, hasMeal) => {
  const cleanMed = String(medNote || '').trim()
  const cleanMeal = String(mealNote || '').trim()
  if (hasMed && hasMeal) {
    if (cleanMed && cleanMeal) {
      if (cleanMed === cleanMeal) return cleanMed
      return `${cleanMed}；${MEAL_NOTE_TAG}${cleanMeal}`
    }
    if (cleanMeal) {
      return `${MEAL_NOTE_TAG}${cleanMeal}`
    }
    return cleanMed
  }
  return cleanMed || cleanMeal
}

// 拆分行备注为医疗备注与饮食备注
const splitRowNotes = (rawNote, hasMed, hasMeal) => {
  const text = String(rawNote || '').trim()
  if (!text || text === EMPTY_REPORT_NOTE) {
    return { medNote: '', mealNote: '' }
  }
  if (text.includes(MEAL_NOTE_TAG)) {
    const idx = text.indexOf(MEAL_NOTE_TAG)
    const medPart = text.slice(0, idx).replace(/[；;]\s*$/, '').trim()
    const mealPart = text.slice(idx + MEAL_NOTE_TAG.length).trim()
    return { medNote: medPart, mealNote: mealPart }
  }
  if (hasMed && !hasMeal) {
    return { medNote: text, mealNote: '' }
  }
  if (!hasMed && hasMeal) {
    return { medNote: '', mealNote: text }
  }
  return { medNote: text, mealNote: text }
}

const formatZhDate = (dStr) => {
  if (!dStr || !dStr.includes('-')) return dStr || ''
  const parts = dStr.split('-')
  const m = parseInt(parts[1], 10)
  const d = parseInt(parts[2], 10)
  return `${m}月${d}日`
}

const buildHumanFileName = (catName, sortedDates) => {
  let reportTitleName = '血糖报告'
  if (sortedDates.length > 0) {
    const startZh = formatZhDate(sortedDates[0])
    const endZh = formatZhDate(sortedDates[sortedDates.length - 1])
    if (sortedDates[0] === sortedDates[sortedDates.length - 1]) {
      reportTitleName = `${startZh}血糖报告`
    } else {
      reportTitleName = `${startZh}-${endZh}血糖报告`
    }
  }
  const prefix = (catName && catName !== '猫咪') ? `${catName}_` : ''
  return `${prefix}${reportTitleName}.xlsx`
}

// ==================== 导出构建器 (DomainRecords -> Buffer) ====================
const buildClinicalWorkbookBuffer = async ({
  catName = '猫咪',
  records = {},
  nowMs = Date.now(),
  WorkbookClass
} = {}) => {
  const {
    glucoses = [],
    insulins = [],
    meals = [],
    excretions = [],
    weights = []
  } = records

  const dayGroups = {}
  const ensureGroup = (dateKey) => {
    if (!dayGroups[dateKey]) {
      dayGroups[dateKey] = {
        dateStr: dateKey,
        glucoses: [],
        insulins: [],
        meals: [],
        excretions: [],
        weights: []
      }
    }
    return dayGroups[dateKey]
  }

  glucoses.forEach(item => ensureGroup(extractRecordDate(item)).glucoses.push(item))
  insulins.forEach(item => ensureGroup(extractRecordDate(item)).insulins.push(item))
  meals.forEach(item => ensureGroup(extractRecordDate(item)).meals.push(item))
  excretions.forEach(item => ensureGroup(extractRecordDate(item)).excretions.push(item))
  weights.forEach(item => ensureGroup(extractRecordDate(item)).weights.push(item))

  const sortedDates = Object.keys(dayGroups).sort((a, b) => a.localeCompare(b))

  const WorkbookCtor = resolveWorkbookClass(WorkbookClass)
  const workbook = new WorkbookCtor()
  workbook.creator = 'CatSugarDiary'
  workbook.created = new Date(nowMs)

  const worksheet = workbook.addWorksheet(`${catName}血糖记录表`, {
    views: [{ showGridLines: true }]
  })

  // 13 列临床标准表头（前 11 列位置与旧版完全一致，第 12 列为体重(kg)，第 13 列为备注）
  const headers = [
    '日期',
    '时效',
    '时间',
    '血糖 (耳血)',
    '打针剂量(u)',
    '剂量调整',
    '吃饭时间',
    '吃饭克数(g)',
    '尿量 / 排便',
    '罐头品牌/批次',
    '附带东西',
    '体重(kg)',
    '备注'
  ]
  const totalCols = headers.length

  const titleRow = worksheet.addRow([`${catName} 血糖与临床控糖就诊记录表`])
  titleRow.height = 36
  titleRow.font = { name: '微软雅黑', size: 16, bold: true, color: { argb: 'FF2C3E50' } }
  titleRow.alignment = { vertical: 'middle', horizontal: 'center' }
  worksheet.mergeCells(1, 1, 1, totalCols)
  titleRow.getCell(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFF4F6F7' }
  }

  const headerRow = worksheet.addRow(headers)
  headerRow.height = 28
  headerRow.font = { name: '微软雅黑', size: 11, bold: true, color: { argb: 'FF1A252F' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFD6DBDF' } },
    left: { style: 'thin', color: { argb: 'FFD6DBDF' } },
    bottom: { style: 'thin', color: { argb: 'FFD6DBDF' } },
    right: { style: 'thin', color: { argb: 'FFD6DBDF' } }
  }

  for (let c = 1; c <= totalCols; c++) {
    const cell = headerRow.getCell(c)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFEAECEE' }
    }
    cell.border = thinBorder
  }

  const colWidths = [14, 15, 11, 14, 14, 16, 12, 14, 20, 24, 24, 12, 32]
  colWidths.forEach((w, idx) => {
    worksheet.getColumn(idx + 1).width = w
  })

  let currentRowNumber = 3

  if (sortedDates.length === 0) {
    const todayStr = extractRecordDate({ createTime: nowMs })
    const emptyRow1 = worksheet.addRow([todayStr, '早针', '', null, null, '', '', null, '', '', '', null, EMPTY_REPORT_NOTE])
    const emptyRow2 = worksheet.addRow(['', '针后5小时', '', null, null, '', '', null, '', '', '', null, ''])
    const emptyRow3 = worksheet.addRow(['', '晚针', '', null, null, '', '', null, '', '', '', null, ''])
    const emptyRow4 = worksheet.addRow(['', '针后5小时', '', null, null, '', '', null, '', '', '', null, ''])

    worksheet.mergeCells(currentRowNumber, 1, currentRowNumber + 3, 1)
    worksheet.mergeCells(currentRowNumber, 9, currentRowNumber + 3, 9)

    for (let c = 2; c <= 6; c++) {
      emptyRow1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
      emptyRow2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      emptyRow3.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      emptyRow4.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
    }
  } else {
    sortedDates.forEach(dateKey => {
      const group = dayGroups[dateKey]
      const dayStartRow = currentRowNumber
      const dayExcretionText = formatDayExcretionText(group)

      // 1. 构建左侧医疗/体征事件列表 (血糖 / 打针 / 体重)，按真实时间升序排列
      const rawMedicalItems = []
      group.glucoses.forEach(g => {
        rawMedicalItems.push({
          type: 'glucose',
          time: g.measure_time || '',
          timing: g.period || g.status || '加测',
          bg: parsePureNumber(g.bg_value),
          dose: null,
          doseAdj: '',
          weight: null,
          note: g.note || '',
          createTime: g.createTime || 0
        })
      })

      group.insulins.forEach(ins => {
        rawMedicalItems.push({
          type: 'insulin',
          time: ins.inject_time || '',
          timing: ins.period || '注射',
          bg: null,
          dose: parsePureNumber(ins.dose),
          doseAdj: ins.dose_adjustment || '',
          weight: null,
          note: ins.note || '',
          createTime: ins.createTime || 0
        })
      })

      group.weights.forEach(w => {
        rawMedicalItems.push({
          type: 'weight',
          time: w.measure_time || '',
          timing: '',
          bg: null,
          dose: null,
          doseAdj: '',
          weight: parsePureNumber(w.weight_value),
          note: w.note || '',
          createTime: w.createTime || 0
        })
      })

      rawMedicalItems.sort(compareRecordTime)

      // 合并同一时间点且槽位不冲突的血糖、打针与体重记录
      const medicalRows = []
      rawMedicalItems.forEach(item => {
        const lastMed = medicalRows[medicalRows.length - 1]
        const canShareTime = lastMed && lastMed.time && lastMed.time === item.time
        const canShareTiming =
          canShareTime &&
          (!lastMed.timing || !item.timing || lastMed.timing === item.timing)
        const slotsDisjoint =
          canShareTiming &&
          (lastMed.bg === null || item.bg === null) &&
          (lastMed.dose === null || item.dose === null) &&
          (lastMed.weight === null || item.weight === null)

        if (slotsDisjoint) {
          if (!lastMed.timing && item.timing) lastMed.timing = item.timing
          if (item.bg !== null) lastMed.bg = item.bg
          if (item.dose !== null) {
            lastMed.dose = item.dose
            lastMed.doseAdj = item.doseAdj
          }
          if (item.weight !== null) lastMed.weight = item.weight
          if (item.note && !lastMed.note.includes(item.note)) {
            lastMed.note = lastMed.note ? `${lastMed.note}；${item.note}` : item.note
          }
        } else {
          medicalRows.push({ ...item })
        }
      })

      // 2. 构建右侧进食列表
      const mealRows = [...group.meals].sort(compareRecordTime).map(m => ({
        mealTime: m.meal_time || '',
        foodGrams: parsePureNumber(m.food_grams),
        foodBrand: m.food_brand || '',
        extras: m.extras || '',
        note: m.note || ''
      }))

      // 3. 计算当天行数：至少 4 行
      const totalDayRows = Math.max(4, medicalRows.length, mealRows.length)
      let previousTiming = ''

      for (let r = 0; r < totalDayRows; r++) {
        const med = medicalRows[r] || null
        const meal = mealRows[r] || null

        let displayTiming = ''
        let effectiveTimingForColor = ''

        if (med && med.timing) {
          effectiveTimingForColor = med.timing
          if (med.timing === previousTiming) {
            displayTiming = '' // 相邻相同时效留白，解析器会自动向下继承
          } else {
            displayTiming = med.timing
            previousTiming = med.timing
          }
        } else if (r < 4 && medicalRows.length === 0) {
          const defaultSlots = ['早针', '针后5小时', '晚针', '针后5小时']
          displayTiming = defaultSlots[r]
          effectiveTimingForColor = defaultSlots[r]
          previousTiming = displayTiming
        } else {
          displayTiming = ''
        }

        const hasMed = Boolean(med && (med.bg !== null || med.dose !== null || med.weight !== null))
        const hasMeal = Boolean(meal && (meal.foodGrams !== null || meal.foodBrand))
        const combinedNote = combineRowNotes(
          med ? med.note : '',
          meal ? meal.note : '',
          hasMed,
          hasMeal
        )

        const bgVal = (med && med.bg !== null) ? med.bg : null
        const doseVal = (med && med.dose !== null) ? med.dose : null
        const foodGramsVal = (meal && meal.foodGrams !== null) ? meal.foodGrams : null
        const weightVal = (med && med.weight !== null) ? med.weight : null

        const rowData = [
          r === 0 ? dateKey : '',            // Col 1: 日期
          displayTiming,                     // Col 2: 时效
          med ? med.time : '',               // Col 3: 时间
          bgVal,                             // Col 4: 血糖 (耳血)
          doseVal,                           // Col 5: 打针剂量(u)
          med ? med.doseAdj : '',            // Col 6: 剂量调整
          meal ? meal.mealTime : '',         // Col 7: 吃饭时间
          foodGramsVal,                      // Col 8: 吃饭克数(g)
          r === 0 ? dayExcretionText : '',   // Col 9: 尿量 / 排便 (仅首行赋值，纵向合并)
          meal ? meal.foodBrand : '',        // Col 10: 罐头品牌/批次
          meal ? meal.extras : '',           // Col 11: 附带东西
          weightVal,                         // Col 12: 体重(kg)
          combinedNote                       // Col 13: 备注
        ]

        const addedRow = worksheet.addRow(rowData)
        addedRow.height = 24
        addedRow.font = { name: '微软雅黑', size: 10, color: { argb: 'FF2C3E50' } }
        addedRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

        if (bgVal !== null) addedRow.getCell(4).numFmt = '0.0'
        if (doseVal !== null) addedRow.getCell(5).numFmt = '0.00'
        if (foodGramsVal !== null) addedRow.getCell(8).numFmt = '0.0'
        if (weightVal !== null) addedRow.getCell(12).numFmt = '0.00'

        const colorArgb = getPeriodColorArgb(effectiveTimingForColor)
        if (colorArgb) {
          for (let c = 2; c <= 6; c++) {
            addedRow.getCell(c).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: colorArgb }
            }
          }
        }

        for (let c = 1; c <= totalCols; c++) {
          addedRow.getCell(c).border = thinBorder
        }
      }

      const dayEndRow = dayStartRow + totalDayRows - 1
      if (totalDayRows > 1) {
        worksheet.mergeCells(dayStartRow, 1, dayEndRow, 1)
        worksheet.mergeCells(dayStartRow, 9, dayEndRow, 9)
      }

      currentRowNumber = dayEndRow + 1
    })
  }

  const buffer = await workbook.xlsx.writeBuffer()
  const fileName = buildHumanFileName(catName, sortedDates)

  return {
    buffer,
    fileName,
    sortedDates
  }
}

// ==================== 导入解析器 (Buffer -> DomainRecords) ====================
const parseClinicalWorkbookBuffer = async (buffer, { catId = 'default', WorkbookClass } = {}) => {
  let worksheet = null

  // 自动识别 .xlsx (ZIP) / 进程内测试 JSON / CSV 文本流，若 ZIP 解析失败则自动降级尝试 CSV 解析
  if (isZipBuffer(buffer) || isInMemoryJsonBuffer(buffer)) {
    try {
      const WorkbookCtor = resolveWorkbookClass(WorkbookClass)
      const workbook = new WorkbookCtor()
      await workbook.xlsx.load(buffer)
      worksheet = workbook.worksheets[0]
    } catch (zipErr) {
      const csvText = decodeCsvBufferToString(buffer)
      const csvRows = parseCsvTextToRows(csvText)
      if (csvRows.length > 0) {
        worksheet = buildCsvWorksheetStandIn(csvRows)
      } else {
        throw zipErr
      }
    }
  } else {
    const csvText = decodeCsvBufferToString(buffer)
    const csvRows = parseCsvTextToRows(csvText)
    if (csvRows.length > 0) {
      worksheet = buildCsvWorksheetStandIn(csvRows)
    }
  }

  if (!worksheet) {
    throw new Error('Excel / CSV 文件中未找到有效的工作表')
  }

  // 1. 扫描前 15 行，智能定位表头行
  let headerRowIndex = -1
  let colMap = {}

  for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
    const row = worksheet.getRow(r)
    let matches = 0
    const tempMap = {}

    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const text = getCellText(cell)
      const matchedType = matchHeaderType(text)
      if (matchedType && !Object.values(tempMap).includes(matchedType)) {
        tempMap[colNumber] = matchedType
        matches++
      }
    })

    if (matches >= 2 && matches > Object.keys(colMap).length) {
      headerRowIndex = r
      colMap = tempMap
    }
  }

  if (headerRowIndex === -1 || Object.keys(colMap).length === 0) {
    throw new Error('未能自动识别表格表头，请确保表格中包含“日期”、“血糖”、“打针/剂量”或“进食/克数”等列标题。')
  }

  // 2. 逐行解析数据
  const glucoses = []
  const insulins = []
  const meals = []
  const excretions = []
  const weights = []

  let currentDate = ''
  let currentFoodBrand = ''
  let currentTiming = ''

  for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
    const row = worksheet.getRow(r)
    if (!row || row.cellCount === 0) continue

    // 提取整行原始单元格文本，用于检测多态错位事件行（如其他 App 导出的混合 CSV）
    const rawCells = []
    for (let c = 1; c <= Math.max(row.cellCount, 12); c++) {
      rawCells.push(getCellText(row.getCell(c)))
    }
    const shiftedEvent = tryParseShiftedEventRow(rawCells, catId)
    if (shiftedEvent) {
      if (shiftedEvent.type === 'meal') meals.push(shiftedEvent.record)
      else if (shiftedEvent.type === 'weight') weights.push(shiftedEvent.record)
      else if (shiftedEvent.type === 'insulin') insulins.push(shiftedEvent.record)
      continue
    }

    const rowValues = {}
    for (const [colNum, colKey] of Object.entries(colMap)) {
      const cell = row.getCell(parseInt(colNum, 10))
      // 日期列允许读取或向下继承，其余数据列忽略纵向合并的从属单元格，防止合并排泄/备注列被重复提取
      const ignoreMergedSubordinate = colKey !== 'date'
      rowValues[colKey] = getCellText(cell, { ignoreMergedSubordinate })
    }

    const hasContent = Object.values(rowValues).some(v => Boolean(v))
    if (!hasContent) continue

    // 日期解析与向下继承（同时支持独立日期列以及合并在测量时间/进食时间/创建时间中的 YYYY-MM-DD HH:mm:ss）
    const parsedDate =
      cleanDateStr(rowValues.date) ||
      cleanDateStr(rowValues.time) ||
      cleanDateStr(rowValues.mealTime) ||
      cleanDateStr(rowValues.createTime)

    if (parsedDate) {
      if (parsedDate !== currentDate) {
        currentFoodBrand = ''
        currentTiming = ''
      }
      currentDate = parsedDate
    }

    if (!currentDate) continue

    if (rowValues.foodBrand) {
      currentFoodBrand = rowValues.foodBrand
    }

    const bgVal = parseNumberWithUnit(rowValues.glucose)
    const doseVal = parseNumberWithUnit(rowValues.dose)
    const foodGramsVal = parseNumberWithUnit(rowValues.foodGrams)
    const weightVal = parseNumberWithUnit(rowValues.weight)

    const hasValidBg = bgVal !== null && bgVal > RECORD_BOUNDS.blood_glucose.minExclusive && bgVal <= RECORD_BOUNDS.blood_glucose.max
    const hasValidDose = doseVal !== null && doseVal > RECORD_BOUNDS.insulin_records.minExclusive && doseVal <= RECORD_BOUNDS.insulin_records.max
    const hasValidWeight = weightVal !== null && weightVal > RECORD_BOUNDS.weight_records.minExclusive && weightVal <= RECORD_BOUNDS.weight_records.max
    const hasValidMeal =
      (foodGramsVal !== null && foodGramsVal >= RECORD_BOUNDS.meal_records.min && foodGramsVal <= RECORD_BOUNDS.meal_records.max && (foodGramsVal > 0 || Boolean(rowValues.foodBrand))) ||
      Boolean(rowValues.foodBrand && foodGramsVal === null)

    // 时效向下继承（兼容临床导出表相邻相同时效留白）
    if (rowValues.timing) {
      currentTiming = rowValues.timing
    }
    const effectiveTiming = rowValues.timing || currentTiming || ''

    const hasMedOnRow = hasValidBg || hasValidDose || hasValidWeight
    const { medNote, mealNote } = splitRowNotes(rowValues.note, hasMedOnRow, hasValidMeal)

    // (1) 血糖记录
    if (hasValidBg) {
      const bgTime = cleanTimeStr(rowValues.time) || '08:00'
      const period = effectiveTiming || (bgTime < '12:00' ? '早针' : '晚针')
      glucoses.push({
        cat_id: catId,
        bg_value: bgVal,
        period,
        status: period,
        record_date: currentDate,
        measure_time: bgTime,
        note: medNote,
        createTime: makeTimestamp(currentDate, bgTime)
      })
    }

    // (2) 打针记录
    if (hasValidDose) {
      const insTime = cleanTimeStr(rowValues.time) || '08:00'
      let insPeriod = '早针'
      if (effectiveTiming) {
        insPeriod = effectiveTiming.includes('晚') ? '晚针' : (effectiveTiming.includes('早') ? '早针' : effectiveTiming)
      } else {
        insPeriod = insTime < '12:00' ? '早针' : '晚针'
      }
      insulins.push({
        cat_id: catId,
        dose: doseVal,
        period: insPeriod,
        dose_adjustment: rowValues.doseAdj || '维持原量',
        insulin_type: rowValues.insulinType || '常用胰岛素',
        record_date: currentDate,
        inject_time: insTime,
        note: medNote,
        createTime: makeTimestamp(currentDate, insTime)
      })
    }

    // (3) 饮食记录
    if (hasValidMeal) {
      const foodBrandVal = rowValues.foodBrand || currentFoodBrand || ''
      const extrasVal = rowValues.extras || ''
      const mealTime = cleanTimeStr(rowValues.mealTime) || cleanTimeStr(rowValues.time) || '12:00'
      const mPeriod = inferMealPeriod(mealTime)

      meals.push({
        cat_id: catId,
        food_grams: foodGramsVal || 0,
        period: mPeriod,
        food_brand: foodBrandVal,
        extras: extrasVal,
        record_date: currentDate,
        meal_time: mealTime,
        note: mealNote,
        createTime: makeTimestamp(currentDate, mealTime)
      })
    }

    // (4) 排泄记录（合并单元格仅在首行触发一次）
    if (rowValues.excretion) {
      const exFallbackTime = cleanTimeStr(rowValues.time) || '12:00'
      const exNote = (!hasMedOnRow && !hasValidMeal) ? medNote : ''
      const parsedExcretions = parseExcretionCell(rowValues.excretion, currentDate, exFallbackTime, exNote, catId)
      excretions.push(...parsedExcretions)
    }

    // (5) 体重记录
    if (hasValidWeight) {
      const wTime = cleanTimeStr(rowValues.time) || '08:00'
      weights.push({
        cat_id: catId,
        weight_value: weightVal,
        record_date: currentDate,
        measure_time: wTime,
        note: (!hasValidBg && !hasValidDose) ? medNote : '',
        createTime: makeTimestamp(currentDate, wTime)
      })
    }
  }

  // 3. 统计日期区间（涵盖全部 5 类记录）
  const allDates = [
    ...glucoses.map(g => g.record_date),
    ...insulins.map(i => i.record_date),
    ...meals.map(m => m.record_date),
    ...excretions.map(e => e.record_date),
    ...weights.map(w => w.record_date)
  ].filter(Boolean).sort()

  const startDate = allDates.length > 0 ? allDates[0] : ''
  const endDate = allDates.length > 0 ? allDates[allDates.length - 1] : ''

  // 4. 构造前 6 条预览样本列表
  const previewList = []
  const maxPreview = 6
  for (let i = 0; i < Math.min(maxPreview, glucoses.length); i++) {
    const g = glucoses[i]
    const matchedIns = insulins.find(ins => ins.record_date === g.record_date && ins.inject_time === g.measure_time)
    const matchedMeal = meals.find(m => m.record_date === g.record_date)
    previewList.push({
      date: g.record_date,
      time: g.measure_time,
      timing: g.period,
      bg: g.bg_value,
      dose: matchedIns ? matchedIns.dose : '-',
      food: matchedMeal ? (matchedMeal.food_brand || `${matchedMeal.food_grams}g`) : '-'
    })
  }

  return {
    summary: {
      glucoseCount: glucoses.length,
      insulinCount: insulins.length,
      mealCount: meals.length,
      excretionCount: excretions.length,
      weightCount: weights.length,
      startDate,
      endDate
    },
    previewList,
    parsedData: {
      glucoses,
      insulins,
      meals,
      excretions,
      weights
    }
  }
}

module.exports = {
  HEADER_KEYWORD_MAP,
  matchHeaderType,
  getCellText,
  getPeriodColorArgb,
  buildHumanFileName,
  buildClinicalWorkbookBuffer,
  parseClinicalWorkbookBuffer
}
