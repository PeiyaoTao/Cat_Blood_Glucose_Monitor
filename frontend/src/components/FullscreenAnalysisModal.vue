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

      <!-- 时间维度切换 [ 天 | 周 | 月 ] -->
      <view class="fs-tab-wrapper" @tap.stop>
        <view class="fs-tab-bar">
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

      <!-- 趋势分析快捷切换 [ 近7天 | 近14天 | 近30天 | 全部 ] (居左对齐，无文字前缀，无emoji) -->
      <view class="fs-quick-bar" @tap.stop>
        <view class="fs-quick-pills">
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === '7d' }" 
            @tap="applyQuickRange('7d')"
          >
            近7天
          </view>
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === '14d' }" 
            @tap="applyQuickRange('14d')"
          >
            近14天
          </view>
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === '30d' }" 
            @tap="applyQuickRange('30d')"
          >
            近30天
          </view>
          <view 
            class="fs-quick-pill" 
            :class="{ active: currentQuickRange === 'all' }" 
            @tap="applyQuickRange('all')"
          >
            全部
          </view>
        </view>
      </view>

      <!-- 主分析容器：全屏自适应布局 -->
      <view class="fs-main-body">
        
        <!-- 1. 血糖走势区块 (左侧大数字 + 图表) -->
        <view class="fs-section" id="glucoseSection">
          <view class="fs-metric-header" @tap.stop="handleBackgroundTap">
            <view class="fs-metric-top-bar">
              <text class="fs-range-text">{{ currentGlucoseRangeText }}</text>
              <!-- 选项 A：Y 轴顶部微型切换胶囊 (聚焦 20 / 全景 35)，无 emoji -->
              <view 
                class="fs-y-toggle" 
                :class="{ panorama: yAxisMode === 'panorama' }"
                @tap.stop="toggleYAxisMode"
              >
                <text class="fs-y-toggle-text">{{ yAxisToggleLabel }}</text>
                <view class="fs-y-toggle-dot" v-if="hasOutlierInView && yAxisMode === 'focus'"></view>
              </view>
            </view>
            <view class="fs-tag-row">
              <text class="fs-mode-tag">{{ isPointSelected ? selectedGlucoseTag : '平均' }}</text>
              <text class="fs-metric-label">血糖</text>
            </view>
            <view class="fs-value-row">
              <text class="fs-big-number">{{ currentGlucoseDisplay }}</text>
              <text class="fs-unit" v-if="hasGlucoseValue">mmol/L</text>
              <text class="fs-status-badge" :class="glucoseStatusClass" v-if="hasGlucoseValue">
                {{ glucoseStatusText }}
              </text>
              <text class="fs-status-badge badge-gray" v-else>
                未记录
              </text>
            </view>
          </view>

          <!-- 血糖图表 Canvas 2D 容器 (无震动纯净触控、丝滑手势拖拽、支持最大放大至3~4份数据) -->
          <view 
            class="fs-canvas-box" 
            :class="[zoomLimitClass, edgeLimitClass]"
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

        <!-- 2. 体重对比区块：平常折叠显示，点击展开 -->
        <view 
          class="fs-weight-collapsed-bar" 
          v-if="!isWeightExpanded" 
          @tap.stop="toggleWeightExpanded"
        >
          <view class="fs-wbar-left">
            <view class="fs-wbar-badge-icon">
              <text class="fs-wbar-icon-text">WT</text>
            </view>
            <view class="fs-wbar-info">
              <view class="fs-wbar-title-row">
                <text class="fs-wbar-title">体重对比走势</text>
                <text class="fs-status-badge badge-blue fs-wbar-badge" v-if="hasWeightValue">正常</text>
              </view>
              <text class="fs-wbar-sub">{{ currentWeightCollapsedSubText }}</text>
            </view>
          </view>
          
          <view class="fs-wbar-right">
            <view class="fs-wbar-val-block" v-if="hasWeightValue">
              <text class="fs-wbar-val">{{ currentWeightValueDisplay }}</text>
              <text class="fs-wbar-unit">kg</text>
            </view>
            <text class="fs-wbar-empty" v-else>未记录</text>
            <view class="fs-wbar-btn">
              <text class="fs-wbar-btn-text">展开</text>
              <text class="fs-wbar-arrow">▼</text>
            </view>
          </view>
        </view>

        <!-- 2. 体重对比区块：展开形态 (用户点击展开后显示) -->
        <view class="fs-section fs-section-border" id="weightSection" v-else>
          <view class="fs-metric-header" @tap.stop="handleBackgroundTap">
            <view class="fs-metric-top-bar">
              <text class="fs-range-text">{{ currentWeightRangeText }}</text>
              <!-- 收起按钮 -->
              <view class="fs-weight-collapse-btn" @tap.stop="toggleWeightExpanded">
                <text class="fs-weight-collapse-btn-text">收起</text>
                <text class="fs-wbar-arrow up">▲</text>
              </view>
            </view>
            <view class="fs-tag-row">
              <text class="fs-mode-tag">{{ isPointSelected ? selectedWeightTag : '平均' }}</text>
              <text class="fs-metric-label">体重</text>
            </view>
            <view class="fs-value-row">
              <text class="fs-big-number">{{ currentWeightValueDisplay }}</text>
              <text class="fs-unit" v-if="hasWeightValue">kg</text>
              <text class="fs-status-badge badge-blue" v-if="hasWeightValue">
                正常
              </text>
              <text class="fs-status-badge badge-gray" v-else>
                未记录
              </text>
            </view>
          </view>

          <!-- 体重图表 Canvas 2D 容器 -->
          <view 
            class="fs-canvas-box fs-canvas-box-sm" 
            :class="[zoomLimitClass, edgeLimitClass]"
            @tap.stop
            @touchstart="handleTouchStart" 
            @touchmove.stop="handleTouchMove" 
            @touchend="handleTouchEnd"
            @touchcancel="handleTouchCancel"
          >
            <canvas 
              type="2d" 
              id="weightFsCanvas" 
              class="fs-canvas"
              @tap.stop
            ></canvas>
          </view>
        </view>

      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, getCurrentInstance } from 'vue'

const props = defineProps<{
  visible: boolean
  glucoseRecords: any[]
  weightRecords: any[]
  targetMin: number
  targetMax: number
}>()

const emit = defineEmits(['update:visible', 'close'])

const instance = getCurrentInstance()
const isAnimShow = ref(false)
const currentTab = ref<'day' | 'week' | 'month'>('day')
const currentZoomCount = ref<number>(7) // 渐进平滑缩放数据量 (最大可放大至 3~4 份数据，默认 7 份)
const currentQuickRange = ref<'7d' | '14d' | '30d' | 'all' | ''>('7d') // 趋势分析选中的范围
const yAxisMode = ref<'focus' | 'panorama'>('focus') // Y轴视窗模式：'focus' (聚焦20) | 'panorama' (全景自适应)
const selectedPointIndex = ref<number>(-1) // -1 表示未选中任何具体点，显示平均值
const visibleStartIndex = ref<number>(0)
const visibleEndIndex = ref<number>(6)

let glucoseCanvasNode: any = null
let glucoseCtx: any = null
let weightCanvasNode: any = null
let weightCtx: any = null
let canvasWidth = 330
let glucoseCanvasHeight = 170
let weightCanvasHeight = 115
let canvasBoxLeft = 0

// 动画与交互反馈状态 (纯视觉极值动效，完全移除震动反馈)
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

// 触发滑达最早/最新数据边界微弹性反馈动画
const triggerEdgeLimitAnimation = (direction: 'left' | 'right', tipText?: string) => {
  edgeLimitClass.value = direction === 'left' ? 'fs-edge-limit-left' : 'fs-edge-limit-right'
  showToastTip(tipText || (direction === 'left' ? '已至最早记录' : '已至最新记录'))
  if (edgeTimer) clearTimeout(edgeTimer)
  edgeTimer = setTimeout(() => {
    edgeLimitClass.value = ''
    edgeTimer = null
  }, 260)
}

interface ChartItem {
  date: string
  dayNum: string
  bg: number | null
  wt: number | null
  bgCount: number
  wtCount: number
  timestamp: number
}

// 整理后的数据集
const processedDayItems = ref<ChartItem[]>([])
const processedWeekItems = ref<ChartItem[]>([])
const processedMonthItems = ref<ChartItem[]>([])

