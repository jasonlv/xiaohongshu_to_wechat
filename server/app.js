require('dotenv').config();

const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');
const timeout = require('connect-timeout');
const axios = require('axios');
const sharp = require('sharp');
const { Readable } = require('stream');
const FormData = require('form-data');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

const IMAGES_DIR = process.env.NODE_ENV === 'production'
    ? '/data/images'  // Render 的持久化目录
    : path.join(__dirname, '../public/images');

// 在应用启动时确保所有必要的目录都存在
const ASSETS_DIR = path.join(__dirname, '../public/assets');
fs.mkdirSync(ASSETS_DIR, { recursive: true });
fs.mkdirSync(IMAGES_DIR, { recursive: true });

// 检查并生成占位图片
const PLACEHOLDER_PATH = path.join(ASSETS_DIR, 'placeholder.jpg');
if (!fs.existsSync(PLACEHOLDER_PATH)) {
    console.log('占位图片不存在，需要生成');
    require('../scripts/generatePlaceholder.js');
} else {
    console.log('占位图片已存在');
}

const app = express();

// 添加更详细的 CORS 配置
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(timeout('300s'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// 添加请求日志中间件
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
    next();
});

// 静态文件服务配置
app.use(express.static(path.join(__dirname, '../public')));
app.use('/client', express.static(path.join(__dirname, '../client')));

// 添加图片静态服务
app.use('/images', express.static(IMAGES_DIR));

// 添加错误恢复中间件
app.use((req, res, next) => {
    if (!req.timedout) next();
});

// 在文件开头添加 HOST 配置
const HOST = process.env.NODE_ENV === 'production'
    ? 'https://calligraphycharsselector.onrender.com'
    : 'http://localhost:8080';

// 配置 Cloudinary
cloudinary.config({ 
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dlzxaf7wa', 
    api_key: process.env.CLOUDINARY_API_KEY || '352345732876151', 
    api_secret: process.env.CLOUDINARY_API_SECRET  // 必须从环境变量获取
});

class XiaohongshuCrawler {
    constructor() {
        this.browser = null;
        this.page = null;
        this.token = null;  // 存储token
    }

