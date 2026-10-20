// 云函数入口文件: 临床就诊表导出适配器 (Cloud Adapter -> ClinicalWorkbookCodec Deep Module)
const cloud = require('wx-server-sdk')
const {
  extractRecordDate,
  getCSTDateRangeCutoff
} = require('./recordDomainSpec')
const {
  buildClinicalWorkbookBuffer
} = require('./clinicalWorkbookCodec')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MAX_LIMIT = 100

// 分页拉取指定集合的数据，并按业务日期（北京时间 YYYY-MM-DD）精确过滤
const fetchCatRecords = async (collectionName, catId, cutoffDateStr, cutoffTimestamp, optional = false) => {
  let queryCond = { cat_id: catId }
  if (cutoffDateStr) {
    queryCond = _.and([
      { cat_id: catId },
      _.or([
        { record_date: _.gte(cutoffDateStr) },
        { createTime: _.gte(cutoffTimestamp) }
      ])
    ])
  }

  try {
    const countRes = await db.collection(collectionName).where(queryCond).count()
    const total = countRes.total || 0
    if (total === 0) return []

    const batches = Math.ceil(total / MAX_LIMIT) || 1
    const tasks = []
    for (let i = 0; i < batches; i++) {
      tasks.push(
        db.collection(collectionName)
          .where(queryCond)
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .orderBy('createTime', 'asc')
          .get()
      )
    }
    const results = await Promise.all(tasks)
    const records = []
    results.forEach(res => {
      if (res && Array.isArray(res.data)) {
        records.push(...res.data)
      }
    })

    // 二次按业务日期 (record_date / CST createTime) 精确筛选，避免补录旧记录因 createTime 较新而混入近期报表
    if (cutoffDateStr) {
      return records.filter(item => extractRecordDate(item) >= cutoffDateStr)
    }
    return records
  } catch (e) {
    if (optional) {
      console.log(`${collectionName} optional fetch:`, e.message)
      return []
    }
    throw e
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  // 支持在同一云函数内直接清理已下载的临时报表文件
  if (event && event.action === 'deleteReport') {
    const { fileID } = event
    if (!fileID || typeof fileID !== 'string' || !fileID.includes(`/reports/${openid}/`)) {
      return { code: -1, msg: '无权删除该报告文件' }
    }
    await cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
    return { code: 0 }
  }

  const days = Number(event.days) > 0 ? Number(event.days) : (event.days === 0 ? 0 : 30)
  const catId = event.catId || 'default'

  try {
    if (!catId || catId === 'default') {
      return { code: -1, msg: '请先创建猫咪档案' }
    }
    let catDoc = null
    try {
      const catRes = await db.collection('cats').doc(catId).get()
      catDoc = catRes.data
    } catch (e) {
      return { code: -1, msg: '猫咪档案不存在' }
    }
    if (!catDoc || (catDoc._openid !== openid && !(catDoc.shared_with || []).includes(openid))) {
      return { code: -1, msg: '无权导出该猫咪的数据' }
    }
    const catName = catDoc.name || '猫咪'

    const { cutoffDateStr, cutoffTimestamp } = getCSTDateRangeCutoff(days)

    // 并行拉取全部 5 类临床记录（包含此前遗漏的 weight_records）
    const [glucoses, insulins, meals, excretions, weights] = await Promise.all([
      fetchCatRecords('blood_glucose', catId, cutoffDateStr, cutoffTimestamp, false),
      fetchCatRecords('insulin_records', catId, cutoffDateStr, cutoffTimestamp, false),
      fetchCatRecords('meal_records', catId, cutoffDateStr, cutoffTimestamp, false),
      fetchCatRecords('excretion_records', catId, cutoffDateStr, cutoffTimestamp, true),
      fetchCatRecords('weight_records', catId, cutoffDateStr, cutoffTimestamp, true)
    ])

    const { buffer, fileName } = await buildClinicalWorkbookBuffer({
      catName,
      records: {
        glucoses,
        insulins,
        meals,
        excretions,
        weights
      }
    })

    const uploadRes = await cloud.uploadFile({
      cloudPath: `reports/${openid}/${Date.now()}_report.xlsx`,
      fileContent: buffer
    })

    return {
      code: 0,
      fileID: uploadRes.fileID,
      fileName
    }
  } catch (err) {
    console.error('Export Excel Error:', err)
    return { code: -1, msg: err.message }
  }
}
