<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">猫咪昵称</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.name" placeholder="请输入猫咪昵称" />
        </view>
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
  name: '',
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
          name: cat.name || '',
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
        name: formData.value.name,
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
