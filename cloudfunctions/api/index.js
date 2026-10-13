const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

// ==================== 常量与白名单 ====================

// 允许通过通用记录接口读写的集合（严禁前端传入任意集合名）
const RECORD_COLLECTIONS = [
  'blood_glucose',
  'insulin_records',
  'meal_records',
  'excretion_records',
  'weight_records'
]

// 各记录集合允许写入的字段（其余字段一律丢弃，cat_id / _openid 由服务端强制写入）
const RECORD_FIELDS = {
  blood_glucose: ['bg_value', 'period', 'status', 'record_date', 'measure_time', 'note', 'createTime'],
  insulin_records: ['dose', 'period', 'dose_adjustment', 'insulin_type', 'record_date', 'inject_time', 'note', 'createTime'],
  meal_records: ['food_grams', 'period', 'food_brand', 'extras', 'record_date', 'meal_time', 'note', 'createTime'],
  excretion_records: ['urine', 'stool_status', 'stool_color', 'record_date', 'record_time', 'note', 'createTime'],
  weight_records: ['weight_value', 'record_date', 'measure_time', 'note', 'createTime']
}

// 猫咪档案允许由前端修改的字段（_openid / shared_with / auto_feeder_config 不可经 saveCat 修改）
const CAT_FIELDS = ['name', 'avatar', 'birthday', 'diagnosis_date', 'targetMin', 'targetMax']

const INVITE_TTL_MS = 7 * 24 * 3600 * 1000 // 邀请有效期 7 天
const INVITE_REUSE_MIN_REMAINING_MS = 24 * 3600 * 1000 // 剩余有效期大于 1 天时复用旧邀请

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

