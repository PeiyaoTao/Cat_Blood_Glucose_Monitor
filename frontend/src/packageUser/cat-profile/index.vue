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

      <view class="form-group switch-group">
        <view class="switch-info">
          <text class="switch-title">低血糖急救弹窗提醒</text>
          <text class="switch-desc">录入低血糖时自动弹出急救指引与复测提醒</text>
        </view>
        <switch :checked="formData.hypoAlertEnabled" color="#2ECC71" @change="onHypoSwitchChange" />
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="saveProfile">
      保存档案
    </button>
    <button v-if="docId" class="btn btn-danger delete-btn" @click="handleDelete">
      {{ isCreator ? '删除档案' : '解除共享绑定' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { callApi, safeNavigateBack } from '@/utils/api'
import { useCatSession } from '@/composables/useCatSession'
import { DEFAULT_TARGET_MIN, DEFAULT_TARGET_MAX, normalizeTargetRange, getHypoAlertSetting, setHypoAlertSetting } from '@/utils/glucoseDomain'

const isSubmitting = ref(false)
const docId = ref('')
const isCreator = ref(true)
const catOpenId = ref('')
const { fetchCats, isCatCreator, selectCat } = useCatSession()

const formData = ref({
  avatar: '',
  name: '',
  birthday: '',
  diagnosis_date: '',
  targetMin: DEFAULT_TARGET_MIN,
  targetMax: DEFAULT_TARGET_MAX,
  hypoAlertEnabled: getHypoAlertSetting()
})

const onHypoSwitchChange = (e: any) => {
  formData.value.hypoAlertEnabled = Boolean(e.detail.value)
  setHypoAlertSetting(formData.value.hypoAlertEnabled)
}

onLoad(async (options: any) => {
  if (options && options.id) {
    try {
      const cats = await fetchCats()
      const cat = cats.find((c: any) => c._id === options.id)
      if (cat) {
        docId.value = cat._id
        catOpenId.value = cat._openid || ''
        isCreator.value = isCatCreator(cat)

        const { min: targetMin, max: targetMax } = normalizeTargetRange(cat.targetMin, cat.targetMax)
        const hypoEnabled = typeof cat.hypoAlertEnabled === 'boolean' ? cat.hypoAlertEnabled : getHypoAlertSetting(cat)
        setHypoAlertSetting(hypoEnabled)
        formData.value = {
          avatar: cat.avatar || '',
          name: cat.name || '',
          birthday: cat.birthday || '',
          diagnosis_date: cat.diagnosis_date || '',
          targetMin,
          targetMax,
          hypoAlertEnabled: hypoEnabled
        }
      }
    } catch (e) {
      console.log('Error fetching cat profile', e)
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
  if (typeof wx === 'undefined') return // 非微信环境的回退
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
  const { avatarUrl } = e.detail
  uploadAvatar(avatarUrl)
}

const uploadAvatar = async (filePath: string) => {
  uni.showLoading({ title: '正在上传头像...' })
  try {
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
  if (!formData.value.name || !formData.value.name.trim()) {
    uni.showToast({ title: '请输入猫咪名字', icon: 'none' })
    return
  }

  const minVal = parseFloat(String(formData.value.targetMin))
  const maxVal = parseFloat(String(formData.value.targetMax))
  if (!Number.isFinite(minVal) || minVal <= 0 || minVal >= 50) {
    uni.showToast({ title: '请输入有效的血糖目标下限 (0 ~ 50)', icon: 'none' })
    return
  }
  if (!Number.isFinite(maxVal) || maxVal <= 0 || maxVal > 60) {
    uni.showToast({ title: '请输入有效的血糖目标上限 (0 ~ 60)', icon: 'none' })
    return
  }
  if (minVal >= maxVal) {
    uni.showToast({ title: '血糖目标下限必须小于目标上限', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  try {
    setHypoAlertSetting(formData.value.hypoAlertEnabled)
    const dataToSave = {
      avatar: formData.value.avatar,
      name: formData.value.name.trim(),
      birthday: formData.value.birthday,
      diagnosis_date: formData.value.diagnosis_date,
      targetMin: Number(minVal.toFixed(1)),
      targetMax: Number(maxVal.toFixed(1)),
      hypoAlertEnabled: Boolean(formData.value.hypoAlertEnabled),
      updateTime: Date.now()
    }
    
    const res = await callApi('saveCat', { catId: docId.value, catData: dataToSave })
    if (!docId.value && res.id) {
      docId.value = res.id
      selectCat(res.id)
    }
    
    uni.showToast({ title: '保存成功', icon: 'success' })
    setTimeout(() => { safeNavigateBack() }, 1500)
  } catch (err: any) {
    console.error(err)
    const errorStr = err.message || err.errMsg || String(err)
    if (errorStr.includes('CONTENT_SECURITY_FAILED')) {
      uni.showModal({ title: '安全提示', content: '所发布内容含违规信息，请修改后重试', showCancel: false })
      if (formData.value.avatar) { formData.value.avatar = '' } // 违规图片可能已被云端清理，前端清空
    } else if (errorStr.includes('not exist')) {
      uni.showToast({ title: '请先在云开发控制台创建集合！', icon: 'none', duration: 4000 })
    } else {
      uni.showToast({ title: errorStr || '保存失败', icon: 'none' })
    }
  } finally {
    isSubmitting.value = false
  }
}

const handleDelete = () => {
  const title = isCreator.value ? '删除档案' : '解除绑定'
  const content = isCreator.value ? '确定要永久删除该猫咪的所有资料吗？该操作不可恢复！' : '确定要解除对该共享猫咪的绑定吗？'
  
  uni.showModal({
    title,
    content,
    confirmColor: '#E74C3C',
    success: async (res) => {
      if (res.confirm) {
        uni.showLoading({ title: '处理中...' })
        try {
          if (isCreator.value) {
            await callApi('deleteCat', { catId: docId.value })
          } else {
            await callApi('unbindSharedCat', { catId: docId.value })
          }
          
          uni.removeStorageSync('currentCatId')
          uni.showToast({ title: '已移除', icon: 'success' })
          setTimeout(() => { safeNavigateBack() }, 1500)
        } catch (e) {
          uni.showToast({ title: '操作失败', icon: 'none' })
        } finally {
          uni.hideLoading()
        }
      }
    }
  })
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
.delete-btn {
  margin-top: 32rpx;
  background-color: transparent;
  color: var(--danger-red);
  border: 2rpx solid var(--danger-red);
}
.switch-group {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-top: 16rpx;
  border-top: 2rpx solid #F1F5F9;
  margin-bottom: 0;
}
.switch-info {
  flex: 1;
  padding-right: 24rpx;
}
.switch-title {
  display: block;
  font-size: 30rpx;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 6rpx;
}
.switch-desc {
  display: block;
  font-size: 24rpx;
  color: var(--text-sub);
}
</style>
