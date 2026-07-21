import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'

/**
 * 创建清空场景命令。
 * 使用 SnapshotCommand 后，只需 scene 即可 — 快照自动捕获和恢复所有元素。
 * 保留 points 参数用于 executeFn 中的显式删除逻辑。
 */
export function createClearSceneCommand(
  scene: Scene,
): SnapshotCommand {
  const cmd = new SnapshotCommand('ClearSceneCommand', scene, () => {
    scene.lines.clear()
    scene.straightLines.clear()
    scene.rays.clear()
    scene.vectors.clear()
    scene.circles.clear()
    scene.spheres.clear()
    scene.faces.clear()
    scene.cones.clear()
    scene.cylinders.clear()
    scene.perpendicularLines.clear()
    scene.parallelLines.clear()
    scene.nets.clear()
    // 保留原点，删除其他点
    const pointIds = [...scene.points.keys()].filter((id) => id !== Scene.ORIGIN_ID)
    pointIds.forEach((id) => scene.points.delete(id))
    scene.clearAllConstraints()
    scene.selection.clear()
  })

  cmd.executeAndCapture()
  return cmd
}
