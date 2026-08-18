<template>
  <view class="container">
    <!-- 头部说明卡片 -->
    <view class="guide-card card">
      <view class="guide-header">
        <view class="icon-svg icon-feeder-header"></view>
        <view class="guide-title-wrap">
          <text class="guide-title">自动喂食机托管</text>
          <text class="guide-sub">配置定时出餐计划，到点自动向饮食记录写入，彻底解放手动打卡</text>
        </view>
      </view>
      <view class="cat-tag-row">
        <text class="tag-badge">目标猫咪</text>
        <text class="cat-name-text">当前托管猫咪：<text class="bold-name">{{ currentCatName }}</text></text>
      </view>
    </view>

    <!-- 托管总开关卡片 -->
    <view class="switch-card card" :class="{ 'is-active': isRunning }">
      <view class="switch-row">
        <view class="switch-info">
          <text class="switch-title">自动托管总开关</text>
          <text class="switch-desc">开启后系统到点自动写入进食记录</text>
        </view>
        <view class="switch-control" @click="handleToggleSwitch">
          <switch :checked="isActive" color="#2ECC71" :disabled="true" style="transform: scale(0.9);" />
        </view>
      </view>

      <view class="status-banner" :class="statusBannerClass">
        <view class="status-dot"></view>
        <text class="status-text">{{ statusText }}</text>
      </view>
    </view>

    <!-- 快速套用方案 -->
    <view class="preset-card card">
      <view class="section-header">
        <text class="section-title">快速套用出餐方案</text>
        <text class="section-sub">点击即可一键填充时刻表</text>
      </view>
      <view class="preset-btn-grid">
        <view class="preset-btn" @click="applyPreset(8, 25)">
          <text class="preset-name">8 顿 / 天</text>
          <text class="preset-detail">每 3 小时 25g (共 200g)</text>
        </view>
        <view class="preset-btn" @click="applyPreset(6, 30)">
          <text class="preset-name">6 顿 / 天</text>
          <text class="preset-detail">每 4 小时 30g (共 180g)</text>
        </view>
        <view class="preset-btn" @click="applyPreset(4, 50)">
          <text class="preset-name">4 顿 / 天</text>
          <text class="preset-detail">每 6 小时 50g (共 200g)</text>
        </view>
      </view>
    </view>

    <!-- 出餐时刻表编辑区 -->
    <view class="schedule-card card" id="schedule-section">
      <view class="section-header-row">
        <view>
          <text class="section-title">每日出餐时刻表</text>
          <text class="section-count">共 {{ scheduleList.length }} 顿 · 全天合计 {{ totalGrams }}g</text>
        </view>
        <button class="btn-add-meal" @click="addMealSlot">
          <view class="icon-svg icon-plus-sm"></view>
          <text>添加一顿</text>
        </button>
      </view>

      <view class="meal-list" v-if="scheduleList.length > 0">
        <view class="meal-item" v-for="(item, idx) in scheduleList" :key="idx">
          <view class="meal-idx">
            <text class="idx-badge">{{ idx + 1 }}</text>
          </view>

          <!-- 时间选择器 -->
          <view class="meal-time-wrap">
            <picker mode="time" :value="item.time" @change="onTimeChange($event, idx)">
              <view class="picker-time-view">
                <view class="icon-svg icon-clock-sm"></view>
                <text class="time-val">{{ item.time || '设置时间' }}</text>
                <text class="icon-arrow">▼</text>
              </view>
            </picker>
          </view>

          <!-- 克数输入 -->
          <view class="meal-grams-wrap">
            <input 
              type="digit" 
              class="grams-input" 
              v-model="item.food_grams" 
              placeholder="克数" 
            />
            <text class="unit">g</text>
          </view>

          <!-- 删除按钮 -->
          <view class="meal-del-wrap" @click="removeMealSlot(idx)">
            <view class="icon-svg icon-trash-sm"></view>
          </view>
        </view>
      </view>

      <view class="empty-schedule" v-else>
        <text class="empty-tip">暂无出餐时刻，请点击上方“快速套用”或“添加一顿”</text>
      </view>
    </view>

    <!-- 默认喂食属性配置 -->
    <view class="defaults-card card">
      <view class="section-header">
        <text class="section-title">默认罐头与属性</text>
        <text class="section-sub">自动出餐时将统一填充以下信息</text>
      </view>

      <!-- 罐头品牌/批次 -->
      <view class="form-group">
        <view class="label-row">
          <text class="label">罐头品牌 / 批次 (选填)</text>
          <text class="save-link" v-if="defaultBrand.trim()" @click="saveCustomBrand">
            保存为常用罐头
          </text>
        </view>
        <view class="input-wrap">
          <input type="text" v-model="defaultBrand" placeholder="例如: 小李子禽 / 巅峰牛肉 / K9羊肉" />
        </view>
        <!-- 快捷食物标签 -->
        <view class="quick-tags">
          <text 
            class="q-tag" 
            :class="{ active: defaultBrand === tag, 'is-custom': isCustomFood(tag) }" 
            v-for="tag in allFoodTags" 
            :key="tag" 
            @click="defaultBrand = tag"
            @longpress="onLongPressFood(tag)"
          >
            {{ tag }}
          </text>
        </view>
      </view>

      <!-- 附带东西/补剂 -->
      <view class="form-group">
        <view class="label-row">
          <text class="label">附带东西 / 补剂用药 (选填)</text>
          <text class="save-link" v-if="defaultExtras.trim()" @click="saveCustomExtras">
            保存为常用补剂
          </text>
        </view>
        <view class="input-wrap">
          <input type="text" v-model="defaultExtras" placeholder="例如: 益生菌、鱼油、辅酶Q10" />
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
      </view>

      <!-- 默认备注 -->
      <view class="form-group">
        <text class="label">默认备注</text>
        <view class="input-wrap">
          <input type="text" v-model="defaultNote" placeholder="例如: 自动喂食机正常出餐" />
        </view>
      </view>
    </view>

    <!-- 操作按钮组 -->
    <view class="action-buttons">
      <button class="btn btn-primary btn-save" @click="handleSaveBtn">
        保存托管设置
      </button>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { callApi, getLocalTodayDate } from '@/utils/api'
