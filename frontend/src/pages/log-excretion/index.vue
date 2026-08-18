<template>
  <view class="container">
    <view class="card">
      <view class="card-title-bar">
        <text class="title">排尿与排便健康记录</text>
        <text class="sub-title">用于长期监控糖尿病猫咪的水合状况与消化排泄</text>
      </view>

      <!-- 排尿情况 -->
      <view class="form-group">
        <text class="label">排尿状况 / 尿量评估 <text class="required">*</text></text>
        <picker :range="urineOptions" @change="onUrineChange" :value="urineIndex">
          <view class="picker-view">
            {{ urineOptions[urineIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
        <!-- 快捷尿团数标签 -->
        <view class="quick-tags">
          <text 
            class="q-tag" 
            :class="{ active: urineOptions[urineIndex] === tag }" 
            v-for="tag in quickUrineTags" 
            :key="tag" 
            @click="setQuickUrine(tag)"
          >
            {{ tag }}
          </text>
        </view>
      </view>

      <!-- 排便状态 -->
      <view class="form-group">
        <text class="label">排便状态 / 粪便形态</text>
        <picker :range="stoolStatusOptions" @change="onStoolStatusChange" :value="stoolStatusIndex">
          <view class="picker-view">
            {{ stoolStatusOptions[stoolStatusIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
        <!-- 快捷排便形态标签 -->
        <view class="quick-tags">
          <text 
            class="q-tag" 
            :class="{ active: stoolStatusOptions[stoolStatusIndex] === tag }" 
            v-for="tag in quickStoolTags" 
            :key="tag" 
            @click="setQuickStool(tag)"
          >
            {{ tag }}
          </text>
        </view>
      </view>

      <!-- 粪便颜色/特征 -->
      <view class="form-group">
        <text class="label">粪便颜色 / 特征 (选填)</text>
        <picker :range="stoolColorOptions" @change="onStoolColorChange" :value="stoolColorIndex">
          <view class="picker-view">
            {{ stoolColorOptions[stoolColorIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>

        <!-- 快捷颜色/特征标签 -->
        <view class="quick-tags">
          <text 
            class="q-tag" 
            :class="{ active: stoolColorIndex === idx, 'is-custom': isCustomStoolColorTag(colorOpt) }" 
            v-for="(colorOpt, idx) in stoolColorOptions" 
            :key="colorOpt" 
            @click="stoolColorIndex = idx"
            @longpress="onLongPressStoolColor(colorOpt)"
          >
            {{ colorOpt }}
          </text>
        </view>
        <text class="tag-hint" v-if="customStoolColorList.length > 0">提示：长按自定义特征标签可弹出删除</text>

        <!-- 选择“其他”时展开自定义输入与快捷保存 -->
        <view class="custom-input-card" v-if="isCustomStoolColor">
          <view class="input-wrap">
            <input 
              type="text" 
              v-model="customStoolColorText" 
              placeholder="请输入具体粪便颜色/特征 (如: 黄褐色软糊、含毛球)..." 
            />
          </view>
          <view class="save-shortcut-row" v-if="customStoolColorText.trim()">
            <button class="btn-save-shortcut" @click="saveCustomStoolColor">
              ⭐️ 保存为常用选项
            </button>
          </view>
        </view>
      </view>

      <!-- 日期与时间 -->
      <view class="grid-2">
        <view class="form-group">
          <text class="label">记录日期</text>
          <picker mode="date" @change="onDateChange" :value="formData.date">
            <view class="picker-view">
              {{ formData.date }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
        <view class="form-group">
          <text class="label">记录时间</text>
          <picker mode="time" @change="onTimeChange" :value="formData.time">
            <view class="picker-view">
              {{ formData.time }}
              <text class="icon-arrow">▼</text>
            </view>
          </picker>
        </view>
      </view>

      <!-- 备注 -->
      <view class="form-group">
        <text class="label">护理备注 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="例如: 精神佳，排便顺畅，已做皮下补水" />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      保存排泄记录
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { callApi, getLocalTodayDate, getLocalCurrentTime, makeLocalTimestamp, safeNavigateBack } from '@/utils/api'

const urineOptions = [
  '正常 (3~4团)',
  '偏多 (>5团)',
  '偏少 (<2团)',
  '多饮多尿',
  '未排尿/未清理'
]
const urineIndex = ref(0)
const quickUrineTags = ['2团', '3团', '4团', '5团', '多饮多尿']

const stoolStatusOptions = [
  '正常条状成型',
  '干硬颗粒 (轻度便秘)',
  '软便糊状',
  '水样腹泻',
  '未排便'
]
const stoolStatusIndex = ref(0)
const quickStoolTags = ['正常成型', '干硬颗粒', '软便', '未排便']

const defaultStoolColors = ['正常深褐色', '浅黄褐色', '黑色/柏油样', '带血丝/黏液']
const customStoolColorList = ref<string[]>([])
const stoolColorIndex = ref(0)
const customStoolColorText = ref('')

const loadSavedColors = () => {
  const saved = uni.getStorageSync('custom_stool_colors')
  if (saved && Array.isArray(saved)) {
    customStoolColorList.value = saved
  }
}

onMounted(() => {
  loadSavedColors()
})

const stoolColorOptions = computed(() => {
  return [...defaultStoolColors, ...customStoolColorList.value, '其他']
})

const isCustomStoolColor = computed(() => {
  return stoolColorOptions.value[stoolColorIndex.value] === '其他'
})

const isCustomStoolColorTag = (opt: string) => customStoolColorList.value.includes(opt)

const saveCustomStoolColor = () => {
  const text = customStoolColorText.value.trim()
  if (!text) return
  if (!customStoolColorList.value.includes(text) && !defaultStoolColors.includes(text)) {
    const updated = [...customStoolColorList.value, text]
    customStoolColorList.value = updated
    uni.setStorageSync('custom_stool_colors', updated)
    uni.showToast({ title: '已保存为常用选项', icon: 'success' })
    setTimeout(() => {
      const newIdx = stoolColorOptions.value.findIndex(item => item === text)
      if (newIdx !== -1) {
        stoolColorIndex.value = newIdx
      }
    }, 100)
  } else {
    uni.showToast({ title: '该选项已在常用列表中', icon: 'none' })
  }
}

const onLongPressStoolColor = (opt: string) => {
  if (!customStoolColorList.value.includes(opt)) return
  uni.showModal({
    title: '删除快捷特征',
    content: `确定要删除自定义选项「${opt}」吗？`,
    confirmText: '删除',
    confirmColor: '#E74C3C',
    success: (res) => {
      if (res.confirm) {
        const updated = customStoolColorList.value.filter(item => item !== opt)
        customStoolColorList.value = updated
        uni.setStorageSync('custom_stool_colors', updated)
        stoolColorIndex.value = 0
        uni.showToast({ title: '已删除常用特征', icon: 'success' })
      }
    }
  })
}

const isSubmitting = ref(false)

const currentDate = getLocalTodayDate()
const currentTime = getLocalCurrentTime()

const formData = ref({
  date: currentDate,
  time: currentTime,
  note: ''
})

const setQuickUrine = (tag: string) => {
  const matchIdx = urineOptions.findIndex(opt => opt.includes(tag) || tag.includes(opt))
  if (matchIdx !== -1) {
    urineIndex.value = matchIdx
  } else {
    if (tag === '2团') urineIndex.value = 2
    else if (tag === '3团' || tag === '4团') urineIndex.value = 0
    else if (tag === '5团') urineIndex.value = 1
    else if (tag === '多饮多尿') urineIndex.value = 3
  }
}

const setQuickStool = (tag: string) => {
  const matchIdx = stoolStatusOptions.findIndex(opt => opt.includes(tag))
  if (matchIdx !== -1) {
    stoolStatusIndex.value = matchIdx
  }
}

const onUrineChange = (e: any) => {
  urineIndex.value = e.detail.value
}

const onStoolStatusChange = (e: any) => {
  stoolStatusIndex.value = e.detail.value
}

const onStoolColorChange = (e: any) => {
  stoolColorIndex.value = e.detail.value
}

const onDateChange = (e: any) => {
  formData.value.date = e.detail.value
}

const onTimeChange = (e: any) => {
  formData.value.time = e.detail.value
}

const submitRecord = async () => {
  isSubmitting.value = true
  
  try {
    const urineVal = urineOptions[urineIndex.value]
    const stoolStatusVal = stoolStatusOptions[stoolStatusIndex.value]
    
    let stoolColorVal = stoolColorOptions.value[stoolColorIndex.value]
    if (stoolColorVal === '其他') {
      stoolColorVal = customStoolColorText.value.trim() || '其他'
    }

    const recordDateTime = makeLocalTimestamp(formData.value.date, formData.value.time)

    const recordData = {
      cat_id: uni.getStorageSync('currentCatId') || 'default',
      urine: urineVal,
      stool_status: stoolStatusVal,
      stool_color: stoolColorVal,
      record_date: formData.value.date,
      record_time: formData.value.time,
      note: formData.value.note,
      createTime: recordDateTime
    }
    
    await callApi('addRecord', { type: 'excretion_records', recordData })
    
    uni.showToast({ title: '排泄记录成功', icon: 'success' })
    setTimeout(() => {
      safeNavigateBack()
    }, 1500)
  } catch (err: any) {
    console.error(err)
    if (err.message && err.message.includes('not exist')) {
      uni.showToast({ title: '请先在云端创建 excretion_records 集合！', icon: 'none', duration: 4000 })
    } else {
      uni.showToast({ title: '提交失败:' + err.message, icon: 'none', duration: 3000 })
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
  box-sizing: border-box;
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 36rpx 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.03);
  margin-bottom: 40rpx;
}
.card-title-bar {
  margin-bottom: 32rpx;
  padding-bottom: 20rpx;
  border-bottom: 2rpx solid #F2F4F4;
}
.card-title-bar .title {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
  display: block;
  margin-bottom: 6rpx;
}
.card-title-bar .sub-title {
  font-size: 24rpx;
  color: var(--text-sub);
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
.picker-view {
  background: #F8F9FA;
  border-radius: 16rpx;
  padding: 24rpx 32rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 30rpx;
  color: var(--text-main);
  border: 2rpx solid transparent;
  transition: all 0.2s;
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
  background: #E8F8F5;
  color: #16A085;
  font-weight: 600;
}
.q-tag.is-custom {
  border: 1rpx dashed #16A085;
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
  background: #F0FDF4;
  border: 2rpx dashed #86EFAC;
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
  background: #DCFCE7;
  color: #15803D;
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
  background: linear-gradient(135deg, #16A085, #2ECC71);
}
</style>
