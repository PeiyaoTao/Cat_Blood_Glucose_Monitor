<template>
  <view class="container">
    <view class="header">
      <text class="title">血糖单位换算</text>
      <text class="desc">国内一般使用 mmol/L，海外设备常使用 mg/dL</text>
    </view>

    <view class="converter-card card">
      <!-- mmol/L 输入框 -->
      <view class="input-group">
        <text class="label">国内标准 (mmol/L)</text>
        <view class="input-wrapper">
          <input 
            type="digit" 
            v-model="mmolValue" 
            @input="onMmolInput"
            placeholder="0.0" 
            class="huge-input"
          />
          <text class="unit">mmol/L</text>
        </view>
      </view>

      <!-- 转换图标 -->
      <view class="swap-icon">
        <text>⇅</text>
      </view>

      <!-- mg/dL 输入框 -->
      <view class="input-group">
        <text class="label">国际标准 (mg/dL)</text>
        <view class="input-wrapper highlight-wrapper">
          <input 
            type="digit" 
            v-model="mgdlValue" 
            @input="onMgdlInput"
            placeholder="0" 
            class="huge-input"
          />
          <text class="unit">mg/dL</text>
        </view>
      </view>
    </view>
    
    <view class="info-card">
      <text class="info-title">💡 换算公式</text>
      <text class="info-text">1 mmol/L = 18 mg/dL</text>
      <text class="info-text" style="margin-top: 12rpx;">例如：猫咪正常血糖范围一般为 4.0 ~ 7.0 mmol/L，换算后即为 72 ~ 126 mg/dL。</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const mmolValue = ref('')
const mgdlValue = ref('')

const onMmolInput = (e: any) => {
  const val = parseFloat(e.detail.value)
  if (!isNaN(val)) {
    // 保留整数即可，或者一位小数
    mgdlValue.value = (val * 18).toFixed(1).replace('.0', '')
  } else {
    mgdlValue.value = ''
  }
}

const onMgdlInput = (e: any) => {
  const val = parseFloat(e.detail.value)
  if (!isNaN(val)) {
    // mmol/L 一般保留一位小数
    mmolValue.value = (val / 18).toFixed(1)
  } else {
    mmolValue.value = ''
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
  margin-bottom: 40rpx;
}
.title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text-main);
  display: block;
  margin-bottom: 12rpx;
}
.desc {
  font-size: 28rpx;
  color: var(--text-sub);
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
  margin-bottom: 40rpx;
}
.input-group {
  display: flex;
  flex-direction: column;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 16rpx;
  font-weight: 500;
}
.input-wrapper {
  background: #F8F9FA;
  border-radius: 20rpx;
  padding: 20rpx 32rpx;
  display: flex;
  align-items: baseline;
  border: 2rpx solid transparent;
}
.input-wrapper:focus-within {
  border-color: var(--primary-light);
  background: #FFFFFF;
}
.highlight-wrapper {
  background: #F4F6F6;
}
.huge-input {
  flex: 1;
  font-size: 80rpx;
  font-weight: 800;
  color: var(--text-main);
  height: 100rpx;
}
.unit {
  font-size: 32rpx;
  color: #95A5A6;
  font-weight: 600;
  margin-left: 16rpx;
}
.swap-icon {
  text-align: center;
  font-size: 48rpx;
  color: #BDC3C7;
  padding: 32rpx 0;
}
.info-card {
  background: #EBF5FB;
  border-radius: 16rpx;
  padding: 32rpx;
  display: flex;
  flex-direction: column;
}
.info-title {
  font-size: 30rpx;
  font-weight: 700;
  color: #2980B9;
  margin-bottom: 16rpx;
}
.info-text {
  font-size: 26rpx;
  color: #34495E;
  line-height: 1.5;
}
</style>
