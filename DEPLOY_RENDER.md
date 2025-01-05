# Render.com 部署指南

## 部署配置

### 1. 基本设置
- **构建命令**：`npm install && npm run build`
- **启动命令**：`npm start`
- **Node 版本**：18.x（已在 package.json 中指定）

### 2. 环境变量配置
在 Render.com 的环境变量中配置：
```
NODE_ENV=production
PORT=10000
CLOUDINARY_URL=your_cloudinary_url
CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

### 3. 构建设置
- **自动部署**：开启
- **分支**：main/master
- **构建时间**：预计 5-10 分钟

### 4. 注意事项

1. **Puppeteer 相关**
   - Render.com 已预装 Chrome，无需额外配置
   - 使用 `--no-sandbox` 参数启动浏览器

2. **文件存储**
   - 使用 Cloudinary 存储图片
   - Render.com 不提供永久存储，所有文件会在部署时重置

3. **性能优化**
   - 设置合理的超时时间
   - 使用 `sharp` 进行图片处理
   - 配置适当的内存限制

4. **调试方法**
   - 查看 Render.com 日志
   - 使用环境变量 `DEBUG=app:*` 开启调试日志

### 5. 部署步骤

1. 登录 Render.com Dashboard
2. 选择 "New Web Service"
3. 连接 GitHub 仓库
4. 配置构建和启动命令
5. 设置环境变量
6. 点击 "Create Web Service"

### 6. 更新部署

- 推送代码到 GitHub 将自动触发部署
- 可在 Render.com Dashboard 查看部署状态和日志

### 7. 常见问题

1. **构建失败**
   - 检查 Node.js 版本兼容性
   - 确认所有依赖都已正确安装
   - 查看构建日志

2. **运行时错误**
   - 检查环境变量配置
   - 确认 Puppeteer 启动参数
   - 查看应用日志

3. **性能问题**
   - 检查内存使用情况
   - 优化图片处理流程
   - 调整并发请求数量

### 8. 监控和维护

1. **监控指标**
   - CPU 使用率
   - 内存使用情况
   - 响应时间
   - 错误率

2. **日常维护**
   - 定期检查日志
   - 更新依赖版本
   - 清理临时文件

### 9. 技术支持

如遇到问题：
1. 查看 [Render.com 文档](https://render.com/docs)
2. 检查应用日志
3. 联系 Render.com 支持 