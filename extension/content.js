// 监听来自popup的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getNoteData') {
        getNoteData().then(data => sendResponse(data));
        return true; // 保持消息通道开启，等待异步响应
    }
});

// 获取笔记数据
async function getNoteData() {
    try {
        // 获取标题
        const title = document.querySelector('#detail-title')?.textContent?.trim() || 
                     document.querySelector('.title')?.textContent?.trim() || 
                     '无标题';
        console.log('获取到标题:', title);

        // 获取正文内容
        const contentElement = document.querySelector('#detail-desc') || 
                             document.querySelector('.desc') || 
                             document.querySelector('.content');
        
        let content = '';
        if (contentElement) {
            // 克隆节点以避免修改原始DOM
            const clonedElement = contentElement.cloneNode(true);
            
            // 移除表情包图片
            clonedElement.querySelectorAll('img.note-content-emoji').forEach(img => img.remove());
            
            // 获取纯文本内容
            content = clonedElement.textContent
                .replace(/\[小红书表情\]/g, '')
                .replace(/\[[^\]]+\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();
        }
        console.log('获取到正文内容');

        // 获取图片
        const imgElements = document.querySelectorAll('.note-slider-img');
        console.log('找到图片元素:', imgElements.length);

        const images = await Promise.all(Array.from(imgElements)
            .filter(img => {
                const src = img.src;
                return src && !src.includes('avatar') && !src.includes('emoji');
            })
            .map(async (img, index) => {
                try {
                    const src = img.src;
                    console.log('处理图片:', index + 1, src);

                    const response = await fetch(src, {
                        headers: {
                            'Referer': 'https://www.xiaohongshu.com',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        }
                    });

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    const blob = await response.blob();
                    console.log('图片获取成功:', index + 1);

                    return {
                        url: src,
                        blob: blob,
                        filename: `${sanitizeFilename(title)}_${index + 1}.jpg`
                    };
                } catch (error) {
                    console.error('处理图片失败:', error, src);
                    return null;
                }
            }));

        const validImages = images.filter(Boolean);
        console.log('成功处理图片数量:', validImages.length);

        return {
            title,
            content,
            images: validImages,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('获取笔记数据失败:', error);
        return { error: error.message };
    }
}

// 文件名清理函数
function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
} 