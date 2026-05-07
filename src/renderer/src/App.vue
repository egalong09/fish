<script setup lang="ts">
/**
 * App.vue — 阅读器主界面
 *
 * 功能概览：
 * 1. 无滚动条的纯文本显示区域，根据窗口高度自适应行数
 * 2. 左右方向键翻页
 * 3. 禁用默认右键菜单，自定义右键菜单（打开文件/字体大小/颜色设置）
 * 4. 窗口可拖拽移动（-webkit-app-region: drag）
 */

import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { useReaderStore } from './store/reader'

const store = useReaderStore()

// ============================================================
// 文本渲染区域
// ============================================================
const readerRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)

const availableHeight = ref(window.innerHeight)

/** 当前页面要显示的文本 */
const displayText = computed(() => {
  return store.getPageText()
})

/** 通过 DOM 精确测算当前可视区域容纳了多少字符 */
function getVisibleCharCount(container: HTMLElement | null): number {
  if (!container) return 0
  const pre = container.querySelector('pre')
  if (!pre || !pre.firstChild) return 0

  const textNode = pre.firstChild
  const totalLen = textNode.textContent?.length || 0
  if (totalLen === 0) return 0

  const maxBottom = container.getBoundingClientRect().bottom

  let low = 0
  let high = totalLen - 1
  let result = totalLen

  const range = document.createRange()

  while (low <= high) {
    const mid = Math.floor((low + high) / 2)
    try {
      range.setStart(textNode, mid)
      range.setEnd(textNode, mid + 1)
      const rect = range.getBoundingClientRect()
      
      // rect.bottom > maxBottom 意味着该字符已经超出了可视区域底部
      if (rect.bottom > maxBottom) {
        high = mid - 1
      } else {
        result = mid + 1 // 记录当前能够完全显示的最大字符数
        low = mid + 1
      }
    } catch (e) {
      break
    }
  }
  return result
}

/** 进度文本（右下角显示） */
const progressText = computed(() => {
  if (!store.hasFile) return ''
  return `${store.progress}%`
})

// 本地不再直接监听按键翻页，全部由主进程的 globalShortcut 接管分发

// ============================================================
// 是否为独立菜单窗口
// ============================================================
const url = new URL(window.location.href)
const isMenuMode = url.searchParams.get('mode') === 'menu'

// ============================================================
// 右键菜单 (主窗口调用)
// ============================================================
/** 禁用默认右键，通知主进程在鼠标位置打开独立菜单窗口 */
function handleContextMenu(e: MouseEvent): void {
  e.preventDefault()
  if (isMenuMode) return
  // 使用屏幕坐标打开独立窗口
  window.api.showMenu(e.screenX, e.screenY)
}

/** 点击隐藏菜单 */
function handleClick(): void {
  if (!isMenuMode) {
    window.api.hideMenu()
  }
}

// ============================================================
// 菜单操作 (菜单窗口调用)
// ============================================================

/** 打开文件 */
async function handleOpenFile(): Promise<void> {
  await window.api.hideMenu()
  await store.openFile()
}

/** 字体大小变更 */
function handleFontSizeChange(e: Event): void {
  const target = e.target as HTMLInputElement
  const size = Number(target.value)
  store.setFontSize(size)
  // 同步更新窗口最小尺寸：能显示一个字即可
  window.api.setMinSize(size + 8, size * 1.8 + 4)
}

/** 背景颜色变更 */
function handleBgColorChange(e: Event): void {
  const target = e.target as HTMLInputElement
  store.setBgColor(target.value)
}

/** 字体颜色变更 */
function handleFontColorChange(e: Event): void {
  const target = e.target as HTMLInputElement
  store.setFontColor(target.value)
}

/** 格式化组合键为 Electron globalShortcut 支持的格式 */
function formatShortcut(e: KeyboardEvent): string {
  const keys: string[] = []
  if (e.ctrlKey || e.metaKey) keys.push('CommandOrControl')
  if (e.altKey) keys.push('Alt')
  if (e.shiftKey) keys.push('Shift')

  const keyMap: Record<string, string> = {
    'ArrowUp': 'Up',
    'ArrowDown': 'Down',
    'ArrowLeft': 'Left',
    'ArrowRight': 'Right',
    ' ': 'Space',
    'Enter': 'Return'
  }

  let keyName = keyMap[e.key] || e.key
  // Electron 要求字母为大写
  if (keyName.length === 1) {
    keyName = keyName.toUpperCase()
  }
  keys.push(keyName)
  
  return keys.join('+')
}

