<template>
  <view 
    class="fs-modal-overlay" 
    v-if="visible" 
    :class="{ 'fs-modal-show': isAnimShow }"
    @tap="handleBackgroundTap"
    @touchmove.stop.prevent
  >
    <view class="fs-modal-content" @tap="handleBackgroundTap">
      <!-- 极值/边界触达轻量提示 Toast -->
      <view class="fs-limit-toast" v-if="toastMsg">
        <text class="fs-limit-toast-text">{{ toastMsg }}</text>
      </view>

      <!-- 顶部导航栏 -->
      <view class="fs-header" @tap.stop>
        <text class="fs-title">深度趋势分析</text>
        <view class="fs-close-btn" @tap="handleClose">
          <text class="fs-close-icon">✕</text>
        </view>
      </view>

      <!-- 时间维度切换 [ 日内 | 天 | 周 | 月 ] -->
      <view class="fs-tab-wrapper" @tap.stop>
        <view class="fs-tab-bar">
          <view 
            class="fs-tab-item" 
            :class="{ active: currentTab === 'intraday' }" 
            @tap="switchTab('intraday')"
          >
            日内
          </view>
          <view 
            class="fs-tab-item" 
            :class="{ active: currentTab === 'day' }" 
            @tap="switchTab('day')"
          >
            天
          </view>
          <view 
            class="fs-tab-item" 
            :class="{ active: currentTab === 'week' }" 
            @tap="switchTab('week')"
          >
            周
          </view>
          <view 
            class="fs-tab-item" 
            :class="{ active: currentTab === 'month' }" 
            @tap="switchTab('month')"
          >
            月
          </view>
        </view>
      </view>

      <!-- 1. 日内视图专属：有记录日期跳跃导航栏 -->
      <view class="fs-intraday-nav" v-if="currentTab === 'intraday'" @tap.stop>
        <view 
          class="fs-nav-step-btn" 
          :class="{ disabled: !hasPrevActiveDate }" 
          @tap="stepIntradayDate(-1)"
        >
          <text>‹ 上一记录日</text>
        </view>

        <picker mode="date" :value="intradayDate" @change="onIntradayDatePick">
          <view class="fs-nav-date-Mid">
            <text class="fs-nav-date-text">{{ intradayDateDisplay }}</text>
            <text class="fs-nav-date-sub">{{ intradayCountText }}</text>
          </view>
        </picker>

        <view 
          class="fs-nav-step-btn" 
          :class="{ disabled: !hasNextActiveDate }" 
          @tap="stepIntradayDate(1)"
        >
          <text>下一记录日 ›</text>
        </view>
      </view>

      <!-- 2. 天/周/月 趋势分析快捷切换 [ 近7次 | 近14次 | 近30次 | 全部 ] -->
      <view class="fs-quick-bar" v-else @tap.stop>
        <view class="fs-quick-pills">
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === '7d' }" 
            @tap="applyQuickRange('7d')"
          >
            {{ currentTab === 'day' ? '近7日' : '近7期' }}
          </view>
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === '14d' }" 
            @tap="applyQuickRange('14d')"
          >
            {{ currentTab === 'day' ? '近14日' : '近14期' }}
          </view>
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === '30d' }" 
            @tap="applyQuickRange('30d')"
          >
            {{ currentTab === 'day' ? '近30日' : '近30期' }}
          </view>
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === 'all' }" 
            @tap="applyQuickRange('all')"
          >
            全部
          </view>
        </view>
        <text class="fs-latest-anchor-hint" v-if="latestAnchorHint">{{ latestAnchorHint }}</text>
      </view>

      <!-- 3. 天视图专属：动态时效同口径筛选栏（自动提取全部预设与自定义时效） -->
      <view class="fs-period-filter-wrap" v-if="currentTab === 'day' && availablePeriods.length > 1" @tap.stop>
        <scroll-view scroll-x class="fs-period-scroll" :show-scrollbar="false">
          <view class="fs-period-row">
            <view
              class="fs-period-chip"
              :class="{ active: selectedPeriodFilter === 'all' }"
              @tap="selectPeriodFilter('all')"
            >
              全部时效
            </view>
            <view
              class="fs-period-chip"
              :class="{ active: selectedPeriodFilter === p }"
              v-for="p in availablePeriods"
              :key="p"
              @tap="selectPeriodFilter(p)"
            >
              {{ p }}
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- 主分析容器 -->
      <view class="fs-main-body">
        <view class="fs-section" id="glucoseSection">
          <view class="fs-metric-header" @tap.stop="handleBackgroundTap">
            <view class="fs-metric-top-bar">
              <text class="fs-range-text">{{ currentGlucoseRangeText }}</text>
              <view class="fs-top-right-actions">
                <!-- 天视图下选中多测日时，支持一键下钻至当日日内曲线 -->
                <view
                  class="fs-drilldown-btn"
                  v-if="currentTab === 'day' && isPointSelected && selectedPoint.dateKey"
                  @tap.stop="drillDownToIntraday(selectedPoint.dateKey)"
                >
                  <text>当日日内曲线 ›</text>
                </view>
                <!-- Y 轴模式切换胶囊 (聚焦 20 / 全景 35) -->
                <view 
                  class="fs-y-toggle" 
                  :class="{ panorama: yAxisMode === 'panorama' }"
                  @tap.stop="toggleYAxisMode"
                >
                  <text class="fs-y-toggle-text">{{ yAxisToggleLabel }}</text>
                  <view class="fs-y-toggle-dot" v-if="hasOutlierInView && yAxisMode === 'focus'"></view>
                </view>
              </view>
            </view>

            <view class="fs-tag-row">
              <text class="fs-mode-tag">{{ currentHeaderModeTag }}</text>
              <text class="fs-metric-label">血糖</text>
              <text class="fs-minmax-hint" v-if="selectedDayMinMaxText">{{ selectedDayMinMaxText }}</text>
            </view>

            <view class="fs-value-row">
              <text class="fs-big-number">{{ currentGlucoseDisplay }}</text>
              <text class="fs-unit" v-if="hasGlucoseValue">mmol/L</text>
              <text class="fs-status-badge" :class="glucoseStatusClass" v-if="hasGlucoseValue">
                {{ glucoseStatusText }}
              </text>
              <text class="fs-status-badge badge-gray" v-else>
                无血糖记录
              </text>
            </view>
          </view>

          <!-- 多维事件叠加控制栏（仅在 日内 / 天 视图展示，默认全部关闭保持纯净） -->
          <view class="fs-overlay-bar" v-if="currentTab === 'intraday' || currentTab === 'day'" @tap.stop>
            <text class="fs-overlay-label">叠加事件:</text>
            <view class="fs-overlay-chips">
              <view
                class="fs-ov-chip chip-insulin"
                :class="{ active: overlays.insulin }"
                @tap="toggleOverlay('insulin')"
              >
                <view class="ov-dot dot-insulin"></view>
                <text>打针</text>
              </view>
              <view
                class="fs-ov-chip chip-meal"
                :class="{ active: overlays.meal }"
                @tap="toggleOverlay('meal')"
              >
                <view class="ov-dot dot-meal"></view>
                <text>饮食</text>
              </view>
              <view
                class="fs-ov-chip chip-excretion"
                :class="{ active: overlays.excretion }"
                @tap="toggleOverlay('excretion')"
              >
                <view class="ov-dot dot-excretion"></view>
                <text>排泄</text>
              </view>
              <view
                class="fs-ov-chip chip-weight"
                :class="{ active: overlays.weight }"
                @tap="toggleOverlay('weight')"
              >
                <view class="ov-dot dot-weight"></view>
                <text>体重</text>
              </view>
              <view
                class="fs-ov-clear"
                v-if="hasAnyOverlayActive"
                @tap="clearAllOverlays"
              >
                <text>全关</text>
              </view>
            </view>
          </view>

          <!-- 主图表 Canvas 2D 容器 -->
          <view 
            class="fs-canvas-box" 
            :class="[zoomLimitClass, edgeLimitClass, { 'has-overlays': hasAnyOverlayActive }]"
            @tap.stop
            @touchstart="handleTouchStart" 
            @touchmove.stop="handleTouchMove" 
            @touchend="handleTouchEnd"
            @touchcancel="handleTouchCancel"
          >
            <canvas 
              type="2d" 
              id="glucoseFsCanvas" 
              class="fs-canvas"
              @tap.stop
            ></canvas>
          </view>
        </view>

        <!-- 底部：选中节点或当日多维事件详情摘要卡（仅在有内容时精简展示，无冗余副图） -->
        <view class="fs-detail-panel" v-if="detailPanelItems.length > 0" @tap.stop>
          <view class="fs-detail-header">
            <text class="fs-detail-title">{{ detailPanelTitle }}</text>
            <text
              class="fs-detail-drill"
              v-if="currentTab === 'day' && selectedPoint.dateKey"
              @tap="drillDownToIntraday(selectedPoint.dateKey)"
            >
              进入该日时间轴 ›
            </text>
          </view>
          <scroll-view scroll-y class="fs-detail-scroll">
            <view class="fs-detail-tags">
              <view
                class="fs-detail-item"
                :class="dItem.typeClass"
                v-for="(dItem, dIdx) in detailPanelItems"
                :key="dIdx"
              >
                <text class="di-badge">{{ dItem.badge }}</text>
                <text class="di-main">{{ dItem.main }}</text>
                <text class="di-sub" v-if="dItem.sub">{{ dItem.sub }}</text>
              </view>
            </view>
          </scroll-view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, getCurrentInstance, onUnmounted } from 'vue'
import { useChartGestures } from '@/composables/useChartGestures'
import { getLocalTodayDate } from '@/utils/api'
import { evaluateGlucoseStatus, normalizeTargetRange } from '@/utils/glucoseDomain'
import {
  drawSelectionBeam,
  drawClampedPointLabel,
  drawClampedXAxisLabel
} from '@/utils/chartRenderer'

const props = withDefaults(defineProps<{
  visible: boolean
  glucoseRecords: any[]
  weightRecords: any[]
  insulinRecords?: any[]
  mealRecords?: any[]
  excretionRecords?: any[]
  targetMin: number
  targetMax: number
}>(), {
  insulinRecords: () => [],
  mealRecords: () => [],
  excretionRecords: () => []
})

const emit = defineEmits(['update:visible', 'close'])

