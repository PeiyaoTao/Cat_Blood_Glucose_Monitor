<template>
  <view class="container">
    <view class="header">
      <text class="title">干物质与碳水计算</text>
      <text class="desc">输入猫粮包装上的营养承诺值（As-fed），计算出真实的干物质碳水占比。糖尿病猫建议干物质碳水控制在 10% 以内。</text>
    </view>

    <view class="ocr-section">
      <button class="ocr-btn" @click="handleOCR" :disabled="isRecognizing">
        <text>{{ isRecognizing ? '正在拼命识别中...' : '智能识别成分表' }}</text>
      </button>
      <text class="ocr-hint">直接对准猫粮包装背面的营养承诺值拍照</text>
    </view>

    <view class="card input-card">
      <view class="form-group">
        <text class="label">蛋白质 (Protein) %</text>
        <input type="digit" v-model="form.protein" placeholder="例如: 10.0" />
      </view>
      <view class="form-group">
        <text class="label">脂肪 (Fat) %</text>
        <input type="digit" v-model="form.fat" placeholder="例如: 5.0" />
      </view>
      <view class="form-group">
        <text class="label">水分 (Moisture) %</text>
        <input type="digit" v-model="form.moisture" placeholder="未标明时: 干粮填10, 罐头填80" />
        <text class="input-hint">* 若包装未标明，干粮平均约 10%，主食罐头约 80%</text>
      </view>
      <view class="form-group">
        <text class="label">粗纤维 (Fiber) % (选填)</text>
        <input type="digit" v-model="form.fiber" placeholder="例如: 1.5" />
      </view>
      <view class="form-group">
        <text class="label">粗灰分 (Ash) % (选填)</text>
        <input type="digit" v-model="form.ash" placeholder="未标明时: 干粮填7, 罐头填2" />
        <text class="input-hint">* 营养学估算：干粮灰分约 7%，主食罐头约 2%</text>
      </view>
    </view>

    <view class="card result-card" v-if="isValid">
      <text class="result-title">计算结果</text>
      
      <view class="result-row">
        <text>实际干物质占比 (DM)</text>
        <text class="val">{{ dryMatter }}%</text>
      </view>
      <view class="result-row highlight">
        <text>干物质碳水化合物</text>
        <text class="val dm-carbs" :style="{ color: indicatorColor }">{{ dmCarbs }}%</text>
      </view>
      
      <view class="indicator-box" :style="{ backgroundColor: indicatorBg }">
        <view class="status-dot" :style="{ backgroundColor: indicatorColor }"></view>
        <text class="eval-text">{{ indicatorText }}</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { callApi } from '@/utils/api'

const form = ref({
  protein: '',
  fat: '',
  moisture: '',
  fiber: '',
  ash: ''
})

const isRecognizing = ref(false)

const handleOCR = async () => {
  try {
    const mediaRes = await new Promise<any>((resolve, reject) => {
      uni.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        success: resolve,
        fail: reject
      })
    })

    if (!mediaRes.tempFiles || mediaRes.tempFiles.length === 0) return
    let tempPath = mediaRes.tempFiles[0].tempFilePath

    isRecognizing.value = true
    uni.showLoading({ title: '压缩并上传中...' })

    // 针对海外网络慢的问题，进行二次极限压缩
    try {
      const compressRes = await new Promise<any>((resolve, reject) => {
        uni.compressImage({
          src: tempPath,
          quality: 80, // 提高画质至80%，保证小字体和标点符号（如小数点和百分号）的清晰度
          success: resolve,
          fail: reject
        })
      })
      if (compressRes.tempFilePath) {
        tempPath = compressRes.tempFilePath
      }
    } catch (compressErr) {
      console.warn('图片压缩跳过', compressErr)
    }

    // @ts-ignore
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `ocr_temp/${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`,
      filePath: tempPath
    })

    if (!uploadRes.fileID) throw new Error('上传失败')

    uni.showLoading({ title: 'AI 识别中...' })
    const res = await callApi('recognizeNutrition', { fileID: uploadRes.fileID })
    
    uni.hideLoading()
    isRecognizing.value = false

    if (res && res.parsed) {
      let foundCount = 0
      if (res.parsed.protein) { form.value.protein = res.parsed.protein; foundCount++ }
      if (res.parsed.fat) { form.value.fat = res.parsed.fat; foundCount++ }
      if (res.parsed.moisture) { form.value.moisture = res.parsed.moisture; foundCount++ }
      if (res.parsed.fiber) { form.value.fiber = res.parsed.fiber; foundCount++ }
      if (res.parsed.ash) { form.value.ash = res.parsed.ash; foundCount++ }

      if (foundCount > 0) {
        uni.showToast({ title: `成功识别 ${foundCount} 项指标`, icon: 'success' })
      } else {
        uni.showModal({ title: '识别提示', content: '未找到清晰的数值，请确保拍到了“蛋白质、脂肪”等字样，或者尝试手动输入。', showCancel: false })
      }
    }
  } catch (e: any) {
    uni.hideLoading()
    isRecognizing.value = false
    if (e.errMsg && e.errMsg.includes('cancel')) return
    uni.showToast({ title: e.message || '识别失败', icon: 'none' })
  }
}

