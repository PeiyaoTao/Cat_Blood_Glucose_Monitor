import { ref, computed } from 'vue'
import { callApi, getDataVersion, markDataDirty } from '@/utils/api'
import { normalizeTargetRange } from '@/utils/glucoseDomain'

export interface CatDoc {
  _id: string
  _openid?: string
  name: string
  avatar?: string
  birthday?: string
  diagnosis_date?: string
  targetMin?: number
  targetMax?: number
  hypoAlertEnabled?: boolean
  shared_with?: string[]
  auto_feeder_config?: any
}

const allCats = ref<CatDoc[]>([])
const currentCatId = ref<string>(uni.getStorageSync('currentCatId') || '')
const myOpenid = ref<string>('')

// 初始化时尝试从本地缓存恢复 openid
try {
  const cachedUser = uni.getStorageSync('userInfo')
  if (cachedUser) {
    const parsed = typeof cachedUser === 'string' ? JSON.parse(cachedUser) : cachedUser
    if (parsed && parsed.openid) {
      myOpenid.value = parsed.openid
    }
  }
} catch (e) {}

let inFlightCatsPromise: Promise<CatDoc[]> | null = null
let lastFetchedVersion = -1
let lastFetchedAt = 0
const CATS_CACHE_TTL_MS = 60 * 1000

const syncOpenidToStorage = (openid: string) => {
  if (!openid) return
  myOpenid.value = openid
  try {
    const raw = uni.getStorageSync('userInfo')
    const parsed = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : { nickName: '铲屎官', avatarUrl: '' }
    if (parsed.openid !== openid) {
      parsed.openid = openid
      uni.setStorageSync('userInfo', JSON.stringify(parsed))
    }
  } catch (e) {}
}

/**
 * 统一的猫咪档案与用户会话深模块（Cat & Session Store）
 *
 * 解决各页面重复调用 getCats、直接读写 Storage 以及未进「我的」页前缺失 openid 的问题。
 */
export function useCatSession() {
  const currentCat = computed<CatDoc | null>(() => {
    if (!allCats.value.length) return null
    return allCats.value.find(c => c._id === currentCatId.value) || allCats.value[0]
  })

  const currentTargetRange = computed(() => {
    const cat = currentCat.value
    return normalizeTargetRange(cat?.targetMin, cat?.targetMax)
  })

  /**
   * 拉取当前用户名下及被共享的全部猫咪档案（自带并发合并与版本保鲜）
   */
  const fetchCats = async (force: boolean = false): Promise<CatDoc[]> => {
    const curVer = getDataVersion()
    const isFresh =
      !force &&
      allCats.value.length > 0 &&
      lastFetchedVersion === curVer &&
      Date.now() - lastFetchedAt < CATS_CACHE_TTL_MS

    if (isFresh) {
      const storedId = uni.getStorageSync('currentCatId')
      if (storedId && storedId !== currentCatId.value) {
        currentCatId.value = storedId
      }
      return allCats.value
    }

    if (inFlightCatsPromise) {
      return inFlightCatsPromise
    }

    inFlightCatsPromise = (async () => {
      try {
        const res = await callApi('getCats')
        if (res.openid) {
          syncOpenidToStorage(res.openid)
        }
        const list: CatDoc[] = Array.isArray(res.data) ? res.data : []
        allCats.value = list
        lastFetchedVersion = getDataVersion()
        lastFetchedAt = Date.now()

        if (list.length > 0) {
          const storedId = uni.getStorageSync('currentCatId')
          const matched = list.find(c => c._id === storedId) || list[0]
          currentCatId.value = matched._id
          if (storedId !== matched._id) {
            uni.setStorageSync('currentCatId', matched._id)
          }
        } else {
          currentCatId.value = ''
          uni.removeStorageSync('currentCatId')
        }
        return list
      } finally {
        inFlightCatsPromise = null
      }
    })()

    return inFlightCatsPromise
  }

  /**
   * 切换当前选中的猫咪并同步 Storage
   */
  const selectCat = (catId: string) => {
    if (!catId) return
    currentCatId.value = catId
    uni.setStorageSync('currentCatId', catId)
    markDataDirty()
  }

  /**
   * 判定指定猫咪是否由当前登录用户创建
   */
  const isCatCreator = (cat?: CatDoc | null): boolean => {
    if (!cat || !cat._openid) return true
    if (!myOpenid.value) return false
    return cat._openid === myOpenid.value
  }

  return {
    allCats,
    currentCatId,
    currentCat,
    currentTargetRange,
    myOpenid,
    fetchCats,
    selectCat,
    isCatCreator,
    syncOpenidToStorage
  }
}