import { 
  getFeederConfig, 
  fetchFeederConfigFromCloud,
  saveFeederConfig, 
  isFeederConfigValid, 
  checkAndSyncAutoFeeder,
  type AutoFeederMealItem,
  type AutoFeederConfig
} from '@/utils/feederSync'

const currentCatId = ref('default')
const currentCatName = ref('当前猫咪')
const isActive = ref(false)
const scheduleList = ref<AutoFeederMealItem[]>([])
const defaultBrand = ref('')
const defaultExtras = ref('')
const defaultNote = ref('自动喂食机定时出餐')

const defaultFoodTags = ['小李子禽', '巅峰牛肉', 'K9羊肉', 'RAWZ兔肉', '冻干主食', '处方低碳粮']
const customFoodList = ref<string[]>([])
const defaultExtraTags = ['益生菌', '鱼油', '皮下补水', '辅酶Q10', '维生素B']
const customExtraList = ref<string[]>([])

onMounted(async () => {
  loadPresets()
  loadConfig()

  try {
    const res = await callApi('getCats')
    if (res.data && res.data.length > 0) {
      const storedId = uni.getStorageSync('currentCatId')
      const targetCat = res.data.find((c: any) => c._id === storedId) || res.data[0]
      currentCatId.value = targetCat._id
      currentCatName.value = targetCat.name || '猫咪'

      // 从云端同步拉取最新配置（若本地清缓存可毫秒级恢复）
      await fetchFeederConfigFromCloud(currentCatId.value)
      loadConfig()
    }
  } catch (e) {
    console.log('fetch cat in auto-feeder warning', e)
  }
})

