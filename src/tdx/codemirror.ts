import { autocompletion, type Completion, type CompletionContext } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { bracketMatching, foldGutter, indentOnInput } from '@codemirror/language'
import { linter, lintGutter, lintKeymap, type Diagnostic } from '@codemirror/lint'
import { searchKeymap } from '@codemirror/search'
import { EditorState, RangeSetBuilder, type Extension, type RangeSet } from '@codemirror/state'
import {
  Decoration,
  EditorView,
  GutterMarker,
  ViewPlugin,
  drawSelection,
  dropCursor,
  gutter,
  highlightActiveLine,
  highlightActiveLineGutter,
  hoverTooltip,
  keymap,
  lineNumbers,
  rectangularSelection,
  type DecorationSet,
  type Tooltip,
  type ViewUpdate,
} from '@codemirror/view'
import {
  collectColors,
  getCompletions,
  getHover,
  lintTdx,
  parseTdx,
  type ParsedDocument,
  type TdxCompletion,
  type Token,
  type TokenKind,
} from '@tdx/language'

const tokenClassByKind: Record<TokenKind, string> = {
  comment: 'tdx-token-comment',
  string: 'tdx-token-string',
  marketReference: 'tdx-token-market-reference',
  periodReference: 'tdx-token-period-reference',
  number: 'tdx-token-number',
  identifier: 'tdx-token-identifier',
  assignmentName: 'tdx-token-assignment-name',
  outputName: 'tdx-token-output-name',
  builtinField: 'tdx-token-builtin-field',
  builtinFunction: 'tdx-token-builtin-function',
  drawFunction: 'tdx-token-draw-function',
  financeFunction: 'tdx-token-finance-function',
  level2Function: 'tdx-token-level2-function',
  keyword: 'tdx-token-keyword',
  operator: 'tdx-token-operator',
  punctuation: 'tdx-token-punctuation',
  drawProperty: 'tdx-token-draw-property',
  colorConstant: 'tdx-token-color-constant',
  error: 'tdx-token-error',
}

const completionTypeByKind: Record<TdxCompletion['kind'], Completion['type']> = {
  field: 'variable',
  function: 'function',
  drawFunction: 'function',
  property: 'property',
  color: 'constant',
  variable: 'variable',
}

const completionBoostByKind: Record<TdxCompletion['kind'], number> = {
  variable: 120,
  function: 90,
  field: 80,
  drawFunction: 70,
  property: 50,
  color: 40,
}

function documentText(state: EditorState): string {
  return state.doc.toString()
}

function parseState(state: EditorState): ParsedDocument {
  return parseTdx(documentText(state))
}

function buildDecorations(doc: string): DecorationSet {
  const parsed = parseTdx(doc)
  const builder = new RangeSetBuilder<Decoration>()

  for (const token of parsed.tokens) {
    const from = token.offset
    const to = token.offset + token.length
    if (from === to) continue

    builder.add(
      from,
      to,
      Decoration.mark({
        class: ['tdx-token', tokenClassByKind[token.kind]].join(' '),
      }),
    )
  }

  return builder.finish()
}

const tdxHighlightPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(documentText(view.state))
    }

    update(update: ViewUpdate) {
      if (update.docChanged) {
        this.decorations = buildDecorations(documentText(update.state))
      }
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
  },
)

class ColorGutterMarker extends GutterMarker {
  readonly colors: readonly string[]

  constructor(colors: readonly string[]) {
    super()
    this.colors = colors
  }

  eq(other: GutterMarker): boolean {
    return other instanceof ColorGutterMarker && this.colors.join('|') === other.colors.join('|')
  }

  toDOM(): Node {
    const wrapper = document.createElement('span')
    wrapper.className = 'tdx-color-gutter-stack'
    wrapper.title = this.colors.join(' / ')

    for (const color of this.colors.slice(0, 3)) {
      const swatch = document.createElement('span')
      swatch.className = 'tdx-color-gutter-swatch'
      swatch.style.backgroundColor = color
      wrapper.appendChild(swatch)
    }

    return wrapper
  }
}

