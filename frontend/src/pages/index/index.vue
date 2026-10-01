<template>
  <view class="container" @tap="handleBackgroundTap">
    <!-- 头部：猫咪档案概览 -->
    <view class="header">
      <view class="avatar-wrap">
        <image class="avatar" :src="catInfo.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=FFDAB9'" mode="aspectFill"></image>
      </view>
      <view class="info">
        <text class="greeting">{{ greetingText }}</text>
        <view class="name-row" @click="handleSwitchCat">
          <text class="name">{{ catInfo.name || '未命名' }}</text>
          <view class="icon-svg icon-switch"></view>
          <text class="tag" v-if="catInfo.age !== null">{{ catInfo.age }}岁</text>
        </view>
        <text class="desc">确诊 {{ catInfo.daysSinceDiagnosis }} 天 · 目标范围 {{ catInfo.targetMin }}~{{ catInfo.targetMax }}</text>
      </view>
    </view>

    <!-- 快捷记录卡片 (5大黄金功能网格) -->
    <view class="action-card card">
      <view class="card-title">今日操作</view>
      <view class="action-grid">
        <view class="action-btn-item btn-glucose full-width" @click="handleLogGlucose">
          <view class="action-icon icon-blood-lg"></view>
          <view class="action-info">
            <text class="action-main-text">记血糖</text>
            <text class="action-sub-text">测耳血数值 · 每日核心控糖指标</text>
          </view>
        </view>
        <view class="action-btn-item btn-insulin" @click="handleLogInsulin">
          <view class="action-icon icon-syringe-lg"></view>
          <view class="action-info">
            <text class="action-main-text">记打针</text>
            <text class="action-sub-text">早晚胰岛素</text>
          </view>
        </view>
        <view class="action-btn-item btn-meal" @click="handleLogMeal">
          <view class="action-icon icon-meal-lg"></view>
          <view class="action-info">
            <text class="action-main-text">记饮食</text>
            <text class="action-sub-text">罐头/主食/加餐</text>
          </view>
        </view>
        <view class="action-btn-item btn-excretion" @click="handleLogExcretion">
          <view class="action-icon icon-excretion-lg"></view>
          <view class="action-info">
            <text class="action-main-text">记排泄</text>
            <text class="action-sub-text">尿量/便便健康</text>
          </view>
        </view>
        <view class="action-btn-item btn-weight" @click="handleLogWeight">
          <view class="action-icon icon-weight-lg"></view>
          <view class="action-info">
            <text class="action-main-text">记体重</text>
            <text class="action-sub-text">定期称重监测</text>
          </view>
        </view>
      </view>
    </view>

    <!-- 图表展示 -->
    <view class="chart-card card">
      <view class="card-header">
        <view class="tabs">
          <text class="tab-item" :class="{ active: currentChartTab === 'glucose' }" @click="switchTab('glucose')">近期血糖</text>
          <text class="tab-item" :class="{ active: currentChartTab === 'weight' }" @click="switchTab('weight')">近期体重</text>
        </view>
        <view class="chart-fullscreen-btn" @click="openFullscreen" title="全屏图表">
          <view class="icon-svg icon-chart-bars"></view>
        </view>
      </view>

      <!-- 选中数据点详细浮层 (长按或单点选中后展示，点击可直接关闭) -->
      <view class="selected-point-badge" v-if="selectedPointInfo" @tap.stop="closeBadge">
        <text class="spb-date">{{ selectedPointInfo.time }}</text>
        <view class="spb-right">
          <text class="spb-val" :style="{ color: selectedPointInfo.color }">
            {{ selectedPointInfo.label }}: {{ selectedPointInfo.value }} {{ selectedPointInfo.unit }}
          </text>
          <text class="spb-status" :class="selectedPointInfo.badgeClass" v-if="selectedPointInfo.statusText">
            {{ selectedPointInfo.statusText }}
          </text>
        </view>
      </view>

      <!-- 触界 / 缩放极限轻量提示 Toast -->
      <view class="chart-limit-toast" v-if="toastMsg">
        <text class="chart-limit-toast-text">{{ toastMsg }}</text>
      </view>

      <!-- Canvas 2D 绘图容器：支持双指缩放、滑动手势、边界回弹动画、长按连续选点 -->
      <view 
        class="main-chart-canvas-box" 
        :class="[zoomLimitClass, edgeLimitClass]"
        v-if="!showFullscreenModal"
        @tap.stop
        @touchstart="handleChartTouchStart"
        @touchmove.stop="handleChartTouchMove"
        @touchend="handleChartTouchEnd"
        @touchcancel="handleChartTouchCancel"
      >
        <canvas 
          type="2d" 
          id="mainChartCanvas" 
          class="main-chart-canvas"
          @tap.stop
        ></canvas>
      </view>
      <view class="main-chart-canvas-box" v-else></view>

      <!-- 可直接拖动的灰色进度条 (与手势 100% 同步) -->
      <view 
        class="chart-slider-wrapper" 
        v-if="currentChartItems.length > currentZoomCount && !showFullscreenModal"
        :style="{ paddingLeft: sliderPaddingLeft, paddingRight: sliderPaddingRight }"
      >
        <view 
          class="chart-slider-track" 
          id="chartSliderTrack"
          @tap.stop
          @touchstart.stop="onSliderTouchStart"
          @touchmove.stop="onSliderTouchMove"
          @touchend.stop="onSliderTouchEnd"
        >
          <view class="chart-slider-rail"></view>
          <view 
            class="chart-slider-thumb" 
            :class="{ active: isDraggingSlider }"
            :style="{ width: thumbWidthPercent + '%', left: thumbLeftPercent + '%' }"
          ></view>
        </view>
      </view>
    </view>

    <!-- 血糖历史记录 -->
    <view class="history-card card">
      <view class="card-header">
        <text class="title">近期血糖</text>
        <text class="more" @click="goToHistory">全部 ›</text>
      </view>
      
      <view class="record-list">
        <view class="record-item" v-for="(item, index) in recentRecords" :key="index">
          <view class="time-col">
            <text class="time">{{ item.time }}</text>
            <text class="status">{{ item.status }}</text>
          </view>
          <view class="value-col">
            <text class="val" :class="getGlucoseClass(item.value)">{{ item.value }}</text>
            <text class="unit">mmol/L</text>
          </view>
        </view>
        <view v-if="recentRecords.length === 0" style="text-align: center; color: #ccc; padding: 20rpx 0;">
          暂无记录，快去记录一下吧~
        </view>
      </view>
    </view>

    <!-- 打针历史记录 -->
    <view class="history-card card">
      <view class="card-header">
        <text class="title">近期打针</text>
        <text class="more" @click="goToHistory">全部 ›</text>
      </view>
      
      <view class="record-list">
        <view class="record-item" v-for="(item, index) in recentInsulins" :key="index">
          <view class="time-col">
            <text class="time">{{ item.time }}</text>
            <text class="status">{{ item.type }}</text>
          </view>
          <view class="value-col">
            <text class="val" style="color: #3498DB;">{{ item.dose }}</text>
            <text class="unit">U</text>
          </view>
        </view>
        <view v-if="recentInsulins.length === 0" style="text-align: center; color: #ccc; padding: 20rpx 0;">
          暂无打针记录
        </view>
      </view>
    </view>

    <!-- 免责声明与引用 -->
    <view class="disclaimer">
      <text class="disclaimer-text">* 默认目标血糖范围 (5.0~15.0 mmol/L) 建议参考自中国兽医协会(CVMA)《犬猫糖尿病的筛查和诊断》(T/CVMA 195-2024)及主流猫病指南。</text>
      <view class="disclaimer-alert">
        <view class="icon-svg icon-alert"></view>
        <text class="disclaimer-text bold">免责声明：本程序仅供追踪与辅助，不构成医疗诊断。任何剂量的调整，请遵从主治兽医医嘱。</text>
      </view>
    </view>

    <!-- 全屏深度趋势分析模态窗 -->
    <FullscreenAnalysisModal 
      v-model:visible="showFullscreenModal"
      :glucoseRecords="rawGlucoseData"
      :weightRecords="rawWeightData"
      :targetMin="catInfo.targetMin"
      :targetMax="catInfo.targetMax"
      @close="handleCloseFullscreen"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, getCurrentInstance } from 'vue'