const loadPresets = () => {
  const savedFoods = uni.getStorageSync('custom_food_brands')
  if (savedFoods && Array.isArray(savedFoods)) customFoodList.value = savedFoods
  const savedExtras = uni.getStorageSync('custom_extras')
  if (savedExtras && Array.isArray(savedExtras)) customExtraList.value = savedExtras
}

const loadConfig = () => {
  const cfg = getFeederConfig(currentCatId.value)
  isActive.value = cfg.is_active
  scheduleList.value = cfg.schedule.map(item => ({ ...item }))
  defaultBrand.value = cfg.default_brand || ''
  defaultExtras.value = cfg.default_extras || ''
  defaultNote.value = cfg.default_note || '自动喂食机定时出餐'
}

const totalGrams = computed(() => {
  return scheduleList.value.reduce((sum, item) => sum + (Number(item.food_grams) || 0), 0)
})

const isConfigValid = computed(() => {
  if (scheduleList.value.length === 0) return false
  return scheduleList.value.some(item => Boolean(item.time) && Number(item.food_grams) > 0)
})

const isRunning = computed(() => isActive.value && isConfigValid.value)

const statusText = computed(() => {
  if (isRunning.value) {
    return `托管运行中（每日 ${scheduleList.value.length} 顿 · 合计 ${totalGrams.value}g）`
  }
  if (isConfigValid.value) {
    return '托管已暂停（出餐计划已就绪，可随时开启）'
  }
  return '未配置出餐计划（请先在下方添加出餐时刻）'
})

const statusBannerClass = computed(() => {
  if (isRunning.value) return 'status-active'
  if (isConfigValid.value) return 'status-paused'
  return 'status-unconfigured'
})

// 拦截式总开关切换
const handleToggleSwitch = () => {
  if (!isConfigValid.value) {
    // 拦截！阻止开启
    uni.showModal({
      title: '请先设置出餐计划',
      content: '开启自动托管前，请先在下方添加每日出餐时刻（如 08:00、11:00 等）及每餐克数。',
      confirmText: '立即设置',
      confirmColor: '#16A085',
      showCancel: false
    })
    return
  }

  // 配置有效，允许自由切换
  isActive.value = !isActive.value
  const msg = isActive.value ? '已开启自动出餐托管' : '已暂停自动出餐托管'
  saveSettings(false, msg)
}

// 快速套用方案
const applyPreset = (count: number, gramsPerMeal: number) => {
  let times: string[] = []
  if (count === 8) {
    times = ['08:00', '11:00', '14:00', '17:00', '20:00', '23:00', '02:00', '05:00']
  } else if (count === 6) {
    times = ['08:00', '12:00', '16:00', '20:00', '00:00', '04:00']
  } else if (count === 4) {
    times = ['08:00', '14:00', '20:00', '02:00']
  }

  scheduleList.value = times.map(t => ({
    time: t,
    food_grams: gramsPerMeal,
    period: '自动喂食机出餐'
  }))

  uni.showToast({ title: `已套用 ${count} 顿方案`, icon: 'success' })
}

// 添加单顿出餐
const addMealSlot = () => {
  let defaultTime = '12:00'
  if (scheduleList.value.length > 0) {
    const lastTime = scheduleList.value[scheduleList.value.length - 1].time
    if (lastTime) {
      const parts = lastTime.split(':').map(Number)
      const newHour = (parts[0] + 3) % 24
      defaultTime = `${String(newHour).padStart(2, '0')}:${String(parts[1] || 0).padStart(2, '0')}`
    }
  }

  scheduleList.value.push({
    time: defaultTime,
    food_grams: 25,
    period: '自动喂食机出餐'
  })
}

// 删除单顿出餐
const removeMealSlot = (index: number) => {
  scheduleList.value.splice(index, 1)
  if (scheduleList.value.length === 0) {
    isActive.value = false
  }
}

