class XiaohongshuHome {
    constructor() {
        this.userId = '55731fd422cfcd7ff4e34c14'; // 配置的用户ID
        this.baseUrl = window.location.origin;
        this.page = 1;
        this.pageSize = 12;
        this.init();
    }

    async init() {
        try {
            // 获取用户信息
            await this.fetchUserInfo();
            // 获取笔记列表
            await this.fetchNotes();
            // 绑定事件
            this.bindEvents();
        } catch (error) {
            console.error('初始化失败:', error);
        }
    }

    async fetchUserInfo() {
        try {
            const response = await fetch(`${this.baseUrl}/api/user/info?userId=${this.userId}`);
            const data = await response.json();
            
            // 更新用户信息
            document.getElementById('userAvatar').src = data.avatar;
            document.getElementById('userNickname').textContent = data.nickname;
            document.getElementById('userId').textContent = `小红书号：${data.redId}`;
            document.getElementById('userDesc').textContent = data.description;
            
            // 更新统计数据
            document.getElementById('followingCount').textContent = data.following;
            document.getElementById('followerCount').textContent = data.followers;
            document.getElementById('likeCount').textContent = data.likes;
        } catch (error) {
            console.error('获取用户信息失败:', error);
        }
    }

    async fetchNotes() {
        try {
            const response = await fetch(
                `${this.baseUrl}/api/user/notes?userId=${this.userId}&page=${this.page}&pageSize=${this.pageSize}`
            );
            const data = await response.json();
            
            this.renderNotes(data.notes);
            
            // 更新加载更多按钮状态
            const loadMoreBtn = document.getElementById('loadMoreBtn');
            if (data.hasMore) {
                loadMoreBtn.style.display = 'block';
            } else {
                loadMoreBtn.style.display = 'none';
            }
        } catch (error) {
            console.error('获取笔记列表失败:', error);
        }
    }

    renderNotes(notes) {
        const container = document.getElementById('notesList');
        
        notes.forEach(note => {
            const noteElement = document.createElement('div');
            noteElement.className = 'note-card';
            noteElement.innerHTML = `
                <div class="note-cover">
                    <img src="${note.cover}" alt="${note.title}">
                </div>
                <div class="note-content">
                    <h3>${note.title}</h3>
                    <div class="note-meta">
                        <span class="note-date">${new Date(note.createTime).toLocaleDateString()}</span>
                        <span class="note-likes">${note.likes} 赞</span>
                    </div>
                </div>
            `;
            
            // 添加点击事件
            noteElement.addEventListener('click', () => {
                window.location.href = `/index.html?noteUrl=${encodeURIComponent(note.link)}`;
            });
            
            container.appendChild(noteElement);
        });
    }

    bindEvents() {
        const loadMoreBtn = document.getElementById('loadMoreBtn');
        loadMoreBtn.addEventListener('click', async () => {
            this.page += 1;
            await this.fetchNotes();
        });
    }
}

// 创建实例
window.home = new XiaohongshuHome(); 