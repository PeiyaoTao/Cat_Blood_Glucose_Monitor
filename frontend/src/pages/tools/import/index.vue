<template>
  <view class="container">
    <!-- 头部说明卡片 (在非成功态显示) -->
    <view class="guide-card card" v-if="!importSuccessResult">
      <view class="guide-header">
        <view class="icon-svg icon-import-header"></view>
        <view class="guide-title-wrap">
          <text class="guide-title">智能 Excel 历史数据导入</text>
          <text class="guide-sub">支持从微信聊天记录中选取历史记录表，自动识别多种格式表头并智能解析入库</text>
        </view>
      </view>

      <view class="tips-box">
        <view class="tip-item">
          <text class="tip-badge">目标猫咪</text>
          <text class="tip-text">当前数据将专属导入至：<text style="font-weight: 800; color: #16A085;">{{ currentCatName }}</text>（不会影响账号下的其他猫咪）</text>
        </view>
        <view class="tip-item">
          <text class="tip-badge">格式兼容</text>
          <text class="tip-text">无论是其他 App 导出、动物医院记录还是自制表格，只要包含“日期/时间/血糖/打针/进食”等字样即可自动识别。</text>
        </view>
        <view class="tip-item">
          <text class="tip-badge">智能去重</text>
          <text class="tip-text">默认自动识别并跳过已存在的重复记录，多次导入不会产生脏数据。</text>
        </view>
      </view>
    </view>

    <!-- 阶段 1: 选取文件区域 (未解析状态) -->
    <view class="upload-section card" v-if="!parseResult && !importSuccessResult">
      <view class="upload-placeholder" @click="chooseExcelFile">
        <view class="upload-icon-wrap">
          <view class="icon-svg icon-file-excel"></view>
        </view>
        <text class="upload-main-text">选择 Excel 文件上传</text>
        <text class="upload-sub-text">支持电脑本地文件、微信聊天记录或文件传输助手</text>
        <button class="btn btn-primary btn-choose" :loading="isAnalyzing">
          {{ isAnalyzing ? '正在智能解析中...' : '选择 Excel 文件' }}
        </button>
      </view>

      <!-- 在线文档导入小贴士 -->
      <view class="faq-box">
        <view class="faq-title-row">
          <text class="faq-badge">使用帮助</text>
          <text class="faq-title">如果是金山文档 / WPS / 腾讯文档？</text>
        </view>
        <text class="faq-desc">
          如需导入金山文档/WPS/腾讯文档等在线表格，请先将表格下载至本地，再发送给微信【文件传输助手】，即可在此直接选取导入。
        </text>
      </view>
    </view>

    <!-- 阶段 2: 解析预览与确认导入面板 -->
    <view class="preview-section" v-else-if="parseResult && !importSuccessResult">
      <!-- 文件与时间区间概览 -->
      <view class="file-summary-card card">
        <view class="file-info-row">
          <view class="icon-svg icon-excel-badge"></view>
          <view class="file-info-text">
            <text class="file-name">{{ selectedFileName }}</text>
            <text class="file-date-range">
              涵盖区间: {{ parseResult.summary.startDate || '-' }} 至 {{ parseResult.summary.endDate || '-' }}
            </text>
          </view>
        </view>

        <!-- 识别条数矩阵 -->
        <view class="stats-grid">
          <view class="stat-box">
            <text class="stat-num text-blood">{{ parseResult.summary.glucoseCount }}</text>
            <text class="stat-label">血糖记录</text>
          </view>
          <view class="stat-box">
            <text class="stat-num text-insulin">{{ parseResult.summary.insulinCount }}</text>
            <text class="stat-label">打针记录</text>
          </view>
          <view class="stat-box">
            <text class="stat-num text-meal">{{ parseResult.summary.mealCount }}</text>
            <text class="stat-label">饮食记录</text>
          </view>
          <view class="stat-box">
            <text class="stat-num text-excretion">{{ parseResult.summary.excretionCount }}</text>
            <text class="stat-label">排泄记录</text>
          </view>
        </view>
      </view>

      <!-- 样本数据抽样预览表格 -->
      <view class="sample-card card" v-if="parseResult.previewList && parseResult.previewList.length > 0">
        <view class="sample-header">
          <text class="sample-title">识别样本预览 (前 {{ parseResult.previewList.length }} 条)</text>
          <text class="sample-tag">自动匹配成功</text>
        </view>

        <view class="table-wrap">
          <view class="table-header">
            <text class="th th-date">日期/时间</text>
            <text class="th th-timing">时效</text>
            <text class="th th-bg">血糖</text>
            <text class="th th-dose">打针</text>
            <text class="th th-food">饮食</text>
          </view>
          <view class="table-row" v-for="(row, idx) in parseResult.previewList" :key="idx">
            <text class="td td-date">{{ row.date }} {{ row.time }}</text>
            <text class="td td-timing">{{ row.timing }}</text>
            <text class="td td-bg bold">{{ row.bg }}</text>
            <text class="td td-dose">{{ row.dose }}</text>
            <text class="td td-food">{{ row.food }}</text>
          </view>
        </view>
      </view>

      <!-- 导入选项 -->
      <view class="options-card card">
        <label class="checkbox-row" @click="skipDuplicates = !skipDuplicates">
          <switch :checked="skipDuplicates" color="#2ECC71" style="transform: scale(0.8);" />
          <view class="option-text">
            <text class="option-title">自动跳过重复记录 (推荐开启)</text>
            <text class="option-sub">若数据库已有相同日期、时间与数值的记录则自动跳过，防止产生冗余</text>
          </view>
        </label>
      </view>

      <!-- 操作按钮组 -->
      <view class="action-buttons">
        <button class="btn btn-primary submit-import-btn" :loading="isImporting" @click="confirmImport">
          {{ isImporting ? '正在批量写入数据库...' : `确认导入全部数据至【${currentCatName}】 (${totalRecordsToImport} 条)` }}
        </button>
        <button class="btn btn-secondary re-choose-btn" @click="resetUpload" :disabled="isImporting">
          重新选择其他文件
        </button>
      </view>
    </view>

    <!-- 阶段 3: 导入成功专属结果面板 -->
    <view class="success-section" v-else-if="importSuccessResult">
      <view class="success-card card">
        <view class="success-icon-wrap">
          <view class="icon-svg icon-success-check"></view>
        </view>
        <text class="success-title">历史数据导入完成！</text>
        <text class="success-target">已归属至猫咪：<text class="bold-name">{{ currentCatName }}</text></text>

        <!-- 导入核心结果汇总 -->
        <view class="success-stats-box">
          <view class="success-stat-item highlight-green">
            <text class="stat-value">+{{ importSuccessResult.totalImported }}</text>
            <text class="stat-name">本次成功新增入库</text>
          </view>

          <view class="success-stat-item" :class="importSuccessResult.skippedCount > 0 ? 'highlight-orange' : 'highlight-gray'">
            <text class="stat-value">{{ importSuccessResult.skippedCount }}</text>
            <text class="stat-name">{{ importSuccessResult.skippedCount > 0 ? '已自动识别并跳过重复' : '无重复记录' }}</text>
          </view>
        </view>

        <!-- 各分类新增明细 -->
        <view class="details-list" v-if="importSuccessResult.importedCounts">
          <view class="detail-row">
            <view class="detail-label-wrap">
              <view class="icon-svg icon-blood-sm"></view>
              <text class="detail-label">血糖记录</text>
            </view>
            <text class="detail-count">+{{ importSuccessResult.importedCounts.glucose }} 条</text>
          </view>
          <view class="detail-row">
            <view class="detail-label-wrap">
              <view class="icon-svg icon-syringe-sm"></view>
              <text class="detail-label">胰岛素记录</text>
            </view>
            <text class="detail-count">+{{ importSuccessResult.importedCounts.insulin }} 条</text>
          </view>
          <view class="detail-row">
            <view class="detail-label-wrap">
              <view class="icon-svg icon-meal-sm"></view>
              <text class="detail-label">饮食记录</text>
            </view>
            <text class="detail-count">+{{ importSuccessResult.importedCounts.meal }} 条</text>
          </view>
          <view class="detail-row">
            <view class="detail-label-wrap">
              <view class="icon-svg icon-excretion-sm"></view>
              <text class="detail-label">排泄记录</text>
            </view>
            <text class="detail-count">+{{ importSuccessResult.importedCounts.excretion }} 条</text>
          </view>
          <view class="detail-row" v-if="importSuccessResult.importedCounts.weight > 0">
            <view class="detail-label-wrap">
              <view class="icon-svg icon-weight-sm"></view>
              <text class="detail-label">体重记录</text>
            </view>
            <text class="detail-count">+{{ importSuccessResult.importedCounts.weight }} 条</text>
          </view>
        </view>
      </view>

      <!-- 成功后操作按钮 -->
      <view class="action-buttons">
        <button class="btn btn-primary submit-import-btn" @click="goToHome">
          返回主页查看血糖图表
        </button>
        <button class="btn btn-secondary re-choose-btn" @click="resetUpload">
          继续导入其他表格
        </button>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { callApi } from '@/utils/api'

