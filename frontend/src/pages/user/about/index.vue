<template>
  <view class="container">
    <view class="logo-wrap">
      <text class="logo">🐱</text>
      <text class="app-name">猫咪控糖日记</text>
      <text class="version">v1.0.0</text>
    </view>
    
    <view class="card">
      <text class="card-title">👨‍⚕️ 医学免责声明</text>
      <text class="desc">
        本小程序是一个帮助宠物主人记录和管理猫咪血糖、打针数据的辅助工具。
        
        【重要提醒】：本程序内置的高危警告及目标范围（基于 T/CVMA 195-2024 等相关参考）仅供监控参考，<text style="font-weight: 800; color: #E74C3C;">绝不能替代执业兽医师的专业诊断与治疗建议</text>。
        
        如果您的猫咪出现异常症状（如多饮多尿、食欲减退、呕吐或极度虚弱），请立即联系并前往专业的宠物医院就诊！
      </text>
    </view>
    
    <view class="card">
      <text class="card-title">💡 关于我们</text>
      <text class="desc">
        这个小程序诞生于一个爱猫程序员的桌面，旨在帮助所有糖尿病患猫的家庭更科学、便捷地进行日常数据管理。希望天下所有的毛孩子们都能健康快乐！
      </text>
    </view>
  </view>
</template>

<style scoped>
.container { padding: 32rpx; min-height: 100vh; background: var(--bg-color); }
.logo-wrap { display: flex; flex-direction: column; align-items: center; margin: 60rpx 0; }
.logo { font-size: 120rpx; margin-bottom: 16rpx; }
.app-name { font-size: 40rpx; font-weight: 800; color: var(--text-main); margin-bottom: 8rpx; }
.version { font-size: 24rpx; color: var(--text-sub); }
.card { background: #FFFFFF; border-radius: 24rpx; padding: 40rpx; margin-bottom: 32rpx; }
.card-title { font-size: 32rpx; font-weight: 700; color: var(--text-main); margin-bottom: 24rpx; display: block; }
.desc { font-size: 28rpx; color: var(--text-sub); line-height: 1.6; display: block; }
</style>
