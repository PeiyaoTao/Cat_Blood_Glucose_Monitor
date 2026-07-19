<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">血糖数值 (mmol/L)</text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.bg_value" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">测量状态</text>
        <picker :range="statusOptions" @change="onStatusChange" :value="statusIndex">
          <view class="picker-view">
            {{ statusOptions[statusIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">测量时间</text>
        <picker mode="time" @change="onTimeChange" :value="formData.time">
          <view class="picker-view">
            {{ formData.time }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">备注</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="精神状态、进食情况等..." />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      保存记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const statusOptions = ['空腹', '餐后2小时', '餐后4小时', '打针前', '打针后2小时', '随机']
const statusIndex = ref(0)
const isSubmitting = ref(false)

const now = new Date()
const currentHour = now.getHours().toString().padStart(2, '0')
const currentMinute = now.getMinutes().toString().padStart(2, '0')

const formData = ref({
  bg_value: '',
  time: `${currentHour}:${currentMinute}`,
  note: ''
})

const onStatusChange = (e: any) => {
  statusIndex.value = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.bg_value)
  if (!formData.value.bg_value || isNaN(numValue) || numValue <= 0 || numValue > 100) {
    uni.showToast({ title: '请输入正确的血糖值 (0-100)', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  
  try {
    // @ts-ignore: wx is injected by miniprogram
    if (typeof wx !== 'undefined' && wx.cloud) {
      // @ts-ignore
      const db = wx.cloud.database()
      
      await db.collection('blood_glucose').add({
        data: {
          cat_id: uni.getStorageSync('currentCatId') || 'default',
          bg_value: parseFloat(formData.value.bg_value),
          status: statusOptions[statusIndex.value],
          measure_time: formData.value.time, 
          note: formData.value.note,
          createTime: db.serverDate()
        }
      })
      
      uni.showToast({ title: '记录成功', icon: 'success' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      uni.showToast({ title: '请在微信环境中运行', icon: 'none' })
    }
  } catch (err: any) {
    console.error(err)
    uni.showToast({ title: '提交失败:' + err.message, icon: 'none', duration: 3000 })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.form-group {
  margin-bottom: 40rpx;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 16rpx;
  display: block;
}
.input-wrap {
  background: #F7F9FC;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
}
.input-wrap input {
  font-size: 32rpx;
  color: var(--text-main);
  width: 100%;
}
.huge-input {
  padding: 32rpx;
}
.bg-input {
  font-size: 80rpx !important;
  font-weight: 800;
  text-align: center;
  height: 120rpx;
  line-height: 120rpx;
}
.picker-view {
  background: #F7F9FC;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  font-size: 32rpx;
  color: var(--text-main);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.icon-arrow {
  color: #BDBDBD;
  font-family: monospace;
}
.submit-btn {
  height: 100rpx;
  margin-top: 60rpx;
}
</style>
