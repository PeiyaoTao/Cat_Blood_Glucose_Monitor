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
              placeholder="请输入自定义时效 (如: 餐后1小时、餐后3小时)..." 
            />
          </view>
          <view class="save-shortcut-row" v-if="customPeriodText.trim()">
            <button class="btn-save-shortcut" @click="saveCustomPeriod">
              保存为常用时效
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

      <view class="form-group" style="margin-bottom: 0;">
        <text class="label">备注 (选填)</text>
        <view class="input-wrap">
          <input type="text" v-model="formData.note" placeholder="精神状态、测糖情况等..." />
        </view>
      </view>
    </view>

    <!-- 一站式组合打卡区（仅在新增记录时展示，默认折叠保持清爽） -->
    <view class="combo-section" v-if="!isEditMode">
      <view class="combo-header-bar">
        <text class="combo-section-title">一站式同步打卡 (选填)</text>
        <text class="combo-section-sub">早晚护理可一次保存，共用测量时间</text>
      </view>

      <!-- 1. 同步记打针折叠卡 -->
      <view class="combo-card" :class="{ active: syncInsulin }">
        <view class="combo-toggle-row" @click="toggleSyncInsulin">
          <view class="combo-toggle-left">
            <view class="combo-icon icon-syringe-sm"></view>
            <text class="combo-toggle-title">同步记录打针</text>
            <text class="combo-badge badge-orange" v-if="syncInsulin && insulinForm.dose">{{ insulinForm.dose }}U</text>
          </view>
          <view class="combo-check" :class="{ checked: syncInsulin }">
            <text v-if="syncInsulin">✓</text>
            <text v-else>+</text>
          </view>
        </view>

        <view class="combo-body" v-if="syncInsulin">
          <view class="grid-2">
            <view class="form-group compact">
              <text class="label">注射剂量 (U) <text class="required">*</text></text>
              <view class="input-wrap">
                <input type="digit" v-model="insulinForm.dose" placeholder="例如: 1.5" />
              </view>
            </view>
            <view class="form-group compact">
              <text class="label">针次阶段</text>
              <picker :range="insulinPeriods" @change="onInsulinPeriodChange" :value="insulinForm.periodIdx">
                <view class="picker-view">
                  {{ insulinPeriods[insulinForm.periodIdx] }}
                  <text class="icon-arrow">▼</text>
                </view>
              </picker>
            </view>
          </view>
          <view class="form-group compact" style="margin-bottom: 0;">
            <text class="label">胰岛素类型</text>
            <view class="quick-tags" style="margin-top: 8rpx;">
              <text
                class="q-tag tag-orange"
                :class="{ active: insulinForm.type === opt }"
                v-for="opt in insulinTypeTags"
                :key="opt"
                @click="insulinForm.type = opt"
              >
                {{ opt.split(' ')[0] }}
              </text>
            </view>
          </view>
        </view>
      </view>

      <!-- 2. 同步记喂食折叠卡 -->
      <view class="combo-card" :class="{ active: syncMeal }">
        <view class="combo-toggle-row" @click="toggleSyncMeal">
          <view class="combo-toggle-left">
            <view class="combo-icon icon-meal-sm"></view>
            <text class="combo-toggle-title">同步记录喂食</text>
            <text class="combo-badge badge-amber" v-if="syncMeal && mealForm.food_grams">{{ mealForm.food_grams }}g</text>
          </view>
          <view class="combo-check" :class="{ checked: syncMeal }">
            <text v-if="syncMeal">✓</text>
            <text v-else>+</text>
          </view>
        </view>

        <view class="combo-body" v-if="syncMeal">
          <view class="grid-2">
            <view class="form-group compact">
              <text class="label">进食克数 (g) <text class="required">*</text></text>
              <view class="input-wrap">
                <input type="digit" v-model="mealForm.food_grams" placeholder="例如: 45" />
              </view>
            </view>
            <view class="form-group compact">
              <text class="label">餐次阶段</text>
              <picker :range="mealPeriods" @change="onMealPeriodChange" :value="mealForm.periodIdx">
                <view class="picker-view">
                  {{ mealPeriods[mealForm.periodIdx] }}
                  <text class="icon-arrow">▼</text>
                </view>
              </picker>
            </view>
          </view>
          <view class="form-group compact" style="margin-bottom: 0;">
            <text class="label">罐头品牌 / 批次 (选填)</text>
            <view class="input-wrap">
              <input type="text" v-model="mealForm.food_brand" placeholder="点击下方常用标签或直接输入" />
            </view>
            <view class="quick-tags" style="margin-top: 12rpx;">
              <text
                class="q-tag tag-amber"
                :class="{ active: mealForm.food_brand === tag }"
                v-for="tag in foodBrandTags"
                :key="tag"
                @click="mealForm.food_brand = tag"
              >
                {{ tag }}
              </text>
            </view>
          </view>
        </view>
      </view>
    </view>

    <button class="btn btn-primary submit-btn" :loading="isSubmitting" @click="submitRecord">
      {{ submitBtnText }}
    </button>

    <!-- 低血糖分级急救预警弹窗 -->
    <view class="hypo-modal-mask" v-if="hypoModal.visible" @tap.stop>
      <view class="hypo-modal-card" :class="hypoModal.isSevere ? 'severe' : 'mild'">
        <view class="hypo-header">
          <view class="hypo-alert-icon"></view>
          <view class="hypo-title-wrap">
            <text class="hypo-title">{{ hypoModal.isSevere ? '高危低血糖紧急预警' : '血糖偏低观察提示' }}</text>
            <text class="hypo-val-badge">当前血糖 {{ hypoModal.bgValue }} mmol/L</text>
          </view>
        </view>

        <view class="hypo-sop-box" v-if="hypoModal.isSevere">
          <text class="sop-lead">当前数值低于 3.9 mmol/L 临床警戒线，请立即采取措施：</text>
          <view class="sop-step">
            <text class="step-num">1</text>
            <text class="step-text">立即停止注射胰岛素！千万不可继续打针。</text>
          </view>
          <view class="sop-step">
            <text class="step-num">2</text>
            <text class="step-text">若精神萎靡/抽搐：立即将蜂蜜、糖水或50%葡萄糖涂抹于猫咪牙龈粘膜。</text>
          </view>
          <view class="sop-step">
            <text class="step-num">3</text>
            <text class="step-text">若尚能主动进食：立即喂食高碳水罐头、肉泥或干粮。</text>
          </view>
          <view class="sop-step">
            <text class="step-num">4</text>
            <text class="step-text">15 分钟后务必复测耳血；若症状未缓解请立即送医急诊。</text>
          </view>
        </view>

        <view class="hypo-sop-box" v-else>
          <text class="sop-lead">当前血糖低于预设安全目标下限 ({{ currentTargetRange.min }} mmol/L)：</text>
          <view class="sop-step">
            <text class="step-num">1</text>
            <text class="step-text">若正准备打针：建议先喂食观察或咨询主治兽医是否减量/暂缓。</text>
          </view>
          <view class="sop-step">
            <text class="step-num">2</text>
            <text class="step-text">若为针后峰值期：可适当补充少量主食罐头防止继续下探。</text>
          </view>
          <view class="sop-step">
            <text class="step-num">3</text>
            <text class="step-text">建议 30 分钟后复测一次血糖，确认回升趋势。</text>
          </view>
        </view>

        <view class="hypo-actions">
          <button
            class="hypo-btn-primary"
            :loading="hypoModal.settingReminder"
            @click="handleSetRetestReminder"
          >
            {{ hypoModal.reminderSet ? '已开启复测提醒' : `一键开启 ${hypoModal.retestMinutes} 分钟后复测提醒` }}
          </button>
          <button class="hypo-btn-secondary" @click="closeHypoModalAndBack">
            我知道了，返回上一页
          </button>
        </view>

        <view class="hypo-footer-opt" @click="disableHypoAlertPermanently">
          <text>不再弹出此提醒 (可在「我的」或「猫咪档案」中重新开启)</text>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { onLoad } from '@dcloudio/uni-app'
