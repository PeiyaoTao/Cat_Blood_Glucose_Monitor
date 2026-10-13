import type { Ref } from 'vue'

/**
 * 图表手势引擎（首页图表与全屏分析弹窗共用）
 *
 * 负责：单指 1:1 跟手拖拽 + 边界弹性阻尼、惯性滑行、边界回弹、
 * 长按 220ms 进入滑动选点、轻点选点、双指以中心为锚点的缩放（含释放防跳变保护）。
 *
 * 滚动偏移 scrollX 仍由组件自身持有（绘图、滚动条等逻辑需要直接读写），
 * 通过 getScrollX / setScrollX 访问器与本引擎同步。
 */

export interface PlotMetrics {
  padLeft: number
  plotWidth: number
  spacing: number
}

export interface ChartGestureOptions {
  /** 当前视窗内展示的数据点数量（缩放级别） */
  zoomCount: Ref<number>
  /** 当前选中的数据点索引，-1 表示未选中 */
  selectedIndex: Ref<number>
  getScrollX: () => number
  setScrollX: (x: number) => void
  /** 数据点总数 */
  getItemCount: () => number
  getPlotMetrics: () => PlotMetrics
  /** 可滚动的最小偏移（<= 0） */
  getMinScrollX: () => number
  /** 画布左边缘在屏幕中的 X 坐标 */
  getBoxLeft: () => number
  getZoomLimits: () => { min: number; max: number }
  /** 滚动 / 缩放 / 选点变化后重绘 */
  redraw: () => void
  /** 双指缩放导致缩放级别变化时回调 */
  onZoomChange?: (count: number) => void
  /** 缩放触达极限时回调（用于播放动画 + 提示） */
  onZoomLimit?: (type: 'in' | 'out', limit: number) => void
  /** 拖拽越过左右边界时回调 */
  onEdgeLimit?: (dir: 'left' | 'right') => void
  /** 选点命中半径下限（px），默认 22 */
  hitRadiusMin?: number
  /** 缩放到极限后继续捏合多少 px 触发提示，默认 30 */
  pinchLimitThreshold?: number
  /** 越界拖拽多少 px 触发边界提示，默认 20 */
  edgeThreshold?: number
}

const LONG_PRESS_MS = 220
const MOVE_SLOP_PX = 6
const PINCH_PX_PER_UNIT = 22
const EDGE_DAMPING = 0.28
const INERTIA_GAIN = 14
const INERTIA_MAX = 25
const INERTIA_FRICTION = 0.92
const INERTIA_MIN_VELOCITY = 0.22
const REBOUND_MS = 240
const FRAME_MS = 16

