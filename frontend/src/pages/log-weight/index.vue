<template>
  <view class="container">
    <view class="header">
      <view class="icon-svg icon-weight"></view>
      <text class="title">记录体重</text>
    </view>

    <view class="form-card">
      <view class="input-group">
        <text class="label">当前体重 (kg)</text>
        <view class="value-input-wrap">
          <input 
            class="value-input" 
            type="digit" 
            v-model="weightValue"
            placeholder="0.0"
            focus
          />
          <text class="unit">kg</text>
        </view>
      </view>

      <view class="input-group">
        <text class="label">称重日期</text>
        <picker mode="date" :value="recordDate" @change="onDateChange">
          <view class="picker-view">
            {{ recordDate || '请选择日期' }}
            <text class="arrow">▼</text>
          </view>
        </picker>
      </view>

      <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitLog">
        保存记录
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const weightValue = ref('')
const isSubmitting = ref(false)

// 默认日期为今天
const today = new Date()
const pad = (n: number) => n.toString().padStart(2, '0')
const recordDate = ref(`${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`)

const onDateChange = (e: any) => {
  recordDate.value = e.detail.value
}

const submitLog = async () => {
  if (!weightValue.value || parseFloat(weightValue.value) <= 0) {
    uni.showToast({ title: '请输入有效的体重数值', icon: 'none' })
    return
  }

  isSubmitting.value = true
  try {
    const currentCatId = uni.getStorageSync('currentCatId')
    // @ts-ignore
    const db = wx.cloud.database()
    
    await db.collection('weight_records').add({
      data: {
        cat_id: currentCatId,
        weight_value: parseFloat(weightValue.value),
        record_date: recordDate.value,
        createTime: db.serverDate()
      }
    })
    
    uni.showToast({ title: '记录成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  } catch (err: any) {
    console.error(err)
    if (err.message && err.message.includes('not exist')) {
      uni.showToast({ title: '请先在云端创建 weight_records 集合！', icon: 'none', duration: 4000 })
    } else {
      uni.showToast({ title: '记录失败', icon: 'none' })
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.container {
  padding: 32rpx;
  min-height: 100vh;
  background-color: var(--bg-color);
}
.header {
  display: flex;
  align-items: center;
  margin-bottom: 60rpx;
  margin-top: 20rpx;
}
.icon-svg {
  width: 56rpx;
  height: 56rpx;
  margin-right: 16rpx;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-weight {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233498DB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'/%3E%3Cline x1='7' y1='7' x2='7.01' y2='7'/%3E%3C/svg%3E");
}
.title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text-main);
}
.form-card {
  background: #FFFFFF;
  border-radius: 32rpx;
  padding: 48rpx;
  box-shadow: 0 16rpx 48rpx rgba(0,0,0,0.04);
}
.input-group {
  margin-bottom: 48rpx;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 24rpx;
  display: block;
  font-weight: 500;
}
.value-input-wrap {
  display: flex;
  align-items: baseline;
  border-bottom: 4rpx solid #F0F0F0;
  padding-bottom: 16rpx;
  transition: all 0.3s;
}
.value-input-wrap:focus-within {
  border-bottom-color: var(--primary);
}
.value-input {
  flex: 1;
  font-size: 80rpx;
  font-weight: 800;
  color: var(--text-main);
  height: 100rpx;
}
.unit {
  font-size: 32rpx;
  color: var(--text-sub);
  margin-left: 16rpx;
  font-weight: 600;
}
.picker-view {
  background: #F8F9FA;
  padding: 24rpx 32rpx;
  border-radius: 16rpx;
  font-size: 32rpx;
  color: var(--text-main);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: 500;
}
.arrow {
  color: #BDC3C7;
  font-size: 24rpx;
}
.submit-btn {
  margin-top: 80rpx;
  height: 100rpx;
  line-height: 100rpx;
  border-radius: 50rpx;
  font-size: 36rpx;
}
</style>
