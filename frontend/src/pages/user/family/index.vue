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
      <text class="list-title">已绑定的家庭成员</text>
      
      <!-- 本人及其他成员统一列表 -->
      <view class="member-item" v-for="(member, index) in familyMembers" :key="index">
        <image v-if="member.avatarUrl" class="avatar-img" :src="member.avatarUrl" mode="aspectFill"></image>
        <text v-else class="emoji">👤</text>
        <view class="info">
          <text class="name">{{ member.nickName }}</text>
          <text class="role">{{ member.displayRole }}</text>
        </view>
        <view class="actions" v-if="member.displayRole === '共同照料者' && isCurrentUserAdmin">
          <text class="remove-btn" @click="handleRemoveMember(member)">移除</text>
        </view>
      </view>
      
      <!-- 提示 -->
      <view class="empty-hint" v-if="familyMembers.length <= 1 && !isLoading">
        还没绑定其他家人哦，快点击上方按钮发送邀请吧！
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { onShareAppMessage, onLoad } from '@dcloudio/uni-app'
import { ref } from 'vue'
import { callApi } from '@/utils/api'

const openid = ref('')
const familyMembers = ref<any[]>([])
const isLoading = ref(true)
const currentUserInfo = ref<any>({})
const isCurrentUserAdmin = ref(false)

const loadMembers = async () => {
  isLoading.value = true
  try {
    const res = await callApi('getCats')
    const members = new Set<string>()
    const creators = new Set<string>()
    
    members.add(openid.value)

    if (res.data) {
      res.data.forEach((cat: any) => {
        if (cat._openid) {
          members.add(cat._openid)
          creators.add(cat._openid)
        }
        if (cat.shared_with && Array.isArray(cat.shared_with)) {
          cat.shared_with.forEach((id: string) => {
            members.add(id)
          })
        }
      })
    }
    
    isCurrentUserAdmin.value = creators.has(openid.value) || creators.size === 0
    const uniqueIds = Array.from(members)
    
    if (uniqueIds.length > 0) {
      try {
        const usersRes = await callApi('getUsers', { openids: uniqueIds })
        if (usersRes.data) {
          familyMembers.value = uniqueIds.map(id => {
            const user = usersRes.data.find((u: any) => u._openid === id)
            let matchedUser = user
            if (!matchedUser && id === openid.value) {
              matchedUser = currentUserInfo.value
            }
            
            const isCreator = creators.has(id) || (id === openid.value && creators.size === 0)
            const roleStr = isCreator ? '管理员' : '共同照料者'
            const isMeStr = id === openid.value ? ' (我)' : ''
            
            return matchedUser 
              ? { ...matchedUser, displayRole: roleStr + isMeStr }
              : { _openid: id, nickName: `家人 (ID: ${id.substring(0, 6)}***)`, displayRole: roleStr + isMeStr }
          })
          
          familyMembers.value.sort((a, b) => {
            if (a._openid === openid.value) return -1
            if (b._openid === openid.value) return 1
            const aIsAdmin = a.displayRole.includes('管理员')
            const bIsAdmin = b.displayRole.includes('管理员')
            if (aIsAdmin && !bIsAdmin) return -1
            if (!aIsAdmin && bIsAdmin) return 1
            return 0
          })
        }
      } catch (e) {
        console.error('Failed to fetch user profiles', e)
        familyMembers.value = uniqueIds.map(id => ({ _openid: id, nickName: `家人 (ID: ${id.substring(0, 6)}***)`, displayRole: (id === openid.value ? '管理员 (我)' : '共同照料者') }))
      }
    } else {
      familyMembers.value = []
    }
  } catch (e) {
    console.error('Failed to fetch family members', e)
  } finally {
    isLoading.value = false
  }
}

onLoad(() => {
  const cachedInfo = uni.getStorageSync('userInfo')
  if (cachedInfo) {
    const userInfo = JSON.parse(cachedInfo)
    openid.value = userInfo.openid
    currentUserInfo.value = userInfo
  }
  loadMembers()
})

const handleRemoveMember = (member: any) => {
  uni.showModal({
    title: '移除成员',
    content: `确定要取消 ${member.nickName} 照顾您名下猫咪的权限吗？`,
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '移除中...' })
        try {
          await callApi('removeFamilyMember', { targetOpenid: member._openid })
          uni.showToast({ title: '已移除', icon: 'success' })
          loadMembers()
        } catch (e) {
          console.error(e)
          uni.showToast({ title: '移除失败', icon: 'none' })
        }
      }
    }
  })
}

onShareAppMessage(() => {
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
.info { display: flex; flex-direction: column; flex: 1; }
.name { font-size: 32rpx; font-weight: 600; color: var(--text-main); margin-bottom: 8rpx; }
.role { font-size: 24rpx; color: var(--text-sub); }
.actions { margin-left: auto; }
.remove-btn { font-size: 24rpx; color: #E74C3C; background: #FDEDEC; padding: 10rpx 20rpx; border-radius: 30rpx; }
.avatar-img { width: 64rpx; height: 64rpx; border-radius: 50%; margin-right: 24rpx; }
.empty-hint { margin-top: 32rpx; text-align: center; font-size: 26rpx; color: #BDC3C7; padding: 24rpx; background: #F8F9FA; border-radius: 16rpx; }
</style>
