const fs = require('fs');
const path = require('path');

const uchartsPath = path.join(__dirname, 'node_modules/ch-ucharts/js_sdk/u-charts/u-charts.js');
const qiunPath = path.join(__dirname, 'node_modules/ch-ucharts/components/qiun-data-charts/qiun-data-charts.vue');

function patchUCharts() {
  if (!fs.existsSync(uchartsPath)) {
    console.log('[patch-ucharts] u-charts.js not found at', uchartsPath);
    return;
  }
  let content = fs.readFileSync(uchartsPath, 'utf8');

  // 1. Fix startTouchX = offsetLeft -> startTouchX = 0
  content = content.replace(
    '_this.scrollOption.startTouchX = offsetLeft',
    '_this.scrollOption.startTouchX = 0'
  );

  // 2. Fix startTouchX: offsetLeft -> startTouchX: 0
  content = content.replace(
    /startTouchX:\s*offsetLeft,/g,
    'startTouchX: 0,'
  );

  // 3. Fix translate startTouchX: distance -> startTouchX: 0
  content = content.replace(
    /startTouchX:\s*distance,/g,
    'startTouchX: 0,'
  );

  // 4. Fix calValidDistance to prevent crashes when pointsLen is 0 or undefined
  const newCalValid = `function calValidDistance(self, distance, chartData, config, opts) {
  var dataChartAreaWidth = opts.width - opts.area[1] - opts.area[3]
  var spacing = (chartData && chartData.eachSpacing) || (opts && opts.chartData && opts.chartData.xAxisData && opts.chartData.xAxisData.eachSpacing) || 0
  var pointsLen = (opts && opts.chartData && opts.chartData.xAxisData && opts.chartData.xAxisData.xAxisPoints) ? opts.chartData.xAxisData.xAxisPoints.length : 0
  var dataChartWidth = spacing * Math.max(0, pointsLen - 1)`;

  const calValidRegex = /function calValidDistance\(self, distance, chartData, config, opts\) \{\s*var dataChartAreaWidth = opts\.width - opts\.area\[1\] - opts\.area\[3\]\s*var [^\n]*dataChartWidth =[\s\S]*?pointsLen - 1\)/;
  const rawCalValidRegex = /function calValidDistance\(self, distance, chartData, config, opts\) \{\s*var dataChartAreaWidth = opts\.width - opts\.area\[1\] - opts\.area\[3\]\s*var dataChartWidth =\s*chartData\.eachSpacing \* \(opts\.chartData\.xAxisData\.xAxisPoints\.length - 1\)/;

  if (calValidRegex.test(content)) {
    content = content.replace(calValidRegex, newCalValid);
  } else if (rawCalValidRegex.test(content)) {
    content = content.replace(rawCalValidRegex, newCalValid);
  }

  // 5. Fix uCharts constructor: preserve opts._scrollDistance_ if provided
  const constructorScrollOptionRegex = /this\.scrollOption = \{\s*currentOffset: [^,\n]+,\s*startTouchX: 0,\s*distance: 0,\s*lastMoveTime: 0,\s*\}/;
  const newConstructorScrollOption = `this.scrollOption = {
    currentOffset: (opts.enableScroll && typeof opts._scrollDistance_ === 'number') ? opts._scrollDistance_ : 0,
    startTouchX: 0,
    distance: 0,
    lastMoveTime: 0,
  }`;
  if (constructorScrollOptionRegex.test(content)) {
    content = content.replace(constructorScrollOptionRegex, newConstructorScrollOption);
  }

  // 6. Fix right-align scroll distance initialization in drawCharts:
  // ONLY run when opts._scrollDistance_ === undefined (do not overwrite 0, which is valid earliest date)
  const newRightAlign = `  //计算右对齐偏移距离
  if (
    opts.enableScroll &&
    opts.xAxis &&
    opts.xAxis.scrollAlign == 'right' &&
    opts._scrollDistance_ === undefined
  ) {
    let offsetLeft = 0,
      xAxisPoints = opts.chartData.xAxisData.xAxisPoints,
      startX = opts.chartData.xAxisData.startX,
      endX = opts.chartData.xAxisData.endX,
      eachSpacing = opts.chartData.xAxisData.eachSpacing
    let totalWidth = eachSpacing * ((xAxisPoints ? xAxisPoints.length : 1) - 1)
    let screenWidth = endX - startX
    offsetLeft = Math.min(0, screenWidth - totalWidth)
    opts._scrollDistance_ = offsetLeft
    _this.scrollOption.currentOffset = offsetLeft
    _this.scrollOption.startTouchX = 0
    _this.scrollOption.distance = 0
    _this.scrollOption.lastMoveTime = 0
  }`;

  const rightAlignRegex = /\/\/计算右对齐偏移距离[\s\S]*?opts\._scrollDistance_[\s\S]*?lastMoveTime = 0\s*\}/;
  if (rightAlignRegex.test(content)) {
    content = content.replace(rightAlignRegex, newRightAlign);
  }

  // 7. Fix translate method: update this.opts
  const newTranslate = `uCharts.prototype.translate = function (distance) {
  this.scrollOption = {
    currentOffset: distance,
    startTouchX: 0,
    distance: 0,
    lastMoveTime: 0,
  }
  let opts = assign({}, this.opts, {
    _scrollDistance_: distance,
    animation: false,
  })
  this.opts = opts
  drawCharts.call(this, this.opts.type, opts, this.config, this.context)
}`;
  const translateRegex = /uCharts\.prototype\.translate = function \(distance\) \{[\s\S]*?drawCharts\.call\(this, this\.opts\.type, opts, this\.config, this\.context\)\s*\}/;
  if (translateRegex.test(content)) {
    content = content.replace(translateRegex, newTranslate);
  }

  // 8. Fix scrollStart: accurately record startTouchX and sync currentOffset from opts._scrollDistance_
  const newScrollStart = `uCharts.prototype.scrollStart = function (e) {
  var touches = null
  if (e.changedTouches) {
    touches = e.changedTouches[0]
  } else {
    touches = e.mp.changedTouches[0]
  }
  var _touches$ = getTouches(touches, this.opts, e)
  if (touches && this.opts.enableScroll === true) {
    this.scrollOption.startTouchX = _touches$.x
    if (typeof this.opts._scrollDistance_ === 'number') {
      this.scrollOption.currentOffset = this.opts._scrollDistance_
    }
  }
}`;
  const scrollStartRegex = /uCharts\.prototype\.scrollStart = function \(e\) \{[\s\S]*?_touches\$\.x[\s\S]*?\n\}/;
  if (scrollStartRegex.test(content)) {
    content = content.replace(scrollStartRegex, newScrollStart);
  }

  // 9. Fix scroll: smooth gesture tracking without jumping or resetting
  const newScroll = `uCharts.prototype.scroll = function (e) {
  if (this.scrollOption.lastMoveTime === 0) {
    this.scrollOption.lastMoveTime = Date.now()
  }
  let Limit = this.opts.touchMoveLimit || 60
  let currMoveTime = Date.now()
  let duration = currMoveTime - this.scrollOption.lastMoveTime
  if (duration < Math.floor(1000 / Limit)) return
  this.scrollOption.lastMoveTime = currMoveTime
  var touches = null
  if (e.changedTouches) {
    touches = e.changedTouches[0]
  } else {
    touches = e.mp.changedTouches[0]
  }
  if (touches && this.opts.enableScroll === true) {
    var _touches$ = getTouches(touches, this.opts, e)
    if (!this.scrollOption.startTouchX) {
      this.scrollOption.startTouchX = _touches$.x
      return
    }
    var _distance = _touches$.x - this.scrollOption.startTouchX
    var currentOffset = this.scrollOption.currentOffset
    var validDistance = calValidDistance(
      this,
      currentOffset + _distance,
      this.opts.chartData,
      this.config,
      this.opts,
    )
    this.scrollOption.distance = validDistance - currentOffset
    var opts = assign({}, this.opts, {
      _scrollDistance_: validDistance,
      animation: false,
    })
    this.opts = opts
    drawCharts.call(this, opts.type, opts, this.config, this.context)
    return validDistance
  }
}`;
  const scrollRegex = /uCharts\.prototype\.scroll = function \(e\) \{[\s\S]*?return (?:validDistance|currentOffset \+ _distance)\s*\}\s*\}/;
  if (scrollRegex.test(content)) {
    content = content.replace(scrollRegex, newScroll);
  }

  // 10. Fix scrollEnd: finalize currentOffset, sync _scrollDistance_, and reset startTouchX
  const newScrollEnd = `uCharts.prototype.scrollEnd = function (e) {
  if (this.opts.enableScroll === true) {
    var _scrollOption = this.scrollOption,
      currentOffset = _scrollOption.currentOffset,
      distance = _scrollOption.distance
    this.scrollOption.currentOffset = currentOffset + distance
    this.opts._scrollDistance_ = this.scrollOption.currentOffset
    this.scrollOption.distance = 0
    this.scrollOption.moveCount = 0
    this.scrollOption.startTouchX = 0
  }
}`;
  const scrollEndRegex = /uCharts\.prototype\.scrollEnd = function \(e\) \{[\s\S]*?\}\s*\}/;
  if (scrollEndRegex.test(content)) {
    content = content.replace(scrollEndRegex, newScrollEnd);
  }

  // 10. Support individual point color in drawPointShape (circle)
  const circleRegex = /\} else if \(shape === 'circle'\) \{\s*points\.forEach\(function \(item, index\) \{\s*if \(item !== null\) \{\s*context\.moveTo\(item\.x \+ 2\.5 \* opts\.pix, item\.y\)\s*context\.arc\(item\.x, item\.y, 3 \* opts\.pix, 0, 2 \* Math\.PI, false\)\s*\}\s*\}\)\s*\}/;
  const newCircleShape = `} else if (shape === 'circle') {
    points.forEach(function (item, index) {
      if (item !== null) {
        var ptColor = (item && item.color) || color
        context.beginPath()
        context.setStrokeStyle('#ffffff')
        context.setFillStyle(ptColor)
        context.setLineWidth(1.5 * opts.pix)
        context.arc(item.x, item.y, 3.5 * opts.pix, 0, 2 * Math.PI, false)
        context.closePath()
        context.fill()
        context.stroke()
      }
    })
    return
  }`;
  if (circleRegex.test(content)) {
    content = content.replace(circleRegex, newCircleShape);
  }

  // 11. Support individual point textColor in drawPointText
  const oldDrawPointTextLine = "context.setFillStyle(series.textColor || opts.fontColor)";
  const newDrawPointTextLine = "var pointColor = (typeof data[index] === 'object' && data[index] && (data[index].textColor || data[index].color)) || series.textColor || opts.fontColor;\n      context.setFillStyle(pointColor)";
  if (content.includes(oldDrawPointTextLine)) {
    content = content.replace(oldDrawPointTextLine, newDrawPointTextLine);
  }

  fs.writeFileSync(uchartsPath, content, 'utf8');
  console.log('[patch-ucharts] Successfully patched u-charts.js');
}

