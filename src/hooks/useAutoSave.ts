import { useEffect, useState } from 'react'
import type { EditorDocument } from '../types/editor'
import { filePlatform } from '../platform'
import { writeDesktopDraft } from '../platform/tauriFilePlatform'

const AUTOSAVE_DELAY = 600
const AUTOSAVE_KEY = 'tdx-editor-autosave'
const DESKTOP_DRAFT_PREFIX = 'tdx-editor-desktop-draft:'

export function readAutoSave(fallback: string): string {
  if (typeof localStorage === 'undefined') return fallback
  return localStorage.getItem(AUTOSAVE_KEY) || fallback
}

function desktopDraftKey(doc: EditorDocument) {
  return `${DESKTOP_DRAFT_PREFIX}${doc.filePath || doc.draftKey || doc.id}`
}

export function useAutoSave(doc: EditorDocument) {
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (filePlatform.isDesktop) {
        void writeDesktopDraft({
          id: doc.id,
          fileName: doc.fileName,
          filePath: doc.filePath,
          draftKey: doc.filePath || doc.draftKey || doc.id,
          content: doc.content,
          dirty: doc.dirty,
        })
        localStorage.setItem(
          desktopDraftKey(doc),
          JSON.stringify({
            fileName: doc.fileName,
            filePath: doc.filePath,
            content: doc.content,
            dirty: doc.dirty,
            savedAt: new Date().toISOString(),
          }),
        )
      } else {
        localStorage.setItem(AUTOSAVE_KEY, doc.content)
      }
      setSavedAt(new Date())
    }, AUTOSAVE_DELAY)

    return () => window.clearTimeout(timer)
  }, [doc])

  return savedAt
}
