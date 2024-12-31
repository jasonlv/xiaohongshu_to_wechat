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
    constructor(appId, appSecret) {
        this.appId = appId;
        this.appSecret = appSecret;
    }

    async createDraft(article) {
        // 这里添加实际的微信API调用代码
        console.log('创建草稿:', article);
        return { success: true };
    }
}

// 主应用类
class App {
    constructor() {
        this.crawler = new XiaohongshuCrawler();
        this.publisher = null;
        this.init();
    }

    init() {
        // 添加错误处理
        try {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => {
                    this.initializeAfterDOMLoaded();
                });
            } else {
                this.initializeAfterDOMLoaded();
            }
        } catch (error) {
            console.error('初始化失败:', error);
            showStatus('初始化失败: ' + error.message);
        }
    }

    initializeAfterDOMLoaded() {
        try {
            this.bindEvents();
            this.loadConfig();
        } catch (error) {
            console.error('初始化组件失败:', error);
            showStatus('初始化组件失败: ' + error.message);
        }
    }

    bindEvents() {
        // 保存配置按钮
        const saveConfigBtn = document.getElementById('saveConfig');
        if (saveConfigBtn) {
            saveConfigBtn.addEventListener('click', () => this.saveConfig());
        }

        // 获取笔记按钮
        const fetchNoteBtn = document.getElementById('fetchNote');
        if (fetchNoteBtn) {
            fetchNoteBtn.addEventListener('click', () => this.fetchNote());
        }
    }

    loadConfig() {
        const appId = localStorage.getItem('wxAppId');
        const appSecret = localStorage.getItem('wxAppSecret');

        const appIdInput = document.getElementById('wxAppId');
        const appSecretInput = document.getElementById('wxAppSecret');

        if (appIdInput && appId) appIdInput.value = appId;
        if (appSecretInput && appSecret) appSecretInput.value = appSecret;

        if (appId && appSecret) {
            this.publisher = new WechatPublisher(appId, appSecret);
        }
    }

    saveConfig() {
        const appIdInput = document.getElementById('wxAppId');
        const appSecretInput = document.getElementById('wxAppSecret');

        if (!appIdInput || !appSecretInput) {
            showStatus('找不到配置输入框');
            return;
        }

        const appId = appIdInput.value.trim();
        const appSecret = appSecretInput.value.trim();

        localStorage.setItem('wxAppId', appId);
        localStorage.setItem('wxAppSecret', appSecret);

        this.publisher = new WechatPublisher(appId, appSecret);
        showStatus('配置已保存');
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
            this.displayNote(detail);
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
                
                <!-- 封面图 -->
                ${note.coverImage ? `
                    <div class="cover-image">
                        <img src="${note.coverImage}" alt="封面图片" 
                             onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect width=%22200%22 height=%22200%22 fill=%22%23f0f0f0%22/><text x=%22100%22 y=%22100%22 text-anchor=%22middle%22 fill=%22%23999%22>图片加载失败</text></svg>';"
                             loading="lazy">
                    </div>
                ` : ''}
                
                <!-- 正文内容 -->
                <div class="note-content">
                    ${note.content}
                </div>
                
                <!-- 其他图片 -->
                ${note.images.length > 1 ? `
                    <div class="note-images">
                        ${note.images.slice(1).map(img => `
                            <div class="image-container">
                                <img src="${img}" alt="笔记图片" 
                                     onerror="this.onerror=null; this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 200 200%22><rect width=%22200%22 height=%22200%22 fill=%22%23f0f0f0%22/><text x=%22100%22 y=%22100%22 text-anchor=%22middle%22 fill=%22%23999%22>图片加载失败</text></svg>';"
                                     loading="lazy">
                            </div>
                        `).join('')}
                    </div>
                ` : ''}
                
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
            await this.publisher.createDraft(note);
            showStatus('发布成功');
        } catch (error) {
            showStatus('发布失败: ' + error.message);
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