// 云函数入口文件
const cloud = require('wx-server-sdk')
const xlsx = require('node-xlsx')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV }) // 使用当前云环境
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const days = event.days || 30 // 默认 30 天，如果是 0 代表全部
  
  let timeQuery = {}
  if (days > 0) {
    const pastDate = new Date()
    pastDate.setDate(pastDate.getDate() - days)
    timeQuery = {
      _openid: openid,
      createTime: db.command.gte(pastDate)
    }
  } else {
    timeQuery = { _openid: openid }
  }

  try {
    // 1. 获取血糖记录 (云函数默认限制100条，这里简单处理，如果记录超过100，需要循环查询)
    // 为保证体验，我们这里拉取最多 1000 条
    const MAX_LIMIT = 100
    
    // 获取血糖总数
    const bgCountRes = await db.collection('blood_glucose').where(timeQuery).count()
    const bgTotal = bgCountRes.total
    const bgBatches = Math.ceil(bgTotal / 100)
    let bgTasks = []
    for (let i = 0; i < bgBatches; i++) {
      bgTasks.push(db.collection('blood_glucose').where(timeQuery).skip(i * MAX_LIMIT).limit(MAX_LIMIT).orderBy('createTime', 'asc').get())
    }
    const bgResults = await Promise.all(bgTasks)
    let glucoseRecords = []
    bgResults.forEach(res => { glucoseRecords = glucoseRecords.concat(res.data) })

    // 获取打针记录
    const isCountRes = await db.collection('insulin_records').where(timeQuery).count()
    const isTotal = isCountRes.total
    const isBatches = Math.ceil(isTotal / 100)
    let isTasks = []
    for (let i = 0; i < isBatches; i++) {
      isTasks.push(db.collection('insulin_records').where(timeQuery).skip(i * MAX_LIMIT).limit(MAX_LIMIT).orderBy('createTime', 'asc').get())
    }
    const isResults = await Promise.all(isTasks)
    let insulinRecords = []
    isResults.forEach(res => { insulinRecords = insulinRecords.concat(res.data) })

    // 2. 统一合并并按时间正序排序
    let combined = []
    
    glucoseRecords.forEach(item => {
      const d = new Date(item.createTime)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      combined.push({
        timestamp: d.getTime(),
        date: dateStr,
        time: item.time,
        event: '测血糖',
        value: `${item.value} mmol/L`,
        status: item.status || '',
        note: item.note || ''
      })
    })
    
    insulinRecords.forEach(item => {
      const d = new Date(item.createTime)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      combined.push({
        timestamp: d.getTime(),
        date: dateStr,
        time: item.inject_time || `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`,
        event: `注射 (${item.insulin_type || '胰岛素'})`,
        value: `${item.dose} U`,
        status: item.site || '',
        note: `食欲: ${item.appetite || '-'} | ${item.note || ''}`
      })
    })

    // 正序排序
    combined.sort((a, b) => a.timestamp - b.timestamp)

    // 3. 构建三个 Sheet 的二维数组
    let combinedSheet = [['日期', '时间', '事件类型', '数值/剂量', '状态/部位', '备注信息']]
    combined.forEach(item => {
      combinedSheet.push([item.date, item.time, item.event, item.value, item.status, item.note])
    })
    if (combinedSheet.length === 1) combinedSheet.push(['暂无记录', '-', '-', '-', '-', '-'])

    let glucoseSheet = [['日期', '时间', '血糖值', '状态', '备注']]
    glucoseRecords.sort((a,b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime())
    glucoseRecords.forEach(item => {
      const d = new Date(item.createTime)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      glucoseSheet.push([dateStr, item.time, `${item.value} mmol/L`, item.status || '-', item.note || '-'])
    })
    if (glucoseSheet.length === 1) glucoseSheet.push(['暂无记录', '-', '-', '-', '-'])

    let insulinSheet = [['日期', '时间', '胰岛素类型', '注射剂量', '注射部位', '食欲/备注']]
    insulinRecords.sort((a,b) => new Date(a.createTime).getTime() - new Date(b.createTime).getTime())
    insulinRecords.forEach(item => {
      const d = new Date(item.createTime)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      const tStr = item.inject_time || `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
      insulinSheet.push([dateStr, tStr, item.insulin_type || '胰岛素', `${item.dose} U`, item.site || '-', `食欲:${item.appetite||'-'} | ${item.note||'-'}`])
    })
    if (insulinSheet.length === 1) insulinSheet.push(['暂无记录', '-', '-', '-', '-', '-'])

    // 4. 生成 Excel Buffer (多 Sheet)
    var buffer = await xlsx.build([
      { name: "合并总览", data: combinedSheet },
      { name: "纯血糖", data: glucoseSheet },
      { name: "纯打针", data: insulinSheet }
    ])

    // 5. 上传到云存储
    const uploadRes = await cloud.uploadFile({
      cloudPath: `reports/report_${openid.substring(0,8)}_${Date.now()}.xlsx`,
      fileContent: buffer
    })

    return {
      code: 0,
      fileID: uploadRes.fileID
    }
    
  } catch (err) {
    console.error(err)
    return { code: -1, msg: err.message }
  }
}
