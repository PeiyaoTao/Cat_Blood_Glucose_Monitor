// 云函数入口文件: 智能 Excel 历史数据解析与批量导入适配器 (Cloud Adapter -> ClinicalWorkbookCodec & RecordDomainSpec)
const cloud = require('wx-server-sdk')
const {
  RECORD_COLLECTIONS,
  makeTimestamp,
  sanitizeImportItems,
  summarizeImportBatchesFromRecords,
  getPrimaryDedupeKey,
  getRecordDedupeKeys
} = require('./recordDomainSpec')
const {
  parseClinicalWorkbookBuffer
} = require('./clinicalWorkbookCodec')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const checkCatAccess = async (catId, openid) => {
  if (!catId || catId === 'default') throw new Error('请先在「我的」中创建猫咪档案')
  let cat = null
  try {
    const res = await db.collection('cats').doc(catId).get()
    cat = res.data
  } catch (e) {
    throw new Error('猫咪档案不存在')
  }
  if (!cat || (cat._openid !== openid && !(cat.shared_with || []).includes(openid))) {
    throw new Error('无权访问该猫咪档案')
  }
  return cat
}

const isValidTempImportFileID = (fileID) => {
  return Boolean(fileID && typeof fileID === 'string' && fileID.startsWith('cloud://') && fileID.includes('/temp_imports/'))
}

// 分页拉取导入日期区间内的全部已有记录（用于预览与入库查重）
const fetchExistingInRange = async (collectionName, catId, minDate, maxDate) => {
  if (!minDate || !maxDate) return []
  const PAGE = 1000
  const rangeStart = makeTimestamp(minDate, '00:00')
  const rangeEnd = makeTimestamp(maxDate, '23:59') + 60 * 1000
  const query = db.collection(collectionName).where(_.and([
    { cat_id: catId },
    _.or([
      { record_date: _.gte(minDate).and(_.lte(maxDate)) },
      { createTime: _.gte(rangeStart).and(_.lt(rangeEnd)) }
    ])
  ]))
  const all = []
  for (let skip = 0; skip < 50000; skip += PAGE) {
    const res = await query.skip(skip).limit(PAGE).get()
    all.push(...(res.data || []))
    if (!res.data || res.data.length < PAGE) break
  }
  return all
}

// 构建已有记录的查重指纹集合
const buildExistingDedupeSet = async (collectionName, catId, items) => {
  const existingSet = new Set()
  if (!items || items.length === 0) return existingSet
  try {
    const dates = items.map(it => it.record_date).filter(Boolean).sort()
    if (dates.length === 0) return existingSet
    const existing = await fetchExistingInRange(collectionName, catId, dates[0], dates[dates.length - 1])
    existing.forEach(rec => {
      getRecordDedupeKeys(collectionName, rec).forEach(k => existingSet.add(k))
    })
  } catch (e) {
    console.log(`Fetch existing ${collectionName} warning:`, e.message)
  }
  return existingSet
}