    // 添加获取token的方法
    async getToken() {
        let loginBrowser = null;
        try {
            // 创建新的浏览器实例专门用于登录
            loginBrowser = await puppeteer.launch({
            headless: false,
            args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1920,1080'
                ]
            });
            const loginPage = await loginBrowser.newPage();
            
            // 设置用户代理和其他请求头
            await loginPage.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            
            // 访问小红书登录页面
            await loginPage.goto('https://www.xiaohongshu.com', {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            console.log('请在打开的浏览器窗口中登录小红书...');

            // 等待登录成功（等待特定元素出现）
            await loginPage.waitForSelector('.user-avatar, .avatar', {
                timeout: 300000 // 5分钟超时
            });

            // 获取所有 cookies
            const cookies = await loginPage.cookies();
            const tokenCookie = cookies.find(cookie => cookie.name === 'xsec_token');

            if (tokenCookie) {
                this.token = tokenCookie.value;
                console.log('成功获取token');
                
                // 将 cookies 应用到主浏览器实例
                if (this.page) {
                    await this.page.setCookie(...cookies);
                }
                
                return this.token;
            } else {
                throw new Error('未能获取token');
            }
        } catch (error) {
            console.error('获取token失败:', error);
            throw error;
        } finally {
            // 关闭登录专用的浏览器实例
            if (loginBrowser) {
                await loginBrowser.close();
            }
        }
    }

    // 修改初始化方法
    async initialize() {
        try {
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
                await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
                // 设置页面超时
                await this.page.setDefaultNavigationTimeout(60000);
                await this.page.setDefaultTimeout(60000);
                
                // 如果有token，设置cookie
                if (this.token) {
                    await this.page.setCookie({
                        name: 'xsec_token',
                        value: this.token,
                        domain: '.xiaohongshu.com',
                        path: '/'
                    });
                }
            }

            return true;
        } catch (error) {
            console.error('初始化失败:', error);
            throw error;
        }
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async fetchFromUrl(url, limit = 10) {
        try {
            await this.initialize();
            console.log('正在访问URL:', url);
            
            // 设置更长的超时时间
            await this.page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // 等待页面加载
            await this.delay(5000);

            // 等待笔记列表容器出现
            try {
                await this.page.waitForFunction(() => {
                    // 检查是否有任何笔记元素
                    const hasNotes = document.querySelectorAll('.note-item').length > 0 ||
                                    document.querySelectorAll('section[data-v-14f91c23]').length > 0;
                    
                    if (hasNotes) {
                        console.log('找到笔记元素');
                        return true;
                    }
                    
                    // 如果没有找到笔记，检查是否有错误信息
                    const hasError = document.querySelector('.error-message') !== null;
                    if (hasError) {
                        console.log('页面显示错误信息');
                        return true;
                    }
                    
                    return false;
                }, { timeout: 10000 });
            } catch (error) {
                console.warn('等待笔记列表超时:', error);
            }

            // 模拟滚动
            await this.page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
                // 触发滚动事件
                window.dispatchEvent(new Event('scroll'));
            });

            await this.delay(2000);

            // 获取页面内容进行调试
            const content = await this.page.content();
            console.log('页面内容片段:', content.slice(0, 500));

            // 使用更具体的选择器
            const selectors = [
                'section[data-v-14f91c23]',  // 新版小红书的笔记容器
                '.note-item',
                '.feed-item',
                '.explore-feed-card',
                '.notes-item',
                '[data-note-id]',
                '[data-id]'
            ];

            // 等待任一选择器出现
            for (const selector of selectors) {
                const element = await this.page.$(selector);
                if (element) {
                    console.log('找到匹配的选择器:', selector);
                    break;
                }
            }

            // 获取笔记列表
            const notes = await this.page.evaluate((selectors, limit) => {
                // 首先找到笔记列表容器
                let items = [];
                for (const selector of selectors) {
                    items = document.querySelectorAll(selector);
                    if (items.length > 0) {
                        console.log('使用选择器:', selector, '找到', items.length, '个笔记');
                        break;
                    }
                }

                return Array.from(items).slice(0, limit).map(item => {
                    try {
                        let link = '';
                        let noteId = '';

                        // 尝试从链接中获取ID和token
                        const allLinks = Array.from(item.querySelectorAll('a')).filter(a => a.href && a.href !== '');
                        for (const linkElement of allLinks) {
                            const href = linkElement.href;
                            // 排除用户主页链接
                            if (!href.includes('/user/profile/')) {
                                // 保存完整的原始URL，包含token
                                link = href;
                                // 从链接中提取ID
                                const urlMatches = href.match(/\/explore\/([^/?]+)/);
                                if (urlMatches && urlMatches[1]) {
                                    noteId = urlMatches[1];
                                    break;
                                }
                            }
                        }

                        // 如果没有找到有效链接，尝试从其他属性获取
                        if (!noteId) {
                            const dataIndex = item.getAttribute('data-index');
                            if (dataIndex) {
                                noteId = dataIndex;
                                // 从当前页面获取token参数
                                const currentUrl = window.location.href;
                                const urlObj = new URL(currentUrl);
                                const token = urlObj.searchParams.get('xsec_token');
                                
                                // 构建完整URL
                                link = `https://www.xiaohongshu.com/explore/${noteId}`;
                                if (token) {
                                    link += `?xsec_token=${token}&xsec_source=pc_feed`;
                                }
                            }
                        }

                        // 获取标题和其他信息
                        const titleElement = item.querySelector('.title span') || 
                                           item.querySelector('.title') || 
                                           item.querySelector('h1') || 
                                           item.querySelector('h3');
                        const title = titleElement?.textContent?.trim() || '';

                        // 获取封面图
                        const imgElement = item.querySelector('img[src*="xhscdn"]');
                        const cover = imgElement?.src || '';

                        // 调试信息
                        console.log('处理笔记元素:', {
                            title,
                            noteId,
                            link,
                            hasImage: !!cover
                        });

                        return {
                            id: noteId,
                            title: title || '无标题',
                            summary: title || '无描述',
                            cover,
                            createTime: new Date().toISOString(),
                            link
                        };
                    } catch (error) {
                        console.error('处理笔记元素时出错:', error);
                        return null;
                    }
                }).filter(note => note && note.id && note.link);
            }, selectors, limit);

            // 添加更多的调试信息
            console.log('处理前的笔记数量:', notes.length);

            // 检查结果
            if (notes.length === 0) {
                // 获取页面的完整HTML用于调试
                const pageHtml = await this.page.content();
                console.error('页面HTML片段:', pageHtml.slice(0, 1000));
                throw new Error('未找到有效的笔记');
            }

            // 记录找到的笔记信息
            console.log('成功获取笔记:', notes.map(n => ({
                id: n.id,
                title: n.title,
                link: n.link
            })));

            return notes;
        } catch (error) {
            console.error('抓取笔记失败:', error);
            throw new Error('抓取笔记失败: ' + error.message);
        }
    }

    async fetchNoteDetail(url) {
        try {
            if (!this.page) {
                await this.initialize();
            }

            await this.page.goto(url, {
                waitUntil: 'networkidle0',
                timeout: 30000
            });

            // 等待内容加载
            await this.page.waitForSelector('.note-content', { timeout: 10000 });

            // 模拟滚动和点击行为
            await this.page.evaluate(() => {
                window.scrollBy(0, 500);
                window.dispatchEvent(new Event('scroll'));
            });

            await this.delay(1000);

            // 获取笔记详情
            const detail = await this.page.evaluate(async () => {
                // 使用更精确的选择器获取标题和内容
                const titleSelectors = [
                    '.note-detail .title h1',           // 新版详情页标题
                    '.note-content .title h1',          // 旧版详情页标题
                    '.note-detail .title',              // 备选标题选择器
                    '.note-content .title',             // 备选标题选择器
                    'h1.title',                         // 通用标题选择器
                ];

                const contentSelectors = [
                    '.note-detail .content .desc',      // 新版详情页内容
                    '.note-content .content .desc',     // 旧版详情页内容
                    '.note-detail .desc',               // 备选内容选择器
                    '.note-content .desc',              // 备选内容选择器
                    '#detail-desc',                     // 特定内容选择器
                    '.content .desc'                    // 通用内容选择器
                ];

                // 获取标题
                let title = '无标题';
                for (const selector of titleSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        title = element.textContent.trim();
                        break;
                    }
                }

                // 获取内容
                let content = '';
                for (const selector of contentSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        // 克隆节点以避免修改原始DOM
                        const clonedElement = element.cloneNode(true);
                        
                        // 移除表情包图片和其他无关元素
                        clonedElement.querySelectorAll('img.note-content-emoji, .comment-item, .comment-wrapper').forEach(el => el.remove());
                        
                        // 获取纯文本内容
                        content = clonedElement.textContent
                            .replace(/\[小红书表情\]/g, '')
                            .replace(/\[[^\]]+\]/g, '')
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line)
                            .join('\n');
                        break;
                    }
                }

                // 获取图片
                const imgSelectors = [
                    '.swiper-slide:not(.swiper-slide-duplicate) .note-slider-img',  // 主要选择器
                    '.note-detail img[src*="xhscdn.com"]:not(.avatar-item):not(.note-content-emoji)',
                    '.note-content img[src*="xhscdn.com"]:not(.avatar-item):not(.note-content-emoji)',
                    '.main-image img',  // 备用选择器
                    'img[src*="xhscdn.com"]:not(.avatar-item):not(.note-content-emoji)'  // 通用选择器
                ];

                const images = [];
                for (const selector of imgSelectors) {
                    const imgElements = document.querySelectorAll(selector);
                    console.log(`使用选择器 ${selector} 找到图片:`, imgElements.length);
                    
                    if (imgElements.length > 0) {
                        for (const img of imgElements) {
                            if (img.complete && img.naturalHeight !== 0) {
                                const url = (img.getAttribute('data-src') || img.src).split('?')[0];
                                if (url && !url.includes('comment') && !url.includes('avatar') && !url.includes('emoji')) {
                                    try {
                                        // 创建一个新的 img 元素来加载原始图片
                                        const fullImg = new Image();
                                        fullImg.crossOrigin = 'anonymous';
                                        fullImg.src = url.replace('http://', 'https://');

                                        // 等待图片加载
                                        await new Promise((resolve, reject) => {
                                            fullImg.onload = resolve;
                                            fullImg.onerror = reject;
                                            setTimeout(resolve, 3000); // 超时保护
                                        });

                                        // 使用 canvas 获取图片数据
                                        const canvas = document.createElement('canvas');
                                        canvas.width = fullImg.naturalWidth || 1920;
                                        canvas.height = fullImg.naturalHeight || 1080;
                                        const ctx = canvas.getContext('2d');
                                        ctx.drawImage(fullImg, 0, 0);

                                        // 转换为 base64
                                        const base64Data = canvas.toDataURL('image/jpeg', 0.9);
                                        images.push({
                                            url,
                                            data: base64Data.split(',')[1]
                                        });
                                        
                                        console.log('成功获取图片:', url);
                                    } catch (error) {
                                        console.error('处理单张图片失败:', error, url);
                                        // 如果 canvas 处理失败，至少保存 URL
                                        images.push({ url });
                                    }
                                }
                            }
                        }
                        // 如果找到并处理了图片，就跳出循环
                        if (images.length > 0) {
                            console.log('成功获取图片数量:', images.length);
                            break;
                        }
                    }
                }

                return {
                    title,
                    content,
                    images,
                    url: window.location.href
                };
            });

            // 保存图片到服务器
            await fs.promises.mkdir(IMAGES_DIR, { recursive: true });

            detail.images = await Promise.all(detail.images.map(async (image, index) => {
                try {
                    const buffer = Buffer.from(image.data, 'base64');
                    const fileName = `note_${Date.now()}_${index}`;  // 移除 .jpg 扩展名
                    
                    // 上传到 Cloudinary，添加优化参数
                    const result = await new Promise((resolve, reject) => {
                        cloudinary.uploader.upload_stream(
                            {
                                folder: 'notes',
                                public_id: fileName,
                                resource_type: 'image',
                                // 添加优化参数
                                fetch_format: 'auto',
                                quality: 'auto',
                                // 限制最大尺寸
                                transformation: [
                                    { width: 1920, height: 1920, crop: 'limit' }
                                ]
                            },
                            (error, result) => {
                                if (error) reject(error);
                                else resolve(result);
                            }
                        ).end(buffer);
                    });
                    
                    console.log('图片已上传到 Cloudinary:', result.secure_url);
                    
                    return {
                        url: result.secure_url,
                        originalUrl: image.url
                    };
                } catch (error) {
                    console.error('保存图片失败:', error);
                    return {
                        url: '/assets/placeholder.jpg',
                        originalUrl: image.url
                    };
                }
            }));

            return detail;

        } catch (error) {
            console.error('获取笔记详情失败:', error);
            throw error;
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

// 修改笔记详情API路由
app.get('/api/note/detail', async (req, res) => {  // 改为 /api/note/detail
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).json({ message: '缺少笔记URL参数' });
    }

    try {
        console.log('开始获取笔记详情:', { url });
        const detail = await crawler.fetchNoteDetail(decodeURIComponent(url));
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

// 添加新的API路由用于登录
app.post('/api/login', async (req, res) => {
    try {
        console.log('开始登录流程...');
        const token = await crawler.getToken();
        console.log('登录成功，获取到token');
        res.json({ success: true, token });
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ 
            success: false, 
            message: '登录失败: ' + error.message 
        });
    }
});

