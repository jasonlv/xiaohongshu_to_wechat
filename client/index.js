class XiaohongshuCrawler {
    constructor() {
        this.baseUrl = 'http://localhost:8080';
    }

    validateAndFormatUrl(url) {
        try {
            const urlObj = new URL(url);
            if (!urlObj.hostname.includes('xiaohongshu.com')) {
                throw new Error('请输入有效的小红书链接');
            }
            const userId = urlObj.pathname.split('/').pop().split('?')[0];
            if (!userId) {
                throw new Error('无法从URL中提取用户ID');
            }
            return userId;
        } catch (error) {
            throw new Error('请输入有效的小红书链接');
        }
    }

    async fetchNotes(url) {
        try {
            const userId = this.validateAndFormatUrl(url);
            console.log('正在获取用户ID:', userId, '的笔记');

            const response = await fetch(
                `${this.baseUrl}/api/fetch?userId=${encodeURIComponent(userId)}&limit=10&url=${encodeURIComponent(url)}`
            );
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || '获取笔记失败，请稍后重试');
            }

            const notes = await response.json();
            
            if (!Array.isArray(notes)) {
                throw new Error('服务器返回的数据格式不正确');
            }

            return notes.slice(0, 10).map(note => ({
                ...note,
                summary: note.summary || note.title || '暂无描述',
                cover: note.cover || '/images/default-cover.jpg',
                createTime: note.createTime || new Date().toISOString()
            }));

        } catch (error) {
            console.error('获取小红书笔记失败:', error);
            if (error.message.includes('Failed to fetch')) {
                throw new Error('无法连接到服务器，请确保服务器已启动');
            }
            throw error;
        }
    }

    async fetchNoteDetail(noteId, noteUrl) {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/note/${noteId}?url=${encodeURIComponent(noteUrl)}`
            );
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || '获取笔记详情失败');
            }

            const detail = await response.json();
            return {
                content: detail.content || '',
                images: Array.isArray(detail.images) ? detail.images : [],
                title: detail.title || '',
                text: detail.text || ''
            };
        } catch (error) {
            console.error('获取笔记详情失败:', error);
            throw new Error('获取笔记详情失败: ' + error.message);
        }
    }
}

class NotesManager {
    constructor() {
        this.config = new Config();
        this.crawler = new XiaohongshuCrawler();
        this.publisher = null;
        this.notes = [];
        this.bindEvents();
        this.initializeServices();
        this.loadSavedNotes();
    }

    initializeServices() {
        if (this.config.wxAppId && this.config.wxAppSecret) {
            this.publisher = new WechatPublisher(this.config.wxAppId, this.config.wxAppSecret);
        }
    }

    bindEvents() {
        document.getElementById('refreshNotes').addEventListener('click', () => this.refreshNotes());
    }

    loadSavedNotes() {
        const savedNotes = localStorage.getItem('savedNotes');
        if (savedNotes) {
            try {
                this.notes = JSON.parse(savedNotes);
                this.displayNotes(this.notes);
                this.updateLastRefreshTime();
            } catch (error) {
                console.error('加载保存的笔记失败:', error);
            }
        }
    }

    saveNotes() {
        try {
            localStorage.setItem('savedNotes', JSON.stringify(this.notes));
        } catch (error) {
            console.error('保存笔记失败:', error);
        }
    }

    async refreshNotes() {
        const xhsUrl = document.getElementById('xhsUrl').value.trim();
        if (!xhsUrl) {
            showStatus('请先输入小红书链接');
            return;
        }

        try {
            showStatus('正在获取笔记列表...');
            console.log('开始获取笔记，URL:', xhsUrl);
            
            const notes = await this.crawler.fetchNotes(xhsUrl);
            
            if (notes.length === 0) {
                showStatus('未找到任何笔记');
                return;
            }

            this.notes = notes;
            this.saveNotes();
            this.displayNotes(this.notes);
            this.updateLastRefreshTime();
            showStatus(`成功获取${notes.length}条笔记`);
        } catch (error) {
            console.error('获取笔记失败:', error);
            let errorMessage = error.message;
            if (errorMessage.includes('Failed to fetch')) {
                errorMessage = '无法连接到服务器，请确保服务器已启动';
            }
            showStatus(errorMessage || '获取笔记失败，请稍后重试');
        }
    }

    displayNotes(notes) {
        const container = document.getElementById('notesList');
        container.innerHTML = '';

        if (!notes || notes.length === 0) {
            container.innerHTML = '<div class="no-notes">暂无笔记</div>';
            return;
        }

        notes.forEach(note => {
            const noteElement = this.createNoteElement(note);
            container.appendChild(noteElement);
        });
    }

    createNoteElement(note) {
        const div = document.createElement('div');
        div.className = 'note-item';
        div.innerHTML = `
            <div class="note-cover">
                <img src="${note.cover}" alt="封面">
            </div>
            <div class="note-content">
                <h3>${note.title}</h3>
                <p>${note.summary}</p>
                <div class="note-meta">
                    <span>发布时间: ${new Date(note.createTime).toLocaleString()}</span>
                </div>
            </div>
            <button class="publish-btn" data-note-id="${note.id}">发布到公众号</button>
        `;

        div.querySelector('.publish-btn').addEventListener('click', () => this.publishNote(note));
        return div;
    }

    async publishNote(note) {
        if (!this.publisher) {
            showStatus('请先配置微信公众号信息');
            return;
        }

        try {
            showStatus(`正在获取笔记《${note.title}》的详细内容...`);
            const detail = await this.crawler.fetchNoteDetail(note.id, note.link);
            
            showStatus(`正在发布笔记《${note.title}》...`);
            await this.publisher.createDraft({
                title: note.title,
                author: '小红书同步',
                summary: note.summary,
                content: detail.content,
                images: detail.images
            });
            
            showStatus('发布成功，请在公众号后台查看草稿');
        } catch (error) {
            showStatus('发布失败: ' + error.message);
        }
    }

    updateLastRefreshTime() {
        const timeElement = document.getElementById('lastUpdate');
        timeElement.textContent = `上次更新: ${new Date().toLocaleString()}`;
    }
}

function showStatus(message) {
    const statusBar = document.getElementById('statusBar');
    if (statusBar) {
        statusBar.textContent = message;
        statusBar.classList.add('show');
        
        setTimeout(() => {
            statusBar.classList.remove('show');
        }, 3000);
    }
}

class Config {
    constructor() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    init() {
        this.xhsUrl = '';
        this.wxAppId = '';
        this.wxAppSecret = '';
        this.loadConfig();
        this.bindEvents();
    }

    loadConfig() {
        const config = localStorage.getItem('syncConfig');
        if (config) {
            const { xhsUrl, wxAppId, wxAppSecret } = JSON.parse(config);
            this.xhsUrl = xhsUrl;
            this.wxAppId = wxAppId;
            this.wxAppSecret = wxAppSecret;
            
            const xhsUrlInput = document.getElementById('xhsUrl');
            const wxAppIdInput = document.getElementById('wxAppId');
            const wxAppSecretInput = document.getElementById('wxAppSecret');
            
            if (xhsUrlInput) xhsUrlInput.value = xhsUrl;
            if (wxAppIdInput) wxAppIdInput.value = wxAppId;
            if (wxAppSecretInput) wxAppSecretInput.value = wxAppSecret;
        }
    }

    saveConfig() {
        try {
            const xhsUrlElement = document.getElementById('xhsUrl');
            const wxAppIdElement = document.getElementById('wxAppId');
            const wxAppSecretElement = document.getElementById('wxAppSecret');

            if (!xhsUrlElement || !wxAppIdElement || !wxAppSecretElement) {
                console.error('无法找到输入框元素');
                showStatus('保存失败：无法找到输入框元素');
                return;
            }

            const xhsUrl = xhsUrlElement.value;
            const wxAppId = wxAppIdElement.value;
            const wxAppSecret = wxAppSecretElement.value;

            const config = {
                xhsUrl,
                wxAppId,
                wxAppSecret
            };
            
            localStorage.setItem('syncConfig', JSON.stringify(config));
            this.loadConfig();
            showStatus('配置已保存');
        } catch (error) {
            console.error('保存配置时出错:', error);
            showStatus('保存配置失败：' + error.message);
        }
    }

    bindEvents() {
        try {
            const saveButton = document.getElementById('saveConfig');
            if (!saveButton) {
                console.error('无法找到保存配置按钮');
                return;
            }
            
            saveButton.addEventListener('click', () => {
                console.log('保存按钮被点击');
                this.saveConfig();
            });
        } catch (error) {
            console.error('绑定事件时出错:', error);
        }
    }
}

// 添加 WechatPublisher 类
class WechatPublisher {
    constructor(appId, appSecret) {
        this.appId = appId;
        this.appSecret = appSecret;
        this.accessToken = null;
        this.tokenExpireTime = 0;
    }

    async getAccessToken() {
        const now = Date.now();
        if (this.accessToken && now < this.tokenExpireTime) {
            return this.accessToken;
        }

        try {
            const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`);
            const data = await response.json();
            
            if (data.access_token) {
                this.accessToken = data.access_token;
                this.tokenExpireTime = now + (data.expires_in * 1000);
                return this.accessToken;
            } else {
                throw new Error(data.errmsg || '获取access_token失败');
            }
        } catch (error) {
            console.error('获取access_token失败:', error);
            throw new Error('获取access_token失败: ' + error.message);
        }
    }

    async createDraft(article) {
        try {
            const accessToken = await this.getAccessToken();
            const response = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    articles: [{
                        title: article.title,
                        author: article.author,
                        digest: article.summary,
                        content: article.content,
                        thumb_media_id: article.images[0] // 需要先上传图片获取media_id
                    }]
                })
            });

            const result = await response.json();
            if (result.errcode) {
                throw new Error(result.errmsg || '创建草稿失败');
            }

            return result;
        } catch (error) {
            console.error('创建草稿失败:', error);
            throw new Error('创建草稿失败: ' + error.message);
        }
    }

    // 上传图片到微信服务器
    async uploadImage(imageUrl) {
        try {
            const accessToken = await this.getAccessToken();
            const imageResponse = await fetch(imageUrl);
            const imageBlob = await imageResponse.blob();

            const formData = new FormData();
            formData.append('media', imageBlob, 'image.jpg');

            const response = await fetch(`https://api.weixin.qq.com/cgi-bin/media/uploadimg?access_token=${accessToken}`, {
                method: 'POST',
                body: formData
            });

            const result = await response.json();
            if (result.errcode) {
                throw new Error(result.errmsg || '上传图片失败');
            }

            return result.url;
        } catch (error) {
            console.error('上传图片失败:', error);
            throw new Error('上传图片失败: ' + error.message);
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.configInstance = new Config();
        window.notesManager = new NotesManager();
    } catch (error) {
        console.error('初始化应用时出错:', error);
        showStatus('初始化应用失败：' + error.message);
    }
}); 