function buildColorMarkers(state: EditorState): RangeSet<GutterMarker> {
  const source = documentText(state)
  const parsed = parseTdx(source)
  const colorsByLine = new Map<number, string[]>()

  for (const color of collectColors(parsed)) {
    const line = state.doc.lineAt(color.range.start.offset)
    const colors = colorsByLine.get(line.from) || []
    if (!colors.includes(color.css)) colors.push(color.css)
    colorsByLine.set(line.from, colors)
  }

  const builder = new RangeSetBuilder<GutterMarker>()
  for (const [lineStart, colors] of [...colorsByLine.entries()].sort((a, b) => a[0] - b[0])) {
    builder.add(lineStart, lineStart, new ColorGutterMarker(colors))
  }

  return builder.finish()
}

const colorGutter = gutter({
  class: 'tdx-color-gutter',
  renderEmptyElements: true,
  initialSpacer: () => new ColorGutterMarker(['transparent']),
  markers: (view) => buildColorMarkers(view.state),
  lineMarkerChange: (update) => update.docChanged,
})

function toDiagnosticSeverity(severity: ReturnType<typeof lintTdx>[number]['severity']): Diagnostic['severity'] {
  if (severity === 'error') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

const tdxLintExtension = linter(
  (view) =>
    lintTdx(documentText(view.state)).map((item): Diagnostic => ({
      from: item.range.start.offset,
      to: Math.max(item.range.end.offset, item.range.start.offset + 1),
      severity: toDiagnosticSeverity(item.severity),
      message: item.hint ? `${item.message}\n${item.hint}` : item.message,
      source: item.code,
    })),
  { delay: 250 },
)

function completionDetail(completion: TdxCompletion): string {
  return completion.detail ? completion.detail : completion.kind
}

function completionApply(completion: TdxCompletion): string {
  return completion.insertText || completion.label
}

function tdxCompletionSource(context: CompletionContext) {
  const word = context.matchBefore(/[A-Za-z0-9_%\u4e00-\u9fff]*/)
  if (!word || (word.from === word.to && !context.explicit)) return null

  const options = getCompletions(documentText(context.state)).map((completion): Completion => ({
    label: completion.label,
    type: completionTypeByKind[completion.kind],
    detail: completionDetail(completion),
    info: completion.documentation,
    apply: completionApply(completion),
    boost: completionBoostByKind[completion.kind],
  }))

  return {
    from: word.from,
    options,
    validFor: /^[A-Za-z0-9_%\u4e00-\u9fff]*$/,
  }
}

function tokenAt(parsed: ParsedDocument, position: number): Token | undefined {
  return parsed.tokens.find((token) => {
    const start = token.offset
    const end = token.offset + token.length
    return start <= position && position <= end
  })
}

function hoverDom(token: Token, doc: string): HTMLElement | null {
  const parsed = parseTdx(doc)
  const color = collectColors(parsed).find((item) => item.range.start.offset === token.offset)
  const hover = color
    ? {
        title: color.source,
        body: `TDX 颜色 ${color.css}`,
        color: color.css,
      }
    : (() => {
        const markdown = getHover(token.value)
        if (!markdown) return null
        const [title, ...rest] = markdown
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .split(/\n+/)
          .map((line) => line.trim())
          .filter(Boolean)
        return {
          title: title || token.value,
          body: rest.join('\n'),
          color: undefined,
        }
      })()

  if (!hover) return null

  const root = document.createElement('div')
  root.className = 'tdx-hover'

  const header = document.createElement('div')
  header.className = 'tdx-hover-title'
  if (hover.color) {
    const swatch = document.createElement('span')
    swatch.className = 'tdx-hover-swatch'
    swatch.style.backgroundColor = hover.color
    header.appendChild(swatch)
  }
  header.append(hover.title)
  root.appendChild(header)

  if (hover.body) {
    const body = document.createElement('div')
    body.className = 'tdx-hover-body'
    body.textContent = hover.body
    root.appendChild(body)
  }

  return root
}

const tdxHoverExtension = hoverTooltip((view, pos): Tooltip | null => {
  const doc = documentText(view.state)
  const parsed = parseState(view.state)
  const token = tokenAt(parsed, pos)
  if (!token) return null

  const dom = hoverDom(token, doc)
  if (!dom) return null

  return {
    pos: token.offset,
    end: token.offset + token.length,
    above: false,
    create: () => ({ dom }),
  }
})

const tdxEditorTheme = EditorView.theme({
  '&': {
    height: '100%',
    backgroundColor: 'var(--editor-bg)',
    color: 'var(--text-primary)',
    fontSize: '14px',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.72',
  },
  '.cm-content': {
    padding: '18px 0',
    caretColor: 'var(--accent)',
  },
  '.cm-line': {
    padding: '0 14px',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--editor-gutter-bg)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border)',
  },
  '.cm-activeLine': {
    backgroundColor: 'var(--editor-active-line)',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--editor-active-line)',
    color: 'var(--text-primary)',
  },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    backgroundColor: 'var(--selection)',
  },
  '&.cm-focused': {
    outline: 'none',
  },
  '.cm-tooltip': {
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg-elevated)',
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow-lg)',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  '.cm-tooltip-autocomplete': {
    '& > ul': {
      maxHeight: '320px',
      fontFamily: 'var(--font-ui)',
      fontSize: '13px',
    },
    '& li': {
      padding: '4px 8px',
    },
    '& li[aria-selected]': {
      backgroundColor: 'var(--accent-subtle)',
      color: 'var(--text-primary)',
    },
  },
  '.cm-completionDetail': {
    color: 'var(--text-muted)',
    marginLeft: '12px',
  },
  '.cm-diagnostic': {
    whiteSpace: 'pre-line',
  },
  '.tdx-color-gutter': {
    minWidth: '24px',
  },
  '.tdx-color-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
  },
  '.tdx-color-gutter-stack': {
    display: 'inline-flex',
    flexDirection: 'column',
    gap: '2px',
  },
  '.tdx-color-gutter-swatch': {
    width: '13px',
    height: '13px',
    border: '1px solid var(--color-swatch-border)',
    borderRadius: '3px',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
  },
  '.tdx-token-comment': { color: 'var(--syntax-comment)', fontStyle: 'italic' },
  '.tdx-token-string': { color: 'var(--syntax-string)' },
  '.tdx-token-market-reference': { color: 'var(--syntax-market)' },
  '.tdx-token-period-reference': { color: 'var(--syntax-period)', fontWeight: '600' },
  '.tdx-token-number': { color: 'var(--syntax-number)' },
  '.tdx-token-identifier': { color: 'var(--syntax-variable)' },
  '.tdx-token-assignment-name': { color: 'var(--syntax-assignment)', fontWeight: '700' },
  '.tdx-token-output-name': { color: 'var(--syntax-output)', fontWeight: '700' },
  '.tdx-token-builtin-field': { color: 'var(--syntax-field)', fontWeight: '600' },
  '.tdx-token-builtin-function': { color: 'var(--syntax-function)', fontWeight: '600' },
  '.tdx-token-draw-function': { color: 'var(--syntax-draw-function)', fontWeight: '600' },
  '.tdx-token-finance-function': { color: 'var(--syntax-finance-function)', fontWeight: '600' },
  '.tdx-token-level2-function': { color: 'var(--syntax-level2-function)', fontWeight: '600' },
  '.tdx-token-keyword': { color: 'var(--syntax-keyword)', fontWeight: '700' },
  '.tdx-token-operator, .tdx-token-punctuation': { color: 'var(--syntax-operator)' },
  '.tdx-token-draw-property': { color: 'var(--syntax-property)', fontWeight: '600' },
  '.tdx-token-color-constant': { color: 'var(--syntax-color)', fontWeight: '600' },
  '.tdx-token-error': {
    color: 'var(--syntax-error)',
    textDecoration: 'underline wavy currentColor',
  },
})

export const tdxEditorExtensions: Extension[] = [
  colorGutter,
  lineNumbers(),
  foldGutter(),
  lintGutter(),
  highlightActiveLineGutter(),
  history(),
  drawSelection(),
  dropCursor(),
  rectangularSelection(),
  bracketMatching(),
  indentOnInput(),
  highlightActiveLine(),
  tdxHighlightPlugin,
  tdxLintExtension,
  tdxHoverExtension,
  autocompletion({
    override: [tdxCompletionSource],
    activateOnTyping: true,
    maxRenderedOptions: 80,
  }),
  keymap.of([
    indentWithTab,
    ...defaultKeymap,
    ...historyKeymap,
    ...searchKeymap,
    ...lintKeymap,
  ]),
  tdxEditorTheme,
  EditorState.tabSize.of(2),
  EditorView.lineWrapping,
]
