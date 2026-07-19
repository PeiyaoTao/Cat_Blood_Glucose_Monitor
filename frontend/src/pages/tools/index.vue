<template>
  <view class="container">
    <view class="page-header">
      <text class="page-title">实用工具</text>
    </view>

    <view class="tools-grid">
      <view class="tool-card" @click="handleToolClick('单位换算器')">
        <view class="icon-wrap" style="background: #E8F8F5;">
          <view class="icon-svg icon-convert"></view>
        </view>
        <text class="tool-name">单位换算</text>
        <text class="tool-desc">mmol/L ↔ mg/dL</text>
      </view>

      <view class="tool-card" @click="handleToolClick('干物质计算器')">
        <view class="icon-wrap" style="background: #FEF9E7;">
          <view class="icon-svg icon-food"></view>
        </view>
        <text class="tool-name">干物质计算</text>
        <text class="tool-desc">计算猫粮碳水</text>
      </view>

      <view class="tool-card" @click="handleToolClick('医疗提醒')">
        <view class="icon-wrap" style="background: #EBF5FB;">
          <view class="icon-svg icon-alarm"></view>
        </view>
        <text class="tool-name">打针提醒</text>
        <text class="tool-desc">准时注射不遗漏</text>
      </view>
      
      <view class="tool-card" @click="handleToolClick('导出报告')">
        <view class="icon-wrap" style="background: #FDEDEC;">
          <view class="icon-svg icon-report"></view>
        </view>
        <text class="tool-name">导出报告</text>
        <text class="tool-desc">生成就诊 Excel</text>
      </view>
    </view>
  </view>
</template>

<script setup lang="ts">
const handleToolClick = (toolName: string) => {
  if (toolName === '单位换算器' || toolName === '单位换算') {
    uni.navigateTo({ url: '/pages/tools/converter/index' })
  } else if (toolName === '干物质计算器' || toolName === '干物质计算') {
    uni.navigateTo({ url: '/pages/tools/dry-matter/index' })
  } else if (toolName === '导出报告') {
    uni.showActionSheet({
      itemList: ['导出最近 30 天 (推荐)', '导出全部记录'],
      success: function (res) {
        const days = res.tapIndex === 0 ? 30 : 0
        exportExcel(days)
      }
    })
  } else {
    uni.showToast({
      title: `${toolName} 开发中`,
      icon: 'none'
    })
  }
}

const exportExcel = async (days: number) => {
  // @ts-ignore
  if (typeof wx === 'undefined' || !wx.cloud) return
  
  uni.showLoading({ title: '正在生成表格...', mask: true })
  
  try {
    // @ts-ignore
    const res = await wx.cloud.callFunction({
      name: 'exportExcel',
      data: { days }
    })
    
    if (res.result && res.result.code === 0 && res.result.fileID) {
      uni.showLoading({ title: '正在下载文件...' })
      // @ts-ignore
      wx.cloud.downloadFile({
        fileID: res.result.fileID,
        success: (downloadRes: any) => {
          uni.hideLoading()
          // @ts-ignore
          wx.openDocument({
            filePath: downloadRes.tempFilePath,
            showMenu: true, // 允许用户转发
            success: function () {
              console.log('打开文档成功')
            },
            fail: function (err: any) {
              uni.showToast({ title: '打开失败，请稍后重试', icon: 'none' })
              console.error(err)
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
</style>