// 修改时间
const onTimeChange = (e: any, index: number) => {
  scheduleList.value[index].time = e.detail.value
  // 按时间升序排序
  scheduleList.value.sort((a, b) => (a.time || '').localeCompare(b.time || ''))
}

// 保存按钮事件处理
const handleSaveBtn = () => {
  saveSettings(false, '托管设置已保存')
}

// 保存设置
const saveSettings = (silent: boolean = false, customMsg: string = '托管设置已保存') => {
  if (!isConfigValid.value) {
    isActive.value = false
  }

  const config: AutoFeederConfig = {
    cat_id: currentCatId.value,
    is_active: isActive.value && isConfigValid.value,
    schedule: scheduleList.value.map(item => ({
      time: item.time,
      food_grams: Number(item.food_grams) || 0,
      period: item.period || '自动喂食机出餐'
    })),
    default_brand: defaultBrand.value.trim(),
    default_extras: defaultExtras.value.trim(),
    default_note: defaultNote.value.trim() || '自动喂食机定时出餐',
    last_sync_date: getLocalTodayDate()
  }

  saveFeederConfig(config)

  if (!silent) {
    uni.showToast({ title: customMsg, icon: 'success' })
  }

  if (config.is_active) {
    // 立即静默触发一次对齐
    checkAndSyncAutoFeeder(currentCatId.value).catch(err => {
      console.log('feeder sync catch', err)
    })
  }
}

// 常用标签管理
const allFoodTags = computed(() => Array.from(new Set([...customFoodList.value, ...defaultFoodTags])))
const allExtraTags = computed(() => Array.from(new Set([...customExtraList.value, ...defaultExtraTags])))
const isCustomFood = (tag: string) => customFoodList.value.includes(tag)
const isCustomExtra = (tag: string) => customExtraList.value.includes(tag)

const saveCustomBrand = () => {
  const b = defaultBrand.value.trim()
  if (!b) return
  if (!customFoodList.value.includes(b)) {
    const updated = [b, ...customFoodList.value]
    customFoodList.value = updated
    uni.setStorageSync('custom_food_brands', updated)
    uni.showToast({ title: '已保存常用罐头', icon: 'success' })
  }
}

const saveCustomExtras = () => {
  const e = defaultExtras.value.trim()
  if (!e) return
  if (!customExtraList.value.includes(e)) {
    const updated = [e, ...customExtraList.value]
    customExtraList.value = updated
    uni.setStorageSync('custom_extras', updated)
    uni.showToast({ title: '已保存常用补剂', icon: 'success' })
  }
}

const appendExtra = (tag: string) => {
  if (defaultExtras.value) {
    if (!defaultExtras.value.includes(tag)) defaultExtras.value += `、${tag}`
  } else {
    defaultExtras.value = tag
  }
}

const onLongPressFood = (tag: string) => {
  if (!customFoodList.value.includes(tag)) return
  uni.showModal({
    title: '删除常用罐头',
    content: `确定删除自定义罐头「${tag}」吗？`,
    confirmText: '删除',
    confirmColor: '#E74C3C',
    success: (res) => {
      if (res.confirm) {
        const updated = customFoodList.value.filter(item => item !== tag)
        customFoodList.value = updated
        uni.setStorageSync('custom_food_brands', updated)
        if (defaultBrand.value === tag) defaultBrand.value = ''
        uni.showToast({ title: '已删除常用罐头', icon: 'success' })
      }
    }
  })
}

const onLongPressExtra = (tag: string) => {
  if (!customExtraList.value.includes(tag)) return
  uni.showModal({
    title: '删除常用补剂',
    content: `确定删除自定义补剂「${tag}」吗？`,
    confirmText: '删除',
    confirmColor: '#E74C3C',
    success: (res) => {
      if (res.confirm) {
        const updated = customExtraList.value.filter(item => item !== tag)
        customExtraList.value = updated
        uni.setStorageSync('custom_extras', updated)
        uni.showToast({ title: '已删除常用补剂', icon: 'success' })
      }
    }
  })
}
</script>

