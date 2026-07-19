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

    <!-- 血糖曲线图占位 -->
    <view class="chart-card card">
      <view class="card-header">
        <text class="card-title">近期血糖</text>
        <text class="more">查看图表 ></text>
      </view>
      <view class="chart-placeholder">
        <text class="chart-empty-text">📈 ECharts 曲线模块准备中</text>
      </view>
    </view>

    <!-- 最近记录 -->
    <view class="history-card card">
      <view class="card-header">
        <text class="card-title">最近记录</text>
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
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'

// 模拟猫咪数据
const catInfo = ref({
  name: '小煤球',
  age: 6,
  daysSinceDiagnosis: 142,
  targetMin: 5.0,
  targetMax: 15.0
})

// 模拟近期数据
const recentRecords = ref([
  { time: '08:00', status: '空腹', value: 8.5 },
  { time: '昨天 20:00', status: '餐后2h', value: 16.2 },
  { time: '昨天 08:00', status: '空腹', value: 4.8 },
])

const handleLogGlucose = () => {
  uni.showToast({ title: '准备开发: 录入血糖', icon: 'none' })
}

const handleLogInsulin = () => {
  uni.showToast({ title: '准备开发: 录入打针', icon: 'none' })
}

const goToHistory = () => {
  uni.showToast({ title: '准备开发: 历史记录', icon: 'none' })
}

const getGlucoseClass = (val: number) => {
  if (val < catInfo.value.targetMin) return 'text-warning'
  if (val > catInfo.value.targetMax) return 'text-danger'
  return 'text-safe'
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
  height: 360rpx;
  background: #F8F9FA;
  border-radius: 16rpx;
  border: 2rpx dashed #E0E0E0;
  display: flex;
  justify-content: center;
  align-items: center;
}
.chart-empty-text {
  color: #BDBDBD;
  font-size: 28rpx;
  font-weight: 600;
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
</style>