import { onShow, onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import FullscreenAnalysisModal from '@/components/FullscreenAnalysisModal.vue'
import { callApi } from '@/utils/api'
import { checkAndSyncAutoFeeder } from '@/utils/feederSync'

onLoad(async (options: any) => {
  if (options && options.inviter) {
    try {
      await callApi('bindSharedCat', { inviter: options.inviter })
      uni.showToast({ title: '已加入家庭共享', icon: 'success' })
    } catch (e) {
      console.log('绑定家庭共享失败', e)
    }
  }
})

onShareAppMessage(() => {
  return {
    title: '猫咪控糖日记 - 专业的猫咪糖尿病记录与健康管理助手',
    path: '/pages/index/index'
  }
})

onShareTimeline(() => {
  return {
    title: '猫咪控糖日记 - 专业的猫咪糖尿病记录与健康管理助手'
  }
})

const catInfo = ref({
  _id: '',
  avatar: '',
  name: '小煤球',
  age: 0 as number | null,
  daysSinceDiagnosis: 0,
  diagnosisDays: 0,
  targetMin: 5.0,
  targetMax: 15.0,
  thresholdNormalMax: 7.0,
  thresholdDangerMin: 15.0
})
const allCats = ref<any[]>([])

const showFullscreenModal = ref(false)
const openFullscreen = () => {
  showFullscreenModal.value = true
}
const handleCloseFullscreen = () => {
  showFullscreenModal.value = false
  nextTick(() => {
    setTimeout(() => {
      initMainCanvas(() => {
        initPositionForCurrentChart()
        updateTrackRect()
      })
    }, 100)
  })
}

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早上好，铲屎官'
  if (hour < 18) return '下午好，铲屎官'
  return '晚上好，铲屎官'
})

const currentChartTab = ref<'glucose' | 'weight'>('glucose')
const recentRecords = ref<any[]>([])
const recentInsulins = ref<any[]>([])
const rawGlucoseData = ref<any[]>([])
const rawWeightData = ref<any[]>([])
let lastChartTouchEndTime = 0

// Canvas 2D 实体引用与布局尺寸
const instance = getCurrentInstance()
let mainCanvasNode: any = null
let mainCanvasCtx: any = null
let mainCanvasWidth = 0
let mainCanvasHeight = 0
let canvasBoxLeft = 0

// 手势交互与缩放状态
const currentZoomCount = ref(5)
const selectedPointIndex = ref(-1)
let scrollX = 0
let animTimer: any = null

let touchStartX = 0
let touchStartY = 0
let touchStartScrollX = 0
let lastTouchX = 0
let lastTouchTime = 0
let velocity = 0
let isDragging = false
let isScrubbing = false
let isPinching = false
let wasPinching = false
let startPinchDist = 0
let startZoomCount = 5
let startPinchCenterPlotX = 0
let startPinchItemIdx = 0
let longPressTimer: any = null
let edgeTriggered = false

// 缩放/边界触底动画与轻量 Toast
const zoomLimitClass = ref('')
const edgeLimitClass = ref('')
const toastMsg = ref('')
let toastTimer: any = null

const showToastTip = (msg: string) => {
  toastMsg.value = msg
  if (toastTimer) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => {
    toastMsg.value = ''
  }, 1200)
}

const triggerZoomLimitAnimation = (type: 'in' | 'out', tipText?: string) => {
  zoomLimitClass.value = type === 'in' ? 'zoom-limit-in' : 'zoom-limit-out'
  showToastTip(tipText || (type === 'in' ? '已放大至最大视图 (3项)' : '已缩小至全景视图'))
  setTimeout(() => {
    zoomLimitClass.value = ''
  }, 240)
}

const triggerEdgeLimitAnimation = (dir: 'left' | 'right', tipText?: string) => {
  edgeLimitClass.value = dir === 'left' ? 'edge-limit-left' : 'edge-limit-right'
  showToastTip(tipText || (dir === 'left' ? '已至最早记录' : '已至最新记录'))
  setTimeout(() => {
    edgeLimitClass.value = ''
  }, 260)
}

const formatItemDate = (item: any) => {
  let dStr = ''
  if (item.record_date && item.record_date.includes('-')) {
    const [_, m, d] = item.record_date.split('-')
    dStr = `${parseInt(m)}/${parseInt(d)}`
  } else if (item.createTime) {
    const d = new Date(item.createTime)
    dStr = `${d.getMonth() + 1}/${d.getDate()}`
  } else {
    dStr = '近期'
  }
  const timeStr = item.measure_time ? ` ${item.measure_time}` : ''
  return {
    dayNum: dStr,
    time: `${dStr}${timeStr}`
  }
}

