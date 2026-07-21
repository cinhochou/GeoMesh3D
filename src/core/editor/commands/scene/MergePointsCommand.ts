import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Point3 } from '../../../geometry/Point3'
import { Vec3 } from '../../../geometry/Vec3'
import { PlanarPolygon } from '../../../geometry/PlanarPolygon'
import { CubeConstraint } from '../../../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../../../constraints/RegularPolygonConstraint'
import { PrismConstraint } from '../../../constraints/PrismConstraint'
import { PyramidConstraint } from '../../../constraints/PyramidConstraint'

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
    face.prismOwnerPointIds = replacePointId(face.prismOwnerPointIds)
    face.prismDependentPointIds = replacePointId(face.prismDependentPointIds)
    face.pyramidOwnerPointIds = replacePointId(face.pyramidOwnerPointIds)
    face.pyramidDependentPointIds = replacePointId(face.pyramidDependentPointIds)
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

  // ─── 棱柱约束 ──────────────────────────────────────
  for (const constraint of [...scene.prismConstraints.values()]) {
    const prismConstraint = constraint as unknown as PrismConstraint
    const allPointIds = [
      prismConstraint.ownerPointIds[0],
      prismConstraint.ownerPointIds[1],
      ...prismConstraint.dependentLayouts.map((item) => item.pointId),
    ]
    if (!allPointIds.some((pid) => pid === keepId || pid === removeId)) continue

    if (prismConstraint.ownerPointIds[0] === removeId) prismConstraint.ownerPointIds[0] = keepId
    if (prismConstraint.ownerPointIds[1] === removeId) prismConstraint.ownerPointIds[1] = keepId
    prismConstraint.dependentLayouts.forEach((layout) => {
      if (layout.pointId === removeId) layout.pointId = keepId
    })
  }

  // 继承 removePoint 的 prismId/prismRole
  if (!keepPoint.prismId && removePoint.prismId) {
    keepPoint.prismId = removePoint.prismId
    keepPoint.prismRole = removePoint.prismRole
  }

  // ─── 棱锥约束 ──────────────────────────────────────
  const degeneratePyramidIds: string[] = []
  for (const constraint of [...scene.pyramidConstraints.values()]) {
    const pyramidConstraint = constraint as unknown as PyramidConstraint

    // 更新 ownerPointIds 中的引用
    if (pyramidConstraint.ownerPointIds[0] === removeId) pyramidConstraint.ownerPointIds[0] = keepId
    if (pyramidConstraint.ownerPointIds[1] === removeId) pyramidConstraint.ownerPointIds[1] = keepId

    // 退化检测：
    // 1) 两个 owner 点合并为同一点（baseRefVertex 与 apex 重合）
    // 2) apex 与底面任一边界点重合（高度为0）
    // 3) 底面已被面循环删除（边界点 < 3 导致面退化）
    const bottomFace = scene.faces.get(pyramidConstraint.bottomFaceId)
    const bottomPointIds = bottomFace ? [...bottomFace.boundaryPointIds] : []
    const apexId = pyramidConstraint.ownerPointIds[1]
    const isApexOnBottom = bottomPointIds.includes(apexId)
    const isBottomMissing = !bottomFace
    if (
      pyramidConstraint.ownerPointIds[0] === pyramidConstraint.ownerPointIds[1] ||
      isApexOnBottom ||
      isBottomMissing
    ) {
      degeneratePyramidIds.push(pyramidConstraint.pyramidId)
    }
  }

  // 继承 removePoint 的 pyramidId/pyramidRole
  if (!keepPoint.pyramidId && removePoint.pyramidId) {
    keepPoint.pyramidId = removePoint.pyramidId
    keepPoint.pyramidRole = removePoint.pyramidRole
  }

  // 级联删除退化的棱锥（owner点重合/apex落到底面/底面被删除）
  for (const pyramidId of degeneratePyramidIds) {
    const constraint = scene.pyramidConstraints.get(pyramidId)
    if (!constraint) continue
    const pyramidConstraint = constraint as unknown as PyramidConstraint

    // 收集侧面信息（删除前）
    const sideFaces: PlanarPolygon[] = []
    for (const faceId of pyramidConstraint.sideFaceIds) {
      const face = scene.faces.get(faceId)
      if (face) sideFaces.push(face)
    }
    const allFaces = [...sideFaces]
    const bottomFace = scene.faces.get(pyramidConstraint.bottomFaceId)
    if (bottomFace) allFaces.push(bottomFace)
    const candidateLineIds = new Set(allFaces.flatMap((f) => f.boundaryLineIds))

    // 删除约束
    scene.removePyramidConstraint(pyramidId)

    // 删除侧面（底面若仍存在则保留，若已被面循环删除则不存在）
    const deletedFaceIds = new Set(sideFaces.map((f) => f.id))
    sideFaces.forEach((face) => scene.removeFace(face.id))

    // 删除 faceOwned 且不被保留面使用的边界线（侧面斜棱）
    for (const lineId of candidateLineIds) {
      const line = scene.lines.get(lineId)
      if (!line || !line.faceOwned) continue
      let usedByOther = false
      for (const face of scene.faces.values()) {
        if (deletedFaceIds.has(face.id)) continue
        if (face.boundaryLineIds.includes(lineId)) {
          usedByOther = true
          break
        }
      }
      if (!usedByOther) {
        scene.lines.delete(lineId)
        scene.selection.lines.delete(lineId)
      }
    }

    // 清除底面反向引用（若底面仍存在）
    if (bottomFace && bottomFace.pyramidId === pyramidId) {
      bottomFace.pyramidId = null
      bottomFace.pyramidRole = null
      bottomFace.pyramidOwnerPointIds = []
      bottomFace.pyramidDependentPointIds = []
    }

    // 清除所有底面顶点反向引用
    const bottomPointIds = bottomFace?.boundaryPointIds ?? []
    for (const pid of bottomPointIds) {
      const p = scene.points.get(pid)
      if (p && p.pyramidId === pyramidId) {
        p.pyramidId = null
        p.pyramidRole = null
      }
    }

    // 清除 apex 反向引用
    const apexId = pyramidConstraint.ownerPointIds[1]
    const apexPoint = scene.points.get(apexId)
    if (apexPoint && apexPoint.pyramidId === pyramidId) {
      apexPoint.pyramidId = null
      apexPoint.pyramidRole = null
    }
    if (keepPoint.pyramidId === pyramidId) {
      keepPoint.pyramidId = null
      keepPoint.pyramidRole = null
    }
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

  // ─── 展开图（Net）──────────────────────────────────
  // Net 的 faceTransforms.hingeEdgePointIds 与 controlEdgePointIds 直接引用 pointId，
  // 合并点后需要同步替换；若铰链边两端合并为同一点，则该 faceTransform 退化，
  // 此时整个 Net 的展开拓扑已破坏，删除整个 Net。
  for (const net of [...scene.nets.values()]) {
    let netDirty = false
    let netDegenerate = false

    for (const transform of net.faceTransforms.values()) {
      const [a, b] = transform.hingeEdgePointIds
      const newA = a === removeId ? keepId : a
      const newB = b === removeId ? keepId : b
      if (newA === newB) {
        netDegenerate = true
        break
      }
      if (newA !== a || newB !== b) {
        transform.hingeEdgePointIds = [newA, newB]
        netDirty = true
      }
    }
    if (netDegenerate) {
      scene.removeNet(net.id)
      continue
    }

    if (net.controlEdgePointIds) {
      const [a, b] = net.controlEdgePointIds
      const newA = a === removeId ? keepId : a
      const newB = b === removeId ? keepId : b
      if (newA === newB) {
        net.controlEdgeFaceId = null
        net.controlEdgePointIds = null
        netDirty = true
      } else if (newA !== a || newB !== b) {
        net.controlEdgePointIds = [newA, newB]
        netDirty = true
      }
    }

    if (netDirty) {
      scene.markNetDirty(net.id)
    }
  }

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
