<template>
  <view class="container">
    <view class="page-header">
      <text class="page-title">实用工具</text>
    </view>

    <view class="tools-grid">
      <view class="tool-card" @click="handleToolClick('单位换算')">
        <view class="icon-wrap" style="background: #E8F8F5;">
          <view class="icon-svg icon-convert"></view>
        </view>
        <text class="tool-name">单位换算</text>
        <text class="tool-desc">mmol/L ↔ mg/dL</text>
      </view>

      <view class="tool-card" @click="handleToolClick('干物质计算')">
        <view class="icon-wrap" style="background: #FEF9E7;">
          <view class="icon-svg icon-food"></view>
        </view>
        <text class="tool-name">干物质计算</text>
        <text class="tool-desc">计算猫粮碳水</text>
      </view>

      <view class="tool-card" @click="handleToolClick('自动喂食托管')">
        <view class="icon-wrap" style="background: #F0FDF4;">
          <view class="icon-svg icon-feeder"></view>
        </view>
        <text class="tool-name">自动喂食托管</text>
        <text class="tool-desc" :class="{ 'text-running': isFeederRunning }">{{ feederStatusDesc }}</text>
      </view>

      <view class="tool-card" @click="handleToolClick('设置提醒')">
        <view class="icon-wrap" style="background: #EBF5FB;">
          <view class="icon-svg icon-alarm"></view>
        </view>
        <text class="tool-name">设置提醒</text>
        <text class="tool-desc">打针/测血糖不遗漏</text>
      </view>
      
      <view class="tool-card" @click="handleToolClick('导出报告')">
        <view class="icon-wrap" style="background: #FDEDEC;">
          <view class="icon-svg icon-report"></view>
        </view>
        <text class="tool-name">导出报告</text>
        <text class="tool-desc">生成就诊 Excel</text>
      </view>

      <view class="tool-card" @click="handleToolClick('导入数据')">
        <view class="icon-wrap" style="background: #F8FAFC;">
          <view class="icon-svg icon-import"></view>
        </view>
        <text class="tool-name">导入数据</text>
        <text class="tool-desc">智能识别历史 Excel</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { onShow } from '@dcloudio/uni-app'
import { getFeederConfig, isFeederConfigValid } from '@/utils/feederSync'

const feederStatusDesc = ref('适配喂食机定时出餐')
const isFeederRunning = ref(false)

const refreshFeederStatus = () => {
  const catId = uni.getStorageSync('currentCatId') || 'default'
  const cfg = getFeederConfig(catId)
  if (cfg.is_active && isFeederConfigValid(cfg)) {
    isFeederRunning.value = true
    feederStatusDesc.value = `● 运行中 (${cfg.schedule.length}餐/天)`
  } else if (isFeederConfigValid(cfg)) {
    isFeederRunning.value = false
    feederStatusDesc.value = '○ 已暂停托管'
  } else {
    isFeederRunning.value = false
    feederStatusDesc.value = '未设置出餐计划'
  }
}

onShow(() => {
  refreshFeederStatus()
})

const handleToolClick = (toolName: string) => {
  switch (toolName) {
    case '自动喂食托管':
    case '自动喂食':
      uni.navigateTo({ url: '/pages/tools/auto-feeder/index' })
      break
    case '单位换算':
    case '单位换算器':
      uni.navigateTo({ url: '/pages/tools/converter/index' })
      break
    case '干物质计算':
    case '干物质计算器':
      uni.navigateTo({ url: '/pages/tools/dry-matter/index' })
      break
    case '导入数据':
    case '导入历史数据':
      uni.navigateTo({ url: '/pages/tools/import/index' })
      break
    case '设置提醒':
    case '打针提醒':
    case '医疗提醒':
      uni.navigateTo({ url: '/pages/tools/alarm/index' })
      break
    case '导出报告':
      uni.showActionSheet({
        itemList: ['导出最近 30 天 (推荐)', '导出全部记录'],
        success: (res) => {
          const days = res.tapIndex === 0 ? 30 : 0
          exportExcel(days)
        }
      })
      break
  }
}

