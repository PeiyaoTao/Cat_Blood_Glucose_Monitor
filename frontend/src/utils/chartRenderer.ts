/**
 * Canvas 2D 图表共享标尺计算与绘制原语模块
 *
 * 供首页折线图 (pages/index/index.vue) 与全屏深度趋势分析 (FullscreenAnalysisModal.vue) 共用，
 * 消除重复的坐标标尺计算、虚线网格、选中光柱、防溢出数值标签与 X 轴刻度渲染逻辑。
 */

export interface WeightScaleResult {
  minWeight: number
  maxWeight: number
  midWeight: number
  weightSpan: number
  getY: (wt: number, topY: number, bottomY: number) => number
}

/**
 * 智能计算自适应体重 Y 轴标尺（默认生理区间 3.0~6.0kg，保持顶部呼吸余量且最小跨度 >= 2.0kg）
 */
export const computeWeightScale = (validWeights: number[]): WeightScaleResult => {
  let minWeight = 3.0
  let maxWeight = 6.0

  if (validWeights.length > 0) {
    const dataMin = Math.min(...validWeights)
    const dataMax = Math.max(...validWeights)

    if (dataMax > 5.2) {
      maxWeight = Math.ceil((dataMax + 0.8) * 2) / 2
    } else {
      maxWeight = 6.0
    }

    if (dataMin < 3.0) {
      minWeight = Math.max(0, Math.floor((dataMin - 0.8) * 2) / 2)
    } else if (dataMin >= 5.0 && minWeight === 3.0) {
      minWeight = Math.floor((dataMin - 0.8) * 2) / 2
    }
  }

  if (maxWeight - minWeight < 2.0) {
    const mid = (maxWeight + minWeight) / 2
    minWeight = Math.max(0, Math.floor((mid - 1.0) * 2) / 2)
    maxWeight = minWeight + 2.0
  }

  const weightSpan = maxWeight - minWeight
  const midWeight = Number(((minWeight + maxWeight) / 2).toFixed(1))

  const getY = (wt: number, topY: number, bottomY: number) => {
    const clamped = Math.max(minWeight, Math.min(maxWeight, wt))
    return bottomY - ((clamped - minWeight) / weightSpan) * (bottomY - topY)
  }

  return { minWeight, maxWeight, midWeight, weightSpan, getY }
}

/**
 * 绘制选中数据点的竖向高亮光柱与中心虚线
 */
export const drawSelectionBeam = (
  ctx: any,
  selX: number,
  topY: number,
  bottomY: number,
  beamWidth: number = 28
) => {
  ctx.fillStyle = 'rgba(59, 130, 246, 0.08)'
  ctx.fillRect(selX - beamWidth / 2, topY - 5, beamWidth, bottomY - topY + 10)

  ctx.setLineDash([3, 3])
  ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)'
  ctx.beginPath()
  ctx.moveTo(selX, topY - 5)
  ctx.lineTo(selX, bottomY)
  ctx.stroke()
  ctx.setLineDash([])
}

/**
 * 绘制连续折线
 */
export const drawContinuousPolyline = (
  ctx: any,
  points: { x: number; y: number }[],
  strokeStyle: string,
  lineWidth: number
) => {
  if (!points.length) return
  ctx.beginPath()
  ctx.strokeStyle = strokeStyle
  ctx.lineWidth = lineWidth
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.moveTo(points[0].x, points[0].y)
  for (let j = 1; j < points.length; j++) {
    ctx.lineTo(points[j].x, points[j].y)
  }
  ctx.stroke()
}

/**
 * 绘制带边界防截断保护的数据点文本标签
 */
export const drawClampedPointLabel = (
  ctx: any,
  textStr: string,
  x: number,
  textY: number,
  padLeft: number,
  padRight: number,
  canvasWidth: number,
  color: string,
  font: string
) => {
  ctx.fillStyle = color
  ctx.font = font
  const numW = (ctx.measureText ? ctx.measureText(textStr).width : 0) || 24
  const halfNumW = numW / 2

  let drawNumX = x
  const safeTextLeft = padLeft - 2 + halfNumW
  const safeTextRight = canvasWidth - 4 - halfNumW
  if (drawNumX < safeTextLeft && x >= padLeft - 6) {
    drawNumX = safeTextLeft
  } else if (drawNumX > safeTextRight && x <= padRight + 10) {
    drawNumX = safeTextRight
  }

  ctx.textAlign = 'center'
  ctx.fillText(textStr, drawNumX, textY)
}

/**
 * 绘制带首尾边界防截断保护的 X 轴日期刻度
 */
export const drawClampedXAxisLabel = (
  ctx: any,
  label: string,
  x: number,
  y: number,
  padLeft: number,
  canvasWidth: number,
  color: string,
  font: string
) => {
  ctx.fillStyle = color
  ctx.font = font
  const textW = (ctx.measureText ? ctx.measureText(label).width : 0) || 28
  const halfW = textW / 2
  let drawX = x
  const safeLeft = padLeft - 2
  const safeRight = canvasWidth - 6
  if (drawX - halfW < safeLeft) {
    drawX = safeLeft + halfW
  } else if (drawX + halfW > safeRight) {
    drawX = safeRight - halfW
  }
  ctx.textAlign = 'center'
  ctx.fillText(label, drawX, y)
}
