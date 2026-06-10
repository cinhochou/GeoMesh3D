import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'

/**
 * 合并点的核心逻辑（不含快照捕获）。
 * 供 createMergePointsCommand 和 createMergeCubePointsCommand 共用。
 */
function executeMergePoints(scene: Scene, keepPoint: Point3, removePoint: Point3): void {
  const removeId = removePoint.id
  const keepId = keepPoint.id

  // ─── 线段 ──────────────────────────────────────────
  for (const line of [...scene.lines.values()]) {
    if (line.p1.id === removeId) line.p1 = keepPoint
    if (line.p2.id === removeId) line.p2 = keepPoint
    if (line.p1.id === line.p2.id) {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    }
  }

  // ─── 直线 ──────────────────────────────────────────
  for (const line of [...scene.straightLines.values()]) {
    if (line.p1.id === removeId) line.p1 = keepPoint
    if (line.p2.id === removeId) line.p2 = keepPoint
    if (line.p1.id === line.p2.id) {
      scene.straightLines.delete(line.id)
      scene.selection.straightLines.delete(line.id)
    }
  }

  // ─── 射线 ──────────────────────────────────────────
  for (const ray of [...scene.rays.values()]) {
    if (ray.p1.id === removeId) ray.p1 = keepPoint
    if (ray.p2.id === removeId) ray.p2 = keepPoint
    if (ray.p1.id === ray.p2.id) {
      scene.rays.delete(ray.id)
      scene.selection.rays.delete(ray.id)
    }
  }

  // ─── 向量 ──────────────────────────────────────────
  for (const vector of [...scene.vectors.values()]) {
    if (vector.p1.id === removeId) vector.p1 = keepPoint
    if (vector.p2.id === removeId) vector.p2 = keepPoint
    if (vector.p1.id === vector.p2.id) {
      scene.vectors.delete(vector.id)
      scene.selection.vectors.delete(vector.id)
    }
  }

  // ─── 面 ────────────────────────────────────────────
  const replacePointId = (ids: string[]) =>
    [...new Set(ids.map((id) => (id === removeId ? keepId : id)))]

  for (const face of [...scene.faces.values()]) {
    if (!face.includesPoint(keepId) && !face.includesPoint(removeId)) continue

    face.boundaryPointIds = replacePointId(face.boundaryPointIds)
    face.memberPointIds = replacePointId(face.memberPointIds)
    face.supportPointIds = replacePointId(face.supportPointIds)
    face.cubeOwnerPointIds = replacePointId(face.cubeOwnerPointIds)
    face.cubeDependentPointIds = replacePointId(face.cubeDependentPointIds)
    face.regularPolygonOwnerPointIds = replacePointId(face.regularPolygonOwnerPointIds)
    face.regularPolygonDependentPointIds = replacePointId(face.regularPolygonDependentPointIds)
    face.boundaryLineIds = face.boundaryLineIds.filter((lineId) => scene.lines.has(lineId))

    if (face.boundaryPointIds.length < 3 || face.memberPointIds.length < 3) {
      scene.removeFace(face.id)
      continue
    }

    rebuildBoundaryLineIds(scene, face)

    face.normalize(scene.points)
    if (face.supportPointIds.length < 3) {
      scene.removeFace(face.id)
    }
  }

  // ─── 立方体约束 ────────────────────────────────────
  for (const constraint of [...scene.cubeConstraints.values()]) {
    const cubeConstraint = constraint as unknown as CubeConstraint
    const allPointIds = [
      cubeConstraint.ownerPointIds[0],
      cubeConstraint.ownerPointIds[1],
      ...cubeConstraint.dependentLayouts.map((item) => item.pointId)
    ]
    if (!allPointIds.some((pid) => pid === keepId || pid === removeId)) continue

    if (cubeConstraint.ownerPointIds[0] === removeId) cubeConstraint.ownerPointIds[0] = keepId
    if (cubeConstraint.ownerPointIds[1] === removeId) cubeConstraint.ownerPointIds[1] = keepId
    cubeConstraint.dependentLayouts.forEach((layout) => {
      if (layout.pointId === removeId) layout.pointId = keepId
    })
  }

  // 继承 removePoint 的 cubeId/cubeRole
  if (!keepPoint.cubeId && removePoint.cubeId) {
    keepPoint.cubeId = removePoint.cubeId
    keepPoint.cubeRole = removePoint.cubeRole
  }

  // ─── 正多边形约束 ──────────────────────────────────
  for (const constraint of [...scene.regularPolygonConstraints.values()]) {
    const polygonConstraint = constraint as unknown as RegularPolygonConstraint
    const allPointIds = [
      polygonConstraint.ownerPointIds[0],
      polygonConstraint.ownerPointIds[1],
      ...polygonConstraint.dependentLayouts.map((item) => item.pointId)
    ]
    if (!allPointIds.some((pid) => pid === keepId || pid === removeId)) continue

    if (polygonConstraint.ownerPointIds[0] === removeId) polygonConstraint.ownerPointIds[0] = keepId
    if (polygonConstraint.ownerPointIds[1] === removeId) polygonConstraint.ownerPointIds[1] = keepId
    polygonConstraint.dependentLayouts.forEach((layout) => {
      if (layout.pointId === removeId) layout.pointId = keepId
    })
  }

  // 继承 removePoint 的 regularPolygonId/regularPolygonRole
  if (!keepPoint.regularPolygonId && removePoint.regularPolygonId) {
    keepPoint.regularPolygonId = removePoint.regularPolygonId
    keepPoint.regularPolygonRole = removePoint.regularPolygonRole
  }

  // ─── 圆 ────────────────────────────────────────────
  for (const circle of [...scene.circles.values()]) {
    const involvesRemove =
      circle.p1.id === removeId || circle.p2.id === removeId || circle.p3.id === removeId ||
      [...scene.points.values()].some(
        (p) => p.circleId === circle.id && p.circleRole === 'center' && p.id === removeId,
      )
    const involvesKeep =
      circle.p1.id === keepId || circle.p2.id === keepId || circle.p3.id === keepId ||
      [...scene.points.values()].some(
        (p) => p.circleId === circle.id && p.circleRole === 'center' && p.id === keepId,
      )
    if (!involvesRemove && !involvesKeep) continue

    const centerPoint = [...scene.points.values()].find(
      (p) => p.circleId === circle.id && p.circleRole === 'center',
    ) ?? null
    const isRemoveCenter = centerPoint?.id === removeId
    const isKeepCenter = centerPoint?.id === keepId

    // 法向圆
    if (circle.isNormalCircle()) {
      if (circle.p1.id === removeId) {
        circle.p1 = keepPoint
        keepPoint.circleId = circle.id
        keepPoint.circleRole = 'center'
      }
      if (circle.directionType === 'point' && circle.directionId === removeId) {
        circle.directionId = keepId
      }
      continue
    }

    // 三点圆 — 中心点被移除
    if (isRemoveCenter) {
      const frame = circle.getFrame()
      if (frame) {
        const delta = new Vec3(
          keepPoint.position.x - frame.center.x,
          keepPoint.position.y - frame.center.y,
          keepPoint.position.z - frame.center.z,
        )
        const pointIds = new Set([circle.p1.id, circle.p2.id, circle.p3.id])
        pointIds.forEach((pid) => {
          const pt = scene.points.get(pid)
          if (pt && pt.id !== keepId) {
            pt.position = new Vec3(
              pt.position.x + delta.x,
              pt.position.y + delta.y,
              pt.position.z + delta.z,
            )
          }
        })
      }
      keepPoint.circleId = circle.id
      keepPoint.circleRole = 'center'
      keepPoint.locked = true
      keepPoint.userLocked = false
    }

    if (circle.p1.id === removeId) circle.p1 = keepPoint
    if (circle.p2.id === removeId) circle.p2 = keepPoint
    if (circle.p3.id === removeId) circle.p3 = keepPoint

    // 退化检测
    const uniqueIds = new Set([circle.p1.id, circle.p2.id, circle.p3.id])
    if (uniqueIds.size < 3) {
      scene.circles.delete(circle.id)
      scene.selection.circles.delete(circle.id)
      if (centerPoint) {
        scene.points.delete(centerPoint.id)
        scene.selection.points.delete(centerPoint.id)
      }
      if (isRemoveCenter) {
        keepPoint.circleId = null
        keepPoint.circleRole = null
        keepPoint.locked = false
      }
      if (isKeepCenter && centerPoint) {
        centerPoint.circleId = null
        centerPoint.circleRole = null
        centerPoint.locked = false
      }
      continue
    }

    // 无效检测
    if (!circle.isValid()) {
      scene.circles.delete(circle.id)
      scene.selection.circles.delete(circle.id)
      if (centerPoint) {
        scene.points.delete(centerPoint.id)
        scene.selection.points.delete(centerPoint.id)
      }
      if (isRemoveCenter) {
        keepPoint.circleId = null
        keepPoint.circleRole = null
        keepPoint.locked = false
      }
      if (isKeepCenter && centerPoint) {
        centerPoint.circleId = null
        centerPoint.circleRole = null
        centerPoint.locked = false
      }
      continue
    }

    // 保留中心点更新位置
    if (isKeepCenter && centerPoint) {
      const newFrame = circle.getFrame()
      if (newFrame) {
        centerPoint.position = newFrame.center
      }
    }
  }

  // ─── 球 ────────────────────────────────────────────
  for (const sphere of [...scene.spheres.values()]) {
    if (
      sphere.centerPoint.id !== removeId && sphere.centerPoint.id !== keepId &&
      sphere.radiusPoint?.id !== removeId && sphere.radiusPoint?.id !== keepId
    ) continue

    if (sphere.centerPoint.id === removeId) {
      sphere.centerPoint = keepPoint
      keepPoint.sphereId = sphere.id
      keepPoint.sphereRole = 'center'
    }
    if (sphere.radiusPoint && sphere.radiusPoint.id === removeId) {
      sphere.radiusPoint = keepPoint
      keepPoint.sphereId = sphere.id
      keepPoint.sphereRole = 'radius'
    }
    if (sphere.radiusPoint && sphere.centerPoint.id === sphere.radiusPoint.id) {
      scene.removeSphere(sphere.id)
      keepPoint.sphereId = null
      keepPoint.sphereRole = null
    }
  }

  // ─── 圆锥 ──────────────────────────────────────────
  for (const cone of [...scene.cones.values()]) {
    if (
      cone.baseCenterPoint.id !== removeId && cone.baseCenterPoint.id !== keepId &&
      cone.apexPoint.id !== removeId && cone.apexPoint.id !== keepId
    ) continue

    if (cone.baseCenterPoint.id === removeId) {
      cone.baseCenterPoint = keepPoint
      keepPoint.coneId = cone.id
      keepPoint.coneRole = 'baseCenter'
    }
    if (cone.apexPoint.id === removeId) {
      cone.apexPoint = keepPoint
      keepPoint.coneId = cone.id
      keepPoint.coneRole = 'apex'
    }
    if (cone.baseCenterPoint.id === cone.apexPoint.id) {
      scene.removeCone(cone.id)
      keepPoint.coneId = null
      keepPoint.coneRole = null
    }
  }

  // ─── 圆柱 ──────────────────────────────────────────
  for (const cylinder of [...scene.cylinders.values()]) {
    if (
      cylinder.bottomCenterPoint.id !== removeId && cylinder.bottomCenterPoint.id !== keepId &&
      cylinder.topCenterPoint.id !== removeId && cylinder.topCenterPoint.id !== keepId
    ) continue

    const bottomCircleId = cylinder.normalCircleId
    const topCircleId = cylinder.topNormalCircleId

    if (cylinder.bottomCenterPoint.id === removeId) {
      cylinder.bottomCenterPoint = keepPoint
      keepPoint.cylinderId = cylinder.id
      keepPoint.cylinderRole = 'bottomCenter'
      if (bottomCircleId) {
        const bottomCircle = scene.circles.get(bottomCircleId)
        if (bottomCircle) {
          if (bottomCircle.p1.id === removeId) bottomCircle.p1 = keepPoint
          if (bottomCircle.p2.id === removeId) bottomCircle.p2 = keepPoint
          if (bottomCircle.p3.id === removeId) bottomCircle.p3 = keepPoint
        }
      }
      if (topCircleId) {
        const topCircle = scene.circles.get(topCircleId)
        if (topCircle && topCircle.directionId === removeId) {
          topCircle.directionId = keepId
        }
      }
    }
    if (cylinder.topCenterPoint.id === removeId) {
      cylinder.topCenterPoint = keepPoint
      keepPoint.cylinderId = cylinder.id
      keepPoint.cylinderRole = 'topCenter'
      if (topCircleId) {
        const topCircle = scene.circles.get(topCircleId)
        if (topCircle) {
          if (topCircle.p1.id === removeId) topCircle.p1 = keepPoint
          if (topCircle.p2.id === removeId) topCircle.p2 = keepPoint
          if (topCircle.p3.id === removeId) topCircle.p3 = keepPoint
        }
      }
      if (bottomCircleId) {
        const bottomCircle = scene.circles.get(bottomCircleId)
        if (bottomCircle && bottomCircle.directionId === removeId) {
          bottomCircle.directionId = keepId
        }
      }
    }
    if (cylinder.bottomCenterPoint.id === cylinder.topCenterPoint.id) {
      if (bottomCircleId) {
        const bottomCircle = scene.circles.get(bottomCircleId)
        if (bottomCircle) {
          scene.circles.delete(bottomCircle.id)
          scene.selection.circles.delete(bottomCircle.id)
          bottomCircle.p1.circleId = null
          bottomCircle.p1.circleRole = null
        }
      }
      if (topCircleId) {
        const topCircle = scene.circles.get(topCircleId)
        if (topCircle) {
          scene.circles.delete(topCircle.id)
          scene.selection.circles.delete(topCircle.id)
          topCircle.p1.circleId = null
          topCircle.p1.circleRole = null
        }
      }
      scene.removeCylinder(cylinder.id)
      keepPoint.cylinderId = null
      keepPoint.cylinderRole = null
    }
  }

  // ─── 对象约束点 ────────────────────────────────────
  for (const constraint of [...scene.objectConstrainedPointConstraints.values()]) {
    if (constraint.pointId === removeId) {
      scene.removeObjectConstrainedPointConstraint(removeId)
    }
    if (constraint.pointId === keepId) {
      keepPoint.constrainedTo = { ...constraint.target }
    }
  }

  // ─── 垂线与平行线（含级联删除）─────────────────────
  const deletedTargetIds = new Set<string>()

  // 先处理直接引用 removePoint 的垂线/平行线
  for (const line of [...scene.perpendicularLines.values()]) {
    if (line.p1.id === removeId) line.p1 = keepPoint
    if (line.p2.id === removeId) line.p2 = keepPoint
    if (line.p1.id === line.p2.id) {
      scene.perpendicularLines.delete(line.id)
      scene.selection.perpendicularLines.delete(line.id)
      deletedTargetIds.add(`perpendicularLine:${line.id}`)
    }
  }

  for (const line of [...scene.parallelLines.values()]) {
    if (line.p1.id === removeId) line.p1 = keepPoint
    if (line.p2.id === removeId) line.p2 = keepPoint
    if (line.p1.id === line.p2.id) {
      scene.parallelLines.delete(line.id)
      scene.selection.parallelLines.delete(line.id)
      deletedTargetIds.add(`parallelLine:${line.id}`)
    }
  }

  // 级联删除：目标已被删除的垂线/平行线
  let changed = true
  while (changed) {
    changed = false
    for (const pl of [...scene.perpendicularLines.values()]) {
      if (deletedTargetIds.has(`${pl.target.type}:${pl.target.id}`)) {
        scene.perpendicularLines.delete(pl.id)
        scene.selection.perpendicularLines.delete(pl.id)
        deletedTargetIds.add(`perpendicularLine:${pl.id}`)
        changed = true
      }
    }
    for (const pl of [...scene.parallelLines.values()]) {
      if (deletedTargetIds.has(`${pl.target.type}:${pl.target.id}`)) {
        scene.parallelLines.delete(pl.id)
        scene.selection.parallelLines.delete(pl.id)
        deletedTargetIds.add(`parallelLine:${pl.id}`)
        changed = true
      }
    }
  }

  // ─── 删除被移除的点 ────────────────────────────────
  scene.points.delete(removeId)
  scene.selection.points.delete(removeId)

  // ─── 标记脏点并求解 ────────────────────────────────
  scene.markPointDirty(keepId)
  scene.solveDirtyConstraints()
  scene.markAllRenderDirty()
  scene.selection.selectPoint(keepId, true)
}