export function useChartGestures(opts: ChartGestureOptions) {
  const hitRadiusMin = opts.hitRadiusMin ?? 22
  const pinchLimitThreshold = opts.pinchLimitThreshold ?? 30
  const edgeThreshold = opts.edgeThreshold ?? 20

  let animTimer: any = null
  let longPressTimer: any = null
  let lastTouchEndTime = 0

  let touchStartX = 0
  let touchStartY = 0
  let touchStartScrollX = 0
  let lastTouchX = 0
  let lastTouchTime = 0
  let velocity = 0
  let isDragging = false
  let isScrubbing = false
  let isPinching = false
  let wasPinching = false
  let startPinchDist = 0
  let startZoomCount = 0
  let startPinchItemIdx = 0
  let edgeTriggered = false

  const stopAnimation = () => {
    if (animTimer) {
      clearTimeout(animTimer)
      animTimer = null
    }
  }

  const clearLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = null
    }
  }

  const isOutOfBounds = () => {
    const x = opts.getScrollX()
    return x > 0 || x < opts.getMinScrollX()
  }

  /** 最近 ms 毫秒内是否刚结束过图表触控（用于拦截合成 tap 误取消选中） */
  const wasTouchedRecently = (ms: number = 400) => Date.now() - lastTouchEndTime < ms

  /** 根据屏幕 X 坐标选中最近的数据点，未命中则取消选中 */
  const selectAt = (clientX: number) => {
    const total = opts.getItemCount()
    if (!total) return
    const { padLeft, spacing } = opts.getPlotMetrics()
    const clickX = clientX - opts.getBoxLeft()
    const scrollX = opts.getScrollX()

    let closestIdx = -1
    let minDiff = Infinity
    for (let i = 0; i < total; i++) {
      const diff = Math.abs(padLeft + i * spacing + scrollX - clickX)
      if (diff < minDiff) {
        minDiff = diff
        closestIdx = i
      }
    }

    const hitRadius = Math.max(hitRadiusMin, spacing / 2)
    if (closestIdx !== -1 && minDiff <= hitRadius) {
      opts.selectedIndex.value = closestIdx
      opts.redraw()
    } else if (opts.selectedIndex.value !== -1) {
      opts.selectedIndex.value = -1
      opts.redraw()
    }
  }

  /** 边界弹性回弹动画 (ease-out cubic) */
  const reboundToBoundary = () => {
    stopAnimation()
    const start = opts.getScrollX()
    const target = start > 0 ? 0 : opts.getMinScrollX()
    const startTime = Date.now()

    const step = () => {
      const progress = Math.min(1, (Date.now() - startTime) / REBOUND_MS)
      const ease = 1 - Math.pow(1 - progress, 3)
      opts.setScrollX(start + (target - start) * ease)
      opts.redraw()
      if (progress < 1) {
        animTimer = setTimeout(step, FRAME_MS)
      } else {
        opts.setScrollX(target)
        opts.redraw()
        animTimer = null
      }
    }
    step()
  }

  /** 惯性滑行减速动画 */
  const startInertia = (initVelocity: number) => {
    stopAnimation()
    let v = Math.max(-INERTIA_MAX, Math.min(INERTIA_MAX, initVelocity * INERTIA_GAIN))

    const step = () => {
      if (Math.abs(v) < 0.4) {
        animTimer = null
        if (isOutOfBounds()) reboundToBoundary()
        return
      }

      v *= INERTIA_FRICTION
      let x = opts.getScrollX() + v
      const minScroll = opts.getMinScrollX()
      if (x > 0) {
        x *= 0.6
        v *= 0.5
      } else if (x < minScroll) {
        x = minScroll + (x - minScroll) * 0.6
        v *= 0.5
      }
      opts.setScrollX(x)
      opts.redraw()

      if (x > 20 || x < minScroll - 20) {
        animTimer = null
        reboundToBoundary()
        return
      }
      animTimer = setTimeout(step, FRAME_MS)
    }
    step()
  }

  const onTouchStart = (e: any) => {
    if (!e.touches) return
    edgeTriggered = false
    stopAnimation()

    // 双指按下 -> 准备以双指中心为锚点缩放
    if (e.touches.length === 2) {
      clearLongPress()
      isScrubbing = false
      isDragging = false
      isPinching = true
      wasPinching = true
      const [p1, p2] = e.touches
      startPinchDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
      startZoomCount = opts.zoomCount.value

      const { padLeft, plotWidth, spacing } = opts.getPlotMetrics()
      const pinchScreenX = (p1.clientX + p2.clientX) / 2
      const centerPlotX = Math.max(0, Math.min(plotWidth, pinchScreenX - opts.getBoxLeft() - padLeft))
      startPinchItemIdx = (-opts.getScrollX() + centerPlotX) / (spacing || 1)
      return
    }

    if (e.touches.length === 1) {
      // 若当前手势包含缩放，在所有手指彻底离开前，绝对不初始化单指参数
      if (isPinching || wasPinching) return

      touchStartX = e.touches[0].clientX
      touchStartY = e.touches[0].clientY
      touchStartScrollX = opts.getScrollX()
      lastTouchX = touchStartX
      lastTouchTime = Date.now()
      velocity = 0
      isDragging = false
      isScrubbing = false

      // 长按进入滑动选点模式
      clearLongPress()
      longPressTimer = setTimeout(() => {
        longPressTimer = null
        isScrubbing = true
        selectAt(touchStartX)
      }, LONG_PRESS_MS)
    }
  }

  const onTouchMove = (e: any) => {
    if (!e.touches) return

    // 双指缩放（以双指中心为几何锚点，保持锚点下的数据点位置不动）
    if (e.touches.length === 2 && isPinching) {
      const [p1, p2] = e.touches
      const curDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY)
      const diff = curDist - startPinchDist
      const { min, max } = opts.getZoomLimits()

      let targetCount = startZoomCount + Math.round(-diff / PINCH_PX_PER_UNIT)
      targetCount = Math.max(min, Math.min(max, targetCount))

      if (diff > pinchLimitThreshold && opts.zoomCount.value === min && !edgeTriggered) {
        edgeTriggered = true
        opts.onZoomLimit?.('in', min)
      } else if (diff < -pinchLimitThreshold && opts.zoomCount.value === max && !edgeTriggered) {
        edgeTriggered = true
        opts.onZoomLimit?.('out', max)
      } else if (targetCount > min && targetCount < max) {
        edgeTriggered = false
      }

      const { padLeft, plotWidth } = opts.getPlotMetrics()
      const pinchScreenX = (p1.clientX + p2.clientX) / 2
      const centerPlotX = Math.max(0, Math.min(plotWidth, pinchScreenX - opts.getBoxLeft() - padLeft))

      const changed = opts.zoomCount.value !== targetCount
      opts.zoomCount.value = targetCount
      const newSpacing = plotWidth / (targetCount - 1 || 1)
      const newScrollX = centerPlotX - startPinchItemIdx * newSpacing
      opts.setScrollX(Math.max(opts.getMinScrollX(), Math.min(0, newScrollX)))

      if (changed) opts.onZoomChange?.(targetCount)
      opts.redraw()
      return
    }

    // 严格防护：缩放手势未完全结束前，禁止退化为单指拖拽
    if (isPinching || wasPinching) return

    if (e.touches.length === 1) {
      const curX = e.touches[0].clientX
      const curY = e.touches[0].clientY
      const deltaX = curX - touchStartX
      const deltaY = curY - touchStartY

      const now = Date.now()
      const dt = now - lastTouchTime
      if (dt > 8) {
        velocity = (curX - lastTouchX) / dt
        lastTouchX = curX
        lastTouchTime = now
      }

      if (isScrubbing) {
        selectAt(curX)
        return
      }

      if (Math.hypot(deltaX, deltaY) > MOVE_SLOP_PX) {
        clearLongPress()

        // 横向位移占优时进入 1:1 像素级拖拽
        if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > MOVE_SLOP_PX) {
          isDragging = true
          const minScroll = opts.getMinScrollX()
          let target = touchStartScrollX + deltaX

          if (target > 0) {
            target *= EDGE_DAMPING
            if (deltaX > edgeThreshold && !edgeTriggered) {
              edgeTriggered = true
              opts.onEdgeLimit?.('left')
            }
          } else if (target < minScroll) {
            target = minScroll + (target - minScroll) * EDGE_DAMPING
            if (deltaX < -edgeThreshold && !edgeTriggered) {
              edgeTriggered = true
              opts.onEdgeLimit?.('right')
            }
          } else {
            edgeTriggered = false
          }

          opts.setScrollX(target)
          opts.redraw()
        }
      }
    }
  }

  const onTouchEnd = (e: any) => {
    lastTouchEndTime = Date.now()
    clearLongPress()
    edgeTriggered = false

    // 缩放释放：等待最后一根手指离开后才结束会话，杜绝单指跳变
    if (isPinching || wasPinching) {
      isPinching = false
      if (!e.touches || e.touches.length === 0) {
        wasPinching = false
        if (isOutOfBounds()) reboundToBoundary()
      }
      return
    }

    if (isScrubbing) {
      isScrubbing = false
      return
    }

    if (isDragging) {
      isDragging = false
      if (isOutOfBounds()) {
        reboundToBoundary()
      } else if (Math.abs(velocity) > INERTIA_MIN_VELOCITY) {
        startInertia(velocity)
      }
      return
    }

    // 单次轻点直接选点
    selectAt(touchStartX)
  }

  const onTouchCancel = () => {
    lastTouchEndTime = Date.now()
    clearLongPress()
    edgeTriggered = false
    isDragging = false
    isScrubbing = false
    isPinching = false
    wasPinching = false
    if (isOutOfBounds()) reboundToBoundary()
  }

  /** 组件卸载时清理定时器 */
  const dispose = () => {
    stopAnimation()
    clearLongPress()
  }

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    selectAt,
    stopAnimation,
    reboundToBoundary,
    wasTouchedRecently,
    dispose
  }
}
