import type { OpenedFile } from '../types/editor'

export const ACCEPTED_FILE_EXTENSIONS = ['tdx', 'txt']
export const UNTITLED_FILE_NAME = 'Untitled.tdx'

export function createDocumentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `doc-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function fileNameFromPath(path: string) {
  const normalized = path.replace(/\\/g, '/')
  return normalized.split('/').pop() || UNTITLED_FILE_NAME
}

export function withTdxExtension(fileName: string) {
  return /\.(tdx|txt)$/i.test(fileName) ? fileName : `${fileName}.tdx`
}

export function normalizeOpenedFile(file: OpenedFile): OpenedFile {
  return {
    ...file,
    fileName: file.fileName || (file.filePath ? fileNameFromPath(file.filePath) : UNTITLED_FILE_NAME),
  }
}
