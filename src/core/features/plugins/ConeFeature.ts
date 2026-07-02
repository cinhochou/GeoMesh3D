// src/core/features/plugins/ConeFeature.ts
// Cone 的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import { Cone3 } from '../../geometry/Cone3'
import { Vec3 } from '../../geometry/Vec3'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'
import type { Point3 } from '../../geometry/Point3'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export interface ConeFeatureParams {
  baseCenterPointId: string
  apexPointId: string
  coneType: Cone3['coneType']
  name?: string
  visible?: boolean
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  radiusValue?: number
  normalCircleId?: string | null
}

export interface DeleteConeParams {
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface ConeUpdateState {
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

export const coneFeaturePlugin: FeaturePlugin = {
  type: 'cone',

  getDependencies(params) {
    const p = params as unknown as ConeFeatureParams
    return [p.baseCenterPointId, p.apexPointId]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as ConeFeatureParams
    const baseCenterPoint = scene.points.get(params.baseCenterPointId)
    const apexPoint = scene.points.get(params.apexPointId)
    if (!baseCenterPoint || !apexPoint) {
      throw new Error(`ConeFeature: required points not found`)
    }

    const cone = new Cone3(
      feature.id,
      params.name ?? '圆锥',
      baseCenterPoint,
      apexPoint,
      params.coneType,
      params.nameVisible ?? true,
      params.visible ?? true,
      false,
      params.labelOffsetX ?? 0,
      params.labelOffsetY ?? 0,
      params.valueVisible ?? true,
      params.radiusValue ?? 0,
      params.normalCircleId ?? null,
    )

    scene.addCone(cone)
    cone.baseCenterPoint.coneId = cone.id
    cone.baseCenterPoint.coneRole = 'baseCenter'
    cone.apexPoint.coneId = cone.id
    cone.apexPoint.coneRole = 'apex'

    return {
      elementIds: {
        cones: [cone.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as ConeUpdateState
    const cone = scene.cones.get(feature.id)
    if (!cone) {
      throw new Error(`ConeFeature: cone "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) cone.name = state.name
    if (state.nameVisible !== undefined) cone.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) cone.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) cone.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) cone.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) cone.visible = state.visible
    if (state.userLocked !== undefined) cone.userLocked = state.userLocked
    if (state.radiusValue !== undefined) {
      cone.radiusValue = state.radiusValue
      if (cone.normalCircleId) {
        const normalCircle = scene.circles.get(cone.normalCircleId)
        if (normalCircle) {
          normalCircle.lockedRadius = state.radiusValue
        }
      }
    }
    if (state.position !== undefined) {
      cone.apexPoint.setPosition(new Vec3(state.position.x, state.position.y, state.position.z))
    }

    return { elementIds: { cones: [cone.id] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    const deleteParams = feature.params as unknown as DeleteConeParams
    const coneIds = geometry.elementIds.cones
    const coneId = coneIds?.[0]
    if (!coneId) return

    const cone = scene.cones.get(coneId)
    if (!cone) return

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

    if (cone.normalCircleId) {
      const circle = scene.circles.get(cone.normalCircleId)
      if (circle) {
        scene.circles.delete(circle.id)
        scene.selection.circles.delete(circle.id)
        circle.p1.circleId = null
        circle.p1.circleRole = null
      }
    }

    scene.removeCone(cone.id)
    cone.baseCenterPoint.coneId = null
    cone.baseCenterPoint.coneRole = null
    cone.apexPoint.coneId = null
    cone.apexPoint.coneRole = null
  },
}