function patchQiun() {
  if (!fs.existsSync(qiunPath)) {
    console.log('[patch-ucharts] qiun-data-charts.vue not found at', qiunPath);
    return;
  }
  let content = fs.readFileSync(qiunPath, 'utf8');

  // Fix _touchStart condition (remove e.touches.length == 1 requirement)
  content = content.replace(
    'if (cfu.option[cid].enableScroll === true && e.touches.length == 1)',
    'if (cfu.option[cid].enableScroll === true)'
  );

  // Fix _touchMove condition (remove e.changedTouches.length == 1 requirement)
  content = content.replace(
    'cfu.option[cid].enableScroll === true &&\n        e.changedTouches.length == 1',
    'cfu.option[cid].enableScroll === true'
  );
  content = content.replace(
    'cfu.option[cid].enableScroll === true &&\r\n        e.changedTouches.length == 1',
    'cfu.option[cid].enableScroll === true'
  );

  // Fix _touchEnd condition (remove e.touches.length == 0 requirement)
  content = content.replace(
    'if (cfu.option[cid].enableScroll === true && e.touches.length == 0)',
    'if (cfu.option[cid].enableScroll === true)'
  );

  fs.writeFileSync(qiunPath, content, 'utf8');
  console.log('[patch-ucharts] Successfully patched qiun-data-charts.vue');
}

patchUCharts();
patchQiun();
