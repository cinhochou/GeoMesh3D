// src/core/features/plugins/CylinderFeature.ts
// Cylinder 的 Feature 插件。由于圆柱创建涉及圆柱体、上下底圆及约束，
// 当前阶段先接收已构造好的对象，将其加入场景；后续可进一步参数化。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import { Cylinder3 } from '../../geometry/Cylinder3'
import { Circle3 } from '../../geometry/Circle3'
import { Vec3 } from '../../geometry/Vec3'
import { CylinderConstraint } from '../../constraints/CylinderConstraint'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'
import type { Point3 } from '../../geometry/Point3'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export interface CylinderFeatureParams {
  /** 底部中心点 id */
  bottomCenterPointId: string
  /** 顶部中心点 id */
  topCenterPointId: string
  /** 已构造好的圆柱体 */
  cylinder: Cylinder3
  /** 已构造好的下底圆 */
  bottomCircle: Circle3
  /** 已构造好的上底圆 */
  topCircle: Circle3
  /** 显示名称 */
  name?: string
  /** 是否可见 */
  visible?: boolean
  /** 名称是否可见 */
  nameVisible?: boolean
  /** 数值是否可见 */
  valueVisible?: boolean
  /** 标签 X 偏移 */
  labelOffsetX?: number
  /** 标签 Y 偏移 */
  labelOffsetY?: number
}

export interface DeleteCylinderParams {
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface CylinderUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  userLocked?: boolean
  radiusValue?: number
  position?: { x: number; y: number; z: number }
}

export const cylinderFeaturePlugin: FeaturePlugin = {
  type: 'cylinder',

  getDependencies(params) {
    const p = params as unknown as CylinderFeatureParams
    return [p.bottomCenterPointId, p.topCenterPointId]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as CylinderFeatureParams

    scene.addCylinder(params.cylinder)
    params.cylinder.bottomCenterPoint.cylinderId = params.cylinder.id
    params.cylinder.bottomCenterPoint.cylinderRole = 'bottomCenter'
    params.cylinder.topCenterPoint.cylinderId = params.cylinder.id
    params.cylinder.topCenterPoint.cylinderRole = 'topCenter'

    scene.addCircle(params.bottomCircle)
    params.bottomCircle.p1.circleId = params.bottomCircle.id
    params.bottomCircle.p1.circleRole = 'center'

    scene.addCircle(params.topCircle)
    params.topCircle.p1.circleId = params.topCircle.id
    params.topCircle.p1.circleRole = 'center'

    const constraint = new CylinderConstraint(
      scene,
      params.cylinder.id,
      params.bottomCircle.id,
      params.topCircle.id,
      params.cylinder.name,
      params.cylinder.valueVisible,
    )
    scene.addCylinderConstraint(constraint)

    return {
      elementIds: {
        cylinders: [params.cylinder.id],
        circles: [params.bottomCircle.id, params.topCircle.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as CylinderUpdateState
    const cylinder = scene.cylinders.get(feature.id)
    if (!cylinder) {
      throw new Error(`CylinderFeature: cylinder "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) cylinder.name = state.name
    if (state.nameVisible !== undefined) cylinder.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) cylinder.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) cylinder.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) cylinder.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) cylinder.visible = state.visible
    if (state.userLocked !== undefined) cylinder.userLocked = state.userLocked
    if (state.radiusValue !== undefined) {
      cylinder.radiusValue = state.radiusValue
      if (cylinder.normalCircleId) {
        const normalCircle = scene.circles.get(cylinder.normalCircleId)
        if (normalCircle) {
          normalCircle.lockedRadius = state.radiusValue
        }
      }
      if (cylinder.topNormalCircleId) {
        const topNormalCircle = scene.circles.get(cylinder.topNormalCircleId)
        if (topNormalCircle) {
          topNormalCircle.lockedRadius = state.radiusValue
        }
      }
    }
    if (state.position !== undefined) {
      cylinder.topCenterPoint.setPosition(new Vec3(state.position.x, state.position.y, state.position.z))
    }

    return { elementIds: { cylinders: [cylinder.id] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    const deleteParams = feature.params as unknown as DeleteCylinderParams
    const cylinderId = geometry.elementIds.cylinders?.[0]
    if (!cylinderId) return

    const cylinder = scene.cylinders.get(cylinderId)
    if (!cylinder) return

    deleteParams.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })

    deleteParams.relatedPerpendicularLines?.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    deleteParams.relatedParallelLines?.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })

    if (cylinder.normalCircleId) {
      const bottomCircle = scene.circles.get(cylinder.normalCircleId)
      if (bottomCircle) {
        scene.circles.delete(bottomCircle.id)
        scene.selection.circles.delete(bottomCircle.id)
        bottomCircle.p1.circleId = null
        bottomCircle.p1.circleRole = null
      }
    }
    if (cylinder.topNormalCircleId) {
      const topCircle = scene.circles.get(cylinder.topNormalCircleId)
      if (topCircle) {
        scene.circles.delete(topCircle.id)
        scene.selection.circles.delete(topCircle.id)
        topCircle.p1.circleId = null
        topCircle.p1.circleRole = null
      }
    }

    scene.removeCylinder(cylinder.id)
    cylinder.bottomCenterPoint.cylinderId = null
    cylinder.bottomCenterPoint.cylinderRole = null
    cylinder.topCenterPoint.cylinderId = null
    cylinder.topCenterPoint.cylinderRole = null
  },
}
