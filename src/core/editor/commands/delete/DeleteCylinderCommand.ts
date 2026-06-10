import { SnapshotCommand } from '../SnapshotCommand'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Scene } from '../../../scene/Scene'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteCylinderCommand(
  scene: Scene,
  cylinder: Cylinder3,
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteCylinderCommand', scene, () => {
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    if (cylinder.normalCircleId) {
      const bottomCircle = scene.circles.get(cylinder.normalCircleId) ?? null
      if (bottomCircle) {
        scene.circles.delete(bottomCircle.id)
        scene.selection.circles.delete(bottomCircle.id)
        bottomCircle.p1.circleId = null
        bottomCircle.p1.circleRole = null
      }
    }
    if (cylinder.topNormalCircleId) {
      const topCircle = scene.circles.get(cylinder.topNormalCircleId) ?? null
      if (topCircle) {
        scene.circles.delete(topCircle.id)
        scene.selection.circles.delete(topCircle.id)
        topCircle.p1.circleId = null
        topCircle.p1.circleRole = null
      }
    }
    scene.removeCylinder(cylinder.id)
    cylinder.bottomCenterPoint.cylinderId = null
    cylinder.bottomCenterPoint.cylinderRole = null
    cylinder.topCenterPoint.cylinderId = null
    cylinder.topCenterPoint.cylinderRole = null
  })

  cmd.executeAndCapture()
  return cmd
}
