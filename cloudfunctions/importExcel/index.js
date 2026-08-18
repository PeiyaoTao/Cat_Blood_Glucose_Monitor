// 云函数入口文件: 智能 Excel 历史数据解析与批量导入引擎
const cloud = require('wx-server-sdk')
const ExcelJS = require('exceljs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// ==================== 辅助数据清洗与格式转换函数 ====================

// 1. 提取单元格真实文本内容（兼容公式、富文本、超链接）
const getCellText = (cell) => {
  if (!cell || cell.value === null || cell.value === undefined) return ''
  if (typeof cell.value === 'object') {
    if (cell.value.text) return String(cell.value.text).trim()
    if (cell.value.result) return String(cell.value.result).trim()
    if (cell.value.richText) {
      return cell.value.richText.map(rt => rt.text || '').join('').trim()
    }
    if (cell.value instanceof Date) {
      // ExcelJS 将日期单元格转为了 Date 对象
      const d = cell.value
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const date = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${date}`
    }
  }
  return String(cell.value).trim()
}

// 2. 清洗并标准化日期格式为 YYYY-MM-DD
const cleanDateStr = (raw) => {
  if (!raw) return ''
  const str = String(raw).trim()
  
  // 匹配标准 YYYY-MM-DD 或 YYYY/MM/DD 或 YYYY.MM.DD
  const m1 = str.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
  if (m1) {
    const y = m1[1]
    const m = m1[2].padStart(2, '0')
    const d = m1[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  
  // 匹配 M月D日 或 MM-DD 或 MM/DD (默认补充今年年份)
  const currentYear = new Date().getFullYear()
  const m2 = str.match(/^(\d{1,2})[月/-](\d{1,2})(?:日)?/)
  if (m2) {
    const m = m2[1].padStart(2, '0')
    const d = m2[2].padStart(2, '0')
    return `${currentYear}-${m}-${d}`
  }

  // 匹配 Excel 序列号日期 (如 45521)
  const num = parseFloat(str)
  if (!isNaN(num) && num > 30000 && num < 60000) {
    // Excel base date 1899-12-30
    const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000))
    const y = dateObj.getUTCFullYear()
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0')
    const d = String(dateObj.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return ''
}

// 3. 清洗并标准化时间格式为 HH:mm
const cleanTimeStr = (raw) => {
  if (!raw) return ''
  const str = String(raw).trim()

  // 匹配 HH:mm 或 HH:mm:ss
  const m1 = str.match(/(\d{1,2}):(\d{1,2})(?::\d{1,2})?/)
  if (m1) {
    const h = m1[1].padStart(2, '0')
    const min = m1[2].padStart(2, '0')
    return `${h}:${min}`
  }

  // 匹配 "7点30" 或 "下午3点" 或 "7点"
  const m2 = str.match(/(\d{1,2})点(?:(\d{1,2})分?)?/)
  if (m2) {
    let h = parseInt(m2[1], 10)
    if (str.includes('下午') || str.includes('晚')) {
      if (h < 12) h += 12
    }
    const hStr = String(h).padStart(2, '0')
    const minStr = (m2[2] || '0').padStart(2, '0')
    return `${hStr}:${minStr}`
  }

  // 匹配 Excel 小数时间 (0.3125 代表 07:30)
  const num = parseFloat(str)
  if (!isNaN(num) && num > 0 && num < 1) {
    const totalSecs = Math.round(num * 86400)
    const h = String(Math.floor(totalSecs / 3600)).padStart(2, '0')
    const min = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, '0')
    return `${h}:${min}`
  }

  return ''
}

// 4. 从文本中提取纯浮点数值（过滤 'mmol/L', 'u', 'g', 'kg' 等单位）
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

// 5. 根据日期和时分构造本地时间戳 (UTC+8)
const makeTimestamp = (dateStr, timeStr) => {
  if (!dateStr) return Date.now()
  const parts = dateStr.split('-').map(Number)
  const y = parts[0]
  const m = parts[1] - 1
  const d = parts[2]
  let h = 0
  let min = 0
  if (timeStr && timeStr.includes(':')) {
    const tParts = timeStr.split(':').map(Number)
    h = tParts[0] || 0
    min = tParts[1] || 0
  }
  return new Date(y, m, d, h, min, 0).getTime()
}

// ==================== 模糊表头匹配字典 ====================
const HEADER_KEYWORD_MAP = {
  date: ['日期', 'date', 'day', '记录日期', '测量日期'],
  mealTime: ['吃饭时间', '进食时间', '用餐时间', '喂食时间', '进食时刻', '吃饭时刻'],
  foodGrams: ['吃饭克数(g)', '吃饭克数', '进食克数', '克数', '食量', '喂食量', '罐头克数', '进食量', '餐量', 'food', 'grams'],
  foodBrand: ['罐头品牌/批次', '罐头品牌', '罐头', '品牌', '批次', '猫粮', '主食', 'brand', 'diet'],
  totalFood: ['总量', '总克数', '总食量', '合计', 'total'],
  doseAdj: ['剂量选择', '剂量调整', '调整', '增减', '加减', 'adjustment'],
  dose: ['打针剂量(u)', '打针剂量', '打针', '剂量', '胰岛素', '注射', 'dose', 'insulin', '用量', '单位'],
  glucose: ['血糖', '耳血', '数值', 'bg', 'glu', 'blood glucose', '血糖值', 'mmol'],
  timing: ['时效', '阶段', '针次', '时段', '时点', 'period', 'stage'],
  time: ['时间', 'time', '时刻', '时分', '测糖时间', '注射时间', '测量时间'],
  extras: ['附带东西', '附带', '加料', '补剂', '用药', '营养品', 'extras', 'supplements'],
  excretion: ['尿量', '排便', '尿量 / 排便', '排泄', '便便', '粪便', '尿', '便', 'urine', 'stool'],
  weight: ['体重', '称重', 'weight', 'kg', '斤'],
  note: ['备注', '说明', 'note', 'notes', '情况', '症状', '精神', '护理']
}

// 检测某一列文本与字典的匹配度得分（优先全等精准匹配，其次按最长关键词匹配，杜绝“时间”误拦截“吃饭时间”）
const matchHeaderType = (headerText) => {
  if (!headerText) return null
  const text = String(headerText).toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '')
  
  // 1. 第一优先级：全等精准匹配 (Exact Match)
  for (const [colKey, keywords] of Object.entries(HEADER_KEYWORD_MAP)) {
    for (const kw of keywords) {
      const cleanKw = kw.toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '')
      if (text === cleanKw) {
        return colKey
      }
    }
  }

  // 2. 第二优先级：按关键词长度降序排序后进行包含匹配 (Longest Substring Match)
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

// ==================== 云函数主入口 ====================
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, fileID, catId = 'default', parsedData, skipDuplicates = true } = event

  try {
    // -------------------------------------------------------------
    // ACTION 1: 解析文件 (PARSE)
    // -------------------------------------------------------------
    if (action === 'parse') {
      if (!fileID) {
        return { code: -1, msg: '未提供文件 fileID' }
      }

      // 1. 从云存储下载文件 Buffer
      const downloadRes = await cloud.downloadFile({ fileID })
      const buffer = downloadRes.fileContent

      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(buffer)

      const worksheet = workbook.worksheets[0]
      if (!worksheet) {
        return { code: -1, msg: 'Excel 文件中未找到有效的工作表' }
      }

      // 2. 扫描前 15 行，智能定位表头行
      let headerRowIndex = -1
      let colMap = {} // { colIndex: 'date' | 'glucose' | 'dose' ... }

      for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
        const row = worksheet.getRow(r)
        let matches = 0
        let tempMap = {}

        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const text = getCellText(cell)
          const matchedType = matchHeaderType(text)
          if (matchedType && !Object.values(tempMap).includes(matchedType)) {
            tempMap[colNumber] = matchedType
            matches++
          }
        })

        // 只要一行中识别出至少 2 个核心关键字（如：日期+血糖 或 血糖+打针 等），即认定为表头行
        if (matches >= 2 && matches > Object.keys(colMap).length) {
          headerRowIndex = r
          colMap = tempMap
        }
      }

      if (headerRowIndex === -1 || Object.keys(colMap).length === 0) {
        return {
          code: -1,
          msg: '未能自动识别表格表头，请确保表格中包含“日期”、“血糖”、“打针/剂量”或“进食/克数”等列标题。'
        }
      }

      // 3. 逐行解析数据
      const glucoses = []
      const insulins = []
      const meals = []
      const excretions = []
      const weights = []

      let currentDate = '' // 用于向下继承纵向合并的日期
      let currentFoodBrand = '' // 用于向下继承纵向合并的罐头品牌

      for (let r = headerRowIndex + 1; r <= worksheet.rowCount; r++) {
        const row = worksheet.getRow(r)
        if (!row || row.cellCount === 0) continue

        const rowValues = {}
        for (const [colNum, colKey] of Object.entries(colMap)) {
          const cell = row.getCell(parseInt(colNum, 10))
          rowValues[colKey] = getCellText(cell)
        }

        // 判断本行是否全空
        const hasContent = Object.values(rowValues).some(v => Boolean(v))
        if (!hasContent) continue

        // 日期解析与向下继承
        const rawDate = rowValues.date
        const parsedDate = cleanDateStr(rawDate)
        if (parsedDate) {
          if (parsedDate !== currentDate) {
            currentFoodBrand = '' // 切换新日期时重置
          }
          currentDate = parsedDate
        }

        // 罐头品牌向下继承
        if (rowValues.foodBrand) {
          currentFoodBrand = rowValues.foodBrand
        }

        // 若当前仍无有效日期，无法建立时间索引，跳过该行
        if (!currentDate) continue

        const timingVal = rowValues.timing || ''
        const noteVal = rowValues.note || ''

        // (1) 提取血糖记录
        const bgVal = parseNumberWithUnit(rowValues.glucose)
        if (bgVal !== null && bgVal > 0 && bgVal <= 100) {
          const bgTime = cleanTimeStr(rowValues.time) || '08:00'
          glucoses.push({
            cat_id: catId,
            bg_value: bgVal,
            period: timingVal || (bgTime < '12:00' ? '早针' : '晚针'),
            status: timingVal || (bgTime < '12:00' ? '早针' : '晚针'),
            record_date: currentDate,
            measure_time: bgTime,
            note: noteVal,
            createTime: makeTimestamp(currentDate, bgTime)
          })
        }

        // (2) 提取打针记录
        const doseVal = parseNumberWithUnit(rowValues.dose)
        if (doseVal !== null && doseVal > 0 && doseVal <= 50) {
          const insTime = cleanTimeStr(rowValues.time) || '08:00'
          insulins.push({
            cat_id: catId,
            dose: doseVal,
            period: timingVal.includes('晚') ? '晚针' : '早针',
            dose_adjustment: rowValues.doseAdj || '维持原量',
            insulin_type: rowValues.insulinType || '常用胰岛素',
            record_date: currentDate,
            inject_time: insTime,
            note: noteVal,
            createTime: makeTimestamp(currentDate, insTime)
          })
        }

        // (3) 提取饮食记录
        const foodGramsVal = parseNumberWithUnit(rowValues.foodGrams)
        const foodBrandVal = rowValues.foodBrand || currentFoodBrand || ''
        const extrasVal = rowValues.extras || ''
        if (foodGramsVal !== null || (rowValues.foodBrand && !foodGramsVal)) {
          const mealTime = cleanTimeStr(rowValues.mealTime) || cleanTimeStr(rowValues.time) || '12:00'
          const h = parseInt(mealTime.split(':')[0], 10)
          let mPeriod = '加餐'
          if (h >= 6 && h < 11) mPeriod = '早餐'
          else if (h >= 11 && h < 15) mPeriod = '午餐'
          else if (h >= 15 && h < 21) mPeriod = '晚餐'
          else mPeriod = '夜宵'

          meals.push({
            cat_id: catId,
            food_grams: foodGramsVal || 0,
            period: mPeriod,
            food_brand: foodBrandVal,
            extras: extrasVal,
            record_date: currentDate,
            meal_time: mealTime,
            note: noteVal,
            createTime: makeTimestamp(currentDate, mealTime)
          })
        }

        // (4) 提取排泄记录
        const excretionVal = rowValues.excretion || ''
        if (excretionVal) {
          const exTime = cleanTimeStr(rowValues.time) || '12:00'
          let urine = '正常 (3~4团)'
          let stoolStatus = '正常条状成型'
          let stoolColor = ''

          if (excretionVal.includes('多') || excretionVal.includes('5')) urine = '偏多 (>5团)'
          if (excretionVal.includes('少') || excretionVal.includes('2')) urine = '偏少 (<2团)'
          if (excretionVal.includes('多饮多尿')) urine = '多饮多尿'
          if (excretionVal.includes('软')) stoolStatus = '软便糊状'
          if (excretionVal.includes('硬') || excretionVal.includes('干')) stoolStatus = '干硬颗粒 (轻度便秘)'
          if (excretionVal.includes('泻') || excretionVal.includes('水')) stoolStatus = '水样腹泻'

          excretions.push({
            cat_id: catId,
            urine,
            stool_status: stoolStatus,
            stool_color: stoolColor,
            record_date: currentDate,
            record_time: exTime,
            note: `${excretionVal}${noteVal ? `；${noteVal}` : ''}`,
            createTime: makeTimestamp(currentDate, exTime)
          })
        }

        // (5) 提取体重记录
        const weightVal = parseNumberWithUnit(rowValues.weight)
        if (weightVal !== null && weightVal > 0 && weightVal <= 30) {
          const wTime = cleanTimeStr(rowValues.time) || '08:00'
          weights.push({
            cat_id: catId,
            weight_value: weightVal,
            record_date: currentDate,
            measure_time: wTime,
            note: noteVal,
            createTime: makeTimestamp(currentDate, wTime)
          })
        }
      }

      // 4. 统计日期区间与总览
      const allDates = [
        ...glucoses.map(g => g.record_date),
        ...insulins.map(i => i.record_date),
        ...meals.map(m => m.record_date)
      ].sort()

      const startDate = allDates.length > 0 ? allDates[0] : ''
      const endDate = allDates.length > 0 ? allDates[allDates.length - 1] : ''

      // 构造前 6 条预览样本列表
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
        code: 0,
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

    // -------------------------------------------------------------
    // ACTION 2: 确认批量写入 (IMPORT)
    // -------------------------------------------------------------
    else if (action === 'import') {
      if (!parsedData) {
        return { code: -1, msg: '缺少待导入的数据集' }
      }

      const { glucoses = [], insulins = [], meals = [], excretions = [], weights = [] } = parsedData

      let importedCounts = {
        glucose: 0,
        insulin: 0,
        meal: 0,
        excretion: 0,
        weight: 0
      }
      let skippedCount = 0

      // 辅助函数：批量安全写入（分批并发，每批 20 条）
      const batchInsert = async (collectionName, items, typeKey, dedupeKeyGen) => {
        if (!items || items.length === 0) return

        // 若开启去重，先拉取已有记录建立查重索引
        let existingSet = new Set()
        if (skipDuplicates) {
          try {
            const existingRes = await db.collection(collectionName)
              .where({ cat_id: catId })
              .limit(1000)
              .get()
            if (existingRes.data) {
              existingRes.data.forEach(rec => {
                existingSet.add(dedupeKeyGen(rec))
              })
            }
          } catch (e) {
            console.log(`Fetch existing ${collectionName} warning:`, e.message)
          }
        }

        const toInsert = []
        for (const item of items) {
          const key = dedupeKeyGen(item)
          if (skipDuplicates && existingSet.has(key)) {
            skippedCount++
          } else {
            toInsert.push(item)
            existingSet.add(key) // 防止本次导入内自身重复
          }
        }

        const BATCH_SIZE = 20
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE)
          await Promise.all(batch.map(doc => db.collection(collectionName).add({ data: doc })))
          importedCounts[typeKey] += batch.length
        }
      }

      // 辅助函数：提取标准规范化的查重键
      const getDedupeDate = (doc) => {
        if (doc.record_date) return cleanDateStr(doc.record_date)
        if (doc.createTime) {
          const d = new Date(doc.createTime)
          const y = d.getFullYear()
          const m = String(d.getMonth() + 1).padStart(2, '0')
          const date = String(d.getDate()).padStart(2, '0')
          return `${y}-${m}-${date}`
        }
        return ''
      }

      const getDedupeTime = (doc) => {
        const raw = doc.measure_time || doc.inject_time || doc.meal_time || doc.record_time || ''
        if (raw) return cleanTimeStr(raw)
        if (doc.createTime) {
          const d = new Date(doc.createTime)
          const h = String(d.getHours()).padStart(2, '0')
          const min = String(d.getMinutes()).padStart(2, '0')
          return `${h}:${min}`
        }
        return ''
      }

      // 执行各集合批量写入
      await batchInsert('blood_glucose', glucoses, 'glucose', doc => `${getDedupeDate(doc)}_${getDedupeTime(doc)}_${parseFloat(doc.bg_value || 0).toFixed(1)}`)
      await batchInsert('insulin_records', insulins, 'insulin', doc => `${getDedupeDate(doc)}_${getDedupeTime(doc)}_${parseFloat(doc.dose || 0).toFixed(2)}`)
      await batchInsert('meal_records', meals, 'meal', doc => `${getDedupeDate(doc)}_${getDedupeTime(doc)}_${parseFloat(doc.food_grams || 0).toFixed(0)}_${doc.food_brand || ''}`)
      await batchInsert('excretion_records', excretions, 'excretion', doc => `${getDedupeDate(doc)}_${getDedupeTime(doc)}_${doc.urine || ''}`)
      await batchInsert('weight_records', weights, 'weight', doc => `${getDedupeDate(doc)}_${parseFloat(doc.weight_value || 0).toFixed(2)}`)

      // 清理临时上传的 Excel 文件
      if (fileID) {
        try {
          await cloud.deleteFile({ fileList: [fileID] })
        } catch (e) {
          console.log('Clean temp file err:', e.message)
        }
      }

      return {
        code: 0,
        importedCounts,
        skippedCount,
        totalImported: Object.values(importedCounts).reduce((a, b) => a + b, 0)
      }
    }

    return { code: -1, msg: `未知 action: ${action}` }

  } catch (err) {
    console.error('Import Excel Error:', err)
    return { code: -1, msg: err.message || '导入解析异常' }
  }
}