const isAnalyzing = ref(false)
const isImporting = ref(false)
const selectedFileName = ref('')
const uploadedFileID = ref('')
const skipDuplicates = ref(true)
const parseResult = ref<any>(null)
const importSuccessResult = ref<any>(null)
const currentCatName = ref('当前猫咪')
const currentCatId = ref('')

onMounted(async () => {
  try {
    const res = await callApi('getCats')
    if (res.data && res.data.length > 0) {
      const storedId = uni.getStorageSync('currentCatId')
      const targetCat = res.data.find((c: any) => c._id === storedId) || res.data[0]
      currentCatId.value = targetCat._id
      currentCatName.value = targetCat.name || '猫咪'
    }
  } catch (e) {
    console.log('fetch cat in import page warning', e)
  }
})

const totalRecordsToImport = computed(() => {
  if (!parseResult.value || !parseResult.value.summary) return 0
  const s = parseResult.value.summary
  return (s.glucoseCount || 0) + (s.insulinCount || 0) + (s.mealCount || 0) + (s.excretionCount || 0) + (s.weightCount || 0)
})

// 执行原生微信文件选择
const executeChooseFile = () => {
  // @ts-ignore
  wx.chooseMessageFile({
    count: 1,
    type: 'file',
    extension: ['xlsx', 'xls'],
    success: (res: any) => {
      if (res.tempFiles && res.tempFiles.length > 0) {
        const file = res.tempFiles[0]
        selectedFileName.value = file.name
        uploadAndParse(file.path, file.name)
      }
    },
    fail: (err: any) => {
      if (err && (err.errno === 112 || (err.errMsg && err.errMsg.includes('privacy agreement')))) {
        uni.showModal({
          title: '隐私指引配置提示',
          content: '微信提示尚未在小程序后台声明“选文件”权限。如在开发者工具中调试，可在右上角【详情】->【本地设置】中勾选或处理隐私配置；发布前需在微信公众平台【用户隐私保护指引】中增加“选择会话文件”权限声明。',
          showCancel: false
        })
        return
      }
      if (!err.errMsg || !err.errMsg.includes('cancel')) {
        uni.showToast({ title: '选择文件失败', icon: 'none' })
        console.error('chooseMessageFile failed', err)
      }
    }
  })
}

