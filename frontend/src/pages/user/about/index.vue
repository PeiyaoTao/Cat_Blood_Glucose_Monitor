<template>
  <view class="container">
    <view class="logo-wrap">
      <view class="logo-icon"></view>
      <text class="app-name">猫咪控糖日记</text>
      <text class="version">v1.0.0</text>
    </view>
    
    <view class="card">
      <view class="card-title-wrap">
        <view class="icon-svg icon-doctor"></view>
        <text class="card-title" style="margin-bottom: 0;">医学免责声明</text>
      </view>
      <text class="desc">
        本小程序是一个帮助宠物主人记录和管理猫咪血糖、打针数据的辅助工具。
        
        【重要提醒】：本程序内置的高危警告及目标范围（基于 T/CVMA 195-2024 等相关参考）仅供监控参考，<text style="font-weight: 800; color: #E74C3C;">绝不能替代执业兽医师的专业诊断与治疗建议</text>。
        
        如果您的猫咪出现异常症状（如多饮多尿、食欲减退、呕吐或极度虚弱），请立即联系并前往专业的宠物医院就诊！
      </text>
    </view>
    
    <view class="card">
      <view class="card-title-wrap">
        <view class="icon-svg icon-idea"></view>
        <text class="card-title" style="margin-bottom: 0;">关于我们</text>
      </view>
      <text class="desc">
        这个小程序诞生于一个爱猫程序员的桌面，旨在帮助所有糖尿病患猫的家庭更科学、便捷地进行日常数据管理。希望天下所有的毛孩子们都能健康快乐！
      </text>
    </view>
  </view>
</template>

<style scoped>
.container { padding: 32rpx; min-height: 100vh; background: var(--bg-color); }
.logo-wrap { display: flex; flex-direction: column; align-items: center; margin: 60rpx 0; }
.logo-icon { width: 160rpx; height: 160rpx; margin-bottom: 24rpx; border-radius: 40rpx; background-color: #FFF3E0; box-shadow: 0 8rpx 32rpx rgba(230,126,34,0.15); background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23E67E22' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1.1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z'/%3E%3Cpath d='M8 14v.5'/%3E%3Cpath d='M16 14v.5'/%3E%3Cpath d='M11.25 16.25h1.5L12 17l-.75-.75Z'/%3E%3C/svg%3E"); background-size: 60%; background-repeat: no-repeat; background-position: center; }
.app-name { font-size: 40rpx; font-weight: 800; color: var(--text-main); margin-bottom: 8rpx; }
.version { font-size: 24rpx; color: var(--text-sub); }
.card { background: #FFFFFF; border-radius: 24rpx; padding: 40rpx; margin-bottom: 32rpx; }
.card-title { font-size: 32rpx; font-weight: 700; color: var(--text-main); margin-bottom: 24rpx; display: block; }
.card-title-wrap { display: flex; align-items: center; margin-bottom: 24rpx; }
.desc { font-size: 28rpx; color: var(--text-sub); line-height: 1.6; display: block; }
.icon-svg {
  display: inline-block;
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  width: 36rpx; height: 36rpx; margin-right: 12rpx; vertical-align: middle;
}
.icon-doctor {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%233498DB' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z'/%3E%3C/svg%3E");
}
.icon-idea {
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23F1C40F' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M9 18h6'/%3E%3Cpath d='M10 22h4'/%3E%3Cpath d='M12 2v1'/%3E%3Cpath d='M12 7v1'/%3E%3Cpath d='M5 10h1'/%3E%3Cpath d='M18 10h1'/%3E%3Cpath d='M6.34 3.34l.71.71'/%3E%3Cpath d='M16.95 4.05l.71-.71'/%3E%3Cpath d='M7 14A5 5 0 0 1 12 9a5 5 0 0 1 5 5v1a2 2 0 0 1-2 2h-6a2 2 0 0 1-2-2z'/%3E%3C/svg%3E");
}
</style>