const ignoreKeys = ['Control', 'Alt', 'Shift', 'Meta', 'Process']

/** 设置上一页快捷键 */
function handleSetShortcutPrev(e: KeyboardEvent): void {
  if (ignoreKeys.includes(e.key)) return
  store.setShortcutPrev(formatShortcut(e))
}

/** 设置下一页快捷键 */
function handleSetShortcutNext(e: KeyboardEvent): void {
  if (ignoreKeys.includes(e.key)) return
  store.setShortcutNext(formatShortcut(e))
}

/** 退出应用 */
function handleQuit(): void {
  window.api.quitApp()
}

// ============================================================
// 窗口 resize 时重新渲染
// ============================================================
function handleResize(): void {
  availableHeight.value = readerRef.value?.clientHeight || window.innerHeight
}

// ============================================================
// 生命周期
// ============================================================
onMounted(async () => {
  // 从 electron-store 恢复上次状态
  await store.restoreFromStore()

  // 监听来自主进程的全局快捷键动作
  window.api.onAction((action) => {
    if (isMenuMode) return
    if (action === 'prevPage') {
      store.prevPage(getVisibleCharCount(readerRef.value))
    } else if (action === 'nextPage') {
      store.nextPage(getVisibleCharCount(readerRef.value))
    }
  })

  // 注册全局事件
  window.addEventListener('resize', handleResize)

  // 初始化高度
  availableHeight.value = readerRef.value?.clientHeight || window.innerHeight

  if (isMenuMode) {
    nextTick(() => {
      if (menuRef.value) {
        // Add 2px to prevent fractional pixel overflow causing scrollbars
        window.api.setMenuSize(200, menuRef.value.scrollHeight + 2)
      }
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
})
</script>

<template>
  <template v-if="!isMenuMode">
    <!-- 阅读器主容器：可拖拽，自定义背景色 -->
    <div
      class="reader-container"
      :style="{
        backgroundColor: store.bgColor,
        color: store.fontColor,
        fontSize: store.fontSize + 'px'
      }"
      @contextmenu="handleContextMenu"
      @click="handleClick"
    >
      <!-- 文本显示区域 -->
      <div
        ref="readerRef"
        class="reader-content"
        :style="{ lineHeight: store.fontSize * 1.8 + 'px' }"
      >
        <pre class="reader-text">{{ displayText }}</pre>
      </div>

      <!-- 进度指示器（右下角） -->
      <div v-if="store.hasFile" class="progress-indicator">
        {{ progressText }}
      </div>
    </div>
  </template>

  <template v-else>
    <!-- 独立的右键菜单容器 -->
    <div class="context-menu" ref="menuRef" @contextmenu.prevent>
      <!-- 开发人员信息 -->
      <div class="menu-item">
        摸鱼神器@EGALong
      </div>
      <div class="menu-divider"></div>
      
      <!-- 打开文件 -->
      <div class="menu-item" @click="handleOpenFile">
        📂 打开文件
      </div>

      <div class="menu-divider"></div>

      <!-- 字体大小 -->
      <div class="menu-item menu-item--setting">
        <label>字号</label>
        <input
          type="range"
          min="10"
          max="32"
          :value="store.fontSize"
          @input="handleFontSizeChange"
        />
        <span class="size-label">{{ store.fontSize }}px</span>
      </div>

      <div class="menu-divider"></div>

      <!-- 背景颜色 -->
      <div class="menu-item menu-item--setting">
        <label>背景</label>
        <input
          type="color"
          :value="store.bgColor"
          @input="handleBgColorChange"
        />
      </div>

      <!-- 字体颜色 -->
      <div class="menu-item menu-item--setting">
        <label>字色</label>
        <input
          type="color"
          :value="store.fontColor"
          @input="handleFontColorChange"
        />
      </div>

      <div class="menu-divider"></div>

      <!-- 快捷键设置 -->
      <div class="menu-item menu-item--setting">
        <label>上一页</label>
        <input
          type="text"
          class="shortcut-input"
          :value="store.shortcutPrev"
          @keydown.prevent="handleSetShortcutPrev"
          readonly
        />
      </div>
      <div class="menu-item menu-item--setting">
        <label>下一页</label>
        <input
          type="text"
          class="shortcut-input"
          :value="store.shortcutNext"
          @keydown.prevent="handleSetShortcutNext"
          readonly
        />
      </div>

      <div class="menu-divider"></div>

      <!-- 退出应用 -->
      <div class="menu-item menu-item--danger" @click="handleQuit">
        ❌ 退出应用
      </div>
    </div>
  </template>
</template>

<style scoped>
/* ============================================================
   阅读器主容器
   ============================================================ */
.reader-container {
  width: 100vw;
  height: 100vh;
  position: relative;
  overflow: visible; /* 不裁切右键菜单 */
  user-select: none;
  border-radius: 6px; /* 配合透明背景，窗口可以有圆角 */
  -webkit-app-region: drag; /* 原生窗口拖拽 */
}

/* ============================================================
   文本显示区域
   ============================================================ */
.reader-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  padding: 2px 4px;
  box-sizing: border-box;
  overflow: hidden;
}

.reader-text {
  margin: 0;
  padding: 0;
  font-family: 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', sans-serif;
  white-space: pre-wrap;
  word-break: break-all;
  cursor: default;
}

/* ============================================================
   进度指示器
   ============================================================ */
.progress-indicator {
  position: absolute;
  right: 8px;
  bottom: 4px;
  z-index: 2;
  font-size: 11px;
  opacity: 0.4;
  pointer-events: none;
}

/* ============================================================
   自定义右键菜单 (作为独立窗口的根元素)
   ============================================================ */
.context-menu {
  width: 100vw;
  min-height: 100vh;
  height: max-content;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid #e0e0e0;
  border-radius: 8px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  padding: 8px 0;
  backdrop-filter: blur(12px);
  user-select: none;
  overflow: hidden;
}

.menu-item {
  padding: 8px 16px;
  cursor: pointer;
  font-size: 13px;
  color: #333;
  transition: background-color 0.15s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.menu-item:hover {
  background-color: rgba(0, 120, 215, 0.08);
}

.menu-item--setting {
  cursor: default;
}
.menu-item--setting:hover {
  background-color: transparent;
}

.menu-item--setting label {
  min-width: 32px;
  font-size: 12px;
  color: #666;
}

.menu-item--setting input[type='range'] {
  flex: 1;
  height: 4px;
  cursor: pointer;
  accent-color: #0078d7;
}

.menu-item--setting input[type='color'] {
  width: 28px;
  height: 28px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0;
  cursor: pointer;
  background: none;
}

.size-label {
  font-size: 11px;
  color: #999;
  min-width: 36px;
  text-align: right;
}

.menu-divider {
  height: 1px;
  background: #eee;
  margin: 4px 12px;
}

.menu-item--danger {
  color: #e53935;
}
.menu-item--danger:hover {
  background-color: rgba(229, 57, 53, 0.08);
}

/* ============================================================
   菜单动画
   ============================================================ */
.menu-fade-enter-active {
  transition: all 0.15s ease-out;
}
.menu-fade-leave-active {
  transition: all 0.1s ease-in;
}
.menu-fade-enter-from {
  opacity: 0;
  transform: scale(0.95);
}
.menu-fade-leave-to {
  opacity: 0;
  transform: scale(0.95);
}

.shortcut-input {
  flex: 1;
  width: 60px;
  height: 24px;
  border: 1px solid #ddd;
  border-radius: 4px;
  padding: 0 4px;
  font-size: 12px;
  text-align: center;
  background: #f9f9f9;
  cursor: pointer;
  color: #333;
}
.shortcut-input:focus {
  border-color: #0078d7;
  outline: none;
  background: #fff;
}
</style>
