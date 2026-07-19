<template>
  <view class="container">
    <view class="avatar-section">
      <button class="avatar-wrapper" open-type="chooseAvatar" @chooseavatar="onChooseAvatar" @click="handleAvatarClick">
        <image class="avatar-img" :src="formData.avatar || 'https://api.dicebear.com/7.x/notionists/svg?seed=Felix&backgroundColor=FFDAB9'" mode="aspectFill"></image>
        <view class="avatar-edit-icon">
          <view class="icon-svg icon-camera"></view>
        </view>
      </button>
      <text class="avatar-tip">点击修改猫咪头像</text>
    </view>

    <view class="card">
      <view class="form-group">
        <text class="label">猫咪昵称</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.name" placeholder="请输入猫咪昵称" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">出生日期</text>
        <picker mode="date" @change="onBirthdayChange" :value="formData.birthday">
          <view class="picker-view">
            {{ formData.birthday || '请选择出生日期' }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">体重 (kg)</text>
        <view class="input-wrap">
          <input type="digit" v-model="formData.weight" placeholder="请输入当前体重" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">确诊日期</text>
        <picker mode="date" @change="onDateChange" :value="formData.diagnosis_date">
          <view class="picker-view">
            {{ formData.diagnosis_date || '请选择确诊日期' }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>
      
      <view class="form-group">
        <text class="label">预设血糖目标下限 (mmol/L)</text>
        <view class="input-wrap">
          <input type="digit" v-model="formData.targetMin" placeholder="一般为 5.0" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">预设血糖目标上限 (mmol/L)</text>
        <view class="input-wrap">
          <input type="digit" v-model="formData.targetMax" placeholder="一般为 15.0" />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="saveProfile">
      保存档案
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'

const isSubmitting = ref(false)
const docId = ref('')

const formData = ref({
  avatar: '',
  name: '',
  birthday: '',
  weight: '',
  diagnosis_date: '',
  targetMin: 5.0,
  targetMax: 15.0
})

onLoad(async () => {
  // 页面加载时拉取现有档案
  // @ts-ignore
  if (typeof wx !== 'undefined' && wx.cloud) {
    try {
      // @ts-ignore
      const db = wx.cloud.database()
      const res = await db.collection('cats').limit(1).get()
      if (res.data && res.data.length > 0) {
        const cat = res.data[0]
        docId.value = cat._id
        formData.value = {
          avatar: cat.avatar || '',
          name: cat.name || '',
          birthday: cat.birthday || '',
          weight: cat.weight || '',
          diagnosis_date: cat.diagnosis_date || '',
          targetMin: cat.targetMin || 5.0,
          targetMax: cat.targetMax || 15.0
        }
      }
    } catch (e) {
      console.log('No existing cat profile', e)
    }
  }
})

const onDateChange = (e: any) => {
  formData.value.diagnosis_date = e.detail.value
}

const onBirthdayChange = (e: any) => {
  formData.value.birthday = e.detail.value
}

const handleAvatarClick = () => {
  // @ts-ignore
  if (typeof wx === 'undefined') return // 非微信环境的回退
  // @ts-ignore
  wx.chooseMedia({
    count: 1,
    mediaType: ['image'],
    sizeType: ['compressed'],
    success: (res: any) => {
      uploadAvatar(res.tempFiles[0].tempFilePath)
    }
  })
}

const onChooseAvatar = (e: any) => {
  // 兼容最新的头像选择器(获取微信头像), 顺便也可以用作猫咪头像(虽然很少见)
  const { avatarUrl } = e.detail
  uploadAvatar(avatarUrl)
}

const uploadAvatar = async (filePath: string) => {
  uni.showLoading({ title: '正在上传头像...' })
  try {
    // @ts-ignore
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `avatars/cat_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`,
      filePath: filePath,
    })
    formData.value.avatar = uploadRes.fileID
    uni.hideLoading()
  } catch (err) {
    console.error('Avatar upload error', err)
    uni.hideLoading()
    uni.showToast({ title: '头像上传失败', icon: 'none' })
  }
}

const saveProfile = async () => {
  if (!formData.value.name) {
    uni.showToast({ title: '请输入猫咪名字', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  try {
    // @ts-ignore
    if (typeof wx !== 'undefined' && wx.cloud) {
      // @ts-ignore
      const db = wx.cloud.database()
      const dataToSave = {
        avatar: formData.value.avatar,
        name: formData.value.name,
        birthday: formData.value.birthday,
        weight: parseFloat(formData.value.weight),
        diagnosis_date: formData.value.diagnosis_date,
        targetMin: parseFloat(formData.value.targetMin as any),
        targetMax: parseFloat(formData.value.targetMax as any),
        updateTime: db.serverDate()
      }
      
      if (docId.value) {
        // 更新记录
        await db.collection('cats').doc(docId.value).update({ data: dataToSave })
      } else {
        // 新建记录
        const res = await db.collection('cats').add({ data: dataToSave })
        docId.value = res._id
      }
      
      uni.showToast({ title: '保存成功', icon: 'success' })
      setTimeout(() => { uni.navigateBack() }, 1500)
    }
  } catch (err: any) {
    console.error(err)
    if (err.message && err.message.includes('not exist')) {
      uni.showToast({ title: '请先在云开发控制台创建 cats 集合！', icon: 'none', duration: 4000 })
    } else {
      uni.showToast({ title: '保存失败', icon: 'none' })
    }
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.container {
  padding: 32rpx;
  min-height: 100vh;
  background-color: var(--bg-color);
}
.avatar-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 40rpx;
  padding-top: 20rpx;
}
.avatar-wrapper {
  padding: 0;
  margin: 0;
  width: 180rpx;
  height: 180rpx;
  border-radius: 90rpx;
  position: relative;
  border: 6rpx solid #FFFFFF;
  box-shadow: 0 8rpx 24rpx rgba(0,0,0,0.08);
  background: var(--primary-light);
  overflow: visible;
}
.avatar-wrapper::after {
  border: none;
}
.avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 90rpx;
}
.avatar-edit-icon {
  position: absolute;
  right: -10rpx;
  bottom: 0rpx;
  width: 60rpx;
  height: 60rpx;
  background: var(--primary);
  border-radius: 30rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30rpx;
  border: 4rpx solid #FFFFFF;
}
.icon-svg {
  width: 28rpx;
  height: 28rpx;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-camera { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23FFFFFF' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z'/%3E%3Ccircle cx='12' cy='13' r='3'/%3E%3C/svg%3E"); }
.avatar-tip {
  margin-top: 16rpx;
  font-size: 24rpx;
  color: var(--text-sub);
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
}
.form-group {
  margin-bottom: 40rpx;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 16rpx;
  display: block;
  font-weight: 500;
}
.input-wrap, .picker-view {
  background: #F8F9FA;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  border: 2rpx solid transparent;
}
.input-wrap:focus-within {
  border-color: var(--primary-light);
  background: #FFFFFF;
}
.input-wrap input {
  font-size: 32rpx;
  color: var(--text-main);
  width: 100%;
}
.picker-view {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 32rpx;
  color: var(--text-main);
}
.icon-arrow {
  color: #BDC3C7;
  font-size: 24rpx;
}
.submit-btn {
  margin-top: 60rpx;
}
</style>
