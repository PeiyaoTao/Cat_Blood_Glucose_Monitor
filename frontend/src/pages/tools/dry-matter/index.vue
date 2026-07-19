<template>
  <view class="container">
    <view class="header">
      <text class="title">干物质与碳水计算</text>
      <text class="desc">输入猫粮包装上的营养承诺值（As-fed），计算出真实的干物质碳水占比。糖尿病猫建议干物质碳水控制在 10% 以内。</text>
    </view>

    <view class="card input-card">
      <view class="form-group">
        <text class="label">蛋白质 (Protein) %</text>
        <input type="digit" v-model="form.protein" placeholder="例如: 10.0" />
      </view>
      <view class="form-group">
        <text class="label">脂肪 (Fat) %</text>
        <input type="digit" v-model="form.fat" placeholder="例如: 5.0" />
      </view>
      <view class="form-group">
        <text class="label">水分 (Moisture) %</text>
        <input type="digit" v-model="form.moisture" placeholder="例如: 80.0 (罐头常见)" />
      </view>
      <view class="form-group">
        <text class="label">粗纤维 (Fiber) %</text>
        <input type="digit" v-model="form.fiber" placeholder="例如: 1.5" />
      </view>
      <view class="form-group">
        <text class="label">粗灰分 (Ash) %</text>
        <input type="digit" v-model="form.ash" placeholder="选填, 罐头常取 2, 干粮取 7" />
      </view>
    </view>

    <view class="card result-card" v-if="isValid">
      <text class="result-title">计算结果</text>
      
      <view class="result-row">
        <text>实际干物质占比 (DM)</text>
        <text class="val">{{ dryMatter }}%</text>
      </view>
      <view class="result-row highlight">
        <text>干物质碳水化合物</text>
        <text class="val dm-carbs" :style="{ color: indicatorColor }">{{ dmCarbs }}%</text>
      </view>
      
      <view class="indicator-box" :style="{ backgroundColor: indicatorBg }">
        <view class="status-dot" :style="{ backgroundColor: indicatorColor }"></view>
        <text class="eval-text">{{ indicatorText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const form = ref({
  protein: '',
  fat: '',
  moisture: '',
  fiber: '',
  ash: ''
})

const isValid = computed(() => {
  return form.value.protein && form.value.fat && form.value.moisture && form.value.fiber
})

const dryMatter = computed(() => {
  const m = parseFloat(form.value.moisture) || 0
  return (100 - m).toFixed(1)
})

const dmCarbs = computed(() => {
  const p = parseFloat(form.value.protein) || 0
  const f = parseFloat(form.value.fat) || 0
  const m = parseFloat(form.value.moisture) || 0
  const fb = parseFloat(form.value.fiber) || 0
  const a = parseFloat(form.value.ash) || (m > 60 ? 2 : 7) // 智能估算灰分
  
  const carbsAsFed = 100 - p - f - m - fb - a
  const dm = 100 - m
  if (dm <= 0) return 0
  
  const dmC = (carbsAsFed / dm) * 100
  return dmC > 0 ? dmC.toFixed(1) : '0.0'
})

const indicatorColor = computed(() => {
  const val = parseFloat(dmCarbs.value as string)
  if (val <= 8) return '#2ECC71'
  if (val <= 15) return '#F39C12'
  return '#E74C3C'
})

const indicatorBg = computed(() => {
  const val = parseFloat(dmCarbs.value as string)
  if (val <= 8) return '#E8F8F5'
  if (val <= 15) return '#FEF9E7'
  return '#FDEDEC'
})

// Removed emoji computed

const indicatorText = computed(() => {
  const val = parseFloat(dmCarbs.value as string)
  if (val <= 8) return '非常优秀！低碳水，完全适合糖尿病猫食用。'
  if (val <= 15) return '边缘碳水，可以少量食用或作为零食，需观察血糖变化。'
  return '高碳水！不建议糖尿病猫食用，容易引起血糖飙升。'
})
</script>

<style scoped>
.container { padding: 32rpx; min-height: 100vh; background: var(--bg-color); }
.header { margin-bottom: 40rpx; }
.title { font-size: 48rpx; font-weight: 800; color: var(--text-main); display: block; margin-bottom: 16rpx; }
.desc { font-size: 28rpx; color: var(--text-sub); line-height: 1.5; }
.card { background: #FFFFFF; border-radius: 24rpx; padding: 40rpx; margin-bottom: 32rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02); }
.form-group { margin-bottom: 32rpx; }
.form-group:last-child { margin-bottom: 0; }
.label { font-size: 28rpx; color: var(--text-sub); margin-bottom: 12rpx; display: block; font-weight: 500;}
input { background: #F8F9FA; padding: 24rpx; border-radius: 16rpx; font-size: 32rpx; border: 2rpx solid transparent;}
input:focus { background: #FFFFFF; border-color: var(--primary-light); }
.result-title { font-size: 36rpx; font-weight: 700; border-bottom: 2rpx solid #f0f0f0; padding-bottom: 24rpx; margin-bottom: 24rpx; display: block; }
.result-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; font-size: 30rpx; color: var(--text-main); }
.result-row.highlight { font-size: 36rpx; font-weight: 700; margin-top: 32rpx; }
.dm-carbs { font-size: 48rpx; font-weight: 800; }
.indicator-box { margin-top: 40rpx; padding: 32rpx; border-radius: 16rpx; display: flex; align-items: flex-start; }
.status-dot { width: 32rpx; height: 32rpx; border-radius: 16rpx; margin-right: 16rpx; flex-shrink: 0; margin-top: 6rpx; box-shadow: 0 4rpx 8rpx rgba(0,0,0,0.1); }
.eval-text { font-size: 28rpx; line-height: 1.5; color: var(--text-main); flex: 1; font-weight: 500;}
</style>
