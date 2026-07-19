<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">注射剂量 (单位/U)</text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.dose" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">胰岛素类型</text>
        <picker :range="insulinOptions" @change="onInsulinChange" :value="insulinIndex">
          <view class="picker-view">
            {{ insulinOptions[insulinIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">注射时间</text>
        <picker mode="time" @change="onTimeChange" :value="formData.time">
          <view class="picker-view">
            {{ formData.time }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">备注 (注射部位、食欲等)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="如：左侧颈部皮下，吃得很好" />
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

const insulinOptions = ['甘精胰岛素 (Glargine)', '地特胰岛素 (Detemir)', '中效胰岛素 (NPH)', '其他']
const insulinIndex = ref(0)
const isSubmitting = ref(false)

const now = new Date()
const currentHour = now.getHours().toString().padStart(2, '0')
const currentMinute = now.getMinutes().toString().padStart(2, '0')

const formData = ref({
  dose: '',
  time: `${currentHour}:${currentMinute}`,
  note: ''
})

const onInsulinChange = (e: any) => {
  insulinIndex.value = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.dose)
  if (!formData.value.dose || isNaN(numValue) || numValue <= 0 || numValue > 20) {
    uni.showToast({ title: '请输入正确的剂量 (一般不超过20U)', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  
  try {
    // @ts-ignore
    if (typeof wx !== 'undefined' && wx.cloud) {
      // @ts-ignore
      const db = wx.cloud.database()
      
      await db.collection('insulin_records').add({
        data: {
          cat_id: 'default',
          dose: numValue,
          insulin_type: insulinOptions[insulinIndex.value],
          inject_time: formData.value.time, 
          note: formData.value.note,
          createTime: db.serverDate()
        }
      })
      
      uni.showToast({ title: '注射记录成功', icon: 'success' })
      setTimeout(() => {
        uni.navigateBack()
      }, 1500)
    } else {
      uni.showToast({ title: '请在微信环境中运行', icon: 'none' })
    }
  } catch (err: any) {
    console.error(err)
    // 捕获集合不存在等错误
    if (err.message && err.message.includes('not exist')) {
      uni.showToast({ title: '请先在云开发控制台创建 insulin_records 集合！', icon: 'none', duration: 4000 })
    } else {
      uni.showToast({ title: '提交失败:' + err.message, icon: 'none', duration: 3000 })
    }
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
  background-color: var(--primary);
}
</style>
