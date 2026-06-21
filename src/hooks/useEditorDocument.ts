import { useCallback, useEffect, useMemo, useState } from 'react'
import type { EditorDocument, OpenedFile, SaveResult } from '../types/editor'
import { createDocumentId, filePlatform, getInitialDesktopDocument, UNTITLED_FILE_NAME } from '../platform'
import { initialTdx } from '../tdx/sample'
import { readAutoSave, useAutoSave } from './useAutoSave'

function createDocument(file: OpenedFile): EditorDocument {
  const dirty = Boolean(file.dirty)
  return {
    id: createDocumentId(),
    fileName: file.fileName,
    filePath: file.filePath,
    draftKey: file.draftKey,
    content: file.content,
    dirty,
    lastSavedContent: dirty ? '' : file.content,
    savedAt: null,
  }
}

function initialWebDocument(): EditorDocument {
  const content = readAutoSave(initialTdx)
  return createDocument({
    fileName: UNTITLED_FILE_NAME,
    content,
  })
}

function applySaveResult(doc: EditorDocument, result: SaveResult): EditorDocument {
  return {
    ...doc,
    fileName: result.fileName,
    filePath: result.filePath,
    draftKey: undefined,
    dirty: false,
    lastSavedContent: doc.content,
    savedAt: result.savedAt,
  }
}

export function useEditorDocument() {
  const [doc, setDoc] = useState<EditorDocument>(() => initialWebDocument())
  const [loaded, setLoaded] = useState(!filePlatform.isDesktop)
  const [statusMessage, setStatusMessage] = useState('就绪')

  const autoSavedAt = useAutoSave(doc)

  useEffect(() => {
    if (!filePlatform.isDesktop) return

    let cancelled = false

    async function loadInitialDocument() {
      try {
        const initial = await getInitialDesktopDocument()
        if (cancelled) return

        if (initial) {
          setDoc(createDocument(initial))
          setStatusMessage('已打开文件')
        } else {
          setDoc(createDocument({ fileName: UNTITLED_FILE_NAME, content: '' }))
        }
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : '打开文件失败')
        setDoc(createDocument({ fileName: UNTITLED_FILE_NAME, content: '' }))
      } finally {
        if (!cancelled) setLoaded(true)
      }
    }

    void loadInitialDocument()

    return () => {
      cancelled = true
    }
  }, [])

  const setContent = useCallback((content: string) => {
    setDoc((current) => ({
      ...current,
      content,
      dirty: content !== current.lastSavedContent,
    }))
  }, [])

  const newFile = useCallback((content = '') => {
    setDoc(createDocument({ fileName: UNTITLED_FILE_NAME, content }))
  }, [])

  const markSaved = useCallback((result: SaveResult) => {
    setDoc((current) => applySaveResult(current, result))
  }, [])

  const state = useMemo(
    () => ({
      doc,
      loaded,
      statusMessage,
      savedAt: filePlatform.isDesktop ? doc.savedAt || autoSavedAt : autoSavedAt,
    }),
    [autoSavedAt, doc, loaded, statusMessage],
  )

  return {
    ...state,
    setContent,
    setDoc,
    setStatusMessage,
    newFile,
    markSaved,
  }
}