const instance = getCurrentInstance()
const isAnimShow = ref(false)
const currentTab = ref<'intraday' | 'day' | 'week' | 'month'>('day')
const currentZoomCount = ref<number>(7)
const currentQuickRange = ref<'7d' | '14d' | '30d' | 'all' | ''>('7d')
const yAxisMode = ref<'focus' | 'panorama'>('focus')
const selectedPointIndex = ref<number>(-1)
const visibleStartIndex = ref<number>(0)
const visibleEndIndex = ref<number>(6)

// 天视图下的动态时效过滤 ('all' 或具体 period 名称)
const selectedPeriodFilter = ref<string>('all')

// 日内视图当前选中的日期 (YYYY-MM-DD)
const intradayDate = ref<string>(getLocalTodayDate())

// 多维事件叠加状态（严格遵守默认全部关闭，避免画面杂乱）
const overlays = ref({
  insulin: false,
  meal: false,
  excretion: false,
  weight: false
})

const hasAnyOverlayActive = computed(() => {
  if (currentTab.value !== 'intraday' && currentTab.value !== 'day') return false
  return overlays.value.insulin || overlays.value.meal || overlays.value.excretion || overlays.value.weight
})

const activeOverlayKeys = computed<Array<'insulin' | 'meal' | 'excretion' | 'weight'>>(() => {
  if (currentTab.value !== 'intraday' && currentTab.value !== 'day') return []
  const keys: Array<'insulin' | 'meal' | 'excretion' | 'weight'> = []
  if (overlays.value.insulin) keys.push('insulin')
  if (overlays.value.meal) keys.push('meal')
  if (overlays.value.excretion) keys.push('excretion')
  if (overlays.value.weight) keys.push('weight')
  return keys
})

const toggleOverlay = (key: 'insulin' | 'meal' | 'excretion' | 'weight') => {
  overlays.value[key] = !overlays.value[key]
  prepareData()
  nextTick(() => {
    initGlucoseCanvas(() => {
      const fullList = getFullListForCurrentTab()
      if (selectedPointIndex.value >= fullList.length) {
        selectedPointIndex.value = -1
      }
      scrollX = Math.max(getMinScrollX(), Math.min(0, scrollX))
      updateVisibleMetrics()
      drawMainAnalysisChart()
    })
  })
}

const clearAllOverlays = () => {
  overlays.value.insulin = false
  overlays.value.meal = false
  overlays.value.excretion = false
  overlays.value.weight = false
  showToastTip('已关闭全部附加事件图层')
  prepareData()
  nextTick(() => {
    initGlucoseCanvas(() => {
      selectedPointIndex.value = -1
      scrollX = getMinScrollX()
      updateVisibleMetrics()
      drawMainAnalysisChart()
    })
  })
}

let glucoseCanvasNode: any = null
let glucoseCtx: any = null
let canvasWidth = 330
let glucoseCanvasHeight = 200
let canvasBoxLeft = 0

// 动画与交互反馈状态
const zoomLimitClass = ref('')
const edgeLimitClass = ref('')
let edgeTimer: any = null
const toastMsg = ref('')
let toastTimer: any = null

const showToastTip = (msg: string) => {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
    toastTimer = null
  }, 1300)
}

const triggerEdgeLimitAnimation = (direction: 'left' | 'right', tipText?: string) => {
  edgeLimitClass.value = direction === 'left' ? 'fs-edge-limit-left' : 'fs-edge-limit-right'
  showToastTip(tipText || (direction === 'left' ? '已至最早记录' : '已至最新记录'))
  if (edgeTimer) clearTimeout(edgeTimer)
  edgeTimer = setTimeout(() => {
    edgeLimitClass.value = ''
    edgeTimer = null
  }, 260)
}

interface OverlaySummary {
  insulinText?: string
  insulinList: Array<{ time: string; dose: number; period: string; type: string }>
  mealText?: string
  mealList: Array<{ time: string; grams: number; brand: string; period: string }>
  excretionText?: string
  excretionList: Array<{ time: string; urine: string; stool: string }>
  weightText?: string
  weightList: Array<{ time: string; weight: number }>
}

interface ChartItem {
  dateKey: string
  date: string
  dayNum: string
  bg: number | null
  bgMin?: number | null
  bgMax?: number | null
  bgCount: number
  singlePeriod?: string
  singleTime?: string
  bgDetails: Array<{ time: string; val: number; period: string; note?: string; timestamp?: number; createTime?: number; _id?: any }>
  wt: number | null
  wtCount: number
  timestamp: number
  overlay: OverlaySummary
}

const processedIntradayItems = ref<ChartItem[]>([])
const processedDayItems = ref<ChartItem[]>([])
const processedWeekItems = ref<ChartItem[]>([])
const processedMonthItems = ref<ChartItem[]>([])
const allActiveDates = ref<string[]>([])

const pad2 = (n: number) => n.toString().padStart(2, '0')

const parseItemDateAndTime = (item: any, timeField?: string) => {
  let y = 2026, m = 1, d = 1
  if (item.record_date && typeof item.record_date === 'string' && item.record_date.includes('-')) {
    const parts = item.record_date.split('-').map(Number)
    if (parts.length >= 3 && parts[0] > 1990) {
      y = parts[0]
      m = parts[1]
      d = parts[2]
    }
  } else if (item.createTime) {
    const dt = new Date(item.createTime)
    if (!isNaN(dt.getTime())) {
      y = dt.getFullYear()
      m = dt.getMonth() + 1
      d = dt.getDate()
    }
  }
  const sortKey = `${y}-${pad2(m)}-${pad2(d)}`
  const dStr = `${m}/${d}`
  const dayNum = `${m}/${d}`

  let rawTime = (timeField && item[timeField]) || item.measure_time || item.inject_time || item.meal_time || item.record_time || ''
  let hour = 12, min = 0, sec = 0, hasExplicitSec = false

  if (rawTime) {
    const mTime = String(rawTime).match(/(\d{1,2}):(\d{2})(?::(\d{1,2}))?/)
    if (mTime) {
      hour = Number(mTime[1]) || 0
      min = Number(mTime[2]) || 0
      if (mTime[3] !== undefined) {
        sec = Number(mTime[3]) || 0
        hasExplicitSec = true
      }
    }
  } else if (item.createTime) {
    const dt = new Date(item.createTime)
    if (!isNaN(dt.getTime())) {
      hour = dt.getHours()
      min = dt.getMinutes()
      sec = dt.getSeconds()
      hasExplicitSec = sec > 0
    }
  }

  // 若 timeStr 未提供秒数，但 createTime 的年月日时分一致且含秒数：
  if (!hasExplicitSec && item.createTime && typeof item.createTime === 'number') {
    const dt = new Date(item.createTime)
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d &&
      dt.getHours() === hour &&
      dt.getMinutes() === min &&
      dt.getSeconds() > 0
    ) {
      sec = dt.getSeconds()
      hasExplicitSec = true
    }
  }

  const timeStr = hasExplicitSec
    ? `${pad2(hour)}:${pad2(min)}:${pad2(sec)}`
    : `${pad2(hour)}:${pad2(min)}`

  let timestamp = new Date(y, m - 1, d, hour, min, sec, 0).getTime()
  if (item.createTime && typeof item.createTime === 'number') {
    const dt = new Date(item.createTime)
    if (
      dt.getFullYear() === y &&
      dt.getMonth() === m - 1 &&
      dt.getDate() === d &&
      dt.getHours() === hour &&
      dt.getMinutes() === min
    ) {
      timestamp = item.createTime
    }
  }

  return { sortKey, dStr, dayNum, timestamp, timeStr, hasExplicitSec }
}

// 动态提取当前猫咪所有实际使用过的时效阶段 + 自定义预设时效
const availablePeriods = computed<string[]>(() => {
  const counts = new Map<string, number>()
  ;(props.glucoseRecords || []).forEach((item: any) => {
    const p = String(item.period || item.status || '').trim()
    if (p) {
      counts.set(p, (counts.get(p) || 0) + 1)
    }
  })
  try {
    const customSaved = uni.getStorageSync('custom_bg_periods')
    const parsed = typeof customSaved === 'string' ? JSON.parse(customSaved) : customSaved
    if (Array.isArray(parsed)) {
      parsed.forEach((p: any) => {
        const s = String(p || '').trim()
        if (s && !counts.has(s)) counts.set(s, 0)
      })
    }
  } catch (e) {}

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(entry => entry[0])
})

const selectPeriodFilter = (period: string) => {
  if (selectedPeriodFilter.value === period) return
  selectedPeriodFilter.value = period
  prepareData()
  selectedPointIndex.value = -1
  scrollX = getMinScrollX()
  updateVisibleMetrics()
  drawMainAnalysisChart()
  showToastTip(period === 'all' ? '展示全部时效记录' : `仅筛选「${period}」同口径对比`)
}

const createEmptyOverlay = (): OverlaySummary => ({
  insulinList: [],
  mealList: [],
  excretionList: [],
  weightList: []
})

const finalizeOverlaySummary = (ov: OverlaySummary) => {
  if (ov.insulinList.length > 0) {
    const totalU = ov.insulinList.reduce((s, x) => s + x.dose, 0)
    ov.insulinText = ov.insulinList.length === 1
      ? `${Number(totalU.toFixed(2))}U`
      : `${Number(totalU.toFixed(2))}U(${ov.insulinList.length}针)`
  }
  if (ov.mealList.length > 0) {
    const totalG = ov.mealList.reduce((s, x) => s + x.grams, 0)
    ov.mealText = `${Math.round(totalG)}g`
  }
  if (ov.excretionList.length > 0) {
    const first = ov.excretionList[0]
    const shortUrine = first.urine ? first.urine.split(' ')[0].replace('正常', '尿常') : '排泄'
    ov.excretionText = ov.excretionList.length > 1 ? `排x${ov.excretionList.length}` : shortUrine.slice(0, 4)
  }
  if (ov.weightList.length > 0) {
    const lastW = ov.weightList[ov.weightList.length - 1].weight
    ov.weightText = `${lastW.toFixed(1)}kg`
  }
}

