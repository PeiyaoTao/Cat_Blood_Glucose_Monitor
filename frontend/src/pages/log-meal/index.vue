<template>
  <view class="container">
    <!-- 自动喂食机托管提示横条 -->
    <view class="feeder-banner" @click="goToAutoFeeder">
      <view class="banner-left">
        <view class="icon-svg icon-feeder-sm"></view>
        <text class="banner-text" v-if="feederState.isRunning">
          自动喂食托管中 (每日 {{ feederState.mealCount }} 顿 · {{ feederState.totalGrams }}g)
        </text>
        <text class="banner-text" v-else-if="feederState.hasConfig">
          自动喂食托管已暂停
        </text>
        <text class="banner-text text-muted" v-else>
          正在使用自动喂食机？开启定时出餐托管
        </text>
      </view>
      <text class="banner-link">{{ feederState.hasConfig ? '管理计划 >' : '去设置 >' }}</text>
    </view>

    <view class="card">
      <view class="form-group">
        <text class="label">进食克数 (g) <text class="required">*</text></text>
        <view class="input-wrap huge-input">
          <input type="digit" v-model="formData.food_grams" placeholder="0.0" class="bg-input" />
        </view>
      </view>

      <view class="form-group">
        <text class="label">餐次阶段</text>
        <picker :range="mealPeriodOptions" @change="onPeriodChange" :value="periodIndex">
          <view class="picker-view">
            {{ mealPeriodOptions[periodIndex] }}
            <text class="icon-arrow">▼</text>
          </view>
        </picker>
      </view>

      <view class="grid-2">
        <view class="form-group">
          <text class="label">进食日期</text>
          <picker mode="date" @change="onDateChange" :value="formData.date">
            <view class="picker-view">
              {{ formData.date }}
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

      <!-- 罐头品牌/批次 -->
      <view class="form-group">
        <view class="label-row">
          <text class="label">罐头品牌 / 批次 (选填)</text>
          <text class="save-link" v-if="formData.food_brand.trim()" @click="saveCustomFoodBrand">
            保存为常用罐头
          </text>
        </view>
        <view class="input-wrap">
          <input type="text" v-model="formData.food_brand" placeholder="例如: 巅峰牛肉 20260101 / K9羊肉" />
        </view>
        <!-- 快捷食物标签 -->
        <view class="quick-tags">
          <text 
            class="q-tag" 
            :class="{ active: formData.food_brand === tag, 'is-custom': isCustomFood(tag) }" 
            v-for="tag in allFoodTags" 
            :key="tag" 
            @click="formData.food_brand = tag"
            @longpress="onLongPressFood(tag)"
          >
            {{ tag }}
          </text>
        </view>
        <text class="tag-hint" v-if="customFoodList.length > 0">提示：长按自定义罐头标签可弹出删除</text>
      </view>

      <!-- 附带东西/补剂 -->
      <view class="form-group">
        <view class="label-row">
          <text class="label">附带东西 / 补剂用药 (选填)</text>
          <text class="save-link" v-if="formData.extras.trim()" @click="saveCustomExtras">
            保存为常用补剂
          </text>
        </view>
        <view class="input-wrap">
          <input type="text" v-model="formData.extras" placeholder="例如: 益生菌、鱼油、辅酶Q10、皮下补水30ml" />
        </view>
        <!-- 快捷补剂标签 -->
        <view class="quick-tags">
          <text 
            class="q-tag" 
            :class="{ 'is-custom': isCustomExtra(tag) }"
            v-for="tag in allExtraTags" 
            :key="tag" 
            @click="appendExtra(tag)"
            @longpress="onLongPressExtra(tag)"
          >
            + {{ tag }}
          </text>
        </view>
        <text class="tag-hint" v-if="customExtraList.length > 0">提示：长按自定义补剂标签可弹出删除</text>
      </view>

      <view class="form-group">
        <text class="label">备注 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="例如: 胃口很好，全部吃完，精神佳" />
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      {{ isEditMode ? '保存修改' : '保存饮食记录' }}
    </button>
  </view>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { onLoad, onShow } from '@dcloudio/uni-app'
import { callApi, getLocalTodayDate, getLocalCurrentTime, makeLocalTimestamp, safeNavigateBack } from '@/utils/api'
import { getFeederConfig, isFeederConfigValid } from '@/utils/feederSync'
import { useCustomPresets } from '@/composables/useCustomPresets'

const isEditMode = ref(false)
const editRecordId = ref('')

const mealPeriodOptions = ['早餐 (早针餐)', '午餐/加餐', '晚餐 (晚针餐)', '夜宵/夜间加餐', '常规喂食', '自动喂食机出餐']
const periodIndex = ref(0)

const feederState = ref({
  hasConfig: false,
  isRunning: false,
  mealCount: 0,
  totalGrams: 0
})

const refreshFeederState = () => {
  const catId = uni.getStorageSync('currentCatId') || 'default'
  const cfg = getFeederConfig(catId)
  const valid = isFeederConfigValid(cfg)
  const total = (cfg.schedule || []).reduce((sum, item) => sum + (Number(item.food_grams) || 0), 0)
  feederState.value = {
    hasConfig: valid,
    isRunning: cfg.is_active && valid,
    mealCount: cfg.schedule ? cfg.schedule.length : 0,
    totalGrams: total
  }
}

const goToAutoFeeder = () => {
  uni.navigateTo({ url: '/packageTools/auto-feeder/index' })
}

