const { app, BrowserWindow, Tray, Menu, ipcMain } = require('electron');
const path = require('path');
const express = require('express');
const Store = require('electron-store');

// 初始化配置存储
const store = new Store();

// Express 服务器实例
let server;
let mainWindow;
let tray;

// 启动 Express 服务器
function startServer() {
    const serverApp = require('../server/app');
    server = serverApp.listen(0, () => {
        const port = server.address().port;
        store.set('serverPort', port);
        console.log(`服务器运行在端口: ${port}`);
    });
}

function createWindow() {
    // 创建浏览器窗口
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        },
        icon: path.join(__dirname, '../build/icon.png')
    });

    // 等待服务器启动
    const port = store.get('serverPort');
    mainWindow.loadURL(`http://localhost:${port}`);

    // 开发环境打开开发者工具
    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // 创建系统托盘
    createTray();
}

function createTray() {
    tray = new Tray(path.join(__dirname, '../build/icon.png'));
    const contextMenu = Menu.buildFromTemplate([
        {
            label: '显示主窗口',
            click: () => mainWindow.show()
        },
        {
            label: '退出',
            click: () => app.quit()
        }
    ]);
    tray.setToolTip('小红书笔记同步工具');
    tray.setContextMenu(contextMenu);

    tray.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

// 应用程序准备就绪时
app.whenReady().then(() => {
    startServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// 所有窗口关闭时退出应用
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// 应用退出时清理
app.on('before-quit', () => {
    if (server) {
        server.close();
    }
});

// 处理主窗口最小化到托盘
mainWindow?.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
});

// 处理主窗口关闭按钮
mainWindow?.on('close', (event) => {
    if (!app.isQuitting) {
        event.preventDefault();
        mainWindow.hide();
    }
    return false;
}); 