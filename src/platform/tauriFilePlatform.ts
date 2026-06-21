import { invoke } from '@tauri-apps/api/core'
import { open, save } from '@tauri-apps/plugin-dialog'
import type { DraftPayload, EditorDocument, FilePlatform, OpenedFile, SaveResult } from '../types/editor'
import { fileNameFromPath, withTdxExtension } from './shared'

type TauriInitialDocument = {
  file_path?: string | null
  file_name?: string | null
  draft_key?: string | null
  content?: string | null
  dirty?: boolean | null
}

function normalizeTauriFile(file: TauriInitialDocument): OpenedFile {
  const filePath = file.file_path || undefined
  return {
    fileName: file.file_name || (filePath ? fileNameFromPath(filePath) : 'Untitled.tdx'),
    filePath,
    draftKey: file.draft_key || undefined,
    content: file.content || '',
    dirty: Boolean(file.dirty),
  }
}

export async function getInitialDesktopDocument(): Promise<OpenedFile | null> {
  const initial = await invoke<TauriInitialDocument | null>('get_initial_document')
  return initial ? normalizeTauriFile(initial) : null
}

export async function getAssignedDesktopDocument(): Promise<OpenedFile | null> {
  const assigned = await invoke<TauriInitialDocument | null>('get_assigned_document')
  return assigned ? normalizeTauriFile(assigned) : null
}

export async function writeDesktopDraft(draft: DraftPayload) {
  await invoke('write_draft', { draft })
}

export async function clearDesktopDraft(draftKey?: string) {
  await invoke('clear_draft', { draftKey: draftKey || null })
}

export async function setDesktopWindowDirty(dirty: boolean) {
  await invoke('set_window_document_dirty', { dirty })
}

export const tauriFilePlatform: FilePlatform = {
  isDesktop: true,

  async openFiles() {
    const selected = await open({
      title: 'Open TDX File',
      multiple: true,
      filters: [{ name: 'TDX files', extensions: ['tdx', 'txt'] }],
    })
    const paths = Array.isArray(selected) ? selected : selected ? [selected] : []
    if (!paths.length) return []
    await Promise.all(paths.map((filePath) => tauriFilePlatform.newWindow({ filePath })))
    return []
  },

  async openPath(path) {
    const file = await invoke<TauriInitialDocument>('read_tdx_file', { path })
    return normalizeTauriFile(file)
  },

  async save(doc: EditorDocument): Promise<SaveResult> {
    if (!doc.filePath) {
      const saveResult = await tauriFilePlatform.saveAs(doc)
      if (!saveResult) throw new DOMException('Save cancelled', 'AbortError')
      return saveResult
    }

    await invoke('write_tdx_file', { path: doc.filePath, content: doc.content })
    await invoke('set_current_document_path', { path: doc.filePath })
    await clearDesktopDraft(doc.draftKey || doc.filePath)
    return {
      fileName: doc.fileName,
      filePath: doc.filePath,
      savedAt: new Date(),
    }
  },

  async saveAs(doc: EditorDocument): Promise<SaveResult | null> {
    const defaultName = withTdxExtension(doc.fileName)
    const filePath = await save({
      title: 'Save TDX File',
      defaultPath: defaultName,
      filters: [{ name: 'TDX files', extensions: ['tdx', 'txt'] }],
    })
    if (!filePath) return null

    await invoke('write_tdx_file', { path: filePath, content: doc.content })
    await invoke('set_current_document_path', { path: filePath })
    await clearDesktopDraft(doc.draftKey || filePath)
    return {
      fileName: fileNameFromPath(filePath),
      filePath,
      savedAt: new Date(),
    }
  },

  async newWindow(input) {
    await invoke('new_document_window', {
      path: input?.filePath || null,
      content: input?.content || null,
    })
  },
}
