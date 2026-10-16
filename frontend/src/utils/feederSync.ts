import { callApi, getLocalTodayDate, getLocalCurrentTime } from './api'

export interface AutoFeederMealItem {
  id?: string
  time: string
  food_grams: number
  period?: string
}

export interface AutoFeederConfig {
  cat_id: string
  is_active: boolean
  schedule: AutoFeederMealItem[]
  default_brand: string
  default_extras: string
  default_note: string
  last_sync_date?: string
}

const STORAGE_KEY_PREFIX = 'auto_feeder_config_'

// 并发防重锁与分钟级节流缓存（防止 App.onShow 与 Index.onShow 同时触发两次云函数调用）
const inFlightSyncMap = new Map<string, Promise<{ syncedCount: number; syncedMeals: string[] }>>()
const lastSyncedMinuteMap = new Map<string, string>()

const normalizeConfig = (catId: string, raw?: any): AutoFeederConfig => ({
  cat_id: catId || 'default',
  is_active: Boolean(raw?.is_active),
  schedule: Array.isArray(raw?.schedule) ? raw.schedule : [],
  default_brand: raw?.default_brand || '',
  default_extras: raw?.default_extras || '',
  default_note: raw?.default_note || '自动喂食机定时出餐',
  last_sync_date: raw?.last_sync_date || ''
})

// 获取指定猫咪的自动喂食配置 (从本地缓存，仅用于快速展示)
export const getFeederConfig = (catId: string): AutoFeederConfig => {
  const raw = uni.getStorageSync(STORAGE_KEY_PREFIX + (catId || 'default'))
  return normalizeConfig(catId, raw)
}

// 从云端拉取并同步到本地缓存（云端为唯一可信来源）
export const fetchFeederConfigFromCloud = async (catId: string): Promise<AutoFeederConfig> => {
  const targetId = catId || 'default'
  try {
    const res = await callApi('getFeederConfig', { catId: targetId })
    const cfg = normalizeConfig(targetId, res.config)
    uni.setStorageSync(STORAGE_KEY_PREFIX + targetId, cfg)
    return cfg
  } catch (err) {
    console.log('[AutoFeeder] 云端拉取配置提示:', err)
  }
  return getFeederConfig(targetId)
}

// 保存指定猫咪的自动喂食配置（先写云端，成功后再更新本地缓存；失败会抛出异常供页面提示）
export const saveFeederConfig = async (config: AutoFeederConfig): Promise<AutoFeederConfig> => {
  const targetId = config.cat_id || 'default'
  const res = await callApi('saveFeederConfig', {
    catId: targetId,
    config
  })
  const saved = normalizeConfig(targetId, res.config || config)
  uni.setStorageSync(STORAGE_KEY_PREFIX + targetId, saved)
  // 配置变更后清除节流标记，允许立即触发补录
  lastSyncedMinuteMap.delete(targetId)
  return saved
}

// 检查配置是否已设置完整（至少 1 顿且克数大于 0）
export const isFeederConfigValid = (config: AutoFeederConfig): boolean => {
  if (!config || !Array.isArray(config.schedule) || config.schedule.length === 0) {
    return false
  }
  return config.schedule.some(item => Boolean(item.time) && Number(item.food_grams) > 0)
}

// 执行自动喂食机智能对齐补录（Smart Catch-Up）
// 补录逻辑在云函数中执行：读取云端配置 + 确定性 _id 写入，多设备/多成员同时打开也不会重复
export const checkAndSyncAutoFeeder = async (
  targetCatId?: string,
  force: boolean = false
): Promise<{ syncedCount: number; syncedMeals: string[] }> => {
  const catId = targetCatId || uni.getStorageSync('currentCatId')
  if (!catId || catId === 'default') {
    return { syncedCount: 0, syncedMeals: [] }
  }

  // 若已有同一猫咪的同步请求在途，直接复用该 Promise
  const existingTask = inFlightSyncMap.get(catId)
  if (existingTask) {
    return existingTask
  }

  const today = getLocalTodayDate()
  const currentTime = getLocalCurrentTime()
  const minuteKey = `${today}_${currentTime}`

  if (!force && lastSyncedMinuteMap.get(catId) === minuteKey) {
    return { syncedCount: 0, syncedMeals: [] }
  }

  const task = (async () => {
    try {
      const res = await callApi('syncAutoFeeder', {
        catId,
        today,
        currentTime,
        tzOffset: new Date().getTimezoneOffset()
      })
      lastSyncedMinuteMap.set(catId, minuteKey)
      const syncedMeals: string[] = res.syncedMeals || []
      if (syncedMeals.length > 0) {
        console.log(`[AutoFeeder] 自动同步补齐 ${syncedMeals.length} 顿出餐记录:`, syncedMeals)
      }
      return { syncedCount: syncedMeals.length, syncedMeals }
    } catch (err) {
      console.error('[AutoFeeder] 自动对齐异常:', err)
      return { syncedCount: 0, syncedMeals: [] }
    } finally {
      inFlightSyncMap.delete(catId)
    }
  })()

  inFlightSyncMap.set(catId, task)
  return task
}
