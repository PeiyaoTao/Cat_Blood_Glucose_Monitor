<template>
  <view class="container">
    <view class="page-header">
      <text class="page-title">实用工具</text>
    </view>

    <view class="tools-grid">
      <view class="tool-card" @click="handleToolClick('单位换算器')">
        <view class="icon-wrap" style="background: #E8F8F5; color: #2ECC71;">
          <text class="icon">🔄</text>
        </view>
        <text class="tool-name">单位换算</text>
        <text class="tool-desc">mmol/L ↔ mg/dL</text>
      </view>

      <view class="tool-card" @click="handleToolClick('干物质计算器')">
        <view class="icon-wrap" style="background: #FEF9E7; color: #F1C40F;">
          <text class="icon">🥩</text>
        </view>
        <text class="tool-name">干物质计算</text>
        <text class="tool-desc">计算猫粮碳水</text>
      </view>

      <view class="tool-card" @click="handleToolClick('医疗提醒')">
        <view class="icon-wrap" style="background: #EBF5FB; color: #3498DB;">
          <text class="icon">⏰</text>
        </view>
        <text class="tool-name">打针提醒</text>
        <text class="tool-desc">准时注射不遗漏</text>
      </view>
      
      <view class="tool-card" @click="handleToolClick('导出报告')">
        <view class="icon-wrap" style="background: #FDEDEC; color: #E74C3C;">
          <text class="icon">📊</text>
        </view>
        <text class="tool-name">导出报告</text>
        <text class="tool-desc">生成就诊 Excel</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const handleToolClick = (toolName: string) => {
  uni.showToast({
    title: `${toolName} 开发中`,
    icon: 'none'
  })
}
</script>

<style scoped>
.container {
  padding: 32rpx;
  min-height: 100vh;
  background-color: var(--bg-color);
}
.page-header {
  margin-bottom: 40rpx;
  padding-top: 20rpx;
}
.page-title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text-main);
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32rpx;
}
.tool-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
}
.icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.icon {
  font-size: 40rpx;
}
.tool-name {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8rpx;
}
.tool-desc {
  font-size: 24rpx;
  color: var(--text-sub);
}
</style>
