const express = require('express');
const cors = require('cors');
const puppeteer = require('puppeteer');
const path = require('path');
const timeout = require('connect-timeout');
const axios = require('axios');

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

// 修改静态文件服务配置
app.use('/client', express.static(path.join(__dirname, '../client')));
app.use('/', express.static(path.join(__dirname, '../')));

// 添加错误恢复中间件
app.use((req, res, next) => {
    if (!req.timedout) next();
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
                    headless: 'new',  // 使用无头模式
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--window-size=1920,1080'
                    ]
                });
            }

            if (!this.page) {
                this.page = await this.browser.newPage();
                await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                
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
            await this.initialize();
            
            // 访问笔记页面
            await this.page.goto(url, {
                waitUntil: 'networkidle2',
                timeout: 60000
            });

            // 等待页面加载
            await this.delay(2000);

            // 获取笔记详情
            const detail = await this.page.evaluate(() => {
                try {
                    // 获取标题
                    const title = document.querySelector('#detail-title')?.textContent?.trim() || 
                                document.querySelector('.title')?.textContent?.trim() || 
                                '无标题';

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
                            .split('\n')
                            .map(line => line.trim())
                            .filter(line => line)
                            .join('\n');
                    }

                    // 获取封面图和所有图片
                    const coverImg = document.querySelector('.cover-image img');
                    const coverImageUrl = coverImg ? 
                        (coverImg.getAttribute('data-src') || coverImg.src).split('?')[0].replace('http://', 'https://') : 
                        null;

                    // 获取所有图片
                    const imgSet = new Set(); // 使用 Set 去重
                    const imgElements = document.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) img');
                    
                    const validImages = Array.from(imgElements)
                        .map(img => {
                            const url = (img.getAttribute('data-src') || img.src).split('?')[0];
                            if (url && 
                                !url.includes('comment') && 
                                !url.includes('avatar') && 
                                !url.includes('emoji')) {
                                return url.replace('http://', 'https://');
                            }
                            return null;
                        })
                        .filter(Boolean);

                    // 使用 Set 去重
                    validImages.forEach(url => imgSet.add(url));

                    // 构建最终的图片数组
                    let finalImages = [];
                    if (coverImageUrl) {
                        finalImages.push({ url: coverImageUrl });
                        // 添加其他图片，排除封面图
                        Array.from(imgSet)
                            .filter(url => url !== coverImageUrl)
                            .forEach(url => finalImages.push({ url }));
                    } else {
                        finalImages = Array.from(imgSet).map(url => ({ url }));
                    }

                    return {
                        title,
                        content,
                        images: finalImages,
                        coverImage: coverImageUrl || '',
                        url: window.location.href
                    };
                } catch (error) {
                    console.error('处理页面内容时出错:', error);
                    throw error;
                }
            });

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
    const { url } = req.query;
    
    if (!url) {
        console.error('缺少图片URL参数');
        return res.status(400).send('Missing URL parameter');
    }

    try {
        console.log('正在代理图片:', url);
        const decodedUrl = decodeURIComponent(url);

        // 使用 axios 替代 fetch
        const response = await axios({
            method: 'get',
            url: decodedUrl,
            headers: {
                'Referer': 'https://www.xiaohongshu.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
            },
            responseType: 'arraybuffer'
        });

        // 设置响应头
        res.set({
            'Content-Type': response.headers['content-type'] || 'image/jpeg',
            'Cache-Control': 'public, max-age=31536000',
            'Access-Control-Allow-Origin': '*'
        });

        // 发送图片数据
        res.send(response.data);

    } catch (error) {
        console.error('代理图片失败:', error);
        
        // 返回一个默认的占位图片
        res.set('Content-Type', 'image/svg+xml');
        res.send(`
            <svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="200" height="200" fill="#f0f0f0"/>
                <text x="50%" y="50%" text-anchor="middle" fill="#999">图片加载失败</text>
            </svg>
        `);
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

// 添加微信公众号相关的路由
app.post('/api/wechat/draft', async (req, res) => {
    try {
        const { appId, appSecret, article } = req.body;

        // 1. 获取访问令牌
        const tokenResponse = await axios.get(
            `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
        );

        if (!tokenResponse.data.access_token) {
            throw new Error('获取访问令牌失败');
        }

        const accessToken = tokenResponse.data.access_token;

        // 2. 上传封面图片（如果有）
        let thumbMediaId = '';
        if (article.images && article.images.length > 0) {
            const coverImage = article.images[0];
            const imageResponse = await axios({
                method: 'post',
                url: `https://api.weixin.qq.com/cgi-bin/media/upload?access_token=${accessToken}&type=image`,
                data: {
                    media: coverImage.url
                },
                headers: {
                    'Content-Type': 'multipart/form-data'
                }
            });

            if (imageResponse.data.media_id) {
                thumbMediaId = imageResponse.data.media_id;
            }
        }

        // 3. 创建草稿
        const draftResponse = await axios({
            method: 'post',
            url: `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${accessToken}`,
            data: {
                articles: [{
                    title: article.title,
                    author: article.author,
                    digest: article.digest,
                    content: article.content,
                    thumb_media_id: thumbMediaId,
                    need_open_comment: 0,
                    only_fans_can_comment: 0
                }]
            }
        });

        if (draftResponse.data.errcode) {
            throw new Error(`创建草稿失败: ${draftResponse.data.errmsg}`);
        }

        res.json({
            success: true,
            media_id: draftResponse.data.media_id
        });

    } catch (error) {
        console.error('发布到微信公众号失败:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
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