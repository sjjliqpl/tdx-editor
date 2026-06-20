import { useEffect, useState } from 'react'

const AUTOSAVE_DELAY = 600
const AUTOSAVE_KEY = 'tdx-editor-autosave'

export function readAutoSave(fallback: string): string {
  if (typeof localStorage === 'undefined') return fallback
  return localStorage.getItem(AUTOSAVE_KEY) || fallback
}

export function useAutoSave(content: string) {
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(AUTOSAVE_KEY, content)
      setSavedAt(new Date())
    }, AUTOSAVE_DELAY)

    return () => window.clearTimeout(timer)
  }, [content])

  return savedAt
}