const getStatusMeta = (bg: number) => {
  const min = (catInfo.value.targetMin !== undefined && !isNaN(Number(catInfo.value.targetMin))) ? Number(catInfo.value.targetMin) : 4.0
  const max = (catInfo.value.targetMax !== undefined && !isNaN(Number(catInfo.value.targetMax))) ? Number(catInfo.value.targetMax) : 15.0
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

// 统一当前展示的数据切片列表
const currentChartItems = computed(() => {
  if (currentChartTab.value === 'glucose') {
    const chartItems = [...rawGlucoseData.value].reverse()
    return chartItems.map((item, idx) => {
      const dt = formatItemDate(item)
      const bg = typeof item.bg_value === 'number' ? Number(item.bg_value.toFixed(1)) : parseFloat(item.bg_value || '0')
      const meta = getStatusMeta(bg)
      return {
        id: item._id || `bg_${idx}`,
        date: dt.dayNum,
        dayNum: dt.dayNum,
        time: dt.time,
        value: bg,
        status: item.period || item.status || '常规',
        color: meta.color,
        textColor: meta.color,
        badgeClass: meta.badgeClass,
        statusText: meta.text
      }
    })
  } else {
    const chartItems = [...rawWeightData.value].reverse()
    return chartItems.map((item, idx) => {
      const dt = formatItemDate(item)
      const wt = typeof item.weight_value === 'number' ? Number(item.weight_value.toFixed(2)) : parseFloat(item.weight_value || '0')
      return {
        id: item._id || `wt_${idx}`,
        date: dt.dayNum,
        dayNum: dt.dayNum,
        time: dt.time,
        value: wt,
        status: '常规',
        color: '#3B82F6',
        textColor: '#2563EB',
        badgeClass: 'badge-blue',
        statusText: '体重'
      }
    })
  }
})

// 选中数据点详细信息
const selectedPointInfo = computed(() => {
  if (selectedPointIndex.value < 0 || selectedPointIndex.value >= currentChartItems.value.length) {
    return null
  }
  const item = currentChartItems.value[selectedPointIndex.value]
  if (currentChartTab.value === 'glucose') {
    const meta = getStatusMeta(item.value)
    return {
      time: item.time,
      label: '血糖',
      value: item.value.toFixed(1),
      unit: 'mmol/L',
      color: meta.color,
      badgeClass: meta.badgeClass,
      statusText: meta.text
    }
  } else {
    return {
      time: item.time,
      label: '体重',
      value: item.value.toFixed(2),
      unit: 'kg',
      color: '#2563EB',
      badgeClass: 'badge-blue',
      statusText: '体重'
    }
  }
})

// 图表绘图核心尺寸与滚动边界
const getPlotMetrics = () => {
  const padLeft = 38
  const padRight = (mainCanvasWidth || 345) - 20
  const plotWidth = Math.max(10, padRight - padLeft)
  const winSize = currentZoomCount.value
  const spacing = plotWidth / (winSize - 1 || 1)
  return { padLeft, padRight, plotWidth, winSize, spacing }
}

const getMinScrollX = () => {
  const total = currentChartItems.value.length
  const { spacing } = getPlotMetrics()
  const winSize = currentZoomCount.value
  if (total <= winSize) return 0
  return - (total - winSize) * spacing
}

// 灰色原生进度条联动逻辑
const sliderPaddingLeft = ref('38px')
const sliderPaddingRight = ref('20px')
const isDraggingSlider = ref(false)
const sliderScrollRatio = ref(1.0)

const thumbWidthPercent = computed(() => {
  const total = currentChartItems.value.length
  if (total <= currentZoomCount.value) return 100
  const ratio = Math.max(0.12, Math.min(0.6, currentZoomCount.value / total))
  return Math.round(ratio * 100)
})

const thumbLeftPercent = computed(() => {
  const maxTravel = 100 - thumbWidthPercent.value
  return Number((sliderScrollRatio.value * maxTravel).toFixed(2))
})

let trackRect: { left: number, width: number } | null = null

const updateTrackRect = () => {
  return new Promise<void>((resolve) => {
    const target = instance?.proxy || instance
    const query = uni.createSelectorQuery().in(target)
    query.select('#chartSliderTrack').boundingClientRect((res: any) => {
      if (res && res.width) {
        trackRect = { left: res.left, width: res.width }
      }
      resolve()
    }).exec()
  })
}

const onSliderTouchStart = async (e: any) => {
  isDraggingSlider.value = true
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }
  if (!trackRect) {
    await updateTrackRect()
  } else {
    updateTrackRect()
  }
  handleSliderTouch(e)
}

const onSliderTouchMove = (e: any) => {
  if (!isDraggingSlider.value) return
  handleSliderTouch(e)
}

const onSliderTouchEnd = (e: any) => {
  if (!isDraggingSlider.value) return
  handleSliderTouch(e)
  isDraggingSlider.value = false
}

const handleSliderTouch = (e: any) => {
  if (!trackRect || !trackRect.width) return
  const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0])
  if (!touch) return
  const clientX = touch.clientX
  const relativeX = clientX - trackRect.left
  const thumbW = (thumbWidthPercent.value / 100) * trackRect.width
  const maxTravel = trackRect.width - thumbW
  let clampedRatio = 0
  if (maxTravel > 0) {
    const thumbLeft = Math.max(0, Math.min(maxTravel, relativeX - thumbW / 2))
    clampedRatio = thumbLeft / maxTravel
  } else {
    clampedRatio = 1.0
  }

  const minScroll = getMinScrollX()
  scrollX = clampedRatio * minScroll
  sliderScrollRatio.value = clampedRatio
  drawMainChart()
}

// 点击图表外空白处 -> 取消数据点选中状态
const handleBackgroundTap = () => {
  // 若刚在图表上有触控或选点操作（400ms 保护期），坚决阻断合成 tap 事件导致的误取消
  if (Date.now() - lastChartTouchEndTime < 400) {
    return
  }
  if (selectedPointIndex.value !== -1) {
    selectedPointIndex.value = -1
    drawMainChart()
  }
}

// 点击数据点浮层本身直接关闭
const closeBadge = () => {
  selectedPointIndex.value = -1
  drawMainChart()
}

// 触摸交互状态机与物理滑动
const getBoxLeft = () => {
  if (canvasBoxLeft > 0) return canvasBoxLeft
  try {
    const sys = uni.getSystemInfoSync()
    return (sys.windowWidth * 32) / 750
  } catch (e) {
    return 16
  }
}

const handleTapSelect = (clientX: number) => {
  const items = currentChartItems.value
  if (!items.length) return
  const boxLeft = getBoxLeft()
  const { padLeft, spacing } = getPlotMetrics()
  const clickX = clientX - boxLeft

  let closestIdx = -1
  let minDiff = 99999
  items.forEach((_, i) => {
    const x = padLeft + i * spacing + scrollX
    const diff = Math.abs(x - clickX)
    if (diff < minDiff) {
      minDiff = diff
      closestIdx = i
    }
  })

  const hitRadius = Math.max(24, spacing / 2)
  if (closestIdx !== -1 && minDiff <= hitRadius) {
    selectedPointIndex.value = closestIdx
    drawMainChart()
  } else {
    if (selectedPointIndex.value !== -1) {
      selectedPointIndex.value = -1
      drawMainChart()
    }
  }
}

const reboundToBoundary = () => {
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }
  const minScroll = getMinScrollX()
  const target = scrollX > 0 ? 0 : minScroll
  const start = scrollX
  const startTime = Date.now()
  const duration = 240

  const stepAnim = () => {
    const elapsed = Date.now() - startTime
    const progress = Math.min(1, elapsed / duration)
    const ease = 1 - Math.pow(1 - progress, 3)
    scrollX = start + (target - start) * ease
    drawMainChart()

    if (progress < 1) {
      animTimer = setTimeout(stepAnim, 16)
    } else {
      scrollX = target
      drawMainChart()
      animTimer = null
    }
  }
  stepAnim()
}

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
      const minScroll = getMinScrollX()
      if (scrollX > 0 || scrollX < minScroll) {
        reboundToBoundary()
      }
      return
    }

    v *= friction
    scrollX += v
    const minScroll = getMinScrollX()

    if (scrollX > 0) {
      scrollX *= 0.6
      v *= 0.5
    } else if (scrollX < minScroll) {
      const over = scrollX - minScroll
      scrollX = minScroll + over * 0.6
      v *= 0.5
    }

    drawMainChart()

    if (scrollX > 20 || scrollX < minScroll - 20) {
      animTimer = null
      reboundToBoundary()
      return
    }

    animTimer = setTimeout(stepFlick, 16)
  }
  stepFlick()
}

