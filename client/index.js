// 工具函数：显示状态消息
function showStatus(message) {
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        statusBar.textContent = message;
        statusBar.classList.add('show');
        setTimeout(() => statusBar.classList.remove('show'), 3000);
    }
}

// 小红书爬虫类
class XiaohongshuCrawler {
    constructor() {
        this.baseUrl = 'http://localhost:8080';
    }

    async fetchNoteDetail(url) {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/note/detail?url=${encodeURIComponent(url)}`
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || '获取笔记详情失败');
            }

            return await response.json();
        } catch (error) {
            console.error('获取笔记详情失败:', error);
            throw error;
        }
    }
}

// 微信发布类
class WechatPublisher {
    constructor() {
        this.baseUrl = 'http://localhost:8080';
    }

    async createDraft(article) {
        try {
            console.log('开始发布文章:', article);

            const response = await fetch(`${this.baseUrl}/api/wechat/draft`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    article: {
                        title: article.title,
                        content: this.formatContent(article.content, article.images),
                        images: article.images,
                        author: '小红书笔记',
                        digest: article.content.slice(0, 120) // 摘要
                    }
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || data.details || '发布失败');
            }

            console.log('发布成功:', data);
            return data;
        } catch (error) {
            console.error('发布失败:', error);
            throw error;
        }
    }

    // 格式化文章内容，添加图片
    formatContent(content, images) {
        // 检查是否需要忽略话题标签
        const ignoreTopics = document.getElementById('ignoreTopics')?.checked;

        // 处理正文内容
        let processedContent = content;
        if (ignoreTopics) {
            // 找到第一个话题标签的位置
            const topicIndex = content.indexOf('#');
            if (topicIndex !== -1) {
                // 只保留话题标签之前的内容
                processedContent = content.substring(0, topicIndex).trim();
            }
        }

        // 将换行转换为HTML段落
        const paragraphs = processedContent
            .split('\n')
            .filter(p => p.trim())
            .map(p => `<p>${p}</p>`);

        // 在文章末尾添加图片
        const imageHtml = images.map(img =>
            `<p><img src="${img.url}" alt="笔记图片"></p>`
        ).join('');

        return paragraphs.join('') + imageHtml;
    }
}

// 主应用类
class App {
    constructor() {
        this.crawler = new XiaohongshuCrawler();
        this.publisher = new WechatPublisher();
        this.lastNote = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.restoreLastState();
    }

    bindEvents() {
        const fetchButton = document.getElementById('fetchNote');
        if (fetchButton) {
            fetchButton.addEventListener('click', () => this.fetchNote());
        }
    }

    // 保存最后的状态
    saveLastState() {
        const urlInput = document.getElementById('noteUrl');
        const noteDetail = document.getElementById('noteDetail');

        const state = {
            url: urlInput?.value || '',
            note: this.lastNote,
            timestamp: new Date().toISOString()
        };

        localStorage.setItem('lastState', JSON.stringify(state));
    }

    // 恢复上次的状态
    restoreLastState() {
        try {
            const savedState = localStorage.getItem('lastState');
            if (savedState) {
                const state = JSON.parse(savedState);

                // 恢复URL输入
                const urlInput = document.getElementById('noteUrl');
                if (urlInput && state.url) {
                    urlInput.value = state.url;
                }

                // 恢复笔记内容
                if (state.note) {
                    this.lastNote = state.note;
                    this.displayNote(state.note);
                }
            }
        } catch (error) {
            console.error('恢复状态失败:', error);
        }
    }

    async fetchNote() {
        const urlInput = document.getElementById('noteUrl');
        if (!urlInput) {
            showStatus('找不到URL输入框');
            return;
        }

        const url = urlInput.value.trim();
        if (!url) {
            showStatus('请输入笔记链接');
            return;
        }

        try {
            showStatus('正在获取笔记...');
            const detail = await this.crawler.fetchNoteDetail(url);
            this.lastNote = detail; // 保存获取的笔记
            this.displayNote(detail);
            this.saveLastState(); // 保存状态
            showStatus('获取成功');
        } catch (error) {
            showStatus('获取失败: ' + error.message);
        }
    }

    displayNote(note) {
        const container = document.getElementById('noteDetail');
        if (!container) return;

        container.innerHTML = `
            <div class="note-preview">
                <h1 class="note-title">${note.title}</h1>
                
                <div class="note-content">
                    ${note.content.split('\n').map(line => `<p>${line}</p>`).join('')}
                </div>
                
                <div class="note-images">
                    ${note.images.map((img, index) => `
                        <div class="image-container" onclick="showImageModal('${img.url}')">
                            <img src="${img.url}" 
                                 alt="笔记图片 ${index + 1}" 
                                 loading="lazy"
                                 onerror="this.onerror=null; this.src='/assets/placeholder.jpg';">
                        </div>
                    `).join('')}
                </div>
                
                <div class="publish-options">
                    <label class="option-item">
                        <input type="checkbox" id="ignoreTopics" checked>
                        忽略话题标签
                    </label>
                </div>
                
                <button id="publishButton" class="publish-btn">发布到公众号</button>
            </div>
        `;

        const publishBtn = document.getElementById('publishButton');
        if (publishBtn) {
            publishBtn.addEventListener('click', () => this.publishNote(note));
        }
    }

    async publishNote(note) {
        if (!this.publisher) {
            showStatus('请先配置公众号信息');
            return;
        }

        try {
            showStatus('正在发布...');
            const baseUrl = window.location.origin;

            // 只在发布时构建完整 URL
            const processedNote = {
                ...note,
                images: note.images.map(img => ({
                    ...img,
                    url: img.url.startsWith('http') ? img.url : `${baseUrl}${img.url}`
                }))
            };

            await this.publisher.createDraft(processedNote);
            showStatus('发布成功');
            this.saveLastState();
        } catch (error) {
            showStatus('发布失败: ' + error.message);
            console.error('发布失败:', error);
        }
    }
}

// 创建全局应用实例
try {
    window.app = new App();
} catch (error) {
    console.error('创建应用实例失败:', error);
    showStatus('创建应用实例失败: ' + error.message);
}

// 获取小红书笔记数据
async function getXiaohongshuNoteData() {
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

            // 获取纯文本内容，保留换行
            content = clonedElement.textContent
                .replace(/\[小红书表情\]/g, '')
                .replace(/\[[^\]]+\]/g, '')
                // 保留原有换行，但移除多余空格
                .split('\n')
                .map(line => line.trim())
                .filter(line => line)  // 移除空行
                .join('\n');
        }

        // 获取图片
        const imgElements = document.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) .note-slider-img');
        console.log('找到图片元素:', imgElements.length);

        let images = [];
        if (imgElements.length === 0) {
            // 尝试其他可能的选择器
            const otherSelectors = [
                '.note-content img[src*="xhscdn.com"]',
                '.main-image img',
                'img[src*="xhscdn.com"]:not(.avatar-item):not(.note-content-emoji)'
            ];

            for (const selector of otherSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    images = Array.from(elements)
                        .map(img => {
                            const url = (img.getAttribute('data-src') || img.src).split('?')[0];
                            // 确保使用 HTTPS
                            return {
                                url: url.replace('http://', 'https://')
                            };
                        })
                        .filter(img => img.url && !img.url.includes('avatar') && !img.url.includes('emoji'));
                    break;
                }
            }
        } else {
            images = Array.from(imgElements)
                .map(img => ({
                    url: (img.getAttribute('data-src') || img.src).split('?')[0].replace('http://', 'https://')
                }))
                .filter(img => img.url);
        }

        // 清理文件名中的特殊字符
        const cleanTitle = sanitizeFilename(title);

        return {
            title: cleanTitle,
            content,
            images,
            url: window.location.href,
            timestamp: new Date().toISOString()
        };
    } catch (error) {
        console.error('获取笔记数据失败:', error);
        return null;
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

// 在网页端使用示例
async function handleNoteData() {
    const noteData = await getXiaohongshuNoteData();
    if (noteData) {
        // 发送到服务器
        try {
            const response = await fetch('/api/notes', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(noteData)
            });

            if (!response.ok) {
                throw new Error('保存笔记失败');
            }

            console.log('笔记保存成功:', noteData.title);
        } catch (error) {
            console.error('保存笔记失败:', error);
        }
    }
}

// 显示大图
function showImageModal(url) {
    const modal = document.getElementById('imageModal');
    const modalImage = document.getElementById('modalImage');
    if (modal && modalImage) {
        modalImage.src = url;
        modal.classList.add('active');
        // 阻止事件冒泡
        event?.stopPropagation();
    }
}

// 隐藏大图
function hideImageModal() {
    const modal = document.getElementById('imageModal');
    if (modal) {
        modal.classList.remove('active');
    }
}

// 阻止图片点击事件冒泡到模态框
document.addEventListener('DOMContentLoaded', () => {
    const modalImage = document.getElementById('modalImage');
    if (modalImage) {
        modalImage.addEventListener('click', (e) => {
            e.stopPropagation();
        });
    }
});

// 根据环境设置 API 地址
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8080'
    : `https://${window.location.hostname}`;  // 使用当前域名 

// 在显示笔记详情的函数中
function displayNoteDetail(detail) {
    const noteDetailDiv = document.getElementById('noteDetail');
    noteDetailDiv.innerHTML = `
        <div class="note-container">
            <h2>${detail.title}</h2>
            <div class="content">${detail.content.split('\n').map(line => `<p>${line}</p>`).join('')}</div>
            <div class="images-grid">
                ${detail.images.map((image, index) => `
                    <div class="image-container">
                        <img src="${image.url}" alt="笔记图片 ${index + 1}" 
                             onerror="this.onerror=null; this.src='/assets/placeholder.jpg';"
                             loading="lazy">
                    </div>
                `).join('')}
            </div>
        </div>
    `;
} 