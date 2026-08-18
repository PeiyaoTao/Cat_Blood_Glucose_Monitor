<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">血糖数值 (mmol/L) <text class="required">*</text></text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.bg_value" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <!-- 时效阶段 -->
      <view class="form-group">
        <text class="label">时效阶段</text>
        <picker :range="periodOptions" @change="onPeriodChange" :value="periodIndex">
          <view class="picker-view">
            {{ periodOptions[periodIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>

        <!-- 快捷时效标签 -->
        <view class="quick-tags" v-if="periodOptions.length > 0">
          <text 
            class="q-tag" 
            :class="{ active: periodIndex === idx, 'is-custom': isCustomTag(opt) }" 
            v-for="(opt, idx) in periodOptions" 
            :key="opt" 
            @click="selectPeriodByIndex(idx)"
            @longpress="onLongPressPeriod(opt)"
          >
            {{ opt }}
          </text>
        </view>
        <text class="tag-hint" v-if="customPeriodList.length > 0">提示：长按自定义快捷标签可弹出删除</text>

        <!-- 选择“其他”时展开自定义输入与快捷保存 -->
        <view class="custom-input-card" v-if="isCustomPeriod">
          <view class="input-wrap">
            <input 
              type="text" 
              v-model="customPeriodText" 
              placeholder="请输入自定义时效 (如: 针后3小时、夜宵加测)..." 
            />
          </view>
          <view class="save-shortcut-row" v-if="customPeriodText.trim()">
            <button class="btn-save-shortcut" @click="saveCustomPeriod">
              ⭐️ 保存为常用时效
            </button>
          </view>
        </view>
      </view>

      <view class="grid-2">
        <view class="form-group">
          <text class="label">测量日期</text>
          <picker mode="date" @change="onDateChange" :value="formData.date">
            <view class="picker-view">
              {{ formData.date }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">测量时间</text>
          <picker mode="time" @change="onTimeChange" :value="formData.time">
            <view class="picker-view">
              {{ formData.time }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
      </view>

      <view class="form-group">
        <text class="label">备注 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="精神状态、测糖情况等..." />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      保存血糖记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { callApi, getLocalTodayDate, getLocalCurrentTime, makeLocalTimestamp, safeNavigateBack } from '@/utils/api'

// 基础默认时效阶段
const defaultPeriods = [
  '早针',
  '针后5小时',
  '晚针',
  '空腹',
  '餐后2小时',
  '加测/随机'
]
const customPeriodList = ref<string[]>([])
const periodIndex = ref(0)
const customPeriodText = ref('')

const loadSavedPeriods = () => {
  const saved = uni.getStorageSync('custom_bg_periods')
  if (saved && Array.isArray(saved)) {
    customPeriodList.value = saved
  }
}

onMounted(() => {
  loadSavedPeriods()
})

const periodOptions = computed(() => {
  return [...defaultPeriods, ...customPeriodList.value, '其他']
})

const isCustomPeriod = computed(() => {
  return periodOptions.value[periodIndex.value] === '其他'
})

const isCustomTag = (opt: string) => customPeriodList.value.includes(opt)

const selectPeriodByIndex = (idx: number) => {
  periodIndex.value = idx
}

const saveCustomPeriod = () => {
  const text = customPeriodText.value.trim()
  if (!text) return
  if (!customPeriodList.value.includes(text) && !defaultPeriods.includes(text)) {
    const updated = [...customPeriodList.value, text]
    customPeriodList.value = updated
    uni.setStorageSync('custom_bg_periods', updated)
    uni.showToast({ title: '已保存为常用时效', icon: 'success' })
    setTimeout(() => {
      const newIdx = periodOptions.value.findIndex(item => item === text)
      if (newIdx !== -1) {
        periodIndex.value = newIdx
      }
    }, 100)
  } else {
    uni.showToast({ title: '该时效已存在', icon: 'none' })
  }
}

const onLongPressPeriod = (opt: string) => {
  if (!customPeriodList.value.includes(opt)) return
  uni.showModal({
    title: '删除常用时效',
    content: `确定要删除自定义常用时效「${opt}」吗？`,
    confirmText: '删除',
    confirmColor: '#E74C3C',
    success: (res) => {
      if (res.confirm) {
        const updated = customPeriodList.value.filter(item => item !== opt)
        customPeriodList.value = updated
        uni.setStorageSync('custom_bg_periods', updated)
        periodIndex.value = 0
        uni.showToast({ title: '已删除常用时效', icon: 'success' })
      }
    }
  })
}

const isSubmitting = ref(false)

const currentDate = getLocalTodayDate()
const currentTime = getLocalCurrentTime()

// 智能根据当前时间预选时效
const hour = new Date().getHours()
if (hour >= 6 && hour < 11) {
  periodIndex.value = 0 // 早针
} else if (hour >= 11 && hour < 16) {
  periodIndex.value = 1 // 针后5小时
} else if (hour >= 16 && hour < 22) {
  periodIndex.value = 2 // 晚针
} else {
  periodIndex.value = 1 // 针后5小时 / 加测
}

const formData = ref({
  bg_value: '',
  date: currentDate,
  time: currentTime,
  note: ''
})

const onPeriodChange = (e: any) => {
  periodIndex.value = e.detail.value
}

const onDateChange = (e: any) => {
  formData.value.date = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.bg_value)
  if (!formData.value.bg_value || isNaN(numValue) || numValue <= 0 || numValue > 100) {
    uni.showToast({ title: '请输入正确的血糖值 (0-100)', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  
  try {
    let periodName = periodOptions.value[periodIndex.value]
    if (periodName === '其他') {
      periodName = customPeriodText.value.trim() || '其他'
    }

    const recordDateTime = makeLocalTimestamp(formData.value.date, formData.value.time)

    const recordData = {
      cat_id: uni.getStorageSync('currentCatId') || 'default',
      bg_value: numValue,
      period: periodName,
      status: periodName,
      record_date: formData.value.date,
      measure_time: formData.value.time,
      note: formData.value.note,
      createTime: recordDateTime
    }
    
    await callApi('addRecord', { type: 'blood_glucose', recordData })
    
    uni.showToast({ title: '记录成功', icon: 'success' })
    setTimeout(() => {
      safeNavigateBack()
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
.container {
  padding: 32rpx;
  min-height: 100vh;
  background-color: var(--bg-color);
  box-sizing: border-box;
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.03);
  margin-bottom: 40rpx;
}
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
  font-weight: 500;
}
.huge-input {
  height: 120rpx;
}
.bg-input {
  font-size: 64rpx;
  font-weight: 700;
  color: #E53E3E;
  text-align: center;
  height: 100%;
}
.picker-view {
  background: #F8F9FA;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 30rpx;
  color: var(--text-main);
}
.icon-arrow {
  color: #BDC3C7;
  font-size: 24rpx;
}
.input-wrap {
  background: #F8F9FA;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  display: flex;
  align-items: center;
}
.input-wrap input {
  width: 100%;
  font-size: 30rpx;
  color: var(--text-main);
}
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
}
.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 16rpx;
}
.q-tag {
  font-size: 24rpx;
  padding: 8rpx 20rpx;
  background: #F4F6F7;
  color: #5D6D7E;
  border-radius: 100rpx;
  transition: all 0.2s;
}
.q-tag.active {
  background: #FFF5F5;
  color: #E53E3E;
  font-weight: 600;
}
.q-tag.is-custom {
  border: 1rpx dashed #FEB2B2;
}
.tag-hint {
  font-size: 20rpx;
  color: #A0AEC0;
  margin-top: 8rpx;
  display: block;
}
.custom-input-card {
  margin-top: 16rpx;
  padding: 16rpx;
  background: #FFFBFB;
  border: 2rpx dashed #FEB2B2;
  border-radius: 16rpx;
}
.save-shortcut-row {
  margin-top: 12rpx;
  display: flex;
  justify-content: flex-end;
}
.btn-save-shortcut {
  font-size: 24rpx;
  padding: 8rpx 24rpx;
  line-height: 1.5;
  background: #FED7D7;
  color: #9B2C2C;
  border-radius: 100rpx;
  border: none;
  font-weight: 600;
}
.submit-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #E53E3E, #F56565);
}
</style>
