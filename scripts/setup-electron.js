const fs = require('fs');
const path = require('path');

// 确保 .electron 目录存在
const electronDir = path.join(__dirname, '../.electron');
if (!fs.existsSync(electronDir)) {
    fs.mkdirSync(electronDir, { recursive: true });
}

// 检查 electron zip 文件是否在正确位置
const version = '20.3.12';
const platform = process.platform === 'win32' ? 'win32' : 'darwin';
const arch = 'x64';
const zipFileName = `electron-v${version}-${platform}-${arch}.zip`;
const zipPath = path.join(electronDir, zipFileName);

if (!fs.existsSync(zipPath)) {
    console.log(`请将 ${zipFileName} 放在 .electron 目录下`);
    console.log(`目录路径: ${electronDir}`);
    process.exit(1);
}

console.log('Electron 文件已就绪！'); 