import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { StraightLine3 } from '../../../geometry/StraightLine3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteStraightLineCommand(
  scene: Scene,
  line: StraightLine3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteStraightLineCommand', scene, () => {
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    dependentIntersectionPoints.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    scene.straightLines.delete(line.id)
    scene.selection.straightLines.delete(line.id)
  })

  cmd.executeAndCapture()
  return cmd
}
