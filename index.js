class Config {
    constructor() {
        this.xhsUserId = '';
        this.wxAppId = '';
        this.wxAppSecret = '';
        this.loadConfig();
        this.bindEvents();
    }

    loadConfig() {
        const config = localStorage.getItem('syncConfig');
        if (config) {
            const { xhsUserId, wxAppId, wxAppSecret } = JSON.parse(config);
            this.xhsUserId = xhsUserId;
            this.wxAppId = wxAppId;
            this.wxAppSecret = wxAppSecret;
            
            // 填充表单
            document.getElementById('xhsUserId').value = xhsUserId;
            document.getElementById('wxAppId').value = wxAppId;
            document.getElementById('wxAppSecret').value = wxAppSecret;
        }
    }

    saveConfig() {
        const config = {
            xhsUserId: document.getElementById('xhsUserId').value,
            wxAppId: document.getElementById('wxAppId').value,
            wxAppSecret: document.getElementById('wxAppSecret').value
        };
        localStorage.setItem('syncConfig', JSON.stringify(config));
        this.loadConfig();
        showStatus('配置已保存');
    }

    bindEvents() {
        document.getElementById('saveConfig').addEventListener('click', () => this.saveConfig());
    }
}

class XiaohongshuCrawler {
    constructor(userId) {
        this.userId = userId;
    }

    async fetchNotes() {
        try {
            // 这里需要实现小红书API调用或网页爬取
            // 由于小红书没有开放API，这里需要使用爬虫或其他方式
            // 返回笔记列表数据
            const response = await fetch(`https://your-backend-api/xhs/notes?userId=${this.userId}`);
            return await response.json();
        } catch (error) {
            console.error('获取小红书笔记失败:', error);
            throw error;
        }
    }
}

class WechatPublisher {
    constructor(appId, appSecret) {
        this.appId = appId;
        this.appSecret = appSecret;
    }

    async getAccessToken() {
        try {
            const response = await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`);
            const data = await response.json();
            if (data.access_token) {
                return data.access_token;
            }
            throw new Error('获取access_token失败');
        } catch (error) {
            console.error('获取access_token失败:', error);
            throw error;
        }
    }

    async createDraft(article) {
        try {
            const accessToken = await this.getAccessToken();
            
            // 上传图片
            const mediaIds = await Promise.all(
                article.images.map(img => this.uploadImage(accessToken, img))
            );

            // 创建草稿
            const response = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`, {
                method: 'POST',
                body: JSON.stringify({
                    articles: [{
                        title: article.title,
                        thumb_media_id: mediaIds[0], // 使用第一张图作为封面
                        author: article.author || '小红书同步',
                        digest: article.summary,
                        content: this.formatContent(article.content, mediaIds),
                        content_source_url: '',
                        need_open_comment: 0
                    }]
                })
            });

            const result = await response.json();
            if (result.errcode === 0) {
                return result.media_id;
            }
            throw new Error(result.errmsg);
        } catch (error) {
            console.error('创建草稿失败:', error);
            throw error;
        }
    }

    async uploadImage(accessToken, imageUrl) {
        // 实现图片上传逻辑
        // 返回media_id
    }

    formatContent(content, mediaIds) {
        // 将文本内容和图片组合成HTML
        // 使用mediaIds引用已上传的图片
    }
}

class NotesManager {
    constructor() {
        this.config = new Config();
        this.crawler = null;
        this.publisher = null;
        this.bindEvents();
        this.initializeServices();
    }

    initializeServices() {
        if (this.config.xhsUserId) {
            this.crawler = new XiaohongshuCrawler(this.config.xhsUserId);
        }
        if (this.config.wxAppId && this.config.wxAppSecret) {
            this.publisher = new WechatPublisher(this.config.wxAppId, this.config.wxAppSecret);
        }
    }

    bindEvents() {
        document.getElementById('refreshNotes').addEventListener('click', () => this.refreshNotes());
    }

    async refreshNotes() {
        if (!this.crawler) {
            showStatus('请先配置小红书用户ID');
            return;
        }

        try {
            showStatus('正在获取笔记列表...');
            const notes = await this.crawler.fetchNotes();
            this.displayNotes(notes);
            this.updateLastRefreshTime();
        } catch (error) {
            showStatus('获取笔记失败: ' + error.message);
        }
    }

    displayNotes(notes) {
        const container = document.getElementById('notesList');
        container.innerHTML = '';

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
            showStatus(`正在发布笔记《${note.title}》...`);
            await this.publisher.createDraft(note);
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
    statusBar.textContent = message;
    setTimeout(() => {
        statusBar.textContent = '';
    }, 3000);
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new NotesManager();
}); 