<template>
  <view class="container">
    <view class="header">
      <view class="icon-svg icon-alarm-large"></view>
      <text class="title">下次打针提醒</text>
      <text class="desc">设置提醒后，微信将通过服务通知准时提醒您为猫咪打针。</text>
    </view>

    <view class="card">
      <view class="form-group">
        <text class="label">选择提醒时间</text>
        <picker mode="time" @change="onTimeChange" :value="selectedTime">
          <view class="picker-view">
            {{ selectedTime || '请选择打针时间' }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">快捷设定</text>
        <view class="tags">
          <view class="tag" @click="setOffsetHours(12)">12 小时后</view>
          <view class="tag" @click="setOffsetHours(1)">1 小时后测试</view>
        </view>
      </view>
      
      <view class="form-group" v-if="selectedDateObj">
        <text class="label">预计提醒日期时间：</text>
        <text class="preview-text">{{ previewDateTime }}</text>
      </view>
    </view>

    <button class="btn btn-primary" :loading="isSubmitting" @click="subscribeAndSave">
      保存并授权提醒
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const isSubmitting = ref(false)
const selectedTime = ref('')
const selectedDateObj = ref<Date | null>(null)

// 用户的模板 ID (你提供的)
const TEMPLATE_ID = 'dx18s9lpowL9wetVsrwmvIqtOh2zgPt4J4vVxs_3C9s'

const previewDateTime = computed(() => {
  if (!selectedDateObj.value) return ''
  const d = selectedDateObj.value
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
})

const onTimeChange = (e: any) => {
  selectedTime.value = e.detail.value
  const [hours, mins] = e.detail.value.split(':')
  
  // 计算今天或明天的这个时间
  const now = new Date()
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), parseInt(hours), parseInt(mins), 0)
  
  if (target.getTime() <= now.getTime()) {
    // 如果选择的时间已经过了，认为是明天
    target.setDate(target.getDate() + 1)
  }
  selectedDateObj.value = target
}

const setOffsetHours = (hours: number) => {
  const target = new Date(Date.now() + hours * 60 * 60 * 1000)
  selectedDateObj.value = target
  selectedTime.value = `${String(target.getHours()).padStart(2,'0')}:${String(target.getMinutes()).padStart(2,'0')}`
}

const subscribeAndSave = () => {
  if (!selectedDateObj.value) {
    uni.showToast({ title: '请先选择提醒时间', icon: 'none' })
    return
  }

  // @ts-ignore
  if (typeof wx === 'undefined') {
    uni.showToast({ title: '仅支持在微信小程序中使用', icon: 'none' })
    return
  }

  // @ts-ignore
  wx.requestSubscribeMessage({
    tmplIds: [TEMPLATE_ID],
    success: (res: any) => {
      if (res[TEMPLATE_ID] === 'accept') {
        saveReminderToCloud()
      } else {
        uni.showToast({ title: '您取消了授权，无法发送提醒', icon: 'none' })
      }
    },
    fail: (err: any) => {
      console.error('订阅失败', err)
      uni.showToast({ title: '订阅失败', icon: 'none' })
    }
  })
}

const saveReminderToCloud = async () => {
  isSubmitting.value = true
  try {
    const catId = uni.getStorageSync('currentCatId') || 'default'
    // @ts-ignore
    const res = await wx.cloud.callFunction({
      name: 'setReminder',
      data: {
        catId: catId,
        triggerTime: selectedDateObj.value!.getTime(),
        templateId: TEMPLATE_ID
      }
    })
    
    if (res.result && res.result.code === 0) {
      uni.showToast({ title: '设置成功', icon: 'success' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      uni.showToast({ title: '设置失败', icon: 'none' })
    }
  } catch (err) {
    console.error(err)
    uni.showToast({ title: '网络请求失败', icon: 'none' })
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
  flex-direction: column;
  align-items: center;
  margin-bottom: 40rpx;
  padding-top: 40rpx;
}
.icon-alarm-large {
  width: 120rpx;
  height: 120rpx;
  margin-bottom: 24rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233498DB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='13' r='8'/%3E%3Cpolyline points='12 9 12 13 14 15'/%3E%3Cpath d='M5 3L2 6'/%3E%3Cpath d='M22 6l-3-3'/%3E%3Cpath d='M6.38 18.7L4 21'/%3E%3Cpath d='M17.64 18.67L20 21'/%3E%3C/svg%3E");
}
.title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 16rpx;
}
.desc {
  font-size: 28rpx;
  color: var(--text-sub);
  text-align: center;
  line-height: 1.5;
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
}
.form-group {
  margin-bottom: 40rpx;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 16rpx;
  display: block;
  font-weight: 500;
}
.picker-view {
  background: #F8F9FA;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 32rpx;
  color: var(--text-main);
}
.icon-arrow {
  color: #BDC3C7;
  font-size: 24rpx;
}
.tags {
  display: flex;
  gap: 16rpx;
}
.tag {
  background: #EBF5FB;
  color: #2980B9;
  padding: 12rpx 24rpx;
  border-radius: 100rpx;
  font-size: 26rpx;
  font-weight: 500;
}
.preview-text {
  font-size: 36rpx;
  font-weight: 700;
  color: var(--text-main);
  background: #E8F8F5;
  padding: 16rpx 24rpx;
  border-radius: 12rpx;
  display: inline-block;
}
.icon-svg {
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
</style>