const pick = (obj, keys) => {
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

const clampInt = (val, min, max, fallback) => {
  const n = parseInt(val, 10)
  if (isNaN(n)) return fallback
  return Math.max(min, Math.min(max, n))
}

const sanitizeFeederConfig = (catId, raw) => {
  const cfg = raw || {}
  const schedule = Array.isArray(cfg.schedule) ? cfg.schedule.slice(0, 24) : []
  return {
    cat_id: catId,
    is_active: Boolean(cfg.is_active),
    schedule: schedule
      .filter(item => item && TIME_RE.test(String(item.time || '')))
      .map(item => ({
        time: String(item.time),
        food_grams: Math.max(0, Math.min(1000, Number(item.food_grams) || 0)),
        period: String(item.period || '自动喂食机出餐').slice(0, 30)
      })),
    default_brand: String(cfg.default_brand || '').slice(0, 100),
    default_extras: String(cfg.default_extras || '').slice(0, 200),
    default_note: String(cfg.default_note || '自动喂食机定时出餐').slice(0, 200),
    last_sync_date: DATE_RE.test(String(cfg.last_sync_date || '')) ? cfg.last_sync_date : ''
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const db = cloud.database()
  const _ = db.command

  const { action } = event
  const payload = event.payload || {}

  // Helper: check if user has access to a cat
  // returns the cat doc if access is granted, otherwise throws error
  const checkCatAccess = async (catId) => {
    if (!catId || typeof catId !== 'string') throw new Error('Missing catId')
    let data = null
    try {
      const res = await db.collection('cats').doc(catId).get()
      data = res.data
    } catch (e) {
      throw new Error('Cat not found')
    }
    if (!data) throw new Error('Cat not found')
    if (data._openid !== openid && (!data.shared_with || !data.shared_with.includes(openid))) {
      throw new Error('Permission denied')
    }
    return data
  }

  // 文本安全校验 (v2)
  const checkTextSecurity = async (text) => {
    if (!text) return true
    try {
      const res = await cloud.openapi.security.msgSecCheck({
        openid: openid,
        scene: 1,
        version: 2,
        content: text
      })
      if (res && res.result && res.result.suggest !== 'pass') {
        throw new Error('CONTENT_SECURITY_FAILED')
      }
    } catch (err) {
      if (err.errCode === 87014 || (err.message && err.message.includes('87014')) || (err.errMsg && err.errMsg.includes('87014')) || err.message === 'CONTENT_SECURITY_FAILED') {
        throw new Error('CONTENT_SECURITY_FAILED')
      }
      // 对于其他非 87014 错误（如接口限流/网络抖动），依然放行防误杀，但记录日志便于排查
      console.warn('msgSecCheck non-blocking error:', err.errCode || err.message)
    }
    return true
  }

  // 图片安全校验 (v1)
  const checkImageSecurity = async (fileID) => {
    if (!fileID || !fileID.startsWith('cloud://')) return true
    try {
      // 1. 下载云文件
      const res = await cloud.downloadFile({ fileID })
      const buffer = res.fileContent
      // 2. 校验文件
      await cloud.openapi.security.imgSecCheck({
        media: {
          contentType: 'image/jpeg',
          value: buffer
        }
      })
    } catch (err) {
      if (err.errCode && err.errCode === 87014) { // 87014: 内容违规
        // 发现违规，自动删除该违规图片
        try { await cloud.deleteFile({ fileList: [fileID] }) } catch(e){}
        throw new Error('CONTENT_SECURITY_FAILED')
      }
      // 如果是图片太大 (87015) 或者其他错误，这里保守起见放行。
      // 为防止误杀，如果是 87014 才拦截
      console.warn('imgSecCheck non-blocking error:', err.errCode || err.message)
    }
    return true
  }

  try {
    switch (action) {
      // ==================== 家庭共享（邀请令牌） ====================

      // 旧版裸 openid 邀请链接：已废弃（永久有效且可无限转发，存在越权风险）
      case 'bindSharedCat': {
        throw new Error('INVITE_LINK_DEPRECATED')
      }

      // 创建（或复用）一个带有效期的邀请令牌，仅授权当前创建者名下的猫咪
      case 'createInvite': {
        const { data: myCats } = await db.collection('cats').where({ _openid: openid }).field({ _id: true }).get()
        if (!myCats || myCats.length === 0) {
          throw new Error('NO_OWN_CATS')
        }
        const catIds = myCats.map(c => c._id)
        const now = Date.now()

        // 首次使用时自动创建 invites 集合
        try {
          await db.collection('invites').limit(1).get()
        } catch (e) {
          if (/not exist|-502005/i.test(String(e.errMsg || e.message || ''))) {
            await db.createCollection('invites')
          } else {
            throw e
          }
        }

        // 复用仍然有效的邀请，避免每次打开页面都生成新令牌
        const { data: existing } = await db.collection('invites').where({
          inviter: openid,
          revoked: false,
          expireAt: _.gt(now + INVITE_REUSE_MIN_REMAINING_MS)
        }).limit(1).get()

        if (existing && existing.length > 0) {
          const inv = existing[0]
          // 同步最新的猫咪列表（新增猫咪后旧邀请也能覆盖）
          await db.collection('invites').doc(inv._id).update({ data: { cat_ids: catIds } })
          return { success: true, token: inv._id, expireAt: inv.expireAt }
        }

        const token = crypto.randomBytes(16).toString('hex')
        const expireAt = now + INVITE_TTL_MS
        await db.collection('invites').add({
          data: {
            _id: token,
            inviter: openid,
            cat_ids: catIds,
            revoked: false,
            used_by: [],
            createTime: now,
            expireAt
          }
        })
        return { success: true, token, expireAt }
      }

      // 通过邀请令牌加入家庭共享
      case 'acceptInvite': {
        const { token } = payload
        if (!token || typeof token !== 'string' || !/^[a-f0-9]{32}$/.test(token)) {
          throw new Error('INVITE_INVALID')
        }
        let invite = null
        try {
          const res = await db.collection('invites').doc(token).get()
          invite = res.data
        } catch (e) {
          throw new Error('INVITE_INVALID')
        }
        if (!invite || invite.revoked) throw new Error('INVITE_INVALID')
        if (Date.now() > invite.expireAt) throw new Error('INVITE_EXPIRED')
        if (invite.inviter === openid) return { success: true, modified: 0, self: true }

        let modified = 0
        for (const catId of (invite.cat_ids || [])) {
          let cat = null
          try {
            const res = await db.collection('cats').doc(catId).get()
            cat = res.data
          } catch (e) {
            continue // 猫咪已被删除
          }
          // 仅当猫咪仍归属邀请人时才授权，防止所有权变更后旧邀请继续生效
          if (!cat || cat._openid !== invite.inviter) continue
          const sharedWith = cat.shared_with || []
          if (!sharedWith.includes(openid)) {
            await db.collection('cats').doc(catId).update({
              data: { shared_with: _.addToSet(openid) }
            })
            modified++
          }
        }

        await db.collection('invites').doc(token).update({
          data: { used_by: _.addToSet(openid) }
        })
        return { success: true, modified }
      }

      case 'unbindSharedCat': {
        const { catId } = payload
        const cat = await checkCatAccess(catId)
        if (cat._openid === openid) {
          throw new Error('You are the creator, use deleteCat instead')
        }
        // Remove self from shared_with
        await db.collection('cats').doc(catId).update({
          data: {
            shared_with: _.pull(openid)
          }
        })
        return { success: true }
      }

      case 'removeFamilyMember': {
        const { targetOpenid } = payload
        if (!targetOpenid) throw new Error('Missing targetOpenid')
        if (targetOpenid === openid) throw new Error('Cannot remove yourself this way')

        // Find all cats created by the CURRENT user
        const { data: myCats } = await db.collection('cats').where({
          _openid: openid
        }).get()

        let modified = 0
        for (let cat of myCats) {
          if (cat.shared_with && cat.shared_with.includes(targetOpenid)) {
            await db.collection('cats').doc(cat._id).update({
              data: {
                shared_with: _.pull(targetOpenid)
              }
            })
            modified++
          }
        }

        // 作废当前用户发出的全部邀请，防止被移除者再次点击旧链接重新加入
        await db.collection('invites').where({ inviter: openid, revoked: false }).update({
          data: { revoked: true, revokeTime: Date.now() }
        }).catch(e => console.warn('revoke invites warning:', e.message))

        return { success: true, modified }
      }

      // ==================== 猫咪档案 ====================

      case 'getCats': {
        const { data } = await db.collection('cats').where(_.or([
          { _openid: openid },
          { shared_with: openid }
        ])).get()
        
        // 不再转换 tempFileURL，微信端原生支持 cloud:// 且无过期问题

        return { success: true, data }
      }

      case 'saveCat': {
        const { catId } = payload
        // 字段白名单：禁止通过 saveCat 修改 _openid / shared_with 等权限字段
        const catData = pick(payload.catData, CAT_FIELDS)
        if (catData.name !== undefined) catData.name = String(catData.name).slice(0, 30)
        if (catData.targetMin !== undefined) catData.targetMin = Number(catData.targetMin)
        if (catData.targetMax !== undefined) catData.targetMax = Number(catData.targetMax)
        catData.updateTime = Date.now()
        
        // 执行安全校验
        if (catData.name) {
          await checkTextSecurity(catData.name)
        }
        if (catData.avatar) {
          await checkImageSecurity(catData.avatar)
        }

        if (catId) {
          // Update existing cat
          await checkCatAccess(catId)
          await db.collection('cats').doc(catId).update({
            data: catData
          })
          return { success: true, id: catId }
        } else {
          // Add new cat
          if (!catData.name) throw new Error('Missing cat name')
          catData.shared_with = []
          catData._openid = openid
          catData.createTime = Date.now()
          const res = await db.collection('cats').add({
            data: catData
          })
          return { success: true, id: res._id }
        }
      }

      case 'deleteCat': {
        const { catId } = payload
        const cat = await checkCatAccess(catId)
        if (cat._openid !== openid) {
          throw new Error('Only the creator can delete the cat completely')
        }
        // Delete the cat
        await db.collection('cats').doc(catId).remove()
        
        // Also delete related records (并行删除)
        await Promise.all(
          RECORD_COLLECTIONS.map(name => db.collection(name).where({ cat_id: catId }).remove())
        )
        await db.collection('reminders').where({ cat_id: catId, status: 'pending' }).remove().catch(() => {})
        
        return { success: true }
      }

      // ==================== 自动喂食机 ====================

      case 'saveFeederConfig': {
        const { catId } = payload
        await checkCatAccess(catId)
        const config = sanitizeFeederConfig(catId, payload.config)
        await db.collection('cats').doc(catId).update({
          data: {
            auto_feeder_config: _.set(config)
          }
        })
        return { success: true, config }
      }

      case 'getFeederConfig': {
        const { catId } = payload
        const cat = await checkCatAccess(catId)
        return { success: true, config: cat.auto_feeder_config || null }
      }

      // 服务端幂等补录：使用确定性 _id，家庭多人同时打开也不会重复写入
      case 'syncAutoFeeder': {
        const { catId, today, currentTime } = payload
        const tzOffset = clampInt(payload.tzOffset, -840, 840, -480) // Date.getTimezoneOffset()，中国为 -480
        if (!DATE_RE.test(String(today || '')) || !TIME_RE.test(String(currentTime || ''))) {
          throw new Error('Invalid date/time')
        }
        const cat = await checkCatAccess(catId)
        const config = cat.auto_feeder_config
        if (!config || !config.is_active || !Array.isArray(config.schedule)) {
          return { success: true, syncedCount: 0, syncedMeals: [] }
        }

        // 今日已有（含手动录入）的饮食时刻
        const { data: todayMeals } = await db.collection('meal_records')
          .where({ cat_id: catId, record_date: today })
          .field({ meal_time: true })
          .limit(100)
          .get()
        const existingTimes = new Set((todayMeals || []).map(r => r.meal_time).filter(Boolean))

        const [y, m, d] = today.split('-').map(Number)
        const syncedMeals = []
        for (const item of config.schedule) {
          if (!item || !TIME_RE.test(String(item.time || '')) || Number(item.food_grams) <= 0) continue
          if (item.time > currentTime || existingTimes.has(item.time)) continue

          const [hh, mm] = item.time.split(':').map(Number)
          const createTime = Date.UTC(y, m - 1, d, hh, mm, 0) + tzOffset * 60000
          const docId = `feeder_${catId}_${today}_${item.time.replace(':', '')}`
          try {
            await db.collection('meal_records').add({
              data: {
                _id: docId,
                cat_id: catId,
                food_grams: Number(item.food_grams),
                period: item.period || '自动喂食机出餐',
                food_brand: config.default_brand || '',
                extras: config.default_extras || '',
                record_date: today,
                meal_time: item.time,
                note: config.default_note || '自动喂食机定时出餐',
                createTime,
                source: 'auto_feeder',
                created_by: openid
              }
            })
            existingTimes.add(item.time)
            syncedMeals.push(`${item.time} (${item.food_grams}g)`)
          } catch (e) {
            // _id 冲突 = 其他设备已补录，忽略即可
            const msg = String(e.errMsg || e.message || '')
            if (!/duplicate|exist|-502001/i.test(msg)) throw e
          }
        }

        if (syncedMeals.length > 0) {
          await db.collection('cats').doc(catId).update({
            data: { 'auto_feeder_config.last_sync_date': today }
          })
        }
        return { success: true, syncedCount: syncedMeals.length, syncedMeals }
      }

      // ==================== 通用记录 ====================

      case 'getRecords': {
        const { catId, type } = payload
        assertRecordType(type)
        await checkCatAccess(catId)
        const limit = clampInt(payload.limit, 1, 100, 20)
        const skip = clampInt(payload.skip, 0, 100000, 0)
        const { data } = await db.collection(type)
          .where({ cat_id: catId })
          .orderBy('createTime', 'desc')
          .skip(skip)
          .limit(limit)
          .get()
        return { success: true, data }
      }

      case 'addRecord': {
        const { type } = payload
        assertRecordType(type)
        const raw = payload.recordData || {}
        await checkCatAccess(raw.cat_id)
        const recordData = pick(raw, RECORD_FIELDS[type])
        if (recordData.note !== undefined) recordData.note = String(recordData.note).slice(0, 500)
        if (typeof recordData.createTime !== 'number' || isNaN(recordData.createTime)) {
          recordData.createTime = Date.now()
        }
        recordData.cat_id = raw.cat_id
        recordData.created_by = openid
        const res = await db.collection(type).add({
          data: recordData
        })
        return { success: true, id: res._id }
      }

      case 'deleteRecord': {
        const { catId, type, recordId } = payload
        assertRecordType(type)
        if (!recordId) throw new Error('Missing recordId')
        await checkCatAccess(catId)
        // 同时匹配 _id 与 cat_id，防止借自己的猫删除他人的记录
        const res = await db.collection(type).where({ _id: recordId, cat_id: catId }).remove()
        if (!res.stats || res.stats.removed === 0) {
          throw new Error('Record not found')
        }
        return { success: true }
      }

      // ==================== 工具 ====================

      case 'recognizeNutrition': {
        const { fileID } = payload
        if (!fileID) throw new Error('Missing fileID')
        
        let ocrText = ''
        try {
          // 获取临时真实 HTTP 链接
          const tempRes = await cloud.getTempFileURL({
            fileList: [fileID]
          })
          const imgUrl = tempRes.fileList[0].tempFileURL
          
          // 调用微信原生 OCR 接口
          const ocrRes = await cloud.openapi.ocr.printedText({
            imgUrl: imgUrl
          })
          
          if (ocrRes.items) {
            ocrText = ocrRes.items.map(item => item.text).join(' ')
          }
        } catch (e) {
          console.error('OCR Error:', e)
          try { await cloud.deleteFile({ fileList: [fileID] }) } catch(delErr){}
          throw new Error('识别失败: ' + (e.errMsg || e.message || '未知错误'))
        }
        
        // 识别完成后立即删除临时图片，节省云空间
        try { await cloud.deleteFile({ fileList: [fileID] }) } catch(e){}
        
        // 核心解析算法 3.0（严格非中文字符跨越，彻底杜绝配料表串台）
        // 允许跨越：英文字母、符号、空格，以及极少量的特定允许汉字
        // 拒绝跨越：任何数字、任何其他任意中文字符（如“素”、“外”、“蛋”、“肉”）
        const parseValue = (keywords) => {
          for (const keyword of keywords) {
            // 允许的汉字白名单：质,分,含,量,最,大,小,多,少,高,低,以,上,下,不,于,等,保,证,值,承,诺,标,准,一 (防止把破折号识别成一)
            const regex = new RegExp(keyword + "(?:[^0-9\\u4e00-\\u9fa5]|[质分含量最大最小多少高低以上下不于等保证值承诺标准一]){0,45}?(\\d+(?:\\.\\d+)?)")
            const match = ocrText.match(regex)
            if (match && match[1]) {
              return match[1]
            }
          }
          return ''
        }
        
        const result = {
          protein: parseValue(['粗蛋白', '蛋白质', '蛋白']),
          fat: parseValue(['粗脂肪', '脂肪']),
          moisture: parseValue(['水分', '水份']),
          fiber: parseValue(['粗纤维', '纤维']),
          ash: parseValue(['粗灰分', '灰分'])
        }
        
        return { success: true, text: ocrText, parsed: result }
      }

      // 导出报告下载完成后清理云存储（仅允许删除自己的报告文件）
      case 'deleteReportFile': {
        const { fileID } = payload
        if (!fileID || typeof fileID !== 'string' || !fileID.includes(`/reports/${openid}/`)) {
          throw new Error('Permission denied')
        }
        await cloud.deleteFile({ fileList: [fileID] })
        return { success: true }
      }

      // ==================== 用户 ====================

      case 'saveUser': {
        const { nickName, avatarUrl } = payload
        
        if (!nickName || nickName.trim() === '') {
          throw new Error('昵称不能为空')
        }

        // 执行安全校验
        if (nickName) {
          await checkTextSecurity(nickName)
        }
        if (avatarUrl) {
          await checkImageSecurity(avatarUrl)
        }

        const { data } = await db.collection('users').where({ _openid: openid }).get()
        if (data && data.length > 0) {
          await db.collection('users').doc(data[0]._id).update({
            data: { nickName, avatarUrl, updateTime: Date.now() }
          })
        } else {
          await db.collection('users').add({
            data: { _openid: openid, nickName, avatarUrl, createTime: Date.now(), updateTime: Date.now() }
          })
        }
        return { success: true }
      }

      case 'getUsers': {
        const { openids } = payload
        if (!openids || !Array.isArray(openids)) {
          throw new Error('Missing or invalid openids array')
        }

        // 仅允许查询与自己存在共享关系的成员资料，防止枚举任意用户
        const { data: myCats } = await db.collection('cats').where(_.or([
          { _openid: openid },
          { shared_with: openid }
        ])).field({ _openid: true, shared_with: true }).get()
        const related = new Set([openid])
        ;(myCats || []).forEach(c => {
          if (c._openid) related.add(c._openid)
          ;(c.shared_with || []).forEach(id => related.add(id))
        })

        const MAX_LIMIT = 20
        const queryOpenids = openids.filter(id => related.has(id)).slice(0, MAX_LIMIT)
        if (queryOpenids.length === 0) return { success: true, data: [] }
        
        const { data } = await db.collection('users').where({
          _openid: _.in(queryOpenids)
        }).field({ _openid: true, nickName: true, avatarUrl: true }).get()
        
        // 不再转换 tempFileURL，微信端原生支持 cloud:// 且无过期问题
        
        return { success: true, data }
      }

      case 'getMyInfo': {
        const { data } = await db.collection('users').where({ _openid: openid }).get()
        if (data && data.length > 0) {
          // 原生使用 cloud://
          const avatarTempUrl = data[0].avatarUrl
          return { success: true, userInfo: { openid: openid, nickName: data[0].nickName, avatarUrl: avatarTempUrl } }
        }
        return { success: true, userInfo: { openid: openid, nickName: '铲屎官', avatarUrl: '' } }
      }

      default:
        throw new Error(`Unknown action: ${action}`)
    }
  } catch (err) {
    console.error(`Error executing action ${action}:`, err)
    return { success: false, error: err.message }
  }
}
