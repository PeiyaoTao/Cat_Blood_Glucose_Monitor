<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">血糖数值 (mmol/L) <text class="required">*</text></text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.bg_value" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">时效阶段 (与就诊表对齐)</text>
        <picker :range="periodOptions" @change="onPeriodChange" :value="periodIndex">
          <view class="picker-view">
            {{ periodOptions[periodIndex] }}
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

      <!-- 进食关联情况（选填） -->
      <view class="section-title">进食与消化（选填）</view>
      
      <view class="grid-2">
        <view class="form-group">
          <text class="label">吃饭时间 (选填)</text>
          <picker mode="time" @change="onMealTimeChange" :value="formData.meal_time">
            <view class="picker-view">
              {{ formData.meal_time || '未记录' }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">进食克数 (g) (选填)</text>
          <view class="input-wrap">
            <input type="digit" v-model="formData.food_grams" placeholder="例如: 85" />
          </view>
        </view>
      </view>

      <view class="form-group">
        <text class="label">备注 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="精神状态、进食表现等..." />
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
import { callApi } from '@/utils/api'

// 与就诊记录表时效完全对齐
const periodOptions = [
  '早针',
  '针后5小时',
  '晚针',
  '针后5小时',
  '空腹',
  '餐后2小时',
  '加测/随机'
]
const periodIndex = ref(0)
const isSubmitting = ref(false)

const now = new Date()
const hour = now.getHours()
const currentHour = hour.toString().padStart(2, '0')
const currentMinute = now.getMinutes().toString().padStart(2, '0')

// 智能根据当前时间预选时效
if (hour >= 6 && hour < 11) {
  periodIndex.value = 0 // 早针
} else if (hour >= 11 && hour < 16) {
  periodIndex.value = 1 // 针后5小时
} else if (hour >= 16 && hour < 22) {
  periodIndex.value = 2 // 晚针
} else {
  periodIndex.value = 3 // 晚针后5小时
}

const formData = ref({
  bg_value: '',
  time: `${currentHour}:${currentMinute}`,
  meal_time: '',
  food_grams: '',
  note: ''
})

const onPeriodChange = (e: any) => {
  periodIndex.value = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const onMealTimeChange = (e: any) => {
  formData.value.meal_time = e.detail.value
}

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.bg_value)
  if (!formData.value.bg_value || isNaN(numValue) || numValue <= 0 || numValue > 100) {
    uni.showToast({ title: '请输入正确的血糖值 (0-100)', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  
  try {
    const periodName = periodOptions[periodIndex.value]
    const recordData = {
      cat_id: uni.getStorageSync('currentCatId') || 'default',
      bg_value: numValue,
      period: periodName,
      status: periodName, // 保持与旧字段 status 兼容
      measure_time: formData.value.time,
      meal_time: formData.value.meal_time || '',
      food_grams: formData.value.food_grams || '',
      note: formData.value.note,
      createTime: Date.now()
    }
    
    await callApi('addRecord', { type: 'blood_glucose', recordData })
    
    uni.showToast({ title: '记录成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
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
  margin-bottom: 32rpx;
}
.required {
  color: #E74C3C;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 16rpx;
  display: block;
}
.section-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-main);
  margin: 36rpx 0 20rpx 0;
  padding-top: 24rpx;
  border-top: 2rpx dashed #EAEDED;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
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
  margin-top: 40rpx;
}
</style>
