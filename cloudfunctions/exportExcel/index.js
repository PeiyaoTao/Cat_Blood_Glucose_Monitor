// 云函数入口文件: 使用 ExcelJS 实现色彩分区、时序驱动、纯数字存储的临床就诊表导出
const cloud = require('wx-server-sdk')
const ExcelJS = require('exceljs')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 辅助函数：精准提取用户指定的本地日期 (YYYY-MM-DD)，彻底杜绝跨时区日漂移
const extractRecordDate = (item) => {
  if (item.record_date && /^\d{4}-\d{2}-\d{2}$/.test(item.record_date)) {
    return item.record_date
  }
  // 若无明确 record_date，按中国标准时间 UTC+8 解析 createTime
  const ts = item.createTime || Date.now()
  const d = new Date(ts + 8 * 3600 * 1000)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const date = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${date}`
}

// 辅助函数：提取记录的时分字符串 (HH:mm)
const extractTimeStr = (item) => {
  return item.measure_time || item.inject_time || item.meal_time || item.record_time || ''
}

// 辅助函数：将数值转为纯数字 (float/int)，如果是空或无效则返回 null
const parsePureNumber = (val) => {
  if (val === undefined || val === null || val === '') return null
  const n = typeof val === 'number' ? val : parseFloat(val)
  return isNaN(n) ? null : n
}

// 比较两条记录的时间先后，用于按时间严格排序
const compareRecordTime = (a, b) => {
  const tA = extractTimeStr(a)
  const tB = extractTimeStr(b)
  if (tA && tB) return tA.localeCompare(tB)
  return (a.createTime || 0) - (b.createTime || 0)
}

// 临床时效专属色彩映射 (ARGB 格式)
const getPeriodColorArgb = (timing) => {
  if (!timing) return null
  if (timing.includes('早针')) return 'FFFFF2CC'       // 温和晨曦浅黄
  if (timing.includes('5小时') || timing.includes('5h')) return 'FFD9E1F2' // 清新淡冰蓝
  if (timing.includes('晚针')) return 'FFE2EFDA'       // 柔和宁静浅绿
  if (timing.includes('空腹')) return 'FFFCE4D6'       // 淡粉杏色
  if (timing.includes('餐后2小时') || timing.includes('餐后2h')) return 'FFFFF9D2' // 浅暖黄色
  if (timing.includes('加测') || timing.includes('加针') || timing.includes('随机')) return 'FFEEDDFF' // 淡紫灰
  return null
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const days = event.days || 30 // 默认 30 天，0 代表全部
  const catId = event.catId || 'default'
  
  let timeQuery = { cat_id: catId }
  
  if (days > 0) {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - days)
    timeQuery.createTime = _.gte(pastDate.getTime())
  }

  try {
    // 0. 获取猫咪信息以显示专属表头
    let catName = '猫咪'
    try {
      if (catId && catId !== 'default') {
        const catRes = await db.collection('cats').doc(catId).get()
        if (catRes.data && catRes.data.name) {
          catName = catRes.data.name
        }
      }
    } catch (e) {
      console.log('Cat fetch fallback:', e.message)
    }

    const MAX_LIMIT = 100
    
    // 1. 获取血糖记录
    const bgCountRes = await db.collection('blood_glucose').where(timeQuery).count()
    const bgTotal = bgCountRes.total
    const bgBatches = Math.ceil(bgTotal / MAX_LIMIT) || 1
    let bgTasks = []
    for (let i = 0; i < bgBatches; i++) {
      bgTasks.push(
        db.collection('blood_glucose')
          .where(timeQuery)
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .orderBy('createTime', 'asc')
          .get()
      )
    }
    const bgResults = await Promise.all(bgTasks)
    let glucoseRecords = []
    bgResults.forEach(res => { if (res.data) glucoseRecords = glucoseRecords.concat(res.data) })

    // 2. 获取打针记录
    const isCountRes = await db.collection('insulin_records').where(timeQuery).count()
    const isTotal = isCountRes.total
    const isBatches = Math.ceil(isTotal / MAX_LIMIT) || 1
    let isTasks = []
    for (let i = 0; i < isBatches; i++) {
      isTasks.push(
        db.collection('insulin_records')
          .where(timeQuery)
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .orderBy('createTime', 'asc')
          .get()
      )
    }
    const isResults = await Promise.all(isTasks)
    let insulinRecords = []
    isResults.forEach(res => { if (res.data) insulinRecords = insulinRecords.concat(res.data) })

    // 3. 获取饮食记录
    const mlCountRes = await db.collection('meal_records').where(timeQuery).count()
    const mlTotal = mlCountRes.total
    const mlBatches = Math.ceil(mlTotal / MAX_LIMIT) || 1
    let mlTasks = []
    for (let i = 0; i < mlBatches; i++) {
      mlTasks.push(
        db.collection('meal_records')
          .where(timeQuery)
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .orderBy('createTime', 'asc')
          .get()
      )
    }
    const mlResults = await Promise.all(mlTasks)
    let mealRecords = []
    mlResults.forEach(res => { if (res.data) mealRecords = mealRecords.concat(res.data) })

    // 4. 获取排泄记录
    let excretionRecords = []
    try {
      const exCountRes = await db.collection('excretion_records').where(timeQuery).count()
      const exTotal = exCountRes.total
      const exBatches = Math.ceil(exTotal / MAX_LIMIT) || 1
      let exTasks = []
      for (let i = 0; i < exBatches; i++) {
        exTasks.push(
          db.collection('excretion_records')
            .where(timeQuery)
            .skip(i * MAX_LIMIT)
            .limit(MAX_LIMIT)
            .orderBy('createTime', 'asc')
            .get()
        )
      }
      const exResults = await Promise.all(exTasks)
      exResults.forEach(res => { if (res.data) excretionRecords = excretionRecords.concat(res.data) })
    } catch (e) {
      console.log('excretion_records optional fetch:', e.message)
    }

    // 5. 按纯正自然日期 (YYYY-MM-DD) 分组整合数据
    const dayGroups = {}

    const ensureGroup = (dateKey) => {
      if (!dayGroups[dateKey]) {
        dayGroups[dateKey] = {
          dateStr: dateKey,
          glucoses: [],
          insulins: [],
          meals: [],
          excretions: []
        }
      }
      return dayGroups[dateKey]
    }

    glucoseRecords.forEach(item => {
      const dateKey = extractRecordDate(item)
      ensureGroup(dateKey).glucoses.push(item)
    })

    insulinRecords.forEach(item => {
      const dateKey = extractRecordDate(item)
      ensureGroup(dateKey).insulins.push(item)
    })

    mealRecords.forEach(item => {
      const dateKey = extractRecordDate(item)
      ensureGroup(dateKey).meals.push(item)
    })

    excretionRecords.forEach(item => {
      const dateKey = extractRecordDate(item)
      ensureGroup(dateKey).excretions.push(item)
    })

    // 按日期升序排列
    const sortedDates = Object.keys(dayGroups).sort((a, b) => a.localeCompare(b))

    // 6. 使用 ExcelJS 构建工作簿与工作表
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'CatSugarDiary'
    workbook.created = new Date()

    const worksheet = workbook.addWorksheet(`${catName}血糖记录表`, {
      views: [{ showGridLines: true }]
    })

    // 标题行
    const titleRow = worksheet.addRow([`${catName} 血糖与临床控糖就诊记录表`])
    titleRow.height = 36
    titleRow.font = { name: '微软雅黑', size: 16, bold: true, color: { argb: 'FF2C3E50' } }
    titleRow.alignment = { vertical: 'middle', horizontal: 'center' }
    worksheet.mergeCells(1, 1, 1, 12)
    titleRow.getCell(1).fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF4F6F7' }
    }

    // 表头行 (标准 12 列)
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
      '备注'
    ]
    const headerRow = worksheet.addRow(headers)
    headerRow.height = 28
    headerRow.font = { name: '微软雅黑', size: 11, bold: true, color: { argb: 'FF1A252F' } }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }

    // 统一边框样式
    const thinBorder = {
      top: { style: 'thin', color: { argb: 'FFD6DBDF' } },
      left: { style: 'thin', color: { argb: 'FFD6DBDF' } },
      bottom: { style: 'thin', color: { argb: 'FFD6DBDF' } },
      right: { style: 'thin', color: { argb: 'FFD6DBDF' } }
    }

    for (let c = 1; c <= 12; c++) {
      const cell = headerRow.getCell(c)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFEAECEE' }
      }
      cell.border = thinBorder
    }

    // 设置列宽
    const colWidths = [14, 15, 11, 14, 14, 16, 12, 14, 18, 24, 26, 32]
    colWidths.forEach((w, idx) => {
      worksheet.getColumn(idx + 1).width = w
    })

    let currentRowNumber = 3 // 数据从第 3 行开始

    if (sortedDates.length === 0) {
      // 默认空状态示例 4 行
      const todayStr = new Date().toISOString().split('T')[0]
      const emptyRow1 = worksheet.addRow([todayStr, '早针', '', null, null, '', '', null, '', '', '', '暂无历史记录'])
      const emptyRow2 = worksheet.addRow(['', '针后5小时', '', null, null, '', '', null, '', '', '', ''])
      const emptyRow3 = worksheet.addRow(['', '晚针', '', null, null, '', '', null, '', '', '', ''])
      const emptyRow4 = worksheet.addRow(['', '针后5小时', '', null, null, '', '', null, '', '', '', ''])

      worksheet.mergeCells(currentRowNumber, 1, currentRowNumber + 3, 1)
      worksheet.mergeCells(currentRowNumber, 9, currentRowNumber + 3, 9)

      // 早针染色
      for (let c = 2; c <= 6; c++) {
        emptyRow1.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
      }
      // 针后5小时染色
      for (let c = 2; c <= 6; c++) {
        emptyRow2.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      }
      // 晚针染色
      for (let c = 2; c <= 6; c++) {
        emptyRow3.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } }
      }
      // 晚针后5小时染色
      for (let c = 2; c <= 6; c++) {
        emptyRow4.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      }
    } else {
      sortedDates.forEach(dateKey => {
        const group = dayGroups[dateKey]
        const dayStartRow = currentRowNumber

        // 提取全天排泄概况（尿量与排便）
        const excretionParts = []
        if (group.excretions && group.excretions.length > 0) {
          group.excretions.forEach(ex => {
            if (ex.urine && !excretionParts.includes(`尿: ${ex.urine}`)) {
              excretionParts.push(`尿: ${ex.urine}`)
            }
            if (ex.stool_status && !excretionParts.includes(`便: ${ex.stool_status}`)) {
              excretionParts.push(`便: ${ex.stool_status}${ex.stool_color ? `(${ex.stool_color})` : ''}`)
            }
          })
        }
        group.meals.forEach(m => {
          if (m.urine && !excretionParts.some(p => p.includes(m.urine))) {
            excretionParts.push(`尿: ${m.urine}`)
          }
        })
        group.insulins.forEach(i => {
          if (i.urine && !excretionParts.some(p => p.includes(i.urine))) {
            excretionParts.push(`尿: ${i.urine}`)
          }
        })
        const dayExcretionText = excretionParts.join('\n')

        // 1. 构建左侧医疗事件列表 (血糖 / 打针)，按真实时间升序排列
        const rawMedicalItems = []
        group.glucoses.forEach(g => {
          rawMedicalItems.push({
            type: 'glucose',
            time: g.measure_time || '',
            timing: g.period || g.status || '加测',
            bg: parsePureNumber(g.bg_value),
            dose: null,
            doseAdj: '',
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
            note: ins.note || '',
            createTime: ins.createTime || 0
          })
        })

        // 按记录时间升序排序
        rawMedicalItems.sort(compareRecordTime)

        // 智能合并同一时间点、同一时段的血糖与打针（例如 07:30早针 测糖 + 打针合并为同一行）
        const medicalRows = []
        rawMedicalItems.forEach(item => {
          const lastMed = medicalRows[medicalRows.length - 1]
          if (
            lastMed &&
            lastMed.time &&
            lastMed.time === item.time &&
            lastMed.timing === item.timing &&
            ((lastMed.bg !== null && item.dose !== null) || (lastMed.dose !== null && item.bg !== null))
          ) {
            if (item.bg !== null) lastMed.bg = item.bg
            if (item.dose !== null) {
              lastMed.dose = item.dose
              lastMed.doseAdj = item.doseAdj
            }
            if (item.note && !lastMed.note.includes(item.note)) {
              lastMed.note = lastMed.note ? `${lastMed.note}；${item.note}` : item.note
            }
          } else {
            medicalRows.push({ ...item })
          }
        })

        // 2. 构建右侧进食列表，严格按进食时间从早到晚排序
        const mealRows = [...group.meals].sort(compareRecordTime).map(m => ({
          mealTime: m.meal_time || '',
          foodGrams: parsePureNumber(m.food_grams),
          foodBrand: m.food_brand || '',
          extras: m.extras || '',
          note: m.note || ''
        }))

        // 3. 计算当天行数：保底至少 4 行（维持标准结构），超出自动向下拓展
        const totalDayRows = Math.max(4, medicalRows.length, mealRows.length)

        let previousTiming = '' // 用于相邻相同时效去重留白

        for (let r = 0; r < totalDayRows; r++) {
          const med = medicalRows[r] || null
          const meal = mealRows[r] || null

          let displayTiming = ''
          let effectiveTimingForColor = ''

          if (med && med.timing) {
            effectiveTimingForColor = med.timing
            if (med.timing === previousTiming) {
              displayTiming = '' // 相同则留白
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

          // 备注合并
          const combinedNote = [
            med ? med.note : '',
            meal ? meal.note : ''
          ].filter(Boolean).join('；')

          const bgVal = (med && med.bg !== null) ? med.bg : null
          const doseVal = (med && med.dose !== null) ? med.dose : null
          const foodGramsVal = (meal && meal.foodGrams !== null) ? meal.foodGrams : null

          const rowData = [
            r === 0 ? dateKey : '',            // Col 1: 日期
            displayTiming,                     // Col 2: 时效 (相邻相同留白)
            med ? med.time : '',               // Col 3: 时间
            bgVal,                             // Col 4: 血糖 (耳血) - 纯数字
            doseVal,                           // Col 5: 打针剂量(u) - 纯数字
            med ? med.doseAdj : '',            // Col 6: 剂量调整
            meal ? meal.mealTime : '',         // Col 7: 吃饭时间 (从上到下按时间排序)
            foodGramsVal,                      // Col 8: 吃饭克数(g) - 纯数字
            r === 0 ? dayExcretionText : '',   // Col 9: 尿量/排便
            meal ? meal.foodBrand : '',        // Col 10: 罐头品牌/批次
            meal ? meal.extras : '',           // Col 11: 附带东西
            combinedNote                       // Col 12: 备注
          ]

          const addedRow = worksheet.addRow(rowData)
          addedRow.height = 24
          addedRow.font = { name: '微软雅黑', size: 10, color: { argb: 'FF2C3E50' } }
          addedRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }

          // 设置数字列格式与居中对齐
          if (bgVal !== null) {
            addedRow.getCell(4).numFmt = '0.0'
          }
          if (doseVal !== null) {
            addedRow.getCell(5).numFmt = '0.00'
          }
          if (foodGramsVal !== null) {
            addedRow.getCell(8).numFmt = '0.0'
          }

          // 为 Col 2 ~ Col 6 (时效列至剂量调整列) 根据时效上专属背景色
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

          // 统一设置单元格边框
          for (let c = 1; c <= 12; c++) {
            addedRow.getCell(c).border = thinBorder
          }
        }

        const dayEndRow = dayStartRow + totalDayRows - 1

        // 纵向合并单元格：日期 (Col 1) 与 尿量/排便 (Col 9)
        if (totalDayRows > 1) {
          worksheet.mergeCells(dayStartRow, 1, dayEndRow, 1)
          worksheet.mergeCells(dayStartRow, 9, dayEndRow, 9)
        }

        currentRowNumber = dayEndRow + 1
      })
    }

    // 7. 生成 Excel 二进制 Buffer
    const buffer = await workbook.xlsx.writeBuffer()

    // 8. 智能生成人性化的文件名 (例如: "8月1日-8月30日血糖报告.xlsx")
    const formatZhDate = (dStr) => {
      if (!dStr || !dStr.includes('-')) return dStr || ''
      const parts = dStr.split('-')
      const m = parseInt(parts[1], 10)
      const d = parseInt(parts[2], 10)
      return `${m}月${d}日`
    }

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
    
    // 如果有自定义猫咪名字，附带猫咪名字前缀（如: "咪咪_8月1日-8月30日血糖报告.xlsx"）
    const prefix = (catName && catName !== '猫咪') ? `${catName}_` : ''
    const humanFileName = `${prefix}${reportTitleName}.xlsx`

    // 9. 上传到微信云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: `reports/${Date.now()}_report.xlsx`,
      fileContent: buffer
    })

    return {
      code: 0,
      fileID: uploadRes.fileID,
      fileName: humanFileName
    }
    
  } catch (err) {
    console.error('Export Excel Error:', err)
    return { code: -1, msg: err.message }
  }
}