const isValid = computed(() => {
  return form.value.protein && form.value.fat && form.value.moisture
})

const dryMatter = computed(() => {
  const m = parseFloat(form.value.moisture) || 0
  return (100 - m).toFixed(1)
})

const dmCarbs = computed(() => {
  const p = parseFloat(form.value.protein) || 0
  const f = parseFloat(form.value.fat) || 0
  const m = parseFloat(form.value.moisture) || 0
  const fb = parseFloat(form.value.fiber) || 0
  const a = parseFloat(form.value.ash) || (m > 60 ? 2 : 7) // 智能估算灰分
  
  const carbsAsFed = 100 - p - f - m - fb - a
  const dm = 100 - m
  if (dm <= 0) return 0
  
  const dmC = (carbsAsFed / dm) * 100
  return dmC > 0 ? dmC.toFixed(1) : '0.0'
})

const indicatorColor = computed(() => {
  const val = parseFloat(dmCarbs.value as string)
  if (val <= 8) return '#2ECC71'
  if (val <= 15) return '#F39C12'
  return '#E74C3C'
})

const indicatorBg = computed(() => {
  const val = parseFloat(dmCarbs.value as string)
  if (val <= 8) return '#E8F8F5'
  if (val <= 15) return '#FEF9E7'
  return '#FDEDEC'
})

// Removed emoji computed

const indicatorText = computed(() => {
  const val = parseFloat(dmCarbs.value as string)
  if (val <= 8) return '非常优秀！低碳水，完全适合糖尿病猫食用。'
  if (val <= 15) return '边缘碳水，可以少量食用或作为零食，需观察血糖变化。'
  return '高碳水！不建议糖尿病猫食用，容易引起血糖飙升。'
})
</script>

<style scoped>
.container { padding: 32rpx; min-height: 100vh; background: var(--bg-color); }
.header { margin-bottom: 40rpx; }
.title { font-size: 48rpx; font-weight: 800; color: var(--text-main); display: block; margin-bottom: 16rpx; }
.desc { font-size: 28rpx; color: var(--text-sub); line-height: 1.5; }
.ocr-section { display: flex; flex-direction: column; align-items: center; margin-bottom: 32rpx; }
.ocr-btn { background: linear-gradient(135deg, #3498DB, #2980B9); color: #fff; border-radius: 40rpx; padding: 0 48rpx; height: 80rpx; display: flex; align-items: center; justify-content: center; font-size: 32rpx; font-weight: 600; box-shadow: 0 8rpx 16rpx rgba(52, 152, 219, 0.3); border: none; }
.ocr-btn:active { transform: scale(0.98); box-shadow: 0 4rpx 8rpx rgba(52, 152, 219, 0.2); }
.ocr-btn[disabled] { opacity: 0.7; transform: none; box-shadow: none; }
.ocr-hint { font-size: 24rpx; color: var(--text-sub); margin-top: 16rpx; }
.card { background: #FFFFFF; border-radius: 24rpx; padding: 40rpx; margin-bottom: 32rpx; box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02); }
.form-group { margin-bottom: 32rpx; }
.form-group:last-child { margin-bottom: 0; }
.label { font-size: 28rpx; color: var(--text-sub); margin-bottom: 12rpx; display: block; font-weight: 500;}
input { background: #F8F9FA; padding: 24rpx; border-radius: 16rpx; font-size: 32rpx; border: 2rpx solid transparent;}
input:focus { background: #FFFFFF; border-color: var(--primary-light); }
.input-hint { font-size: 24rpx; color: var(--text-sub); margin-top: 8rpx; }
.result-title { font-size: 36rpx; font-weight: 700; border-bottom: 2rpx solid #f0f0f0; padding-bottom: 24rpx; margin-bottom: 24rpx; display: block; }
.result-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20rpx; font-size: 30rpx; color: var(--text-main); }
.result-row.highlight { font-size: 36rpx; font-weight: 700; margin-top: 32rpx; }
.dm-carbs { font-size: 48rpx; font-weight: 800; }
.indicator-box { margin-top: 40rpx; padding: 32rpx; border-radius: 16rpx; display: flex; align-items: flex-start; }
.status-dot { width: 32rpx; height: 32rpx; border-radius: 16rpx; margin-right: 16rpx; flex-shrink: 0; margin-top: 6rpx; box-shadow: 0 4rpx 8rpx rgba(0,0,0,0.1); }
.eval-text { font-size: 28rpx; line-height: 1.5; color: var(--text-main); flex: 1; font-weight: 500;}
</style>
