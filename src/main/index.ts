/**
 * 主进程入口
 * - 创建无边框、透明、置顶的 BrowserWindow
 * - 使用 electron-store 做配置持久化
 * - 注册 IPC 通道：文件选择、文件读取、配置存取、窗口尺寸同步
 */

import { app, BrowserWindow, ipcMain, dialog, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import * as fs from 'fs'
import * as iconv from 'iconv-lite'
import * as jschardet from 'jschardet'

// ============================================================
// electron-store 配置 Schema
// ============================================================
type StoreSchema = {
  // 阅读器外观
  fontSize: number
  fontColor: string
  bgColor: string
  // 窗口尺寸
  windowWidth: number
  windowHeight: number
  // 阅读进度
  filePath: string
  cursor: number
  // 快捷键
  shortcutPrev: string
  shortcutNext: string
}

// 兼容由于 ESM 和 CJS 互相转换导致的 default 导出问题
const StoreClass = (Store as unknown as { default: typeof Store }).default || Store

const store = new StoreClass<StoreSchema>({
  defaults: {
    fontSize: 14,
    fontColor: '#333333',
    bgColor: '#ffffff',
    windowWidth: 600,
    windowHeight: 360,
    filePath: '',
    cursor: 0,
    shortcutPrev: 'ArrowUp',
    shortcutNext: 'ArrowDown'
  }
})

// ============================================================
// 窗口创建
// ============================================================
function createWindow(): void {
  // 根据字号计算最小窗口尺寸（能显示一个字即可）
  const fontSize = store.get('fontSize')
  const minW = Math.ceil(fontSize + 8) // 字宽 + 左右 padding(4+4)
  const minH = Math.ceil(fontSize * 1.8 + 4) // 行高 + 上下 padding(2+2)

  const mainWindow = new BrowserWindow({
    width: store.get('windowWidth'),
    height: store.get('windowHeight'),
    minWidth: minW,
    minHeight: minH,
    frame: false, // 无边框
    transparent: true, // 背景透明
    alwaysOnTop: true, // 始终置顶
    show: false,
    autoHideMenuBar: true,
    skipTaskbar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  // 窗口准备好再显示，避免白屏闪烁
  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  // 阻止 -webkit-app-region: drag 触发的 Windows 原生系统菜单
  mainWindow.on('system-context-menu', (e) => {
    e.preventDefault()
  })

  // 窗口尺寸变化时实时保存
  mainWindow.on('resize', () => {
    const [w, h] = mainWindow.getSize()
    store.set('windowWidth', w)
    store.set('windowHeight', h)
  })

  // ----------------------------------------------------------
  // IPC 通道注册
  // ----------------------------------------------------------

  /**
   * 打开文件选择器，返回所选 .txt 文件路径
   */
  ipcMain.handle('dialog:openFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
      title: '选择 TXT 文件',
      filters: [{ name: '文本文件', extensions: ['txt'] }],
      properties: ['openFile']
    })
    if (canceled || filePaths.length === 0) return null
    return filePaths[0]
  })

  /**
   * 读取本地 TXT 文件
   * 使用 js-chardet 自动检测编码，iconv-lite 解码为 UTF-8
   */
  ipcMain.handle('file:read', async (_event, filePath: string) => {
    try {
      const buffer = fs.readFileSync(filePath)
      // 自动检测编码
      const detected = jschardet.detect(buffer)
      const encoding = detected?.encoding || 'utf-8'
      const content = iconv.decode(buffer, encoding)
      return { success: true, content }
    } catch (error) {
      return { success: false, content: '', error: String(error) }
    }
  })

  /**
   * 获取 store 中指定 key 的值
   */
  ipcMain.handle('store:get', (_event, key: string) => {
    return store.get(key as keyof StoreSchema)
  })

  /**
   * 设置 store 中指定 key 的值，并广播给所有窗口以保持状态同步
   */
  ipcMain.handle('store:set', (_event, key: string, value: unknown) => {
    store.set(key as keyof StoreSchema, value as never)
    BrowserWindow.getAllWindows().forEach((win) => {
      win.webContents.send('store:changed', key, value)
    })
  })

  /**
   * 批量获取所有配置（用于渲染进程初始化）
   */
  ipcMain.handle('store:getAll', () => {
    return store.store
  })

  /**
   * 动态设置窗口最小尺寸（字号变化时调用）
   */
  ipcMain.handle('window:setMinSize', (_event, w: number, h: number) => {
    mainWindow.setMinimumSize(Math.ceil(w), Math.ceil(h))
  })

  /**
   * 退出应用
   */
  ipcMain.handle('app:quit', () => {
    app.quit()
  })

  // ----------------------------------------------------------
  // 独立菜单窗口逻辑
  // ----------------------------------------------------------
  let menuWindow: BrowserWindow | null = null

  ipcMain.handle('menu:show', (_event, x: number, y: number) => {
    if (!menuWindow || menuWindow.isDestroyed()) {
      menuWindow = new BrowserWindow({
        width: 200,
        height: 250,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        show: false,
        resizable: false,
        skipTaskbar: true,
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          contextIsolation: true
        }
      })

      menuWindow.on('blur', () => {
        menuWindow?.hide()
      })

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        menuWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?mode=menu')
      } else {
        menuWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { mode: 'menu' } })
      }
    }

    menuWindow.setPosition(Math.round(x), Math.round(y))
    menuWindow.show()
    menuWindow.focus()
  })

  ipcMain.handle('menu:hide', () => {
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.hide()
    }
  })

  ipcMain.handle('menu:setSize', (_event, width: number, height: number) => {
    if (menuWindow && !menuWindow.isDestroyed()) {
      menuWindow.setSize(Math.round(width), Math.round(height))
    }
  })

  // ----------------------------------------------------------
  // 全局快捷键逻辑
  // ----------------------------------------------------------
  store.onDidChange('shortcutPrev', (newVal, oldVal) => {
    if (oldVal) globalShortcut.unregister(oldVal)
    if (newVal) {
      try { globalShortcut.register(newVal, () => mainWindow.webContents.send('action:prevPage')) } catch (e) {}
    }
  })

  store.onDidChange('shortcutNext', (newVal, oldVal) => {
    if (oldVal) globalShortcut.unregister(oldVal)
    if (newVal) {
      try { globalShortcut.register(newVal, () => mainWindow.webContents.send('action:nextPage')) } catch (e) {}
    }
  })

  const prev = store.get('shortcutPrev')
  if (prev) {
    try { globalShortcut.register(prev, () => mainWindow.webContents.send('action:prevPage')) } catch (e) {}
  }

  const next = store.get('shortcutNext')
  if (next) {
    try { globalShortcut.register(next, () => mainWindow.webContents.send('action:nextPage')) } catch (e) {}
  }

  // ----------------------------------------------------------
  // 加载页面
  // ----------------------------------------------------------
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ============================================================
// App 生命周期
// ============================================================
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.fish-reader')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