// 修改图片代理路由
app.get('/api/proxy-image', async (req, res) => {
    const { url, data } = req.query;
    
    if (!url && !data) {
        return res.status(400).send('Missing URL or image data');
    }

    try {
        if (data) {
            // 如果有图片数据，直接返回
            const buffer = Buffer.from(data, 'base64');
            res.set({
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000',
                'Access-Control-Allow-Origin': '*'
            });
            res.send(buffer);
        } else {
            // 如果只有 URL，使用 Puppeteer 的上下文获取
            const page = crawler.page;
            if (!page) {
                throw new Error('Browser not initialized');
            }

            const imageData = await page.evaluate(async (imageUrl) => {
                const response = await fetch(imageUrl);
                const blob = await response.blob();
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => resolve(reader.result.split(',')[1]);
                    reader.readAsDataURL(blob);
                });
            }, decodeURIComponent(url));

            const buffer = Buffer.from(imageData, 'base64');
            res.set({
                'Content-Type': 'image/jpeg',
                'Cache-Control': 'public, max-age=31536000',
                'Access-Control-Allow-Origin': '*'
            });
            res.send(buffer);
        }
    } catch (error) {
        console.error('代理图片失败:', error);
        res.status(500).send('Error fetching image');
    }
});

// 错误处理中间件
app.use((err, req, res, next) => {
    console.error('服务器错误:', err);
    res.status(500).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? '🥞' : err.stack
    });
});

