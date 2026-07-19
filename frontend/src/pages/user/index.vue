<template>
  <view class="container">
    <!-- 用户卡片 -->
    <view class="user-card">
      <button class="avatar-wrap btn-clear" open-type="chooseAvatar" @chooseavatar="onChooseAvatar">
        <image v-if="userInfo.avatarUrl" class="avatar-img" :src="userInfo.avatarUrl" mode="aspectFill"></image>
        <view v-else class="icon-svg icon-user"></view>
        <view class="edit-badge">✎</view>
      </button>
      <view class="user-info">
        <input type="nickname" class="username-input" :value="userInfo.nickName" @blur="onNicknameBlur" @change="onNicknameChange" placeholder="点击输入铲屎官昵称" />
        <text class="sub-text" @click="copyId" v-if="userInfo.openid">ID: {{ userInfo.openid.substring(0,8) }} <text style="font-size: 20rpx; color: #BDC3C7; margin-left: 8rpx;">[点击复制完整ID]</text></text>
        <text class="sub-text" v-else>ID: 获取中...</text>
      </view>
    </view>

    <!-- 菜单列表 -->
    <view class="menu-list card">
      <view class="menu-item" @click="handleMenuClick('猫咪档案')">
        <view class="icon-svg icon-cat"></view>
        <text class="menu-text">管理猫咪档案</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleMenuClick('家庭共享')">
        <view class="icon-svg icon-family"></view>
        <text class="menu-text">家庭成员共享</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleMenuClick('使用帮助')">
        <view class="icon-svg icon-book"></view>
        <text class="menu-text">使用帮助与医学免责</text>
        <text class="arrow">›</text>
      </view>
      <view class="menu-item" @click="handleMenuClick('关于我们')">
        <view class="icon-svg icon-info"></view>
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
      } else {
        uni.showToast({ title: '获取ID失败', icon: 'none' })
      }
    } catch (e) {
      console.error('Login failed', e)
      uni.showToast({ title: '登录云函数未部署，请先部署', icon: 'none' })
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

const copyId = () => {
  if (userInfo.value.openid) {
    uni.setClipboardData({
      data: userInfo.value.openid,
      success: () => {
        uni.showToast({ title: '已复制完整 ID', icon: 'success' })
      }
    })
  }
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
.icon-svg {
  width: 44rpx;
  height: 44rpx;
  margin-right: 24rpx;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-user { width: 64rpx; height: 64rpx; margin: 0; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23BDC3C7' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='12' cy='7' r='4'/%3E%3C/svg%3E"); }
.icon-cat { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23E67E22' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1.1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z'/%3E%3Cpath d='M8 14v.5'/%3E%3Cpath d='M16 14v.5'/%3E%3Cpath d='M11.25 16.25h1.5L12 17l-.75-.75Z'/%3E%3C/svg%3E"); }
.icon-family { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233498DB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'/%3E%3Ccircle cx='9' cy='7' r='4'/%3E%3Cpath d='M22 21v-2a4 4 0 0 0-3-3.87'/%3E%3Cpath d='M16 3.13a4 4 0 0 1 0 7.75'/%3E%3C/svg%3E"); }
.icon-book { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232ECC71' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'/%3E%3C/svg%3E"); }
.icon-info { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239B59B6' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpath d='M12 16v-4'/%3E%3Cpath d='M12 8h.01'/%3E%3C/svg%3E"); }
</style>
