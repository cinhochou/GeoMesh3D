import { reactive } from 'vue'
import { Scene } from '../scene/Scene'
import { Editor } from './Editor'
import type { Command } from './Command'

type EditorSession = {
  scene: Scene
  editor: Editor
  originalExecuteCommand: (cmd: Command) => void
  originalUndo: () => void
  originalRedo: () => void
}

let session: EditorSession | null = null

export const getEditorSession = (): EditorSession => {
  if (session) return session

  const scene = reactive(new Scene()) as Scene
  const editor = reactive(new Editor(scene)) as Editor

  session = {
    scene,
    editor,
    originalExecuteCommand: editor.executeCommand.bind(editor),
    originalUndo: editor.undo.bind(editor),
    originalRedo: editor.redo.bind(editor),
  }

  return session
}
