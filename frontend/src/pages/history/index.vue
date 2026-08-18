<template>
  <view class="container">
    <!-- 顶部 Tabs (5项) -->
    <view class="tabs">
      <view class="tab-item" :class="{ active: currentTab === 0 }" @click="switchTab(0)">血糖记录</view>
      <view class="tab-item" :class="{ active: currentTab === 1 }" @click="switchTab(1)">打针记录</view>
      <view class="tab-item" :class="{ active: currentTab === 2 }" @click="switchTab(2)">饮食记录</view>
      <view class="tab-item" :class="{ active: currentTab === 3 }" @click="switchTab(3)">排泄记录</view>
      <view class="tab-item" :class="{ active: currentTab === 4 }" @click="switchTab(4)">体重记录</view>
    </view>

    <!-- 列表区 -->
    <scroll-view class="list-container" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="isRefreshing">
      <view class="record-list" v-if="records.length > 0">
        <view class="record-card" v-for="(item, index) in records" :key="item._id" @longpress="onLongPress(item._id)">
          
          <view class="card-left">
            <view class="date-time">
              <text class="date">{{ formatDate(item.record_date || item.createTime) }}</text>
              <text class="time">{{ currentTab === 0 ? item.measure_time : (currentTab === 1 ? item.inject_time : (currentTab === 2 ? item.meal_time : (currentTab === 3 ? (item.record_time || item.measure_time) : (item.measure_time || '')))) }}</text>
            </view>
            <view class="tags-row">
              <text class="status-tag" v-if="currentTab === 0">{{ item.period || item.status || '常规' }}</text>
              <template v-else-if="currentTab === 1">
                <text class="status-tag">{{ item.period || '注射' }}</text>
                <text class="status-tag tag-secondary" v-if="item.dose_adjustment && item.dose_adjustment !== '维持原量'">{{ item.dose_adjustment }}</text>
                <text class="status-tag tag-type">{{ item.insulin_type }}</text>
              </template>
              <template v-else-if="currentTab === 2">
                <text class="status-tag tag-meal">{{ item.period || '进食' }}</text>
              </template>
              <template v-else-if="currentTab === 3">
                <text class="status-tag tag-excretion">{{ item.urine || '排尿正常' }}</text>
                <text class="status-tag tag-secondary" v-if="item.stool_status">{{ item.stool_status }}</text>
              </template>
              <text class="status-tag" v-else>称重</text>
            </view>
            
            <!-- 详细饮食与辅助信息 -->
            <view class="extra-info" v-if="currentTab === 2">
              <view class="extra-row" v-if="item.food_brand">
                <text class="extra-label">罐头</text>
                <text class="extra-content">{{ item.food_brand }}</text>
              </view>
              <view class="extra-row" v-if="item.extras">
                <text class="extra-label">附带</text>
                <text class="extra-content">{{ item.extras }}</text>
              </view>
              <view class="extra-row" v-if="item.urine">
                <text class="extra-label">尿量</text>
                <text class="extra-content">{{ item.urine }}</text>
              </view>
            </view>

            <!-- 排泄细节 (Tab 3) -->
            <view class="extra-info" v-if="currentTab === 3">
              <view class="extra-row" v-if="item.stool_color">
                <text class="extra-label">颜色</text>
                <text class="extra-content">{{ item.stool_color }}</text>
              </view>
            </view>

            <text class="note-text" v-if="item.note">{{ item.note }}</text>
          </view>
          
          <view class="card-right">
            <view class="value-wrap">
              <template v-if="currentTab === 0">
                <text class="value-text" :class="getBgColorClass(item.bg_value)">{{ item.bg_value }}</text>
                <text class="unit">mmol/L</text>
              </template>
              <template v-else-if="currentTab === 1">
                <text class="value-text type-insulin">{{ item.dose }}</text>
                <text class="unit">U</text>
              </template>
              <template v-else-if="currentTab === 2">
                <text class="value-text type-meal">{{ item.food_grams }}</text>
                <text class="unit">g</text>
              </template>
              <template v-else-if="currentTab === 3">
                <text class="value-text type-excretion">{{ item.stool_status ? '已排便' : '护理' }}</text>
              </template>
              <template v-else>
                <text class="value-text type-weight">{{ item.weight_value }}</text>
                <text class="unit">kg</text>
              </template>
            </view>
            <view class="action-wrap">
              <view class="delete-btn" @click.stop="onLongPress(item._id)">
                <view class="icon-trash"></view> <text>删除</text>
              </view>
            </view>
          </view>
          
        </view>
      </view>
      
      <!-- 空状态 -->
      <view class="empty-state" v-if="records.length === 0 && !isLoading">
        <text class="empty-text">暂无历史记录</text>
      </view>
      
      <!-- 加载中 -->
      <view class="loading-state" v-if="isLoading">
        <text class="loading-text">加载中...</text>
      </view>
      <view class="loading-state" v-if="!hasMore && records.length > 0">
        <text class="loading-text">没有更多记录了</text>
      </view>
    </scroll-view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad, onShow, onShareAppMessage, onShareTimeline } from '@dcloudio/uni-app'
