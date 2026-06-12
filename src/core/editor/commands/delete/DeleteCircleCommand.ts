import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Circle3 } from '../../../geometry/Circle3'
import { Cone3 } from '../../../geometry/Cone3'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { PerpendicularLine3 } from '../../../geometry/PerpendicularLine3'
import { ParallelLine3 } from '../../../geometry/ParallelLine3'

export function createDeleteCircleCommand(
  scene: Scene,
  circle: Circle3,
  relatedCones: Cone3[] = [],
  relatedCylinders: Cylinder3[] = [],
  relatedPerpendicularLines: PerpendicularLine3[] = [],
  relatedParallelLines: ParallelLine3[] = [],
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteCircleCommand', scene, () => {
    // 先删除依赖该法向圆的圆锥
    relatedCones.forEach((cone) => {
      // 删除圆锥关联的法向圆（可能是另一个法向圆）
      if (cone.normalCircleId) {
        const c = scene.circles.get(cone.normalCircleId)
        if (c) {
          scene.circles.delete(c.id)
          scene.selection.circles.delete(c.id)
          c.p1.circleId = null
          c.p1.circleRole = null
        }
      }
      scene.removeCone(cone.id)
      cone.baseCenterPoint.coneId = null
      cone.baseCenterPoint.coneRole = null
      cone.apexPoint.coneId = null
      cone.apexPoint.coneRole = null
      scene.selection.cones.delete(cone.id)
    })
    // 先删除依赖该法向圆的圆柱
    relatedCylinders.forEach((cylinder) => {
      // 删除圆柱关联的法向圆（包括另一个法向圆）
      if (cylinder.normalCircleId) {
        const c = scene.circles.get(cylinder.normalCircleId)
        if (c) {
          scene.circles.delete(c.id)
          scene.selection.circles.delete(c.id)
          c.p1.circleId = null
          c.p1.circleRole = null
        }
      }
      if (cylinder.topNormalCircleId) {
        const c = scene.circles.get(cylinder.topNormalCircleId)
        if (c) {
          scene.circles.delete(c.id)
          scene.selection.circles.delete(c.id)
          c.p1.circleId = null
          c.p1.circleRole = null
        }
      }
      scene.removeCylinder(cylinder.id)
      cylinder.bottomCenterPoint.cylinderId = null
      cylinder.bottomCenterPoint.cylinderRole = null
      cylinder.topCenterPoint.cylinderId = null
      cylinder.topCenterPoint.cylinderRole = null
      scene.selection.cylinders.delete(cylinder.id)
    })
    relatedPerpendicularLines.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    relatedParallelLines.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
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
