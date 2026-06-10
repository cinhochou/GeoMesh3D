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
    scene.removeCone(cone.id)
    cone.baseCenterPoint.coneId = null
    cone.baseCenterPoint.coneRole = null
    cone.apexPoint.coneId = null
    cone.apexPoint.coneRole = null
  })

  cmd.executeAndCapture()
  return cmd
}