// 构建日内曲线数据 (针对 intradayDate 当日按时间精确排序)
const buildIntradayItems = (targetDateKey: string) => {
  const [y, m, d] = targetDateKey.split('-').map(Number)
  const baseDateLabel = `${m}/${d}`

  // 先对当日所有血糖记录按精确时间戳升序排序 (最早在前，最新在后)
  const sortedGlucose = (props.glucoseRecords || [])
    .filter((item: any) => {
      const bgVal = Number(item.bg_value)
      if (!Number.isFinite(bgVal) || bgVal <= 0) return false
      const info = parseItemDateAndTime(item, 'measure_time')
      return info.sortKey === targetDateKey
    })
    .sort((a: any, b: any) => {
      const infoA = parseItemDateAndTime(a, 'measure_time')
      const infoB = parseItemDateAndTime(b, 'measure_time')
      if (infoA.timestamp !== infoB.timestamp) return infoA.timestamp - infoB.timestamp
      if (a.createTime && b.createTime && a.createTime !== b.createTime) return a.createTime - b.createTime
      return String(a._id || '').localeCompare(String(b._id || ''))
    })

  const slotList: ChartItem[] = []
  const slotMapByTime: Record<string, ChartItem> = {}

  // 1. 将每一个血糖记录按时间生成专属数据点（同分多次记录亦能清晰区分先后）
  sortedGlucose.forEach((item: any) => {
    const bgVal = Number(item.bg_value)
    const info = parseItemDateAndTime(item, 'measure_time')
    const pName = item.period || item.status || '常规'

    // 若同一分钟已有同秒/同分记录，则添加序号后缀标识区别
    let displayTime = info.timeStr
    let dupCount = 1
    while (slotMapByTime[displayTime]) {
      dupCount++
      displayTime = `${info.timeStr} (${dupCount})`
    }

    const slotItem: ChartItem = {
      dateKey: targetDateKey,
      date: `${baseDateLabel} ${displayTime}`,
      dayNum: displayTime,
      bg: bgVal,
      bgCount: 1,
      bgDetails: [{
        time: info.timeStr,
        val: bgVal,
        period: pName,
        note: item.note,
        timestamp: info.timestamp,
        createTime: item.createTime,
        _id: item._id
      }],
      wt: null,
      wtCount: 0,
      timestamp: info.timestamp,
      overlay: createEmptyOverlay(),
      singlePeriod: pName,
      singleTime: info.timeStr
    }
    slotMapByTime[displayTime] = slotItem
    if (!slotMapByTime[info.timeStr]) {
      slotMapByTime[info.timeStr] = slotItem
    }
    slotList.push(slotItem)
  })

  // 辅助函数：根据事件时间找到已有 slot 或创建新的纯事件 slot
  const ensureEventSlot = (info: ReturnType<typeof parseItemDateAndTime>): ChartItem => {
    if (slotMapByTime[info.timeStr]) {
      return slotMapByTime[info.timeStr]
    }
    const slotItem: ChartItem = {
      dateKey: targetDateKey,
      date: `${baseDateLabel} ${info.timeStr}`,
      dayNum: info.timeStr,
      bg: null,
      bgCount: 0,
      bgDetails: [],
      wt: null,
      wtCount: 0,
      timestamp: info.timestamp,
      overlay: createEmptyOverlay()
    }
    slotMapByTime[info.timeStr] = slotItem
    slotList.push(slotItem)
    return slotItem
  }

  // 2. 当日叠加事件（仅在对应开关开启或当日作为时间轴展示时收录）
  if (overlays.value.insulin) {
    ;(props.insulinRecords || []).forEach((item: any) => {
      const dose = Number(item.dose)
      if (!Number.isFinite(dose) || dose <= 0) return
      const info = parseItemDateAndTime(item, 'inject_time')
      if (info.sortKey !== targetDateKey) return
      const slot = ensureEventSlot(info)
      slot.overlay.insulinList.push({
        time: info.timeStr,
        dose,
        period: item.period || '打针',
        type: item.insulin_type || '胰岛素'
      })
    })
  }

  if (overlays.value.meal) {
    ;(props.mealRecords || []).forEach((item: any) => {
      const grams = Number(item.food_grams)
      if (!Number.isFinite(grams) || grams <= 0) return
      const info = parseItemDateAndTime(item, 'meal_time')
      if (info.sortKey !== targetDateKey) return
      const slot = ensureEventSlot(info)
      slot.overlay.mealList.push({
        time: info.timeStr,
        grams,
        brand: item.food_brand || '',
        period: item.period || '进食'
      })
    })
  }

  if (overlays.value.excretion) {
    ;(props.excretionRecords || []).forEach((item: any) => {
      const info = parseItemDateAndTime(item, 'record_time')
      if (info.sortKey !== targetDateKey) return
      const slot = ensureEventSlot(info)
      slot.overlay.excretionList.push({
        time: info.timeStr,
        urine: item.urine || '排尿正常',
        stool: item.stool_status || ''
      })
    })
  }

  if (overlays.value.weight) {
    ;(props.weightRecords || []).forEach((item: any) => {
      const wtVal = Number(item.weight_value)
      if (!Number.isFinite(wtVal) || wtVal <= 0) return
      const info = parseItemDateAndTime(item, 'measure_time')
      if (info.sortKey !== targetDateKey) return
      const slot = ensureEventSlot(info)
      slot.wt = wtVal
      slot.wtCount++
      slot.overlay.weightList.push({
        time: info.timeStr,
        weight: wtVal
      })
    })
  }

  // 按精确业务时间升序排序 (最早在前，最新在后)
  slotList.sort((a, b) => {
    if (a.timestamp !== b.timestamp) return a.timestamp - b.timestamp
    return (a.dayNum || '').localeCompare(b.dayNum || '')
  })
  slotList.forEach(slot => finalizeOverlaySummary(slot.overlay))
  processedIntradayItems.value = slotList
}