<style scoped>
.container {
  padding: 32rpx;
  min-height: 100vh;
  background: var(--bg-color);
  box-sizing: border-box;
}
.card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 36rpx 32rpx;
  margin-bottom: 32rpx;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.03);
}

/* 引导卡片 */
.guide-header {
  display: flex;
  align-items: flex-start;
  margin-bottom: 20rpx;
}
.guide-title-wrap {
  flex: 1;
}
.guide-title {
  font-size: 34rpx;
  font-weight: 800;
  color: var(--text-main);
  display: block;
  margin-bottom: 8rpx;
}
.guide-sub {
  font-size: 24rpx;
  color: var(--text-sub);
  line-height: 1.5;
}
.cat-tag-row {
  display: flex;
  align-items: center;
  background: #F8FBF8;
  border: 2rpx dashed #C8E6C9;
  border-radius: 12rpx;
  padding: 14rpx 20rpx;
}
.tag-badge {
  font-size: 20rpx;
  font-weight: 700;
  color: #15803D;
  background: #DCFCE7;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  margin-right: 12rpx;
}
.cat-name-text {
  font-size: 24rpx;
  color: #2E7D32;
}
.bold-name {
  font-weight: 800;
  color: #16A085;
}

/* 总开关卡片 */
.switch-card {
  border: 2rpx solid #E2E8F0;
  transition: all 0.2s ease;
}
.switch-card.is-active {
  border-color: #2ECC71;
  background: #FAFFFD;
}
.switch-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.switch-info {
  flex: 1;
}
.switch-title {
  font-size: 32rpx;
  font-weight: 800;
  color: var(--text-main);
  display: block;
  margin-bottom: 6rpx;
}
.switch-desc {
  font-size: 22rpx;
  color: var(--text-sub);
}
.status-banner {
  display: flex;
  align-items: center;
  border-radius: 12rpx;
  padding: 16rpx 20rpx;
}
.status-dot {
  width: 14rpx;
  height: 14rpx;
  border-radius: 7rpx;
  margin-right: 14rpx;
}
.status-text {
  font-size: 24rpx;
  font-weight: 600;
}
.status-active {
  background: #ECFDF5;
  color: #059669;
}
.status-active .status-dot { background: #10B981; }
.status-paused {
  background: #FFFBEB;
  color: #D97706;
}
.status-paused .status-dot { background: #F59E0B; }
.status-unconfigured {
  background: #F1F5F9;
  color: #64748B;
}
.status-unconfigured .status-dot { background: #94A3B8; }

/* 快速方案 */
.section-header {
  margin-bottom: 20rpx;
}
.section-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-main);
  display: block;
  margin-bottom: 4rpx;
}
.section-sub {
  font-size: 22rpx;
  color: var(--text-sub);
}
.preset-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
}
.preset-btn {
  background: #F8FAFC;
  border: 2rpx solid #E2E8F0;
  border-radius: 16rpx;
  padding: 20rpx 10rpx;
  text-align: center;
}
.preset-btn:active {
  background: #E2E8F0;
}
.preset-name {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--text-main);
  display: block;
  margin-bottom: 4rpx;
}
.preset-detail {
  font-size: 18rpx;
  color: var(--text-sub);
  display: block;
}

