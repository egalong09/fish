/**
 * Preload API 类型声明
 * 让渲染进程中 window.api 获得完整的 TypeScript 类型提示
 */

export interface IElectronAPI {
  /** 打开系统文件选择器 */
  openFile: () => Promise<string | null>
  /** 读取 TXT 文件（自动处理编码） */
  readFile: (filePath: string) => Promise<{ success: boolean; content: string; error?: string }>
  /** 获取 store 配置项 */
  getStore: (key: string) => Promise<unknown>
  /** 设置 store 配置项 */
  setStore: (key: string, value: unknown) => Promise<void>
  /** 批量获取所有配置 */
  getAllStore: () => Promise<Record<string, unknown>>
  /** 动态设置窗口最小尺寸 */
  setMinSize: (w: number, h: number) => Promise<void>
  /** 退出应用 */
  quitApp: () => Promise<void>
  /** 独立菜单 IPC */
  showMenu: (x: number, y: number) => Promise<void>
  hideMenu: () => Promise<void>
  setMenuSize: (w: number, h: number) => Promise<void>
  /** 监听 Store 变化 */
  onStoreChange: (callback: (key: string, value: unknown) => void) => void
  /** 监听主进程的全局动作 */
  onAction: (callback: (action: string) => void) => void
}

declare global {
  interface Window {
    api: IElectronAPI
  }
}
