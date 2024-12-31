const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');

const app = express();

// 添加更详细的 CORS 配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json());

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// 添加静态文件服务
app.use('/images', express.static(path.join(__dirname, 'public/images')));

class XiaohongshuCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
    }

    async initialize() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: 'new',
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage'
                ]
            });
        }
        if (!this.page) {
            this.page = await this.browser.newPage();
            this.page.on('console', msg => console.log('页面日志:', msg.text()));
            this.page.on('pageerror', err => console.error('页面错误:', err));
            await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
            await this.page.setViewport({ width: 1920, height: 1080 });
        }
    }

    async fetchFromUrl(url, limit = 10) {
        try {
            await this.initialize();
            console.log('正在访问URL:', url);
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });
            
            // 等待笔记列表加载，使用更通用的选择器
            await this.page.waitForSelector('.note-card', { timeout: 10000 });
            
            // 获取笔记列表
            const notes = await this.page.evaluate((limit) => {
                const items = document.querySelectorAll('.note-card');
                return Array.from(items).slice(0, limit).map(item => ({
                    id: item.getAttribute('data-id') || '',
                    title: item.querySelector('.note-title')?.textContent?.trim() || '',
                    summary: item.querySelector('.note-desc')?.textContent?.trim() || '',
                    cover: item.querySelector('.note-cover img')?.src || '',
                    createTime: item.querySelector('.note-time')?.getAttribute('data-time') || new Date().toISOString(),
                    link: item.querySelector('.note-link')?.href || item.querySelector('a')?.href || ''
                }));
            }, limit);

            console.log('找到的笔记:', notes);
            return notes;
        } catch (error) {
            console.error('抓取笔记失败:', error);
            throw new Error('抓取笔记失败: ' + error.message);
        }
    }

    async fetchNoteDetail(url) {
        try {
            await this.initialize();
            console.log('正在访问笔记详情页:', url);
            
            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            // 调试页面内容
            const pageContent = await this.page.content();
            console.log('页面内容:', pageContent);
            
            // 等待内容加载，使用更通用的选择器
            await this.page.waitForSelector('.note-content', { timeout: 10000 });
            
            // 获取笔记详情
            const detail = await this.page.evaluate(() => {
                const contentElement = document.querySelector('.note-content');
                const titleElement = document.querySelector('.note-title');
                const imagesElements = document.querySelectorAll('.note-image img, .note-img img');
                
                const images = Array.from(imagesElements, img => img.src);
                const title = titleElement?.textContent?.trim() || '';
                const content = contentElement?.innerHTML || '';
                const text = contentElement?.textContent?.trim() || '';

                console.log('找到的元素:', {
                    hasContent: !!contentElement,
                    hasTitle: !!titleElement,
                    imagesCount: images.length
                });

                return {
                    title,
                    content,
                    images,
                    text
                };
            });

            console.log('获取到的笔记详情:', detail);
            return detail;
        } catch (error) {
            console.error('获取笔记详情失败:', error);
            throw new Error('获取笔记详情失败: ' + error.message);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.page = null;
        }
    }
}

const crawler = new XiaohongshuCrawler();

// 添加测试路由
app.get('/test', (req, res) => {
    res.json({ message: '服务器正常运行' });
});

// API路由
app.get('/api/fetch', async (req, res) => {
    const { url, userId, limit = 10 } = req.query;
    
    console.log('收到请求参数:', { url, userId, limit });
    
    if (!url || !userId) {
        console.log('缺少参数');
        return res.status(400).json({ message: '缺少必要参数' });
    }

    try {
        console.log('开始抓取笔记:', { url, userId, limit });
        const notes = await crawler.fetchFromUrl(url, parseInt(limit));
        console.log('成功获取笔记:', notes.length);
        res.json(notes);
    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({ 
            message: '获取笔记失败: ' + error.message,
            error: error.stack 
        });
    }
});

// 添加笔记详情API路由
app.get('/api/note/:noteId', async (req, res) => {
    const { noteId } = req.params;
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ message: '缺少笔记URL参数' });
    }

    try {
        console.log('开始获取笔记详情:', { noteId, url });
        const detail = await crawler.fetchNoteDetail(url);
        console.log('成功获取笔记详情');
        res.json(detail);
    } catch (error) {
        console.error('获取笔记详情失败:', error);
        res.status(500).json({ 
            message: '获取笔记详情失败: ' + error.message,
            error: error.stack 
        });
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({ 
        message: '服务器内部错误',
        error: err.message 
    });
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
    console.log('当前时间:', new Date().toISOString());
    console.log('Node.js 版本:', process.version);
    console.log('操作系统:', process.platform);
});

// 确保在程序退出时关闭浏览器
process.on('SIGINT', async () => {
    await crawler.close();
    process.exit();
}); 