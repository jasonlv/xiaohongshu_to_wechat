// 文件系统处理
class FileSystemManager {
    constructor() {
        this.dirHandle = null;
        this.imageIndex = new Map();
        this.checkBrowserSupport();
        this.loadSavedDirectory();
    }

    checkBrowserSupport() {
        if (!window.showDirectoryPicker) {
            alert(`
                您的浏览器不支持所需功能。
                请使用以下浏览器：
                
                Windows 用户：
                - Chrome 最新版
                - Edge 最新版
                
                Mac 用户：
                - Safari 16.4 以上版本
                - 或 Chrome 最新版
                
                提示：直接双击打开 index.html 即可使用！
            `);
        }
    }

    // 保存目录句柄
    async saveDirectoryHandle(handle) {
        try {
            // 验证权限是否仍然有效
            const permission = await handle.requestPermission({ mode: 'read' });
            if (permission === 'granted') {
                localStorage.setItem('lastDirectoryHandle', JSON.stringify({
                    name: handle.name,
                    id: await handle.id
                }));
            }
        } catch (err) {
            console.error('保存目录句柄失败:', err);
        }
    }

    // 加载上次的目录
    async loadSavedDirectory() {
        try {
            const savedHandle = localStorage.getItem('lastDirectoryHandle');
            if (savedHandle) {
                const { name } = JSON.parse(savedHandle);
                // 直接使用上次的目录，不再询问
                await this.selectDirectory();
            }
        } catch (err) {
            console.error('加载上次目录失败:', err);
        }
    }

    async selectDirectory() {
        try {
            this.dirHandle = await window.showDirectoryPicker();
            await this.scanImages(this.dirHandle);
            await this.saveDirectoryHandle(this.dirHandle);
            return true;
        } catch (err) {
            console.error('选择目录失败:', err);
            return false;
        }
    }

    async scanImages(dirHandle) {
        this.imageIndex.clear();
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.match(/\.(png|jpg|jpeg)$/i)) {
                // 提取文件名中的汉字部分
                const char = entry.name.replace(/[0-9_\s]+\.(png|jpg|jpeg)$/i, '')
                                    .replace(/\.(png|jpg|jpeg)$/i, '');
                if (char) {  // 确保提取到了汉字
                    if (!this.imageIndex.has(char)) {
                        this.imageIndex.set(char, []);
                    }
                    this.imageIndex.get(char).push(entry);
                }
            }
        }
    }

    async getImageFile(fileHandle) {
        const file = await fileHandle.getFile();
        return URL.createObjectURL(file);
    }

    async getFullPath(dirHandle) {
        let path = dirHandle.name;
        try {
            let parent = await dirHandle.queryPermission({ mode: 'read' });
            if (parent === 'granted') {
                let current = dirHandle;
                while (current) {
                    try {
                        current = await current.getParent();
                        if (current) {
                            path = current.name + '/' + path;
                        }
                    } catch {
                        break;
                    }
                }
            }
        } catch {}
        return path;
    }
}

// 字符处理
class CharacterProcessor {
    constructor(fileManager) {
        this.fileManager = fileManager;
    }

    hasCharacter(char) {
        return this.fileManager.imageIndex.has(char);
    }

    async getCharacterImages(char) {
        const fileHandles = this.fileManager.imageIndex.get(char) || [];
        const urls = await Promise.all(
            fileHandles.map(handle => this.fileManager.getImageFile(handle))
        );
        return urls;
    }
}

// UI 控制
class UIController {
    constructor() {
        this.fileManager = new FileSystemManager();
        this.processor = new CharacterProcessor(this.fileManager);
        this.initElements();
        this.bindEvents();
        this.folderPath = document.getElementById('folderPath');
        this.setupTextInput();
    }

    initElements() {
        this.selectButton = document.getElementById('selectFolder');
        this.inputText = document.getElementById('inputText');
        this.preview = document.getElementById('preview');
        this.exportBtn = document.getElementById('exportBtn');
    }

    bindEvents() {
        this.selectButton.addEventListener('click', () => this.handleSelectFolder());
        this.exportBtn.addEventListener('click', () => this.handleExport());
    }

    setupTextInput() {
        // 使用 compositionend 事件处理中文输入
        this.inputText.addEventListener('compositionend', () => this.handleTextInput());
        this.inputText.addEventListener('input', (e) => {
            // 如果不是中文输入过程中，则更新预览
            if (!e.isComposing) {
                this.handleTextInput();
            }
        });
    }