// 预处理全量数据：采用「紧凑有效记录日」策略，彻底告别断更空白图
const prepareData = () => {
  const activeDateSet = new Set<string>()
  const dateMap: Record<string, {
    sortKey: string
    dStr: string
    dayNum: string
    timestamp: number
    bgDetails: Array<{ time: string; val: number; period: string; note?: string; timestamp?: number; createTime?: number; _id?: any }>
    wtList: number[]
    overlay: OverlaySummary
  }> = {}

  const ensureDateBucket = (info: { sortKey: string; dStr: string; dayNum: string; timestamp: number }) => {
    activeDateSet.add(info.sortKey)
    if (!dateMap[info.sortKey]) {
      dateMap[info.sortKey] = {
        sortKey: info.sortKey,
        dStr: info.dStr,
        dayNum: info.dayNum,
        timestamp: info.timestamp,
        bgDetails: [],
        wtList: [],
        overlay: createEmptyOverlay()
      }
    }
    return dateMap[info.sortKey]
  }

  // 1. 归并血糖记录（同时记录全量活跃日期）
  ;(props.glucoseRecords || []).forEach((item: any) => {
    const bgVal = Number(item.bg_value)
    if (!Number.isFinite(bgVal) || bgVal <= 0) return
    const info = parseItemDateAndTime(item, 'measure_time')
    activeDateSet.add(info.sortKey)

    const pName = String(item.period || item.status || '常规').trim()
    if (selectedPeriodFilter.value !== 'all' && pName !== selectedPeriodFilter.value) {
      return
    }
    const bucket = ensureDateBucket(info)
    bucket.bgDetails.push({
      time: info.timeStr,
      val: bgVal,
      period: pName,
      note: item.note,
      timestamp: info.timestamp,
      createTime: item.createTime,
      _id: item._id
    })
  })

  // 2. 收集其他事件日期与当日叠加摘要
  ;(props.insulinRecords || []).forEach((item: any) => {
    const dose = Number(item.dose)
    if (!Number.isFinite(dose) || dose <= 0) return
    const info = parseItemDateAndTime(item, 'inject_time')
    activeDateSet.add(info.sortKey)
    if (overlays.value.insulin || dateMap[info.sortKey]) {
      const bucket = ensureDateBucket(info)
      bucket.overlay.insulinList.push({
        time: info.timeStr,
        dose,
        period: item.period || '打针',
        type: item.insulin_type || '胰岛素'
      })
    }
  })

  ;(props.mealRecords || []).forEach((item: any) => {
    const grams = Number(item.food_grams)
    if (!Number.isFinite(grams) || grams <= 0) return
    const info = parseItemDateAndTime(item, 'meal_time')
    activeDateSet.add(info.sortKey)
    if (overlays.value.meal || dateMap[info.sortKey]) {
      const bucket = ensureDateBucket(info)
      bucket.overlay.mealList.push({
        time: info.timeStr,
        grams,
        brand: item.food_brand || '',
        period: item.period || '进食'
      })
    }
  })

  ;(props.excretionRecords || []).forEach((item: any) => {
    const info = parseItemDateAndTime(item, 'record_time')
    activeDateSet.add(info.sortKey)
    if (overlays.value.excretion || dateMap[info.sortKey]) {
      const bucket = ensureDateBucket(info)
      bucket.overlay.excretionList.push({
        time: info.timeStr,
        urine: item.urine || '排尿正常',
        stool: item.stool_status || ''
      })
    }
  })

  ;(props.weightRecords || []).forEach((item: any) => {
    const wtVal = Number(item.weight_value)
    if (!Number.isFinite(wtVal) || wtVal <= 0) return
    const info = parseItemDateAndTime(item, 'measure_time')
    activeDateSet.add(info.sortKey)
    if (overlays.value.weight || dateMap[info.sortKey]) {
      const bucket = ensureDateBucket(info)
      bucket.wtList.push(wtVal)
      bucket.overlay.weightList.push({
        time: info.timeStr,
        weight: wtVal
      })
    }
  })

  const sortedAllActive = Array.from(activeDateSet).sort()
  allActiveDates.value = sortedAllActive

  // 若当前日内日期无任何数据，自动锚定到最近一个有记录的日期
  if (sortedAllActive.length > 0 && !activeDateSet.has(intradayDate.value)) {
    intradayDate.value = sortedAllActive[sortedAllActive.length - 1]
  }

  // 构建紧凑「天」视图数据集（仅包含有记录的日期，消除断更期大片空白）
  const sortedDayKeys = Object.keys(dateMap)
    .filter(k => {
      const b = dateMap[k]
      if (b.bgDetails.length > 0) return true
      if (overlays.value.insulin && b.overlay.insulinList.length > 0) return true
      if (overlays.value.meal && b.overlay.mealList.length > 0) return true
      if (overlays.value.excretion && b.overlay.excretionList.length > 0) return true
      if (overlays.value.weight && b.overlay.weightList.length > 0) return true
      return false
    })
    .sort()

  const dayItemList: ChartItem[] = sortedDayKeys.map(key => {
    const b = dateMap[key]
    b.bgDetails.sort((x, y) => {
      const tX = x.timestamp || 0
      const tY = y.timestamp || 0
      if (tX !== tY) return tX - tY
      if (x.time !== y.time) return x.time.localeCompare(y.time)
      if (x.createTime && y.createTime && x.createTime !== y.createTime) return x.createTime - y.createTime
      return String(x._id || '').localeCompare(String(y._id || ''))
    })
    const bgVals = b.bgDetails.map(d => d.val)
    const bgAvg = bgVals.length
      ? Math.round((bgVals.reduce((s, x) => s + x, 0) / bgVals.length) * 10) / 10
      : null
    const bgMin = bgVals.length ? Math.min(...bgVals) : null
    const bgMax = bgVals.length ? Math.max(...bgVals) : null
    const wtAvg = b.wtList.length
      ? Math.round((b.wtList.reduce((s, x) => s + x, 0) / b.wtList.length) * 100) / 100
      : null

    finalizeOverlaySummary(b.overlay)

    return {
      dateKey: key,
      date: b.dStr,
      dayNum: b.dStr,
      bg: bgAvg,
      bgMin,
      bgMax,
      bgCount: bgVals.length,
      singlePeriod: bgVals.length === 1 ? b.bgDetails[0].period : undefined,
      singleTime: bgVals.length === 1 ? b.bgDetails[0].time : undefined,
      bgDetails: b.bgDetails,
      wt: wtAvg,
      wtCount: b.wtList.length,
      timestamp: b.timestamp,
      overlay: b.overlay
    }
  })
  processedDayItems.value = dayItemList

  // 构建紧凑「周」视图数据集（仅聚合有数据的自然周）
  const getMonday = (ts: number) => {
    const d = new Date(ts)
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1)
    date.setDate(diff)
    return date
  }

  const weekMap = new Map<string, { monDate: Date; bgs: number[]; wts: number[] }>()
  dayItemList.forEach(item => {
    if (item.bg === null && item.wt === null) return
    const mon = getMonday(item.timestamp)
    const wKey = `${mon.getFullYear()}-${pad2(mon.getMonth() + 1)}-${pad2(mon.getDate())}`
    if (!weekMap.has(wKey)) {
      weekMap.set(wKey, { monDate: mon, bgs: [], wts: [] })
    }
    const wBucket = weekMap.get(wKey)!
    item.bgDetails.forEach(d => wBucket.bgs.push(d.val))
    if (item.wt !== null) wBucket.wts.push(item.wt)
  })

  const sortedWeekKeys = Array.from(weekMap.keys()).sort()
  processedWeekItems.value = sortedWeekKeys.map(wKey => {
    const wb = weekMap.get(wKey)!
    const m = wb.monDate.getMonth() + 1
    const d = wb.monDate.getDate()
    const label = `${m}/${d}周`
    const avgBg = wb.bgs.length
      ? Math.round((wb.bgs.reduce((s, x) => s + x, 0) / wb.bgs.length) * 10) / 10
      : null
    const avgWt = wb.wts.length
      ? Math.round((wb.wts.reduce((s, x) => s + x, 0) / wb.wts.length) * 100) / 100
      : null
    return {
      dateKey: wKey,
      date: label,
      dayNum: label,
      bg: avgBg,
      bgMin: wb.bgs.length ? Math.min(...wb.bgs) : null,
      bgMax: wb.bgs.length ? Math.max(...wb.bgs) : null,
      bgCount: wb.bgs.length,
      bgDetails: [],
      wt: avgWt,
      wtCount: wb.wts.length,
      timestamp: wb.monDate.getTime(),
      overlay: createEmptyOverlay()
    }
  })

  // 构建紧凑「月」视图数据集（仅聚合有数据的月份）
  const monthMap = new Map<string, { year: number; month: number; bgs: number[]; wts: number[] }>()
  dayItemList.forEach(item => {
    if (item.bg === null && item.wt === null) return
    const dt = new Date(item.timestamp)
    const y = dt.getFullYear()
    const m = dt.getMonth() + 1
    const mKey = `${y}-${pad2(m)}`
    if (!monthMap.has(mKey)) {
      monthMap.set(mKey, { year: y, month: m, bgs: [], wts: [] })
    }
    const mb = monthMap.get(mKey)!
    item.bgDetails.forEach(d => mb.bgs.push(d.val))
    if (item.wt !== null) mb.wts.push(item.wt)
  })

  const sortedMonthKeys = Array.from(monthMap.keys()).sort()
  processedMonthItems.value = sortedMonthKeys.map(mKey => {
    const mb = monthMap.get(mKey)!
    const label = `${mb.month}月`
    const avgBg = mb.bgs.length
      ? Math.round((mb.bgs.reduce((s, x) => s + x, 0) / mb.bgs.length) * 10) / 10
      : null
    const avgWt = mb.wts.length
      ? Math.round((mb.wts.reduce((s, x) => s + x, 0) / mb.wts.length) * 100) / 100
      : null
    return {
      dateKey: mKey,
      date: `${mb.year}年${mb.month}月`,
      dayNum: label,
      bg: avgBg,
      bgMin: mb.bgs.length ? Math.min(...mb.bgs) : null,
      bgMax: mb.bgs.length ? Math.max(...mb.bgs) : null,
      bgCount: mb.bgs.length,
      bgDetails: [],
      wt: avgWt,
      wtCount: mb.wts.length,
      timestamp: new Date(mb.year, mb.month - 1, 1).getTime(),
      overlay: createEmptyOverlay()
    }
  })

  // 构建当前选中日期的「日内」数据集
  buildIntradayItems(intradayDate.value)
}

// 日内视图日期导航计算
const currentActiveDateIdx = computed(() => {
  return allActiveDates.value.indexOf(intradayDate.value)
})

const hasPrevActiveDate = computed(() => {
  if (!allActiveDates.value.length) return false
  if (currentActiveDateIdx.value > 0) return true
  return allActiveDates.value[0] < intradayDate.value
})

const hasNextActiveDate = computed(() => {
  if (!allActiveDates.value.length) return false
  if (currentActiveDateIdx.value !== -1 && currentActiveDateIdx.value < allActiveDates.value.length - 1) return true
  return allActiveDates.value[allActiveDates.value.length - 1] > intradayDate.value
})

const intradayDateDisplay = computed(() => {
  if (!intradayDate.value) return '选择日期'
  const [y, m, d] = intradayDate.value.split('-').map(Number)
  const today = getLocalTodayDate()
  const suffix = intradayDate.value === today ? ' (今天)' : ''
  return `${y}年${m}月${d}日${suffix}`
})

const intradayCountText = computed(() => {
  const list = processedIntradayItems.value
  const bgTotal = list.reduce((s, x) => s + x.bgCount, 0)
  return `当日 ${list.length} 个时间节点 · 测糖 ${bgTotal} 次 ▼`
})

const stepIntradayDate = (dir: -1 | 1) => {
  const dates = allActiveDates.value
  if (!dates.length) return
  const cur = intradayDate.value
  if (dir === -1) {
    const prevCandidates = dates.filter(d => d < cur)
    if (prevCandidates.length > 0) {
      intradayDate.value = prevCandidates[prevCandidates.length - 1]
      onIntradayDateChanged()
    } else {
      showToastTip('已是最早有记录的日期')
    }
  } else {
    const nextCandidates = dates.filter(d => d > cur)
    if (nextCandidates.length > 0) {
      intradayDate.value = nextCandidates[0]
      onIntradayDateChanged()
    } else {
      showToastTip('已是最新有记录的日期')
    }
  }
}

const onIntradayDatePick = (e: any) => {
  if (!e.detail?.value) return
  intradayDate.value = e.detail.value
  onIntradayDateChanged()
}

const onIntradayDateChanged = () => {
  buildIntradayItems(intradayDate.value)
  initPositionForCurrentTab()
}

const drillDownToIntraday = (dateKey: string) => {
  if (!dateKey) return
  intradayDate.value = dateKey
  currentTab.value = 'intraday'
  buildIntradayItems(dateKey)
  initPositionForCurrentTab()
  showToastTip(`已进入 ${dateKey} 日内曲线`)
}

// 获取各 Tab 缩放配置
const getTabZoomLimits = () => {
  if (currentTab.value === 'intraday') {
    const total = Math.max(3, processedIntradayItems.value.length)
    return { min: 3, max: Math.max(12, total), default: Math.min(6, Math.max(3, total)) }
  }
  if (currentTab.value === 'week') {
    const total = Math.max(3, processedWeekItems.value.length)
    return { min: 3, max: Math.max(16, total), default: Math.min(7, Math.max(3, total)) }
  }
  if (currentTab.value === 'month') {
    const total = Math.max(3, processedMonthItems.value.length)
    return { min: 3, max: Math.max(12, total), default: Math.min(6, Math.max(3, total)) }
  }
  const total = Math.max(3, processedDayItems.value.length)
  return { min: 3, max: Math.max(30, total), default: Math.min(7, Math.max(3, total)) }
}

const getFullListForCurrentTab = (): ChartItem[] => {
  if (currentTab.value === 'intraday') return processedIntradayItems.value
  if (currentTab.value === 'week') return processedWeekItems.value
  if (currentTab.value === 'month') return processedMonthItems.value
  return processedDayItems.value
}

// 最新记录锚点提示（当最新一条记录不是今天时提示用户，避免误解）
const latestAnchorHint = computed(() => {
  if (currentTab.value === 'intraday') return ''
  if (!allActiveDates.value.length) return '暂无历史记录'
  const latestKey = allActiveDates.value[allActiveDates.value.length - 1]
  const today = getLocalTodayDate()
  if (latestKey !== today) {
    const [_, m, d] = latestKey.split('-').map(Number)
    return `锚定最新记录: ${m}月${d}日`
  }
  return ''
})

const getPanoramaCeiling = () => {
  const fullList = getFullListForCurrentTab()
  let maxBg = 0
  fullList.forEach(item => {
    if (item.bg !== null && typeof item.bg === 'number' && item.bg > maxBg) {
      maxBg = item.bg
    }
  })
  if (maxBg <= 21.5) return 25
  if (maxBg <= 26.5) return 30
  if (maxBg <= 31.5) return 35
  return Math.max(35, Math.ceil(maxBg / 5) * 5)
}