/* 时刻表编辑 */
.section-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24rpx;
}
.section-count {
  font-size: 22rpx;
  color: #16A085;
  font-weight: 600;
  display: block;
  margin-top: 4rpx;
}
.btn-add-meal {
  display: inline-flex;
  align-items: center;
  background: #E8F8F5;
  color: #16A085;
  font-size: 24rpx;
  font-weight: 700;
  padding: 10rpx 24rpx;
  border-radius: 30rpx;
  margin: 0;
  border: none;
  line-height: 1.4;
}
.meal-list {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}
.meal-item {
  display: flex;
  align-items: center;
  background: #F8FAFC;
  border: 1rpx solid #E2E8F0;
  border-radius: 16rpx;
  padding: 16rpx 20rpx;
}
.meal-idx {
  margin-right: 16rpx;
}
.idx-badge {
  font-size: 22rpx;
  font-weight: 700;
  color: #64748B;
  background: #E2E8F0;
  width: 40rpx;
  height: 40rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.meal-time-wrap {
  flex: 1.2;
}
.picker-time-view {
  display: flex;
  align-items: center;
  background: #FFFFFF;
  border: 1rpx solid #CBD5E1;
  border-radius: 10rpx;
  padding: 12rpx 16rpx;
}
.time-val {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-main);
  flex: 1;
}
.icon-arrow {
  font-size: 18rpx;
  color: #94A3B8;
  margin-left: 8rpx;
}
.meal-grams-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  background: #FFFFFF;
  border: 1rpx solid #CBD5E1;
  border-radius: 10rpx;
  padding: 8rpx 16rpx;
  margin-left: 16rpx;
}
.grams-input {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-main);
  flex: 1;
}
.unit {
  font-size: 22rpx;
  color: var(--text-sub);
  margin-left: 6rpx;
}
.meal-del-wrap {
  margin-left: 16rpx;
  padding: 10rpx;
  display: flex;
  align-items: center;
  justify-content: center;
}
.empty-schedule {
  padding: 40rpx 20rpx;
  text-align: center;
}
.empty-tip {
  font-size: 24rpx;
  color: #94A3B8;
}

/* 默认属性表单 */
.form-group {
  margin-bottom: 24rpx;
}
.form-group:last-child {
  margin-bottom: 0;
}
.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12rpx;
}
.label {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-main);
  display: block;
}
.save-link {
  font-size: 22rpx;
  color: #16A085;
  font-weight: 600;
}
.input-wrap {
  background: #F8FAFC;
  border: 1rpx solid #E2E8F0;
  border-radius: 14rpx;
  padding: 18rpx 24rpx;
}
.input-wrap input {
  font-size: 26rpx;
  color: var(--text-main);
  width: 100%;
}
.quick-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
  margin-top: 14rpx;
}
.q-tag {
  font-size: 22rpx;
  color: var(--text-sub);
  background: #F1F5F9;
  padding: 8rpx 20rpx;
  border-radius: 100rpx;
}
.q-tag.active {
  color: #16A085;
  background: #E8F8F5;
  font-weight: 700;
}
.q-tag.is-custom {
  border: 1rpx dashed #16A085;
}

/* 底部操作 */
.action-buttons {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.btn-save {
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #16A085, #2ECC71);
}

/* SVG 图标 */
.icon-svg {
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-feeder-header {
  width: 48rpx;
  height: 48rpx;
  margin-right: 16rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='4' width='20' height='16' rx='2'/%3E%3Cpath d='M6 8h4'/%3E%3Cpath d='M6 12h8'/%3E%3Ccircle cx='16' cy='8' r='2'/%3E%3Cpath d='M10 16h8'/%3E%3C/svg%3E");
}
.icon-clock-sm {
  width: 28rpx;
  height: 28rpx;
  margin-right: 10rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolyline points='12 6 12 12 16 14'/%3E%3C/svg%3E");
}
.icon-plus-sm {
  width: 24rpx;
  height: 24rpx;
  margin-right: 8rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A085' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' y1='5' x2='12' y2='19'/%3E%3Cline x1='5' y1='12' x2='19' y2='12'/%3E%3C/svg%3E");
}
.icon-trash-sm {
  width: 32rpx;
  height: 32rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='3 6 5 6 21 6'/%3E%3Cpath d='M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'/%3E%3C/svg%3E");
}
</style>