import { callApi } from '@/utils/api'

const currentTab = ref(0) // 0: 血糖, 1: 打针, 2: 饮食, 3: 排泄, 4: 体重
const records = ref<any[]>([])
const isLoading = ref(false)
const isRefreshing = ref(false)
const hasMore = ref(true)

const PAGE_SIZE = 20

const getCollectionName = () => {
  if (currentTab.value === 0) return 'blood_glucose'
  if (currentTab.value === 1) return 'insulin_records'
  if (currentTab.value === 2) return 'meal_records'
  if (currentTab.value === 3) return 'excretion_records'
  return 'weight_records'
}

const targetMin = ref(4.0)
const targetMax = ref(15.0)

const fetchCatTarget = async () => {
  try {
    const res = await callApi('getCats')
    if (res.data && res.data.length > 0) {
      const currentCatId = uni.getStorageSync('currentCatId')
      let cat = res.data.find((c: any) => c._id === currentCatId)
      if (!cat) cat = res.data[0]
      if (cat) {
        if (cat.targetMin !== undefined && !isNaN(Number(cat.targetMin))) {
          targetMin.value = Number(cat.targetMin)
        }
        if (cat.targetMax !== undefined && !isNaN(Number(cat.targetMax))) {
          targetMax.value = Number(cat.targetMax)
        }
      }
    }
  } catch (e) {
    console.error('获取猫咪控糖目标失败', e)
  }
}

onLoad(() => {
  fetchCatTarget()
  loadData(true)
})

