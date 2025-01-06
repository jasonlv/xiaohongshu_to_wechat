const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const BUILD_DIR = path.join(__dirname, '../build');

// 确保 build 目录存在
if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR);
}

async function generateIcons() {
    try {
        // 读取 SVG 源文件
        const svgBuffer = fs.readFileSync(path.join(BUILD_DIR, 'icon.svg'));

        // 生成不同尺寸的 PNG
        const sizes = [16, 32, 48, 64, 128, 256, 512];

        for (const size of sizes) {
            await sharp(svgBuffer)
                .resize(size, size)
                .png()
                .toFile(path.join(BUILD_DIR, `icon-${size}.png`));

            console.log(`生成 ${size}x${size} PNG 图标`);
        }

        // 生成 Windows ICO 文件
        const images = sizes.map(size => ({
            input: path.join(BUILD_DIR, `icon-${size}.png`),
            size: size
        }));

        await sharp(path.join(BUILD_DIR, 'icon-256.png'))
            .toFile(path.join(BUILD_DIR, 'icon.ico'));

        console.log('生成 ICO 文件完成');

        // 生成托盘图标
        await sharp(svgBuffer)
            .resize(32, 32)
            .png()
            .toFile(path.join(BUILD_DIR, 'tray.png'));

        console.log('生成托盘图标完成');

        // 清理临时文件
        for (const size of sizes) {
            fs.unlinkSync(path.join(BUILD_DIR, `icon-${size}.png`));
        }

        console.log('图标生成完成！');
    } catch (error) {
        console.error('生成图标时出错:', error);
        process.exit(1);
    }
}

generateIcons(); 