import { callApi, callCloudFunction, getLocalTodayDate, getLocalCurrentTime, makeLocalTimestamp, safeNavigateBack } from '@/utils/api'
import { useCustomPresets } from '@/composables/useCustomPresets'
import { useCatSession } from '@/composables/useCatSession'
import {
  HYPO_SEVERE_THRESHOLD,
  getHypoAlertSetting,
  setHypoAlertSetting
} from '@/utils/glucoseDomain'

const TEMPLATE_ID = 'dx18s9lpowL9wetVsrwmvIqtOh2zgPt4J4vVxs_3C9s'
const { currentCat, currentTargetRange, fetchCats } = useCatSession()

const isEditMode = ref(false)
const editRecordId = ref('')

// 基础默认时效阶段
const defaultPeriods = [
  '早针',
  '针后5小时',
  '晚针',
  '空腹',
  '餐后2小时',
  '加测/随机'
]
const {
  customList: customPeriodList,
  allOptions: periodOptions,
  isCustom: isCustomTag,
  addCustom: addCustomPeriod,
  confirmRemoveCustom: confirmRemovePeriod
} = useCustomPresets({
  storageKey: 'custom_bg_periods',
  defaultItems: defaultPeriods,
  appendOtherOption: true,
  deleteModalTitle: '删除常用时效',
  savedToastText: '已保存为常用时效',
  duplicateToastText: '该时效已存在',
  deletedToastText: '已删除常用时效'
})