const exportExcel = async (days: number) => {
  // @ts-ignore
  if (typeof wx === 'undefined' || !wx.cloud) return
  
  uni.showLoading({ title: '正在生成表格...', mask: true })
  
  try {
    const catId = uni.getStorageSync('currentCatId') || 'default'
    const res = await wx.cloud.callFunction({
      name: 'exportExcel',
      data: { days, catId }
    })
    
    if (res.result && res.result.code === 0 && res.result.fileID) {
      uni.showLoading({ title: '正在下载文件...' })
      // @ts-ignore
      wx.cloud.downloadFile({
        fileID: res.result.fileID,
        success: (downloadRes: any) => {
          uni.hideLoading()
          const customFileName = res.result.fileName || '血糖报告.xlsx'
          // @ts-ignore
          const fs = wx.getFileSystemManager()
          // @ts-ignore
          const targetPath = `${wx.env.USER_DATA_PATH}/${customFileName}`

          fs.copyFile({
            srcPath: downloadRes.tempFilePath,
            destPath: targetPath,
            success: () => {
              // @ts-ignore
              wx.openDocument({
                filePath: targetPath,
                fileType: 'xlsx',
                showMenu: true,
                success: function () {
                  console.log('打开文档成功:', customFileName)
                },
                fail: function (openErr: any) {
                  console.error('打开重命名文件失败，回退打开临时文件', openErr)
                  // @ts-ignore
                  wx.openDocument({
                    filePath: downloadRes.tempFilePath,
                    fileType: 'xlsx',
                    showMenu: true
                  })
                }
              })
            },
            fail: (copyErr: any) => {
              console.error('复制重命名文件失败，使用原路径打开', copyErr)
              // @ts-ignore
              wx.openDocument({
                filePath: downloadRes.tempFilePath,
                fileType: 'xlsx',
                showMenu: true
              })
            }
          })
        },
        fail: (err: any) => {
          uni.hideLoading()
          uni.showToast({ title: '下载失败', icon: 'none' })
          console.error(err)
        }
      })
    } else {
      uni.hideLoading()
      uni.showToast({ title: '生成失败，请检查云函数部署', icon: 'none' })
      console.error(res.result)
    }
  } catch (err) {
    uni.hideLoading()
    console.error('调用云函数失败', err)
    uni.showToast({ title: '调用失败，请确保云函数 exportExcel 已部署', icon: 'none' })
  }
}
</script>

<style scoped>
.container {
  padding: 32rpx;
  min-height: 100vh;
  background-color: var(--bg-color);
}
.page-header {
  margin-bottom: 40rpx;
  padding-top: 20rpx;
}
.page-title {
  font-size: 48rpx;
  font-weight: 800;
  color: var(--text-main);
}
.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 32rpx;
}
.tool-card {
  background: #FFFFFF;
  border-radius: 24rpx;
  padding: 40rpx 32rpx;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4rpx 16rpx rgba(0,0,0,0.02);
}
.icon-wrap {
  width: 80rpx;
  height: 80rpx;
  border-radius: 20rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 24rpx;
}
.icon {
  font-size: 40rpx;
}
.tool-name {
  font-size: 32rpx;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8rpx;
}
.tool-desc {
  font-size: 24rpx;
  color: var(--text-sub);
}
.text-running {
  color: #10B981 !important;
  font-weight: 600;
}
.icon-svg {
  width: 44rpx;
  height: 44rpx;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
}
.icon-convert { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232ECC71' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m16 3 4 4-4 4'/%3E%3Cpath d='M20 7H4'/%3E%3Cpath d='m8 21-4-4 4-4'/%3E%3Cpath d='M4 17h16'/%3E%3C/svg%3E"); }
.icon-food { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F1C40F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21.21 15.89A10 10 0 1 1 8 2.83'/%3E%3Cpath d='M22 12A10 10 0 0 0 12 2v10z'/%3E%3C/svg%3E"); }
.icon-alarm { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233498DB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='12' cy='12' r='10'/%3E%3Cpolyline points='12 6 12 12 16 14'/%3E%3C/svg%3E"); }
.icon-report { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23E74C3C' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cline x1='12' x2='12' y1='20' y2='10'/%3E%3Cline x1='18' x2='18' y1='20' y2='4'/%3E%3Cline x1='6' x2='6' y1='20' y2='16'/%3E%3C/svg%3E"); }
.icon-feeder { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2310B981' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Crect x='2' y='4' width='20' height='16' rx='2'/%3E%3Cpath d='M6 8h4'/%3E%3Cpath d='M6 12h8'/%3E%3Ccircle cx='16' cy='8' r='2'/%3E%3Cpath d='M10 16h8'/%3E%3C/svg%3E"); }
.icon-import { background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2316A085' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/%3E%3Cpolyline points='17 8 12 3 7 8'/%3E%3Cline x1='12' y1='3' x2='12' y2='15'/%3E%3C/svg%3E"); }
</style>