function rebuildBoundaryLineIds(scene: Scene, face: PlanarPolygon) {
  const boundaryLineIds: string[] = []
  for (let i = 0; i < face.boundaryPointIds.length; i++) {
    const p1Id = face.boundaryPointIds[i]!
    const p2Id = face.boundaryPointIds[(i + 1) % face.boundaryPointIds.length]!
    const foundLine = PlanarPolygon.findExistingLine(scene.lines, p1Id, p2Id)
    if (foundLine) {
      boundaryLineIds.push(foundLine.id)
    }
  }
  face.boundaryLineIds = boundaryLineIds
}

/**
 * 创建合并点命令（基于快照模式）。
 *
 * 将 removePoint 合并到 keepPoint，自动替换所有引用，
 * 删除退化元素，处理级联删除。
 *
 * undo/redo 由 SnapshotCommand 的全量快照自动处理，
 * 无需手动管理数百行快照恢复逻辑。
 */
export function createMergePointsCommand(
  scene: Scene,
  keepPoint: Point3,
  removePoint: Point3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('MergePointsCommand', scene, () => {
    executeMergePoints(scene, keepPoint, removePoint)
  })

  cmd.executeAndCapture()
  return cmd
}

/**
 * 合并点核心逻辑（供 createMergeCubePointsCommand 复用）。
 * 不自行捕获快照，由外层 SnapshotCommand 统一管理。
 */
export { executeMergePoints }