app.post('/api/notes', async (req, res) => {
    try {
        const noteData = req.body;
        
        // 验证数据
        if (!noteData.title || !noteData.content) {
            return res.status(400).json({ error: '标题和内容不能为空' });
        }

        // 保存到数据库
        const note = await Note.create({
            title: noteData.title,
            content: noteData.content,
            images: noteData.images,
            sourceUrl: noteData.url,
            timestamp: noteData.timestamp
        });

        res.json({ success: true, note });
    } catch (error) {
        console.error('保存笔记失败:', error);
        res.status(500).json({ error: '保存笔记失败' });
    }
});

// 添加一个辅助函数来清理文本
function cleanText(text) {
    return text
        // 移除 emoji 表情符号
        .replace(/[\u{1F300}-\u{1F9FF}]/gu, '')
        // 移除其他特殊 Unicode 符号和表情
        .replace(/[\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F100}-\u{1F1FF}\u{1F200}-\u{1F2FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}]/gu, '')
        // 移除多余的空格和换行
        .trim();
}

// 添加一个辅助函数来清理 HTML 标签
function stripHtml(html) {
    return html
        .replace(/<[^>]+>/g, '') // 移除所有 HTML 标签
        .replace(/&nbsp;/g, ' ') // 替换 HTML 实体
        .replace(/\s+/g, ' ') // 将多个空格合并为一个
        .trim();
}

