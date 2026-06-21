import type { FilePlatform } from '../types/editor'
import { tauriFilePlatform } from './tauriFilePlatform'
import { webFilePlatform } from './webFilePlatform'

export function isTauriRuntime() {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export const filePlatform: FilePlatform = isTauriRuntime() ? tauriFilePlatform : webFilePlatform

export { getInitialDesktopDocument } from './tauriFilePlatform'
export { createDocumentId, UNTITLED_FILE_NAME } from './shared'
