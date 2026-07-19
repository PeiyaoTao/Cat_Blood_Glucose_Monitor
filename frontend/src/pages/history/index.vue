<template>
  <view class="container">
    <!-- 顶部 Tabs -->
    <view class="tabs">
      <view class="tab-item" :class="{ active: currentTab === 0 }" @click="switchTab(0)">血糖记录</view>
      <view class="tab-item" :class="{ active: currentTab === 1 }" @click="switchTab(1)">打针记录</view>
    </view>

    <!-- 列表区 -->
    <scroll-view class="list-container" scroll-y @scrolltolower="loadMore" refresher-enabled @refresherrefresh="onRefresh" :refresher-triggered="isRefreshing">
      <view class="record-list" v-if="records.length > 0">
        <view class="record-card" v-for="(item, index) in records" :key="item._id" @longpress="onLongPress(item._id)">
          
          <view class="card-left">
            <view class="date-time">
              <text class="date">{{ formatDate(item.createTime) }}</text>
              <text class="time">{{ currentTab === 0 ? item.measure_time : item.inject_time }}</text>
            </view>
            <view class="tags-row">
              <text class="status-tag">{{ currentTab === 0 ? item.status : item.insulin_type }}</text>
            </view>
            <text class="note-text" v-if="item.note">{{ item.note }}</text>
          </view>
          
          <view class="card-right">
            <view class="value-wrap">
              <template v-if="currentTab === 0">
                <text class="value-text" :class="getBgColorClass(item.bg_value)">{{ item.bg_value }}</text>
                <text class="unit">mmol/L</text>
              </template>
              <template v-else>
                <text class="value-text type-insulin">{{ item.dose }}</text>
                <text class="unit">U</text>
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
import { onLoad, onShow } from '@dcloudio/uni-app'

const currentTab = ref(0) // 0: 血糖, 1: 打针
const records = ref<any[]>([])
const isLoading = ref(false)
const isRefreshing = ref(false)
const hasMore = ref(true)

const PAGE_SIZE = 20

onLoad(() => {
  loadData(true)
})

onShow(() => {
  if (records.value.length > 0) {
    loadData(true)
  }
})

const switchTab = (index: number) => {
  if (currentTab.value === index) return
  currentTab.value = index
  loadData(true)
}

const onRefresh = async () => {
  isRefreshing.value = true
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
    // @ts-ignore
    if (typeof wx === 'undefined' || !wx.cloud) return
    // @ts-ignore
    const db = wx.cloud.database()
    const catId = uni.getStorageSync('currentCatId') || 'default'
    
    const collectionName = currentTab.value === 0 ? 'blood_glucose' : 'insulin_records'
    
    const res = await db.collection(collectionName)
      .where({ cat_id: catId })
      .orderBy('createTime', 'desc')
      .skip(records.value.length)
      .limit(PAGE_SIZE)
      .get()
      
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
    // @ts-ignore
    const db = wx.cloud.database()
    const collectionName = currentTab.value === 0 ? 'blood_glucose' : 'insulin_records'
    
    await db.collection(collectionName).doc(id).remove()
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

const formatDate = (dateObj: any) => {
  if (!dateObj) return '未知日期'
  let d: Date
  // Handle if WeChat SDK returns an object with a timestamp or a Date
  if (dateObj instanceof Date) {
    d = dateObj
  } else if (typeof dateObj === 'number' || typeof dateObj === 'string') {
    d = new Date(dateObj)
  } else {
    return '未知日期'
  }
  return `${d.getMonth()+1}月${d.getDate()}日`
}

const getBgColorClass = (value: number) => {
  if (value < 4.0) return 'text-danger'
  if (value > 15.0) return 'text-warning'
  return 'text-normal'
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
}
.status-tag {
  display: inline-block;
  padding: 4rpx 16rpx;
  background: #F7F9FC;
  color: #7F8C8D;
  font-size: 22rpx;
  border-radius: 8rpx;
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