// 从微信会话或本地选取文件
const chooseExcelFile = () => {
  // @ts-ignore
  if (typeof wx === 'undefined' || !wx.chooseMessageFile) {
    uni.showToast({ title: '请在微信小程序客户端中使用', icon: 'none' })
    return
  }

  // @ts-ignore 兼容隐私授权协议流程
  if (wx.requirePrivacyAuthorize) {
    // @ts-ignore
    wx.requirePrivacyAuthorize({
      success: () => {
        executeChooseFile()
      },
      fail: () => {
        executeChooseFile()
      }
    })
  } else {
    executeChooseFile()
  }
}

// 上传到云存储并调用云函数进行智能解析
const uploadAndParse = async (filePath: string, fileName: string) => {
  isAnalyzing.value = true
  uni.showLoading({ title: '正在上传与智能解析...', mask: true })

  try {
    const catId = currentCatId.value || uni.getStorageSync('currentCatId') || 'default'
    // @ts-ignore
    const uploadRes = await wx.cloud.uploadFile({
      cloudPath: `temp_imports/${Date.now()}_${Math.floor(Math.random() * 1000)}.xlsx`,
      filePath: filePath
    })

    uploadedFileID.value = uploadRes.fileID

    // @ts-ignore
    const parseRes = await wx.cloud.callFunction({
      name: 'importExcel',
      data: {
        action: 'parse',
        fileID: uploadRes.fileID,
        catId: catId
      }
    })

    uni.hideLoading()

    if (parseRes.result && parseRes.result.code === 0) {
      parseResult.value = parseRes.result
      uni.showToast({ title: '解析成功', icon: 'success' })
    } else {
      uni.showModal({
        title: '解析提示',
        content: parseRes.result?.msg || '未能成功解析该 Excel 文件，请检查表头或内容格式',
        showCancel: false
      })
      resetUpload()
    }
  } catch (err: any) {
    uni.hideLoading()
    console.error('Upload & Parse failed', err)
    uni.showModal({
      title: '解析异常',
      content: '调用解析服务失败，请确保云函数 importExcel 已上传并安装依赖。',
      showCancel: false
    })
    resetUpload()
  } finally {
    isAnalyzing.value = false
  }
}

