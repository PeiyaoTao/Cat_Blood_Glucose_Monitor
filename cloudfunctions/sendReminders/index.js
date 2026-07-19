const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  try {
    const now = Date.now()
    
    // 查询所有到期且 pending 的提醒
    const res = await db.collection('reminders').where({
      status: 'pending',
      trigger_time: _.lte(now)
    }).limit(100).get()

    const tasks = res.data

    if (tasks.length === 0) {
      return { code: 0, msg: 'No pending tasks' }
    }

    let successCount = 0
    let failCount = 0

    for (let task of tasks) {
      const d = new Date(task.trigger_time)
      const timeStr = `${d.getFullYear()}年${String(d.getMonth()+1).padStart(2,'0')}月${String(d.getDate()).padStart(2,'0')}日 ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`

      try {
        // 调用发送订阅消息 API
        await cloud.openapi.subscribeMessage.send({
          touser: task._openid,
          templateId: task.template_id,
          page: 'pages/index/index',
          lang: 'zh_CN',
          data: {
            // ==========================================
            // 注意！这里的 thing1, time2, thing3 必须和你申请的模板详情里右侧的变量名严格一致！
            // 微信对 thing (20字以内) 和 time (时间格式) 有极其严格的长度和格式要求！
            // 如果报错 "data.xxx is invalid"，请核对微信后台你勾选的字段名并在此修改。
            // 例如你的字段名叫 "thing2", 这里就要改成 "thing2"
            // ==========================================
            thing1: {
              value: '胰岛素注射'
            },
            time2: {
              value: timeStr
            },
            thing3: {
              value: '该给猫咪打针啦！'
            }
          },
          miniprogramState: 'developer' // developer为开发版；trial为体验版；formal为正式版
        })

        // 成功后标记状态
        await db.collection('reminders').doc(task._id).update({
          data: { status: 'sent', send_time: db.serverDate() }
        })
        successCount++
      } catch (err) {
        console.error('Send failed for task', task._id, err)
        // 标记失败，避免无限重试
        await db.collection('reminders').doc(task._id).update({
          data: { status: 'failed', fail_reason: err.message }
        })
        failCount++
      }
    }

    return { code: 0, successCount, failCount }
  } catch (e) {
    console.error(e)
    return { code: -1, msg: e.message }
  }
}
