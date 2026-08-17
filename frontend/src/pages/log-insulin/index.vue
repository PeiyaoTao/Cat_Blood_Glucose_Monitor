<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">注射剂量 (单位/U) <text class="required">*</text></text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.dose" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="grid-2">
        <view class="form-group">
          <text class="label">针次阶段</text>
          <picker :range="periodOptions" @change="onPeriodChange" :value="periodIndex">
            <view class="picker-view">
              {{ periodOptions[periodIndex] }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">剂量调整 (选填)</text>
          <picker :range="adjustOptions" @change="onAdjustChange" :value="adjustIndex">
            <view class="picker-view">
              {{ adjustOptions[adjustIndex] }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
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
        <text class="label">备注 (注射部位、配合度等)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="例如: 左侧颈部皮下，打针配合良好" />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      保存打针记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { callApi } from '@/utils/api'

const periodOptions = ['早针', '晚针', '临时加针']
const periodIndex = ref(0)

const adjustOptions = [
  '维持原量',
  '增加 +0.25U',
  '增加 +0.50U',
  '减少 -0.25U',
  '减少 -0.50U',
  '首次剂量设定',
  '其他调整'
]
const adjustIndex = ref(0)

const insulinOptions = ['甘精胰岛素 (Glargine)', '地特胰岛素 (Detemir)', '中效胰岛素 (NPH)', '其他']
const insulinIndex = ref(0)

const isSubmitting = ref(false)

const now = new Date()
const hour = now.getHours()
const currentHour = hour.toString().padStart(2, '0')
const currentMinute = now.getMinutes().toString().padStart(2, '0')

// 自动根据时间预设针次（早针 / 晚针）
if (hour >= 5 && hour < 14) {
  periodIndex.value = 0 // 早针
} else {
  periodIndex.value = 1 // 晚针
}

const formData = ref({
  dose: '',
  time: `${currentHour}:${currentMinute}`,
  note: ''
})

const onPeriodChange = (e: any) => {
  periodIndex.value = e.detail.value
}

const onAdjustChange = (e: any) => {
  adjustIndex.value = e.detail.value
}

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
    const periodName = periodOptions[periodIndex.value]
    const doseAdj = adjustIndex.value === 0 ? '维持原量' : adjustOptions[adjustIndex.value]

    const recordData = {
      cat_id: uni.getStorageSync('currentCatId') || 'default',
      dose: numValue,
      period: periodName,
      dose_adjustment: doseAdj,
      insulin_type: insulinOptions[insulinIndex.value],
      inject_time: formData.value.time,
      note: formData.value.note,
      createTime: Date.now()
    }
    
    await callApi('addRecord', { type: 'insulin_records', recordData })
    
    uni.showToast({ title: '注射记录成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  } catch (err: any) {
    console.error(err)
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
  background-color: var(--primary);
}
</style>
