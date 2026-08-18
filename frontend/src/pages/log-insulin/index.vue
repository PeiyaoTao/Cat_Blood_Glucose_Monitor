<template>
  <view class="container">
    <view class="card">
      <view class="form-group">
        <text class="label">注射剂量 (单位/U) <text class="required">*</text></text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.dose" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="grid-2">
        <view class="form-group">
          <text class="label">针次阶段</text>
          <picker :range="periodOptions" @change="onPeriodChange" :value="periodIndex">
            <view class="picker-view">
              {{ periodOptions[periodIndex] }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">剂量调整 (选填)</text>
          <picker :range="adjustOptions" @change="onAdjustChange" :value="adjustIndex">
            <view class="picker-view">
              {{ adjustOptions[adjustIndex] }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
      </view>

      <!-- 胰岛素类型 -->
      <view class="form-group">
        <text class="label">胰岛素类型</text>
        <picker :range="insulinOptions" @change="onInsulinChange" :value="insulinIndex">
          <view class="picker-view">
            {{ insulinOptions[insulinIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>

        <!-- 快捷标签栏 -->
        <view class="quick-tags" v-if="insulinOptions.length > 0">
          <text 
            class="q-tag" 
            :class="{ active: insulinIndex === idx, 'is-custom': isCustomTag(opt) }" 
            v-for="(opt, idx) in insulinOptions" 
            :key="opt" 
            @click="selectInsulinByIndex(idx)"
            @longpress="onLongPressInsulin(opt)"
          >
            {{ opt.split(' ')[0] }}
          </text>
        </view>
        <text class="tag-hint" v-if="customInsulinList.length > 0">提示：长按自定义快捷标签可弹出删除</text>

        <!-- 选择“其他”时展开自定义输入与快捷保存 -->
        <view class="custom-input-card" v-if="isCustomInsulin">
          <view class="input-wrap">
            <input 
              type="text" 
              v-model="customInsulinText" 
              placeholder="请输入具体胰岛素名称/品牌..." 
            />
          </view>
          <view class="save-shortcut-row" v-if="customInsulinText.trim()">
            <button class="btn-save-shortcut" @click="saveCustomInsulin">
              ⭐️ 保存为常用选项
            </button>
          </view>
        </view>
      </view>

      <view class="grid-2">
        <view class="form-group">
          <text class="label">注射日期</text>
          <picker mode="date" @change="onDateChange" :value="formData.date">
            <view class="picker-view">
              {{ formData.date }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">注射时间</text>
          <picker mode="time" @change="onTimeChange" :value="formData.time">
            <view class="picker-view">
              {{ formData.time }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
      </view>

      <view class="form-group">
        <text class="label">备注 (注射部位、配合度等)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="例如: 左侧颈部皮下，打针配合良好" />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      保存打针记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { callApi, getLocalTodayDate, getLocalCurrentTime, makeLocalTimestamp, safeNavigateBack } from '@/utils/api'

const periodOptions = ['早针', '晚针', '临时加针']
const periodIndex = ref(0)

const adjustOptions = [
  '维持原量',
  '增加 +0.25U',
  '增加 +0.50U',
  '减少 -0.25U',
  '减少 -0.50U',
  '首次剂量设定',
  '其他调整'
]
const adjustIndex = ref(0)

const defaultInsulins = ['甘精胰岛素 (Glargine)', '地特胰岛素 (Detemir)', '中效胰岛素 (NPH)']
const customInsulinList = ref<string[]>([])
const insulinIndex = ref(0)
const customInsulinText = ref('')

const loadSavedInsulins = () => {
  const saved = uni.getStorageSync('custom_insulin_types')
  if (saved && Array.isArray(saved)) {
    customInsulinList.value = saved
  }
}

onMounted(() => {
  loadSavedInsulins()
})

const insulinOptions = computed(() => {
  return [...defaultInsulins, ...customInsulinList.value, '其他']
})

const isCustomInsulin = computed(() => {
  return insulinOptions.value[insulinIndex.value] === '其他'
})

const isCustomTag = (opt: string) => customInsulinList.value.includes(opt)

const selectInsulinByIndex = (idx: number) => {
  insulinIndex.value = idx
}

const saveCustomInsulin = () => {
  const text = customInsulinText.value.trim()
  if (!text) return
  if (!customInsulinList.value.includes(text) && !defaultInsulins.includes(text)) {
    const updated = [...customInsulinList.value, text]
    customInsulinList.value = updated
    uni.setStorageSync('custom_insulin_types', updated)
    uni.showToast({ title: '已保存为快捷选项', icon: 'success' })
    setTimeout(() => {
      const newIdx = insulinOptions.value.findIndex(item => item === text)
      if (newIdx !== -1) {
        insulinIndex.value = newIdx
      }
    }, 100)
  } else {
    uni.showToast({ title: '该选项已存在', icon: 'none' })
  }
}

const onLongPressInsulin = (opt: string) => {
  if (!customInsulinList.value.includes(opt)) return
  uni.showModal({
    title: '删除快捷选项',
    content: `确定要删除自定义常用选项「${opt}」吗？`,
    confirmText: '删除',
    confirmColor: '#E74C3C',
    success: (res) => {
      if (res.confirm) {
        const updated = customInsulinList.value.filter(item => item !== opt)
        customInsulinList.value = updated
        uni.setStorageSync('custom_insulin_types', updated)
        insulinIndex.value = 0
        uni.showToast({ title: '已删除常用选项', icon: 'success' })
      }
    }
  })
}

const isSubmitting = ref(false)

const currentDate = getLocalTodayDate()
const currentTime = getLocalCurrentTime()
const hour = new Date().getHours()

// 自动根据时间预设针次（早针 / 晚针）
if (hour >= 5 && hour < 14) {
  periodIndex.value = 0 // 早针
} else {
  periodIndex.value = 1 // 晚针
}

const formData = ref({
  dose: '',
  date: currentDate,
  time: currentTime,
  note: ''
})

const onPeriodChange = (e: any) => {
  periodIndex.value = e.detail.value
}

const onAdjustChange = (e: any) => {
  adjustIndex.value = e.detail.value
}

const onInsulinChange = (e: any) => {
  insulinIndex.value = e.detail.value
}

const onDateChange = (e: any) => {
  formData.value.date = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.dose)
  if (!formData.value.dose || isNaN(numValue) || numValue <= 0 || numValue > 20) {
    uni.showToast({ title: '请输入正确的剂量 (一般不超过20U)', icon: 'none' })
    return
  }
  
  isSubmitting.value = true
  
  try {
    const periodName = periodOptions[periodIndex.value]
    const doseAdj = adjustIndex.value === 0 ? '维持原量' : adjustOptions[adjustIndex.value]
    const recordDateTime = makeLocalTimestamp(formData.value.date, formData.value.time)
    
    // 提取最终胰岛素类型
    let finalInsulinType = insulinOptions.value[insulinIndex.value]
    if (finalInsulinType === '其他') {
      finalInsulinType = customInsulinText.value.trim() || '其他'
    }

    const recordData = {
      cat_id: uni.getStorageSync('currentCatId') || 'default',
      dose: numValue,
      period: periodName,
      dose_adjustment: doseAdj,
      insulin_type: finalInsulinType,
      record_date: formData.value.date,
      inject_time: formData.value.time,
      note: formData.value.note,
      createTime: recordDateTime
    }
    
    await callApi('addRecord', { type: 'insulin_records', recordData })
    
    uni.showToast({ title: '打针记录成功', icon: 'success' })
    setTimeout(() => {
      safeNavigateBack()
    }, 1500)
  } catch (err: any) {
    console.error(err)
    uni.showToast({ title: '提交失败:' + err.message, icon: 'none' })
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
  color: #DD6B20;
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
  background: #FFF0E6;
  color: #DD6B20;
  font-weight: 600;
}
.q-tag.is-custom {
  border: 1rpx dashed #F6AD55;
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
  background: #FFFDF9;
  border: 2rpx dashed #FCD34D;
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
  background: #FEF3C7;
  color: #B45309;
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
  background: linear-gradient(135deg, #DD6B20, #ED8936);
}
</style>
