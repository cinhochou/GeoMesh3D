import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteFaceCommand(
  scene: Scene,
  face: PlanarPolygon,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteFaceCommand', scene, () => {
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
    scene.removeFace(face.id)

    const deletedBoundaryLines = face.boundaryLineIds
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)
      .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, line.id, face.id))

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })
  })

  cmd.executeAndCapture()
  return cmd
}