const periodIndex = ref(0)
const customPeriodText = ref('')

const isCustomPeriod = computed(() => {
  return periodOptions.value[periodIndex.value] === '其他'
})

const selectPeriodByIndex = (idx: number) => {
  periodIndex.value = idx
}

const saveCustomPeriod = () => {
  const text = customPeriodText.value.trim()
  if (!text) return
  if (addCustomPeriod(text)) {
    setTimeout(() => {
      const newIdx = periodOptions.value.findIndex(item => item === text)
      if (newIdx !== -1) {
        periodIndex.value = newIdx
      }
    }, 100)
  }
}

const onLongPressPeriod = (opt: string) => {
  confirmRemovePeriod(opt, () => {
    periodIndex.value = 0
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

// ==================== 一站式同步打卡状态 ====================
const syncInsulin = ref(false)
const syncMeal = ref(false)

const insulinPeriods = ['早针', '晚针', '临时加针']
const defaultInsulins = ['甘精胰岛素 (Glargine)', '地特胰岛素 (Detemir)', '中效胰岛素 (NPH)']
const { allOptions: insulinTypeTags } = useCustomPresets({
  storageKey: 'custom_insulin_types',
  defaultItems: defaultInsulins,
  appendOtherOption: false
})

const mealPeriods = ['早餐 (早针餐)', '午餐/加餐', '晚餐 (晚针餐)', '夜宵/夜间加餐', '常规喂食']
const defaultFoodTags = ['巅峰牛肉', 'K9羊肉', '小李子', 'RAWZ兔肉', '冻干主食', '处方低碳粮']
const { allOptions: foodBrandTags } = useCustomPresets({
  storageKey: 'custom_food_brands',
  defaultItems: defaultFoodTags,
  insertPosition: 'prepend'
})

const insulinForm = ref({
  dose: '',
  periodIdx: hour >= 5 && hour < 14 ? 0 : 1,
  type: defaultInsulins[0]
})

const mealForm = ref({
  food_grams: '',
  periodIdx: hour >= 5 && hour < 11 ? 0 : (hour >= 11 && hour < 16 ? 1 : (hour >= 16 && hour < 21 ? 2 : 3)),
  food_brand: ''
})

// 自动读取最近一次打针/喂食偏好
try {
  const lastIns = uni.getStorageSync('last_insulin_pref')
  if (lastIns && typeof lastIns === 'object') {
    if (lastIns.dose) insulinForm.value.dose = String(lastIns.dose)
    if (lastIns.insulin_type) insulinForm.value.type = String(lastIns.insulin_type)
  }
  const lastMeal = uni.getStorageSync('last_meal_pref')
  if (lastMeal && typeof lastMeal === 'object') {
    if (lastMeal.food_grams) mealForm.value.food_grams = String(lastMeal.food_grams)
    if (lastMeal.food_brand) mealForm.value.food_brand = String(lastMeal.food_brand)
  }
} catch (e) {}

const toggleSyncInsulin = () => {
  syncInsulin.value = !syncInsulin.value
}

const toggleSyncMeal = () => {
  syncMeal.value = !syncMeal.value
}

const onInsulinPeriodChange = (e: any) => {
  insulinForm.value.periodIdx = Number(e.detail.value)
}

const onMealPeriodChange = (e: any) => {
  mealForm.value.periodIdx = Number(e.detail.value)
}

const submitBtnText = computed(() => {
  if (isEditMode.value) return '保存修改'
  const extras: string[] = []
  if (syncInsulin.value) extras.push('打针')
  if (syncMeal.value) extras.push('喂食')
  if (extras.length > 0) {
    return `保存血糖 + ${extras.join(' + ')}记录`
  }
  return '保存血糖记录'
})

// ==================== 低血糖急救弹窗状态 ====================
const hypoModal = ref({
  visible: false,
  bgValue: 0,
  isSevere: false,
  retestMinutes: 15,
  settingReminder: false,
  reminderSet: false
})

onLoad(async (options: any) => {
  fetchCats().catch(() => {})
  if (options && options.edit === '1' && options.id) {
    const cached = uni.getStorageSync('editing_record')
    if (cached && cached._id === options.id) {
      isEditMode.value = true
      editRecordId.value = cached._id
      uni.setNavigationBarTitle({ title: '编辑血糖记录' })
      formData.value.bg_value = cached.bg_value !== undefined ? String(cached.bg_value) : ''
      formData.value.date = cached.record_date || currentDate
      formData.value.time = cached.measure_time || currentTime
      formData.value.note = cached.note || ''

      const pVal = cached.period || cached.status || ''
      if (pVal) {
        const pIdx = periodOptions.value.indexOf(pVal)
        if (pIdx !== -1) {
          periodIndex.value = pIdx
        } else {
          const otherIdx = periodOptions.value.indexOf('其他')
          if (otherIdx !== -1) {
            periodIndex.value = otherIdx
            customPeriodText.value = pVal
          }
        }
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

const submitRecord = async () => {
  const numValue = parseFloat(formData.value.bg_value)
  if (!formData.value.bg_value || isNaN(numValue) || numValue <= 0 || numValue > 100) {
    uni.showToast({ title: '请输入正确的血糖值 (0-100)', icon: 'none' })
    return
  }

  // 校验同步打针与同步喂食数值
  let insulinDoseNum = 0
  if (!isEditMode.value && syncInsulin.value) {
    insulinDoseNum = parseFloat(insulinForm.value.dose)
    if (!insulinForm.value.dose || isNaN(insulinDoseNum) || insulinDoseNum <= 0 || insulinDoseNum > 20) {
      uni.showToast({ title: '请输入有效的同步打针剂量 (0-20U)', icon: 'none' })
      return
    }
  }

  let mealGramsNum = 0
  if (!isEditMode.value && syncMeal.value) {
    mealGramsNum = parseFloat(mealForm.value.food_grams)
    if (!mealForm.value.food_grams || isNaN(mealGramsNum) || mealGramsNum <= 0 || mealGramsNum > 1000) {
      uni.showToast({ title: '请输入有效的同步进食克数 (0-1000g)', icon: 'none' })
      return
    }
  }
  
  isSubmitting.value = true
  
  try {
    let periodName = periodOptions.value[periodIndex.value]
    if (periodName === '其他') {
      periodName = customPeriodText.value.trim() || '其他'
    }

    const recordDateTime = makeLocalTimestamp(formData.value.date, formData.value.time)
    const catId = uni.getStorageSync('currentCatId') || 'default'

    const recordData = {
      cat_id: catId,
      bg_value: numValue,
      period: periodName,
      status: periodName,
      record_date: formData.value.date,
      measure_time: formData.value.time,
      note: formData.value.note,
      createTime: recordDateTime
    }

    if (isEditMode.value && editRecordId.value) {
      await callApi('updateRecord', {
        catId,
        type: 'blood_glucose',
        recordId: editRecordId.value,
        recordData
      })
      uni.removeStorageSync('editing_record')
    } else {
      const tasks: Promise<any>[] = [
        callApi('addRecord', { type: 'blood_glucose', recordData })
      ]

      if (syncInsulin.value) {
        const insPeriod = insulinPeriods[insulinForm.value.periodIdx] || '早针'
        const insType = insulinForm.value.type || defaultInsulins[0]
        tasks.push(
          callApi('addRecord', {
            type: 'insulin_records',
            recordData: {
              cat_id: catId,
              dose: insulinDoseNum,
              period: insPeriod,
              dose_adjustment: '维持原量',
              insulin_type: insType,
              record_date: formData.value.date,
              inject_time: formData.value.time,
              note: formData.value.note ? `[同测糖录入] ${formData.value.note}` : '',
              createTime: recordDateTime
            }
          })
        )
        try {
          uni.setStorageSync('last_insulin_pref', {
            dose: String(insulinDoseNum),
            insulin_type: insType
          })
        } catch (e) {}
      }

      if (syncMeal.value) {
        const mPeriod = mealPeriods[mealForm.value.periodIdx] || '常规喂食'
        tasks.push(
          callApi('addRecord', {
            type: 'meal_records',
            recordData: {
              cat_id: catId,
              food_grams: mealGramsNum,
              period: mPeriod,
              food_brand: mealForm.value.food_brand || '',
              extras: '',
              record_date: formData.value.date,
              meal_time: formData.value.time,
              note: formData.value.note ? `[同测糖录入] ${formData.value.note}` : '',
              createTime: recordDateTime
            }
          })
        )
        try {
          uni.setStorageSync('last_meal_pref', {
            food_grams: String(mealGramsNum),
            food_brand: mealForm.value.food_brand || ''
          })
        } catch (e) {}
      }

      await Promise.all(tasks)
    }

    // 检查是否触发低血糖急救弹窗
    const alertEnabled = getHypoAlertSetting(currentCat.value)
    const minTarget = currentTargetRange.value.min
    const isLow = numValue < minTarget || numValue < HYPO_SEVERE_THRESHOLD

    if (alertEnabled && isLow) {
      const severe = numValue < HYPO_SEVERE_THRESHOLD
      hypoModal.value = {
        visible: true,
        bgValue: numValue,
        isSevere: severe,
        retestMinutes: severe ? 15 : 30,
        settingReminder: false,
        reminderSet: false
      }
      return
    }
    
    uni.showToast({ title: isEditMode.value ? '修改成功' : '记录成功', icon: 'success' })
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

const handleSetRetestReminder = () => {
  if (hypoModal.value.reminderSet || hypoModal.value.settingReminder) return
  if (typeof wx === 'undefined') {
    uni.showToast({ title: '仅支持在微信小程序中使用', icon: 'none' })
    return
  }

  wx.requestSubscribeMessage({
    tmplIds: [TEMPLATE_ID],
    success: async (res: any) => {
      if (res[TEMPLATE_ID] === 'accept') {
        hypoModal.value.settingReminder = true
        try {
          const catId = uni.getStorageSync('currentCatId') || 'default'
          const triggerTime = Date.now() + hypoModal.value.retestMinutes * 60 * 1000
          const result = await callCloudFunction('setReminder', {
            catId,
            triggerTime,
            templateId: TEMPLATE_ID,
            reminderType: '血糖检测'
          })
          if (result && result.code === 0) {
            hypoModal.value.reminderSet = true
            uni.showToast({ title: `已设 ${hypoModal.value.retestMinutes} 分钟后提醒`, icon: 'success' })
          } else {
            uni.showToast({ title: result?.msg || '提醒设置失败', icon: 'none' })
          }
        } catch (e) {
          uni.showToast({ title: '网络请求失败', icon: 'none' })
        } finally {
          hypoModal.value.settingReminder = false
        }
      } else {
        uni.showToast({ title: '已取消订阅授权', icon: 'none' })
      }
    },
    fail: () => {
      uni.showToast({ title: '订阅调起失败', icon: 'none' })
    }
  })
}

const closeHypoModalAndBack = () => {
  hypoModal.value.visible = false
  safeNavigateBack()
}

const disableHypoAlertPermanently = async () => {
  setHypoAlertSetting(false)
  if (currentCat.value && currentCat.value._id) {
    callApi('saveCat', {
      catId: currentCat.value._id,
      catData: { hypoAlertEnabled: false }
    }).catch(() => {})
  }
  hypoModal.value.visible = false
  uni.showToast({ title: '已关闭低血糖弹窗提醒', icon: 'none' })
  setTimeout(() => {
    safeNavigateBack()
  }, 1000)
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
  margin-bottom: 32rpx;
}
.form-group {
  margin-bottom: 32rpx;
}
.form-group.compact {
  margin-bottom: 24rpx;
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
.q-tag.tag-orange.active {
  background: #FFF0E6;
  color: #DD6B20;
}
.q-tag.tag-amber.active {
  background: #FEF3C7;
  color: #B45309;
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

/* 一站式同步打卡折叠卡片 */
.combo-section {
  margin-bottom: 36rpx;
}
.combo-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding: 0 8rpx 16rpx;
}
.combo-section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-main);
}
.combo-section-sub {
  font-size: 22rpx;
  color: var(--text-sub);
}
.combo-card {
  background: #FFFFFF;
  border-radius: 20rpx;
  margin-bottom: 20rpx;
  border: 2rpx solid #EDF2F7;
  overflow: hidden;
  transition: all 0.2s ease;
}
.combo-card.active {
  border-color: #CBD5E1;
  box-shadow: 0 4rpx 16rpx rgba(15, 23, 42, 0.04);
}
.combo-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 26rpx 30rpx;
}
.combo-toggle-left {
  display: flex;
  align-items: center;
  gap: 14rpx;
}
.combo-icon {
  width: 36rpx;
  height: 36rpx;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-syringe-sm {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DD6B20' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 2 4 4'/%3E%3Cpath d='m17 7 3-3'/%3E%3Cpath d='M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5'/%3E%3Cpath d='m9 11 4 4'/%3E%3Cpath d='m5 19-3 3'/%3E%3Cpath d='m14 4 6 6'/%3E%3C/svg%3E");
}
.icon-meal-sm {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D69E2E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2'/%3E%3Cpath d='M7 2v20'/%3E%3Cpath d='M21 15V2v0a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7'/%3E%3C/svg%3E");
}
.combo-toggle-title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--text-main);
}
.combo-badge {
  font-size: 22rpx;
  padding: 2rpx 14rpx;
  border-radius: 100rpx;
  font-weight: 600;
}
.badge-orange {
  background: #FFF0E6;
  color: #DD6B20;
}
.badge-amber {
  background: #FEF3C7;
  color: #B45309;
}
.combo-check {
  width: 44rpx;
  height: 44rpx;
  border-radius: 22rpx;
  background: #F1F5F9;
  color: #64748B;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28rpx;
  font-weight: 700;
}
.combo-check.checked {
  background: #10B981;
  color: #FFFFFF;
}
.combo-body {
  padding: 20rpx 30rpx 28rpx;
  border-top: 2rpx dashed #F1F5F9;
  background: #FAFBFD;
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

/* 低血糖急救弹窗 */
.hypo-modal-mask {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.65);
  z-index: 999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40rpx;
}
.hypo-modal-card {
  width: 100%;
  background: #FFFFFF;
  border-radius: 28rpx;
  padding: 40rpx 36rpx 32rpx;
  box-shadow: 0 20rpx 50rpx rgba(0, 0, 0, 0.25);
  border-top: 12rpx solid #DC2626;
}
.hypo-modal-card.mild {
  border-top-color: #F59E0B;
}
.hypo-header {
  display: flex;
  align-items: center;
  gap: 20rpx;
  margin-bottom: 28rpx;
}
.hypo-alert-icon {
  width: 64rpx;
  height: 64rpx;
  flex-shrink: 0;
  background-size: contain;
  background-repeat: no-repeat;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DC2626' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z'/%3E%3Cline x1='12' y1='9' x2='12' y2='13'/%3E%3Cline x1='12' y1='17' x2='12.01' y2='17'/%3E%3C/svg%3E");
}
.hypo-modal-card.mild .hypo-alert-icon {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D97706' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cline x1='12' y1='8' x2='12' y2='12'/%3E%3Cline x1='12' y1='16' x2='12.01' y2='16'/%3E%3C/svg%3E");
}
.hypo-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}
.hypo-title {
  font-size: 36rpx;
  font-weight: 800;
  color: #991B1B;
}
.hypo-modal-card.mild .hypo-title {
  color: #92400E;
}
.hypo-val-badge {
  font-size: 24rpx;
  font-weight: 700;
  color: #DC2626;
  background: #FEF2F2;
  padding: 4rpx 16rpx;
  border-radius: 100rpx;
  align-self: flex-start;
}
.hypo-modal-card.mild .hypo-val-badge {
  color: #B45309;
  background: #FFFBEB;
}
.hypo-sop-box {
  background: #F8FAFC;
  border-radius: 20rpx;
  padding: 24rpx;
  margin-bottom: 32rpx;
}
.sop-lead {
  font-size: 25rpx;
  font-weight: 700;
  color: #334155;
  display: block;
  margin-bottom: 18rpx;
}
.sop-step {
  display: flex;
  align-items: flex-start;
  gap: 14rpx;
  margin-bottom: 14rpx;
}
.sop-step:last-child {
  margin-bottom: 0;
}
.step-num {
  width: 34rpx;
  height: 34rpx;
  border-radius: 17rpx;
  background: #FEE2E2;
  color: #DC2626;
  font-size: 22rpx;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 2rpx;
}
.hypo-modal-card.mild .step-num {
  background: #FEF3C7;
  color: #D97706;
}
.step-text {
  font-size: 25rpx;
  color: #475569;
  line-height: 1.45;
  flex: 1;
}
.hypo-actions {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.hypo-btn-primary {
  width: 100%;
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  background: #DC2626;
  color: #FFFFFF;
  font-size: 28rpx;
  font-weight: 700;
  border: none;
}
.hypo-modal-card.mild .hypo-btn-primary {
  background: #D97706;
}
.hypo-btn-secondary {
  width: 100%;
  height: 80rpx;
  line-height: 80rpx;
  border-radius: 40rpx;
  background: #F1F5F9;
  color: #475569;
  font-size: 28rpx;
  font-weight: 600;
  border: none;
}
.hypo-footer-opt {
  margin-top: 24rpx;
  text-align: center;
}
.hypo-footer-opt text {
  font-size: 22rpx;
  color: #94A3B8;
  text-decoration: underline;
}
</style>