const defaultFoodTags = ['巅峰牛肉', 'K9羊肉', '小李子', 'RAWZ兔肉', '冻干主食', '处方低碳粮']
const {
  customList: customFoodList,
  allOptions: allFoodTags,
  isCustom: isCustomFood,
  addCustom: addCustomFood,
  confirmRemoveCustom: confirmRemoveFood
} = useCustomPresets({
  storageKey: 'custom_food_brands',
  defaultItems: defaultFoodTags,
  insertPosition: 'prepend',
  deleteModalTitle: '删除常用罐头',
  savedToastText: '已保存为常用罐头',
  deletedToastText: '已删除常用罐头'
})

const defaultExtraTags = ['益生菌', '鱼油', '皮下补水', '辅酶Q10', '维生素B', '乳果糖', '磷结合剂']
const {
  customList: customExtraList,
  allOptions: allExtraTags,
  isCustom: isCustomExtra,
  addCustom: addCustomExtra,
  confirmRemoveCustom: confirmRemoveExtra
} = useCustomPresets({
  storageKey: 'custom_extras',
  defaultItems: defaultExtraTags,
  insertPosition: 'prepend',
  deleteModalTitle: '删除常用补剂',
  savedToastText: '已保存为常用补剂',
  deletedToastText: '已删除常用补剂'
})

onMounted(() => {
  refreshFeederState()
})

onShow(() => {
  refreshFeederState()
})

const saveCustomFoodBrand = () => {
  addCustomFood(formData.value.food_brand)
}

const onLongPressFood = (tag: string) => {
  confirmRemoveFood(tag, (removed) => {
    if (formData.value.food_brand === removed) formData.value.food_brand = ''
  })
}

const saveCustomExtras = () => {
  addCustomExtra(formData.value.extras)
}

const onLongPressExtra = (tag: string) => {
  confirmRemoveExtra(tag)
}

const isSubmitting = ref(false)

const currentDate = getLocalTodayDate()
const currentTime = getLocalCurrentTime()
const hour = new Date().getHours()

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
  date: currentDate,
  time: currentTime,
  food_brand: '',
  extras: '',
  note: ''
})

onLoad((options: any) => {
  if (options && options.edit === '1' && options.id) {
    const cached = uni.getStorageSync('editing_record')
    if (cached && cached._id === options.id) {
      isEditMode.value = true
      editRecordId.value = cached._id
      uni.setNavigationBarTitle({ title: '编辑饮食记录' })
      formData.value.food_grams = cached.food_grams !== undefined ? String(cached.food_grams) : ''
      formData.value.date = cached.record_date || currentDate
      formData.value.time = cached.meal_time || currentTime
      formData.value.food_brand = cached.food_brand || ''
      formData.value.extras = cached.extras || ''
      formData.value.note = cached.note || ''
      if (cached.period) {
        const pIdx = mealPeriodOptions.indexOf(cached.period)
        if (pIdx !== -1) periodIndex.value = pIdx
      }
    }
  }
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
    const recordDateTime = makeLocalTimestamp(formData.value.date, formData.value.time)
    const catId = uni.getStorageSync('currentCatId') || 'default'

    const recordData = {
      cat_id: catId,
      food_grams: numValue,
      period: periodName,
      record_date: formData.value.date,
      meal_time: formData.value.time,
      food_brand: formData.value.food_brand || '',
      extras: formData.value.extras || '',
      note: formData.value.note,
      createTime: recordDateTime
    }

    try {
      uni.setStorageSync('last_meal_pref', {
        food_grams: String(numValue),
        food_brand: formData.value.food_brand || ''
      })
    } catch (e) {}
    
    if (isEditMode.value && editRecordId.value) {
      await callApi('updateRecord', {
        catId,
        type: 'meal_records',
        recordId: editRecordId.value,
        recordData
      })
      uni.removeStorageSync('editing_record')
      uni.showToast({ title: '修改成功', icon: 'success' })
    } else {
      await callApi('addRecord', { type: 'meal_records', recordData })
      uni.showToast({ title: '饮食记录成功', icon: 'success' })
    }
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
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16rpx;
}
.label {
  font-size: 28rpx;
  color: var(--text-sub);
  font-weight: 500;
  display: block;
}
.save-link {
  font-size: 24rpx;
  color: #D97706;
  font-weight: 600;
}
.huge-input {
  height: 120rpx;
}
.bg-input {
  font-size: 64rpx;
  font-weight: 700;
  color: #D69E2E;
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
  background: #FEF3C7;
  color: #B45309;
  font-weight: 600;
}
.q-tag.is-custom {
  border: 1rpx dashed #F59E0B;
}
.tag-hint {
  font-size: 20rpx;
  color: #A0AEC0;
  margin-top: 8rpx;
  display: block;
}
.submit-btn {
  width: 100%;
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #D69E2E, #ECC94B);
}

/* 自动喂食机横条 */
.feeder-banner {
  background: #F0FDF4;
  border: 2rpx solid #BBF7D0;
  border-radius: 20rpx;
  padding: 20rpx 28rpx;
  margin-bottom: 28rpx;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.banner-left {
  display: flex;
  align-items: center;
  flex: 1;
}
.icon-svg {
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-feeder-sm {
  width: 36rpx;
  height: 36rpx;
  margin-right: 14rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310B981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='4' width='20' height='16' rx='2'/%3E%3Cpath d='M6 8h4'/%3E%3Cpath d='M6 12h8'/%3E%3Ccircle cx='16' cy='8' r='2'/%3E%3Cpath d='M10 16h8'/%3E%3C/svg%3E");
}
.banner-text {
  font-size: 24rpx;
  font-weight: 600;
  color: #047857;
}
.banner-text.text-paused {
  color: #D97706;
}
.banner-text.text-muted {
  color: #4B5563;
}
.banner-link {
  font-size: 22rpx;
  font-weight: 700;
  color: #059669;
  margin-left: 12rpx;
}
</style>
