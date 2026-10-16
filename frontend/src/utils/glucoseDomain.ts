import { makeLocalTimestamp } from './api'

/**
 * 临床控糖默认安全目标范围（参考 T/CVMA 195-2024《犬猫糖尿病的筛查和诊断》）
 */
export const DEFAULT_TARGET_MIN = 5.0
export const DEFAULT_TARGET_MAX = 15.0
export const WARNING_BUFFER_RATIO = 1.3
export const HYPO_SEVERE_THRESHOLD = 3.9

const HYPO_ALERT_STORAGE_KEY = 'hypo_alert_enabled'

/**
 * 读取低血糖急救弹窗开关状态（默认开启 true）
 * 优先参考当前猫咪档案的云端字段，其次读取本地缓存设置
 */
export const getHypoAlertSetting = (cat?: { hypoAlertEnabled?: boolean } | null): boolean => {
  try {
    const localVal = uni.getStorageSync(HYPO_ALERT_STORAGE_KEY)
    if (localVal === false || localVal === 'false') return false
    if (localVal === true || localVal === 'true') return true
  } catch (e) {}
  if (cat && typeof cat.hypoAlertEnabled === 'boolean') {
    return cat.hypoAlertEnabled
  }
  return true
}

/**
 * 保存低血糖急救弹窗开关状态到本地缓存
 */
export const setHypoAlertSetting = (enabled: boolean) => {
  try {
    uni.setStorageSync(HYPO_ALERT_STORAGE_KEY, Boolean(enabled))
  } catch (e) {}
}

export interface GlucoseStatusMeta {
  level: 'empty' | 'low' | 'normal' | 'warning' | 'danger'
  color: string
  text: string
  badgeClass: 'badge-gray' | 'badge-red' | 'badge-green' | 'badge-yellow'
  homeTextClass: '' | 'text-danger' | 'text-safe' | 'text-warning'
  historyTextClass: '' | 'text-danger' | 'text-normal' | 'text-warning'
}

/**
 * 规范化猫咪的目标血糖上下限，保证返回合法的 { min, max }
 */
export const normalizeTargetRange = (
  rawMin?: unknown,
  rawMax?: unknown
): { min: number; max: number } => {
  const parsedMin = Number(rawMin)
  const parsedMax = Number(rawMax)
  const min = !isNaN(parsedMin) && parsedMin > 0 && parsedMin < 50 ? parsedMin : DEFAULT_TARGET_MIN
  const max = !isNaN(parsedMax) && parsedMax > 0 && parsedMax <= 60 ? parsedMax : DEFAULT_TARGET_MAX
  if (min >= max) {
    return { min: DEFAULT_TARGET_MIN, max: Math.max(DEFAULT_TARGET_MAX, min + 2) }
  }
  return { min, max }
}

/**
 * 评估单次或平均血糖数值的临床状态与展示色彩元数据
 */
export const evaluateGlucoseStatus = (
  bg: number,
  rawMin?: unknown,
  rawMax?: unknown
): GlucoseStatusMeta => {
  const { min, max } = normalizeTargetRange(rawMin, rawMax)
  const warningMax = max * WARNING_BUFFER_RATIO

  if (typeof bg !== 'number' || isNaN(bg) || bg <= 0) {
    return {
      level: 'empty',
      color: '#94A3B8',
      text: '无数据',
      badgeClass: 'badge-gray',
      homeTextClass: '',
      historyTextClass: ''
    }
  }
  if (bg < min) {
    return {
      level: 'low',
      color: '#DC2626',
      text: '低血糖',
      badgeClass: 'badge-red',
      homeTextClass: 'text-danger',
      historyTextClass: 'text-danger'
    }
  }
  if (bg <= max) {
    return {
      level: 'normal',
      color: '#16A34A',
      text: '达标',
      badgeClass: 'badge-green',
      homeTextClass: 'text-safe',
      historyTextClass: 'text-normal'
    }
  }
  if (bg <= warningMax) {
    return {
      level: 'warning',
      color: '#CA8A04',
      text: '偏高',
      badgeClass: 'badge-yellow',
      homeTextClass: 'text-warning',
      historyTextClass: 'text-warning'
    }
  }
  return {
    level: 'danger',
    color: '#DC2626',
    text: '危险过高',
    badgeClass: 'badge-red',
    homeTextClass: 'text-danger',
    historyTextClass: 'text-danger'
  }
}

/**
 * 根据本地出生日期 (YYYY-MM-DD) 计算猫咪周岁年龄；未设置或无效时返回 null（不展示 0岁）
 */
export const calculateCatAge = (birthday?: string): number | null => {
  if (!birthday || typeof birthday !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
    return null
  }
  const ts = makeLocalTimestamp(birthday)
  const bDate = new Date(ts)
  if (isNaN(bDate.getTime())) return null

  const today = new Date()
  let ageNum = today.getFullYear() - bDate.getFullYear()
  const m = today.getMonth() - bDate.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
    ageNum--
  }
  return Math.max(0, ageNum)
}
