/**
 * Preload 脚本
 * 通过 contextBridge 安全地向渲染进程暴露主进程 API
 * 渲染进程通过 window.api.xxx() 调用
 */

import { contextBridge, ipcRenderer } from 'electron'

// 暴露给渲染进程的 API 接口
const api = {
  /** 打开系统文件选择器，选择 .txt 文件 */
  openFile: (): Promise<string | null> => ipcRenderer.invoke('dialog:openFile'),

  /** 读取指定路径的 TXT 文件内容（自动处理编码） */
  readFile: (filePath: string): Promise<{ success: boolean; content: string; error?: string }> =>
    ipcRenderer.invoke('file:read', filePath),

  /** 获取 store 中指定 key 的值 */
  getStore: (key: string): Promise<unknown> => ipcRenderer.invoke('store:get', key),

  /** 设置 store 中指定 key 的值 */
  setStore: (key: string, value: unknown): Promise<void> =>
    ipcRenderer.invoke('store:set', key, value),

  /** 批量获取所有配置 */
  getAllStore: (): Promise<Record<string, unknown>> => ipcRenderer.invoke('store:getAll'),

  /** 动态设置窗口最小尺寸 */
  setMinSize: (w: number, h: number): Promise<void> => ipcRenderer.invoke('window:setMinSize', w, h),

  /** 退出应用 */
  quitApp: (): Promise<void> => ipcRenderer.invoke('app:quit'),

  /** 独立菜单 IPC */
  showMenu: (x: number, y: number): Promise<void> => ipcRenderer.invoke('menu:show', x, y),
  hideMenu: (): Promise<void> => ipcRenderer.invoke('menu:hide'),
  setMenuSize: (w: number, h: number): Promise<void> => ipcRenderer.invoke('menu:setSize', w, h),
  
  /** 监听 Store 变化 */
  onStoreChange: (callback: (key: string, value: unknown) => void): void => {
    ipcRenderer.on('store:changed', (_event, key, value) => callback(key, value))
  },
  
  /** 监听主进程的全局动作 */
  onAction: (callback: (action: string) => void): void => {
    ipcRenderer.on('action:prevPage', () => callback('prevPage'))
    ipcRenderer.on('action:nextPage', () => callback('nextPage'))
  }
}

// 安全地暴露 API
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.api = api
}
