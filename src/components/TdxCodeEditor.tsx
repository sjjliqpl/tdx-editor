import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { tdxEditorExtensions } from '../tdx/codemirror'

type TdxCodeEditorProps = {
  value: string
  onChange: (value: string) => void
}

export type TdxCodeEditorHandle = {
  focusOffset: (offset: number) => void
}

export const TdxCodeEditor = forwardRef<TdxCodeEditorHandle, TdxCodeEditorProps>(function TdxCodeEditor(
  { value, onChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const valueRef = useRef(value)
  const onChangeRef = useRef(onChange)

  useEffect(() => {
    valueRef.current = value
    onChangeRef.current = onChange
  }, [value, onChange])

  useEffect(() => {
    if (!containerRef.current) return

    const view = new EditorView({
      parent: containerRef.current,
      state: EditorState.create({
        doc: valueRef.current,
        extensions: [
          ...tdxEditorExtensions,
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            const next = update.state.doc.toString()
            valueRef.current = next
            onChangeRef.current(next)
          }),
        ],
      }),
    })

    viewRef.current = view

    return () => {
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view || value === view.state.doc.toString()) return
    view.dispatch({
      changes: {
        from: 0,
        to: view.state.doc.length,
        insert: value,
      },
    })
  }, [value])

  useImperativeHandle(
    ref,
    () => ({
      focusOffset: (offset: number) => {
        const view = viewRef.current
        if (!view) return
        const position = Math.max(0, Math.min(offset, view.state.doc.length))
        view.dispatch({
          selection: { anchor: position },
          scrollIntoView: true,
        })
        view.focus()
      },
    }),
    [],
  )

  return <div ref={containerRef} className="editor-host" />
})
