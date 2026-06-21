export type EditorDocument = {
  id: string
  fileName: string
  filePath?: string
  draftKey?: string
  content: string
  dirty: boolean
  lastSavedContent: string
  savedAt: Date | null
}

export type OpenedFile = {
  fileName: string
  filePath?: string
  draftKey?: string
  content: string
  dirty?: boolean
}

export type SaveResult = {
  fileName: string
  filePath?: string
  savedAt: Date
}

export type DraftPayload = {
  id: string
  fileName: string
  filePath?: string
  draftKey?: string
  content: string
  dirty: boolean
}

export type NewWindowInput = {
  filePath?: string
  content?: string
}

export type DesktopCommand =
  | 'new'
  | 'open'
  | 'save'
  | 'saveAs'
  | 'close'
  | 'toggleTheme'
  | 'loadSample'

export type DesktopOpenPathPayload = {
  path: string
}

export type FilePlatform = {
  isDesktop: boolean
  openFiles: () => Promise<OpenedFile[]>
  openPath: (path: string) => Promise<OpenedFile>
  save: (doc: EditorDocument) => Promise<SaveResult>
  saveAs: (doc: EditorDocument) => Promise<SaveResult | null>
  newWindow: (input?: NewWindowInput) => Promise<void>
}