// 确认批量写入数据库
const confirmImport = async () => {
  if (!parseResult.value || !parseResult.value.parsedData) return

  isImporting.value = true
  uni.showLoading({ title: '正在批量导入入库...', mask: true })

  try {
    const catId = currentCatId.value || uni.getStorageSync('currentCatId') || 'default'

    // @ts-ignore
    const importRes = await wx.cloud.callFunction({
      name: 'importExcel',
      data: {
        action: 'import',
        fileID: uploadedFileID.value,
        catId: catId,
        parsedData: parseResult.value.parsedData,
        skipDuplicates: skipDuplicates.value
      }
    })

    uni.hideLoading()

    if (importRes.result && importRes.result.code === 0) {
      importSuccessResult.value = importRes.result
      uni.showToast({ title: '导入完成', icon: 'success' })
    } else {
      uni.showModal({
        title: '导入提示',
        content: importRes.result?.msg || '未能成功导入数据，请稍后重试',
        showCancel: false
      })
    }
  } catch (err: any) {
    uni.hideLoading()
    console.error('Import confirmation failed', err)
    uni.showToast({ title: '导入入库异常:' + err.message, icon: 'none' })
  } finally {
    isImporting.value = false
  }
}

const goToHome = () => {
  uni.switchTab({
    url: '/pages/index/index',
    fail: () => {
      uni.reLaunch({ url: '/pages/index/index' })
    }
  })
}

