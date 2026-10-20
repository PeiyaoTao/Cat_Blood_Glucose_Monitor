import { callApi, callCloudFunction, markDataDirty } from './api'
import { useCatSession } from '@/composables/useCatSession'

export interface ImportSummary {
  glucoseCount: number
  insulinCount: number
  mealCount: number
  excretionCount: number
  weightCount: number
  duplicateCount?: number
  startDate: string
  endDate: string
}

export interface ImportPreviewItem {
  date: string
  time: string
  timing: string
  bg: number
  dose: number | string
  food: string
}

export interface ImportParseResponse {
  code: number
  msg?: string
  fileID?: string
  summary: ImportSummary
  previewList: ImportPreviewItem[]
  parsedData?: Record<string, any[]>
}

export interface ImportCommitResponse {
  code: number
  msg?: string
  batchId?: string
  importedAt?: number
  fileName?: string
  importedCounts: {
    glucose: number
    insulin: number
    meal: number
    excretion: number
    weight: number
  }
  skippedCount: number
  totalImported: number
}

export interface ImportBatchRecordRef {
  type: 'blood_glucose' | 'insulin_records' | 'meal_records' | 'excretion_records' | 'weight_records'
  id: string
}

export interface ImportBatchItem {
  batchId: string
  fileName: string
  importedAt: number
  counts: {
    glucose: number
    insulin: number
    meal: number
    excretion: number
    weight: number
  }
  totalCount: number
  startDate: string
  endDate: string
  recordRefs?: ImportBatchRecordRef[]
}

export interface ImportRollbackResponse {
  code: number
  msg?: string
  batchId: string
  deletedCounts: {
    glucose: number
    insulin: number
    meal: number
    excretion: number
    weight: number
  }
  totalDeleted: number
}

export interface SelectedExcelFile {
  name: string
  path: string
}

export class PrivacyAgreementError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrivacyAgreementError'
  }
}

const resolveActiveCatId = (explicitCatId?: string): string => {
  if (explicitCatId && explicitCatId !== 'default') return explicitCatId
  const { currentCatId } = useCatSession()
  if (currentCatId.value && currentCatId.value !== 'default') {
    return currentCatId.value
  }
  return uni.getStorageSync('currentCatId') || 'default'
}

const downloadCloudFile = (fileID: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    wx.cloud.downloadFile({
      fileID,
      success: (res: any) => {
        if (res && res.tempFilePath) {
          resolve(res.tempFilePath)
        } else {
          reject(new Error('下载文件为空'))
        }
      },
      fail: (err: any) => reject(err)
    })
  })
}

const openDocumentWithFallback = (primaryPath: string, fallbackPath?: string): Promise<void> => {
  return new Promise((resolve) => {
    wx.openDocument({
      filePath: primaryPath,
      fileType: 'xlsx',
      showMenu: true,
      success: () => resolve(),
      fail: () => {
        if (fallbackPath && fallbackPath !== primaryPath) {
          wx.openDocument({
            filePath: fallbackPath,
            fileType: 'xlsx',
            showMenu: true,
            complete: () => resolve()
          })
        } else {
          resolve()
        }
      }
    })
  })
}

