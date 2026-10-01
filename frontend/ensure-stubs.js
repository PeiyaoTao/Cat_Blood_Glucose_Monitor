const fs = require('fs');
const path = require('path');

const targets = [
  path.join(__dirname, 'dist', 'build', 'mp-weixin', 'node-modules', 'ch-ucharts', 'components', 'qiun-data-charts'),
  path.join(__dirname, 'dist', 'dev', 'mp-weixin', 'node-modules', 'ch-ucharts', 'components', 'qiun-data-charts')
];

targets.forEach(dir => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'qiun-data-charts.wxss'), '');
    fs.writeFileSync(path.join(dir, 'qiun-data-charts.wxml'), '');
    fs.writeFileSync(path.join(dir, 'qiun-data-charts.js'), 'Component({});\n');
    fs.writeFileSync(path.join(dir, 'qiun-data-charts.json'), '{"component": true}\n');
  } catch (err) {
    // Ignore if directory cannot be created
  }
});

console.log('[ensure-stubs] WeChat DevTools compatibility stubs ensured.');
