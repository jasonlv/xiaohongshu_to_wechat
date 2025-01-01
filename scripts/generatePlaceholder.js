const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// 确保目录存在
const assetsDir = process.env.NODE_ENV === 'production'
    ? '/opt/render/project/src/public/assets'
    : path.join(__dirname, '../public/assets');

fs.mkdirSync(assetsDir, { recursive: true });

// 创建一个 200x200 的灰色占位图片，带有文字
sharp({
    create: {
        width: 200,
        height: 200,
        channels: 4,
        background: { r: 240, g: 240, b: 240, alpha: 1 }
    }
})
.composite([{
    input: Buffer.from(`
    <svg width="200" height="200">
        <text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#999">
            图片加载失败
        </text>
    </svg>`),
    top: 0,
    left: 0
}])
.jpeg()
.toFile(path.join(assetsDir, 'placeholder.jpg'))
.then(() => console.log('占位图片已创建'))
.catch(err => console.error('创建占位图片失败:', err)); 