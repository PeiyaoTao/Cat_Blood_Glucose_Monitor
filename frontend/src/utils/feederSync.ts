import { callApi, getLocalTodayDate, getLocalCurrentTime, makeLocalTimestamp } from './api'

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

const normalizeConfig = (catId: string, raw?: any): AutoFeederConfig => ({
  cat_id: catId || 'default',
  is_active: Boolean(raw?.is_active),
  schedule: Array.isArray(raw?.schedule) ? raw.schedule : [],
  default_brand: raw?.default_brand || '',
  default_extras: raw?.default_extras || '',
  default_note: raw?.default_note || '自动喂食机定时出餐',
  last_sync_date: raw?.last_sync_date || ''
})

// 获取指定猫咪的自动喂食配置 (从本地缓存)
export const getFeederConfig = (catId: string): AutoFeederConfig => {
  const raw = uni.getStorageSync(STORAGE_KEY_PREFIX + (catId || 'default'))
  return normalizeConfig(catId, raw)
}

// 从云端拉取并同步到本地缓存
export const fetchFeederConfigFromCloud = async (catId: string): Promise<AutoFeederConfig> => {
  const targetId = catId || 'default'
  try {
    const res = await callApi('getFeederConfig', { catId: targetId })
    if (res.config) {
      const cfg = normalizeConfig(targetId, res.config)
      uni.setStorageSync(STORAGE_KEY_PREFIX + targetId, cfg)
      return cfg
    }
  } catch (err) {
    console.log('[AutoFeeder] 云端拉取配置提示:', err)
  }
  return getFeederConfig(targetId)
}

// 保存指定猫咪的自动喂食配置 (双写: 本地缓存 + 云端持久化)
export const saveFeederConfig = (config: AutoFeederConfig) => {
  const targetId = config.cat_id || 'default'
  uni.setStorageSync(STORAGE_KEY_PREFIX + targetId, config)
  
  callApi('saveFeederConfig', {
    catId: targetId,
    config
  }).catch(err => {
    console.error('[AutoFeeder] 云端保存配置失败:', err)
  })
}

// 检查配置是否已设置完整（至少 1 顿且克数大于 0）
export const isFeederConfigValid = (config: AutoFeederConfig): boolean => {
  if (!config || !Array.isArray(config.schedule) || config.schedule.length === 0) {
    return false
  }
  return config.schedule.some(item => Boolean(item.time) && Number(item.food_grams) > 0)
}

// 执行自动喂食机智能对齐补录（Smart Catch-Up）
export const checkAndSyncAutoFeeder = async (targetCatId?: string): Promise<{ syncedCount: number; syncedMeals: string[] }> => {
  const catId = targetCatId || uni.getStorageSync('currentCatId') || 'default'
  const config = getFeederConfig(catId)

  if (!config.is_active || !isFeederConfigValid(config)) {
    return { syncedCount: 0, syncedMeals: [] }
  }

  const today = getLocalTodayDate()
  const currentTime = getLocalCurrentTime()

  const syncedMeals: string[] = []

  try {
    // 1. 通过云函数安全拉取当前猫咪最近饮食记录，构建查重索引
    const existingRes = await callApi('getRecords', {
      catId: catId,
      type: 'meal_records',
      limit: 100
    })

    const existingTimes = new Set<string>()
    if (existingRes.data && Array.isArray(existingRes.data)) {
      existingRes.data.forEach((r: any) => {
        // 匹配今日记录
        if (r.record_date === today && r.meal_time) {
          existingTimes.add(r.meal_time)
        }
      })
    }

    // 2. 遍历出餐时刻表，对今日已到达且未记录的餐次进行静默补齐
    for (const item of config.schedule) {
      if (!item.time || Number(item.food_grams) <= 0) continue

      // 只要该餐次设定时间 <= 当前时间，且今日数据库中未曾记录过
      if (item.time <= currentTime && !existingTimes.has(item.time)) {
        const recordData = {
          cat_id: catId,
          food_grams: Number(item.food_grams),
          period: item.period || '自动喂食机出餐',
          food_brand: config.default_brand || '',
          extras: config.default_extras || '',
          record_date: today,
          meal_time: item.time,
          note: config.default_note || '自动喂食机定时出餐',
          createTime: makeLocalTimestamp(today, item.time)
        }

        await callApi('addRecord', { type: 'meal_records', recordData })
        existingTimes.add(item.time)
        syncedMeals.push(`${item.time} (${item.food_grams}g)`)
      }
    }

    if (syncedMeals.length > 0) {
      config.last_sync_date = today
      saveFeederConfig(config)
      console.log(`[AutoFeeder] 自动同步补齐 ${syncedMeals.length} 顿出餐记录:`, syncedMeals)
    }

    return { syncedCount: syncedMeals.length, syncedMeals }
  } catch (err) {
    console.error('[AutoFeeder] 自动对齐异常:', err)
    return { syncedCount: 0, syncedMeals: [] }
  }
}