const handleChartTouchStart = (e: any) => {
  if (!e.touches) return
  edgeTriggered = false
  if (animTimer) {
    clearTimeout(animTimer)
    animTimer = null
  }

  // 双指缩放
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

  // 单指交互
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

    // 长按 220ms 触发滑动选点模式
    longPressTimer = setTimeout(() => {
      longPressTimer = null
      isScrubbing = true
      handleTapSelect(touchStartX)
    }, 220)
  }
}

const handleChartTouchMove = (e: any) => {
  if (!e.touches) return

  // 双指手势缩放 (以双指中心点为几何锚点，保持当前缩放数据点位置不动)
  if (e.touches.length === 2 && isPinching) {
    const p1 = e.touches[0]
    const p2 = e.touches[1]
    const curDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
    const diff = curDist - startPinchDist
    const total = Math.max(3, currentChartItems.value.length)
    const minZoom = 3
    const maxZoom = Math.max(15, total)

    const deltaUnits = Math.round(-diff / 22)
    let targetCount = startZoomCount + deltaUnits
    targetCount = Math.max(minZoom, Math.min(maxZoom, targetCount))

    if (curDist - startPinchDist > 30 && currentZoomCount.value === minZoom && !edgeTriggered) {
      edgeTriggered = true
      triggerZoomLimitAnimation('in', `已放大至最大视图 (${minZoom}项)`)
    } else if (curDist - startPinchDist < -30 && currentZoomCount.value === maxZoom && !edgeTriggered) {
      edgeTriggered = true
      triggerZoomLimitAnimation('out', `已缩小至全景视图 (${maxZoom}项)`)
    } else if (targetCount > minZoom && targetCount < maxZoom) {
      edgeTriggered = false
    }

    const boxLeft = getBoxLeft()
    const { padLeft, plotWidth } = getPlotMetrics()
    const pinchScreenX = (p1.clientX + p2.clientX) / 2
    const curPinchCenterPlotX = Math.max(0, Math.min(plotWidth, pinchScreenX - boxLeft - padLeft))

    currentZoomCount.value = targetCount
    const newSpacing = plotWidth / (targetCount - 1 || 1)
    let newScrollX = curPinchCenterPlotX - startPinchItemIdx * newSpacing

    const minScroll = getMinScrollX()
    scrollX = Math.max(minScroll, Math.min(0, newScrollX))

    drawMainChart()
    return
  }

  // 严格防护：若当前手势包含双指缩放，在所有手指完全离开屏幕前，绝对禁止退化为单指拖拽或平移
  if (isPinching || wasPinching) {
    return
  }

  // 单指移动
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

    if (Math.hypot(deltaX, deltaY) > 6) {
      if (longPressTimer) {
        clearTimeout(longPressTimer)
        longPressTimer = null
      }

      if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > 6) {
        isDragging = true
        const minScroll = getMinScrollX()
        let targetScroll = touchStartScrollX + deltaX

        if (targetScroll > 0) {
          targetScroll = targetScroll * 0.28
          if (deltaX > 20 && !edgeTriggered) {
            edgeTriggered = true
            triggerEdgeLimitAnimation('left', '已至最早记录')
          }
        } else if (targetScroll < minScroll) {
          const over = targetScroll - minScroll
          targetScroll = minScroll + over * 0.28
          if (deltaX < -20 && !edgeTriggered) {
            edgeTriggered = true
            triggerEdgeLimitAnimation('right', '已至最新记录')
          }
        } else {
          edgeTriggered = false
        }

        scrollX = targetScroll
        drawMainChart()
      }
    }
  }
}

const handleChartTouchEnd = (e: any) => {
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
      const minScroll = getMinScrollX()
      if (scrollX > 0 || scrollX < minScroll) {
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
    const minScroll = getMinScrollX()
    if (scrollX > 0 || scrollX < minScroll) {
      reboundToBoundary()
      return
    }
    if (Math.abs(velocity) > 0.22) {
      startInertia(velocity)
    }
    return
  }

  handleTapSelect(touchStartX)
}

const handleChartTouchCancel = () => {
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
  const minScroll = getMinScrollX()
  if (scrollX > 0 || scrollX < minScroll) {
    reboundToBoundary()
  }
}

// Canvas 2D 初始化
const initMainCanvas = (callback?: () => void) => {
  const query = uni.createSelectorQuery().in(instance?.proxy || instance)
  query.select('#mainChartCanvas').fields({ node: true, size: true, rect: true })
  query.select('.main-chart-canvas-box').boundingClientRect()
  query.exec((res) => {
    if (res && res[0] && res[0].node) {
      const dpr = uni.getSystemInfoSync().pixelRatio || 2
      mainCanvasNode = res[0].node
      mainCanvasCtx = mainCanvasNode.getContext('2d')
      mainCanvasWidth = res[0].width
      mainCanvasHeight = res[0].height
      mainCanvasNode.width = mainCanvasWidth * dpr
      mainCanvasNode.height = mainCanvasHeight * dpr
      mainCanvasCtx.scale(dpr, dpr)

      if (res[1] && typeof res[1].left === 'number') {
        canvasBoxLeft = res[1].left
      } else if (res[0] && typeof res[0].left === 'number') {
        canvasBoxLeft = res[0].left
      }

      if (callback) callback()
    }
  })
}

const fetchCatProfile = async () => {
  try {
    const res = await callApi('getCats')
    if (res.data && res.data.length > 0) {
      allCats.value = res.data
      let currentCatId = uni.getStorageSync('currentCatId')
      let cat = res.data.find((c: any) => c._id === currentCatId)
      if (!cat) {
        cat = res.data[0]
        uni.setStorageSync('currentCatId', cat._id)
      }
      
      catInfo.value._id = cat._id
      catInfo.value.name = cat.name || '未命名'
      catInfo.value.avatar = cat.avatar || ''
      
      if (cat.birthday) {
        const bDate = new Date(cat.birthday)
        const today = new Date()
        let ageNum = today.getFullYear() - bDate.getFullYear()
        const m = today.getMonth() - bDate.getMonth()
        if (m < 0 || (m === 0 && today.getDate() < bDate.getDate())) {
            ageNum--
        }
        catInfo.value.age = Math.max(0, ageNum)
      } else {
        catInfo.value.age = 0
      }
      
      if (cat.diagnosis_date) {
        const dDate = new Date(cat.diagnosis_date)
        const today = new Date()
        const diffTime = Math.abs(today.getTime() - dDate.getTime())
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
        catInfo.value.daysSinceDiagnosis = diffDays
      } else {
        catInfo.value.daysSinceDiagnosis = 0
      }
      
      catInfo.value.targetMin = (cat.targetMin !== undefined && !isNaN(Number(cat.targetMin))) ? Number(cat.targetMin) : 4.0
      catInfo.value.targetMax = (cat.targetMax !== undefined && !isNaN(Number(cat.targetMax))) ? Number(cat.targetMax) : 15.0
      catInfo.value.thresholdDangerMin = catInfo.value.targetMax
      catInfo.value.thresholdNormalMax = catInfo.value.targetMax
    } else {
      catInfo.value._id = ''
      allCats.value = []
    }
  } catch (err) {
    console.error('获取猫咪信息失败', err)
  }
}

