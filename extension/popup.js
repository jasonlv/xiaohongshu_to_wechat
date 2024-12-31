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

                // 创建下载链接
                const a = document.createElement('a');
                a.href = image.url;
                a.download = `${folderName}_${i + 1}.jpg`;
                a.target = '_blank';
                a.rel = 'noopener noreferrer';
                
                // 模拟用户点击下载
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
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

function sanitizeFilename(name) {
    return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').trim();
} 