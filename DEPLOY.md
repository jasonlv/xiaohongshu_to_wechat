# 小红书笔记同步工具部署指南

## 腾讯云 Webify 部署说明

### 1. 项目准备

1. 确保项目根目录包含以下文件：
   - `package.json`：项目依赖配置
   - `server/`：后端服务代码
   - `public/`：前端静态文件
   - `client/`：前端 JavaScript 代码

2. 在项目根目录创建 `webify.config.json` 配置文件：
```json
{
  "envId": "your-env-id",
  "framework": {
    "name": "custom",
    "config": {
      "buildCommand": "npm run build",
      "outputPath": "dist",
      "installCommand": "npm install"
    }
  }
}
```

### 2. Webify 配置说明

#### 构建配置
- 构建命令：`npm run build`
- 输出目录：`dist`
- 安装命令：`npm install`

#### 环境变量配置
在 Webify 控制台配置以下环境变量：
- `NODE_ENV`: production
- `PORT`: 80

### 3. 部署步骤

1. 登录腾讯云 Webify 控制台
2. 创建新应用
3. 选择 "自定义" 框架
4. 配置构建参数：
   - 构建命令：`npm run build`
   - 输出目录：`dist`
   - 安装命令：`npm install`
5. 配置环境变量
6. 开始部署

### 4. 注意事项

1. 确保所有依赖都已在 `package.json` 中正确声明
2. 本地测试构建命令确保能正常工作
3. 图片存储建议使用腾讯云 COS 或其他云存储服务
4. 需要配置跨域访问策略
5. 建议使用 PM2 或类似工具管理 Node.js 进程

### 5. 常见问题排查

1. 构建失败
   - 检查 `package.json` 中的构建脚本
   - 查看构建日志
   - 确认依赖版本兼容性

2. 运行时错误
   - 检查环境变量配置
   - 查看应用日志
   - 确认端口配置

3. 静态资源访问问题
   - 确认输出目录配置
   - 检查静态资源路径

### 6. 技术支持

如遇到问题，可以：
1. 查看 [Webify 官方文档](https://webify.cloudbase.net/docs)
2. 在 [云开发社区](https://cloudbase.net) 寻求帮助
3. 提交 GitHub Issues 