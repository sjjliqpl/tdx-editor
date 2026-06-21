import type { EditorDocument, FilePlatform, OpenedFile, SaveResult } from '../types/editor'
import { ACCEPTED_FILE_EXTENSIONS, UNTITLED_FILE_NAME, withTdxExtension } from './shared'

type FilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
  }

type WebOpenedFile = OpenedFile & {
  handle?: FileSystemFileHandle
}

const fileHandles = new Map<string, FileSystemFileHandle>()

const fileAccept = {
  'text/plain': ['.tdx', '.txt'],
}

function fallbackDownload(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(url)
}

function fileHandleId(fileName: string) {
  return `web:${fileName}`
}

async function openWithFilePicker(): Promise<WebOpenedFile[]> {
  const pickerWindow = window as FilePickerWindow
  if (!pickerWindow.showOpenFilePicker) return []

  const handles = await pickerWindow.showOpenFilePicker({
    types: [{ description: 'TDX files', accept: fileAccept }],
    multiple: true,
  })

  return Promise.all(
    handles.map(async (handle) => {
      const file = await handle.getFile()
      const filePath = fileHandleId(file.name)
      fileHandles.set(filePath, handle)
      return {
        fileName: file.name,
        filePath,
        content: await file.text(),
        handle,
      }
    }),
  )
}

function openWithInput(): Promise<WebOpenedFile[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = ACCEPTED_FILE_EXTENSIONS.map((extension) => `.${extension}`).join(',')
    input.multiple = true
    input.onchange = async () => {
      const files = Array.from(input.files || [])
      const opened = await Promise.all(
        files.map(async (file) => ({
          fileName: file.name,
          content: await file.text(),
        })),
      )
      resolve(opened)
    }
    input.oncancel = () => resolve([])
    input.click()
  })
}

export const webFilePlatform: FilePlatform = {
  isDesktop: false,

  async openFiles() {
    const pickerWindow = window as FilePickerWindow
    if (pickerWindow.showOpenFilePicker) {
      return openWithFilePicker()
    }

    return openWithInput()
  },

  async openPath(path) {
    const handle = fileHandles.get(path)
    if (!handle) {
      throw new Error('浏览器无法重新打开该文件，请从文件选择器中打开。')
    }

    const file = await handle.getFile()
    return {
      fileName: file.name,
      filePath: path,
      content: await file.text(),
    }
  },

  async save(doc: EditorDocument): Promise<SaveResult> {
    const handle = doc.filePath ? fileHandles.get(doc.filePath) : null
    if (!handle) {
      const saveResult = await webFilePlatform.saveAs(doc)
      if (!saveResult) throw new DOMException('Save cancelled', 'AbortError')
      return saveResult
    }

    const writable = await handle.createWritable()
    await writable.write(doc.content)
    await writable.close()
    return {
      fileName: handle.name,
      filePath: doc.filePath,
      savedAt: new Date(),
    }
  },

  async saveAs(doc: EditorDocument): Promise<SaveResult | null> {
    const pickerWindow = window as FilePickerWindow
    const suggestedName = withTdxExtension(doc.fileName || UNTITLED_FILE_NAME)

    if (pickerWindow.showSaveFilePicker) {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName,
        types: [{ description: 'TDX files', accept: fileAccept }],
      })
      const writable = await handle.createWritable()
      await writable.write(doc.content)
      await writable.close()
      const filePath = fileHandleId(handle.name)
      fileHandles.set(filePath, handle)
      return {
        fileName: handle.name,
        filePath,
        savedAt: new Date(),
      }
    }

    fallbackDownload(suggestedName, doc.content)
    return {
      fileName: suggestedName,
      savedAt: new Date(),
    }
  },

  async newWindow() {
    return
  },
}
