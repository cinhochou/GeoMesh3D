// src/core/features/plugins/PyramidFeature.ts
// 棱锥（Pyramid）的 Feature 插件。模式 A：直接管理 Point3/Line3/PlanarPolygon + PyramidConstraint。
// 底面多边形为用户选中的已存在多边形（owner），apex 为已存在点（owner），
// 侧面斜棱（apex 与底面顶点连线）与所有侧面为 dependent（棱锥约束）。
// 棱锥无顶面、无 dependent 顶点。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import type { Point3 } from '../../geometry/Point3'
import type { Line3 } from '../../geometry/Line3'
import type { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { Vec3 } from '../../geometry/Vec3'
import type { PyramidConstraint } from '../../constraints/PyramidConstraint'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'

export interface PyramidFeatureParams {
  /** 新创建的边界线（侧面斜棱：apex 与各底面顶点连线）。 */
  boundaryLines: Line3[]
  /** 新创建的面（侧面，三角形），不含底面。 */
  faces: PlanarPolygon[]
  /** 底面（已存在），create 时仅做反向引用标记。 */
  bottomFaceId: string
  /** 底面所有顶点 id（owner，含参考顶点）。 */
  bottomOwnerPointIds: string[]
  /** apex id（owner）。 */
  apexPointId: string
  /** 棱锥约束。 */
  constraint: PyramidConstraint
}

export interface DeletePyramidParams {
  /** 新创建的面（侧面）。 */
  faces: PlanarPolygon[]
  /** 棱锥无 dependent 顶点。 */
  dependentPoints: Point3[]
  constraint: PyramidConstraint
  /** 底面 id（用于清除反向引用，不删除底面本身）。 */
  bottomFaceId: string
  /** 底面顶点 id（用于清除反向引用）。 */
  bottomOwnerPointIds: string[]
  /** apex id（用于清除反向引用）。 */
  apexPointId: string
  /** 是否连同底面一起删除（用户直接删除底面时为 true，从侧面级联删除时为 false）。 */
  deleteBottomFace: boolean
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface PyramidUpdateState {
  name?: string
  valueVisible?: boolean
  keepVertical?: boolean
  /** 切换 keepVertical 时记录的 apex 位置，用于撤销/重做恢复。 */
  apexPointPosition?: { x: number; y: number; z: number }
}

export const pyramidFeaturePlugin: FeaturePlugin = {
  type: 'pyramid',

  getDependencies(params) {
    const p = params as unknown as PyramidFeatureParams
    const ids = [...p.bottomOwnerPointIds, p.apexPointId]
    return ids
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as PyramidFeatureParams
    const pyramidId = params.constraint.pyramidId

    // 1. 添加新创建的边界线（侧面斜棱）
    params.boundaryLines.forEach((line) => {
      line.faceOwned = true
      line.faceConstraintType = 'pyramid'
      scene.addLine(line)
    })

    // 2. 添加新创建的面（侧面）
    params.faces.forEach((face) => {
      if (!face.pyramidId) {
        face.pyramidId = pyramidId
        face.pyramidOwnerPointIds = [...params.bottomOwnerPointIds, params.apexPointId]
        face.pyramidDependentPointIds = []
      }
      scene.addFace(face)
    })

    // 3. 标记底面（已存在）反向引用
    const bottomFace = scene.faces.get(params.bottomFaceId)
    if (bottomFace) {
      bottomFace.pyramidId = pyramidId
      bottomFace.pyramidRole = 'bottom'
      bottomFace.pyramidOwnerPointIds = [...params.bottomOwnerPointIds]
      bottomFace.pyramidDependentPointIds = []
    }

    // 4. 标记底面顶点（owner）
    params.bottomOwnerPointIds.forEach((pid) => {
      const p = scene.points.get(pid)
      if (p) {
        p.pyramidId = pyramidId
        p.pyramidRole = 'owner'
      }
    })

    // 5. 标记 apex（owner）
    const apexPoint = scene.points.get(params.apexPointId)
    if (apexPoint) {
      apexPoint.pyramidId = pyramidId
      apexPoint.pyramidRole = 'owner'
    }

    // 6. 添加约束
    scene.addPyramidConstraint(params.constraint)

    return {
      elementIds: {
        lines: params.boundaryLines.map((l) => l.id),
        faces: params.faces.map((f) => f.id),
      },
    }
  },

  update(
    scene: Scene,
    feature: Feature,
    _geometry: GeneratedGeometry,
    params: Record<string, unknown>,
  ): GeneratedGeometry {
    void _geometry
    const state = params as unknown as PyramidUpdateState
    const pyramid = scene.pyramidConstraints.get(feature.id) as unknown as PyramidConstraint | undefined
    if (!pyramid) {
      throw new Error(`PyramidFeature: pyramid "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) pyramid.name = state.name
    if (state.valueVisible !== undefined) pyramid.valueVisible = state.valueVisible
    if (state.keepVertical !== undefined && pyramid.keepVertical !== state.keepVertical) {
      const result = pyramid.setKeepVertical(state.keepVertical)
      if (result.correction) {
        const apexPoint = scene.points.get(pyramid.ownerPointIds[1])
        if (apexPoint && !apexPoint.locked) {
          apexPoint.setPosition(result.correction)
        }
      }
    }

    // 撤销/重做时恢复 keepVertical 切换前/后的 apex 位置
    if (state.apexPointPosition) {
      const apexPoint = scene.points.get(pyramid.ownerPointIds[1])
      if (apexPoint && !apexPoint.locked) {
        apexPoint.setPosition(
          new Vec3(state.apexPointPosition.x, state.apexPointPosition.y, state.apexPointPosition.z),
        )
      }
    }

    return { elementIds: { pyramids: [pyramid.pyramidId] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    void geometry
    const deleteParams = feature.params as unknown as DeletePyramidParams
    const pyramidId = deleteParams.constraint.pyramidId

    const associatedNets = scene.getNetsForSolid(pyramidId)
    associatedNets.forEach((net) => {
      scene.removeNet(net.id)
    })

    // 级联：相关垂直线
    deleteParams.relatedPerpendicularLines?.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    // 级联：相关平行线
    deleteParams.relatedParallelLines?.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    // 级联：相关交点
    deleteParams.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })

    // 删除约束
    scene.removePyramidConstraint(pyramidId)

    // 删除面：从侧面级联删除时保留底面，用户直接删除底面时连同底面一起删
    const facesToDelete = deleteParams.deleteBottomFace
      ? [...deleteParams.faces]
      : deleteParams.faces.filter((f) => f.id !== deleteParams.bottomFaceId)
    const deletedFaceIds = new Set(facesToDelete.map((f) => f.id))
    facesToDelete.forEach((face) => scene.removeFace(face.id))

    // 删除新创建的边界线：faceOwned 且不被任何保留面使用
    const candidateLineIds = new Set(deleteParams.faces.flatMap((f) => f.boundaryLineIds))
    const linesToDelete: Line3[] = []
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
      if (!usedByOther) linesToDelete.push(line)
    }
    linesToDelete.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })

    // 删除新创建的 dependent 顶点（棱锥通常无）
    deleteParams.dependentPoints?.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })

    // 清除底面反向引用（不删除底面本身）
    const bottomFace = scene.faces.get(deleteParams.bottomFaceId)
    if (bottomFace && bottomFace.pyramidId === pyramidId) {
      bottomFace.pyramidId = null
      bottomFace.pyramidRole = null
      bottomFace.pyramidOwnerPointIds = []
      bottomFace.pyramidDependentPointIds = []
    }

    // 清除底面顶点反向引用
    deleteParams.bottomOwnerPointIds?.forEach((pid) => {
      const p = scene.points.get(pid)
      if (p && p.pyramidId === pyramidId) {
        p.pyramidId = null
        p.pyramidRole = null
      }
    })

    // 清除 apex 反向引用
    const apexPoint = scene.points.get(deleteParams.apexPointId)
    if (apexPoint && apexPoint.pyramidId === pyramidId) {
      apexPoint.pyramidId = null
      apexPoint.pyramidRole = null
    }
  },
}
