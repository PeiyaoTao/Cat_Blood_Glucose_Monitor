<template>
  <view class="container">
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

    <!-- 快捷记录卡片 -->
    <view class="action-card card">
      <view class="card-title">今日操作</view>
      <view class="btn-group">
        <button class="btn btn-primary log-btn" @click="handleLogGlucose">
          <view class="icon-svg icon-blood"></view> 记血糖
        </button>
        <button class="btn btn-secondary log-btn" @click="handleLogInsulin">
          <view class="icon-svg icon-syringe"></view> 记打针
        </button>
        <button class="btn btn-secondary log-btn" style="background-color: #E8F8F5; color: #1ABC9C;" @click="handleLogWeight">
          <view class="icon-svg icon-weight-sm"></view> 记体重
        </button>
      </view>
    </view>

    <!-- 图表展示 -->
    <view class="chart-card card">
      <view class="card-header">
        <view class="tabs">
          <text class="tab-item" :class="{ active: currentChartTab === 'glucose' }" @click="switchTab('glucose')">近期血糖</text>
          <text class="tab-item" :class="{ active: currentChartTab === 'weight' }" @click="switchTab('weight')">近期体重</text>
        </view>
      </view>
      <view class="chart-placeholder">
        <qiun-data-charts 
          type="line"
          canvasId="glucoseChart"
          :canvas2d="true"
          :opts="chartOpts"
          :chartData="chartData"
        />
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
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onShow, onLoad, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import qiunDataCharts from 'ch-ucharts/components/qiun-data-charts/qiun-data-charts.vue'
import { callApi } from '@/utils/api'

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
  const userInfoStr = uni.getStorageSync('userInfo')
  let openid = ''
  if (userInfoStr) {
    openid = JSON.parse(userInfoStr).openid || ''
  }
  
  return {
    title: '猫咪血糖监测日记',
    path: openid ? `/pages/index/index?inviter=${openid}` : '/pages/index/index'
  }
})

onShareTimeline(() => {
  const userInfoStr = uni.getStorageSync('userInfo')
  let openid = ''
  if (userInfoStr) {
    openid = JSON.parse(userInfoStr).openid || ''
  }
  
  return {
    title: '猫咪血糖监测日记',
    query: openid ? `inviter=${openid}` : ''
  }
})

const catInfo = ref({
  _id: '',
  avatar: '',
  name: '小煤球',
  age: 0 as number | null,
  daysSinceDiagnosis: 0,
  targetMin: 5.0,
  targetMax: 15.0,
  thresholdNormalMax: 7.0,
  thresholdDangerMin: 15.0
})
const allCats = ref<any[]>([])

const greetingText = computed(() => {
  const hour = new Date().getHours()
  if (hour < 12) return '早上好，铲屎官'
  if (hour < 18) return '下午好，铲屎官'
  return '晚上好，铲屎官'
})

const currentChartTab = ref('glucose')
const recentRecords = ref<any[]>([])
const recentInsulins = ref<any[]>([])
let rawGlucoseData: any[] = []
let rawWeightData: any[] = []
const chartData = ref({})
const chartOpts = ref({
  color: ["#F39C12"],
  padding: [15, 10, 0, 15],
  enableScroll: false,
  legend: { show: false },
  xAxis: {
    disableGrid: true,
  },
  yAxis: {
    gridType: "dash",
    dashLength: 2,
    data: [{ min: 0, max: 30 }]
  },
  extra: {
    line: {
      type: "curve",
      width: 2,
      activeType: "hollow"
    },
    markLine: {
      type: 'solid',
      dashLength: 4,
      data: []
    }
  }
})

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
        catInfo.value.age = ageNum > 0 ? ageNum : 0
      } else {
        catInfo.value.age = null
      }
      
      if (cat.diagnosis_date) {
        const dDate = new Date(cat.diagnosis_date)
        const today = new Date()
        const diffTime = Math.abs(today.getTime() - dDate.getTime())
        catInfo.value.daysSinceDiagnosis = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
      }
      
      if (cat.targetMin && cat.targetMax) {
        catInfo.value.targetMin = cat.targetMin
        catInfo.value.targetMax = cat.targetMax
      }
    } else {
      catInfo.value._id = ''
      allCats.value = []
    }
  } catch (err) {
    console.log('Error fetching cats via API', err)
  }
}

const fetchRecentRecords = async () => {
  if (!catInfo.value._id) return
  try {
    const res = await callApi('getRecords', { catId: catInfo.value._id, type: 'blood_glucose', limit: 15 })
    if (res.data) {
      recentRecords.value = res.data.slice(0, 4).map((item: any) => ({
        time: formatDisplayTime(item.createTime),
        status: item.status,
        value: item.bg_value
      }))
      rawGlucoseData = res.data
      if (currentChartTab.value === 'glucose') renderChart()
    }
  } catch (err) {
    console.error('获取最近记录失败', err)
  }
}

