<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">进食克数 (g) <text class="required">*</text></text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.food_grams" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="grid-2">
        <view class="form-group">
          <text class="label">餐次阶段</text>
          <picker :range="mealPeriodOptions" @change="onPeriodChange" :value="periodIndex">
            <view class="picker-view">
              {{ mealPeriodOptions[periodIndex] }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">进食时间</text>
          <picker mode="time" @change="onTimeChange" :value="formData.time">
            <view class="picker-view">
              {{ formData.time }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
      </view>

      <view class="form-group">
        <text class="label">罐头品牌 / 批次 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.food_brand" placeholder="例如: 巅峰牛肉 20260101 / K9羊肉" />
        </view>
        <!-- 快捷食物标签 -->
        <view class="quick-tags">
          <text class="q-tag" v-for="tag in commonFoodTags" :key="tag" @click="formData.food_brand = tag">{{ tag }}</text>
        </view>
      </view>

      <view class="form-group">
        <text class="label">附带东西 / 补剂用药 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.extras" placeholder="例如: 益生菌、鱼油、辅酶Q10、皮下补水30ml" />
        </view>
        <!-- 快捷补剂标签 -->
        <view class="quick-tags">
          <text class="q-tag" v-for="tag in commonExtraTags" :key="tag" @click="appendExtra(tag)">+ {{ tag }}</text>
        </view>
      </view>

      <view class="form-group">
        <text class="label">排尿情况 / 尿量 (选填)</text>
        <picker :range="urineOptions" @change="onUrineChange" :value="urineIndex">
          <view class="picker-view">
            {{ urineOptions[urineIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="form-group">
        <text class="label">备注 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="例如: 胃口很好，全部吃完，精神佳" />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      保存饮食记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { callApi } from '@/utils/api'

const mealPeriodOptions = ['早餐 (早针餐)', '午餐/加餐', '晚餐 (晚针餐)', '夜宵/夜间加餐', '常规喂食']
const periodIndex = ref(0)

const urineOptions = [
  '未记录',
  '正常 (3~4团)',
  '偏多 (>5团)',
  '偏少 (<2团)',
  '多饮多尿',
  '正常'
]
const urineIndex = ref(0)

const commonFoodTags = ['主食罐头', '生骨肉/熟自制', '冻干主食', '处方低碳粮']
const commonExtraTags = ['益生菌', '鱼油', '皮下补水', '辅酶Q10', '维生素B']

const isSubmitting = ref(false)

const now = new Date()
const hour = now.getHours()
const currentHour = hour.toString().padStart(2, '0')
const currentMinute = now.getMinutes().toString().padStart(2, '0')

// 自动根据时间预设餐次
if (hour >= 5 && hour < 11) {
  periodIndex.value = 0 // 早餐
} else if (hour >= 11 && hour < 16) {
  periodIndex.value = 1 // 午餐
} else if (hour >= 16 && hour < 21) {
  periodIndex.value = 2 // 晚餐
} else {
  periodIndex.value = 3 // 夜宵
}

const formData = ref({
  food_grams: '',
  time: `${currentHour}:${currentMinute}`,
  food_brand: '',
  extras: '',
  note: ''
})

const onPeriodChange = (e: any) => {
  periodIndex.value = e.detail.value
}

const onUrineChange = (e: any) => {
  urineIndex.value = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const appendExtra = (tag: string) => {
  if (!formData.value.extras) {
    formData.value.extras = tag
  } else if (!formData.value.extras.includes(tag)) {
    formData.value.extras += `、${tag}`
  }
}

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.food_grams)
  if (!formData.value.food_grams || isNaN(numValue) || numValue <= 0 || numValue > 1000) {
    uni.showToast({ title: '请输入正确的进食克数 (0-1000g)', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  
  try {
    const periodName = mealPeriodOptions[periodIndex.value]
    const urineVal = urineIndex.value === 0 ? '' : urineOptions[urineIndex.value]

    const recordData = {
      cat_id: uni.getStorageSync('currentCatId') || 'default',
      food_grams: numValue,
      period: periodName,
      meal_time: formData.value.time,
      food_brand: formData.value.food_brand || '',
      extras: formData.value.extras || '',
      urine: urineVal,
      note: formData.value.note,
      createTime: Date.now()
    }
    
    await callApi('addRecord', { type: 'meal_records', recordData })
    
    uni.showToast({ title: '饮食记录成功', icon: 'success' })
    setTimeout(() => {
      uni.navigateBack()
    }, 1500)
  } catch (err: any) {
    console.error(err)
    uni.showToast({ title: '提交失败:' + err.message, icon: 'none', duration: 3000 })
  } finally {
    isSubmitting.value = false
  }
}
</script>

<style scoped>
.form-group {
  margin-bottom: 32rpx;
}
.required {
  color: #E74C3C;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  margin-bottom: 16rpx;
  display: block;
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}
.input-wrap {
  background: #F7F9FC;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
}
.input-wrap input {
  font-size: 32rpx;
  color: var(--text-main);
  width: 100%;
}
.huge-input {
  padding: 32rpx;
}
.bg-input {
  font-size: 80rpx !important;
  font-weight: 800;
  text-align: center;
  height: 120rpx;
  line-height: 120rpx;
  color: #E67E22;
}
.picker-view {
  background: #F7F9FC;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  font-size: 32rpx;
  color: var(--text-main);
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.icon-arrow {
  color: #BDBDBD;
  font-family: monospace;
}
.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.q-tag {
  font-size: 22rpx;
  color: #7F8C8D;
  background: #F4F6F7;
  padding: 6rpx 16rpx;
  border-radius: 100rpx;
  transition: all 0.2s;
}
.q-tag:active {
  background: #EAECEE;
  color: #2C3E50;
}
.submit-btn {
  height: 100rpx;
  margin-top: 40rpx;
  background: linear-gradient(135deg, #F39C12, #E67E22);
}
</style>