const resetUpload = () => {
  parseResult.value = null
  importSuccessResult.value = null
  selectedFileName.value = ''
  uploadedFileID.value = ''
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
  margin-bottom: 24rpx;
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
.tips-box {
  background: #F8FBF8;
  border: 2rpx dashed #C8E6C9;
  border-radius: 16rpx;
  padding: 20rpx 24rpx;
}
.tip-item {
  display: flex;
  align-items: flex-start;
  margin-bottom: 12rpx;
}
.tip-item:last-child {
  margin-bottom: 0;
}
.tip-badge {
  font-size: 20rpx;
  font-weight: 700;
  color: #15803D;
  background: #DCFCE7;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  margin-right: 12rpx;
  flex-shrink: 0;
  line-height: 1.3;
}
.tip-text {
  font-size: 22rpx;
  color: #2E7D32;
  line-height: 1.5;
  flex: 1;
}

/* 上传占位区 */
.upload-section {
  padding: 60rpx 40rpx;
}
.upload-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.upload-icon-wrap {
  width: 140rpx;
  height: 140rpx;
  border-radius: 70rpx;
  background: #E8F8F5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.upload-main-text {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 12rpx;
}
.upload-sub-text {
  font-size: 24rpx;
  color: var(--text-sub);
  margin-bottom: 36rpx;
}
.btn-choose {
  min-width: 360rpx;
  padding: 0 48rpx;
  height: 92rpx;
  line-height: 92rpx;
  border-radius: 46rpx;
  font-size: 30rpx;
  font-weight: 700;
  white-space: nowrap;
  background: linear-gradient(135deg, #16A085, #2ECC71);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

/* FAQ 帮助引导 */
.faq-box {
  margin-top: 40rpx;
  background: #F8FAFC;
  border-radius: 16rpx;
  padding: 24rpx;
  border: 1rpx solid #E2E8F0;
  text-align: left;
}
.faq-title-row {
  display: flex;
  align-items: center;
  margin-bottom: 12rpx;
}
.faq-badge {
  font-size: 20rpx;
  font-weight: 700;
  color: #475569;
  background: #E2E8F0;
  padding: 4rpx 12rpx;
  border-radius: 6rpx;
  margin-right: 12rpx;
}
.faq-title {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--text-main);
}
.faq-desc {
  font-size: 22rpx;
  color: var(--text-sub);
  line-height: 1.6;
  display: block;
}

/* 文件概览与矩阵 */
.file-info-row {
  display: flex;
  align-items: center;
  padding-bottom: 24rpx;
  border-bottom: 2rpx solid #F0F2F5;
  margin-bottom: 24rpx;
}
.file-info-text {
  flex: 1;
}
.file-name {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--text-main);
  display: block;
  margin-bottom: 6rpx;
}
.file-date-range {
  font-size: 22rpx;
  color: var(--text-sub);
}
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16rpx;
}
.stat-box {
  background: #F8F9FA;
  border-radius: 16rpx;
  padding: 20rpx 10rpx;
  text-align: center;
}
.stat-num {
  font-size: 36rpx;
  font-weight: 800;
  display: block;
  margin-bottom: 6rpx;
}
.stat-label {
  font-size: 20rpx;
  color: var(--text-sub);
}
.text-blood { color: #E53E3E; }
.text-insulin { color: #3182CE; }
.text-meal { color: #D69E2E; }
.text-excretion { color: #16A34A; }

/* 样本预览表格 */
.sample-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20rpx;
}
.sample-title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--text-main);
}
.sample-tag {
  font-size: 20rpx;
  color: #16A085;
  background: #E8F8F5;
  padding: 4rpx 16rpx;
  border-radius: 100rpx;
}
.table-wrap {
  background: #F8F9FA;
  border-radius: 16rpx;
  overflow: hidden;
}
.table-header, .table-row {
  display: flex;
  padding: 16rpx 12rpx;
  align-items: center;
}
.table-header {
  background: #EDF2F7;
  font-size: 22rpx;
  font-weight: 700;
  color: #4A5568;
}
.table-row {
  border-bottom: 1rpx solid #E2E8F0;
  font-size: 22rpx;
  color: #2D3748;
}
.table-row:last-child {
  border-bottom: none;
}
.th-date, .td-date { width: 30%; font-size: 20rpx; }
.th-timing, .td-timing { width: 20%; text-align: center; }
.th-bg, .td-bg { width: 16%; text-align: center; color: #E53E3E; }
.th-dose, .td-dose { width: 16%; text-align: center; color: #3182CE; }
.th-food, .td-food { width: 18%; text-align: right; }
.bold { font-weight: 700; }

/* 选项卡片 */
.checkbox-row {
  display: flex;
  align-items: center;
}
.option-text {
  margin-left: 16rpx;
  flex: 1;
}
.option-title {
  font-size: 26rpx;
  font-weight: 600;
  color: var(--text-main);
  display: block;
}
.option-sub {
  font-size: 20rpx;
  color: var(--text-sub);
  display: block;
  margin-top: 4rpx;
}

/* 阶段 3: 导入成功卡片样式 */
.success-section {
  display: flex;
  flex-direction: column;
}
.success-card {
  text-align: center;
  padding: 50rpx 36rpx;
}
.success-icon-wrap {
  width: 130rpx;
  height: 130rpx;
  border-radius: 65rpx;
  background: #DCFCE7;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24rpx;
}
.success-title {
  font-size: 40rpx;
  font-weight: 800;
  color: var(--text-main);
  display: block;
  margin-bottom: 8rpx;
}
.success-target {
  font-size: 26rpx;
  color: var(--text-sub);
  display: block;
  margin-bottom: 36rpx;
}
.bold-name {
  font-weight: 700;
  color: #16A085;
}
.success-stats-box {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20rpx;
  margin-bottom: 36rpx;
}
.success-stat-item {
  border-radius: 16rpx;
  padding: 24rpx 16rpx;
  text-align: center;
}
.highlight-green {
  background: #F0FDF4;
  border: 2rpx solid #BBF7D0;
}
.highlight-orange {
  background: #FFFBEB;
  border: 2rpx solid #FDE68A;
}
.highlight-gray {
  background: #F8FAFC;
  border: 2rpx solid #E2E8F0;
}
.stat-value {
  font-size: 44rpx;
  font-weight: 800;
  display: block;
  margin-bottom: 6rpx;
}
.highlight-green .stat-value { color: #16A34A; }
.highlight-orange .stat-value { color: #D97706; }
.highlight-gray .stat-value { color: #64748B; }
.stat-name {
  font-size: 22rpx;
  color: var(--text-sub);
}
.details-list {
  background: #F8FAFC;
  border-radius: 16rpx;
  padding: 16rpx 24rpx;
  text-align: left;
}
.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14rpx 0;
  border-bottom: 1rpx solid #EEF2F6;
  font-size: 24rpx;
}
.detail-row:last-child {
  border-bottom: none;
}
.detail-label-wrap {
  display: flex;
  align-items: center;
}
.detail-label {
  color: var(--text-main);
  font-weight: 500;
}
.detail-count {
  font-weight: 700;
  color: #16A085;
}

/* 底部操作区 */
.action-buttons {
  margin-top: 40rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}
.submit-import-btn {
  height: 96rpx;
  line-height: 96rpx;
  border-radius: 48rpx;
  font-size: 32rpx;
  font-weight: 700;
  background: linear-gradient(135deg, #16A085, #2ECC71);
}
.re-choose-btn {
  height: 88rpx;
  line-height: 88rpx;
  border-radius: 44rpx;
  font-size: 28rpx;
  color: var(--text-sub);
  background: #E2E8F0;
}

/* SVG 图标 */
.icon-svg {
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-import-header {
  width: 48rpx;
  height: 48rpx;
  margin-right: 16rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='17 8 12 3 7 8'/%3E%3Cline x1='12' y1='3' x2='12' y2='15'/%3E%3C/svg%3E");
}
.icon-file-excel {
  width: 72rpx;
  height: 72rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3Cline x1='8' y1='13' x2='16' y2='17'/%3E%3Cline x1='16' y1='13' x2='8' y2='17'/%3E%3C/svg%3E");
}
.icon-excel-badge {
  width: 48rpx;
  height: 48rpx;
  margin-right: 20rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232ECC71' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/%3E%3Cpolyline points='14 2 14 8 20 8'/%3E%3C/svg%3E");
}
.icon-success-check {
  width: 64rpx;
  height: 64rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A34A' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E");
}
.icon-blood-sm {
  width: 32rpx;
  height: 32rpx;
  margin-right: 12rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23E53E3E' stroke='%23E53E3E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z'/%3E%3C/svg%3E");
}
.icon-syringe-sm {
  width: 32rpx;
  height: 32rpx;
  margin-right: 12rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23DD6B20' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m18 2 4 4'/%3E%3Cpath d='m17 7 3-3'/%3E%3Cpath d='M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5'/%3E%3Cpath d='m9 11 4 4'/%3E%3Cpath d='m5 19-3 3'/%3E%3Cpath d='m14 4 6 6'/%3E%3C/svg%3E");
}
.icon-meal-sm {
  width: 32rpx;
  height: 32rpx;
  margin-right: 12rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23D69E2E' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M18 8h1a4 4 0 0 1 0 8h-1'/%3E%3Cpath d='M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z'/%3E%3Cline x1='6' y1='1' x2='6' y2='4'/%3E%3Cline x1='10' y1='1' x2='10' y2='4'/%3E%3Cline x1='14' y1='1' x2='14' y2='4'/%3E%3C/svg%3E");
}
.icon-excretion-sm {
  width: 32rpx;
  height: 32rpx;
  margin-right: 12rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A34A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z'/%3E%3C/svg%3E");
}
.icon-weight-sm {
  width: 32rpx;
  height: 32rpx;
  margin-right: 12rpx;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A5568' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z'/%3E%3Cline x1='7' y1='7' x2='7.01' y2='7'/%3E%3C/svg%3E");
}
</style>