    async handleSelectFolder() {
        try {
            const success = await this.fileManager.selectDirectory();
            if (success) {
                this.selectButton.textContent = '更改';
                const fullPath = await this.fileManager.getFullPath(this.fileManager.dirHandle);
                this.folderPath.textContent = fullPath;
                this.folderPath.title = fullPath; // 添加悬停提示
                this.exportBtn.disabled = false;
                this.handleTextInput();
            }
        } catch (err) {
            if (err.name === 'NotAllowedError') {
                alert('请允许访问文件夹权限以继续使用。');
            } else {
                alert('选择文件夹时出错。如果使用 Safari，请确保版本在 16.4 以上。');
            }
        }
    }

    async handleTextInput() {
        const text = this.inputText.value;
        this.preview.innerHTML = '';

        // 仅处理中文字符，忽略其他字符
        const chineseChars = text.match(/[\u4e00-\u9fa5\u3400-\u4dbf]/g) || [];
        
        // 去重，避免重复显示
        const uniqueChars = [...new Set(chineseChars)];
        
        for (const char of uniqueChars) {
            const div = document.createElement('div');
            div.className = 'character-item';

            if (this.processor.hasCharacter(char)) {
                const urls = await this.processor.getCharacterImages(char);
                const img = document.createElement('img');
                img.src = urls[0];
                div.appendChild(img);

                if (urls.length > 1) {
                    const badge = document.createElement('span');
                    badge.className = 'version-badge';
                    badge.textContent = `${urls.length}张`;
                    div.appendChild(badge);
                }
            } else {
                div.classList.add('placeholder');
                div.textContent = char;
            }

            this.preview.appendChild(div);
        }
    }

    async handleExport() {
        try {
            // 获取当前预览中的所有字符
            const text = this.inputText.value;
            const chineseChars = text.match(/[\u4e00-\u9fa5\u3400-\u4dbf]/g) || [];
            
            if (chineseChars.length === 0) {
                alert('没有可导出的汉字！');
                return;
            }

            // 让用户选择保存目录
            const dirHandle = await window.showDirectoryPicker();
            
            // 创建导出文件夹，添加时间戳
            const now = new Date();
            const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, -5); // 格式：2024-03-20T15-30
            const folderName = `汉字图片_${timestamp}`;
            const exportDirHandle = await dirHandle.getDirectoryHandle(folderName, { create: true });

            // 显示进度提示
            const progressDiv = document.createElement('div');
            progressDiv.style.position = 'fixed';
            progressDiv.style.top = '50%';
            progressDiv.style.left = '50%';
            progressDiv.style.transform = 'translate(-50%, -50%)';
            progressDiv.style.padding = '20px';
            progressDiv.style.background = 'white';
            progressDiv.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
            progressDiv.style.borderRadius = '8px';
            progressDiv.style.zIndex = '1000';
            document.body.appendChild(progressDiv);

            let exportedCount = 0;
            const totalChars = chineseChars.length;

            // 导出每个字的图片
            for (const char of chineseChars) {
                if (this.processor.hasCharacter(char)) {
                    progressDiv.textContent = `正在导出：${char} (${exportedCount}/${totalChars})`;
                    
                    const urls = await this.processor.getCharacterImages(char);
                    for (let i = 0; i < urls.length; i++) {
                        const url = urls[i];
                        // 获取图片数据
                        const response = await fetch(url);
                        const blob = await response.blob();
                        
                        // 获取原始文件名
                        const fileHandle = this.fileManager.imageIndex.get(char)[i];
                        const originalName = fileHandle.name;
                        
                        // 创建文件，保持原始文件名
                        const fileHandle2 = await exportDirHandle.getFileHandle(originalName, { create: true });
                        const writable = await fileHandle2.createWritable();
                        await writable.write(blob);
                        await writable.close();
                        
                        // 释放 URL
                        URL.revokeObjectURL(url);
                    }
                    exportedCount++;
                }
            }

            // 移除进度提示
            document.body.removeChild(progressDiv);
            
            alert(`导出完成！\n已保存到文件夹：${folderName}\n成功导出 ${exportedCount} 个汉字的图片。`);
        } catch (err) {
            alert('导出失败：' + err.message);
            console.error('导出错误：', err);
        }
    }
}

// 启动应用
document.addEventListener('DOMContentLoaded', () => {
    new UIController();
}); 