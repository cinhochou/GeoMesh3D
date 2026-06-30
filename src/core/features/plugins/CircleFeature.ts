// src/core/features/plugins/CircleFeature.ts
// 圆（Circle）的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import type { Circle3 } from '../../geometry/Circle3'
import type { Cone3 } from '../../geometry/Cone3'
import type { Cylinder3 } from '../../geometry/Cylinder3'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'

export interface CircleFeatureParams {
  circle: Circle3
}

export interface DeleteCircleParams {
  circle: Circle3
  relatedCones: Cone3[]
  relatedCylinders: Cylinder3[]
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface CircleUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  userLocked?: boolean
  centerVisible?: boolean
  lockedRadius?: number | null
}

export const circleFeaturePlugin: FeaturePlugin = {
  type: 'circle',

  getDependencies(params) {
    const p = params as unknown as CircleFeatureParams
    return [p.circle.p1.id, p.circle.p2.id, p.circle.p3.id]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as CircleFeatureParams
    const circle = params.circle

    scene.addCircle(circle)
    if (circle.isNormalCircle()) {
      circle.p1.circleId = circle.id
      circle.p1.circleRole = 'center'
    }

    return {
      elementIds: {
        circles: [circle.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as CircleUpdateState
    const circleParams = feature.params as unknown as CircleFeatureParams
    const circle = scene.circles.get(feature.id) ?? circleParams.circle
    if (!circle) {
      throw new Error(`CircleFeature: circle "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) circle.name = state.name
    if (state.nameVisible !== undefined) circle.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) circle.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) circle.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) circle.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) circle.visible = state.visible
    if (state.userLocked !== undefined) circle.userLocked = state.userLocked
    if (state.centerVisible !== undefined) {
      circle.centerVisible = state.centerVisible
      if (circle.isNormalCircle()) {
        if (circle.p1.circleRole === 'center' && circle.p1.circleId === circle.id) {
          circle.p1.visible = state.centerVisible
        }
      } else {
        for (const p of scene.points.values()) {
          if (p.circleRole === 'center' && p.circleId === circle.id) {
            p.visible = state.centerVisible
            break
          }
        }
      }
    }
    if (state.lockedRadius !== undefined) {
      circle.lockedRadius = state.lockedRadius
      if (circle.isNormalCircle()) {
        scene.cones.forEach((cone) => {
          if (cone.normalCircleId === circle.id) {
            cone.radiusValue = state.lockedRadius ?? 0
          }
        })
        scene.cylinders.forEach((cylinder) => {
          if (cylinder.normalCircleId === circle.id || cylinder.topNormalCircleId === circle.id) {
            cylinder.radiusValue = state.lockedRadius ?? 0
          }
        })
      }
    }

    return { elementIds: { circles: [circle.id] } }
  },

  delete(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
    void _geometry
    const deleteParams = feature.params as unknown as DeleteCircleParams
    const circle = deleteParams.circle

    deleteParams.relatedCones?.forEach((cone) => {
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

    deleteParams.relatedCylinders?.forEach((cylinder) => {
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

    deleteParams.relatedPerpendicularLines?.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    deleteParams.relatedParallelLines?.forEach((line) => {
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
  },
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
