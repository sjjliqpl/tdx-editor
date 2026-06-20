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
import { readAutoSave, useAutoSave } from './hooks/useAutoSave'
import { useTdxFile } from './hooks/useTdxFile'
import { initialTdx } from './tdx/sample'

type Theme = 'dark' | 'light'
const THEME_OVERRIDE_STORAGE_KEY = 'tdx-editor-theme-override'

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

function App() {
  const [content, setContent] = useState(() => readAutoSave(initialTdx))
  const [themeOverride, setThemeOverride] = useState<Theme | null>(() => {
    if (typeof localStorage === 'undefined') return null
    const stored = localStorage.getItem(THEME_OVERRIDE_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  })
  const [systemThemeValue, setSystemThemeValue] = useState<Theme>(() => systemTheme())
  const [problemsOpen, setProblemsOpen] = useState(true)
  const [statusMessage, setStatusMessage] = useState('就绪')
  const editorRef = useRef<TdxCodeEditorHandle>(null)

  const savedAt = useAutoSave(content)
  const file = useTdxFile(content, setContent)

  const parsed = useMemo(() => parseTdx(content), [content])
  const diagnostics = useMemo(() => lintTdx(content), [content])
  const summary = useMemo(() => diagnosticSummary(diagnostics), [diagnostics])
  const lines = useMemo(() => content.split('\n').length, [content])
  const theme = themeOverride || systemThemeValue

  useEffect(() => {
    document.documentElement.dataset.theme = theme
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

  const runAction = useCallback(async (action: () => Promise<void>, message: string) => {
    try {
      await action()
      setStatusMessage(message)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setStatusMessage(error instanceof Error ? error.message : '操作失败')
    }
  }, [])

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.key.toLowerCase() === 's' && event.shiftKey) {
        event.preventDefault()
        void runAction(file.saveAs, '已另存文件')
      } else if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        void runAction(file.save, '已保存文件')
      } else if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        void runAction(file.openFile, '已打开文件')
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [file.openFile, file.save, file.saveAs, runAction])

  const loadSample = useCallback(() => {
    setContent(initialTdx)
    setStatusMessage('已载入示例公式')
  }, [])

  const createNewFile = useCallback(() => {
    file.newFile('')
    setStatusMessage('已新建空白公式')
  }, [file])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">TDX</span>
          <div>
            <strong>TDX Editor</strong>
            <span>{file.fileName}</span>
          </div>
        </div>

        <nav className="toolbar" aria-label="文件操作">
          <ToolbarButton label="新建" title="新建 TDX 文件" onClick={createNewFile}>
            <FilePlus2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="打开" title="打开 .tdx 文件" onClick={() => void runAction(file.openFile, '已打开文件')}>
            <FolderOpen size={15} />
          </ToolbarButton>
          <ToolbarButton label="保存" title="保存 Cmd/Ctrl+S" onClick={() => void runAction(file.save, '已保存文件')}>
            <Save size={15} />
          </ToolbarButton>
          <ToolbarButton label="另存" title="另存为 Cmd/Ctrl+Shift+S" onClick={() => void runAction(file.saveAs, '已另存文件')}>
            <Download size={15} />
          </ToolbarButton>
          <ToolbarButton label="示例" title="载入示例公式" onClick={loadSample}>
            <Play size={15} />
          </ToolbarButton>
        </nav>

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
        <TdxCodeEditor ref={editorRef} value={content} onChange={setContent} />
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
                const position = lineColumn(content, item.range.start.offset)
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
        </div>
        <div>
          <span>{parsed.symbols.length} 符号</span>
          <span>{lines} 行</span>
          <span>{content.length.toLocaleString()} 字符</span>
          <span>UTF-8</span>
        </div>
      </footer>
    </div>
  )
}

export default App