const parseItemDate = (item: any) => {
  let y = 2026, m = 1, d = 1
  if (item.record_date && item.record_date.includes('-')) {
    const parts = item.record_date.split('-').map(Number)
    y = parts[0]
    m = parts[1]
    d = parts[2]
  } else if (item.createTime) {
    const dt = new Date(item.createTime)
    y = dt.getFullYear()
    m = dt.getMonth() + 1
    d = dt.getDate()
  }
  const pad = (n: number) => n.toString().padStart(2, '0')
  const sortKey = `${y}-${pad(m)}-${pad(d)}`
  const dStr = `${m}/${d}`
  const dayNum = d === 1 ? `${m}/${d}` : `${d}`
  const timestamp = new Date(y, m - 1, d).getTime()
  return { sortKey, dStr, dayNum, timestamp }
}

// 预处理数据：单日多次测试统一计算当日平均值（一天对应时间轴上的一个点）
const prepareData = () => {
  // 1. 归并血糖和体重至自然日 Map
  const dateMap: Record<string, {
    sortKey: string
    dStr: string
    dayNum: string
    timestamp: number
    bgList: number[]
    wtList: number[]
  }> = {}

  if (props.glucoseRecords && props.glucoseRecords.length > 0) {
    props.glucoseRecords.forEach((item: any) => {
      if (typeof item.bg_value !== 'number') return
      const info = parseItemDate(item)
      if (!dateMap[info.sortKey]) {
        dateMap[info.sortKey] = {
          sortKey: info.sortKey,
          dStr: info.dStr,
          dayNum: info.dayNum,
          timestamp: info.timestamp,
          bgList: [],
          wtList: []
        }
      }
      dateMap[info.sortKey].bgList.push(item.bg_value)
    })
  }

  if (props.weightRecords && props.weightRecords.length > 0) {
    props.weightRecords.forEach((item: any) => {
      if (typeof item.weight_value !== 'number') return
      const info = parseItemDate(item)
      if (!dateMap[info.sortKey]) {
        dateMap[info.sortKey] = {
          sortKey: info.sortKey,
          dStr: info.dStr,
          dayNum: info.dayNum,
          timestamp: info.timestamp,
          bgList: [],
          wtList: []
        }
      }
      dateMap[info.sortKey].wtList.push(item.weight_value)
    })
  }

  const sortedDates = Object.keys(dateMap).sort()
  const pad = (n: number) => n.toString().padStart(2, '0')

  // 确定全局日期的起止时间（确保时间轴是严格连续的自然日历时间轴，不存在任何日期跳跃）
  const now = new Date()
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`

  let startDate: Date
  let endDate: Date

  if (sortedDates.length === 0) {
    // 无任何记录时，默认生成至今天为止的近 30 天连续时间轴
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    const start = new Date(end.getTime() - 29 * 24 * 3600 * 1000)
    startDate = start
    endDate = end
  } else {
    const firstKey = sortedDates[0]
    const lastKey = sortedDates[sortedDates.length - 1]

    const firstParts = firstKey.split('-').map(Number)
    const lastParts = lastKey.split('-').map(Number)
    const todayParts = todayKey.split('-').map(Number)

    const firstD = new Date(firstParts[0], firstParts[1] - 1, firstParts[2], 0, 0, 0, 0)
    const lastD = new Date(lastParts[0], lastParts[1] - 1, lastParts[2], 0, 0, 0, 0)
    const todayD = new Date(todayParts[0], todayParts[1] - 1, todayParts[2], 0, 0, 0, 0)

    // 截止日期：取最新记录与今天中的较晚者
    endDate = lastD.getTime() > todayD.getTime() ? lastD : todayD

    // 起始日期：保证日维度总跨度至少包含 30 天，无缝支持近 7 / 14 / 30 天快速趋势缩放分析
    const minDays = 30
    const spanDays = Math.round((endDate.getTime() - firstD.getTime()) / (24 * 3600 * 1000)) + 1
    if (spanDays < minDays) {
      startDate = new Date(endDate.getTime() - (minDays - 1) * 24 * 3600 * 1000)
    } else {
      startDate = firstD
    }
  }

  // 2. 构建日维度 (Day) 连续自然日无间隔数据集
  const dayItemList: ChartItem[] = []
  let walker = new Date(startDate.getTime())
  const endTs = endDate.getTime()

  while (walker.getTime() <= endTs) {
    const y = walker.getFullYear()
    const m = walker.getMonth() + 1
    const d = walker.getDate()
    const key = `${y}-${pad(m)}-${pad(d)}`
    const dStr = `${m}/${d}`
    // 在进入新的月份时（每月1号），在 X 轴显示月份与日期（如 10/1），其它日子显示单独日期（如 29 30 10/1 2 3）
    const dayNum = d === 1 ? `${m}/${d}` : `${d}`
    const ts = walker.getTime()

    const dayData = dateMap[key]
    const bgAvg = dayData && dayData.bgList.length
      ? Math.round((dayData.bgList.reduce((s, x) => s + x, 0) / dayData.bgList.length) * 10) / 10
      : null
    const wtAvg = dayData && dayData.wtList.length
      ? Math.round((dayData.wtList.reduce((s, x) => s + x, 0) / dayData.wtList.length) * 100) / 100
      : null

    dayItemList.push({
      date: dStr,
      dayNum: dayNum,
      bg: bgAvg,
      wt: wtAvg,
      bgCount: dayData ? dayData.bgList.length : 0,
      wtCount: dayData ? dayData.wtList.length : 0,
      timestamp: ts
    })

    walker.setDate(walker.getDate() + 1)
  }
  processedDayItems.value = dayItemList

  // 3. 构建周维度 (Week) 连续无间隔数据集 (以每周一为基准连续步进，无断档)
  const getMonday = (d: Date) => {
    const date = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
    const day = date.getDay()
    const diff = date.getDate() - day + (day === 0 ? -6 : 1) // 调整到周一
    date.setDate(diff)
    return date
  }

  let startMon = getMonday(startDate)
  const endMon = getMonday(endDate)

  // 确保周维度至少有 7 周（默认视窗）
  const minWeeks = 7
  const totalWeeks = Math.round((endMon.getTime() - startMon.getTime()) / (7 * 24 * 3600 * 1000)) + 1
  if (totalWeeks < minWeeks) {
    startMon = new Date(endMon.getTime() - (minWeeks - 1) * 7 * 24 * 3600 * 1000)
  }

  const weekItemList: ChartItem[] = []
  let curMon = new Date(startMon.getTime())

  while (curMon.getTime() <= endMon.getTime()) {
    const nextMon = new Date(curMon.getTime() + 7 * 24 * 3600 * 1000)
    const m = curMon.getMonth() + 1
    const d = curMon.getDate()
    const weekLabel = `${m}/${d}周`

    const bgsInWeek: number[] = []
    const wtsInWeek: number[] = []

    let dayStep = new Date(curMon.getTime())
    while (dayStep.getTime() < nextMon.getTime()) {
      const k = `${dayStep.getFullYear()}-${pad(dayStep.getMonth() + 1)}-${pad(dayStep.getDate())}`
      if (dateMap[k]) {
        bgsInWeek.push(...dateMap[k].bgList)
        wtsInWeek.push(...dateMap[k].wtList)
      }
      dayStep.setDate(dayStep.getDate() + 1)
    }

    const avgBg = bgsInWeek.length 
      ? Math.round((bgsInWeek.reduce((s, x) => s + x, 0) / bgsInWeek.length) * 10) / 10 
      : null
    const avgWt = wtsInWeek.length 
      ? Math.round((wtsInWeek.reduce((s, x) => s + x, 0) / wtsInWeek.length) * 100) / 100 
      : null

    weekItemList.push({
      date: weekLabel,
      dayNum: weekLabel,
      bg: avgBg,
      wt: avgWt,
      bgCount: bgsInWeek.length,
      wtCount: wtsInWeek.length,
      timestamp: curMon.getTime()
    })

    curMon.setDate(curMon.getDate() + 7)
  }
  processedWeekItems.value = weekItemList

  // 4. 构建月维度 (Month) 连续无间隔数据集 (自然月连续步进，无断档)
  let startMonthYear = startDate.getFullYear()
  let startMonthNum = startDate.getMonth() + 1
  const endMonthYear = endDate.getFullYear()
  const endMonthNum = endDate.getMonth() + 1

  // 确保月维度至少有 6 个月（默认视窗）
  const minMonths = 6
  let totalMonths = (endMonthYear - startMonthYear) * 12 + (endMonthNum - startMonthNum) + 1
  if (totalMonths < minMonths) {
    let sub = minMonths - totalMonths
    startMonthNum -= sub
    while (startMonthNum <= 0) {
      startMonthNum += 12
      startMonthYear -= 1
    }
    totalMonths = minMonths
  }

  const monthItemList: ChartItem[] = []
  let curY = startMonthYear
  let curM = startMonthNum

  for (let mi = 0; mi < totalMonths; mi++) {
    const mLabel = `${curM}月`
    const monthTs = new Date(curY, curM - 1, 1).getTime()

    const bgsInMonth: number[] = []
    const wtsInMonth: number[] = []

    const daysInMonth = new Date(curY, curM, 0).getDate()
    for (let di = 1; di <= daysInMonth; di++) {
      const k = `${curY}-${pad(curM)}-${pad(di)}`
      if (dateMap[k]) {
        bgsInMonth.push(...dateMap[k].bgList)
        wtsInMonth.push(...dateMap[k].wtList)
      }
    }

    const avgBg = bgsInMonth.length 
      ? Math.round((bgsInMonth.reduce((s, x) => s + x, 0) / bgsInMonth.length) * 10) / 10 
      : null
    const avgWt = wtsInMonth.length 
      ? Math.round((wtsInMonth.reduce((s, x) => s + x, 0) / wtsInMonth.length) * 100) / 100 
      : null

    monthItemList.push({
      date: mLabel,
      dayNum: mLabel,
      bg: avgBg,
      wt: avgWt,
      bgCount: bgsInMonth.length,
      wtCount: wtsInMonth.length,
      timestamp: monthTs
    })

    curM++
    if (curM > 12) {
      curM = 1
      curY++
    }
  }
  processedMonthItems.value = monthItemList
}

// 获取各 Tab 的缩放范围配置 (保持默认数量：天7，周7，月6；所有图表最大均可放大至显示 3 份数据，支持平滑缩放至全部数据)
const getTabZoomLimits = () => {
  if (currentTab.value === 'week') {
    const total = Math.max(3, processedWeekItems.value.length)
    return { min: 3, max: Math.max(16, total), default: 7 }
  }
  if (currentTab.value === 'month') {
    const total = Math.max(3, processedMonthItems.value.length)
    return { min: 3, max: Math.max(12, total), default: 6 }
  }
  // 'day'
  const total = Math.max(3, processedDayItems.value.length)
  return { min: 3, max: Math.max(30, total), default: 7 }
}

// 获取当前 Tab 下的完整数据集
const getFullListForCurrentTab = () => {
  if (currentTab.value === 'week') return processedWeekItems.value
  if (currentTab.value === 'month') return processedMonthItems.value
  return processedDayItems.value
}

// 计算全景模式下的阶梯天花板 (方案一阶梯自适应：25, 30, 35)
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

// 当前生效的血糖 Y 轴天花板
const currentGlucoseCeiling = computed(() => {
  if (yAxisMode.value === 'panorama') {
    return getPanoramaCeiling()
  }
  return 20.0
})

// 检查当前数据集是否存在 > 20 的离群高值数据
const hasOutlierInView = computed(() => {
  const fullList = getFullListForCurrentTab()
  return fullList.some(item => item.bg !== null && typeof item.bg === 'number' && item.bg > 20.0)
})

// 芯片展示文案 (确保无任何 emoji)
const yAxisToggleLabel = computed(() => {
  if (yAxisMode.value === 'panorama') {
    return `全景 ${currentGlucoseCeiling.value}`
  }
  return '聚焦 20'
})

// 切换聚焦 / 全景模式
const toggleYAxisMode = () => {
  if (yAxisMode.value === 'focus') {
    yAxisMode.value = 'panorama'
    showToastTip(`已切换至全景视窗 (0~${currentGlucoseCeiling.value})`)
  } else {
    yAxisMode.value = 'focus'
    showToastTip('已切换至聚焦视窗 (0~20)')
  }
  drawBothCharts()
}

// 体重折叠与展开状态 (平常默认折叠收起，用户点击展开后再显示完整走势与图表)
const isWeightExpanded = ref(false)

const currentWeightCollapsedSubText = computed(() => {
  if (isPointSelected.value) {
    return `${selectedPoint.value.date} 体重记录`
  }
  return currentWeightRangeText.value || '当前区间'
})

// 切换体重折叠/展开状态
const toggleWeightExpanded = () => {
  isWeightExpanded.value = !isWeightExpanded.value
  if (isWeightExpanded.value) {
    showToastTip('已展开体重走势对比')
    nextTick(() => {
      setTimeout(() => {
        initWeightCanvas(() => {
          const fullList = getFullListForCurrentTab()
          if (fullList.length) {
            const { padLeft, padRight, spacing } = getPlotMetrics()
            drawWeightChart(fullList, spacing, padLeft, padRight, scrollX)
          }
        })
      }, 60)
    })
  } else {
    showToastTip('已折叠体重对比')
  }
}

// 获取当前 Tab 视窗展示的单元数量
const getWindowSizeForCurrentTab = () => {
  return currentZoomCount.value
}

// 当前视窗内可见数据切片 (根据连续平滑滚动 scrollX 动态映射)
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

const selectedPoint = computed(() => {
  if (isPointSelected.value) {
    return getFullListForCurrentTab()[selectedPointIndex.value]
  }
  return { date: '', dayNum: '', bg: null, wt: null, bgCount: 0, wtCount: 0, timestamp: 0 }
})

const selectedGlucoseTag = computed(() => {
  if (!isPointSelected.value) return '平均'
  const pt = selectedPoint.value
  if (currentTab.value === 'day' && pt.bgCount > 1) {
    return `${pt.date} 当日均值 (测${pt.bgCount}次)`
  }
  return `${pt.date}`
})

const selectedWeightTag = computed(() => {
  if (!isPointSelected.value) return '平均'
  return `${selectedPoint.value.date}`
})

// 血糖值展示
const hasGlucoseValue = computed(() => {
  if (isPointSelected.value) {
    return selectedPoint.value.bg !== null && typeof selectedPoint.value.bg === 'number'
  }
  return currentDisplayItems.value.some(i => i.bg !== null && typeof i.bg === 'number')
})

const currentGlucoseDisplay = computed(() => {
  if (isPointSelected.value) {
    if (selectedPoint.value.bg !== null && typeof selectedPoint.value.bg === 'number') {
      return (selectedPoint.value.bg).toFixed(1)
    }
    return '--'
  }
  const valid = currentDisplayItems.value.filter(i => i.bg !== null && typeof i.bg === 'number' && i.bg > 0)
  if (!valid.length) return '--'
  const sum = valid.reduce((a, b) => a + (b.bg as number), 0)
  return (sum / valid.length).toFixed(1)
})

// 体重值展示与有效性计算
const hasWeightValue = computed(() => {
  if (isPointSelected.value) {
    return selectedPoint.value.wt !== null && typeof selectedPoint.value.wt === 'number'
  }
  return currentDisplayItems.value.some(i => i.wt !== null && typeof i.wt === 'number')
})

const currentWeightValueDisplay = computed(() => {
  if (isPointSelected.value) {
    if (selectedPoint.value.wt !== null && typeof selectedPoint.value.wt === 'number') {
      return (selectedPoint.value.wt).toFixed(2)
    }
    return '--'
  }
  const validItems = currentDisplayItems.value.filter(i => i.wt !== null && typeof i.wt === 'number' && (i.wt as number) > 0)
  if (!validItems.length) return '--'
  const sum = validItems.reduce((a, b) => a + (b.wt as number), 0)
  return (sum / validItems.length).toFixed(2)
})

const currentGlucoseRangeText = computed(() => {
  const items = currentDisplayItems.value
  if (isPointSelected.value) {
    return selectedPoint.value.date + ' 明细'
  }
  if (!items.length) return ''
  return `${items[0].date} 至 ${items[items.length - 1].date}`
})

const currentWeightRangeText = computed(() => {
  return currentGlucoseRangeText.value
})

const getStatusMeta = (bg: number) => {
  const min = props.targetMin || 4.0
  const max = props.targetMax || 15.0
  const warningMax = max * 1.3

  if (bg <= 0) {
    return { color: '#94A3B8', text: '无数据', badgeClass: 'badge-gray' }
  } else if (bg < min) {
    return { color: '#DC2626', text: '低血糖', badgeClass: 'badge-red' }
  } else if (bg <= max) {
    return { color: '#16A34A', text: '达标', badgeClass: 'badge-green' }
  } else if (bg <= warningMax) {
    return { color: '#CA8A04', text: '偏高', badgeClass: 'badge-yellow' }
  } else {
    return { color: '#DC2626', text: '危险过高', badgeClass: 'badge-red' }
  }
}

const glucoseStatusText = computed(() => {
  const bg = isPointSelected.value ? selectedPoint.value.bg : parseFloat(currentGlucoseDisplay.value)
  if (bg === null || isNaN(bg)) return '未记录'
  return getStatusMeta(bg).text
})

const glucoseStatusClass = computed(() => {
  const bg = isPointSelected.value ? selectedPoint.value.bg : parseFloat(currentGlucoseDisplay.value)
  if (bg === null || isNaN(bg)) return 'badge-gray'
  return getStatusMeta(bg).badgeClass
})

// ========================================================
// 连续平滑像素级滚动与惯性物理引擎 (完美复刻首页 u-charts 丝滑手感)
// ========================================================
let scrollX = 0
let animTimer: any = null

const getPlotMetrics = () => {
  const padLeft = 38
  const padRight = canvasWidth - 26
  const plotWidth = padRight - padLeft
  const winSize = currentZoomCount.value
  const spacing = plotWidth / (winSize - 1 || 1)
  return { padLeft, padRight, plotWidth, winSize, spacing }
}

const getMinScrollX = () => {
  const fullList = getFullListForCurrentTab()
  const { plotWidth, winSize, spacing } = getPlotMetrics()
  if (fullList.length <= winSize) return 0
  return - (fullList.length - winSize) * spacing
}

// 根据当前连续 scrollX 动态更新可见区间索引（仅在跨越数据点时触发响应式更新，保障 60fps 零桥接负担）
const updateVisibleMetrics = () => {
  const fullList = getFullListForCurrentTab()
  if (!fullList.length) return
  const { plotWidth, spacing } = getPlotMetrics()

  const startIdx = Math.max(0, Math.min(fullList.length - 1, Math.floor((-scrollX + 6) / spacing)))
  const endIdx = Math.max(startIdx, Math.min(fullList.length - 1, Math.ceil((-scrollX + plotWidth + 2) / spacing)))

  if (visibleStartIndex.value !== startIdx || visibleEndIndex.value !== endIdx) {
    visibleStartIndex.value = startIdx
    visibleEndIndex.value = endIdx
  }
}

// 初始化图表视窗位置 (默认对齐至最新数据端，与首页 u-charts scrollAlign: 'right' 保持完全一致)
const initPositionForCurrentTab = () => {
  const fullList = getFullListForCurrentTab()
  const limits = getTabZoomLimits()
  currentZoomCount.value = limits.default
  scrollX = getMinScrollX()
  selectedPointIndex.value = -1
  if (currentTab.value === 'day' && currentZoomCount.value === 7) {
    currentQuickRange.value = '7d'
  } else {
    currentQuickRange.value = ''
  }
  updateVisibleMetrics()
  drawBothCharts()
}

// 快速血糖趋势分析快捷缩放与定位 [ 近7天 | 近14天 | 近30天 | 全部 ]
const applyQuickRange = (range: '7d' | '14d' | '30d' | 'all') => {
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }

  currentQuickRange.value = range
  selectedPointIndex.value = -1

  if (range === '7d') {
    if (currentTab.value !== 'day') currentTab.value = 'day'
    currentZoomCount.value = 7
    scrollX = getMinScrollX()
    showToastTip('已切换至近7天走势')
  } else if (range === '14d') {
    if (currentTab.value !== 'day') currentTab.value = 'day'
    currentZoomCount.value = 14
    scrollX = getMinScrollX()
    showToastTip('已切换至近14天走势')
  } else if (range === '30d') {
    if (currentTab.value !== 'day') currentTab.value = 'day'
    currentZoomCount.value = 30
    scrollX = getMinScrollX()
    showToastTip('已切换至近30天走势')
  } else if (range === 'all') {
    const fullList = getFullListForCurrentTab()
    const total = Math.max(3, fullList.length)
    currentZoomCount.value = total
    scrollX = 0
    showToastTip('已展示全部历史走势')
  }

  updateVisibleMetrics()
  drawBothCharts()
}

// 初始化血糖画布
const initGlucoseCanvas = (callback?: () => void) => {
  const query = uni.createSelectorQuery().in(instance?.proxy || instance)
  query.select('#glucoseFsCanvas').fields({ node: true, size: true, rect: true })
  query.select('.fs-canvas-box').boundingClientRect()
  query.exec((res) => {
    if (res && res[0] && res[0].node) {
      const dpr = uni.getSystemInfoSync().pixelRatio || 2

      // 血糖画布
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

// 初始化体重画布 (仅在展开且存在对应 DOM 时动态初始化并绘制)
const initWeightCanvas = (callback?: () => void) => {
  if (!isWeightExpanded.value) return
  const query = uni.createSelectorQuery().in(instance?.proxy || instance)
  query.select('#weightFsCanvas').fields({ node: true, size: true, rect: true })
  query.exec((res) => {
    if (res && res[0] && res[0].node) {
      const dpr = uni.getSystemInfoSync().pixelRatio || 2

      // 体重画布
      weightCanvasNode = res[0].node
      weightCtx = weightCanvasNode.getContext('2d')
      weightCanvasHeight = res[0].height
      weightCanvasNode.width = canvasWidth * dpr
      weightCanvasNode.height = weightCanvasHeight * dpr
      weightCtx.scale(dpr, dpr)

      if (callback) callback()
    }
  })
}

// 主初始化入口
const initCanvases = () => {
  initGlucoseCanvas(() => {
    initPositionForCurrentTab()
    if (isWeightExpanded.value) {
      initWeightCanvas(() => {
        drawBothCharts()
      })
    }
  })
}

// 同步绘制双图表 (由 Canvas 2D 毫秒级直接渲染，连续滑动 60fps 丝滑不掉帧)
const drawBothCharts = () => {
  if (!glucoseCtx) return
  const fullList = getFullListForCurrentTab()
  if (!fullList.length) return

  const { padLeft, padRight, spacing } = getPlotMetrics()

  // 1. 绘制血糖图
  drawGlucoseChart(fullList, spacing, padLeft, padRight, scrollX)

  // 2. 绘制体重图 (仅在展开状态下绘制)
  if (isWeightExpanded.value && weightCtx) {
    drawWeightChart(fullList, spacing, padLeft, padRight, scrollX)
  }
}

// 血糖图表：支持连续亚像素级平滑拖拽与边界无缝剪裁
const drawGlucoseChart = (
  items: ChartItem[], 
  spacing: number, 
  padLeft: number, 
  padRight: number, 
  curScrollX: number
) => {
  const ctx = glucoseCtx
  ctx.clearRect(0, 0, canvasWidth, glucoseCanvasHeight)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasWidth, glucoseCanvasHeight)

  const topY = 24
  const bottomY = glucoseCanvasHeight - 25

  const ceiling = currentGlucoseCeiling.value

  // 血糖动态标尺 (聚焦模式 0~20，全景模式阶梯 25/30/35)
  const getY = (bg: number) => {
    const clamped = Math.max(0, Math.min(ceiling, bg))
    return bottomY - (clamped / ceiling) * (bottomY - topY)
  }

  // 1. 绘制固定网格虚线与 Y 轴刻度 (外框与刻度绝对静止)
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = '#E2E8F0'

  let gridSteps: number[] = []
  if (ceiling === 20) {
    gridSteps = [20, 15, 10, 5]
  } else if (ceiling === 25) {
    gridSteps = [25, 20, 15, 10, 5]
  } else if (ceiling === 30) {
    gridSteps = [30, 20, 10]
  } else if (ceiling === 35) {
    gridSteps = [35, 25, 15, 5]
  } else {
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

  // 0 刻度实线
  ctx.setLineDash([])
  ctx.strokeStyle = '#CBD5E1'
  ctx.beginPath()
  ctx.moveTo(padLeft, bottomY)
  ctx.lineTo(padRight, bottomY)
  ctx.stroke()
  ctx.fillText('0', padLeft - 6, bottomY + 3)

  // 参考线 15.0 与 4.0
  const y15 = getY(props.targetMax || 15.0)
  ctx.setLineDash([4, 2])
  ctx.strokeStyle = '#FCA5A5'
  ctx.beginPath()
  ctx.moveTo(padLeft, y15)
  ctx.lineTo(padRight, y15)
  ctx.stroke()

  const y4 = getY(props.targetMin || 4.0)
  ctx.strokeStyle = '#86EFAC'
  ctx.beginPath()
  ctx.moveTo(padLeft, y4)
  ctx.lineTo(padRight, y4)
  ctx.stroke()
  ctx.setLineDash([])

  // 2. 剪裁区域内连续平滑绘制折线、数据点与高亮柱 (左侧严格保护Y轴刻度，右侧充足留白至画布边缘彻底杜绝最新数据点与数值被截断)
  ctx.save()
  ctx.beginPath()
  ctx.rect(padLeft - 4, 2, canvasWidth - (padLeft - 4) - 2, bottomY - 2 + 6)
  ctx.clip()

  // 竖向选中高亮柱 (跟随数据点连续物理位置实时对齐)
  if (selectedPointIndex.value !== -1 && selectedPointIndex.value < items.length) {
    const selX = padLeft + selectedPointIndex.value * spacing + curScrollX
    const beamW = currentZoomCount.value <= 4 ? 42 : (currentZoomCount.value <= 8 ? 28 : 16)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)'
    ctx.fillRect(selX - beamW / 2, topY - 5, beamW, bottomY - topY + 10)

    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
    ctx.beginPath()
    ctx.moveTo(selX, topY - 5)
    ctx.lineTo(selX, bottomY)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // 绘制血糖连续平滑折线 (由 clip 裁切，天然无缝穿过视窗两端)
  const validPoints: { x: number, y: number }[] = []
  items.forEach((item, i) => {
    if (item.bg !== null && typeof item.bg === 'number' && item.bg > 0) {
      const x = padLeft + i * spacing + curScrollX
      validPoints.push({ x, y: getY(item.bg) })
    }
  })

  if (validPoints.length > 0) {
    ctx.beginPath()
    ctx.strokeStyle = '#64748B'
    ctx.lineWidth = currentZoomCount.value <= 4 ? 2.8 : 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    ctx.moveTo(validPoints[0].x, validPoints[0].y)
    for (let j = 1; j < validPoints.length; j++) {
      ctx.lineTo(validPoints[j].x, validPoints[j].y)
    }
    ctx.stroke()
  }

  // 绘制数据点与数字（放大到3-4份时采用更醒目的尺寸与字号）
  const showNumbers = currentZoomCount.value <= 8
  const dotR = currentZoomCount.value <= 4 ? 5.5 : (currentZoomCount.value <= 8 ? 4 : 2.8)
  const fontStyle = currentZoomCount.value <= 4 ? 'bold 12.5px sans-serif' : 'bold 10.5px sans-serif'

  items.forEach((item, i) => {
    const x = padLeft + i * spacing + curScrollX
    // 仅绘制视窗附近的可见点，大幅优化绘制效率
    if (x < padLeft - 30 || x > padRight + 30) return

    if (item.bg !== null && typeof item.bg === 'number' && item.bg > 0) {
      const isOutlier = yAxisMode.value === 'focus' && item.bg > ceiling
      const y = getY(item.bg)
      const meta = getStatusMeta(item.bg)

      // 圆点 (离群点醒目红标打顶)
      ctx.beginPath()
      ctx.arc(x, y, dotR, 0, Math.PI * 2)
      ctx.fillStyle = isOutlier ? '#DC2626' : meta.color
      ctx.fill()
      ctx.lineWidth = currentZoomCount.value <= 4 ? 2 : 1.5
      ctx.strokeStyle = '#FFFFFF'
      ctx.stroke()

      // 空间足够时展示数值数字 (智能边界防截断保护)
      if (showNumbers) {
        ctx.fillStyle = isOutlier ? '#DC2626' : meta.color
        ctx.font = fontStyle
        const textStr = isOutlier ? `▲${item.bg}` : `${item.bg}`
        const numW = (ctx.measureText ? ctx.measureText(textStr).width : 0) || 24
        const halfNumW = numW / 2

        let drawNumX = x
        const safeTextLeft = padLeft - 2 + halfNumW
        const safeTextRight = canvasWidth - 4 - halfNumW
        if (drawNumX < safeTextLeft && x >= padLeft - 6) {
          drawNumX = safeTextLeft
        } else if (drawNumX > safeTextRight && x <= padRight + 10) {
          drawNumX = safeTextRight
        }

        const textY = isOutlier ? (y + dotR + 10) : (y - (currentZoomCount.value <= 4 ? 9 : 7))
        ctx.textAlign = 'center'
        ctx.fillText(textStr, drawNumX, textY)
      }
    }
  })

  ctx.restore()

  // 3. 独立绘制 X 轴日期刻度 (智能防截断坐标定位：首尾两端日期刻度自动平移贴合安全可视区，永不溢出裁切)
  items.forEach((item, i) => {
    const x = padLeft + i * spacing + curScrollX
    if (x < padLeft - 35 || x > padRight + 35) return

    let showX = true
    const isMonthBoundary = item.dayNum.includes('/')
    if (currentZoomCount.value > 20) {
      showX = (i === 0 || (i + 1) % 5 === 1 || i === items.length - 1 || isMonthBoundary)
    } else if (currentZoomCount.value > 12) {
      showX = (i === 0 || i % 2 === 0 || i === items.length - 1 || isMonthBoundary)
    } else {
      showX = true
    }

    if (showX) {
      const isCur = selectedPointIndex.value === i
      ctx.fillStyle = isCur ? '#0F172A' : (currentZoomCount.value <= 4 ? '#475569' : '#64748B')
      ctx.font = isCur ? 'bold 11px sans-serif' : (currentZoomCount.value <= 4 ? '11px sans-serif' : '10px sans-serif')

      const textW = (ctx.measureText ? ctx.measureText(item.dayNum).width : 0) || 28
      const halfW = textW / 2
      let drawX = x
      const safeLeft = padLeft - 2
      const safeRight = canvasWidth - 6
      if (drawX - halfW < safeLeft) {
        drawX = safeLeft + halfW
      } else if (drawX + halfW > safeRight) {
        drawX = safeRight - halfW
      }

      ctx.textAlign = 'center'
      ctx.fillText(item.dayNum, drawX, bottomY + 16)
    }
  })
}

// 体重图表：同比例尺连续滑动渲染
const drawWeightChart = (
  items: ChartItem[], 
  spacing: number, 
  padLeft: number, 
  padRight: number, 
  curScrollX: number
) => {
  const ctx = weightCtx
  ctx.clearRect(0, 0, canvasWidth, weightCanvasHeight)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, canvasWidth, weightCanvasHeight)

  const topY = 24
  const bottomY = weightCanvasHeight - 22

  // 收集当前系列所有有效体重数据
  const validWts = items
    .filter(i => typeof i.wt === 'number' && (i.wt as number) > 0)
    .map(i => i.wt as number)

  // 智能计算自适应体重标尺 (默认生理黄金区间 3.0 ~ 6.0 kg，超限自动弹性拓展)
  let minWeight = 3.0
  let maxWeight = 6.0

  if (validWts.length > 0) {
    const dataMin = Math.min(...validWts)
    const dataMax = Math.max(...validWts)

    // 保证高于最大数据点至少 0.8~1.0kg 空间，彻底杜绝压顶现象
    if (dataMax > 5.2) {
      maxWeight = Math.ceil((dataMax + 0.8) * 2) / 2
    } else {
      maxWeight = 6.0
    }

    if (dataMin < 3.0) {
      minWeight = Math.max(0, Math.floor((dataMin - 0.8) * 2) / 2)
    } else if (dataMin >= 5.0 && minWeight === 3.0) {
      minWeight = Math.floor((dataMin - 0.8) * 2) / 2
    }
  }

  // 保证至少有 2.0kg 纵向视窗跨度，防止 50g 正常微小波动呈现“过山车”视觉畸变
  if (maxWeight - minWeight < 2.0) {
    const mid = (maxWeight + minWeight) / 2
    minWeight = Math.max(0, Math.floor((mid - 1.0) * 2) / 2)
    maxWeight = minWeight + 2.0
  }

  const weightSpan = maxWeight - minWeight

  const getY = (wt: number) => {
    const clamped = Math.max(minWeight, Math.min(maxWeight, wt))
    return bottomY - ((clamped - minWeight) / weightSpan) * (bottomY - topY)
  }

  // 1. 固定网格线与 Y 轴刻度
  ctx.lineWidth = 1
  ctx.setLineDash([3, 3])
  ctx.strokeStyle = '#E2E8F0'

  // 动态生成中间参考刻度线
  const midWeight = Number(((minWeight + maxWeight) / 2).toFixed(1))
  const gridSteps = [maxWeight, midWeight]

  gridSteps.forEach(v => {
    const y = getY(v)
    ctx.beginPath()
    ctx.moveTo(padLeft, y)
    ctx.lineTo(padRight, y)
    ctx.stroke()

    ctx.fillStyle = '#94A3B8'
    ctx.font = '9px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(v.toFixed(1), padLeft - 6, y + 3)
  })

  // 3.0 基线
  ctx.setLineDash([])
  ctx.strokeStyle = '#CBD5E1'
  ctx.beginPath()
  ctx.moveTo(padLeft, bottomY)
  ctx.lineTo(padRight, bottomY)
  ctx.stroke()
  ctx.fillText(minWeight.toFixed(1), padLeft - 6, bottomY + 3)

  // 2. 剪裁区域内连续滑动绘制 (左侧严格保护Y轴刻度，右侧充足留白至画布边缘彻底杜绝最新数据点与数值被截断)
  ctx.save()
  ctx.beginPath()
  ctx.rect(padLeft - 4, 2, canvasWidth - (padLeft - 4) - 2, bottomY - 2 + 6)
  ctx.clip()

  // 竖向选中高亮柱 (体重联动)
  if (selectedPointIndex.value !== -1 && selectedPointIndex.value < items.length) {
    const selX = padLeft + selectedPointIndex.value * spacing + curScrollX
    const beamW = currentZoomCount.value <= 4 ? 42 : (currentZoomCount.value <= 8 ? 28 : 16)
    ctx.fillStyle = 'rgba(59, 130, 246, 0.08)'
    ctx.fillRect(selX - beamW / 2, topY - 5, beamW, bottomY - topY + 10)

    ctx.setLineDash([3, 3])
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
    ctx.beginPath()
    ctx.moveTo(selX, topY - 5)
    ctx.lineTo(selX, bottomY)
    ctx.stroke()
    ctx.setLineDash([])
  }

  const hasAnyWeight = items.some(i => i.wt !== null && typeof i.wt === 'number' && i.wt > 0)

  if (!hasAnyWeight) {
    ctx.fillStyle = '#94A3B8'
    ctx.font = '12px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('暂无体重记录', (padLeft + padRight) / 2, (topY + bottomY) / 2 + 4)
  } else {
    // 绘制与体重点 100% 紧密相连的蓝色折线
    const validPoints: { x: number, y: number }[] = []
    items.forEach((item, i) => {
      if (item.wt !== null && typeof item.wt === 'number' && item.wt > 0) {
        const x = padLeft + i * spacing + curScrollX
        validPoints.push({ x, y: getY(item.wt) })
      }
    })

    if (validPoints.length > 0) {
      ctx.beginPath()
      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = currentZoomCount.value <= 4 ? 2.8 : 2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.moveTo(validPoints[0].x, validPoints[0].y)
      for (let j = 1; j < validPoints.length; j++) {
        ctx.lineTo(validPoints[j].x, validPoints[j].y)
      }
      ctx.stroke()
    }

    // 绘制真实体重点与数值
    const showNumbers = currentZoomCount.value <= 8
    const dotR = currentZoomCount.value <= 4 ? 4.8 : (currentZoomCount.value <= 8 ? 3.5 : 2.2)
    const fontStyle = currentZoomCount.value <= 4 ? 'bold 11.5px sans-serif' : 'bold 9.5px sans-serif'

    items.forEach((item, i) => {
      const x = padLeft + i * spacing + curScrollX
      if (x < padLeft - 30 || x > padRight + 30) return

      if (item.wt !== null && typeof item.wt === 'number' && item.wt > 0) {
        const y = getY(item.wt)

        ctx.beginPath()
        ctx.arc(x, y, dotR, 0, Math.PI * 2)
        ctx.fillStyle = '#3B82F6'
        ctx.fill()
        ctx.lineWidth = currentZoomCount.value <= 4 ? 1.8 : 1.2
        ctx.strokeStyle = '#FFFFFF'
        ctx.stroke()

        if (showNumbers) {
          ctx.fillStyle = '#2563EB'
          ctx.font = fontStyle
          const textStr = item.wt.toFixed(2)
          const numW = (ctx.measureText ? ctx.measureText(textStr).width : 0) || 24
          const halfNumW = numW / 2

          let drawNumX = x
          const safeTextLeft = padLeft - 2 + halfNumW
          const safeTextRight = canvasWidth - 4 - halfNumW
          if (drawNumX < safeTextLeft && x >= padLeft - 6) {
            drawNumX = safeTextLeft
          } else if (drawNumX > safeTextRight && x <= padRight + 10) {
            drawNumX = safeTextRight
          }

          ctx.textAlign = 'center'
          ctx.fillText(textStr, drawNumX, Math.max(14, y - (currentZoomCount.value <= 4 ? 8 : 6)))
        }
      }
    })
  }

  ctx.restore()

  // 3. 独立绘制 X 轴日期刻度
  items.forEach((item, i) => {
    const x = padLeft + i * spacing + curScrollX
    if (x < padLeft - 35 || x > padRight + 35) return

    let showX = true
    const isMonthBoundary = item.dayNum.includes('/')
    if (currentZoomCount.value > 20) {
      showX = (i === 0 || (i + 1) % 5 === 1 || i === items.length - 1 || isMonthBoundary)
    } else if (currentZoomCount.value > 12) {
      showX = (i === 0 || i % 2 === 0 || i === items.length - 1 || isMonthBoundary)
    } else {
      showX = true
    }

    if (showX) {
      ctx.fillStyle = currentZoomCount.value <= 4 ? '#64748B' : '#94A3B8'
      ctx.font = currentZoomCount.value <= 4 ? '10px sans-serif' : '9px sans-serif'

      const textW = (ctx.measureText ? ctx.measureText(item.dayNum).width : 0) || 28
      const halfW = textW / 2
      let drawX = x
      const safeLeft = padLeft - 2
      const safeRight = canvasWidth - 6
      if (drawX - halfW < safeLeft) {
        drawX = safeLeft + halfW
      } else if (drawX + halfW > safeRight) {
        drawX = safeRight - halfW
      }

      ctx.textAlign = 'center'
      ctx.fillText(item.dayNum, drawX, bottomY + 14)
    }
  })
}

// 手势交互处理状态机 (连续像素级跟手 + 惯性滑行 + 边界弹性回弹，完全移除震动调用)
let touchStartX = 0
let touchStartY = 0
let touchStartScrollX = 0
let lastTouchX = 0
let lastTouchTime = 0
let lastChartTouchEndTime = 0
let velocity = 0
let isDragging = false
let isScrubbing = false
let isPinching = false
let wasPinching = false
let startPinchDist = 0
let startZoomCount = 7
let startPinchCenterPlotX = 0
let startPinchItemIdx = 0
let longPressTimer: any = null
let edgeTriggered = false

const getBoxLeft = () => {
  if (canvasBoxLeft > 0) return canvasBoxLeft
  try {
    const sys = uni.getSystemInfoSync()
    return (sys.windowWidth * 36) / 750
  } catch (e) {
    return 18
  }
}

// 单点触碰选择
const handleTapSelect = (clientX: number) => {
  const fullList = getFullListForCurrentTab()
  if (!fullList.length) return
  const boxLeft = getBoxLeft()
  const { padLeft, padRight, spacing } = getPlotMetrics()
  const clickX = clientX - boxLeft

  let closestIdx = -1
  let minDiff = 99999
  fullList.forEach((_, i) => {
    const x = padLeft + i * spacing + scrollX
    const diff = Math.abs(x - clickX)
    if (diff < minDiff) {
      minDiff = diff
      closestIdx = i
    }
  })

  const hitRadius = Math.max(22, spacing / 2)
  if (closestIdx !== -1 && minDiff <= hitRadius) {
    selectedPointIndex.value = closestIdx
    drawBothCharts()
  } else {
    if (selectedPointIndex.value !== -1) {
      selectedPointIndex.value = -1
      drawBothCharts()
    }
  }
}

// 边界弹性回弹动画 (ease-out cubic 优雅收敛)
const reboundToBoundary = () => {
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }
  const minScrollX = getMinScrollX()
  const target = scrollX > 0 ? 0 : minScrollX
  const start = scrollX
  const startTime = Date.now()
  const duration = 240

  const stepAnim = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(1, elapsed / duration)
    const ease = 1 - Math.pow(1 - progress, 3)
    scrollX = start + (target - start) * ease
    drawBothCharts()
    updateVisibleMetrics()

    if (progress < 1) {
      animTimer = setTimeout(stepAnim, 16)
    } else {
      scrollX = target
      drawBothCharts()
      updateVisibleMetrics()
      animTimer = null
    }
  }
  stepAnim()
}

// 惯性滑行减速物理动画
const startInertia = (initVelocity: number) => {
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }
  let v = initVelocity * 14
  if (v > 25) v = 25
  if (v < -25) v = -25

  const friction = 0.92

  const stepFlick = () => {
    if (Math.abs(v) < 0.4) {
      animTimer = null
      const minScrollX = getMinScrollX()
      if (scrollX > 0 || scrollX < minScrollX) {
        reboundToBoundary()
      }
      return
    }

    v *= friction
    scrollX += v
    const minScrollX = getMinScrollX()

    if (scrollX > 0) {
      scrollX *= 0.6
      v *= 0.5
    } else if (scrollX < minScrollX) {
      const over = scrollX - minScrollX
      scrollX = minScrollX + over * 0.6
      v *= 0.5
    }

    drawBothCharts()
    updateVisibleMetrics()

    if (scrollX > 20 || scrollX < minScrollX - 20) {
      animTimer = null
      reboundToBoundary()
      return
    }

    animTimer = setTimeout(stepFlick, 16)
  }
  stepFlick()
}

// 触发缩放极值回弹动画
const triggerZoomLimitAnimation = (type: 'in' | 'out', tipText?: string) => {
  zoomLimitClass.value = type === 'in' ? 'fs-zoom-limit-in' : 'fs-zoom-limit-out'
  const defaultText = type === 'in' ? '已放大至最大视图 (3项)' : '已缩小至全景视图'
  showToastTip(tipText || defaultText)
  setTimeout(() => {
    zoomLimitClass.value = ''
  }, 240)
}

const handleTouchStart = (e: any) => {
  if (!e.touches) return
  edgeTriggered = false
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }

  // 1. 双指按下 -> 准备双指平滑缩放
  if (e.touches.length === 2) {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
    isScrubbing = false
    isDragging = false
    isPinching = true
    wasPinching = true
    const p1 = e.touches[0]
    const p2 = e.touches[1]
    startPinchDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
    startZoomCount = currentZoomCount.value

    const boxLeft = getBoxLeft()
    const { padLeft, plotWidth, spacing } = getPlotMetrics()
    const pinchScreenX = (p1.clientX + p2.clientX) / 2
    startPinchCenterPlotX = Math.max(0, Math.min(plotWidth, pinchScreenX - boxLeft - padLeft))
    startPinchItemIdx = (-scrollX + startPinchCenterPlotX) / (spacing || 1)
    edgeTriggered = false
    return
  }

  // 2. 单指按下
  if (e.touches.length === 1) {
    // 若当前手势包含缩放，在所有手指彻底离开前，绝对不初始化单指参数
    if (isPinching || wasPinching) {
      return
    }
    touchStartX = e.touches[0].clientX
    touchStartY = e.touches[0].clientY
    touchStartScrollX = scrollX
    lastTouchX = touchStartX
    lastTouchTime = Date.now()
    velocity = 0
    isDragging = false
    isScrubbing = false
    isPinching = false
    wasPinching = false

    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }

    // 启动长按识别定时器 (按住 220ms 触发进入滑动选点模式)
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      isScrubbing = true
      handleTapSelect(touchStartX)
    }, 220)
  }
}

const handleTouchMove = (e: any) => {
  if (!e.touches) return

  // 1. 双指手势缩放 (以双指中心点为几何锚点，保持当前缩放数据点位置不动)
  if (e.touches.length === 2 && isPinching) {
    const p1 = e.touches[0]
    const p2 = e.touches[1]
    const curDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
    const diff = curDist - startPinchDist
    const limits = getTabZoomLimits()

    const deltaUnits = Math.round(-diff / 22)
    let targetCount = startZoomCount + deltaUnits
    targetCount = Math.max(limits.min, Math.min(limits.max, targetCount))

    if (curDist - startPinchDist > 35 && currentZoomCount.value === limits.min && !edgeTriggered) {
      edgeTriggered = true
      triggerZoomLimitAnimation('in', `已放大至最大视图 (${limits.min}项)`)
    } else if (curDist - startPinchDist < -35 && currentZoomCount.value === limits.max && !edgeTriggered) {
      edgeTriggered = true
      triggerZoomLimitAnimation('out', `已缩小至全景视图 (${limits.max}项)`)
    } else if (targetCount > limits.min && targetCount < limits.max) {
      edgeTriggered = false
    }

    const boxLeft = getBoxLeft()
    const { padLeft, plotWidth } = getPlotMetrics()
    const pinchScreenX = (p1.clientX + p2.clientX) / 2
    const curPinchCenterPlotX = Math.max(0, Math.min(plotWidth, pinchScreenX - boxLeft - padLeft))

    currentZoomCount.value = targetCount
    const newSpacing = plotWidth / (targetCount - 1 || 1)
    let newScrollX = curPinchCenterPlotX - startPinchItemIdx * newSpacing

    const minScrollX = getMinScrollX()
    scrollX = Math.max(minScrollX, Math.min(0, newScrollX))

    if (currentTab.value === 'day') {
      if (targetCount === 7) currentQuickRange.value = '7d'
      else if (targetCount === 14) currentQuickRange.value = '14d'
      else if (targetCount === 30) currentQuickRange.value = '30d'
      else if (targetCount === processedDayItems.value.length) currentQuickRange.value = 'all'
      else currentQuickRange.value = ''
    }

    drawBothCharts()
    updateVisibleMetrics()
    return
  }

  // 严格防护：若当前手势包含双指缩放，在所有手指完全离开屏幕前，绝对禁止退化为单指拖拽或平移
  if (isPinching || wasPinching) {
    return
  }

  // 2. 单指移动 (1:1绝对物理平滑滚动，毫秒级即时响应，与首页完全一致)
  if (e.touches.length === 1) {
    const curX = e.touches[0].clientX
    const curY = e.touches[0].clientY
    const deltaX = curX - touchStartX
    const deltaY = curY - touchStartY

    const now = Date.now()
    const dt = now - lastTouchTime
    if (dt > 8) {
      velocity = (curX - lastTouchX) / dt
      lastTouchX = curX
      lastTouchTime = now
    }

    if (isScrubbing) {
      handleTapSelect(curX)
      return
    }

    // 若位移超过 6px，取消长按选点计时
    if (Math.hypot(deltaX, deltaY) > 6) {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }

      // 只要横向位移大于纵向位移，进入连续像素级拖拽
      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 6) {
        isDragging = true

        const minScrollX = getMinScrollX()
        let targetScroll = touchStartScrollX + deltaX

        if (targetScroll > 0) {
          // 向右拉已超过最早记录：弹性阻尼
          targetScroll = targetScroll * 0.28
          if (deltaX > 25 && !edgeTriggered) {
            edgeTriggered = true
            triggerEdgeLimitAnimation('left', '已至最早记录')
          }
        } else if (targetScroll < minScrollX) {
          // 向左拉已超过最新记录：弹性阻尼
          const over = targetScroll - minScrollX
          targetScroll = minScrollX + over * 0.28
          if (deltaX < -25 && !edgeTriggered) {
            edgeTriggered = true
            triggerEdgeLimitAnimation('right', '已至最新记录')
          }
        } else {
          edgeTriggered = false
        }

        scrollX = targetScroll
        drawBothCharts()
        updateVisibleMetrics()
      }
    }
  }
}

const handleTouchEnd = (e: any) => {
  lastChartTouchEndTime = Date.now()
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  edgeTriggered = false

  // 处理双指缩放释放流程 (单指抬起阶段与全部离开阶段)
  if (isPinching || wasPinching) {
    if (!e.touches || e.touches.length === 0) {
      // 最后一根手指完全抬起，安全结束缩放会话，保持当前精确定位
      isPinching = false
      wasPinching = false
      const minScrollX = getMinScrollX()
      if (scrollX > 0 || scrollX < minScrollX) {
        reboundToBoundary()
      }
    } else {
      // 第一根手指先抬起，保持 wasPinching 锁定状态，等待最后一根手指离开，彻底杜绝单指滑动跳变
      isPinching = false
    }
    return
  }

  if (isScrubbing) {
    isScrubbing = false
    return
  }

  if (isDragging) {
    isDragging = false
    const minScrollX = getMinScrollX()

    // 1. 若超界，执行弹性回弹
    if (scrollX > 0 || scrollX < minScrollX) {
      reboundToBoundary()
      return
    }

    // 2. 若存在滑动手速，触发惯性滑动
    if (Math.abs(velocity) > 0.22) {
      startInertia(velocity)
    }
    return
  }

  // 单次轻点直接选中数据点
  handleTapSelect(touchStartX)
}

const handleTouchCancel = () => {
  lastChartTouchEndTime = Date.now()
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }
  edgeTriggered = false
  isDragging = false
  isScrubbing = false
  isPinching = false
  wasPinching = false
  const minScrollX = getMinScrollX()
  if (scrollX > 0 || scrollX < minScrollX) {
    reboundToBoundary()
  }
}

// 点击图表外空白处 -> 取消选中
const handleBackgroundTap = () => {
  // 若刚在图表上有触控操作（400ms 保护期），阻断合成 tap 事件误关选中
  if (Date.now() - lastChartTouchEndTime < 400) {
    return
  }
  if (selectedPointIndex.value !== -1) {
    selectedPointIndex.value = -1
    drawBothCharts()
  }
}

// 切换天/周/月 Tab (保持各自默认展示数量：天7，周7，月6)
const switchTab = (tab: 'day' | 'week' | 'month') => {
  currentTab.value = tab
  if (tab === 'day') {
    currentQuickRange.value = '7d'
  } else {
    currentQuickRange.value = ''
  }
  initPositionForCurrentTab()
}

const handleClose = () => {
  emit('close')
  emit('update:visible', false)
}

watch(() => props.visible, (val) => {
  if (val) {
    prepareData()
    // 平常默认折叠显示体重走势 (用户需点击展开才显示)
    isWeightExpanded.value = false
    setTimeout(() => {
      isAnimShow.value = true
    }, 20)
    nextTick(() => {
      setTimeout(() => {
        initCanvases()
      }, 80)
    })
  } else {
    isAnimShow.value = false
    selectedPointIndex.value = -1
    isWeightExpanded.value = false
    if (animTimer) {
      clearTimeout(animTimer)
      animTimer = null
    }
  }
})

watch([() => props.glucoseRecords, () => props.weightRecords], () => {
  if (props.visible) {
    prepareData()
    drawBothCharts()
  }
}, { deep: true })
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
  padding: 32rpx 40rpx 20rpx;
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

/* 胶囊 Tab [ 天 | 周 | 月 ] */
.fs-tab-wrapper {
  display: flex;
  justify-content: center;
  padding: 20rpx 0 16rpx;
}
.fs-tab-bar {
  display: inline-flex;
  padding: 6rpx;
  background-color: #F1F5F9;
  border-radius: 100rpx;
  border: 2rpx solid #E2E8F0;
}
.fs-tab-item {
  padding: 10rpx 44rpx;
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

/* 趋势分析快捷栏 [ 近7天 | 近14天 | 近30天 | 全部 ] (居左对齐，无文字前缀，无emoji) */
.fs-quick-bar {
  padding: 4rpx 36rpx 14rpx;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  box-sizing: border-box;
}
.fs-quick-pills {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.fs-quick-pill {
  padding: 8rpx 22rpx;
  font-size: 22rpx;
  color: #64748B;
  background-color: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 100rpx;
  font-weight: 500;
  transition: all 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
  text-align: center;
  box-sizing: border-box;
  line-height: 1.2;
}
.fs-quick-pill:active {
  transform: scale(0.94);
}
.fs-quick-pill.active {
  background-color: #EFF6FF;
  color: #2563EB;
  border-color: #3B82F6;
  font-weight: 700;
  box-shadow: 0 2rpx 8rpx rgba(59, 130, 246, 0.16);
}

/* 选项 A：Y 轴模式切换微型芯片 (聚焦 20 / 全景 35)，无 emoji */
.fs-metric-top-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8rpx;
  min-height: 42rpx;
}
.fs-y-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 4rpx 18rpx;
  background-color: #F8FAFC;
  border: 1.5rpx solid #CBD5E1;
  border-radius: 100rpx;
  transition: all 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
  box-shadow: 0 1rpx 4rpx rgba(0, 0, 0, 0.04);
}
.fs-y-toggle:active {
  transform: scale(0.94);
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

/* 主展示容器（自适应全屏，禁用原生垂直滚动防canvas脱落） */
.fs-main-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  padding: 8rpx 36rpx 36rpx;
  box-sizing: border-box;
  overflow: hidden;
}

.fs-section {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  margin-bottom: 0;
}
.fs-section-border {
  padding-top: 16rpx;
  border-top: 2rpx solid #F1F5F9;
  margin-top: 16rpx;
  margin-bottom: 0;
}

/* 左侧大数字指标展示 */
.fs-metric-header {
  margin-bottom: 16rpx;
}
.fs-range-text {
  font-size: 24rpx;
  color: #94A3B8;
  font-weight: 500;
  display: block;
}
.fs-tag-row {
  display: flex;
  align-items: center;
  gap: 12rpx;
  margin-bottom: 6rpx;
}
.fs-mode-tag {
  font-size: 20rpx;
  color: #64748B;
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

.fs-value-row {
  display: flex;
  align-items: baseline;
  gap: 12rpx;
}
.fs-big-number {
  font-size: 64rpx;
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
.badge-blue {
  background-color: #EFF6FF;
  color: #2563EB;
  border: 2rpx solid #DBEAFE;
}
.badge-gray {
  background-color: #F1F5F9;
  color: #94A3B8;
  border: 2rpx solid #E2E8F0;
}

/* 图表容器：常规滑动时外框绝对保持静止，不产生任何晃动 */
.fs-canvas-box {
  width: 100%;
  height: 330rpx;
  background-color: #FFFFFF;
  border-radius: 24rpx;
  border: 2rpx solid #E2E8F0;
  position: relative;
  box-sizing: border-box;
  overflow: hidden;
}
.fs-canvas-box-sm {
  height: 220rpx;
}
.fs-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* 边缘触底微弹性轻晃反馈 (仅到达最早/最新数据极值时触发，正常滑动绝对静止) */
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

/* 缩放极限弹性震荡动画 */
.fs-zoom-limit-in {
  transform: scale(1.036) !important;
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25) !important;
}
.fs-zoom-limit-out {
  transform: scale(0.964) !important;
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25) !important;
}

/* 体重折叠收起条 (平常默认展示形态) */
.fs-weight-collapsed-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 20rpx;
  padding: 16rpx 24rpx;
  margin-top: 14rpx;
  transition: all 0.2s cubic-bezier(0.2, 0.9, 0.3, 1);
  box-sizing: border-box;
}
.fs-weight-collapsed-bar:active {
  background-color: #F1F5F9;
  transform: scale(0.99);
}
.fs-wbar-left {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.fs-wbar-badge-icon {
  width: 52rpx;
  height: 52rpx;
  border-radius: 14rpx;
  background-color: #EFF6FF;
  border: 2rpx solid #DBEAFE;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fs-wbar-icon-text {
  font-size: 22rpx;
  font-weight: 800;
  color: #2563EB;
}
.fs-wbar-info {
  display: flex;
  flex-direction: column;
  gap: 4rpx;
}
.fs-wbar-title-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
}
.fs-wbar-title {
  font-size: 26rpx;
  font-weight: 700;
  color: #1E293B;
}
.fs-wbar-badge {
  margin-left: 0;
  font-size: 19rpx;
  padding: 2rpx 10rpx;
}
.fs-wbar-sub {
  font-size: 20rpx;
  color: #94A3B8;
  font-weight: 500;
}
.fs-wbar-right {
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.fs-wbar-val-block {
  display: flex;
  align-items: baseline;
  gap: 4rpx;
}
.fs-wbar-val {
  font-size: 38rpx;
  font-weight: 800;
  color: #0F172A;
  line-height: 1;
}
.fs-wbar-unit {
  font-size: 22rpx;
  color: #64748B;
  font-weight: 600;
}
.fs-wbar-empty {
  font-size: 24rpx;
  color: #94A3B8;
  font-weight: 500;
}
.fs-wbar-btn {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 8rpx 18rpx;
  background-color: #EFF6FF;
  border: 1.5rpx solid #BFDBFE;
  border-radius: 100rpx;
  transition: all 0.2s ease;
}
.fs-wbar-btn:active {
  background-color: #DBEAFE;
}
.fs-wbar-btn-text {
  font-size: 22rpx;
  font-weight: 700;
  color: #2563EB;
  line-height: 1;
}
.fs-wbar-arrow {
  font-size: 16rpx;
  color: #2563EB;
  line-height: 1;
  transform: translateY(1rpx);
  transition: transform 0.2s ease;
}

/* 展开状态下的收起胶囊按钮 */
.fs-weight-collapse-btn {
  display: inline-flex;
  align-items: center;
  gap: 6rpx;
  padding: 4rpx 16rpx;
  background-color: #F8FAFC;
  border: 1.5rpx solid #CBD5E1;
  border-radius: 100rpx;
  transition: all 0.2s ease;
}
.fs-weight-collapse-btn:active {
  transform: scale(0.94);
  background-color: #F1F5F9;
}
.fs-weight-collapse-btn-text {
  font-size: 20rpx;
  font-weight: 700;
  color: #64748B;
  line-height: 1.2;
}
.fs-wbar-arrow.up {
  font-size: 16rpx;
  color: #64748B;
  transform: translateY(-1rpx);
}
</style>
