import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FilePlus2,
  FolderOpen,
  ListChecks,
  Moon,
  Play,
  Save,
  Sun,
} from 'lucide-react'
import { lintTdx, parseTdx, type TdxDiagnostic } from '@tdx/language'
import './App.css'
import { TdxCodeEditor, type TdxCodeEditorHandle } from './components/TdxCodeEditor'
import { useEditorDocument } from './hooks/useEditorDocument'
import { filePlatform } from './platform'
import { getAssignedDesktopDocument, setDesktopWindowDirty } from './platform/tauriFilePlatform'
import { initialTdx } from './tdx/sample'
import type { DesktopCommand, DesktopOpenPathPayload } from './types/editor'

type Theme = 'dark' | 'light'
const THEME_OVERRIDE_STORAGE_KEY = 'tdx-editor-theme-override'
const RECENT_FILES_STORAGE_KEY = 'tdx-editor-recent-files'
const ACTIVE_WINDOW_STORAGE_KEY = 'tdx-editor-active-window-label'

type ToolbarButtonProps = {
  label: string
  title?: string
  onClick: () => void
  children: React.ReactNode
}

function ToolbarButton({ label, title, onClick, children }: ToolbarButtonProps) {
  return (
    <button type="button" className="tool-button" onClick={onClick} title={title || label}>
      {children}
      <span>{label}</span>
    </button>
  )
}

function formatTime(date: Date | null) {
  if (!date) return '等待自动保存'
  return `已自动保存 ${date.toLocaleTimeString('zh-CN', { hour12: false })}`
}

function lineColumn(source: string, offset: number) {
  const before = source.slice(0, offset)
  const lines = before.split('\n')
  return {
    line: lines.length,
    column: lines[lines.length - 1].length + 1,
  }
}

function severityLabel(severity: TdxDiagnostic['severity']) {
  if (severity === 'error') return '错误'
  if (severity === 'warning') return '警告'
  return '提示'
}

function diagnosticSummary(diagnostics: TdxDiagnostic[]) {
  const errors = diagnostics.filter((item) => item.severity === 'error').length
  const warnings = diagnostics.filter((item) => item.severity === 'warning').length
  const infos = diagnostics.filter((item) => item.severity === 'info').length
  return { errors, warnings, infos }
}

function systemTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function persistRecentFile(filePath?: string) {
  if (!filePath || typeof localStorage === 'undefined') return
  const stored = localStorage.getItem(RECENT_FILES_STORAGE_KEY)
  const recent = stored ? (JSON.parse(stored) as string[]) : []
  const next = [filePath, ...recent.filter((path) => path !== filePath)].slice(0, 10)
  localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(next))
}

