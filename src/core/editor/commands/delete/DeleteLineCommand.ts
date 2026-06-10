import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Line3 } from '../../../geometry/Line3'
import { Point3 } from '../../../geometry/Point3'
import { IntersectionPointConstraint } from '../../../constraints/IntersectionPointConstraint'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteLineCommand(
  scene: Scene,
  line: Line3,
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }> = [],
  dependentCubes: Array<{
    faces: PlanarPolygon[]
    dependentPoints: Point3[]
    constraint: CubeConstraint
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  dependentFaces: PlanarPolygon[] = [],
  dependentRegularPolygons: Array<{
    face: PlanarPolygon
    constraint: RegularPolygonConstraint
    dependentPoints: Point3[]
    dependentIntersectionPoints: Array<{
      point: Point3
      constraint: IntersectionPointConstraint
    }>
  }> = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteLineCommand', scene, () => {
    dependentCubes.forEach(({ faces, dependentPoints, constraint, dependentIntersectionPoints }) => {
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
    dependentRegularPolygons.forEach(({ face, constraint, dependentPoints, dependentIntersectionPoints }) => {
      dependentIntersectionPoints.forEach(({ point, constraint }) => {
        scene.removeIntersectionConstraint(constraint.pointId)
        scene.points.delete(point.id)
        scene.selection.points.delete(point.id)
      })
      dependentPoints.forEach((point) => {
        scene.points.delete(point.id)
        scene.selection.points.delete(point.id)
      })
      scene.removeRegularPolygonConstraint(constraint.constraintId)
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
    dependentFaces.forEach((face) => {
      scene.removeFace(face.id)
    })
    dependentFaces.forEach((face) => {
      face.boundaryLineIds.forEach((lineId) => {
        if (lineId === line.id) return
        const boundaryLine = scene.lines.get(lineId)
        if (!boundaryLine || !boundaryLine.faceOwned) return
        if (PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, lineId, face.id)) return
        scene.lines.delete(lineId)
        scene.selection.lines.delete(lineId)
      })
    })
    dependentIntersectionPoints.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    scene.lines.delete(line.id)
    scene.selection.lines.delete(line.id)
  })

  cmd.executeAndCapture()
  return cmd
}