// 统计某集合待导入项中的重复与新增列表
const partitionDuplicates = (collectionName, items, existingSet, skipDuplicates = true) => {
  const toInsert = []
  let duplicateCount = 0
  const seenInBatch = new Set()

  for (const item of (items || [])) {
    const candidateKeys = getRecordDedupeKeys(collectionName, item)
    const primaryKey = getPrimaryDedupeKey(collectionName, item)
    const isDupWithDb = candidateKeys.some(k => existingSet.has(k))
    const isDupInBatch = seenInBatch.has(primaryKey)

    if (skipDuplicates && (isDupWithDb || isDupInBatch)) {
      duplicateCount++
    } else {
      toInsert.push(item)
      seenInBatch.add(primaryKey)
    }
  }

  return { toInsert, duplicateCount }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const {
    action,
    fileID,
    fileName = '',
    batchId: requestedBatchId,
    catId = 'default',
    parsedData,
    skipDuplicates = true,
    keepTempFile = false
  } = event

  try {
    // ACTION 0: 取消并清理暂存文件
    if (action === 'cancel') {
      if (isValidTempImportFileID(fileID)) {
        await cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
      }
      return { code: 0 }
    }

    await checkCatAccess(catId, openid)

    // -------------------------------------------------------------
    // ACTION 1: 解析文件并预计算重复条数 (PARSE)
    // -------------------------------------------------------------
    if (action === 'parse') {
      if (!isValidTempImportFileID(fileID)) {
        return { code: -1, msg: '未提供有效的临时导入文件 fileID' }
      }

      let buffer = null
      try {
        const downloadRes = await cloud.downloadFile({ fileID })
        buffer = downloadRes.fileContent
      } finally {
        if (!keepTempFile) {
          await cloud.deleteFile({ fileList: [fileID] }).catch(e => {
            console.log('Clean temp import file warning:', e.message)
          })
        }
      }

      let parsedResult = null
      try {
        parsedResult = await parseClinicalWorkbookBuffer(buffer, { catId })
      } catch (parseErr) {
        if (keepTempFile) {
          await cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
        }
        return { code: -1, msg: parseErr.message }
      }

      const { summary, previewList, parsedData: rawParsed } = parsedResult

      // 在解析预览阶段直接计算数据库已存在的重复条数，让用户在点击确认前即可知晓
      const collections = [
        ['blood_glucose', rawParsed.glucoses],
        ['insulin_records', rawParsed.insulins],
        ['meal_records', rawParsed.meals],
        ['excretion_records', rawParsed.excretions],
        ['weight_records', rawParsed.weights]
      ]

      let duplicateCount = 0
      await Promise.all(
        collections.map(async ([colName, list]) => {
          if (!list || list.length === 0) return
          const existingSet = await buildExistingDedupeSet(colName, catId, list)
          const part = partitionDuplicates(colName, list, existingSet, true)
          duplicateCount += part.duplicateCount
        })
      )

      summary.duplicateCount = duplicateCount

      return {
        code: 0,
        summary,
        previewList,
        // 若启用云端文件暂存 (keepTempFile) 则无需向客户端下发全量 parsedData，同时保留默认向下兼容
        parsedData: keepTempFile ? undefined : rawParsed
      }
    }

    // -------------------------------------------------------------
    // ACTION 2: 确认批量写入 (IMPORT)
    // -------------------------------------------------------------
    if (action === 'import') {
      let sourceData = parsedData

      // 支持直接通过云端暂存的 fileID 完成解析与入库，消除全量 JSON 往返；若传入了 parsedData 则直接兼容
      if (!sourceData && isValidTempImportFileID(fileID)) {
        try {
          const downloadRes = await cloud.downloadFile({ fileID })
          const parsedResult = await parseClinicalWorkbookBuffer(downloadRes.fileContent, { catId })
          sourceData = parsedResult.parsedData
        } finally {
          await cloud.deleteFile({ fileList: [fileID] }).catch(() => {})
        }
      }

      if (!sourceData) {
        return { code: -1, msg: '缺少待导入的数据集' }
      }

      const batchId = `imp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const importedAt = Date.now()
      const safeFileName = typeof fileName === 'string' ? fileName.trim().slice(0, 120) : ''
      const batchMeta = { batchId, importedAt, fileName: safeFileName }

      const glucoses = sanitizeImportItems(sourceData.glucoses, 'blood_glucose', catId, openid, batchMeta)
      const insulins = sanitizeImportItems(sourceData.insulins, 'insulin_records', catId, openid, batchMeta)
      const meals = sanitizeImportItems(sourceData.meals, 'meal_records', catId, openid, batchMeta)
      const excretions = sanitizeImportItems(sourceData.excretions, 'excretion_records', catId, openid, batchMeta)
      const weights = sanitizeImportItems(sourceData.weights, 'weight_records', catId, openid, batchMeta)

      const importedCounts = {
        glucose: 0,
        insulin: 0,
        meal: 0,
        excretion: 0,
        weight: 0
      }
      let skippedCount = 0

      const batchInsert = async (collectionName, items, typeKey) => {
        if (!items || items.length === 0) return

        const existingSet = skipDuplicates
          ? await buildExistingDedupeSet(collectionName, catId, items)
          : new Set()

        const { toInsert, duplicateCount } = partitionDuplicates(
          collectionName,
          items,
          existingSet,
          skipDuplicates
        )
        skippedCount += duplicateCount

        const BATCH_SIZE = 20
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE)
          await Promise.all(batch.map(doc => db.collection(collectionName).add({ data: doc })))
          importedCounts[typeKey] += batch.length
        }
      }

      await batchInsert('blood_glucose', glucoses, 'glucose')
      await batchInsert('insulin_records', insulins, 'insulin')
      await batchInsert('meal_records', meals, 'meal')
      await batchInsert('excretion_records', excretions, 'excretion')
      await batchInsert('weight_records', weights, 'weight')

      const totalImported = Object.values(importedCounts).reduce((a, b) => a + b, 0)

      return {
        code: 0,
        batchId: totalImported > 0 ? batchId : '',
        importedAt,
        fileName: safeFileName,
        importedCounts,
        skippedCount,
        totalImported
      }
    }

    // -------------------------------------------------------------
    // ACTION 3: 查询当前猫咪最近可回滚的导入批次列表 (LIST_BATCHES)
    // -------------------------------------------------------------
    if (action === 'listBatches') {
      const recordsByType = {}
      await Promise.all(
        RECORD_COLLECTIONS.map(async (colName) => {
          try {
            const res = await db
              .collection(colName)
              .where({
                cat_id: catId,
                source: 'excel_import',
                import_batch_id: _.exists(true)
              })
              .field({
                import_batch_id: true,
                imported_at: true,
                import_file_name: true,
                record_date: true
              })
              .limit(1000)
              .get()
            recordsByType[colName] = res.data || []
          } catch (e) {
            recordsByType[colName] = []
          }
        })
      )

      const batches = summarizeImportBatchesFromRecords(recordsByType, 10)
      return {
        code: 0,
        batches
      }
    }

    // -------------------------------------------------------------
    // ACTION 4: 按导入批次 ID 手动回滚删除对应记录 (ROLLBACK)
    // -------------------------------------------------------------
    if (action === 'rollback') {
      const targetBatchId = typeof requestedBatchId === 'string' ? requestedBatchId.trim() : ''
      if (!targetBatchId || !targetBatchId.startsWith('imp_')) {
        return { code: -1, msg: '无效的导入批次号' }
      }

      const deletedCounts = {
        glucose: 0,
        insulin: 0,
        meal: 0,
        excretion: 0,
        weight: 0
      }

      const typeMapping = [
        ['blood_glucose', 'glucose'],
        ['insulin_records', 'insulin'],
        ['meal_records', 'meal'],
        ['excretion_records', 'excretion'],
        ['weight_records', 'weight']
      ]

      await Promise.all(
        typeMapping.map(async ([colName, countKey]) => {
          const removeRes = await db
            .collection(colName)
            .where({
              cat_id: catId,
              import_batch_id: targetBatchId
            })
            .remove()
          const removed = removeRes && removeRes.stats && typeof removeRes.stats.removed === 'number'
            ? removeRes.stats.removed
            : 0
          deletedCounts[countKey] = removed
        })
      )

      const totalDeleted = Object.values(deletedCounts).reduce((a, b) => a + b, 0)

      return {
        code: 0,
        batchId: targetBatchId,
        deletedCounts,
        totalDeleted
      }
    }

    return { code: -1, msg: `未知 action: ${action}` }
  } catch (err) {
    console.error('Import Excel Error:', err)
    return { code: -1, msg: err.message || '导入解析异常' }
  }
}