function App() {
  const {
    doc,
    loaded,
    statusMessage,
    savedAt,
    setContent,
    setStatusMessage,
    newFile,
    markSaved,
  } = useEditorDocument()
  const [themeOverride, setThemeOverride] = useState<Theme | null>(() => {
    if (typeof localStorage === 'undefined') return null
    const stored = localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  })
  const [systemThemeValue, setSystemThemeValue] = useState<Theme>(() => systemTheme())
  const [problemsOpen, setProblemsOpen] = useState(true)
  const editorRef = useRef<TdxCodeEditorHandle>(null)
  const docRef = useRef(doc)
  const allowCloseRef = useRef(false)

  const parsed = useMemo(() => parseTdx(doc.content), [doc.content])
  const diagnostics = useMemo(() => lintTdx(doc.content), [doc.content])
  const summary = useMemo(() => diagnosticSummary(diagnostics), [diagnostics])
  const lines = useMemo(() => doc.content.split('\n').length, [doc.content])
  const theme = themeOverride || systemThemeValue

  useEffect(() => {
    docRef.current = doc
  }, [doc])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    document.documentElement.dataset.platform = filePlatform.isDesktop ? 'desktop' : 'web'
  }, [theme])

  useEffect(() => {
    if (themeOverride) {
      localStorage.setItem(THEME_OVERRIDE_STORAGE_KEY, themeOverride)
    } else {
      localStorage.removeItem(THEME_OVERRIDE_STORAGE_KEY)
    }
  }, [themeOverride])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const updateSystemTheme = () => setSystemThemeValue(media.matches ? 'dark' : 'light')
    updateSystemTheme()
    media.addEventListener('change', updateSystemTheme)
    return () => media.removeEventListener('change', updateSystemTheme)
  }, [])

  const runAction = useCallback(async (action: () => Promise<boolean | void>, message: string) => {
    try {
      const changed = await action()
      if (changed === false) return
      setStatusMessage(message)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatusMessage(error instanceof Error ? error.message : '操作失败')
    }
  }, [setStatusMessage])

  const save = useCallback(async () => {
    const result = await filePlatform.save(docRef.current)
    markSaved(result)
    persistRecentFile(result.filePath)
  }, [markSaved])

  const saveAs = useCallback(async () => {
    const result = await filePlatform.saveAs(docRef.current)
    if (!result) return false
    markSaved(result)
    persistRecentFile(result.filePath)
  }, [markSaved])

  const openFiles = useCallback(async () => {
    const files = await filePlatform.openFiles()
    if (!files.length) return false

    const [first, ...rest] = files
    setContent(first.content)
    markSaved({
      fileName: first.fileName,
      filePath: first.filePath,
      savedAt: new Date(),
    })
    persistRecentFile(first.filePath)
    await Promise.all(rest.map((file) => filePlatform.newWindow({ filePath: file.filePath, content: file.content })))
  }, [markSaved, setContent])

  const openPathInCurrentWindow = useCallback(
    async (path: string) => {
      const opened = await filePlatform.openPath(path)
      setContent(opened.content)
      markSaved({
        fileName: opened.fileName,
        filePath: opened.filePath,
        savedAt: new Date(),
      })
      persistRecentFile(opened.filePath)
    },
    [markSaved, setContent],
  )

  const closeWindow = useCallback(async () => {
    if (filePlatform.isDesktop) {
      const [{ getCurrentWindow }, { confirm }] = await Promise.all([
        import('@tauri-apps/api/window'),
        import('@tauri-apps/plugin-dialog'),
      ])
      if (docRef.current.dirty) {
        const shouldClose = await confirm(`关闭 ${docRef.current.fileName}？未保存的修改会丢失。`, {
          title: '未保存的修改',
          kind: 'warning',
          okLabel: '关闭',
          cancelLabel: '取消',
        })
        if (!shouldClose) return
      }

      allowCloseRef.current = true
      await getCurrentWindow().destroy()
      return
    }
  }, [])

  useEffect(() => {
    if (filePlatform.isDesktop) return

    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.key.toLowerCase() === 's' && event.shiftKey) {
        event.preventDefault()
        void runAction(saveAs, '已另存文件')
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void runAction(save, '已保存文件')
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void runAction(openFiles, '已打开文件')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [openFiles, runAction, save, saveAs])

  const loadSample = useCallback(() => {
    setContent(initialTdx)
    setStatusMessage('已载入示例公式')
  }, [setContent, setStatusMessage])

  const createNewFile = useCallback(() => {
    if (filePlatform.isDesktop) {
      void filePlatform.newWindow()
      return
    }

    newFile('')
    setStatusMessage('已新建空白公式')
  }, [newFile, setStatusMessage])

  const runDesktopCommand = useCallback(
    (command: DesktopCommand) => {
      switch (command) {
        case 'new':
          void runAction(async () => filePlatform.newWindow(), '已新建窗口')
          break
        case 'open':
          void runAction(openFiles, '已打开文件')
          break
        case 'save':
          void runAction(save, '已保存文件')
          break
        case 'saveAs':
          void runAction(saveAs, '已另存文件')
          break
        case 'close':
          void closeWindow()
          break
        case 'toggleProblems':
          setProblemsOpen((open) => !open)
          break
        case 'toggleTheme':
          setThemeOverride((current) => {
            const nextTheme = current || theme
            return nextTheme === 'dark' ? 'light' : 'dark'
          })
          break
        case 'loadSample':
          loadSample()
          break
      }
    },
    [closeWindow, loadSample, openFiles, runAction, save, saveAs, theme],
  )

  useEffect(() => {
    if (!filePlatform.isDesktop) return

    let cleanup = () => {}

    async function bindDesktopEvents() {
      const [{ listen, TauriEvent }, { getCurrentWindow }, { confirm }] = await Promise.all([
        import('@tauri-apps/api/event'),
        import('@tauri-apps/api/window'),
        import('@tauri-apps/plugin-dialog'),
      ])
      const currentWindow = getCurrentWindow()
      const markActiveWindow = () => {
        localStorage.setItem(ACTIVE_WINDOW_STORAGE_KEY, currentWindow.label)
      }
      markActiveWindow()
      const unlistenCommand = await listen<DesktopCommand>('tdx://menu-command', (event) => {
        const activeLabel = localStorage.getItem(ACTIVE_WINDOW_STORAGE_KEY)
        if (activeLabel && activeLabel !== currentWindow.label) return

        void currentWindow.isFocused().then((focused) => {
          if (!activeLabel && !focused) return
          runDesktopCommand(event.payload)
        })
      })
      const unlistenOpenPath = await listen<DesktopOpenPathPayload>('tdx://open-path', (event) => {
        void runAction(() => openPathInCurrentWindow(event.payload.path), '已打开文件')
      })
      const assigned = await getAssignedDesktopDocument()
      if (assigned && assigned.filePath !== docRef.current.filePath) {
        void runAction(() => openPathInCurrentWindow(assigned.filePath!), '已打开文件')
      }
      const unlistenClose = await currentWindow.onCloseRequested(async (event) => {
        if (allowCloseRef.current || !docRef.current.dirty) return
        event.preventDefault()
        const shouldClose = await confirm(`关闭 ${docRef.current.fileName}？未保存的修改会丢失。`, {
          title: '未保存的修改',
          kind: 'warning',
          okLabel: '关闭',
          cancelLabel: '取消',
        })
        if (shouldClose) {
          allowCloseRef.current = true
          await currentWindow.close()
        }
      })
      const unlistenDrop = await currentWindow.onDragDropEvent((event) => {
        if (event.payload.type !== 'drop') return
        event.payload.paths.forEach((filePath) => {
          void filePlatform.newWindow({ filePath })
        })
      })
      const unlistenFocus = await listen<string>(TauriEvent.WINDOW_FOCUS, () => {
        docRef.current = doc
      })
      const unlistenFocusChanged = await currentWindow.onFocusChanged(({ payload: focused }) => {
        if (focused) markActiveWindow()
      })

      cleanup = () => {
        unlistenCommand()
        unlistenOpenPath()
        unlistenClose()
        unlistenDrop()
        unlistenFocus()
        unlistenFocusChanged()
      }
    }

    void bindDesktopEvents()

    return () => cleanup()
  }, [doc, openPathInCurrentWindow, runAction, runDesktopCommand])

  useEffect(() => {
    if (!filePlatform.isDesktop || !loaded) return

    void setDesktopWindowDirty(doc.dirty)
  }, [doc.dirty, loaded])

  useEffect(() => {
    if (!filePlatform.isDesktop || !loaded) return

    async function updateWindowTitle() {
      const { getCurrentWindow } = await import('@tauri-apps/api/window')
      const title = `${doc.dirty ? '● ' : ''}${doc.fileName} - TDX Editor`
      await getCurrentWindow().setTitle(title)
    }

    void updateWindowTitle()
  }, [doc.dirty, doc.fileName, loaded])

  if (!loaded) {
    return <div className="loading-shell">正在载入 TDX Editor...</div>
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">TDX</span>
          <div>
            <strong>TDX Editor</strong>
            <span title={doc.filePath || doc.fileName}>
              {doc.dirty ? '● ' : ''}
              {doc.fileName}
            </span>
          </div>
        </div>

        {!filePlatform.isDesktop && (
          <nav className="toolbar" aria-label="文件操作">
            <ToolbarButton label="新建" title="新建 TDX 文件" onClick={createNewFile}>
              <FilePlus2 size={15} />
            </ToolbarButton>
            <ToolbarButton label="打开" title="打开 .tdx 文件" onClick={() => void runAction(openFiles, '已打开文件')}>
              <FolderOpen size={15} />
            </ToolbarButton>
            <ToolbarButton label="保存" title="保存 Cmd/Ctrl+S" onClick={() => void runAction(save, '已保存文件')}>
              <Save size={15} />
            </ToolbarButton>
            <ToolbarButton label="另存" title="另存为 Cmd/Ctrl+Shift+S" onClick={() => void runAction(saveAs, '已另存文件')}>
              <Download size={15} />
            </ToolbarButton>
            <ToolbarButton label="示例" title="载入示例公式" onClick={loadSample}>
              <Play size={15} />
            </ToolbarButton>
          </nav>
        )}

        <div className="topbar-actions">
          <button
            type="button"
            className="icon-button"
            aria-pressed={problemsOpen}
            title="问题面板"
            onClick={() => setProblemsOpen((open) => !open)}
          >
            <ListChecks size={16} />
            <span>{diagnostics.length}</span>
          </button>
          <button
            type="button"
            className="icon-button"
            title="切换主题"
            onClick={() => setThemeOverride(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
        </div>
      </header>

      <main className="workspace">
        <TdxCodeEditor ref={editorRef} value={doc.content} onChange={setContent} />
      </main>

      {problemsOpen && (
        <aside className="problems-panel" aria-label="问题列表">
          <div className="panel-header">
            <div>
              <strong>问题</strong>
              <span>
                {summary.errors} 错误 · {summary.warnings} 警告 · {summary.infos} 提示
              </span>
            </div>
            <button type="button" onClick={() => setProblemsOpen(false)}>
              关闭
            </button>
          </div>
          {diagnostics.length ? (
            <ul className="problem-list">
              {diagnostics.map((item, index) => {
                const position = lineColumn(doc.content, item.range.start.offset)
                return (
                  <li key={`${item.code}-${item.range.start.offset}-${index}`} className={`problem problem-${item.severity}`}>
                    <AlertCircle size={15} />
                    <button
                      type="button"
                      className="problem-link"
                      onClick={() => editorRef.current?.focusOffset(item.range.start.offset)}
                    >
                      <strong>
                        {severityLabel(item.severity)} · {item.message}
                      </strong>
                      {item.hint && <span>{item.hint}</span>}
                    </button>
                    <code>
                      {position.line}:{position.column}
                    </code>
                  </li>
                )
              })}
            </ul>
          ) : (
            <div className="empty-problems">
              <CheckCircle2 size={17} />
              当前公式没有发现问题
            </div>
          )}
        </aside>
      )}

      <footer className="statusbar">
        <div>
          <span className={summary.errors ? 'status-dot status-error' : 'status-dot'} />
          <span>{statusMessage}</span>
          <span>{formatTime(savedAt)}</span>
          {doc.dirty && <span>未保存</span>}
        </div>
        <div>
          <span>{parsed.symbols.length} 符号</span>
          <span>{lines} 行</span>
          <span>{doc.content.length.toLocaleString()} 字符</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  )
}

export default App
