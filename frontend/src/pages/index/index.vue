<template>
  <view class="container">
    <!-- 头部：猫咪档案概览 -->
    <view class="header">
      <view class="avatar-wrap">
        <image class="avatar" src="https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=FFDAB9" mode="aspectFill"></image>
      </view>
      <view class="info">
        <text class="greeting">早安，主人</text>
        <view class="name-row">
          <text class="name">{{ catInfo.name }}</text>
          <text class="tag">{{ catInfo.age }}岁</text>
        </view>
        <text class="desc">确诊 {{ catInfo.daysSinceDiagnosis }} 天 · 目标范围 {{ catInfo.targetMin }}~{{ catInfo.targetMax }}</text>
      </view>
    </view>

    <!-- 快捷记录卡片 -->
    <view class="action-card card">
      <view class="card-title">今日操作</view>
      <view class="btn-group">
        <button class="btn btn-primary log-btn" @click="handleLogGlucose">
          <text class="icon">🩸</text> 记血糖
        </button>
        <button class="btn btn-secondary log-btn" @click="handleLogInsulin">
          <text class="icon">💉</text> 记打针
        </button>
      </view>
    </view>

    <!-- 图表展示 -->
    <view class="chart-card card">
      <view class="card-header">
        <text class="title">近期血糖曲线</text>
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
        <text class="more" @click="goToHistory">全部 ></text>
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
        <text class="more" @click="goToHistory">全部 ></text>
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
      <text class="disclaimer-text bold">⚠️ 免责声明：本程序仅供数据追踪与辅助记录，不构成医疗诊断建议。任何胰岛素剂量的调整，请务必遵从主治兽医的医嘱。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import qiunDataCharts from 'ch-ucharts/components/qiun-data-charts/qiun-data-charts.vue'

// 猫咪预设标准 (根据 CVMA 195-2024)
const catInfo = ref({
  name: '小煤球',
  age: 6,
  daysSinceDiagnosis: 142,
  targetMin: 5.0,
  targetMax: 15.0,
  // 警戒阈值
  thresholdNormalMax: 7.0, // <= 7.0 为正常空腹/随机血糖上限
  thresholdDangerMin: 15.0 // >= 15.0 属于极高危(诊断标准 5.1.2 d)
})

const recentRecords = ref<any[]>([])
const recentInsulins = ref<any[]>([])
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
      data: [
        { value: catInfo.value.thresholdNormalMax, color: '#2ECC71' },
        { value: catInfo.value.thresholdDangerMin, color: '#E74C3C' }
      ]
    }
  }
})

const fetchRecentRecords = async () => {
  // @ts-ignore
  if (typeof wx === 'undefined' || !wx.cloud) return
  
  try {
    // @ts-ignore
    const db = wx.cloud.database()
    const res = await db.collection('blood_glucose')
      .orderBy('createTime', 'desc')
      .limit(15)
      .get()
      
    if (res.data) {
      recentRecords.value = res.data.slice(0, 4).map((item: any) => ({
        time: formatDisplayTime(item.createTime),
        status: item.status,
        value: item.bg_value
      }))
      
      const chartItems = [...res.data].reverse()
      const categories = chartItems.map(item => {
        const d = new Date(item.createTime)
        return `${d.getMonth()+1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
      })
      const dataPoints = chartItems.map(item => item.bg_value)
      
      chartData.value = {
        categories,
        series: [{ name: "血糖值", data: dataPoints }]
      }
    }
  } catch (err) {
    console.error('获取最近记录失败', err)
  }
}

const fetchRecentInsulins = async () => {
  // @ts-ignore
  if (typeof wx === 'undefined' || !wx.cloud) return
  try {
    // @ts-ignore
    const db = wx.cloud.database()
    const res = await db.collection('insulin_records')
      .orderBy('createTime', 'desc')
      .limit(4)
      .get()
      
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

onShow(() => {
  fetchRecentRecords()
  fetchRecentInsulins()
})

const handleLogGlucose = () => {
  uni.navigateTo({
    url: '/pages/log/index'
  })
}

const handleLogInsulin = () => {
  uni.navigateTo({
    url: '/pages/log-insulin/index'
  })
}

const goToHistory = () => {
  uni.showToast({ title: '准备开发: 历史记录', icon: 'none' })
}

const getGlucoseClass = (val: number) => {
  // 根据 T/CVMA 195—2024 标准：
  // 正常猫咪血糖应 <= 7.0 mmol/L
  // > 7.0 且 < 15.0 属于临界升高 (5.1.2 e)
  // >= 15.0 属于高血糖确诊指标 (5.1.2 d)
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
  margin-right: 16rpx;
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
  gap: 24rpx;
}
.log-btn {
  flex: 1;
  height: 96rpx;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}
.icon {
  margin-right: 12rpx;
  font-size: 36rpx;
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
.disclaimer-text {
  font-size: 20rpx;
  color: #BDC3C7;
  text-align: center;
  line-height: 1.5;
}
.disclaimer-text.bold {
  font-weight: 600;
  color: #95A5A6;
}
</style>