const copyAndOpenExcelDocument = (tempFilePath: string, customFileName: string): Promise<void> => {
  return new Promise((resolve) => {
    const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null
    const userDataPath = wx.env && wx.env.USER_DATA_PATH
    if (!fs || !userDataPath) {
      openDocumentWithFallback(tempFilePath).then(resolve)
      return
    }

    const safeName = customFileName.replace(/[\\/:*?"<>|]/g, '_')
    const targetPath = `${userDataPath}/${safeName}`

    fs.copyFile({
      srcPath: tempFilePath,
      destPath: targetPath,
      success: () => {
        openDocumentWithFallback(targetPath, tempFilePath).then(resolve)
      },
      fail: () => {
        openDocumentWithFallback(tempFilePath).then(resolve)
      }
    })
  })
}

const cleanupExportedReportFile = (fileID: string) => {
  // 优先通过同一 exportExcel 云函数清理，若旧版云函数未更新则无缝降级到 api.deleteReportFile
  callCloudFunction('exportExcel', { action: 'deleteReport', fileID })
    .then((res: any) => {
      if (!res || res.code !== 0) {
        return callApi('deleteReportFile', { fileID })
      }
    })
    .catch(() => {
      callApi('deleteReportFile', { fileID }).catch(() => {})
    })
}

/**
 * 导出并打开临床控糖就诊 Excel 报告（封装云端生成、本地下载、云端阅后即焚清理与沙盒重命名打开）
 */
export const exportClinicalReport = async (
  days: number,
  options: { catId?: string; onStageChange?: (stage: 'generating' | 'downloading') => void } = {}
): Promise<{ fileName: string }> => {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('请在微信小程序客户端中使用')
  }

  const catId = resolveActiveCatId(options.catId)
  options.onStageChange?.('generating')

  const result = await callCloudFunction<{ code: number; msg?: string; fileID?: string; fileName?: string }>(
    'exportExcel',
    { days, catId }
  )

  if (!result || result.code !== 0 || !result.fileID) {
    throw new Error(result?.msg || '生成失败，请检查云函数部署')
  }

  options.onStageChange?.('downloading')
  const tempFilePath = await downloadCloudFile(result.fileID)

  cleanupExportedReportFile(result.fileID)

  const customFileName = result.fileName || '血糖报告.xlsx'
  await copyAndOpenExcelDocument(tempFilePath, customFileName)

  return { fileName: customFileName }
}

/**
 * 唤起微信会话/本地文件选择器（封装隐私协议授权与取消态识别）
 */
export const pickExcelFileFromWeChat = (): Promise<SelectedExcelFile | null> => {
  return new Promise((resolve, reject) => {
    if (typeof wx === 'undefined' || !wx.chooseMessageFile) {
      reject(new Error('请在微信小程序客户端中使用'))
      return
    }

    const doChoose = () => {
      wx.chooseMessageFile({
        count: 1,
        type: 'file',
        extension: ['xlsx', 'xls', 'csv'],
        success: (res: any) => {
          if (res?.tempFiles && res.tempFiles.length > 0) {
            const file = res.tempFiles[0]
            resolve({ name: file.name, path: file.path })
          } else {
            resolve(null)
          }
        },
        fail: (err: any) => {
          if (err && (err.errno === 112 || (err.errMsg && err.errMsg.includes('privacy agreement')))) {
            reject(
              new PrivacyAgreementError(
                '微信提示尚未在小程序后台声明“选文件”权限。如在开发者工具中调试，可在右上角【详情】->【本地设置】中勾选或处理隐私配置；发布前需在微信公众平台【用户隐私保护指引】中增加“选择会话文件”权限声明。'
              )
            )
            return
          }
          if (err?.errMsg && err.errMsg.includes('cancel')) {
            resolve(null)
            return
          }
          reject(new Error('选择文件失败'))
        }
      })
    }

    if (wx.requirePrivacyAuthorize) {
      wx.requirePrivacyAuthorize({
        success: () => doChoose(),
        fail: () => doChoose()
      })
    } else {
      doChoose()
    }
  })
}

const HEADER_KEYWORD_MAP: Record<string, string[]> = {
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

const cleanLocalDateStr = (raw: any): string => {
  if (!raw) return ''
  const str = String(raw).trim()
  const m1 = str.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?(?:[\sT]+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/)
  if (m1) {
    return `${m1[1]}-${m1[2].padStart(2, '0')}-${m1[3].padStart(2, '0')}`
  }
  return ''
}

const cleanLocalTimeStr = (raw: any): string => {
  if (!raw) return ''
  const str = String(raw).trim()
  const m1 = str.match(/(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/)
  if (m1) {
    const h = parseInt(m1[1], 10)
    const min = parseInt(m1[2], 10)
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) {
      const hStr = String(h).padStart(2, '0')
      const minStr = String(min).padStart(2, '0')
      if (m1[3] !== undefined) {
        const s = parseInt(m1[3], 10)
        if (s > 0 && s <= 59) return `${hStr}:${minStr}:${String(s).padStart(2, '0')}`
      }
      return `${hStr}:${minStr}`
    }
  }
  return ''
}

const makeLocalCSTTimestamp = (dateStr: string, timeStr: string): number => {
  const d = cleanLocalDateStr(dateStr)
  if (!d) return Date.now()
  const [y, m, day] = d.split('-').map(Number)
  const t = cleanLocalTimeStr(timeStr)
  const [h = 0, min = 0, s = 0] = t ? t.split(':').map(Number) : [0, 0, 0]
  return Date.UTC(y, m - 1, day, h, min, s) - 8 * 3600 * 1000
}

const inferLocalMealPeriod = (mealTime: string): string => {
  const cleaned = cleanLocalTimeStr(mealTime) || '12:00'
  const h = parseInt(cleaned.split(':')[0], 10)
  if (h >= 5 && h < 11) return '早餐 (早针餐)'
  if (h >= 11 && h < 16) return '午餐/加餐'
  if (h >= 16 && h < 21) return '晚餐 (晚针餐)'
  return '夜宵/夜间加餐'
}

const parseLocalNumberWithUnit = (raw: any): number | null => {
  if (raw === undefined || raw === null || raw === '') return null
  const match = String(raw).replace(/,/g, '').trim().match(/[-+]?[0-9]*\.?[0-9]+/)
  if (!match) return null
  const n = parseFloat(match[0])
  return isNaN(n) ? null : n
}

const matchLocalHeaderType = (headerText: string): string | null => {
  if (!headerText) return null
  const text = String(headerText).toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '')
  for (const [colKey, keywords] of Object.entries(HEADER_KEYWORD_MAP)) {
    for (const kw of keywords) {
      if (text === kw.toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '')) return colKey
    }
  }
  const allKeywords: { colKey: string; kw: string }[] = []
  for (const [colKey, keywords] of Object.entries(HEADER_KEYWORD_MAP)) {
    for (const kw of keywords) {
      allKeywords.push({ colKey, kw: kw.toLowerCase().replace(/[\s\(\)（）\/\\_-]/g, '') })
    }
  }
  allKeywords.sort((a, b) => b.kw.length - a.kw.length)
  for (const item of allKeywords) {
    if (text.includes(item.kw)) return item.colKey
  }
  return null
}

