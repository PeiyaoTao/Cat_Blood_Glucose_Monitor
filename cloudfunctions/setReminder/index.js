const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const ALLOWED_TYPES = ['胰岛素注射', '血糖检测', '医疗提醒']
const MAX_AHEAD_MS = 7 * 24 * 3600 * 1000 // 最多提前 7 天设置

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { catId, templateId } = event
  const triggerTime = Number(event.triggerTime)
  const reminderType = ALLOWED_TYPES.includes(event.reminderType) ? event.reminderType : '医疗提醒'
  
  if (!triggerTime || !templateId) {
    return { code: -1, msg: 'Missing parameters' }
  }

  const now = Date.now()
  if (isNaN(triggerTime) || triggerTime < now - 60 * 1000 || triggerTime > now + MAX_AHEAD_MS) {
    return { code: -1, msg: '提醒时间无效' }
  }

  try {
    // 权限校验：只能为自己创建或被共享的猫咪设置提醒
    if (catId && catId !== 'default') {
      let cat = null
      try {
        const res = await db.collection('cats').doc(catId).get()
        cat = res.data
      } catch (e) {
        return { code: -1, msg: '猫咪档案不存在' }
      }
      if (!cat || (cat._openid !== openid && !(cat.shared_with || []).includes(openid))) {
        return { code: -1, msg: 'Permission denied' }
      }
    }

    const res = await db.collection('reminders').add({
      data: {
        _openid: openid,
        cat_id: catId || 'default',
        trigger_time: triggerTime,
        template_id: String(templateId),
        reminder_type: reminderType,
        status: 'pending',
        create_time: db.serverDate()
      }
    })

    return { code: 0, _id: res._id }
  } catch (err) {
    console.error(err)
    return { code: -1, msg: err.message }
  }
}
