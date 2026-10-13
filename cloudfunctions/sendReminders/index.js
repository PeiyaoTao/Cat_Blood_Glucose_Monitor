const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const MP_STATE = ['developer', 'trial', 'formal'].includes(process.env.MP_STATE) ? process.env.MP_STATE : 'formal'

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
      // 云函数运行环境为 UTC，需手动换算为北京时间 (UTC+8) 再格式化
      const d = new Date(Number(task.trigger_time) + 8 * 3600 * 1000)
      const pad = (n) => String(n).padStart(2, '0')
      const timeStr = `${d.getUTCFullYear()}年${pad(d.getUTCMonth() + 1)}月${pad(d.getUTCDate())}日 ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`

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
              value: task.reminder_type || '医疗提醒'
            },
            time2: {
              value: timeStr
            },
            thing3: {
              value: task.reminder_type === '血糖检测' ? '该给猫咪测血糖啦！' : '该给猫咪打针啦！'
            }
          },
          // developer 为开发版；trial 为体验版；formal 为正式版
          // 默认正式版，调试时可在云函数环境变量中设置 MP_STATE=developer / trial
          miniprogramState: MP_STATE
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