onShow(() => {
  fetchCatTarget()
  if (records.value.length > 0) {
    loadData(true)
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

const switchTab = (index: number) => {
  if (currentTab.value === index) return
  currentTab.value = index
  loadData(true)
}

const onRefresh = async () => {
  isRefreshing.value = true
  await fetchCatTarget()
  await loadData(true)
  isRefreshing.value = false
}

const loadMore = () => {
  if (hasMore.value && !isLoading.value) {
    loadData(false)
  }
}

const loadData = async (isReset: boolean) => {
  if (isLoading.value) return
  isLoading.value = true

  if (isReset) {
    records.value = []
    hasMore.value = true
  }

  try {
    const catId = uni.getStorageSync('currentCatId') || 'default'
    const collectionName = getCollectionName()
    
    const res = await callApi('getRecords', {
      catId,
      type: collectionName,
      limit: PAGE_SIZE,
      skip: records.value.length
    })
      
    if (res.data.length < PAGE_SIZE) {
      hasMore.value = false
    }
    
    records.value = [...records.value, ...res.data]
  } catch (e) {
    console.error('获取记录失败', e)
    uni.showToast({ title: '加载失败', icon: 'none' })
  } finally {
    isLoading.value = false
  }
}

const onLongPress = (id: string) => {
  uni.showModal({
    title: '操作',
    content: '确认删除这条记录吗？',
    success: async (res) => {
      if (res.confirm) {
        await deleteRecord(id)
      }
    }
  })
}

const deleteRecord = async (id: string) => {
  uni.showLoading({ title: '删除中' })
  try {
    const catId = uni.getStorageSync('currentCatId') || 'default'
    const collectionName = getCollectionName()
    
    await callApi('deleteRecord', {
      catId,
      type: collectionName,
      recordId: id
    })
    
    uni.showToast({ title: '删除成功', icon: 'success' })
    // 从列表中移除
    records.value = records.value.filter(item => item._id !== id)
  } catch (err) {
    console.error(err)
    uni.showToast({ title: '删除失败', icon: 'none' })
  } finally {
    uni.hideLoading()
  }
}

const formatDate = (dateVal: any) => {
  if (!dateVal) return '未知日期'
  if (typeof dateVal === 'string' && dateVal.includes('-') && dateVal.length === 10) {
    const [_, m, d] = dateVal.split('-')
    return `${parseInt(m)}月${parseInt(d)}日`
  }
  let d: Date
  if (dateVal instanceof Date) {
    d = dateVal
  } else if (typeof dateVal === 'number') {
    d = new Date(dateVal)
  } else if (typeof dateVal === 'string') {
    d = new Date(dateVal.replace(/-/g, '/'))
  } else {
    return '未知日期'
  }
  return `${d.getMonth()+1}月${d.getDate()}日`
}

const getBgColorClass = (value: number) => {
  const min = targetMin.value
  const max = targetMax.value
  const warningMax = max * 1.3 // 动态超标 30% 缓冲阈值

  if (value < min) return 'text-danger' // 🔴 红色: 低于自定义目标下限 (低血糖急症)
  if (value <= max) return 'text-normal' // 🟢 绿色: 落在自定义安全目标区间 [targetMin, targetMax] 内
  if (value <= warningMax) return 'text-warning' // 🟡 黄色: 超出目标上限 30% 以内 (轻中度偏高，需观察)
  return 'text-danger' // 🔴 红色: 超出目标上限 30% 以上 (严重高血糖预警)
}
</script>

<style scoped>
.container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
}
.tabs {
  display: flex;
  background: #FFFFFF;
  padding: 0 32rpx;
  border-bottom: 2rpx solid #F0F2F5;
  flex-shrink: 0;
}
.tab-item {
  flex: 1;
  text-align: center;
  padding: 32rpx 0;
  font-size: 30rpx;
  color: var(--text-sub);
  position: relative;
}
.tab-item.active {
  color: var(--primary);
  font-weight: 700;
}
.tab-item.active::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translateX(-50%);
  width: 40rpx;
  height: 6rpx;
  background: var(--primary);
  border-radius: 4rpx;
}
.list-container {
  flex: 1;
  overflow: hidden;
}
.record-list {
  padding: 32rpx;
}
.record-card {
  background: #FFFFFF;
  border-radius: 20rpx;
  padding: 32rpx;
  margin-bottom: 24rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
}
.card-left {
  flex: 1;
  padding-right: 20rpx;
}
.date-time {
  margin-bottom: 12rpx;
  display: flex;
  align-items: center;
  gap: 16rpx;
}
.date {
  font-size: 28rpx;
  color: var(--text-main);
  font-weight: 600;
}
.time {
  font-size: 26rpx;
  color: var(--text-sub);
}
.tags-row {
  margin-bottom: 12rpx;
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}
.status-tag {
  display: inline-block;
  padding: 4rpx 16rpx;
  background: #E8F8F5;
  color: #16A085;
  font-size: 22rpx;
  border-radius: 8rpx;
  font-weight: 500;
}
.tag-secondary {
  background: #FEF9E7;
  color: #D4AC0D;
}
.tag-type {
  background: #EBF5FB;
  color: #2980B9;
}
.tag-meal {
  background: #FEF5E7;
  color: #D35400;
}
.tag-excretion {
  background: #E8F8F5;
  color: #16A085;
}
.type-meal { color: #E67E22; }
.type-excretion { color: #16A085; font-size: 28rpx; }
.extra-info {
  margin-bottom: 8rpx;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}
.extra-row {
  display: flex;
  align-items: center;
  gap: 10rpx;
  font-size: 24rpx;
}
.extra-label {
  font-size: 20rpx;
  color: #7F8C8D;
  background: #F2F4F4;
  padding: 2rpx 10rpx;
  border-radius: 6rpx;
  font-weight: 500;
  flex-shrink: 0;
}
.extra-content {
  color: var(--text-main);
  font-size: 24rpx;
  font-weight: 500;
}
.note-text {
  font-size: 24rpx;
  color: #95A5A6;
  display: block;
}
.card-right {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
}
.value-wrap {
  margin-bottom: 24rpx;
  text-align: right;
}
.action-wrap {
  margin-top: auto;
}
.delete-btn {
  display: flex;
  align-items: center;
  font-size: 24rpx;
  color: #E74C3C;
  background: #FDEDEC;
  padding: 8rpx 16rpx;
  border-radius: 8rpx;
}
.icon-trash {
  width: 24rpx;
  height: 24rpx;
  margin-right: 8rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23E74C3C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h18'/%3E%3Cpath d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6'/%3E%3Cpath d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'/%3E%3C/svg%3E");
  background-size: contain;
  background-repeat: no-repeat;
}
.value-text {
  font-size: 48rpx;
  font-weight: 800;
}
.unit {
  font-size: 24rpx;
  color: var(--text-sub);
  margin-left: 8rpx;
}
.text-normal { color: #2ECC71; }
.text-danger { color: #E74C3C; }
.text-warning { color: #F1C40F; }
.type-insulin { color: #3498DB; }
.type-weight { color: #8E44AD; }

.empty-state {
  padding: 100rpx 0;
  text-align: center;
}
.empty-text {
  font-size: 28rpx;
  color: #BDC3C7;
}
.loading-state {
  text-align: center;
  padding: 20rpx 0 40rpx;
}
.loading-text {
  font-size: 24rpx;
  color: #BDC3C7;
}
</style>