// 修改创建草稿的部分
app.post('/api/wechat/draft', async (req, res) => {
    try {
        const { appId, appSecret, article } = req.body;
        
        // 清理标题中的 emoji
        const cleanedTitle = cleanText(article.title);
        
        console.log('收到发布请求:', { 
            appId, 
            article: { 
                title: cleanedTitle,
                imageCount: article.images?.length || 0
            }
        });

        // 1. 获取 access_token
        const tokenUrl = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
        const tokenResponse = await axios.get(tokenUrl);
        const accessToken = tokenResponse.data.access_token;
        console.log('获取到访问令牌:', accessToken);

        // 2. 上传所有图片为永久素材
        const uploadedImages = [];
        for (const [index, image] of article.images.entries()) {
            try {
                console.log(`开始上传第 ${index + 1} 张图片:`, image.url);
                
                // 构建完整的图片 URL
                const fullImageUrl = new URL(image.url, `${req.protocol}://${req.get('host')}`).href;
                console.log('完整图片URL:', fullImageUrl);
                
                // 下载图片
                const imageResponse = await axios({
                    method: 'get',
                    url: fullImageUrl,
                    responseType: 'arraybuffer',
                    headers: {
                        'Referer': 'https://www.xiaohongshu.com',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                    }
                });

                // 使用 sharp 将图片转换为 jpg 格式
                const jpegBuffer = await sharp(imageResponse.data)
                    .jpeg({
                        quality: 80,
                        chromaSubsampling: '4:4:4'
                    })
                    .toBuffer();

                console.log(`第 ${index + 1} 张图片大小:`, (jpegBuffer.length/1024).toFixed(2) + 'KB');

                // 创建 FormData
                const formData = new FormData();
                formData.append('media', jpegBuffer, {
                    filename: `image${index + 1}.jpg`,
                    contentType: 'image/jpeg'
                });

                // 上传图片
                const uploadResponse = await axios.post(
                    `https://api.weixin.qq.com/cgi-bin/material/add_material?access_token=${accessToken}&type=image`,
                    formData,
                    { 
                        headers: {
                            ...formData.getHeaders(),
                            'Content-Length': formData.getLengthSync()
                        }
                    }
                );

                console.log(`第 ${index + 1} 张图片上传响应:`, uploadResponse.data);

                if (uploadResponse.data.errcode) {
                    throw new Error(`上传图片失败: ${uploadResponse.data.errmsg}`);
                }

                uploadedImages.push({
                    originalUrl: image.url,
                    mediaId: uploadResponse.data.media_id,
                    url: uploadResponse.data.url
                });

            } catch (error) {
                console.error(`第 ${index + 1} 张图片处理失败:`, error);
                throw error;
            }
        }

        // 3. 处理文章内容
        // 将纯文本内容转换为HTML格式，保留换行
        let content = article.content
            .split('\n')  // 按换行符分割
            .map(line => {
                // 如果是空行，返回一个换行标签
                if (!line.trim()) {
                    return '<p><br/></p>';
                }
                // 非空行，包装在段落标签中
                return `<p>${line.trim()}</p>`;
            })
            .join('');  // 连接所有行

        // 在文本内容后面添加一个分隔空行
        content += '<p><br/></p>';

        // 在文本内容后面添加图片，确保有分隔
        const imagesHtml = uploadedImages
            .map(image => 
                `<p style="text-align: center;"><img src="${image.url}" data-width="100%" style="max-width:100%;"></p>`
            )
            .join('');

        // 组合最终的内容
        content += imagesHtml;

        // 4. 创建草稿
        const draftData = {
            articles: [{
                title: cleanedTitle,
                author: '',
                // 先清理 HTML 标签，再生成摘要
                digest: stripHtml(article.content).slice(0, 120).replace(/\n/g, ' '),
                content: content,
                content_source_url: '',
                thumb_media_id: uploadedImages[0].mediaId,
                need_open_comment: 1,
                only_fans_can_comment: 0,
                show_cover_pic: 1
            }]
        };

        console.log('创建草稿请求数据:', {
            ...draftData,
            articles: [{
                ...draftData.articles[0],
                content: `(长度: ${content.length})`
            }]
        });

        // 创建草稿
        const draftResponse = await axios.post(
            `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`,
            draftData
        );

        console.log('创建草稿响应:', draftResponse.data);

        if (draftResponse.data.errcode) {
            throw new Error(`创建草稿失败: ${draftResponse.data.errmsg}`);
        }

        res.json({
            success: true,
            media_id: draftResponse.data.media_id
        });

    } catch (error) {
        console.error('发布失败:', error);
        res.status(500).json({
            success: false,
            message: error.message,
            details: error.response?.data
        });
    }
});

// 修改图片处理函数，添加尺寸限制
async function compressImage(buffer, maxSize = 1024 * 1024, isThumb = false) {
    let quality = 80;
    let width = isThumb ? 900 : 1920; // 封面图片尺寸限制更小
    let height = isThumb ? 500 : 1920;

    let compressed = await sharp(buffer)
        .resize(width, height, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .jpeg({ 
            quality,
            chromaSubsampling: '4:4:4'
        })
        .toBuffer();

    // 如果图片仍然太大，继续压缩
    while (compressed.length > maxSize && quality > 10) {
        quality -= 10;
        // 如果质量调整到40还是太大，开始缩小尺寸
        if (quality < 40) {
            width = Math.floor(width * 0.8);
            height = Math.floor(height * 0.8);
        }

        compressed = await sharp(buffer)
            .resize(width, height, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ 
                quality,
                chromaSubsampling: '4:4:4'
            })
            .toBuffer();

        console.log(`压缩图片 - 质量: ${quality}, 尺寸: ${width}x${height}, 大小: ${(compressed.length/1024).toFixed(2)}KB`);
    }

    return compressed;
}

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