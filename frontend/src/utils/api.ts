// 云函数 api 支持的全部 action
export type ApiAction =
  | 'createInvite'
  | 'acceptInvite'
  | 'unbindSharedCat'
  | 'removeFamilyMember'
  | 'getCats'
  | 'saveCat'
  | 'deleteCat'
  | 'saveFeederConfig'
  | 'getFeederConfig'
  | 'syncAutoFeeder'
  | 'getRecords'
  | 'addRecord'
  | 'updateRecord'
  | 'deleteRecord'
  | 'recognizeNutrition'
  | 'deleteReportFile'
  | 'saveUser'
  | 'getUsers'
  | 'getMyInfo'

export type RecordType =
  | 'blood_glucose'
  | 'insulin_records'
  | 'meal_records'
  | 'excretion_records'
  | 'weight_records'

export interface ApiResult {
  success: boolean
  error?: string
  [key: string]: any
}

// 会修改猫咪档案或健康记录的 action：调用成功后自动标记数据已变更，首页据此决定是否刷新
const MUTATING_ACTIONS: ApiAction[] = [
  'acceptInvite',
  'unbindSharedCat',
  'removeFamilyMember',
  'saveCat',
  'deleteCat',
  'saveFeederConfig',
  'addRecord',
  'updateRecord',
  'deleteRecord'
]

let dataDirty = true
let dataVersion = 1

// 手动标记数据已变更（例如通过其他云函数导入了数据）
export const markDataDirty = () => {
  dataDirty = true
  dataVersion++
}

export const getDataVersion = (): number => dataVersion

// 读取并清除变更标记
export const consumeDataDirty = (): boolean => {
  const dirty = dataDirty
  dataDirty = false
  return dirty
}

export const callApi = async (action: ApiAction, payload: Record<string, any> = {}): Promise<ApiResult> => {
  if (typeof wx === 'undefined' || !wx.cloud) {
    console.error('wx.cloud is not available')
    throw new Error('wx.cloud is not available')
  }
  
  try {
    const res = await wx.cloud.callFunction({
      name: 'api',
      data: {
        action,
        payload
      }
    })
    
    if (res.result && res.result.success) {
      if (
        MUTATING_ACTIONS.includes(action) ||
        (action === 'syncAutoFeeder' && Number(res.result.syncedCount) > 0)
      ) {
        markDataDirty()
      }
      return res.result
    } else {
      console.error(`API Error (${action}):`, res.result?.error)
      throw new Error(res.result?.error || 'Unknown API Error')
    }
  } catch (err) {
    console.error(`Cloud function call failed (${action}):`, err)
    throw err
  }
}

/**
 * 调用独立云函数（exportExcel / importExcel / setReminder / login）的统一网关封装
 */
export const callCloudFunction = async <T = any>(
  name: 'exportExcel' | 'importExcel' | 'setReminder' | 'login',
  data: Record<string, any> = {}
): Promise<T> => {
  if (typeof wx === 'undefined' || !wx.cloud) {
    throw new Error('wx.cloud is not available')
  }
  const res = await wx.cloud.callFunction({ name, data })
  return (res?.result ?? {}) as T
}

// 格式化本地日期 YYYY-MM-DD
export const getLocalTodayDate = (): string => {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 格式化本地时间 HH:mm
export const getLocalCurrentTime = (): string => {
  const d = new Date()
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 安全地根据 年-月-日 和 时:分(:秒) 构造本地时间戳（彻底避免 ISO 时区位移导致日期前移一天的 BUG，并支持秒级精度与同分防碰撞）
export const makeLocalTimestamp = (dateStr: string, timeStr?: string): number => {
  if (!dateStr) return Date.now()
  const [y, m, d] = dateStr.split('-').map(Number)
  let hour = 0
  let min = 0
  let sec = 0
  let ms = 0
  if (timeStr) {
    const parts = timeStr.split(':').map(Number)
    hour = parts[0] || 0
    min = parts[1] || 0
    if (parts.length >= 3 && !isNaN(parts[2])) {
      sec = parts[2]
    } else {
      const now = new Date()
      const isToday = now.getFullYear() === y && now.getMonth() === m - 1 && now.getDate() === d
      const isCurrentMinute = isToday && now.getHours() === hour && now.getMinutes() === min
      if (isCurrentMinute) {
        sec = now.getSeconds()
        ms = now.getMilliseconds()
      } else {
        // 过去/指定时间：保留毫秒级偏移量 (0~999ms)，防止同一分钟内连续录入时毫秒完全相同导致排序不稳定
        ms = now.getMilliseconds()
      }
    }
  }
  return new Date(y, m - 1, d, hour, min, sec, ms).getTime()
}

// 计算从某个本地日期 (YYYY-MM-DD) 到今天经过的自然日天数（按本地零点计算，不受时区影响）
export const daysSinceLocalDate = (dateStr: string): number => {
  if (!dateStr) return 0
  const start = makeLocalTimestamp(dateStr)
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.max(0, Math.round((todayStart - start) / (24 * 3600 * 1000)))
}

// 安全返回上一页，防止在首个页面栈直接 navigateBack 抛出 SystemError
export const safeNavigateBack = (fallbackUrl: string = '/pages/index/index') => {
  const pages = getCurrentPages()
  if (pages && pages.length > 1) {
    uni.navigateBack()
  } else {
    uni.switchTab({ url: fallbackUrl })
  }
}
