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
      :glucoseRecords="fullscreenGlucoseData"
      :weightRecords="fullscreenWeightData"
      :insulinRecords="fullscreenInsulinData"
      :mealRecords="fullscreenMealData"
      :excretionRecords="fullscreenExcretionData"
      :targetMin="catInfo.targetMin"
      :targetMax="catInfo.targetMax"
      @close="handleCloseFullscreen"
    />
  </view>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, getCurrentInstance, onUnmounted } from 'vue'
import { onShow, onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import FullscreenAnalysisModal from '@/components/FullscreenAnalysisModal.vue'
import { callApi, consumeDataDirty, daysSinceLocalDate } from '@/utils/api'
import {
  DEFAULT_TARGET_MIN,
  DEFAULT_TARGET_MAX,
  evaluateGlucoseStatus,
  normalizeTargetRange,
  calculateCatAge,
  compareRecordsChronological,
  compareRecordsDescending
} from '@/utils/glucoseDomain'
import {
  computeWeightScale,
  drawSelectionBeam,
  drawContinuousPolyline,
  drawClampedPointLabel,
  drawClampedXAxisLabel
} from '@/utils/chartRenderer'
import { useCatSession } from '@/composables/useCatSession'
import { useChartGestures } from '@/composables/useChartGestures'
import { checkAndSyncAutoFeeder } from '@/utils/feederSync'

const { allCats, currentCat, fetchCats, selectCat } = useCatSession()

onLoad(async (options: any) => {
  if (options && options.invite) {
    try {
      const res = await callApi('acceptInvite', { token: options.invite })
      if (!res.self) {
        uni.showToast({ title: '已加入家庭共享', icon: 'success' })
        loadAllData(true)
      }
    } catch (e: any) {
      console.log('绑定家庭共享失败', e)
      const msg = String(e?.message || '')
      uni.showModal({
        title: '邀请无法使用',
        content: msg.includes('EXPIRED') ? '该邀请已过期，请让家人重新发送邀请。' : '该邀请已失效，请让家人重新发送邀请。',
        showCancel: false
      })
    }
  } else if (options && options.inviter) {
    // 旧版邀请链接（裸 openid）已停用
    uni.showModal({
      title: '邀请已失效',
      content: '为保护猫咪健康数据安全，旧版邀请链接已停用，请让家人在「我的 - 家庭成员」中重新发送邀请。',
      showCancel: false
    })
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
  age: null as number | null,
  daysSinceDiagnosis: 0,
  diagnosisDays: 0,
  targetMin: DEFAULT_TARGET_MIN,
  targetMax: DEFAULT_TARGET_MAX,
  thresholdNormalMax: 7.0,
  thresholdDangerMin: DEFAULT_TARGET_MAX
})

const currentChartTab = ref<'glucose' | 'weight'>('glucose')
const recentRecords = ref<any[]>([])
const recentInsulins = ref<any[]>([])
const rawGlucoseData = ref<any[]>([])
const rawWeightData = ref<any[]>([])
const fullGlucoseData = ref<any[] | null>(null)
const fullWeightData = ref<any[] | null>(null)
const fullInsulinData = ref<any[]>([])
const fullMealData = ref<any[]>([])
const fullExcretionData = ref<any[]>([])
let fullDataLoadedCatId = ''
let fullDataLoadedAt = 0

const fullscreenGlucoseData = computed(() => fullGlucoseData.value || rawGlucoseData.value)
const fullscreenWeightData = computed(() => fullWeightData.value || rawWeightData.value)
const fullscreenInsulinData = computed(() => fullInsulinData.value)
const fullscreenMealData = computed(() => fullMealData.value)
const fullscreenExcretionData = computed(() => fullExcretionData.value)

const showFullscreenModal = ref(false)
const openFullscreen = async () => {
  showFullscreenModal.value = true
  const catId = catInfo.value._id
  if (!catId) return

  // 若当前猫咪尚未拉取全量分析数据，按需后台补齐供日内曲线/多维事件叠加及趋势分析使用
  const needsFullFetch = fullDataLoadedCatId !== catId || fullDataLoadedAt < lastLoadedAt
  if (needsFullFetch) {
    fullDataLoadedCatId = catId
    fullDataLoadedAt = lastLoadedAt
    try {
      const tasks: Promise<any>[] = []
      if (rawGlucoseData.value.length >= 30) {
        tasks.push(
          callApi('getRecords', { catId, type: 'blood_glucose', limit: 1000 }).then(res => {
            if (res.data) fullGlucoseData.value = res.data
          })
        )
      } else {
        fullGlucoseData.value = rawGlucoseData.value
      }
      if (rawWeightData.value.length >= 30) {
        tasks.push(
          callApi('getRecords', { catId, type: 'weight_records', limit: 1000 }).then(res => {
            if (res.data) fullWeightData.value = res.data
          })
        )
      } else {
        fullWeightData.value = rawWeightData.value
      }
      tasks.push(
        callApi('getRecords', { catId, type: 'insulin_records', limit: 500 }).then(res => {
          if (res.data) fullInsulinData.value = res.data
        }),
        callApi('getRecords', { catId, type: 'meal_records', limit: 500 }).then(res => {
          if (res.data) fullMealData.value = res.data
        }),
        callApi('getRecords', { catId, type: 'excretion_records', limit: 500 }).then(res => {
          if (res.data) fullExcretionData.value = res.data
        })
      )
      if (tasks.length > 0) await Promise.all(tasks)
    } catch (e) {
      console.warn('获取全屏趋势全量记录提示:', e)
    }
  }
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
  return evaluateGlucoseStatus(bg, catInfo.value.targetMin, catInfo.value.targetMax)
}

// 统一当前展示的数据切片列表
const currentChartItems = computed<Array<{
  id: any
  date: string
  dayNum: string
  time: string
  value: number
  status: string
  color: string
  textColor: string
  badgeClass: string
  statusText: string
}>>(() => {
  if (currentChartTab.value === 'glucose') {
    const chartItems = [...rawGlucoseData.value].sort((a, b) => compareRecordsChronological(a, b, 'measure_time'))
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
    const chartItems = [...rawWeightData.value].sort((a, b) => compareRecordsChronological(a, b, 'measure_time'))
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
  gestures.stopAnimation()
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
  if (gestures.wasTouchedRecently(400)) {
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

// 图表手势引擎（与全屏分析弹窗共用，见 composables/useChartGestures.ts）
const gestures = useChartGestures({
  zoomCount: currentZoomCount,
  selectedIndex: selectedPointIndex,
  getScrollX: () => scrollX,
  setScrollX: (x: number) => { scrollX = x },
  getItemCount: () => currentChartItems.value.length,
  getPlotMetrics,
  getMinScrollX,
  getBoxLeft,
  getZoomLimits: () => ({ min: 3, max: Math.max(15, Math.max(3, currentChartItems.value.length)) }),
  redraw: () => drawMainChart(),
  onZoomLimit: (type, limit) => {
    triggerZoomLimitAnimation(type, type === 'in' ? `已放大至最大视图 (${limit}项)` : `已缩小至全景视图 (${limit}项)`)
  },
  onEdgeLimit: (dir) => {
    triggerEdgeLimitAnimation(dir, dir === 'left' ? '已至最早记录' : '已至最新记录')
  },
  hitRadiusMin: 24,
  pinchLimitThreshold: 30,
  edgeThreshold: 20
})

const handleChartTouchStart = gestures.onTouchStart
const handleChartTouchMove = gestures.onTouchMove
const handleChartTouchEnd = gestures.onTouchEnd
const handleChartTouchCancel = gestures.onTouchCancel

onUnmounted(() => {
  gestures.dispose()
  if (toastTimer) clearTimeout(toastTimer)
})

// Canvas 2D 初始化
const initMainCanvas = (callback?: () => void) => {
  const query = uni.createSelectorQuery().in(instance?.proxy || instance)
  query.select('#mainChartCanvas').fields({ node: true, size: true, rect: true }, () => {})
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

const fetchCatProfile = async (force: boolean = false) => {
  try {
    await fetchCats(force)
    const cat = currentCat.value
    if (cat) {
      catInfo.value._id = cat._id
      catInfo.value.name = cat.name || '未命名'
      catInfo.value.avatar = cat.avatar || ''
      catInfo.value.age = calculateCatAge(cat.birthday)
      catInfo.value.daysSinceDiagnosis = cat.diagnosis_date ? daysSinceLocalDate(cat.diagnosis_date) : 0

      const { min, max } = normalizeTargetRange(cat.targetMin, cat.targetMax)
      catInfo.value.targetMin = min
      catInfo.value.targetMax = max
      catInfo.value.thresholdDangerMin = max
      catInfo.value.thresholdNormalMax = max
    } else {
      catInfo.value._id = ''
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
      const sortedDesc = [...res.data].sort((a, b) => compareRecordsDescending(a, b, 'measure_time'))
      recentRecords.value = sortedDesc.slice(0, 4).map((item: any) => {
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
      rawGlucoseData.value = sortedDesc
      fullGlucoseData.value = null
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
      const sortedDesc = [...res.data].sort((a, b) => compareRecordsDescending(a, b, 'measure_time'))
      rawWeightData.value = sortedDesc
      fullWeightData.value = null
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
    const { min: targetMin, max: targetMax } = normalizeTargetRange(catInfo.value.targetMin, catInfo.value.targetMax)

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
      drawSelectionBeam(ctx, selX, topY, bottomY, 28)
    }

    // 折线
    const validPoints: { x: number, y: number }[] = []
    items.forEach((item, i) => {
      if (item.value !== null && typeof item.value === 'number' && item.value > 0) {
        const x = padLeft + i * spacing + scrollX
        validPoints.push({ x, y: getY(item.value) })
      }
    })

    drawContinuousPolyline(ctx, validPoints, '#64748B', 2.2)

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
          drawClampedPointLabel(
            ctx,
            item.value.toFixed(1),
            x,
            Math.max(16, y - 7),
            padLeft,
            padRight,
            mainCanvasWidth,
            meta.color,
            'bold 11px sans-serif'
          )
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
        drawClampedXAxisLabel(
          ctx,
          item.dayNum,
          x,
          bottomY + 16,
          padLeft,
          mainCanvasWidth,
          isCur ? '#0F172A' : '#64748B',
          isCur ? 'bold 11px sans-serif' : '10px sans-serif'
        )
      }
    })
  } else {
    // 体重图表渲染 (解决压顶问题，支持充足呼吸余量与网格)
    const validWts = items
      .filter(i => typeof i.value === 'number' && i.value > 0)
      .map(i => i.value as number)

    const { minWeight, maxWeight, midWeight, getY: calcWtY } = computeWeightScale(validWts)
    const getY = (wt: number) => calcWtY(wt, topY, bottomY)

    // 1. 固定网格与 Y 轴刻度
    ctx.lineWidth = 1
    ctx.setLineDash([3, 3])
    ctx.strokeStyle = '#E2E8F0'

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
      drawSelectionBeam(ctx, selX, topY, bottomY, 28)
    }

    // 绘制体重蓝色折线
    const validPoints: { x: number, y: number }[] = []
    items.forEach((item, i) => {
      if (item.value !== null && typeof item.value === 'number' && item.value > 0) {
        const x = padLeft + i * spacing + scrollX
        validPoints.push({ x, y: getY(item.value) })
      }
    })

    drawContinuousPolyline(ctx, validPoints, '#3B82F6', 2.2)

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
          drawClampedPointLabel(
            ctx,
            item.value.toFixed(2),
            x,
            Math.max(16, y - 7),
            padLeft,
            padRight,
            mainCanvasWidth,
            '#2563EB',
            'bold 11px sans-serif'
          )
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
        drawClampedXAxisLabel(
          ctx,
          item.dayNum,
          x,
          bottomY + 16,
          padLeft,
          mainCanvasWidth,
          isCur ? '#0F172A' : '#64748B',
          isCur ? 'bold 11px sans-serif' : '10px sans-serif'
        )
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

// 首页数据缓存策略：仅在数据变更 / 切换猫咪 / 超过 5 分钟时才重新拉取，避免每次返回首页都发起 5+ 次云函数调用
const DATA_STALE_MS = 5 * 60 * 1000
let lastLoadedAt = 0
let lastLoadedCatId = ''

const loadAllData = async (force: boolean = false) => {
  const dirty = consumeDataDirty()
  const storedCatId = uni.getStorageSync('currentCatId') || ''
  const isFresh = Date.now() - lastLoadedAt < DATA_STALE_MS
  if (!force && !dirty && isFresh && storedCatId === lastLoadedCatId) {
    return
  }
  lastLoadedAt = Date.now()

  await fetchCatProfile(force || dirty)
  lastLoadedCatId = catInfo.value._id
  if (catInfo.value._id) {
    // 异步后台静默执行自动喂食机对齐补录（云端幂等），不阻塞核心健康数据拉取
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
        uni.navigateTo({ url: '/packageUser/cat-profile/index' })
      } else {
        const selectedCat = allCats.value[res.tapIndex]
        selectCat(selectedCat._id)
        loadAllData(true)
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
  return evaluateGlucoseStatus(Number(val), catInfo.value.targetMin, catInfo.value.targetMax).homeTextClass
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