const currentGlucoseCeiling = computed(() => {
  if (yAxisMode.value === 'panorama') {
    return getPanoramaCeiling()
  }
  return 20.0
})

const hasOutlierInView = computed(() => {
  const fullList = getFullListForCurrentTab()
  return fullList.some(item => item.bg !== null && typeof item.bg === 'number' && item.bg > 20.0)
})

const yAxisToggleLabel = computed(() => {
  if (yAxisMode.value === 'panorama') {
    return `全景 ${currentGlucoseCeiling.value}`
  }
  return '聚焦 20'
})

const toggleYAxisMode = () => {
  if (yAxisMode.value === 'focus') {
    yAxisMode.value = 'panorama'
    showToastTip(`已切换至全景视窗 (0~${currentGlucoseCeiling.value})`)
  } else {
    yAxisMode.value = 'focus'
    showToastTip('已切换至聚焦视窗 (0~20)')
  }
  drawMainAnalysisChart()
}

const currentDisplayItems = computed(() => {
  const fullList = getFullListForCurrentTab()
  if (!fullList.length) return []
  const start = Math.max(0, Math.min(fullList.length - 1, visibleStartIndex.value))
  const end = Math.max(start, Math.min(fullList.length - 1, visibleEndIndex.value))
  return fullList.slice(start, end + 1)
})

const isPointSelected = computed(() => {
  const fullList = getFullListForCurrentTab()
  return selectedPointIndex.value >= 0 && selectedPointIndex.value < fullList.length
})

const selectedPoint = computed<ChartItem>(() => {
  if (isPointSelected.value) {
    return getFullListForCurrentTab()[selectedPointIndex.value]
  }
  return {
    dateKey: '',
    date: '',
    dayNum: '',
    bg: null,
    bgCount: 0,
    bgDetails: [],
    wt: null,
    wtCount: 0,
    timestamp: 0,
    overlay: createEmptyOverlay()
  }
})

// 顶部标签文案：针对单次测量直接透出具体时效与时间，多次测量显示均值与次数
const currentHeaderModeTag = computed(() => {
  if (!isPointSelected.value) {
    if (currentTab.value === 'intraday') return '当日均值'
    if (currentTab.value === 'day' && selectedPeriodFilter.value !== 'all') {
      return `${selectedPeriodFilter.value} · 区间均值`
    }
    return '区间平均'
  }
  const pt = selectedPoint.value
  if (currentTab.value === 'intraday') {
    return `${pt.dayNum} · ${pt.singlePeriod || '实测'}`
  }
  if (currentTab.value === 'day') {
    if (pt.bgCount === 1) {
      return `${pt.date} · ${pt.singlePeriod || '单次'} (${pt.singleTime || ''})`.trim()
    }
    if (pt.bgCount > 1) {
      return `${pt.date} 当日均值 (测${pt.bgCount}次)`
    }
  }
  return `${pt.date}`
})

const selectedDayMinMaxText = computed(() => {
  if (!isPointSelected.value) return ''
  const pt = selectedPoint.value
  if (pt.bgCount > 1 && pt.bgMin !== null && pt.bgMax !== null && pt.bgMin !== undefined && pt.bgMax !== undefined) {
    return `波动 ${pt.bgMin.toFixed(1)} ~ ${pt.bgMax.toFixed(1)}`
  }
  return ''
})

const hasGlucoseValue = computed(() => {
  if (isPointSelected.value) {
    return selectedPoint.value.bg !== null && typeof selectedPoint.value.bg === 'number'
  }
  return currentDisplayItems.value.some(i => i.bg !== null && typeof i.bg === 'number')
})

const currentGlucoseDisplay = computed(() => {
  if (isPointSelected.value) {
    if (selectedPoint.value.bg !== null && typeof selectedPoint.value.bg === 'number') {
      return selectedPoint.value.bg.toFixed(1)
    }
    return '--'
  }
  const valid = currentDisplayItems.value.filter(i => i.bg !== null && typeof i.bg === 'number' && i.bg > 0)
  if (!valid.length) return '--'
  const sum = valid.reduce((a, b) => a + (b.bg as number), 0)
  return (sum / valid.length).toFixed(1)
})

const currentGlucoseRangeText = computed(() => {
  if (currentTab.value === 'intraday') {
    return `${intradayDateDisplay.value} 日内曲线`
  }
  const items = currentDisplayItems.value
  if (isPointSelected.value) {
    return `${selectedPoint.value.date} 节点明细`
  }
  if (!items.length) return '暂无匹配记录'
  if (items.length === 1) return `${items[0].date} 单日记录`
  return `${items[0].date} 至 ${items[items.length - 1].date} (共${items.length}个记录节点)`
})

const getStatusMeta = (bg: number) => {
  return evaluateGlucoseStatus(bg, props.targetMin, props.targetMax)
}

const glucoseStatusText = computed(() => {
  const bg = isPointSelected.value ? selectedPoint.value.bg : parseFloat(currentGlucoseDisplay.value)
  if (bg === null || isNaN(bg)) return '无血糖记录'
  return getStatusMeta(bg).text
})

const glucoseStatusClass = computed(() => {
  const bg = isPointSelected.value ? selectedPoint.value.bg : parseFloat(currentGlucoseDisplay.value)
  if (bg === null || isNaN(bg)) return 'badge-gray'
  return getStatusMeta(bg).badgeClass
})

// 底部选中节点/日内事件详情摘要卡
const detailPanelTitle = computed(() => {
  if (isPointSelected.value) {
    return `${selectedPoint.value.date} 节点详情`
  }
  if (currentTab.value === 'intraday') {
    return `${intradayDateDisplay.value} 全天记录明细`
  }
  return ''
})

const detailPanelItems = computed(() => {
  const list: Array<{ badge: string; main: string; sub?: string; typeClass: string }> = []
  let targetItems: ChartItem[] = []

  if (isPointSelected.value) {
    targetItems = [selectedPoint.value]
  } else if (currentTab.value === 'intraday') {
    targetItems = processedIntradayItems.value
  } else {
    return list
  }

  targetItems.forEach(pt => {
    pt.bgDetails.forEach(bgItem => {
      list.push({
        badge: `血糖 ${bgItem.time}`,
        main: `${bgItem.val.toFixed(1)} mmol/L`,
        sub: bgItem.period + (bgItem.note ? ` · ${bgItem.note}` : ''),
        typeClass: 'di-glucose'
      })
    })
    if (overlays.value.insulin) {
      pt.overlay.insulinList.forEach(ins => {
        list.push({
          badge: `打针 ${ins.time}`,
          main: `${ins.dose} U`,
          sub: `${ins.period} · ${ins.type.split(' ')[0]}`,
          typeClass: 'di-insulin'
        })
      })
    }
    if (overlays.value.meal) {
      pt.overlay.mealList.forEach(m => {
        list.push({
          badge: `饮食 ${m.time}`,
          main: `${m.grams} g`,
          sub: `${m.period}${m.brand ? ' · ' + m.brand : ''}`,
          typeClass: 'di-meal'
        })
      })
    }
    if (overlays.value.excretion) {
      pt.overlay.excretionList.forEach(ex => {
        list.push({
          badge: `排泄 ${ex.time}`,
          main: ex.urine,
          sub: ex.stool || '',
          typeClass: 'di-excretion'
        })
      })
    }
    if (overlays.value.weight) {
      pt.overlay.weightList.forEach(w => {
        list.push({
          badge: `称重 ${w.time}`,
          main: `${w.weight.toFixed(2)} kg`,
          sub: '',
          typeClass: 'di-weight'
        })
      })
    }
  })

  return list
})

// ========================================================
// 连续平滑像素级滚动与分层无遮挡 Canvas 渲染引擎
// ========================================================
let scrollX = 0

const getPlotMetrics = () => {
  const padLeft = 38
  const padRight = canvasWidth - 24
  const plotWidth = Math.max(10, padRight - padLeft)
  const fullLen = getFullListForCurrentTab().length
  const winSize = fullLen === 1 ? 1 : currentZoomCount.value
  const spacing = winSize <= 1 ? plotWidth : plotWidth / (winSize - 1)
  return { padLeft, padRight, plotWidth, winSize, spacing }
}

const getMinScrollX = () => {
  const fullList = getFullListForCurrentTab()
  const { winSize, spacing } = getPlotMetrics()
  if (fullList.length <= winSize || winSize <= 1) return 0
  return - (fullList.length - winSize) * spacing
}

const updateVisibleMetrics = () => {
  const fullList = getFullListForCurrentTab()
  if (!fullList.length) {
    visibleStartIndex.value = 0
    visibleEndIndex.value = 0
    return
  }
  if (fullList.length === 1) {
    visibleStartIndex.value = 0
    visibleEndIndex.value = 0
    return
  }
  const { plotWidth, spacing } = getPlotMetrics()

  const startIdx = Math.max(0, Math.min(fullList.length - 1, Math.floor((-scrollX + 6) / spacing)))
  const endIdx = Math.max(startIdx, Math.min(fullList.length - 1, Math.ceil((-scrollX + plotWidth + 2) / spacing)))

  if (visibleStartIndex.value !== startIdx || visibleEndIndex.value !== endIdx) {
    visibleStartIndex.value = startIdx
    visibleEndIndex.value = endIdx
  }
}

const initPositionForCurrentTab = () => {
  const limits = getTabZoomLimits()
  currentZoomCount.value = limits.default
  scrollX = getMinScrollX()
  selectedPointIndex.value = -1
  if (currentTab.value === 'day') {
    currentQuickRange.value = '7d'
  } else if (currentTab.value === 'intraday') {
    currentQuickRange.value = ''
  }
  updateVisibleMetrics()
  drawMainAnalysisChart()
}

const applyQuickRange = (range: '7d' | '14d' | '30d' | 'all') => {
  gestures.stopAnimation()

  currentQuickRange.value = range
  selectedPointIndex.value = -1
  const fullList = getFullListForCurrentTab()
  const total = Math.max(3, fullList.length)

  if (range === '7d') {
    currentZoomCount.value = Math.min(7, total)
    scrollX = getMinScrollX()
    showToastTip('已切换至近7期有效记录')
  } else if (range === '14d') {
    currentZoomCount.value = Math.min(14, total)
    scrollX = getMinScrollX()
    showToastTip('已切换至近14期有效记录')
  } else if (range === '30d') {
    currentZoomCount.value = Math.min(30, total)
    scrollX = getMinScrollX()
    showToastTip('已切换至近30期有效记录')
  } else if (range === 'all') {
    currentZoomCount.value = total
    scrollX = 0
    showToastTip('已展示全部有效记录走势')
  }

  updateVisibleMetrics()
  drawMainAnalysisChart()
}

