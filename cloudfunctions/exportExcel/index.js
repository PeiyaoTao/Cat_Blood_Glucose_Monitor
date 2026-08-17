// 云函数入口文件
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

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
    // 0. 获取猫咪信息以显示专属表头（例如：皮皮血糖记录表）
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

    // 3. 按日期分组整合数据
    const dayGroups = {}

    // 处理血糖记录
    glucoseRecords.forEach(item => {
      const d = new Date(item.createTime || Date.now())
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (!dayGroups[dateKey]) {
        dayGroups[dateKey] = { glucoses: [], insulins: [], dateStr: dateKey }
      }
      dayGroups[dateKey].glucoses.push(item)
    })

    // 处理打针记录
    insulinRecords.forEach(item => {
      const d = new Date(item.createTime || Date.now())
      const dateKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      if (!dayGroups[dateKey]) {
        dayGroups[dateKey] = { glucoses: [], insulins: [], dateStr: dateKey }
      }
      dayGroups[dateKey].insulins.push(item)
    })

    const sortedDates = Object.keys(dayGroups).sort((a, b) => new Date(a).getTime() - new Date(b).getTime())

    // 4. 构建严格符合模板的数据行和合并单元格
    // Row 0: 大标题 [XXXX血糖记录表] (A1:L1 合并)
    // Row 1: 表头 ['日期', '时效', '时间', '血糖 (耳血)', '打针剂量(u)', '剂量调整', '吃饭时间', '吃饭克数(g)', '尿量', '罐头品牌/批次', '附带东西', '备注']
    const sheetData = []
    const merges = []

    // 标题行
    const titleText = `${catName}血糖记录表`
    sheetData.push([titleText, '', '', '', '', '', '', '', '', '', '', ''])
    merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: 11 } })

    // 表头行
    const headers = [
      '日期',
      '时效',
      '时间',
      '血糖 (耳血)',
      '打针剂量(u)',
      '剂量调整',
      '吃饭时间',
      '吃饭克数(g)',
      '尿量',
      '罐头品牌/批次',
      '附带东西',
      '备注'
    ]
    sheetData.push(headers)

    let currentRowIndex = 2 // 从第 3 行 (索引 2) 开始填写数据

    if (sortedDates.length === 0) {
      // 若无记录，生成一个示例空白行
      const todayStr = new Date().toISOString().split('T')[0]
      sheetData.push([todayStr, '早针', '', '', '', '', '', '', '', '', '', '暂无历史记录'])
      sheetData.push(['', '针后5小时', '', '', '', '', '', '', '', '', '', ''])
      sheetData.push(['', '晚针', '', '', '', '', '', '', '', '', '', ''])
      sheetData.push(['', '针后5小时', '', '', '', '', '', '', '', '', '', ''])
      merges.push({ s: { r: currentRowIndex, c: 0 }, e: { r: currentRowIndex + 3, c: 0 } })
      merges.push({ s: { r: currentRowIndex, c: 8 }, e: { r: currentRowIndex + 3, c: 8 } })
      merges.push({ s: { r: currentRowIndex, c: 9 }, e: { r: currentRowIndex + 3, c: 9 } })
      merges.push({ s: { r: currentRowIndex, c: 10 }, e: { r: currentRowIndex + 3, c: 10 } })
    } else {
      sortedDates.forEach(dateKey => {
        const group = dayGroups[dateKey]
        const dayStartRow = currentRowIndex

        // 提取全天概括信息（尿量、罐头、补剂）
        let dayUrine = ''
        let dayFoodBrand = ''
        let dayExtras = ''
        
        group.insulins.forEach(ins => {
          if (ins.urine && !dayUrine) dayUrine = ins.urine
          if (ins.food_brand && !dayFoodBrand) dayFoodBrand = ins.food_brand
          if (ins.extras && !dayExtras) dayExtras = ins.extras
        })

        // 将一天的记录匹配到标准 4 大时效槽位（早针、针后5小时、晚针、针后5小时）及加测
        const morningInsulin = group.insulins.find(i => (i.period && i.period.includes('早')) || (i.inject_time && parseInt(i.inject_time) < 14))
        const eveningInsulin = group.insulins.find(i => (i.period && i.period.includes('晚')) || (i.inject_time && parseInt(i.inject_time) >= 14 && i !== morningInsulin))

        const morningBg = group.glucoses.find(g => (g.period && g.period.includes('早针')) || (g.measure_time && parseInt(g.measure_time) < 11))
        const morningPeakBg = group.glucoses.find(g => g !== morningBg && ((g.period && g.period.includes('5')) || (g.measure_time && parseInt(g.measure_time) >= 11 && parseInt(g.measure_time) < 16)))
        const eveningBg = group.glucoses.find(g => g !== morningBg && g !== morningPeakBg && ((g.period && g.period.includes('晚针')) || (g.measure_time && parseInt(g.measure_time) >= 16 && parseInt(g.measure_time) < 22)))
        const eveningPeakBg = group.glucoses.find(g => g !== morningBg && g !== morningPeakBg && g !== eveningBg && ((g.period && g.period.includes('5')) || (g.measure_time && (parseInt(g.measure_time) >= 22 || parseInt(g.measure_time) < 5))))

        // 找出剩余未归入 4 大时段的其他记录
        const otherGlucoses = group.glucoses.filter(g => g !== morningBg && g !== morningPeakBg && g !== eveningBg && g !== eveningPeakBg)
        const otherInsulins = group.insulins.filter(i => i !== morningInsulin && i !== eveningInsulin)

        // 构建当天必须呈现的行列表
        const dayRows = []

        // Row 1: 早针
        dayRows.push({
          timing: '早针',
          time: (morningInsulin && morningInsulin.inject_time) || (morningBg && morningBg.measure_time) || '',
          bg: morningBg ? `${morningBg.bg_value}` : '',
          dose: morningInsulin ? `${morningInsulin.dose}` : '',
          doseAdj: (morningInsulin && morningInsulin.dose_adjustment) || '',
          mealTime: (morningBg && morningBg.meal_time) || '',
          foodGrams: (morningBg && morningBg.food_grams) || '',
          note: (morningInsulin && morningInsulin.note) || (morningBg && morningBg.note) || ''
        })

        // Row 2: 针后5小时 (早)
        dayRows.push({
          timing: '针后5小时',
          time: morningPeakBg ? morningPeakBg.measure_time : '',
          bg: morningPeakBg ? `${morningPeakBg.bg_value}` : '',
          dose: '',
          doseAdj: '',
          mealTime: morningPeakBg ? morningPeakBg.meal_time : '',
          foodGrams: morningPeakBg ? morningPeakBg.food_grams : '',
          note: morningPeakBg ? morningPeakBg.note : ''
        })

        // Row 3: 晚针
        dayRows.push({
          timing: '晚针',
          time: (eveningInsulin && eveningInsulin.inject_time) || (eveningBg && eveningBg.measure_time) || '',
          bg: eveningBg ? `${eveningBg.bg_value}` : '',
          dose: eveningInsulin ? `${eveningInsulin.dose}` : '',
          doseAdj: (eveningInsulin && eveningInsulin.dose_adjustment) || '',
          mealTime: (eveningBg && eveningBg.meal_time) || '',
          foodGrams: (eveningBg && eveningBg.food_grams) || '',
          note: (eveningInsulin && eveningInsulin.note) || (eveningBg && eveningBg.note) || ''
        })

        // Row 4: 针后5小时 (晚)
        dayRows.push({
          timing: '针后5小时',
          time: eveningPeakBg ? eveningPeakBg.measure_time : '',
          bg: eveningPeakBg ? `${eveningPeakBg.bg_value}` : '',
          dose: '',
          doseAdj: '',
          mealTime: eveningPeakBg ? eveningPeakBg.meal_time : '',
          foodGrams: eveningPeakBg ? eveningPeakBg.food_grams : '',
          note: eveningPeakBg ? eveningPeakBg.note : ''
        })

        // 插入其他额外加测或记录
        otherGlucoses.forEach(g => {
          dayRows.push({
            timing: g.period || '加测',
            time: g.measure_time || '',
            bg: `${g.bg_value}`,
            dose: '',
            doseAdj: '',
            mealTime: g.meal_time || '',
            foodGrams: g.food_grams || '',
            note: g.note || ''
          })
        })

        otherInsulins.forEach(ins => {
          dayRows.push({
            timing: ins.period || '加针',
            time: ins.inject_time || '',
            bg: '',
            dose: `${ins.dose}`,
            doseAdj: ins.dose_adjustment || '',
            mealTime: '',
            foodGrams: '',
            note: ins.note || ''
          })
        })

        const totalRowsInDay = dayRows.length

        // 输出当天各行到 sheetData
        dayRows.forEach((r, idx) => {
          sheetData.push([
            idx === 0 ? dateKey : '',    // 日期 (由 merge 处理合并)
            r.timing,                    // 时效
            r.time,                      // 时间
            r.bg,                        // 血糖 (耳血)
            r.dose,                      // 打针剂量(u)
            r.doseAdj,                   // 剂量调整
            r.mealTime,                  // 吃饭时间
            r.foodGrams,                 // 吃饭克数(g)
            idx === 0 ? dayUrine : '',   // 尿量
            idx === 0 ? dayFoodBrand : '',// 罐头品牌/批次
            idx === 0 ? dayExtras : '',  // 附带东西
            r.note                       // 备注
          ])
        })

        const dayEndRow = dayStartRow + totalRowsInDay - 1

        // 纵向合并单元格：日期 (Col 0), 尿量 (Col 8), 罐头 (Col 9), 附带东西 (Col 10)
        if (totalRowsInDay > 1) {
          merges.push({ s: { r: dayStartRow, c: 0 }, e: { r: dayEndRow, c: 0 } })
          merges.push({ s: { r: dayStartRow, c: 8 }, e: { r: dayEndRow, c: 8 } })
          merges.push({ s: { r: dayStartRow, c: 9 }, e: { r: dayEndRow, c: 9 } })
          merges.push({ s: { r: dayStartRow, c: 10 }, e: { r: dayEndRow, c: 10 } })
        }

        currentRowIndex = dayEndRow + 1
      })
    }

    // 5. 设置专业列宽 (自适应手机/电脑阅读)
    const colWidths = [
      { wch: 14 }, // 日期
      { wch: 14 }, // 时效
      { wch: 10 }, // 时间
      { wch: 14 }, // 血糖 (耳血)
      { wch: 14 }, // 打针剂量(u)
      { wch: 16 }, // 剂量调整
      { wch: 12 }, // 吃饭时间
      { wch: 14 }, // 吃饭克数(g)
      { wch: 16 }, // 尿量
      { wch: 22 }, // 罐头品牌/批次
      { wch: 24 }, // 附带东西
      { wch: 32 }  // 备注
    ]

    // 6. 生成单一工作表 Buffer
    const buffer = await xlsx.build([
      {
        name: `${catName}血糖记录表`,
        data: sheetData,
        options: {
          '!merges': merges,
          '!cols': colWidths
        }
      }
    ])

    // 7. 上传到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: `reports/${catName}_血糖记录表_${Date.now()}.xlsx`,
      fileContent: buffer
    })

    return {
      code: 0,
      fileID: uploadRes.fileID
    }
    
  } catch (err) {
    console.error('Export Excel Error:', err)
    return { code: -1, msg: err.message }
  }
}
