<template>
  <view class="container">
    <!-- 用户卡片 -->
    <view class="user-card">
      <view class="avatar-wrap">
        <text class="avatar-emoji">👤</text>
      </view>
      <view class="user-info">
        <text class="username">未登录主人</text>
        <text class="sub-text">点击微信授权登录</text>
      </view>
    </view>

    <!-- 菜单列表 -->
    <view class="menu-list card">
      <view class="menu-item" @click="handleMenuClick('猫咪档案')">
        <text class="menu-icon">🐈</text>
        <text class="menu-text">管理猫咪档案</text>
        <text class="arrow">></text>
      </view>
      <view class="menu-item" @click="handleMenuClick('家庭共享')">
        <text class="menu-icon">👨‍👩‍👧</text>
        <text class="menu-text">家庭成员共享</text>
        <text class="arrow">></text>
      </view>
      <view class="menu-item" @click="handleMenuClick('使用帮助')">
        <text class="menu-icon">📖</text>
        <text class="menu-text">使用帮助与医学免责</text>
        <text class="arrow">></text>
      </view>
      <view class="menu-item" @click="handleMenuClick('关于我们')">
        <text class="menu-icon">ℹ️</text>
        <text class="menu-text">关于我们</text>
        <text class="arrow">></text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const handleMenuClick = (menuName: string) => {
  uni.showToast({
    title: `${menuName} 功能开发中`,
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
.user-card {
  display: flex;
  align-items: center;
  padding: 40rpx;
  background: #FFFFFF;
  border-radius: 24rpx;
  margin-bottom: 40rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
}
.avatar-wrap {
  width: 120rpx;
  height: 120rpx;
  background: #F7F9FC;
  border-radius: 60rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 32rpx;
}
.avatar-emoji {
  font-size: 60rpx;
}
.user-info {
  display: flex;
  flex-direction: column;
}
.username {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 8rpx;
}
.sub-text {
  font-size: 28rpx;
  color: var(--text-sub);
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 0 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
}
.menu-item {
  display: flex;
  align-items: center;
  padding: 32rpx 0;
  border-bottom: 2rpx solid #F0F0F0;
}
.menu-item:last-child {
  border-bottom: none;
}
.menu-icon {
  font-size: 40rpx;
  margin-right: 24rpx;
}
.menu-text {
  flex: 1;
  font-size: 32rpx;
  color: var(--text-main);
  font-weight: 500;
}
.arrow {
  color: #BDC3C7;
  font-weight: 600;
}
</style>
