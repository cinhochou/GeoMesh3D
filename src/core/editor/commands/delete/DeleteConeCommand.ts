import { SnapshotCommand } from '../SnapshotCommand'
import { Cone3 } from '../../../geometry/Cone3'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteConeCommand(
  scene: Scene,
  cone: Cone3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteConeCommand', scene, () => {
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    // 删除圆锥关联的法向圆
    if (cone.normalCircleId) {
      const circle = scene.circles.get(cone.normalCircleId)
      if (circle) {
        scene.circles.delete(circle.id)
        scene.selection.circles.delete(circle.id)
        circle.p1.circleId = null
        circle.p1.circleRole = null
      }
    }
    scene.removeCone(cone.id)
    cone.baseCenterPoint.coneId = null
    cone.baseCenterPoint.coneRole = null
    cone.apexPoint.coneId = null
    cone.apexPoint.coneRole = null
  })

  cmd.executeAndCapture()
  return cmd
}
