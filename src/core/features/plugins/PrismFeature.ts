// src/core/features/plugins/PrismFeature.ts
// 棱柱（Prism）的 Feature 插件。模式 A：直接管理 Point3/Line3/PlanarPolygon + PrismConstraint。
// 底面多边形为用户选中的已存在多边形（owner），最高点为已存在点（owner），
// 顶面其余顶点与所有侧面/顶面边界线为 dependent（棱柱约束）。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import type { Point3 } from '../../geometry/Point3'
import type { Line3 } from '../../geometry/Line3'
import type { PlanarPolygon } from '../../geometry/PlanarPolygon'
import { Vec3 } from '../../geometry/Vec3'
import type { PrismConstraint } from '../../constraints/PrismConstraint'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'

export interface PrismFeatureParams {
  /** 新创建的 dependent 顶点（顶面除最高点外的顶点）。 */
  points: Point3[]
  /** 新创建的边界线（顶面边 + 侧面竖直边）。 */
  boundaryLines: Line3[]
  /** 新创建的面（顶面 + 侧面），不含底面。 */
  faces: PlanarPolygon[]
  /** 底面（已存在），create 时仅做反向引用标记。 */
  bottomFaceId: string
  /** 底面所有顶点 id（owner，含参考顶点）。 */
  bottomOwnerPointIds: string[]
  /** 最高点 id（owner）。 */
  topPointId: string
  /** 棱柱约束。 */
  constraint: PrismConstraint
}

export interface DeletePrismParams {
  /** 新创建的面（顶面 + 侧面）。 */
  faces: PlanarPolygon[]
  /** 新创建的 dependent 顶点。 */
  dependentPoints: Point3[]
  constraint: PrismConstraint
  /** 底面 id（用于清除反向引用，不删除底面本身）。 */
  bottomFaceId: string
  /** 底面顶点 id（用于清除反向引用）。 */
  bottomOwnerPointIds: string[]
  /** 最高点 id（用于清除反向引用）。 */
  topPointId: string
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface PrismUpdateState {
  name?: string
  valueVisible?: boolean
  keepVertical?: boolean
  /** 切换 keepVertical 时记录的最高点位置，用于撤销/重做恢复。 */
  topPointPosition?: { x: number; y: number; z: number }
}

export const prismFeaturePlugin: FeaturePlugin = {
  type: 'prism',

  getDependencies(params) {
    const p = params as unknown as PrismFeatureParams
    const ids = [
      ...p.bottomOwnerPointIds,
      p.topPointId,
      ...p.points.map((point) => point.id),
    ]
    return ids
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as PrismFeatureParams
    const prismId = params.constraint.prismId

    // 1. 添加新创建的 dependent 顶点
    params.points.forEach((point) => {
      point.prismId = prismId
      point.prismRole = 'dependent'
      scene.addPoint(point)
    })

    // 2. 添加新创建的边界线
    params.boundaryLines.forEach((line) => {
      line.faceOwned = true
      line.faceConstraintType = 'prism'
      scene.addLine(line)
    })

    // 3. 添加新创建的面（顶面 + 侧面）
    params.faces.forEach((face) => {
      if (!face.prismId) {
        face.prismId = prismId
        face.prismOwnerPointIds = [...params.bottomOwnerPointIds, params.topPointId]
        face.prismDependentPointIds = params.points.map((p) => p.id)
      }
      scene.addFace(face)
    })

    // 4. 标记底面（已存在）反向引用
    const bottomFace = scene.faces.get(params.bottomFaceId)
    if (bottomFace) {
      bottomFace.prismId = prismId
      bottomFace.prismRole = 'bottom'
      bottomFace.prismOwnerPointIds = [...params.bottomOwnerPointIds]
      bottomFace.prismDependentPointIds = []
    }

    // 5. 标记底面顶点（owner）
    params.bottomOwnerPointIds.forEach((pid) => {
      const p = scene.points.get(pid)
      if (p) {
        p.prismId = prismId
        p.prismRole = 'owner'
      }
    })

    // 6. 标记最高点（owner）
    const topPoint = scene.points.get(params.topPointId)
    if (topPoint) {
      topPoint.prismId = prismId
      topPoint.prismRole = 'owner'
    }

    // 7. 添加约束
    scene.addPrismConstraint(params.constraint)

    return {
      elementIds: {
        points: params.points.map((p) => p.id),
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
    const state = params as unknown as PrismUpdateState
    const prism = scene.prismConstraints.get(feature.id) as unknown as PrismConstraint | undefined
    if (!prism) {
      throw new Error(`PrismFeature: prism "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) prism.name = state.name
    if (state.valueVisible !== undefined) prism.valueVisible = state.valueVisible
    if (state.keepVertical !== undefined && prism.keepVertical !== state.keepVertical) {
      const result = prism.setKeepVertical(state.keepVertical)
      if (result.correction) {
        const topPoint = scene.points.get(prism.ownerPointIds[1])
        if (topPoint && !topPoint.locked) {
          topPoint.setPosition(result.correction)
        }
      }
    }

    // 撤销/重做时恢复 keepVertical 切换前/后的最高点位置
    if (state.topPointPosition) {
      const topPoint = scene.points.get(prism.ownerPointIds[1])
      if (topPoint && !topPoint.locked) {
        topPoint.setPosition(
          new Vec3(state.topPointPosition.x, state.topPointPosition.y, state.topPointPosition.z),
        )
      }
    }

    return { elementIds: { prisms: [prism.prismId] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    void geometry
    const deleteParams = feature.params as unknown as DeletePrismParams
    const prismId = deleteParams.constraint.prismId

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
    scene.removePrismConstraint(prismId)

    // 删除新创建的面（顶面 + 侧面，不含底面——底面是用户原有的）
    const createdFaces = deleteParams.faces.filter((f) => f.id !== deleteParams.bottomFaceId)
    const deletedFaceIds = new Set(createdFaces.map((f) => f.id))
    createdFaces.forEach((face) => scene.removeFace(face.id))

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

    // 删除新创建的 dependent 顶点
    deleteParams.dependentPoints?.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })

    // 清除底面反向引用（不删除底面本身）
    const bottomFace = scene.faces.get(deleteParams.bottomFaceId)
    if (bottomFace && bottomFace.prismId === prismId) {
      bottomFace.prismId = null
      bottomFace.prismRole = null
      bottomFace.prismOwnerPointIds = []
      bottomFace.prismDependentPointIds = []
    }

    // 清除底面顶点反向引用
    deleteParams.bottomOwnerPointIds?.forEach((pid) => {
      const p = scene.points.get(pid)
      if (p && p.prismId === prismId) {
        p.prismId = null
        p.prismRole = null
      }
    })

    // 清除最高点反向引用
    const topPoint = scene.points.get(deleteParams.topPointId)
    if (topPoint && topPoint.prismId === prismId) {
      topPoint.prismId = null
      topPoint.prismRole = null
    }
  },
}