const initGlucoseCanvas = (callback?: () => void) => {
  const query = uni.createSelectorQuery().in(instance?.proxy || instance)
  query.select('#glucoseFsCanvas').fields({ node: true, size: true, rect: true }, () => {})
  query.select('.fs-canvas-box').boundingClientRect()
  query.exec((res) => {
    if (res && res[0] && res[0].node) {
      const dpr = uni.getSystemInfoSync().pixelRatio || 2

      glucoseCanvasNode = res[0].node
      glucoseCtx = glucoseCanvasNode.getContext('2d')
      canvasWidth = res[0].width
      glucoseCanvasHeight = res[0].height
      glucoseCanvasNode.width = canvasWidth * dpr
      glucoseCanvasNode.height = glucoseCanvasHeight * dpr
      glucoseCtx.scale(dpr, dpr)

      if (res[1] && typeof res[1].left === 'number') {
        canvasBoxLeft = res[1].left
      } else if (res[0] && typeof res[0].left === 'number') {
        canvasBoxLeft = res[0].left
      }

      if (callback) callback()
    }
  })
}

// 绘制圆角微胶囊背景辅助函数
const drawRoundedBadge = (
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  bgColor: string,
  borderColor: string
) => {
  const left = x - w / 2
  const top = y - h / 2
  ctx.beginPath()
  ctx.moveTo(left + r, top)
  ctx.lineTo(left + w - r, top)
  ctx.quadraticCurveTo(left + w, top, left + w, top + r)
  ctx.lineTo(left + w, top + h - r)
  ctx.quadraticCurveTo(left + w, top + h, left + w - r, top + h)
  ctx.lineTo(left + r, top + h)
  ctx.quadraticCurveTo(left, top + h, left, top + h - r)
  ctx.lineTo(left, top + r)
  ctx.quadraticCurveTo(left, top, left + r, top)
  ctx.closePath()
  ctx.fillStyle = bgColor
  ctx.fill()
  ctx.lineWidth = 1
  ctx.strokeStyle = borderColor
  ctx.stroke()
}

