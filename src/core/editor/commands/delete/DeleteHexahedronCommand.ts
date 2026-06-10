import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Line3 } from '../../../geometry/Line3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteHexahedronCommand(
  scene: Scene,
  faces: PlanarPolygon[],
  dependentPoints: Point3[],
  constraint: CubeConstraint,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteHexahedronCommand', scene, () => {
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    scene.removeCubeConstraint(constraint.cubeId)
    faces.forEach((face) => scene.removeFace(face.id))

    const allBoundaryLineIds = new Set(faces.flatMap((face) => face.boundaryLineIds))
    const deletedBoundaryLines = [...allBoundaryLineIds]
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })

    dependentIntersectionPoints.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    dependentPoints.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
  })

  cmd.executeAndCapture()
  return cmd
}
