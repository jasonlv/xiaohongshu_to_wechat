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
        let images = [];
        try {
            const imgElements = document.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) .note-slider-img');
            console.log('找到图片元素:', imgElements.length);

            if (imgElements.length === 0) {
                console.log('未找到图片，尝试其他选择器');
                // 尝试其他可能的选择器
                const otherSelectors = [
                    '.note-content img[src*="xhscdn.com"]',
                    '.main-image img',
                    'img[src*="xhscdn.com"]:not(.avatar-item):not(.note-content-emoji)'
                ];
                
                for (const selector of otherSelectors) {
                    const elements = document.querySelectorAll(selector);
                    if (elements.length > 0) {
                        console.log(`使用选择器 ${selector} 找到图片:`, elements.length);
                        imgElements = elements;
                        break;
                    }
                }
            }

            // 修改图片获取函数
            async function downloadImage(url) {
                try {
                    // 创建一个隐藏的链接元素
                    const link = document.createElement('a');
                    link.style.display = 'none';
                    link.href = url;
                    link.download = ''; // 使用原始文件名
                    link.target = '_blank';
                    link.rel = 'noopener noreferrer';
                    
                    // 模拟右键 - 另存为的行为
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    
                    // 等待一下确保下载开始
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    
                    return true;
                } catch (error) {
                    console.error('下载图片失败:', error, url);
                    return false;
                }
            }

            // 修改图片处理部分
            const processedImages = await Promise.all(Array.from(imgElements).map(async (img, index) => {
                try {
                    let imageUrl = img.getAttribute('data-src') || img.src;
                    if (!imageUrl) {
                        console.warn('图片元素没有有效的URL:', img);
                        return null;
                    }

                    // 清理图片URL并确保使用HTTPS
                    imageUrl = imageUrl.split('?')[0].replace('http://', 'https://');
                    console.log('处理图片:', index + 1, imageUrl);

                    // 直接返回图片URL和文件名
                    return {
                        url: imageUrl,
                        filename: `${sanitizeFilename(title)}_${index + 1}.jpg`
                    };
                } catch (error) {
                    console.error('处理图片失败:', error, imageUrl);
                    return null;
                }
            }));

            images = processedImages.filter(Boolean);
            console.log('成功处理图片数量:', images.length);
        } catch (error) {
            console.error('获取图片过程中出错:', error);
            images = [];
        }

        // 返回结果
        const result = {
            title,
            content,
            images,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };

        console.log('数据获取完成:', {
            hasTitle: !!result.title,
            contentLength: result.content.length,
            imageCount: result.images.length
        });

        return result;
    } catch (error) {
        console.error('获取笔记数据失败:', error);
        return { error: error.message };
    }
}

// 文件名清理函数
function sanitizeFilename(name) {
    return (name || '').replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim() || 'untitled';
} 