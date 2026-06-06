import { reactive } from 'vue'
import { Scene } from '../scene/Scene'
import { Editor } from './Editor'
import type { Command } from './Command'
import { createEmptySerializedScene, importScene } from './SceneSerializer'

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

/**
 * 将编辑器会话重置为空场景 + 清空 undo/redo 栈。
 * 用于会话失效后让编辑器回到初始态。场景和 editor 单例本身保留，避免和 Pinia store
 * 的绑定断开；只重置其内部数据。
 *
 * 注意：调用方需要负责在合适时机通知渲染层刷新（重置只是数据层动作）。
 */
export const resetEditorSession = (): void => {
  if (!session) return
  // 用一个空 SerializedScene 走 importScene 走完所有清理逻辑（清 selection、constraints、所有 Map）
  importScene(session.scene, createEmptySerializedScene())
  session.editor.clearHistory()
}
