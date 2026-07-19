<template>
  <view class="container">
    <!-- 用户卡片 -->
    <view class="user-card">
      <button class="avatar-wrap btn-clear" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image v-if="userInfo.avatarUrl" class="avatar-img" :src="userInfo.avatarUrl" mode="aspectFill"></image>
        <text v-else class="avatar-emoji">👤</text>
        <view class="edit-badge">✎</view>
      </button>
      <view class="user-info">
        <input type="nickname" class="username-input" :value="userInfo.nickName" @blur="onNicknameBlur" @change="onNicknameChange" placeholder="点击输入铲屎官昵称" />
        <text class="sub-text">ID: {{ userInfo.openid ? userInfo.openid.substring(0,8) + '...' : '获取中...' }}</text>
      </view>
    </view>

    <!-- 菜单列表 -->
    <view class="menu-list card">
      <view class="menu-item" @click="handleMenuClick('猫咪档案')">
        <text class="menu-icon">🐈</text>
        <text class="menu-text">管理猫咪档案</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleMenuClick('家庭共享')">
        <text class="menu-icon">👨‍👩‍👧</text>
        <text class="menu-text">家庭成员共享</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleMenuClick('使用帮助')">
        <text class="menu-icon">📖</text>
        <text class="menu-text">使用帮助与医学免责</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleMenuClick('关于我们')">
        <text class="menu-icon">ℹ️</text>
        <text class="menu-text">关于我们</text>
        <text class="arrow">›</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const userInfo = ref({
  avatarUrl: '',
  nickName: '铲屎官',
  openid: ''
})

onLoad(() => {
  // 从本地缓存读取用户信息
  const cachedInfo = uni.getStorageSync('userInfo')
  if (cachedInfo) {
    userInfo.value = JSON.parse(cachedInfo)
  }
  
  // 如果没有 openid，执行静默登录
  if (!userInfo.value.openid) {
    login()
  }
})

const login = async () => {
  // @ts-ignore
  if (typeof wx !== 'undefined' && wx.cloud) {
    try {
      // @ts-ignore
      const res = await wx.cloud.callFunction({ name: 'login' })
      if (res.result && res.result.openid) {
        userInfo.value.openid = res.result.openid
        saveUserInfo()
      }
    } catch (e) {
      console.error('Login failed', e)
    }
  }
}

const onChooseAvatar = (e: any) => {
  userInfo.value.avatarUrl = e.detail.avatarUrl
  saveUserInfo()
}

const onNicknameBlur = (e: any) => {
  userInfo.value.nickName = e.detail.value
  saveUserInfo()
}
const onNicknameChange = (e: any) => {
  userInfo.value.nickName = e.detail.value
  saveUserInfo()
}

const saveUserInfo = () => {
  uni.setStorageSync('userInfo', JSON.stringify(userInfo.value))
}

const handleMenuClick = (menuName: string) => {
  if (menuName === '猫咪档案') {
    uni.navigateTo({ url: '/pages/user/cat-profile/index' })
  } else if (menuName === '家庭共享') {
    uni.navigateTo({ url: '/pages/user/family/index' })
  } else if (menuName === '使用帮助' || menuName === '关于我们') {
    uni.navigateTo({ url: '/pages/user/about/index' })
  } else {
    uni.showToast({ title: `${menuName} 功能开发中`, icon: 'none' })
  }
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
.btn-clear {
  margin: 0;
  padding: 0;
  background: transparent;
  line-height: normal;
  border-radius: 0;
}
.btn-clear::after {
  display: none;
}
.avatar-wrap {
  width: 130rpx;
  height: 130rpx;
  background: #F7F9FC;
  border-radius: 65rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 32rpx;
  position: relative;
  overflow: visible;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}
.avatar-emoji {
  font-size: 64rpx;
}
.edit-badge {
  position: absolute;
  right: -8rpx;
  bottom: -8rpx;
  background: var(--primary);
  color: white;
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  font-size: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 4rpx solid #fff;
}
.user-info {
  display: flex;
  flex-direction: column;
  flex: 1;
}
.username-input {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-main);
  margin-bottom: 8rpx;
  height: 50rpx;
  line-height: 50rpx;
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
