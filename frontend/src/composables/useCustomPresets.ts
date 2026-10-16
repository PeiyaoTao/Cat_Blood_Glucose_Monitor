import { ref, computed, onMounted } from 'vue'

export interface UseCustomPresetsOptions {
  /** 本地缓存 Storage 键名 */
  storageKey: string
  /** 内置默认选项列表 */
  defaultItems: string[]
  /** 新保存的自定义项是插入头部还是追加尾部，默认 'append' */
  insertPosition?: 'prepend' | 'append'
  /** 是否在末尾追加「其他」选项，默认 false */
  appendOtherOption?: boolean
  /** 删除弹窗的标题，默认 '删除常用选项' */
  deleteModalTitle?: string
  /** 保存成功时的 Toast 文案 */
  savedToastText?: string
  /** 已存在时的 Toast 文案 */
  duplicateToastText?: string
  /** 删除成功时的 Toast 文案 */
  deletedToastText?: string
}

/**
 * 自定义快捷标签管理深模块（支持读取缓存、去重保存、长按弹窗删除）
 *
 * 供记血糖、记打针、记饮食、记排泄、自动喂食托管等 5 个页面共用。
 */
export function useCustomPresets(opts: UseCustomPresetsOptions) {
  const customList = ref<string[]>([])

  const load = () => {
    try {
      const saved = uni.getStorageSync(opts.storageKey)
      if (saved && Array.isArray(saved)) {
        customList.value = saved
      }
    } catch (e) {}
  }

  onMounted(() => {
    load()
  })

  const allOptions = computed<string[]>(() => {
    const base =
      opts.insertPosition === 'prepend'
        ? Array.from(new Set([...customList.value, ...opts.defaultItems]))
        : Array.from(new Set([...opts.defaultItems, ...customList.value]))
    return opts.appendOtherOption ? [...base, '其他'] : base
  })

  const isCustom = (item: string): boolean => customList.value.includes(item)

  const addCustom = (rawText: string, onAdded?: (savedText: string, newIndex: number) => void): boolean => {
    const text = (rawText || '').trim()
    if (!text) return false

    if (customList.value.includes(text) || opts.defaultItems.includes(text)) {
      uni.showToast({ title: opts.duplicateToastText || '该选项已在常用列表中', icon: 'none' })
      return false
    }

    const updated =
      opts.insertPosition === 'prepend'
        ? [text, ...customList.value]
        : [...customList.value, text]
    customList.value = updated
    uni.setStorageSync(opts.storageKey, updated)
    uni.showToast({ title: opts.savedToastText || '已保存为常用选项', icon: 'success' })

    if (onAdded) {
      setTimeout(() => {
        const idx = allOptions.value.findIndex(it => it === text)
        onAdded(text, idx)
      }, 60)
    }
    return true
  }

  const confirmRemoveCustom = (item: string, onRemoved?: (removedItem: string) => void) => {
    if (!customList.value.includes(item)) return
    uni.showModal({
      title: opts.deleteModalTitle || '删除常用选项',
      content: `确定要删除自定义选项「${item}」吗？`,
      confirmText: '删除',
      confirmColor: '#E74C3C',
      success: (res) => {
        if (res.confirm) {
          const updated = customList.value.filter(it => it !== item)
          customList.value = updated
          uni.setStorageSync(opts.storageKey, updated)
          onRemoved?.(item)
          uni.showToast({ title: opts.deletedToastText || '已删除常用选项', icon: 'success' })
        }
      }
    })
  }

  return {
    customList,
    allOptions,
    load,
    isCustom,
    addCustom,
    confirmRemoveCustom
  }
}
