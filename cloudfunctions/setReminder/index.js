const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  const { triggerTime, catId, templateId, reminderType } = event
  
  if (!triggerTime || !templateId) {
    return { code: -1, msg: 'Missing parameters' }
  }

  try {
    const res = await db.collection('reminders').add({
      data: {
        _openid: openid,
        cat_id: catId || 'default',
        trigger_time: triggerTime,
        template_id: templateId,
        reminder_type: reminderType || '医疗提醒',
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
