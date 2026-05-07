/**
 * Pinia 阅读器状态管理
 * 管理阅读器的全部状态：文本内容、阅读进度、外观配置
 * 所有配置变更实时同步到 electron-store 持久化
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useReaderStore = defineStore('reader', () => {
  // ============================================================
  // 状态定义
  // ============================================================

  /** 当前打开的文件路径 */
  const filePath = ref('')
  /** 文件的完整文本内容 */
  const fileContent = ref('')
  /** 当前阅读位置（字符索引） */
  const cursor = ref(0)

  /** 字体大小 (px) */
  const fontSize = ref(14)
  /** 字体颜色 */
  const fontColor = ref('#333333')
  /** 背景颜色 */
  const bgColor = ref('#ffffff')

  const shortcutPrev = ref('ArrowUp')
  const shortcutNext = ref('ArrowDown')
  const cursorHistory = ref<number[]>([])

  // ============================================================
  // 计算属性
  // ============================================================

  /** 是否已加载文件 */
  const hasFile = computed(() => fileContent.value.length > 0)

  /** 阅读进度百分比 */
  const progress = computed(() => {
    if (fileContent.value.length === 0) return 0
    return Math.min(100, Math.round((cursor.value / fileContent.value.length) * 100))
  })

  // ============================================================
  // 核心方法
  // ============================================================

  /**
   * 返回当前需要渲染的文本块。
   * 由于前端通过 DOM 测算真实可见字符，这里只需返回足够覆盖一屏的文本（例如5000字符），
   * 溢出部分会被 CSS 的 overflow: hidden 裁剪。
   */
  function getPageText(): string {
    if (!fileContent.value) return '右键点击打开 TXT 文件开始阅读...'
    return fileContent.value.slice(cursor.value, cursor.value + 5000)
  }

  /**
   * 向后翻页
   * @param visibleChars 当前页面实际可见的字符数
   */
  function nextPage(visibleChars: number): void {
    if (!fileContent.value || visibleChars <= 0) return

    const newCursor = cursor.value + visibleChars
    if (newCursor >= fileContent.value.length) return // 已经到底了

    cursorHistory.value.push(cursor.value)
    cursor.value = newCursor

    syncToStore('cursor', cursor.value)
  }

  /**
   * 向前翻页
   * @param visibleChars 当前页面实际可见的字符数（用于历史为空时的估算）
   */
  function prevPage(visibleChars: number): void {
    if (!fileContent.value || cursor.value === 0) return

    if (cursorHistory.value.length > 0) {
      cursor.value = cursorHistory.value.pop()!
    } else {
      // 若没有历史记录（例如调整了窗口），则使用当前可见字数作为估算回退
      const step = visibleChars > 0 ? visibleChars : 500
      cursor.value = Math.max(0, cursor.value - step)
    }

    syncToStore('cursor', cursor.value)
  }

  /**
   * 打开并加载文件
   */
  async function openFile(): Promise<boolean> {
    const path = await window.api.openFile()
    if (!path) return false

    const result = await window.api.readFile(path)
    if (!result.success) {
      console.error('读取文件失败:', result.error)
      return false
    }

    // 更新状态
    filePath.value = path
    fileContent.value = result.content
    cursor.value = 0

    // 持久化
    syncToStore('filePath', path)
    syncToStore('cursor', 0)

    return true
  }

  /**
   * 从 electron-store 恢复上次的状态
   */
  async function restoreFromStore(): Promise<void> {
    const all = (await window.api.getAllStore()) as Record<string, unknown>

    fontSize.value = (all.fontSize as number) || 14
    fontColor.value = (all.fontColor as string) || '#333333'
    bgColor.value = (all.bgColor as string) || '#ffffff'
    shortcutPrev.value = (all.shortcutPrev as string) || 'ArrowUp'
    shortcutNext.value = (all.shortcutNext as string) || 'ArrowDown'

    const savedPath = (all.filePath as string) || ''
    const savedCursor = (all.cursor as number) || 0

    // 如果有上次打开的文件，尝试重新加载
    if (savedPath) {
      const result = await window.api.readFile(savedPath)
      if (result.success) {
        filePath.value = savedPath
        fileContent.value = result.content
        // 恢复 cursor，但不超过文件长度
        cursor.value = Math.min(savedCursor, result.content.length)
      }
    }

    // 监听来自其他窗口的配置变更
    window.api.onStoreChange(async (key, value) => {
      if (key === 'fontSize' && fontSize.value !== value) fontSize.value = value as number
      if (key === 'fontColor' && fontColor.value !== value) fontColor.value = value as string
      if (key === 'bgColor' && bgColor.value !== value) bgColor.value = value as string
      if (key === 'cursor' && cursor.value !== value) cursor.value = value as number
      if (key === 'shortcutPrev' && shortcutPrev.value !== value) shortcutPrev.value = value as string
      if (key === 'shortcutNext' && shortcutNext.value !== value) shortcutNext.value = value as string
      if (key === 'filePath') {
        const path = value as string
        filePath.value = path
        if (path) {
          const result = await window.api.readFile(path)
          if (result.success) {
            fileContent.value = result.content
          }
        } else {
          fileContent.value = ''
        }
      }
    })
  }

  function setShortcutPrev(key: string): void {
    shortcutPrev.value = key
    syncToStore('shortcutPrev', key)
  }

  function setShortcutNext(key: string): void {
    shortcutNext.value = key
    syncToStore('shortcutNext', key)
  }

  /**
   * 更新字体大小
   */
  function setFontSize(size: number): void {
    fontSize.value = Math.max(10, Math.min(32, size))
    syncToStore('fontSize', fontSize.value)
  }

  /**
   * 更新字体颜色
   */
  function setFontColor(color: string): void {
    fontColor.value = color
    syncToStore('fontColor', color)
  }

  /**
   * 更新背景颜色
   */
  function setBgColor(color: string): void {
    bgColor.value = color
    syncToStore('bgColor', color)
  }

  // ============================================================
  // 工具函数
  // ============================================================

  /** 将值同步到 electron-store */
  function syncToStore(key: string, value: unknown): void {
    window.api.setStore(key, value)
  }

  return {
    // 状态
    filePath,
    fileContent,
    cursor,
    fontSize,
    fontColor,
    bgColor,
    shortcutPrev,
    shortcutNext,
    // 计算属性
    hasFile,
    progress,
    // 方法
    getPageText,
    nextPage,
    prevPage,
    openFile,
    restoreFromStore,
    setFontSize,
    setFontColor,
    setBgColor,
    setShortcutPrev,
    setShortcutNext
  }
})
