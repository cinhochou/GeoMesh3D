import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Circle3 } from '../../../geometry/Circle3'

export function createDeleteCircleCommand(
  scene: Scene,
  circle: Circle3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteCircleCommand', scene, () => {
    if (circle.isNormalCircle()) {
      circle.p1.circleId = null
      circle.p1.circleRole = null
    } else {
      const centerPoint = [...scene.points.values()].find(
        (p) => p.circleId === circle.id && p.circleRole === 'center',
      ) ?? null
      if (centerPoint) {
        const isReferenced = isPointReferencedByOtherGeometry(scene, centerPoint.id, circle.id)
        if (isReferenced) {
          centerPoint.circleId = null
          centerPoint.circleRole = null
        } else {
          scene.points.delete(centerPoint.id)
          scene.selection.points.delete(centerPoint.id)
        }
      }
    }
    scene.circles.delete(circle.id)
    scene.selection.circles.delete(circle.id)
  })

  cmd.executeAndCapture()
  return cmd
}

function isPointReferencedByOtherGeometry(scene: Scene, pointId: string, excludeCircleId: string): boolean {
  for (const line of scene.lines.values()) {
    if (line.p1.id === pointId || line.p2.id === pointId) return true
  }
  for (const ray of scene.rays.values()) {
    if (ray.p1.id === pointId || ray.p2.id === pointId) return true
  }
  for (const vec of scene.vectors.values()) {
    if (vec.p1.id === pointId || vec.p2.id === pointId) return true
  }
  for (const sl of scene.straightLines.values()) {
    if (sl.p1.id === pointId || sl.p2.id === pointId) return true
  }
  for (const circle of scene.circles.values()) {
    if (circle.id !== excludeCircleId &&
      (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId)) return true
  }
  for (const face of scene.faces.values()) {
    if (face.includesPoint(pointId)) return true
  }
  return false
}
