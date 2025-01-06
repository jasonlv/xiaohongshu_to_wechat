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
const https = require('https');

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
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
});

// 添加重试机制的工具函数
async function retryOperation(operation, maxRetries = 3, delay = 1000) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            console.log(`操作失败，${delay / 1000}秒后重试...`, error.message);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

// 修改图片下载函数
async function downloadImage(url) {
    try {
        const response = await retryOperation(async () => {
            return await axios.get(url, {
                responseType: 'arraybuffer',
                timeout: 10000, // 10秒超时
                headers: {
                    'Referer': 'https://www.xiaohongshu.com',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                httpsAgent: new https.Agent({
                    rejectUnauthorized: false // 忽略SSL证书错误
                })
            });
        });

        return response.data;
    } catch (error) {
        console.error('下载图片失败:', error.message);
        throw error;
    }
}

// 修改图片上传函数
async function uploadToCloudinary(imageBuffer, publicId) {
    try {
        return await retryOperation(async () => {
            return await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    {
                        public_id: publicId,
                        folder: 'notes',
                        resource_type: 'auto',
                        timeout: 60000 // 60秒超时
                    },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result);
                    }
                );

                const bufferStream = new Readable();
                bufferStream.push(imageBuffer);
                bufferStream.push(null);
                bufferStream.pipe(uploadStream);
            });
        });
    } catch (error) {
        console.error('上传到Cloudinary失败:', error.message);
        throw error;
    }
}

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
                    headless: 'new', // 使用新的无头模式
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-web-security',
                        '--disable-features=IsolateOrigins,site-per-process',
                        '--ignore-certificate-errors',
                        '--window-size=1920,1080'
                    ]
                });
            }

            if (!this.page) {
                this.page = await this.browser.newPage();

                // 设置更真实的浏览器环境
                await this.page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                await this.page.setViewport({
                    width: 1920,
                    height: 1080,
                    deviceScaleFactor: 1,
                });

                // 设置更多的请求头
                await this.page.setExtraHTTPHeaders({
                    'Accept-Language': 'zh-CN,zh;q=0.9',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                    'Accept-Encoding': 'gzip, deflate, br',
                    'Connection': 'keep-alive',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache',
                    'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                    'Sec-Fetch-User': '?1',
                    'Upgrade-Insecure-Requests': '1'
                });

                // 从环境变量获取 Cookie
                const cookieString = process.env.XIAOHONGSHU_COOKIE;
                if (cookieString) {
                    console.log('从环境变量加载 Cookie...');
                    try {
                        // 解析 Cookie 字符串
                        const cookies = cookieString.split(';').map(pair => {
                            const [name, value] = pair.trim().split('=');
                            console.log('解析 Cookie:', { name, value: value?.substring(0, 10) + '...' });
                            return {
                                name,
                                value,
                                domain: '.xiaohongshu.com',
                                path: '/'
                            };
                        });

                        // 设置 Cookie
                        await this.page.setCookie(...cookies);
                        console.log('成功设置 Cookie:', cookies.length, '个');
                        console.log('Cookie 名称列表:', cookies.map(c => c.name).join(', '));
                    } catch (error) {
                        console.error('设置 Cookie 失败:', error);
                    }
                } else {
                    console.warn('未配置小红书 Cookie，可能会影响内容获取');
                }

                // 启用 JavaScript
                await this.page.setJavaScriptEnabled(true);

                // 设置页面超时
                await this.page.setDefaultNavigationTimeout(60000);
                await this.page.setDefaultTimeout(60000);

                // 监听所有请求
                this.page.on('request', request => {
                    console.log('请求URL:', request.url());
                });

                // 监听请求失败
                this.page.on('requestfailed', request => {
                    console.log('请求失败:', request.url(), request.failure().errorText);
                });

                // 监听响应
                this.page.on('response', response => {
                    console.log('响应状态:', response.url(), response.status());
                });

                // 拦截请求
                await this.page.setRequestInterception(true);
                this.page.on('request', (request) => {
                    const url = request.url();

                    // 屏蔽统计、监控等不必要的请求
                    if (url.includes('apm-fe.xiaohongshu.com') ||
                        url.includes('/api/data') ||
                        url.includes('/api/sns/web/v1/feed') ||
                        url.includes('gw.datawin.alibaba.com') ||
                        url.includes('analytics') ||
                        url.includes('tracker') ||
                        url.includes('stats') ||
                        url.includes('monitor')) {
                        console.log('拦截请求:', url);
                        request.abort();
                        return;
                    }

                    // 屏蔽非必要资源
                    if (['stylesheet', 'font', 'media'].includes(request.resourceType())) {
                        request.abort();
                        return;
                    }

                    // 修改图片请求的URL，确保使用HTTPS
                    if (request.resourceType() === 'image') {
                        const imageUrl = url.replace('http://', 'https://');
                        request.continue({ url: imageUrl });
                    } else {
                        request.continue();
                    }
                });
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

    async fetchNoteDetailByApi(noteId) {
        try {
            // 构建移动端 API URL
            const apiUrl = `https://edith.xiaohongshu.com/api/sns/v2/note/${noteId}`;

            // 设置移动端请求头
            const headers = {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.20(0x18001442) NetType/WIFI Language/zh_CN',
                'Accept': 'application/json',
                'X-Sign': this.generateXSign(), // 需要实现签名算法
                'Authorization': process.env.XIAOHONGSHU_TOKEN,
                'X-User-ID': process.env.XIAOHONGSHU_USER_ID,
                'device-fingerprint': process.env.XIAOHONGSHU_DEVICE_ID,
                'X-Timestamp': Date.now().toString()
            };

            const response = await axios.get(apiUrl, { headers });
            const data = response.data;

            if (data.success) {
                const note = data.data;
                return {
                    title: note.title || '无标题',
                    content: note.desc || '',
                    images: note.images.map(img => ({
                        url: img.url,
                        width: img.width,
                        height: img.height
                    })),
                    url: `https://www.xiaohongshu.com/explore/${noteId}`
                };
            } else {
                throw new Error(data.msg || '获取笔记详情失败');
            }
        } catch (error) {
            console.error('通过 API 获取笔记详情失败:', error);
            throw error;
        }
    }

    // 生成签名的方法
    generateXSign() {
        // TODO: 实现签名算法
        return '';
    }

    // 修改现有的 fetchNoteDetail 方法，增加 API 获取作为备选
    async fetchNoteDetail(url) {
        try {
            if (!this.page) {
                await this.initialize();
            }

            console.log('开始访问笔记页面:', url);

            // 创建新的页面上下文
            const page = await this.browser.newPage();

            // 设置更真实的浏览器特征
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            await page.setViewport({
                width: 1920,
                height: 1080,
                deviceScaleFactor: 1,
                hasTouch: true  // 启用触摸支持
            });

            // 访问页面
            await page.goto(url, {
                waitUntil: ['networkidle0', 'domcontentloaded'],
                timeout: 30000
            });

            // 模拟真实用户行为
            await this.simulateUserBehavior(page);

            // 等待内容加载
            await page.waitForSelector('.content, .note-content', { timeout: 10000 });

            // 获取笔记详情
            const detail = await page.evaluate(async () => {
                // 获取图片
                const getImages = async () => {
                    const images = [];

                    // 首先尝试获取轮播图片容器
                    const swiperContainer = document.querySelector('.swiper-wrapper');
                    if (swiperContainer) {
                        // 从轮播容器中获取图片
                        const swiperImages = Array.from(swiperContainer.querySelectorAll('.swiper-slide:not(.swiper-slide-duplicate) img'));
                        for (const img of swiperImages) {
                            const src = img.dataset.src || img.src;
                            if (src && src.includes('xhscdn.com') && !src.includes('avatar') && !src.includes('emoji')) {
                                const cleanUrl = src.split('?')[0];
                                if (!images.some(existingImg => existingImg.url === cleanUrl)) {
                                    images.push({
                                        url: cleanUrl,
                                        width: img.naturalWidth || 800,
                                        height: img.naturalHeight || 800
                                    });
                                }
                            }
                        }
                    }

                    // 如果没有找到轮播图片，尝试其他选择器
                    if (images.length === 0) {
                        // 按照优先级尝试不同的选择器
                        const selectors = [
                            '.note-content img[src*="xhscdn.com"]:not(.avatar):not(.note-content-emoji)',
                            '.main-image img[src*="xhscdn.com"]',
                            'img.note-img[src*="xhscdn.com"]'
                        ];

                        for (const selector of selectors) {
                            const imageElements = Array.from(document.querySelectorAll(selector));
                            if (imageElements.length > 0) {
                                for (const img of imageElements) {
                                    const src = img.dataset.src || img.src;
                                    if (src && !src.includes('avatar') && !src.includes('emoji')) {
                                        const cleanUrl = src.split('?')[0];
                                        if (!images.some(existingImg => existingImg.url === cleanUrl)) {
                                            images.push({
                                                url: cleanUrl,
                                                width: img.naturalWidth || 800,
                                                height: img.naturalHeight || 800
                                            });
                                        }
                                    }
                                }
                                break; // 如果找到图片就停止尝试其他选择器
                            }
                        }
                    }

                    console.log('找到图片数量:', images.length);
                    return images;
                };

                // 获取标题和内容
                const title = document.querySelector('.title')?.textContent?.trim() || '无标题';
                const content = document.querySelector('.content, .desc')?.textContent?.trim() || '';

                // 获取图片
                const images = await getImages();

                return {
                    title,
                    content,
                    images,
                    url: window.location.href
                };
            });

            // 下载图片到本地
            if (detail.images && detail.images.length > 0) {
                detail.images = await Promise.all(detail.images.map(async (img, index) => {
                    try {
                        // 下载图片
                        const imageBuffer = await downloadImage(img.url);

                        if (process.env.NODE_ENV === 'production') {
                            // 在生产环境使用 Cloudinary
                            const publicId = `note_${Date.now()}_${index}`;
                            const uploadResult = await uploadToCloudinary(imageBuffer, publicId);
                            return {
                                ...img,
                                url: uploadResult.secure_url,
                                originalIndex: index  // 保存原始索引
                            };
                        } else {
                            // 在开发环境保存到本地
                            const fileName = `${Date.now()}_${index}.jpg`;
                            const filePath = path.join(IMAGES_DIR, fileName);
                            await fs.promises.writeFile(filePath, imageBuffer);
                            return {
                                ...img,
                                url: `/images/${fileName}`,
                                originalIndex: index  // 保存原始索引
                            };
                        }
                    } catch (error) {
                        console.error(`处理图片 ${index + 1} 失败:`, error);
                        return {
                            ...img,
                            originalIndex: index  // 即使失败也保存索引
                        };
                    }
                }));

                // 确保图片顺序与原始顺序一致
                detail.images.sort((a, b) => a.originalIndex - b.originalIndex);
            }

            // 关闭页面
            await page.close();

            return detail;
        } catch (error) {
            console.error('获取笔记详情失败:', error);
            throw error;
        }
    }

    // 模拟真实用户行为
    async simulateUserBehavior(page) {
        try {
            // 随机延迟函数
            const randomDelay = async (min, max) => {
                const delay = Math.floor(Math.random() * (max - min) + min);
                await page.waitForTimeout(delay);
            };

            // 模拟随机鼠标移动
            const moveMouseRandomly = async () => {
                const viewportSize = await page.viewport();
                const x = Math.floor(Math.random() * viewportSize.width);
                const y = Math.floor(Math.random() * viewportSize.height);
                await page.mouse.move(x, y, { steps: 10 });
            };

            // 模拟页面滚动
            const simulateScroll = async () => {
                await page.evaluate(async () => {
                    const scrollHeight = document.documentElement.scrollHeight;
                    const viewHeight = window.innerHeight;
                    const scrollSteps = Math.floor(scrollHeight / viewHeight);

                    for (let i = 0; i < scrollSteps; i++) {
                        window.scrollTo(0, i * viewHeight);
                        await new Promise(r => setTimeout(r, Math.random() * 500 + 100));
                    }

                    // 滚回顶部
                    window.scrollTo(0, 0);
                });
            };

            // 执行一系列真实用户行为
            await randomDelay(1000, 2000);  // 初始等待
            await moveMouseRandomly();       // 随机移动鼠标
            await randomDelay(500, 1000);
            await simulateScroll();          // 滚动页面
            await randomDelay(800, 1500);
            await moveMouseRandomly();       // 再次移动鼠标
            await randomDelay(500, 1000);

            // 模拟查看图片行为
            const images = await page.$$('img[data-src], img.note-img, .swiper-slide img');
            for (const img of images) {
                const box = await img.boundingBox();
                if (box) {
                    // 移动到图片位置
                    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 5 });
                    await randomDelay(300, 800);
                }
            }

        } catch (error) {
            console.error('模拟用户行为失败:', error);
            // 继续执行，不中断流程
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
        const { article } = req.body;

        // 从环境变量获取微信配置
        const appId = process.env.WECHAT_APP_ID;
        const appSecret = process.env.WECHAT_APP_SECRET;

        if (!appId || !appSecret) {
            throw new Error('未配置微信公众号 AppID 或 AppSecret');
        }

        // 清理标题中的 emoji
        const cleanedTitle = cleanText(article.title);

        console.log('收到发布请求:', {
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

                console.log(`第 ${index + 1} 张图片大小:`, (jpegBuffer.length / 1024).toFixed(2) + 'KB');

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

        console.log(`压缩图片 - 质量: ${quality}, 尺寸: ${width}x${height}, 大小: ${(compressed.length / 1024).toFixed(2)}KB`);
    }

    return compressed;
}

// 添加用户信息 API
app.get('/api/user/info', async (req, res) => {
    const { userId } = req.query;

    if (!userId) {
        return res.status(400).json({ message: '缺少用户ID' });
    }

    try {
        // 初始化爬虫
        if (!crawler.page) {
            await crawler.initialize();
        }

        // 访问用户主页
        const userUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
        await crawler.page.goto(userUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // 等待用户信息加载
        await crawler.page.waitForSelector('.user-info', { timeout: 10000 });

        // 提取用户信息
        const userInfo = await crawler.page.evaluate(() => {
            const avatar = document.querySelector('.avatar-wrapper img')?.src || '';
            const nickname = document.querySelector('.user-nickname .user-name')?.textContent || '';
            const redId = document.querySelector('.user-redId')?.textContent.replace('小红书号：', '') || '';
            const description = document.querySelector('.user-desc')?.textContent || '';

            // 获取统计数据
            const stats = Array.from(document.querySelectorAll('.user-interactions div')).map(div => {
                const count = div.querySelector('.count')?.textContent || '0';
                return count.replace(/[^0-9.]/g, '');
            });

            return {
                avatar,
                nickname,
                redId,
                description,
                following: stats[0] || '0',
                followers: stats[1] || '0',
                likes: stats[2] || '0'
            };
        });

        res.json(userInfo);

    } catch (error) {
        console.error('获取用户信息失败:', error);
        res.status(500).json({
            message: '获取用户信息失败',
            error: error.message
        });
    }
});

// 添加用户笔记列表 API
app.get('/api/user/notes', async (req, res) => {
    const { userId, page = 1, pageSize = 12 } = req.query;

    if (!userId) {
        return res.status(400).json({ message: '缺少用户ID' });
    }

    try {
        // 初始化爬虫
        if (!crawler.page) {
            await crawler.initialize();
        }

        // 访问用户主页
        const userUrl = `https://www.xiaohongshu.com/user/profile/${userId}`;
        await crawler.page.goto(userUrl, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });

        // 等待笔记列表加载
        await crawler.page.waitForSelector('.note-item', { timeout: 10000 });

        // 模拟滚动加载更多笔记
        const targetCount = page * pageSize;
        let currentCount = 0;

        while (currentCount < targetCount) {
            await crawler.page.evaluate(() => {
                window.scrollBy(0, window.innerHeight);
            });
            await crawler.delay(1000);

            currentCount = await crawler.page.evaluate(() =>
                document.querySelectorAll('.note-item').length
            );

            // 如果滚动后笔记数量没有增加，说明已经到底
            if (currentCount < targetCount && currentCount === await crawler.page.evaluate(() =>
                document.querySelectorAll('.note-item').length)) {
                break;
            }
        }

        // 提取笔记信息
        const notes = await crawler.page.evaluate((pageSize, currentPage) => {
            const start = (currentPage - 1) * pageSize;
            const items = Array.from(document.querySelectorAll('.note-item'))
                .slice(start, start + pageSize);

            return items.map(item => {
                const cover = item.querySelector('img')?.src || '';
                const title = item.querySelector('.title')?.textContent.trim() || '';
                const link = item.querySelector('a.cover')?.href || '';
                const likes = item.querySelector('.like-wrapper .count')?.textContent || '0';

                return {
                    cover,
                    title,
                    link,
                    likes,
                    createTime: new Date().toISOString() // 实际时间可能需要从页面解析
                };
            });
        }, pageSize, parseInt(page));

        // 处理每个笔记的图片
        const processedNotes = await Promise.all(notes.map(async note => {
            if (note.cover) {
                try {
                    // 下载并上传封面图
                    const imageBuffer = await downloadImage(note.cover);
                    const publicId = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                    const uploadResult = await uploadToCloudinary(imageBuffer, publicId);
                    note.cover = uploadResult.secure_url;
                } catch (error) {
                    console.error('处理笔记封面失败:', error.message);
                    // 使用默认封面
                    note.cover = '/assets/placeholder.jpg';
                }
            }
            return note;
        }));

        res.json({
            notes: processedNotes,
            hasMore: processedNotes.length === parseInt(pageSize)
        });

    } catch (error) {
        console.error('获取笔记列表失败:', error);
        res.status(500).json({
            message: '获取笔记列表失败',
            error: error.message,
            data: {
                notes: [],
                hasMore: false
            }
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