const fetchRecentRecords = async () => {
  if (!catInfo.value._id) return
  try {
    const res = await callApi('getRecords', { catId: catInfo.value._id, type: 'blood_glucose', limit: 30 })
    if (res.data) {
      recentRecords.value = res.data.slice(0, 4).map((item: any) => {
        let displayTime = ''
        const timeStr = item.measure_time || ''
        if (item.record_date && item.record_date.includes('-')) {
          const [_, m, d] = item.record_date.split('-')
          displayTime = `${parseInt(m)}月${parseInt(d)}日 ${timeStr}`.trim()
        } else if (item.createTime) {
          const d = new Date(item.createTime)
          const pad = (n: number) => n.toString().padStart(2, '0')
          const fallbackTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
          displayTime = `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr || fallbackTime}`
        }
        return {
          time: displayTime,
          status: item.period || item.status || '常规',
          value: item.bg_value
        }
      })
      rawGlucoseData.value = res.data
      if (currentChartTab.value === 'glucose') renderChart()
    }
  } catch (err) {
    console.error('获取最近记录失败', err)
  }
}

const fetchRecentWeights = async () => {
  if (!catInfo.value._id) return
  try {
    const res = await callApi('getRecords', { catId: catInfo.value._id, type: 'weight_records', limit: 30 })
    if (res.data) {
      rawWeightData.value = res.data
      if (currentChartTab.value === 'weight') renderChart()
    }
  } catch (err) {
    console.error('获取体重记录失败', err)
  }
}

const switchTab = (tab: 'glucose' | 'weight') => {
  currentChartTab.value = tab
  selectedPointIndex.value = -1
  initPositionForCurrentChart()
  nextTick(() => {
    updateTrackRect()
  })
}

const initPositionForCurrentChart = () => {
  const total = currentChartItems.value.length
  currentZoomCount.value = Math.min(5, Math.max(total, 3))
  selectedPointIndex.value = -1
  const minScroll = getMinScrollX()
  scrollX = minScroll
  sliderScrollRatio.value = 1.0
  drawMainChart()
}

const renderChart = () => {
  if (!mainCanvasCtx) {
    initMainCanvas(() => {
      initPositionForCurrentChart()
      updateTrackRect()
    })
  } else {
    initPositionForCurrentChart()
    updateTrackRect()
  }
}

