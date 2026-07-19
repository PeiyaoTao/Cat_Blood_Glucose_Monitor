<template>
  <view class="container">
    <view class="header">
      <text class="title">家庭成员共享</text>
      <text class="desc">将小程序直接转发给微信好友（例如：家人、兽医），他们点击卡片即可直接访问小猫咪的血糖档案，一起照顾它！</text>
    </view>

    <view class="action-card card">
      <button class="btn btn-primary share-btn" open-type="share">
        发送微信邀请卡片
      </button>
    </view>
    
    <view class="member-list card">
      <text class="list-title">已绑定的家庭成员 (功能开发中...)</text>
      <view class="member-item">
        <text class="emoji">👤</text>
        <view class="info">
          <text class="name">铲屎官本人</text>
          <text class="role">管理员</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShareAppMessage } from '@dcloudio/uni-app'
import { ref } from 'vue'

const openid = ref('')

onShareAppMessage(() => {
  // 获取分享者的 openid，拼接在分享链接中
  const cachedInfo = uni.getStorageSync('userInfo')
  if (cachedInfo) {
    const userInfo = JSON.parse(cachedInfo)
    openid.value = userInfo.openid
  }
  
  return {
    title: '邀请你加入猫咪的控糖日记',
    path: `/pages/index/index?inviter=${openid.value}`,
    imageUrl: '' // 可选：设置封面图
  }
})
</script>

<style scoped>
.container { padding: 32rpx; min-height: 100vh; background: var(--bg-color); }
.header { margin-bottom: 40rpx; }
.title { font-size: 48rpx; font-weight: 800; color: var(--text-main); display: block; margin-bottom: 16rpx; }
.desc { font-size: 28rpx; color: var(--text-sub); line-height: 1.5; }
.card { background: #FFFFFF; border-radius: 24rpx; padding: 40rpx; margin-bottom: 32rpx; }
.share-btn { font-size: 32rpx; height: 100rpx; line-height: 100rpx; background: #2ECC71; color: white; border-radius: 50rpx; }
.list-title { font-size: 30rpx; font-weight: 700; color: var(--text-main); margin-bottom: 32rpx; display: block; }
.member-item { display: flex; align-items: center; padding: 24rpx 0; border-bottom: 2rpx solid #F0F0F0; }
.emoji { font-size: 64rpx; margin-right: 24rpx; }
.info { display: flex; flex-direction: column; }
.name { font-size: 32rpx; font-weight: 600; color: var(--text-main); margin-bottom: 8rpx; }
.role { font-size: 24rpx; color: var(--text-sub); }
</style>
