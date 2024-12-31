let noteData = null;

document.getElementById('getData').addEventListener('click', async () => {
    const status = document.getElementById('status');
    status.textContent = '正在获取数据...';

    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        
        if (!tab.url.includes('xiaohongshu.com')) {
            status.textContent = '请在小红书笔记页面使用';
            return;
        }

        noteData = await chrome.tabs.sendMessage(tab.id, { action: 'getNoteData' });
        if (noteData.error) {
            throw new Error(noteData.error);
        }

        status.textContent = '数据获取成功，准备下载...';
        
        if (noteData.images && noteData.images.length > 0) {
            await downloadImages(noteData);
        } else {
            status.textContent = '获取成功（无图片）';
        }
    } catch (error) {
        console.error('获取失败:', error);
        status.textContent = '获取失败: ' + error.message;
    }
});

document.getElementById('copyData').addEventListener('click', () => {
    const status = document.getElementById('status');
    
    if (!noteData) {
        status.textContent = '请先获取数据';
        return;
    }

    // 创建不包含blob数据的副本
    const dataToCopy = {
        ...noteData,
        images: noteData.images.map(img => ({
            url: img.url,
            filename: img.filename
        }))
    };

    navigator.clipboard.writeText(JSON.stringify(dataToCopy, null, 2))
        .then(() => {
            status.textContent = '数据已复制到剪贴板';
        })
        .catch(error => {
            status.textContent = '复制失败: ' + error.message;
        });
});

async function downloadImages(data) {
    if (!data.images || !data.images.length) return;

    const status = document.getElementById('status');
    const folderName = sanitizeFilename(data.title);
    
    try {
        // 首先下载文本内容
        const textBlob = new Blob([
            `标题：${data.title}\n\n正文：\n${data.content}\n\n来源：${data.url}`
        ], { type: 'text/plain' });
        
        const textUrl = URL.createObjectURL(textBlob);
        const textLink = document.createElement('a');
        textLink.href = textUrl;
        textLink.download = `${folderName}_content.txt`;
        document.body.appendChild(textLink);
        textLink.click();
        document.body.removeChild(textLink);
        URL.revokeObjectURL(textUrl);

        // 然后下载图片
        for (let i = 0; i < data.images.length; i++) {
            try {
                const image = data.images[i];
                console.log('准备下载图片:', i + 1, image.url);

                // 使用 Canvas 转换图片格式
                const img = new Image();
                img.crossOrigin = 'anonymous';  // 允许跨域
                
                // 等待图片加载
                await new Promise((resolve, reject) => {
                    img.onload = resolve;
                    img.onerror = reject;
                    img.src = image.url;
                });

                // 创建 canvas
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                
                // 将图片绘制到 canvas
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // 转换为 PNG 格式并下载
                canvas.toBlob(async (blob) => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `${folderName}_${i + 1}.png`;  // 使用 .png 扩展名
                    
                    // 模拟用户点击下载
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                }, 'image/png', 1.0);  // 指定 PNG 格式，最高质量

                status.textContent = `已下载 ${i + 1}/${data.images.length} 张图片`;
                // 等待一段时间再下载下一张
                await new Promise(resolve => setTimeout(resolve, 1500));
            } catch (error) {
                console.error('下载图片失败:', error);
                status.textContent = `图片 ${i + 1} 下载失败`;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        status.textContent = '所有文件下载完成！';
    } catch (error) {
        console.error('下载过程出错:', error);
        status.textContent = '下载过程出错: ' + error.message;
    }
}

// 文件名清理函数
function sanitizeFilename(name) {
    return name
        // 移除 emoji 表情符号
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        // 移除其他特殊 Unicode 符号和表情
        .replace(/[\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
        // 移除文件系统不允许的字符
        .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
        // 移除中文标点符号
        .replace(/[《》「」『』【】〖〗（）［］｛｝〈〉〔〕・，。、；：！？…～￥]/g, '')
        // 只保留字母、数字、中文、连字符和下划线
        .replace(/[^\w\s\u4e00-\u9fa5\-]/g, '')
        // 将连续的标点和空格替换为单个连字符
        .replace(/[\s\-_]+/g, '-')
        // 移除首尾的标点和空格
        .trim()
        .replace(/^[-_]+|[-_]+$/g, '')
        // 如果处理后为空，则使用默认名称
        || 'untitled';
} 