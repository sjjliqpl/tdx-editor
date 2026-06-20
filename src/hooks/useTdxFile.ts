import { useCallback, useEffect, useRef, useState } from 'react'

type FilePickerWindow = Window &
  typeof globalThis & {
    showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]>
    showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle>
  }

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

export function useTdxFile(content: string, onContentChange: (value: string) => void) {
  const [fileName, setFileName] = useState('Untitled.tdx')
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null)
  const contentRef = useRef(content)

  useEffect(() => {
    contentRef.current = content
  }, [content])

  const openFile = useCallback(async () => {
    const pickerWindow = window as FilePickerWindow

    if (pickerWindow.showOpenFilePicker) {
      const [handle] = await pickerWindow.showOpenFilePicker({
        types: [{ description: 'TDX files', accept: fileAccept }],
        multiple: false,
      })
      const file = await handle.getFile()
      onContentChange(await file.text())
      setFileName(file.name)
      setFileHandle(handle)
      return
    }

    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.tdx,.txt,text/plain'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      onContentChange(await file.text())
      setFileName(file.name)
      setFileHandle(null)
    }
    input.click()
  }, [onContentChange])

  const saveAs = useCallback(async () => {
    const pickerWindow = window as FilePickerWindow

    if (pickerWindow.showSaveFilePicker) {
      const handle = await pickerWindow.showSaveFilePicker({
        suggestedName: fileName.endsWith('.tdx') ? fileName : `${fileName}.tdx`,
        types: [{ description: 'TDX files', accept: fileAccept }],
      })
      const writable = await handle.createWritable()
      await writable.write(contentRef.current)
      await writable.close()
      setFileName(handle.name)
      setFileHandle(handle)
      return
    }

    fallbackDownload(fileName, contentRef.current)
  }, [fileName])

  const save = useCallback(async () => {
    if (!fileHandle) {
      await saveAs()
      return
    }

    const writable = await fileHandle.createWritable()
    await writable.write(contentRef.current)
    await writable.close()
  }, [fileHandle, saveAs])

  const newFile = useCallback(
    (value: string) => {
      onContentChange(value)
      setFileName('Untitled.tdx')
      setFileHandle(null)
    },
    [onContentChange],
  )

  return {
    fileName,
    hasFileHandle: Boolean(fileHandle),
    newFile,
    openFile,
    save,
    saveAs,
  }
}