const fetchRecentWeights = async () => {
  if (!catInfo.value._id) return
  try {
    const res = await callApi('getRecords', { catId: catInfo.value._id, type: 'weight_records', limit: 15 })
    if (res.data) {
      rawWeightData = res.data
      if (currentChartTab.value === 'weight') renderChart()
    }
  } catch (err) {
    console.error('获取体重记录失败', err)
  }
}

const switchTab = (tab: string) => {
  currentChartTab.value = tab
  renderChart()
}

const renderChart = () => {
  // 必须深拷贝，否则 qiun-data-charts 组件不会监听到数据更新
  let newChartData = { categories: [] as string[], series: [] as any[] }
  let newOpts = JSON.parse(JSON.stringify(chartOpts.value))

  if (currentChartTab.value === 'glucose') {
    const chartItems = [...rawGlucoseData].reverse()
    const categories = chartItems.map(item => {
      const d = new Date(item.createTime)
      return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
    })
    const dataPoints = chartItems.map(item => item.bg_value)
    
    newChartData = {
      categories,
      series: [{ name: "血糖值", data: dataPoints }]
    }
    newOpts.yAxis.data = [{ min: 0, max: 30 }]
    newOpts.extra.markLine.data = [
      { value: catInfo.value.targetMin, color: '#2ECC71' },
      { value: catInfo.value.targetMax, color: '#E74C3C' }
    ]
  } else {
    const chartItems = [...rawWeightData].reverse()
    const categories = chartItems.map(item => {
      const d = new Date(item.record_date || item.createTime)
      const timeStr = item.measure_time ? ` ${item.measure_time}` : ''
      return `${d.getMonth()+1}/${d.getDate()}${timeStr}`
    })
    const dataPoints = chartItems.map(item => item.weight_value)
    
    newChartData = {
      categories,
      series: [{ name: "体重(kg)", data: dataPoints }]
    }
    const minW = dataPoints.length ? Math.floor(Math.min(...dataPoints) - 1) : 0
    const maxW = dataPoints.length ? Math.ceil(Math.max(...dataPoints) + 1) : 10
    newOpts.yAxis.data = [{ min: minW > 0 ? minW : 0, max: maxW }]
    newOpts.extra.markLine.data = []
  }

  chartData.value = JSON.parse(JSON.stringify(newChartData))
  chartOpts.value = newOpts
}

const fetchRecentInsulins = async () => {
  if (!catInfo.value._id) return
  try {
    const res = await callApi('getRecords', { catId: catInfo.value._id, type: 'insulin_records', limit: 4 })
    if (res.data) {
      recentInsulins.value = res.data.map((item: any) => {
        let displayTime = item.inject_time
        if (item.createTime) {
           const d = new Date(item.createTime)
           displayTime = `${d.getMonth()+1}/${d.getDate()} ${item.inject_time || ''}`
        }
        return {
          time: displayTime,
          type: item.insulin_type || '胰岛素',
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
    fetchRecentRecords()
    fetchRecentInsulins()
    fetchRecentWeights()
  }
}

onShow(() => {
  loadAllData()
})

const handleSwitchCat = () => {
  const itemList = allCats.value.map(c => c.name || '未命名')
  itemList.push('➕ 新增猫咪')
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

const handleLogWeight = () => {
  if (allCats.value.length === 0) { uni.showToast({ title: '请先添加猫咪', icon: 'none' }); return }
  uni.navigateTo({ url: '/pages/log-weight/index' })
}

const goToHistory = () => {
  uni.navigateTo({ url: '/pages/history/index' })
}

const getGlucoseClass = (val: number) => {
  if (val >= catInfo.value.thresholdDangerMin) {
    return 'text-danger' // 红色：>= 15.0 高危
  } else if (val > catInfo.value.thresholdNormalMax) {
    return 'text-warning' // 橙色：7.0 < val < 15.0 偏高
  } else if (val < 4.0) {
    return 'text-danger' // 红色：低血糖高危 (临床通用底线)
  }
  return 'text-safe' // 绿色：正常 (4.0 ~ 7.0)
}
</script>

<style scoped>
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

/* 操作区 */
.action-card .card-title {
  margin-bottom: 24rpx;
}
.btn-group {
  display: flex;
  justify-content: space-between;
  gap: 16rpx;
}
.log-btn {
  flex: 1;
  height: 88rpx;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 26rpx;
  padding: 0;
}
.icon-svg {
  width: 32rpx;
  height: 32rpx;
  margin-right: 8rpx;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-blood {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFFFFF' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'/%3E%3C/svg%3E");
}
.icon-syringe {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FF8A65' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 2 4 4'/%3E%3Cpath d='m17 7 3-3'/%3E%3Cpath d='M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5'/%3E%3Cpath d='m9 11 4 4'/%3E%3Cpath d='m5 19-3 3'/%3E%3Cpath d='m14 4 6 6'/%3E%3C/svg%3E");
}
.icon-weight-sm {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%231ABC9C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'/%3E%3Cline x1='7' y1='7' x2='7.01' y2='7'/%3E%3C/svg%3E");
}

/* 图表占位 */
.chart-placeholder {
  height: 450rpx;
  width: 100%;
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
  color: #F39C12;
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
