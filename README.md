我来帮你编写一个完整的 README.md 文件：

```markdown:README.md
# 小红书笔记同步工具

一个帮助你将小红书笔记同步到微信公众号的工具。支持自动获取笔记内容、图片处理和一键发布到公众号草稿箱。

## 功能特点

- 自动抓取小红书笔记内容和图片
- 图片自动压缩和格式转换
- 支持一键发布到微信公众号草稿箱
- 支持批量同步作者主页笔记
- 自动处理图片大小和格式要求
- 支持忽略话题标签等选项

## 使用说明

### 1. 笔记同步
1. 打开工具首页 `/index.html`
2. 在输入框中粘贴小红书笔记链接
3. 点击"获取笔记"按钮
4. 预览笔记内容和图片
5. 点击"发布到公众号"按钮同步到草稿箱

### 2. 作者主页同步
1. 打开作者主页 `/home.html`
2. 查看作者笔记列表
3. 点击任意笔记进行同步
4. 支持加载更多笔记

## 配置说明

### 环境变量配置
创建 `.env` 文件，添加以下配置：

```env
# 微信公众号配置
WECHAT_APP_ID=your_app_id
WECHAT_APP_SECRET=your_app_secret

# Cloudinary配置（用于图片存储）
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret

# 环境配置
NODE_ENV=development
PORT=8080
```

## 本地测试

### 环境要求
- Node.js >= 18.0.0
- NPM 或 Yarn

### 安装步骤

1. 克隆仓库
```bash
git clone <repository-url>
cd xiaohongshu-to-wechat
```

2. 安装依赖
```bash
npm install
```

3. 配置环境变量
复制 `.env.example` 到 `.env` 并填入你的配置信息：
```bash
cp .env.example .env
```

4. 启动开发服务器
```bash
npm run dev
```

5. 访问应用
打开浏览器访问 `http://localhost:8080`

## 云端部署 (Render.com)

1. 注册并登录 Render.com

2. 创建新的 Web Service
   - 连接你的 GitHub 仓库
   - 选择主分支

3. 配置部署选项
   - Build Command: `npm run build`
   - Start Command: `npm start`

4. 添加环境变量
   在 Render.com 的环境变量设置中添加：
   ```
   WECHAT_APP_ID=your_app_id
   WECHAT_APP_SECRET=your_app_secret
   CLOUDINARY_CLOUD_NAME=your_cloud_name
   CLOUDINARY_API_KEY=your_api_key
   CLOUDINARY_API_SECRET=your_api_secret
   NODE_ENV=production
   ```

5. 创建持久化目录
   在 Render.com 的磁盘设置中添加：
   - `/data/images`：用于存储临时图片
   - `/opt/render/project/src/public/assets`：用于存储静态资源

6. 部署应用
   点击 "Create Web Service" 开始部署

## 注意事项

1. 本工具仅用于个人学习和研究
2. 请遵守小红书和微信公众平台的使用条款
3. 建议合理设置图片压缩参数，避免超出公众号限制
4. 定期检查和更新配置信息
5. 建议在本地测试无误后再部署到云端
6. 请妥善保管你的微信公众号 AppID 和 AppSecret，不要泄露给他人

## 许可证

MIT License
```

这个 README.md 文件包含了完整的项目说明、配置方法、本地测试和云端部署指南。用户可以按照文档一步步操作，快速上手使用这个工具。

建议你根据实际项目情况调整以下内容：
1. 补充实际的仓库URL
2. 更新具体的许可证信息
3. 根据需要添加更多的环境变量说明
4. 补充特定的使用限制或注意事项