// 核心分层渲染函数：严格隔离【血糖折线区】、【底部多维事件泳道】与【X轴刻度区】，彻底杜绝文字重叠或遮挡
const drawMainAnalysisChart = () => {
  if (!glucoseCtx) return
  const ctx = glucoseCtx
  const items = getFullListForCurrentTab()

  ctx.clearRect(0, 0, canvasWidth, glucoseCanvasHeight)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasWidth, glucoseCanvasHeight)

  if (!items.length) {
    ctx.fillStyle = '#94A3B8'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    const emptyMsg = currentTab.value === 'intraday'
      ? '该日期暂无记录，请点击上方切换上一记录日'
      : '暂无符合条件的历史记录'
    ctx.fillText(emptyMsg, canvasWidth / 2, glucoseCanvasHeight / 2)
    return
  }

  const { padLeft, padRight, plotWidth, spacing } = getPlotMetrics()
  const activeKeys = activeOverlayKeys.value
  const laneRowHeight = 16
  const eventLaneHeight = activeKeys.length > 0 ? activeKeys.length * laneRowHeight + 10 : 0

  const topY = 26
  const axisY = glucoseCanvasHeight - 24
  const glucoseBottomY = axisY - eventLaneHeight

  const ceiling = currentGlucoseCeiling.value
  const getY = (bg: number) => {
    const clamped = Math.max(0, Math.min(ceiling, bg))
    return glucoseBottomY - (clamped / ceiling) * (glucoseBottomY - topY)
  }

  const getItemX = (index: number) => {
    if (items.length === 1) {
      return padLeft + plotWidth / 2
    }
    return padLeft + index * spacing + scrollX
  }

  // 1. 绘制血糖区固定网格虚线与 Y 轴刻度
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = '#E2E8F0'

  let gridSteps: number[] = []
  if (ceiling === 20) gridSteps = [20, 15, 10, 5]
  else if (ceiling === 25) gridSteps = [25, 20, 15, 10, 5]
  else if (ceiling === 30) gridSteps = [30, 20, 10]
  else if (ceiling === 35) gridSteps = [35, 25, 15, 5]
  else {
    const step = Math.ceil(ceiling / 4)
    gridSteps = [ceiling, step * 3, step * 2, step]
  }

  gridSteps.forEach(v => {
    const y = getY(v)
    ctx.beginPath()
    ctx.moveTo(padLeft, y)
    ctx.lineTo(padRight, y)
    ctx.stroke()

    ctx.fillStyle = '#94A3B8'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${v}`, padLeft - 6, y + 3)
  })

  // 血糖 0 刻度分界线
  ctx.setLineDash([])
  ctx.strokeStyle = '#CBD5E1'
  ctx.beginPath()
  ctx.moveTo(padLeft, glucoseBottomY)
  ctx.lineTo(padRight, glucoseBottomY)
  ctx.stroke()
  ctx.fillStyle = '#94A3B8'
  ctx.font = '10px sans-serif'
  ctx.textAlign = 'right'
  ctx.fillText('0', padLeft - 6, glucoseBottomY + 3)

  // 若开启了多维事件泳道，绘制泳道浅底色与左侧泳道标题
  if (activeKeys.length > 0) {
    ctx.fillStyle = '#F8FAFC'
    ctx.fillRect(padLeft, glucoseBottomY + 1, canvasWidth - padLeft - 4, eventLaneHeight - 2)

    ctx.strokeStyle = '#E2E8F0'
    ctx.beginPath()
    ctx.moveTo(padLeft, axisY)
    ctx.lineTo(padRight, axisY)
    ctx.stroke()

    const keyLabelMap: Record<string, { label: string; color: string }> = {
      insulin: { label: '针', color: '#EA580C' },
      meal: { label: '食', color: '#D97706' },
      excretion: { label: '排', color: '#0D9488' },
      weight: { label: '重', color: '#2563EB' }
    }
    activeKeys.forEach((k, kIdx) => {
      const rowCenterY = glucoseBottomY + 6 + kIdx * laneRowHeight + laneRowHeight / 2
      ctx.fillStyle = keyLabelMap[k].color
      ctx.font = 'bold 9.5px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(keyLabelMap[k].label, padLeft - 6, rowCenterY + 3)
    })
  }

  // 目标安全区间参考线
  const { min: targetMin, max: targetMax } = normalizeTargetRange(props.targetMin, props.targetMax)
  const yMax = getY(targetMax)
  ctx.setLineDash([4, 2])
  ctx.strokeStyle = '#FCA5A5'
  ctx.beginPath()
  ctx.moveTo(padLeft, yMax)
  ctx.lineTo(padRight, yMax)
  ctx.stroke()

  const yMin = getY(targetMin)
  ctx.strokeStyle = '#86EFAC'
  ctx.beginPath()
  ctx.moveTo(padLeft, yMin)
  ctx.lineTo(padRight, yMin)
  ctx.stroke()
  ctx.setLineDash([])

  // 2. 剪裁区域：绘制选中光柱、血糖折线（含跨3天断更虚线）、数据点与底部事件泳道徽章
  ctx.save()
  ctx.beginPath()
  ctx.rect(padLeft - 4, 2, canvasWidth - (padLeft - 4) - 2, axisY - 2 + 4)
  ctx.clip()

  if (selectedPointIndex.value !== -1 && selectedPointIndex.value < items.length) {
    const selX = getItemX(selectedPointIndex.value)
    const beamW = currentZoomCount.value <= 4 ? 40 : (currentZoomCount.value <= 8 ? 26 : 16)
    drawSelectionBeam(ctx, selX, topY, axisY, beamW)
  }

  // 收集有效血糖点并分段绘制（当相邻两个有效记录日间隔 > 3 天时，使用虚线连接提示间隔期）
  const validBgNodes: { x: number; y: number; ts: number }[] = []
  items.forEach((item, i) => {
    if (item.bg !== null && typeof item.bg === 'number' && item.bg > 0) {
      validBgNodes.push({
        x: getItemX(i),
        y: getY(item.bg),
        ts: item.timestamp
      })
    }
  })

  if (validBgNodes.length >= 2) {
    ctx.lineWidth = currentZoomCount.value <= 4 ? 2.6 : 2.0
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const THREE_DAYS_MS = 3.5 * 24 * 3600 * 1000

    for (let j = 0; j < validBgNodes.length - 1; j++) {
      const p1 = validBgNodes[j]
      const p2 = validBgNodes[j + 1]
      const isLongGap = currentTab.value === 'day' && (p2.ts - p1.ts > THREE_DAYS_MS)
      ctx.beginPath()
      if (isLongGap) {
        ctx.setLineDash([4, 4])
        ctx.strokeStyle = '#94A3B8'
      } else {
        ctx.setLineDash([])
        ctx.strokeStyle = '#64748B'
      }
      ctx.moveTo(p1.x, p1.y)
      ctx.lineTo(p2.x, p2.y)
      ctx.stroke()
    }
    ctx.setLineDash([])
  }

  // 绘制血糖圆点与防碰撞数值标签
  const showNumbers = currentZoomCount.value <= 10 || items.length <= 10
  const dotR = currentZoomCount.value <= 4 ? 5.2 : (currentZoomCount.value <= 8 ? 4.0 : 2.8)
  const fontStyle = currentZoomCount.value <= 4 ? 'bold 12px sans-serif' : 'bold 10.5px sans-serif'
  let lastBgLabelRightX = -999

  items.forEach((item, i) => {
    const x = getItemX(i)
    if (x < padLeft - 30 || x > padRight + 30) return

    if (item.bg !== null && typeof item.bg === 'number' && item.bg > 0) {
      const isOutlier = yAxisMode.value === 'focus' && item.bg > ceiling
      const y = getY(item.bg)
      const meta = getStatusMeta(item.bg)

      ctx.beginPath()
      ctx.arc(x, y, dotR, 0, Math.PI * 2)
      ctx.fillStyle = isOutlier ? '#DC2626' : meta.color
      ctx.fill()
      ctx.lineWidth = currentZoomCount.value <= 4 ? 2 : 1.5
      ctx.strokeStyle = '#FFFFFF'
      ctx.stroke()

      const isSelected = selectedPointIndex.value === i
      if (showNumbers || isSelected) {
        const textStr = isOutlier ? `▲${item.bg.toFixed(1)}` : item.bg.toFixed(1)
        ctx.font = fontStyle
        const estW = (ctx.measureText ? ctx.measureText(textStr).width : 24) + 6

        // 水平防重叠保护：仅在空间充足或为当前选中点时绘制数值文字
        if (isSelected || x - estW / 2 > lastBgLabelRightX) {
          const textY = isOutlier
            ? Math.min(glucoseBottomY - 6, y + dotR + 11)
            : Math.max(15, y - (currentZoomCount.value <= 4 ? 8 : 6))
          drawClampedPointLabel(
            ctx,
            textStr,
            x,
            textY,
            padLeft,
            padRight,
            canvasWidth,
            isOutlier ? '#DC2626' : meta.color,
            fontStyle
          )
          lastBgLabelRightX = x + estW / 2
        }
      }
    }
  })

  // 绘制底部独立事件泳道中的多维事件徽章（每类事件独占一行泳道 + 水平防碰撞，绝对不遮挡折线或彼此重叠）
  if (activeKeys.length > 0) {
    const styleMap: Record<string, { bg: string; border: string; text: string }> = {
      insulin: { bg: '#FFF7ED', border: '#FDBA74', text: '#C2410C' },
      meal: { bg: '#FFFBEB', border: '#FDE68A', text: '#B45309' },
      excretion: { bg: '#F0FDFA', border: '#99F6E4', text: '#0F766E' },
      weight: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8' }
    }

    activeKeys.forEach((k, kIdx) => {
      const rowCenterY = glucoseBottomY + 6 + kIdx * laneRowHeight + laneRowHeight / 2
      let lastBadgeRightX = padLeft - 4

      items.forEach((item, i) => {
        const x = getItemX(i)
        if (x < padLeft - 20 || x > padRight + 20) return

        let badgeText = ''
        if (k === 'insulin' && item.overlay.insulinText) badgeText = item.overlay.insulinText
        else if (k === 'meal' && item.overlay.mealText) badgeText = item.overlay.mealText
        else if (k === 'excretion' && item.overlay.excretionText) badgeText = item.overlay.excretionText
        else if (k === 'weight' && item.overlay.weightText) badgeText = item.overlay.weightText

        if (!badgeText) return

        const st = styleMap[k]
        ctx.font = 'bold 9px sans-serif'
        const tw = (ctx.measureText ? ctx.measureText(badgeText).width : 22) + 8
        const isSelected = selectedPointIndex.value === i

        // 若间距足够或被选中，绘制完整微胶囊文字；若缩放极密，退化为清晰的彩色圆点防重叠
        if (isSelected || (currentZoomCount.value <= 9 && x - tw / 2 > lastBadgeRightX)) {
          const drawX = Math.max(padLeft + tw / 2 + 1, Math.min(canvasWidth - tw / 2 - 3, x))
          drawRoundedBadge(ctx, drawX, rowCenterY, tw, 13, 4, st.bg, st.border)
          ctx.fillStyle = st.text
          ctx.textAlign = 'center'
          ctx.fillText(badgeText, drawX, rowCenterY + 3)
          lastBadgeRightX = drawX + tw / 2 + 3
        } else {
          ctx.beginPath()
          ctx.arc(x, rowCenterY, 3, 0, Math.PI * 2)
          ctx.fillStyle = st.text
          ctx.fill()
        }
      })
    })
  }

  ctx.restore()

  // 3. 独立绘制 X 轴刻度（带水平碰撞检测，彻底杜绝任何字号叠加）
  let lastXLabelRight = -999
  items.forEach((item, i) => {
    const x = getItemX(i)
    if (x < padLeft - 30 || x > padRight + 30) return

    const isCur = selectedPointIndex.value === i
    const font = isCur ? 'bold 10.5px sans-serif' : '10px sans-serif'
    ctx.font = font
    const labelStr = item.dayNum
    const textW = (ctx.measureText ? ctx.measureText(labelStr).width : 28) + 8

    if (isCur || x - textW / 2 > lastXLabelRight) {
      const color = isCur ? '#0F172A' : '#64748B'
      drawClampedXAxisLabel(ctx, labelStr, x, axisY + 15, padLeft, canvasWidth, color, font)
      lastXLabelRight = x + textW / 2
    }
  })
}

const getBoxLeft = () => {
  if (canvasBoxLeft > 0) return canvasBoxLeft
  try {
    const sys = uni.getSystemInfoSync()
    return (sys.windowWidth * 36) / 750
  } catch (e) {
    return 18
  }
}

const triggerZoomLimitAnimation = (type: 'in' | 'out', tipText?: string) => {
  zoomLimitClass.value = type === 'in' ? 'fs-zoom-limit-in' : 'fs-zoom-limit-out'
  const defaultText = type === 'in' ? '已放大至最大视图' : '已缩小至全景视图'
  showToastTip(tipText || defaultText)
  setTimeout(() => {
    zoomLimitClass.value = ''
  }, 240)
}

const gestures = useChartGestures({
  zoomCount: currentZoomCount,
  selectedIndex: selectedPointIndex,
  getScrollX: () => scrollX,
  setScrollX: (x: number) => { scrollX = x },
  getItemCount: () => getFullListForCurrentTab().length,
  getPlotMetrics,
  getMinScrollX,
  getBoxLeft,
  getZoomLimits: () => getTabZoomLimits(),
  redraw: () => {
    drawMainAnalysisChart()
    updateVisibleMetrics()
  },
  onZoomChange: (count) => {
    if (currentTab.value === 'day') {
      if (count === 7) currentQuickRange.value = '7d'
      else if (count === 14) currentQuickRange.value = '14d'
      else if (count === 30) currentQuickRange.value = '30d'
      else if (count === processedDayItems.value.length) currentQuickRange.value = 'all'
      else currentQuickRange.value = ''
    }
  },
  onZoomLimit: (type, limit) => {
    triggerZoomLimitAnimation(type, type === 'in' ? `已放大至最大视图 (${limit}项)` : `已缩小至全景视图 (${limit}项)`)
  },
  onEdgeLimit: (dir) => {
    triggerEdgeLimitAnimation(dir, dir === 'left' ? '已至最早记录' : '已至最新记录')
  },
  hitRadiusMin: 22,
  pinchLimitThreshold: 35,
  edgeThreshold: 25
})

const handleTouchStart = gestures.onTouchStart
const handleTouchMove = gestures.onTouchMove
const handleTouchEnd = gestures.onTouchEnd
const handleTouchCancel = gestures.onTouchCancel

onUnmounted(() => {
  gestures.dispose()
})

const handleBackgroundTap = () => {
  if (gestures.wasTouchedRecently(400)) {
    return
  }
  if (selectedPointIndex.value !== -1) {
    selectedPointIndex.value = -1
    drawMainAnalysisChart()
  }
}

const switchTab = (tab: 'intraday' | 'day' | 'week' | 'month') => {
  if (currentTab.value === tab) return
  currentTab.value = tab
  if (tab === 'intraday') {
    if (allActiveDates.value.length > 0 && !allActiveDates.value.includes(intradayDate.value)) {
      intradayDate.value = allActiveDates.value[allActiveDates.value.length - 1]
    }
    buildIntradayItems(intradayDate.value)
    currentQuickRange.value = ''
  } else if (tab === 'day') {
    currentQuickRange.value = '7d'
  } else {
    currentQuickRange.value = ''
  }
  nextTick(() => {
    initGlucoseCanvas(() => {
      initPositionForCurrentTab()
    })
  })
}

const handleClose = () => {
  emit('close')
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    prepareData()
    setTimeout(() => {
      isAnimShow.value = true
    }, 20)
    nextTick(() => {
      setTimeout(() => {
        initGlucoseCanvas(() => {
          initPositionForCurrentTab()
        })
      }, 80)
    })
  } else {
    isAnimShow.value = false
    selectedPointIndex.value = -1
    gestures.dispose()
  }
})

watch(
  [
    () => props.glucoseRecords,
    () => props.weightRecords,
    () => props.insulinRecords,
    () => props.mealRecords,
    () => props.excretionRecords
  ],
  () => {
    if (props.visible) {
      const oldMinScrollX = getMinScrollX()
      const offsetFromRight = scrollX - oldMinScrollX
      prepareData()
      if (currentQuickRange.value === 'all') {
        const fullList = getFullListForCurrentTab()
        currentZoomCount.value = Math.max(3, fullList.length)
        scrollX = 0
      } else {
        const newMinScrollX = getMinScrollX()
        scrollX = Math.max(newMinScrollX, Math.min(0, newMinScrollX + offsetFromRight))
      }
      updateVisibleMetrics()
      drawMainAnalysisChart()
    }
  },
  { deep: true }
)
</script>

<style scoped>
.fs-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;
  background-color: #FFFFFF;
  z-index: 99999;
  display: flex;
  flex-direction: column;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease-out;
  box-sizing: border-box;
}
.fs-modal-overlay.fs-modal-show {
  opacity: 1;
  pointer-events: auto;
}

.fs-modal-content {
  width: 100%;
  height: 100%;
  background-color: #FFFFFF;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  position: relative;
}

/* 极值/边界触达提醒 Toast */
.fs-limit-toast {
  position: absolute;
  top: 96rpx;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(15, 23, 42, 0.82);
  padding: 10rpx 28rpx;
  border-radius: 40rpx;
  z-index: 10000;
  pointer-events: none;
  animation: fadeInOutToast 1.4s ease forwards;
  backdrop-filter: blur(8rpx);
}
.fs-limit-toast-text {
  font-size: 22rpx;
  color: #FFFFFF;
  font-weight: 600;
  letter-spacing: 0.5rpx;
}
@keyframes fadeInOutToast {
  0% { opacity: 0; transform: translate(-50%, -10rpx); }
  15% { opacity: 1; transform: translate(-50%, 0); }
  80% { opacity: 1; transform: translate(-50%, 0); }
  100% { opacity: 0; transform: translate(-50%, -10rpx); }
}

/* 顶部栏 */
.fs-header {
  padding: 32rpx 36rpx 18rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2rpx solid #F1F5F9;
}
.fs-title {
  font-size: 34rpx;
  font-weight: 800;
  color: #1E293B;
}
.fs-close-btn {
  width: 56rpx;
  height: 56rpx;
  border-radius: 28rpx;
  background-color: #F1F5F9;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fs-close-icon {
  font-size: 26rpx;
  color: #64748B;
  font-weight: bold;
}

/* 胶囊 Tab [ 日内 | 天 | 周 | 月 ] */
.fs-tab-wrapper {
  display: flex;
  justify-content: center;
  padding: 18rpx 0 12rpx;
}
.fs-tab-bar {
  display: inline-flex;
  padding: 6rpx;
  background-color: #F1F5F9;
  border-radius: 100rpx;
  border: 2rpx solid #E2E8F0;
}
.fs-tab-item {
  padding: 10rpx 36rpx;
  font-size: 26rpx;
  color: #64748B;
  font-weight: 500;
  border-radius: 100rpx;
  transition: all 0.2s ease;
}
.fs-tab-item.active {
  background-color: #FFFFFF;
  color: #0F172A;
  font-weight: 700;
  box-shadow: 0 2rpx 8rpx rgba(0, 0, 0, 0.06);
}

/* 日内日期切换导航栏 */
.fs-intraday-nav {
  padding: 4rpx 36rpx 12rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}
.fs-nav-step-btn {
  padding: 10rpx 20rpx;
  background: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 100rpx;
  font-size: 22rpx;
  font-weight: 600;
  color: #334155;
}
.fs-nav-step-btn.disabled {
  opacity: 0.4;
}
.fs-nav-date-Mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6rpx 24rpx;
  background: #EFF6FF;
  border: 2rpx solid #BFDBFE;
  border-radius: 20rpx;
}
.fs-nav-date-text {
  font-size: 24rpx;
  font-weight: 700;
  color: #1E40AF;
}
.fs-nav-date-sub {
  font-size: 19rpx;
  color: #3B82F6;
  margin-top: 2rpx;
}

/* 趋势分析快捷栏 */
.fs-quick-bar {
  padding: 4rpx 36rpx 10rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-sizing: border-box;
}
.fs-quick-pills {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.fs-quick-pill {
  padding: 8rpx 20rpx;
  font-size: 22rpx;
  color: #64748B;
  background-color: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 100rpx;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
  text-align: center;
  line-height: 1.2;
}
.fs-quick-pill.active {
  background-color: #EFF6FF;
  color: #2563EB;
  border-color: #3B82F6;
  font-weight: 700;
}
.fs-latest-anchor-hint {
  font-size: 20rpx;
  color: #64748B;
  background: #F1F5F9;
  padding: 4rpx 14rpx;
  border-radius: 100rpx;
  font-weight: 500;
}

/* 动态时效同口径筛选栏 */
.fs-period-filter-wrap {
  padding: 0 36rpx 10rpx;
}
.fs-period-scroll {
  width: 100%;
  white-space: nowrap;
}
.fs-period-row {
  display: inline-flex;
  align-items: center;
  gap: 10rpx;
}
.fs-period-chip {
  display: inline-block;
  padding: 6rpx 20rpx;
  font-size: 21rpx;
  color: #64748B;
  background: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 100rpx;
  font-weight: 500;
}
.fs-period-chip.active {
  background: #FEF2F2;
  color: #DC2626;
  border-color: #FCA5A5;
  font-weight: 700;
}

/* 顶部指标区 */
.fs-metric-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6rpx;
  min-height: 40rpx;
}
.fs-top-right-actions {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.fs-drilldown-btn {
  padding: 4rpx 16rpx;
  background: #EFF6FF;
  border: 1.5rpx solid #93C5FD;
  border-radius: 100rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: #2563EB;
}
.fs-y-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 4rpx 18rpx;
  background-color: #F8FAFC;
  border: 1.5rpx solid #CBD5E1;
  border-radius: 100rpx;
}
.fs-y-toggle-text {
  font-size: 20rpx;
  font-weight: 700;
  color: #475569;
  line-height: 1.2;
}
.fs-y-toggle.panorama {
  background-color: #EFF6FF;
  border-color: #93C5FD;
}
.fs-y-toggle.panorama .fs-y-toggle-text {
  color: #2563EB;
}
.fs-y-toggle-dot {
  width: 10rpx;
  height: 10rpx;
  border-radius: 5rpx;
  background-color: #DC2626;
}

.fs-main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 6rpx 36rpx 28rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.fs-section {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
}

.fs-metric-header {
  margin-bottom: 12rpx;
}
.fs-range-text {
  font-size: 23rpx;
  color: #94A3B8;
  font-weight: 500;
}
.fs-tag-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 6rpx;
}
.fs-mode-tag {
  font-size: 21rpx;
  color: #475569;
  font-weight: 600;
  background-color: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}
.fs-metric-label {
  font-size: 24rpx;
  color: #64748B;
  font-weight: 600;
}
.fs-minmax-hint {
  font-size: 21rpx;
  color: #64748B;
  background: #F1F5F9;
  padding: 2rpx 12rpx;
  border-radius: 8rpx;
}

.fs-value-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}
.fs-big-number {
  font-size: 62rpx;
  font-weight: 900;
  color: #0F172A;
  line-height: 1;
}
.fs-unit {
  font-size: 24rpx;
  color: #94A3B8;
}

.fs-status-badge {
  font-size: 22rpx;
  font-weight: 700;
  padding: 4rpx 16rpx;
  border-radius: 8rpx;
  margin-left: 8rpx;
}
.badge-green {
  background-color: #F0FDF4;
  color: #16A34A;
  border: 2rpx solid #DCFCE7;
}
.badge-yellow {
  background-color: #FEFCE8;
  color: #CA8A04;
  border: 2rpx solid #FEF08A;
}
.badge-red {
  background-color: #FEF2F2;
  color: #DC2626;
  border: 2rpx solid #FECACA;
}
.badge-gray {
  background-color: #F1F5F9;
  color: #94A3B8;
  border: 2rpx solid #E2E8F0;
}

/* 多维事件叠加控制栏 */
.fs-overlay-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12rpx;
  padding: 8rpx 16rpx;
  background: #F8FAFC;
  border-radius: 16rpx;
  border: 2rpx solid #F1F5F9;
}
.fs-overlay-label {
  font-size: 21rpx;
  color: #64748B;
  font-weight: 600;
  margin-right: 10rpx;
  flex-shrink: 0;
}
.fs-overlay-chips {
  display: flex;
  align-items: center;
  gap: 10rpx;
  flex: 1;
  justify-content: flex-end;
  flex-wrap: wrap;
}
.fs-ov-chip {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 16rpx;
  border-radius: 100rpx;
  font-size: 21rpx;
  font-weight: 600;
  color: #64748B;
  background: #FFFFFF;
  border: 2rpx solid #E2E8F0;
  transition: all 0.18s ease;
}
.ov-dot {
  width: 12rpx;
  height: 12rpx;
  border-radius: 6rpx;
}
.dot-insulin { background: #EA580C; }
.dot-meal { background: #D97706; }
.dot-excretion { background: #0D9488; }
.dot-weight { background: #2563EB; }

.fs-ov-chip.chip-insulin.active {
  background: #FFF7ED;
  border-color: #FDBA74;
  color: #C2410C;
}
.fs-ov-chip.chip-meal.active {
  background: #FFFBEB;
  border-color: #FDE68A;
  color: #B45309;
}
.fs-ov-chip.chip-excretion.active {
  background: #F0FDFA;
  border-color: #99F6E4;
  color: #0F766E;
}
.fs-ov-chip.chip-weight.active {
  background: #EFF6FF;
  border-color: #BFDBFE;
  color: #1D4ED8;
}
.fs-ov-clear {
  padding: 6rpx 14rpx;
  border-radius: 100rpx;
  font-size: 20rpx;
  font-weight: 700;
  color: #DC2626;
  background: #FEF2F2;
  border: 2rpx solid #FECACA;
}

/* 图表容器 */
.fs-canvas-box {
  width: 100%;
  height: 390rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 2rpx solid #E2E8F0;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
  transition: height 0.2s ease;
}
.fs-canvas-box.has-overlays {
  height: 440rpx;
}
.fs-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* 底部选中节点/当日事件详情面板 */
.fs-detail-panel {
  margin-top: 16rpx;
  background: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 20rpx;
  padding: 16rpx 22rpx;
  flex: 1;
  min-height: 120rpx;
  max-height: 230rpx;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fs-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10rpx;
}
.fs-detail-title {
  font-size: 23rpx;
  font-weight: 700;
  color: #334155;
}
.fs-detail-drill {
  font-size: 21rpx;
  font-weight: 700;
  color: #2563EB;
}
.fs-detail-scroll {
  flex: 1;
  overflow: hidden;
}
.fs-detail-tags {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.fs-detail-item {
  display: flex;
  align-items: center;
  gap: 12rpx;
  padding: 8rpx 14rpx;
  background: #FFFFFF;
  border-radius: 12rpx;
  border: 1.5rpx solid #E2E8F0;
  font-size: 22rpx;
}
.di-badge {
  font-size: 20rpx;
  font-weight: 700;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  flex-shrink: 0;
}
.di-main {
  font-weight: 700;
  color: #1E293B;
}
.di-sub {
  color: #64748B;
  font-size: 21rpx;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.di-glucose .di-badge { background: #FEF2F2; color: #DC2626; }
.di-insulin .di-badge { background: #FFF7ED; color: #EA580C; }
.di-meal .di-badge { background: #FFFBEB; color: #D97706; }
.di-excretion .di-badge { background: #F0FDFA; color: #0D9488; }
.di-weight .di-badge { background: #EFF6FF; color: #2563EB; }

@keyframes edgeBounceLeft {
  0% { transform: translateX(0); }
  35% { transform: translateX(12rpx); }
  70% { transform: translateX(-3rpx); }
  100% { transform: translateX(0); }
}
@keyframes edgeBounceRight {
  0% { transform: translateX(0); }
  35% { transform: translateX(-12rpx); }
  70% { transform: translateX(3rpx); }
  100% { transform: translateX(0); }
}
.fs-edge-limit-left {
  animation: edgeBounceLeft 0.26s cubic-bezier(0.25, 1, 0.5, 1) !important;
}
.fs-edge-limit-right {
  animation: edgeBounceRight 0.26s cubic-bezier(0.25, 1, 0.5, 1) !important;
}
.fs-zoom-limit-in {
  transform: scale(1.036) !important;
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25) !important;
}
.fs-zoom-limit-out {
  transform: scale(0.964) !important;
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25) !important;
}
</style>
