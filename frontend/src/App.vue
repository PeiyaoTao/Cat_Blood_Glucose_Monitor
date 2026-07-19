<script setup lang="ts">
import { onLaunch, onShow, onHide } from "@dcloudio/uni-app";
onLaunch(() => {
  console.log("App Launch");
});
onShow(() => {
  console.log("App Show");
});
onHide(() => {
  console.log("App Hide");
});
</script>

<style>
page {
  background-color: #F7F9FC;
  font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Helvetica, Segoe UI, Arial, Roboto, 'PingFang SC', 'miui', 'Hiragino Sans GB', 'Microsoft Yahei', sans-serif;
  color: #2C3E50;
  --primary: #FF8A65; /* 暖橙色为主色调 */
  --primary-light: #FFDAB9;
  --text-main: #2C3E50;
  --text-sub: #95A5A6;
  --bg-color: #F7F9FC;
  --card-bg: #FFFFFF;
  --safe-green: #2ECC71;
  --danger-red: #E74C3C;
}

.container {
  padding: 32rpx;
  padding-bottom: env(safe-area-inset-bottom);
}

.card {
  background: var(--card-bg);
  border-radius: 32rpx;
  box-shadow: 0 8rpx 32rpx rgba(44, 62, 80, 0.05);
  padding: 32rpx;
  margin-bottom: 32rpx;
}

/* 按钮通用样式 */
.btn {
  border-radius: 100rpx;
  text-align: center;
  font-weight: 600;
  font-size: 32rpx;
  display: flex;
  justify-content: center;
  align-items: center;
  transition: all 0.2s;
}

.btn:active {
  transform: scale(0.98);
  opacity: 0.9;
}

.btn-primary {
  background: linear-gradient(135deg, #FF8A65 0%, #FF7043 100%);
  color: #FFFFFF;
  box-shadow: 0 8rpx 24rpx rgba(255, 138, 101, 0.3);
}

.btn-secondary {
  background: #FFFFFF;
  color: var(--primary);
  border: 2rpx solid var(--primary-light);
}
</style>