const parseCsvRows = (csvText: string): string[][] => {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false
  const text = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const nextCh = text[i + 1]
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
        if (currentRow.some(c => c !== '')) rows.push(currentRow)
        currentRow = []
        currentField = ''
      } else {
        currentField += ch
      }
    }
  }
  if (currentField !== '' || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some(c => c !== '')) rows.push(currentRow)
  }
  return rows
}

/**
 * 客户端本地 CSV 解析器（兼容云端 importExcel 云函数尚未重新部署时的降级解析与直接预览）
 */
const parseLocalCsvFile = (filePath: string, catId: string): ImportParseResponse => {
  const fs = wx.getFileSystemManager ? wx.getFileSystemManager() : null
  if (!fs) {
    throw new Error('当前环境不支持读取本地 CSV 文件')
  }
  const rawContent = fs.readFileSync(filePath, 'utf8') as string
  const rows = parseCsvRows(rawContent || '')
  if (rows.length === 0) {
    throw new Error('CSV 文件内容为空')
  }

  let headerRowIdx = -1
  let colMap: Record<number, string> = {}
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const row = rows[r]
    const tempMap: Record<number, string> = {}
    let matches = 0
    row.forEach((cellText, idx) => {
      const matched = matchLocalHeaderType(cellText)
      if (matched && !Object.values(tempMap).includes(matched)) {
        tempMap[idx] = matched
        matches++
      }
    })
    if (matches >= 2 && matches > Object.keys(colMap).length) {
      headerRowIdx = r
      colMap = tempMap
    }
  }

  if (headerRowIdx === -1) {
    throw new Error('未能自动识别 CSV 表头，请确保包含“日期/测量时间”、“血糖”、“饮食”等列标题')
  }

  const glucoses: any[] = []
  const insulins: any[] = []
  const meals: any[] = []
  const excretions: any[] = []
  const weights: any[] = []

  let currentDate = ''
  let currentFoodBrand = ''
  let currentTiming = ''

  const isDateTimeCell = (s: string) => Boolean(cleanLocalDateStr(s) && cleanLocalTimeStr(s))

  for (let r = headerRowIdx + 1; r < rows.length; r++) {
    const rawCells = rows[r]
    const firstNonEmptyIdx = rawCells.findIndex(c => c !== '')
    if (firstNonEmptyIdx === -1) continue

    const tag = rawCells[firstNonEmptyIdx]
    const rest = rawCells.slice(firstNonEmptyIdx + 1)

    // 1. 多态错位饮食行（如 `,饮食,小李子,150,g,2026-08-11 08:30:00,,2026-08-11 12:22:48`）
    if (tag === '饮食' || tag === '进食' || tag === '喂食') {
      const dtIdx = rest.findIndex(isDateTimeCell)
      if (dtIdx !== -1) {
        const recordDate = cleanLocalDateStr(rest[dtIdx])
        const mealTime = cleanLocalTimeStr(rest[dtIdx]) || '12:00'
        let foodBrand = ''
        let foodGrams = 0
        for (let j = 0; j < dtIdx; j++) {
          const cellStr = rest[j]
          if (!cellStr || /^(g|克|ml|毫升)$/i.test(cellStr)) continue
          const num = parseLocalNumberWithUnit(cellStr)
          if (num !== null && /^\d+(\.\d+)?\s*(g|克)?$/i.test(cellStr)) {
            foodGrams = num
          } else if (!foodBrand) {
            foodBrand = cellStr
          }
        }
        let note = ''
        for (let j = dtIdx + 1; j < rest.length; j++) {
          if (rest[j] && !isDateTimeCell(rest[j])) {
            note = rest[j]
            break
          }
        }
        meals.push({
          cat_id: catId,
          food_grams: foodGrams,
          period: inferLocalMealPeriod(mealTime),
          food_brand: foodBrand,
          extras: '',
          record_date: recordDate,
          meal_time: mealTime,
          note,
          createTime: makeLocalCSTTimestamp(recordDate, mealTime)
        })
        continue
      }
    }

    // 2. 多态错位体重行（如 `,,,,体重,5.9,2026-08-02 15:32:00,,2026-08-02 15:32:07`）
    if (tag === '体重' || tag === '称重') {
      const dtIdx = rest.findIndex(isDateTimeCell)
      if (dtIdx !== -1) {
        const recordDate = cleanLocalDateStr(rest[dtIdx])
        const measureTime = cleanLocalTimeStr(rest[dtIdx]) || '08:00'
        let weightVal: number | null = null
        for (let j = 0; j < dtIdx; j++) {
          const num = parseLocalNumberWithUnit(rest[j])
          if (num !== null && num > 0 && num <= 50) {
            weightVal = num
            break
          }
        }
        if (weightVal !== null) {
          let note = ''
          for (let j = dtIdx + 1; j < rest.length; j++) {
            if (rest[j] && !isDateTimeCell(rest[j])) {
              note = rest[j]
              break
            }
          }
          weights.push({
            cat_id: catId,
            weight_value: weightVal,
            record_date: recordDate,
            measure_time: measureTime,
            note,
            createTime: makeLocalCSTTimestamp(recordDate, measureTime)
          })
          continue
        }
      }
    }

    // 3. 标准表头映射行
    const rowValues: Record<string, string> = {}
    for (const [colIdx, colKey] of Object.entries(colMap)) {
      rowValues[colKey] = rawCells[Number(colIdx)] || ''
    }

    const parsedDate =
      cleanLocalDateStr(rowValues.date) ||
      cleanLocalDateStr(rowValues.time) ||
      cleanLocalDateStr(rowValues.mealTime) ||
      cleanLocalDateStr(rowValues.createTime)

    if (parsedDate) {
      if (parsedDate !== currentDate) {
        currentFoodBrand = ''
        currentTiming = ''
      }
      currentDate = parsedDate
    }
    if (!currentDate) continue

    if (rowValues.foodBrand) currentFoodBrand = rowValues.foodBrand
    if (rowValues.timing) currentTiming = rowValues.timing
    const effectiveTiming = rowValues.timing || currentTiming || ''

    const bgVal = parseLocalNumberWithUnit(rowValues.glucose)
    const doseVal = parseLocalNumberWithUnit(rowValues.dose)
    const foodGramsVal = parseLocalNumberWithUnit(rowValues.foodGrams)
    const weightVal = parseLocalNumberWithUnit(rowValues.weight)

    if (bgVal !== null && bgVal > 0 && bgVal <= 100) {
      const bgTime = cleanLocalTimeStr(rowValues.time) || '08:00'
      const period = effectiveTiming || (bgTime < '12:00' ? '早针' : '晚针')
      glucoses.push({
        cat_id: catId,
        bg_value: bgVal,
        period,
        status: period,
        record_date: currentDate,
        measure_time: bgTime,
        note: rowValues.note || '',
        createTime: makeLocalCSTTimestamp(currentDate, bgTime)
      })
    }

    if (doseVal !== null && doseVal > 0 && doseVal <= 50) {
      const insTime = cleanLocalTimeStr(rowValues.time) || '08:00'
      const insPeriod = effectiveTiming
        ? (effectiveTiming.includes('晚') ? '晚针' : (effectiveTiming.includes('早') ? '早针' : effectiveTiming))
        : (insTime < '12:00' ? '早针' : '晚针')
      insulins.push({
        cat_id: catId,
        dose: doseVal,
        period: insPeriod,
        dose_adjustment: rowValues.doseAdj || '维持原量',
        insulin_type: rowValues.insulinType || '常用胰岛素',
        record_date: currentDate,
        inject_time: insTime,
        note: rowValues.note || '',
        createTime: makeLocalCSTTimestamp(currentDate, insTime)
      })
    }

    if ((foodGramsVal !== null && foodGramsVal >= 0 && foodGramsVal <= 2000 && (foodGramsVal > 0 || Boolean(rowValues.foodBrand))) || Boolean(rowValues.foodBrand && foodGramsVal === null)) {
      const mealTime = cleanLocalTimeStr(rowValues.mealTime) || cleanLocalTimeStr(rowValues.time) || '12:00'
      meals.push({
        cat_id: catId,
        food_grams: foodGramsVal || 0,
        period: inferLocalMealPeriod(mealTime),
        food_brand: rowValues.foodBrand || currentFoodBrand || '',
        extras: rowValues.extras || '',
        record_date: currentDate,
        meal_time: mealTime,
        note: rowValues.note || '',
        createTime: makeLocalCSTTimestamp(currentDate, mealTime)
      })
    }

    if (weightVal !== null && weightVal > 0 && weightVal <= 50) {
      const wTime = cleanLocalTimeStr(rowValues.time) || '08:00'
      weights.push({
        cat_id: catId,
        weight_value: weightVal,
        record_date: currentDate,
        measure_time: wTime,
        note: rowValues.note || '',
        createTime: makeLocalCSTTimestamp(currentDate, wTime)
      })
    }
  }

  const allDates = [
    ...glucoses.map(g => g.record_date),
    ...insulins.map(i => i.record_date),
    ...meals.map(m => m.record_date),
    ...excretions.map(e => e.record_date),
    ...weights.map(w => w.record_date)
  ].filter(Boolean).sort()

  const previewList: ImportPreviewItem[] = glucoses.slice(0, 6).map(g => {
    const matchedIns = insulins.find(ins => ins.record_date === g.record_date && ins.inject_time === g.measure_time)
    const matchedMeal = meals.find(m => m.record_date === g.record_date)
    return {
      date: g.record_date,
      time: g.measure_time,
      timing: g.period,
      bg: g.bg_value,
      dose: matchedIns ? matchedIns.dose : '-',
      food: matchedMeal ? (matchedMeal.food_brand || `${matchedMeal.food_grams}g`) : '-'
    }
  })

  return {
    code: 0,
    summary: {
      glucoseCount: glucoses.length,
      insulinCount: insulins.length,
      mealCount: meals.length,
      excretionCount: excretions.length,
      weightCount: weights.length,
      startDate: allDates[0] || '',
      endDate: allDates[allDates.length - 1] || ''
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

/**
 * 上传 Excel / CSV 文件至云端临时区并执行智能表头解析与重复预检
 * 若线上云函数尚未重新上传部署而对 CSV 报 ZIP 格式错误，自动无缝降级至客户端本地 CSV 解析
 */
export const uploadAndParseClinicalWorkbook = async (
  filePath: string,
  explicitCatId?: string
): Promise<ImportParseResponse> => {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('请在微信小程序客户端中使用')
  }

  const catId = resolveActiveCatId(explicitCatId)
  const extMatch = String(filePath || '').match(/\.(xlsx|xls|csv)$/i)
  const ext = extMatch ? extMatch[1].toLowerCase() : 'xlsx'
  const uploadRes = await wx.cloud.uploadFile({
    cloudPath: `temp_imports/${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`,
    filePath
  })

  let parseData: ImportParseResponse | null = null
  try {
    parseData = await callCloudFunction<ImportParseResponse>('importExcel', {
      action: 'parse',
      fileID: uploadRes.fileID,
      catId
    })
  } catch (cloudErr: any) {
    if (ext === 'csv') {
      return parseLocalCsvFile(filePath, catId)
    }
    throw cloudErr
  }

  if (!parseData || parseData.code !== 0) {
    const errMsg = parseData?.msg || ''
    // 如果云端运行的仍是旧版 importExcel（仅支持 .xlsx zip，遇到 CSV 会报 Can't find end of central directory），自动切换本地 CSV 解析器
    if (ext === 'csv' || errMsg.includes('central directory') || errMsg.includes('zip file')) {
      try {
        return parseLocalCsvFile(filePath, catId)
      } catch (localErr: any) {
        throw new Error(localErr?.message || errMsg || '未能成功解析该 CSV 文件')
      }
    }
    throw new Error(errMsg || '未能成功解析该 Excel 文件，请检查表头或内容格式')
  }

  return {
    ...parseData,
    fileID: uploadRes.fileID
  }
}

interface StoredLocalBatchMeta {
  batchId: string
  fileName: string
  importedAt: number
  fingerprints: string[]
}

const IMPORT_COLLECTION_LIST: Array<{
  col: ImportBatchRecordRef['type']
  key: keyof ImportBatchItem['counts']
}> = [
  { col: 'blood_glucose', key: 'glucose' },
  { col: 'insulin_records', key: 'insulin' },
  { col: 'meal_records', key: 'meal' },
  { col: 'excretion_records', key: 'excretion' },
  { col: 'weight_records', key: 'weight' }
]

const getLocalBatchStorageKey = (catId: string) => `clinical_import_batches_${catId}`

const readStoredLocalBatches = (catId: string): StoredLocalBatchMeta[] => {
  try {
    const raw = uni.getStorageSync(getLocalBatchStorageKey(catId))
    return Array.isArray(raw) ? raw : []
  } catch (e) {
    return []
  }
}

const writeStoredLocalBatches = (catId: string, list: StoredLocalBatchMeta[]) => {
  try {
    uni.setStorageSync(getLocalBatchStorageKey(catId), list.slice(0, 15))
  } catch (e) {}
}

const buildRecordFingerprint = (col: ImportBatchRecordRef['type'], doc: any): string => {
  if (!doc) return ''
  const d = cleanLocalDateStr(doc.record_date)
  const rawTime = doc.measure_time || doc.inject_time || doc.meal_time || doc.record_time || ''
  const t = cleanLocalTimeStr(rawTime)
  switch (col) {
    case 'blood_glucose':
      return `blood_glucose|${d}|${t}|${Number(doc.bg_value || 0).toFixed(1)}`
    case 'insulin_records':
      return `insulin_records|${d}|${t}|${Number(doc.dose || 0).toFixed(2)}`
    case 'meal_records':
      return `meal_records|${d}|${t}|${Number(doc.food_grams || 0).toFixed(0)}|${doc.food_brand || ''}`
    case 'excretion_records':
      return `excretion_records|${d}|${t}|${doc.urine || ''}|${doc.stool_status || ''}`
    case 'weight_records':
      return `weight_records|${d}|${Number(doc.weight_value || 0).toFixed(2)}`
  }
}

const collectParsedDataFingerprints = (parsedData?: Record<string, any[]>): string[] => {
  if (!parsedData) return []
  const set = new Set<string>()
  const mapping: Array<[string, ImportBatchRecordRef['type']]> = [
    ['glucoses', 'blood_glucose'],
    ['insulins', 'insulin_records'],
    ['meals', 'meal_records'],
    ['excretions', 'excretion_records'],
    ['weights', 'weight_records']
  ]
  for (const [prop, col] of mapping) {
    const arr = parsedData[prop]
    if (Array.isArray(arr)) {
      arr.forEach(item => {
        const fp = buildRecordFingerprint(col, item)
        if (fp) set.add(fp)
      })
    }
  }
  return Array.from(set)
}

/**
 * 确认提交批量导入，成功后持久化批次快照并自动在模块内部标记全局数据脏状态 (markDataDirty)
 */
export const commitClinicalWorkbookImport = async (params: {
  fileID?: string
  fileName?: string
  catId?: string
  parsedData?: Record<string, any[]>
  skipDuplicates: boolean
}): Promise<ImportCommitResponse> => {
  const catId = resolveActiveCatId(params.catId)
  const importData = await callCloudFunction<ImportCommitResponse>('importExcel', {
    action: 'import',
    fileID: params.fileID,
    fileName: params.fileName || '',
    catId,
    parsedData: params.parsedData,
    skipDuplicates: params.skipDuplicates
  })

  if (!importData || importData.code !== 0) {
    throw new Error(importData?.msg || '未能成功导入数据，请稍后重试')
  }

  const totalImported = importData.totalImported || 0
  const batchId = importData.batchId || `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const importedAt = importData.importedAt || Date.now()
  const fileName = params.fileName || importData.fileName || 'Excel / CSV 导入数据'

  if (totalImported > 0) {
    const fingerprints = collectParsedDataFingerprints(params.parsedData)
    const existing = readStoredLocalBatches(catId).filter(b => b.batchId !== batchId)
    existing.unshift({
      batchId,
      fileName,
      importedAt,
      fingerprints
    })
    writeStoredLocalBatches(catId, existing)
  }

  // 在模块边界内部强制触发数据变更通知，确保首页与历史列表必刷新
  markDataDirty()
  return {
    ...importData,
    batchId: totalImported > 0 ? batchId : '',
    importedAt,
    fileName
  }
}

/**
 * 查询当前猫咪所有可回滚的导入批次列表
 * 同时支持：
 * 1) 新版云端带有 import_batch_id 的导入记录
 * 2) 本地记录了批次指纹的导入批次
 * 3) 已导入入库、带有 source === 'excel_import' 的历史导入记录（即使云函数未重新部署或此前已退出页面也能完整识别并回滚）
 */
export const fetchRecentImportBatches = async (explicitCatId?: string): Promise<ImportBatchItem[]> => {
  if (typeof wx === 'undefined' || !wx.cloud) return []
  const catId = resolveActiveCatId(explicitCatId)
  if (!catId || catId === 'default') return []

  const storedBatches = readStoredLocalBatches(catId)
  const storedBatchSets = storedBatches.map(b => ({
    ...b,
    fpSet: new Set(b.fingerprints || [])
  }))

  const batchMap = new Map<string, ImportBatchItem>()
  const ensureBatchEntry = (batchId: string, defaultName: string, defaultTime: number): ImportBatchItem => {
    let entry = batchMap.get(batchId)
    if (!entry) {
      entry = {
        batchId,
        fileName: defaultName,
        importedAt: defaultTime,
        counts: {
          glucose: 0,
          insulin: 0,
          meal: 0,
          excretion: 0,
          weight: 0
        },
        totalCount: 0,
        startDate: '',
        endDate: '',
        recordRefs: []
      }
      batchMap.set(batchId, entry)
    }
    return entry
  }

  // 并发拉取 5 类集合中的导入记录（通过已部署的 api.getRecords 接口获取真实 _id 与 source: 'excel_import'）
  await Promise.all(
    IMPORT_COLLECTION_LIST.map(async ({ col, key }) => {
      try {
        const res: any = await callApi('getRecords', {
          catId,
          type: col,
          limit: 1000,
          skip: 0
        })
        const list = (res && res.success && Array.isArray(res.data)) ? res.data : []
        for (const rec of list) {
          if (!rec || rec.source !== 'excel_import' || !rec._id) continue

          let matchedBatchId = ''
          let matchedFileName = ''
          let matchedImportedAt = 0

          if (typeof rec.import_batch_id === 'string' && rec.import_batch_id.trim()) {
            matchedBatchId = rec.import_batch_id.trim()
            matchedFileName = rec.import_file_name || ''
            matchedImportedAt = typeof rec.imported_at === 'number' ? rec.imported_at : 0
            const localMeta = storedBatches.find(b => b.batchId === matchedBatchId)
            if (localMeta) {
              if (!matchedFileName) matchedFileName = localMeta.fileName
              if (!matchedImportedAt) matchedImportedAt = localMeta.importedAt
            }
          } else {
            const fp = buildRecordFingerprint(col, rec)
            const matchedLocal = storedBatchSets.find(b => fp && b.fpSet.has(fp))
            if (matchedLocal) {
              matchedBatchId = matchedLocal.batchId
              matchedFileName = matchedLocal.fileName
              matchedImportedAt = matchedLocal.importedAt
            } else {
              matchedBatchId = 'legacy_excel_import'
              matchedFileName = '已导入的表格历史数据'
              matchedImportedAt = 0
            }
          }

          const entry = ensureBatchEntry(
            matchedBatchId,
            matchedFileName || 'Excel / CSV 导入数据',
            matchedImportedAt
          )
          if (!entry.fileName && matchedFileName) entry.fileName = matchedFileName
          if (matchedImportedAt > entry.importedAt) entry.importedAt = matchedImportedAt

          entry.counts[key]++
          entry.totalCount++
          entry.recordRefs!.push({ type: col, id: String(rec._id) })

          const dStr = cleanLocalDateStr(rec.record_date)
          if (dStr) {
            if (!entry.startDate || dStr < entry.startDate) entry.startDate = dStr
            if (!entry.endDate || dStr > entry.endDate) entry.endDate = dStr
          }
        }
      } catch (e) {
        console.warn(`fetchRecentImportBatches ${col} warning:`, e)
      }
    })
  )

  return Array.from(batchMap.values())
    .filter(b => b.totalCount > 0)
    .sort((a, b) => (b.importedAt - a.importedAt) || b.batchId.localeCompare(a.batchId))
}

/**
 * 按导入批次执行手动回滚，移除该批次导入的全部记录并自动标记全局数据脏状态 (markDataDirty)
 * 优先尝试云端按 batchId 批量回滚；若云端未部署新版 importExcel 或属于无 batchId 的已导入记录，则通过 api.deleteRecord 精准逐条回滚
 */
export const rollbackClinicalWorkbookImport = async (
  batch: ImportBatchItem | string,
  explicitCatId?: string,
  onProgress?: (deleted: number, total: number) => void
): Promise<ImportRollbackResponse> => {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('请在微信小程序客户端中使用')
  }
  const catId = resolveActiveCatId(explicitCatId)
  const batchObj: ImportBatchItem | null = typeof batch === 'object' && batch !== null ? batch : null
  const batchId = typeof batch === 'string' ? batch : batch.batchId

  const deletedCounts = {
    glucose: 0,
    insulin: 0,
    meal: 0,
    excretion: 0,
    weight: 0
  }

  // 1. 若是带 imp_ 前缀的标准批次号，先尝试调用 importExcel.rollback 快速批量移除
  if (batchId && batchId.startsWith('imp_')) {
    try {
      const cloudRes = await callCloudFunction<ImportRollbackResponse>('importExcel', {
        action: 'rollback',
        batchId,
        catId
      })
      if (cloudRes && cloudRes.code === 0 && cloudRes.totalDeleted > 0) {
        const remainingLocal = readStoredLocalBatches(catId).filter(b => b.batchId !== batchId)
        writeStoredLocalBatches(catId, remainingLocal)
        markDataDirty()
        return cloudRes
      }
    } catch (e) {
      // 忽略并自动降级至 api.deleteRecord 逐条精确回滚
    }
  }

  // 2. 通过已部署的 api.deleteRecord 接口按记录 _id 并发回滚删除
  let refs = batchObj?.recordRefs || []
  if (refs.length === 0) {
    const allBatches = await fetchRecentImportBatches(catId)
    const found = allBatches.find(b => b.batchId === batchId)
    refs = found?.recordRefs || []
  }

  if (refs.length === 0) {
    throw new Error('未找到该批次下可回滚的记录，可能已被删除')
  }

  const colToKey: Record<ImportBatchRecordRef['type'], keyof typeof deletedCounts> = {
    blood_glucose: 'glucose',
    insulin_records: 'insulin',
    meal_records: 'meal',
    excretion_records: 'excretion',
    weight_records: 'weight'
  }

  const CHUNK_SIZE = 10
  let completed = 0
  for (let i = 0; i < refs.length; i += CHUNK_SIZE) {
    const chunk = refs.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (refItem) => {
        try {
          const res = await callApi('deleteRecord', {
            catId,
            type: refItem.type,
            recordId: refItem.id
          })
          if (res && res.success) {
            const k = colToKey[refItem.type]
            deletedCounts[k]++
          }
        } catch (e) {}
      })
    )
    completed += chunk.length
    onProgress?.(Math.min(completed, refs.length), refs.length)
  }

  const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0)
  const remainingLocal = readStoredLocalBatches(catId).filter(b => b.batchId !== batchId)
  writeStoredLocalBatches(catId, remainingLocal)

  markDataDirty()
  return {
    code: 0,
    batchId,
    deletedCounts,
    totalDeleted
  }
}

/**
 * 取消或重选文件时清理云端可能残留的暂存文件
 */
export const cancelStagedWorkbookImport = async (fileID?: string): Promise<void> => {
  if (!fileID || typeof wx === 'undefined' || !wx.cloud) return
  try {
    await callCloudFunction('importExcel', { action: 'cancel', fileID })
  } catch (e) {}
}