// 统一绘制函数：支持血糖自适应高度与红绿上下限，以及体重充足呼吸余量（彻底杜绝压顶）
const drawMainChart = () => {
  if (!mainCanvasCtx) return
  const ctx = mainCanvasCtx
  const items = currentChartItems.value

  ctx.clearRect(0, 0, mainCanvasWidth, mainCanvasHeight)
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, mainCanvasWidth, mainCanvasHeight)

  if (!items.length) {
    ctx.fillStyle = '#94A3B8'
    ctx.font = '13px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(currentChartTab.value === 'glucose' ? '暂无血糖记录' : '暂无体重记录', mainCanvasWidth / 2, mainCanvasHeight / 2)
    return
  }

  const { padLeft, padRight, spacing } = getPlotMetrics()
  const topY = currentChartTab.value === 'glucose' ? 28 : 34
  const bottomY = mainCanvasHeight - 26

  // 同步更新原生滚动条滑块的响应式比率，确保视觉位置与图表 100% 实时同步
  const minScroll = getMinScrollX()
  if (minScroll >= 0) {
    sliderScrollRatio.value = 1.0
  } else {
    const r = scrollX / minScroll
    sliderScrollRatio.value = Math.max(0, Math.min(1, r))
  }

  if (currentChartTab.value === 'glucose') {
    // 血糖图表渲染
    const numericBgs = items.map(i => i.value).filter(v => typeof v === 'number' && v > 0)
    const maxBg = numericBgs.length ? Math.max(...numericBgs) : 15.0

    let ceiling = 20
    if (maxBg <= 18.0) ceiling = 20
    else if (maxBg <= 23.0) ceiling = 25
    else if (maxBg <= 28.0) ceiling = 30
    else if (maxBg <= 33.0) ceiling = 35
    else ceiling = Math.ceil((maxBg + 2) / 5) * 5

    const getY = (bg: number) => {
      const clamped = Math.max(0, Math.min(ceiling, bg))
      return bottomY - (clamped / ceiling) * (bottomY - topY)
    }

    // 1. 虚线网格
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = '#E2E8F0'

    let gridSteps: number[] = []
    if (ceiling === 20) gridSteps = [15, 10, 5]
    else if (ceiling === 25) gridSteps = [20, 15, 10, 5]
    else if (ceiling === 30) gridSteps = [20, 10]
    else if (ceiling === 35) gridSteps = [25, 15, 5]
    else {
      const step = Math.ceil(ceiling / 4)
      gridSteps = [step * 3, step * 2, step]
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

    // 顶线与上限刻度
    ctx.beginPath()
    ctx.moveTo(padLeft, topY)
    ctx.lineTo(padRight, topY)
    ctx.stroke()
    ctx.fillStyle = '#94A3B8'
    ctx.font = '10px sans-serif'
    ctx.textAlign = 'right'
    ctx.fillText(`${ceiling}`, padLeft - 6, topY + 3)

    // 底线与 0 刻度
    ctx.setLineDash([])
    ctx.strokeStyle = '#CBD5E1'
    ctx.beginPath()
    ctx.moveTo(padLeft, bottomY)
    ctx.lineTo(padRight, bottomY)
    ctx.stroke()
    ctx.fillText('0', padLeft - 6, bottomY + 3)

    // 目标参考线：上限红色虚线，下限绿色虚线 (纯净线条，无文字标签)
    const targetMax = catInfo.value.targetMax || 15.0
    const targetMin = catInfo.value.targetMin || 4.0

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

    // 2. 剪裁区域：绘制选中高亮柱、折线、数据点与数值
    ctx.save()
    ctx.beginPath()
    ctx.rect(padLeft - 2, 2, mainCanvasWidth - (padLeft - 2) - 2, bottomY - 2 + 6)
    ctx.clip()

    if (selectedPointIndex.value >= 0 && selectedPointIndex.value < items.length) {
      const selX = padLeft + selectedPointIndex.value * spacing + scrollX
      const beamW = 28
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

    // 折线
    const validPoints: { x: number, y: number }[] = []
    items.forEach((item, i) => {
      if (item.value !== null && typeof item.value === 'number' && item.value > 0) {
        const x = padLeft + i * spacing + scrollX
        validPoints.push({ x, y: getY(item.value) })
      }
    })

    if (validPoints.length > 0) {
      ctx.beginPath()
      ctx.strokeStyle = '#64748B'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.moveTo(validPoints[0].x, validPoints[0].y)
      for (let j = 1; j < validPoints.length; j++) {
        ctx.lineTo(validPoints[j].x, validPoints[j].y)
      }
      ctx.stroke()
    }

    // 数据点与数值 (按血糖标准着色)
    const showNumbers = currentZoomCount.value <= 8
    const dotR = currentZoomCount.value <= 4 ? 5 : 3.8

    items.forEach((item, i) => {
      const x = padLeft + i * spacing + scrollX
      if (x < padLeft - 30 || x > padRight + 30) return

      if (item.value !== null && typeof item.value === 'number' && item.value > 0) {
        const y = getY(item.value)
        const meta = getStatusMeta(item.value)

        ctx.beginPath()
        ctx.arc(x, y, dotR, 0, Math.PI * 2)
        ctx.fillStyle = meta.color
        ctx.fill()
        ctx.lineWidth = 1.6
        ctx.strokeStyle = '#FFFFFF'
        ctx.stroke()

        if (showNumbers) {
          ctx.fillStyle = meta.color
          ctx.font = 'bold 11px sans-serif'
          const textStr = item.value.toFixed(1)
          const numW = (ctx.measureText ? ctx.measureText(textStr).width : 0) || 24
          const halfNumW = numW / 2

          let drawNumX = x
          const safeTextLeft = padLeft - 2 + halfNumW
          const safeTextRight = mainCanvasWidth - 4 - halfNumW
          if (drawNumX < safeTextLeft && x >= padLeft - 6) {
            drawNumX = safeTextLeft
          } else if (drawNumX > safeTextRight && x <= padRight + 10) {
            drawNumX = safeTextRight
          }

          const textY = Math.max(16, y - 7)
          ctx.textAlign = 'center'
          ctx.fillText(textStr, drawNumX, textY)
        }
      }
    })
    ctx.restore()

    // 3. X 轴日期刻度
    items.forEach((item, i) => {
      const x = padLeft + i * spacing + scrollX
      if (x < padLeft - 35 || x > padRight + 35) return

      let showX = true
      if (currentZoomCount.value > 12) {
        showX = (i === 0 || i % 2 === 0 || i === items.length - 1)
      }

      if (showX) {
        const isCur = selectedPointIndex.value === i
        ctx.fillStyle = isCur ? '#0F172A' : '#64748B'
        ctx.font = isCur ? 'bold 11px sans-serif' : '10px sans-serif'

        const textW = (ctx.measureText ? ctx.measureText(item.dayNum).width : 0) || 28
        const halfW = textW / 2
        let drawX = x
        const safeLeft = padLeft - 2
        const safeRight = mainCanvasWidth - 6
        if (drawX - halfW < safeLeft) {
          drawX = safeLeft + halfW
        } else if (drawX + halfW > safeRight) {
          drawX = safeRight - halfW
        }

        ctx.textAlign = 'center'
        ctx.fillText(item.dayNum, drawX, bottomY + 16)
      }
    })
  } else {
    // 体重图表渲染 (解决压顶问题，支持充足呼吸余量与网格)
    const validWts = items
      .filter(i => typeof i.value === 'number' && i.value > 0)
      .map(i => i.value as number)

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

    // 1. 固定网格与 Y 轴刻度
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = '#E2E8F0'

    const midWeight = Number(((minWeight + maxWeight) / 2).toFixed(1))
    const gridSteps = [maxWeight, midWeight]

    gridSteps.forEach(v => {
      const y = getY(v)
      ctx.beginPath()
      ctx.moveTo(padLeft, y)
      ctx.lineTo(padRight, y)
      ctx.stroke()

      ctx.fillStyle = '#94A3B8'
      ctx.font = '10px sans-serif'
      ctx.textAlign = 'right'
      ctx.fillText(v.toFixed(1), padLeft - 6, y + 3)
    })

    // 基线与刻度
    ctx.setLineDash([])
    ctx.strokeStyle = '#CBD5E1'
    ctx.beginPath()
    ctx.moveTo(padLeft, bottomY)
    ctx.lineTo(padRight, bottomY)
    ctx.stroke()
    ctx.fillText(minWeight.toFixed(1), padLeft - 6, bottomY + 3)

    // 2. 剪裁区域
    ctx.save()
    ctx.beginPath()
    ctx.rect(padLeft - 2, 2, mainCanvasWidth - (padLeft - 2) - 2, bottomY - 2 + 6)
    ctx.clip()

    if (selectedPointIndex.value >= 0 && selectedPointIndex.value < items.length) {
      const selX = padLeft + selectedPointIndex.value * spacing + scrollX
      const beamW = 28
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

    // 绘制体重蓝色折线
    const validPoints: { x: number, y: number }[] = []
    items.forEach((item, i) => {
      if (item.value !== null && typeof item.value === 'number' && item.value > 0) {
        const x = padLeft + i * spacing + scrollX
        validPoints.push({ x, y: getY(item.value) })
      }
    })

    if (validPoints.length > 0) {
      ctx.beginPath()
      ctx.strokeStyle = '#3B82F6'
      ctx.lineWidth = 2.2
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'

      ctx.moveTo(validPoints[0].x, validPoints[0].y)
      for (let j = 1; j < validPoints.length; j++) {
        ctx.lineTo(validPoints[j].x, validPoints[j].y)
      }
      ctx.stroke()
    }

    // 绘制体重点与数值
    const showNumbers = currentZoomCount.value <= 8
    const dotR = currentZoomCount.value <= 4 ? 4.8 : 3.5

    items.forEach((item, i) => {
      const x = padLeft + i * spacing + scrollX
      if (x < padLeft - 30 || x > padRight + 30) return

      if (item.value !== null && typeof item.value === 'number' && item.value > 0) {
        const y = getY(item.value)

        ctx.beginPath()
        ctx.arc(x, y, dotR, 0, Math.PI * 2)
        ctx.fillStyle = '#3B82F6'
        ctx.fill()
        ctx.lineWidth = 1.6
        ctx.strokeStyle = '#FFFFFF'
        ctx.stroke()

        if (showNumbers) {
          ctx.fillStyle = '#2563EB'
          ctx.font = 'bold 11px sans-serif'
          const textStr = item.value.toFixed(2)
          const numW = (ctx.measureText ? ctx.measureText(textStr).width : 0) || 24
          const halfNumW = numW / 2

          let drawNumX = x
          const safeTextLeft = padLeft - 2 + halfNumW
          const safeTextRight = mainCanvasWidth - 4 - halfNumW
          if (drawNumX < safeTextLeft && x >= padLeft - 6) {
            drawNumX = safeTextLeft
          } else if (drawNumX > safeTextRight && x <= padRight + 10) {
            drawNumX = safeTextRight
          }

          // 充足呼吸余量：保证数字与点绝不上溢压顶
          const textY = Math.max(16, y - 7)
          ctx.textAlign = 'center'
          ctx.fillText(textStr, drawNumX, textY)
        }
      }
    })
    ctx.restore()

    // 3. X 轴日期刻度
    items.forEach((item, i) => {
      const x = padLeft + i * spacing + scrollX
      if (x < padLeft - 35 || x > padRight + 35) return

      let showX = true
      if (currentZoomCount.value > 12) {
        showX = (i === 0 || i % 2 === 0 || i === items.length - 1)
      }

      if (showX) {
        const isCur = selectedPointIndex.value === i
        ctx.fillStyle = isCur ? '#0F172A' : '#64748B'
        ctx.font = isCur ? 'bold 11px sans-serif' : '10px sans-serif'

        const textW = (ctx.measureText ? ctx.measureText(item.dayNum).width : 0) || 28
        const halfW = textW / 2
        let drawX = x
        const safeLeft = padLeft - 2
        const safeRight = mainCanvasWidth - 6
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
}

const fetchRecentInsulins = async () => {
  if (!catInfo.value._id) return
  try {
    const res = await callApi('getRecords', { catId: catInfo.value._id, type: 'insulin_records', limit: 4 })
    if (res.data) {
      recentInsulins.value = res.data.map((item: any) => {
        let displayTime = ''
        const timeStr = item.inject_time || ''
        if (item.record_date && item.record_date.includes('-')) {
          const [_, m, d] = item.record_date.split('-')
          displayTime = `${parseInt(m)}月${parseInt(d)}日 ${timeStr}`.trim()
        } else if (item.createTime) {
          const d = new Date(item.createTime)
          const pad = (n: number) => n.toString().padStart(2, '0')
          const fallbackTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`
          displayTime = `${d.getMonth() + 1}月${d.getDate()}日 ${timeStr || fallbackTime}`
        }
        return {
          time: displayTime,
          type: item.period ? `${item.period} · ${item.insulin_type || '胰岛素'}` : (item.insulin_type || '胰岛素'),
          dose: item.dose
        }
      })
    }
  } catch (err) {
    console.error('获取打针记录失败', err)
  }
}

const formatDisplayTime = (date: Date) => {
  if (!date) return '未知时间'
  const d = new Date(date)
  const now = new Date()
  
  const isToday = d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  
  const pad = (n: number) => n.toString().padStart(2, '0')
  const timeStr = `${pad(d.getHours())}:${pad(d.getMinutes())}`
  
  if (isToday) {
    return `今天 ${timeStr}`
  } else {
    return `${d.getMonth() + 1}/${d.getDate()} ${timeStr}`
  }
}

const loadAllData = async () => {
  await fetchCatProfile()
  if (catInfo.value._id || allCats.value.length === 0) {
    // 异步后台静默执行自动喂食机对齐补录，不阻塞核心健康数据拉取
    checkAndSyncAutoFeeder(catInfo.value._id).catch(() => {})
    fetchRecentRecords()
    fetchRecentInsulins()
    fetchRecentWeights()
  }
}

onShow(() => {
  loadAllData()
  nextTick(() => {
    setTimeout(() => {
      initMainCanvas(() => {
        initPositionForCurrentChart()
        updateTrackRect()
      })
    }, 80)
  })
})

const handleSwitchCat = () => {
  const itemList = allCats.value.map(c => c.name || '未命名')
  itemList.push('+ 新增猫咪')
  uni.showActionSheet({
    itemList,
    success: (res) => {
      if (res.tapIndex === itemList.length - 1) {
        uni.navigateTo({ url: '/pages/user/cat-profile/index' })
      } else {
        const selectedCat = allCats.value[res.tapIndex]
        uni.setStorageSync('currentCatId', selectedCat._id)
        loadAllData()
      }
    }
  })
}

const handleLogGlucose = () => {
  if (allCats.value.length === 0) { uni.showToast({ title: '请先添加猫咪', icon: 'none' }); return }
  uni.navigateTo({ url: '/pages/log/index' })
}

const handleLogInsulin = () => {
  if (allCats.value.length === 0) { uni.showToast({ title: '请先添加猫咪', icon: 'none' }); return }
  uni.navigateTo({ url: '/pages/log-insulin/index' })
}

const handleLogMeal = () => {
  if (allCats.value.length === 0) { uni.showToast({ title: '请先添加猫咪', icon: 'none' }); return }
  uni.navigateTo({ url: '/pages/log-meal/index' })
}

const handleLogExcretion = () => {
  if (allCats.value.length === 0) { uni.showToast({ title: '请先添加猫咪', icon: 'none' }); return }
  uni.navigateTo({ url: '/pages/log-excretion/index' })
}

const handleLogWeight = () => {
  if (allCats.value.length === 0) { uni.showToast({ title: '请先添加猫咪', icon: 'none' }); return }
  uni.navigateTo({ url: '/pages/log-weight/index' })
}

const goToHistory = () => {
  uni.navigateTo({ url: '/pages/history/index' })
}

const getGlucoseClass = (val: number) => {
  const min = (catInfo.value.targetMin !== undefined && !isNaN(Number(catInfo.value.targetMin))) ? Number(catInfo.value.targetMin) : 4.0
  const max = (catInfo.value.targetMax !== undefined && !isNaN(Number(catInfo.value.targetMax))) ? Number(catInfo.value.targetMax) : 15.0
  const warningMax = max * 1.3 // 动态超标 30% 缓冲阈值

  if (val < min) {
    return 'text-danger' // 红色：低于自定义目标下限 (低血糖急症)
  } else if (val <= max) {
    return 'text-safe' // 绿色：安全达标区间 [min, max]
  } else if (val <= warningMax) {
    return 'text-warning' // 黄色：超出目标上限 30% 以内 (轻中度偏高，需观察)
  } else {
    return 'text-danger' // 红色：超出目标上限 30% 以上 (严重高血糖预警)
  }
}
</script>

<style scoped>
.container {
  min-height: 100vh;
  box-sizing: border-box;
}

/* 头部样式 */
.header {
  display: flex;
  align-items: center;
  margin-bottom: 40rpx;
  padding: 0 10rpx;
}
.avatar-wrap {
  width: 120rpx;
  height: 120rpx;
  border-radius: 60rpx;
  background: var(--primary-light);
  margin-right: 32rpx;
  box-shadow: 0 8rpx 16rpx rgba(255, 138, 101, 0.2);
  overflow: hidden;
}
.avatar {
  width: 100%;
  height: 100%;
}
.info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.greeting {
  font-size: 24rpx;
  color: var(--text-sub);
  margin-bottom: 8rpx;
}
.name-row {
  display: flex;
  align-items: center;
  margin-bottom: 8rpx;
}
.name {
  font-size: 40rpx;
  font-weight: 700;
  color: var(--text-main);
}
.icon-switch {
  width: 32rpx; height: 32rpx; margin-left: 8rpx; margin-right: 16rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23BDC3C7' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
}
.tag {
  font-size: 20rpx;
  background: var(--primary-light);
  color: #D35400;
  padding: 4rpx 12rpx;
  border-radius: 100rpx;
  font-weight: 600;
}
.desc {
  font-size: 24rpx;
  color: var(--text-sub);
}

/* 卡片标题 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.chart-fullscreen-btn {
  padding: 8rpx 14rpx;
  background: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 16rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}
.chart-fullscreen-btn:active {
  transform: scale(0.92);
  background: #EDF2F7;
}
.icon-chart-bars {
  width: 34rpx;
  height: 34rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%2364748B'%3E%3Crect x='3' y='11' width='3.2' height='10' rx='1.6'/%3E%3Crect x='8.5' y='14' width='3.2' height='7' rx='1.6'/%3E%3Crect x='14' y='7' width='3.2' height='14' rx='1.6'/%3E%3Crect x='19.5' y='3' width='3.2' height='18' rx='1.6'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.card-title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
}
.tabs {
  display: flex;
  gap: 32rpx;
}
.tab-item {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-sub);
  padding-bottom: 8rpx;
  border-bottom: 4rpx solid transparent;
  transition: all 0.3s;
}
.tab-item.active {
  color: var(--primary);
  border-bottom-color: var(--primary);
}
.more {
  font-size: 24rpx;
  color: var(--text-sub);
}

/* 操作区 (2x2 黄金网格布局) */
.action-card .card-title {
  margin-bottom: 24rpx;
}
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}
.action-btn-item {
  display: flex;
  align-items: center;
  padding: 24rpx 20rpx;
  border-radius: 20rpx;
  transition: all 0.2s ease;
  box-sizing: border-box;
}
.action-btn-item:active {
  transform: scale(0.98);
  opacity: 0.9;
}
.btn-glucose {
  background: linear-gradient(135deg, #FFF5F5, #FED7D7);
  border: 2rpx solid rgba(229, 62, 62, 0.1);
}
.btn-insulin {
  background: linear-gradient(135deg, #FFF8F0, #FEEBC8);
  border: 2rpx solid rgba(221, 107, 32, 0.1);
}
.btn-meal {
  background: linear-gradient(135deg, #FFFAF0, #FEFCBF);
  border: 2rpx solid rgba(214, 158, 46, 0.1);
}
.btn-excretion {
  background: linear-gradient(135deg, #F0FDF4, #DCFCE7);
  border: 2rpx solid rgba(22, 163, 74, 0.12);
}
.btn-weight {
  background: linear-gradient(135deg, #F0F4FF, #D9E2EC);
  border: 2rpx solid rgba(74, 85, 104, 0.1);
}
.action-btn-item.full-width {
  grid-column: span 2;
}

.action-icon {
  width: 48rpx;
  height: 48rpx;
  margin-right: 16rpx;
  flex-shrink: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-blood-lg {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23E53E3E' stroke='%23E53E3E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'/%3E%3C/svg%3E");
}
.icon-syringe-lg {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DD6B20' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 2 4 4'/%3E%3Cpath d='m17 7 3-3'/%3E%3Cpath d='M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5'/%3E%3Cpath d='m9 11 4 4'/%3E%3Cpath d='m5 19-3 3'/%3E%3Cpath d='m14 4 6 6'/%3E%3C/svg%3E");
}
.icon-meal-lg {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D69E2E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8h1a4 4 0 0 1 0 8h-1'/%3E%3Cpath d='M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z'/%3E%3Cline x1='6' y1='1' x2='6' y2='4'/%3E%3Cline x1='10' y1='1' x2='10' y2='4'/%3E%3Cline x1='14' y1='1' x2='14' y2='4'/%3E%3C/svg%3E");
}
.icon-excretion-lg {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A34A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'/%3E%3C/svg%3E");
}
.icon-weight-lg {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A5568' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'/%3E%3Cline x1='7' y1='7' x2='7.01' y2='7'/%3E%3C/svg%3E");
}

.action-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.action-main-text {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-main);
  line-height: 1.2;
  margin-bottom: 4rpx;
}
.action-sub-text {
  font-size: 20rpx;
  color: #718096;
  line-height: 1.2;
}

/* 原生 Canvas 2D 图表容器 */
.main-chart-canvas-box {
  width: 100%;
  height: 440rpx;
  background-color: #FFFFFF;
  position: relative;
  overflow: hidden;
  box-sizing: border-box;
  transition: transform 0.2s cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.main-chart-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* 选中数据点详细浮层 (高亮横条) */
.selected-point-badge {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background-color: #F8FAFC;
  border: 1.5rpx solid #E2E8F0;
  border-radius: 12rpx;
  padding: 8rpx 18rpx;
  margin-bottom: 12rpx;
  animation: fadeIn 0.15s ease;
}
.spb-date {
  font-size: 22rpx;
  color: #64748B;
  font-weight: 500;
}
.spb-right {
  display: flex;
  align-items: center;
  gap: 12rpx;
}
.spb-val {
  font-size: 24rpx;
  font-weight: 700;
}
.spb-status {
  font-size: 20rpx;
  font-weight: 600;
  padding: 2rpx 12rpx;
  border-radius: 6rpx;
}

/* 状态徽章背景与文字颜色 */
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

/* 边界触底与缩放极限轻量提示 Toast */
.chart-limit-toast {
  position: absolute;
  top: 96rpx;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(15, 23, 42, 0.85);
  backdrop-filter: blur(8px);
  padding: 6rpx 22rpx;
  border-radius: 100rpx;
  z-index: 100;
  pointer-events: none;
  animation: toastFadeIn 0.2s ease;
}
.chart-limit-toast-text {
  font-size: 20rpx;
  color: #FFFFFF;
  font-weight: 500;
}
@keyframes toastFadeIn {
  from { opacity: 0; transform: translate(-50%, -8rpx); }
  to { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

/* 边缘触底微弹性轻晃反馈 */
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
.edge-limit-left {
  animation: edgeBounceLeft 0.26s cubic-bezier(0.25, 1, 0.5, 1) !important;
}
.edge-limit-right {
  animation: edgeBounceRight 0.26s cubic-bezier(0.25, 1, 0.5, 1) !important;
}

/* 缩放极限弹性震荡动画 */
.zoom-limit-in {
  transform: scale(1.036) !important;
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25) !important;
}
.zoom-limit-out {
  transform: scale(0.964) !important;
  transition: transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1.25) !important;
}

/* 原生灰色风格的可拖动进度条 */
.chart-slider-wrapper {
  margin-top: 4rpx;
  padding: 0 20rpx 10rpx 76rpx;
  display: flex;
  align-items: center;
  box-sizing: border-box;
}

.chart-slider-track {
  width: 100%;
  height: 36rpx;
  position: relative;
  display: flex;
  align-items: center;
}

.chart-slider-rail {
  width: 100%;
  height: 8rpx;
  background-color: #EFEBEF;
  border-radius: 4rpx;
}

.chart-slider-thumb {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  height: 8rpx;
  background-color: #A6A6A6;
  border-radius: 4rpx;
  transition: background-color 0.15s ease;

  &.active {
    background-color: #7E7E7E;
    height: 10rpx;
  }
}

/* 列表样式 */
.record-list {
  display: flex;
  flex-direction: column;
}
.record-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 24rpx 0;
  border-bottom: 2rpx solid #F0F0F0;
}
.record-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.time-col {
  display: flex;
  flex-direction: column;
}
.time {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 4rpx;
}
.status {
  font-size: 22rpx;
  color: var(--text-sub);
}
.value-col {
  display: flex;
  align-items: baseline;
}
.val {
  font-size: 48rpx;
  font-weight: 800;
  margin-right: 8rpx;
}
.unit {
  font-size: 22rpx;
  color: var(--text-sub);
}

/* 数值颜色 */
.text-safe {
  color: var(--safe-green);
}
.text-warning {
  color: #F1C40F;
}
.text-danger {
  color: var(--danger-red);
}

/* 免责声明 */
.disclaimer {
  padding: 20rpx 16rpx 40rpx 16rpx;
  display: flex;
  flex-direction: column;
  gap: 12rpx;
}
.disclaimer-alert {
  display: flex;
  align-items: flex-start;
  margin-top: 8rpx;
}
.icon-alert {
  width: 32rpx;
  height: 32rpx;
  margin-right: 8rpx;
  flex-shrink: 0;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2395A5A6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'/%3E%3Cpath d='M12 9v4'/%3E%3Cpath d='M12 17h.01'/%3E%3C/svg%3E");
}
.disclaimer-text {
  font-size: 20rpx;
  color: #BDC3C7;
  text-align: left;
  line-height: 1.5;
}
.disclaimer-text.bold {
  font-weight: 600;
  color: #95A5A6;
}
</style>
