// src/core/features/plugins/IntersectionPointFeature.ts
// 交点的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import type { Point3 } from '../../geometry/Point3'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export interface IntersectionPointFeatureParams {
  point: Point3
  constraint: IntersectionPointConstraint
}

export const intersectionPointFeaturePlugin: FeaturePlugin = {
  type: 'intersectionPoint',

  getDependencies(params) {
    const p = params as unknown as IntersectionPointFeatureParams
    return [p.point.id]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as IntersectionPointFeatureParams
    scene.addPoint(params.point)
    scene.addIntersectionConstraint(params.constraint)
    return {
      elementIds: {
        points: [params.point.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    const pointId = geometry.elementIds.points?.[0]
    if (!pointId) {
      throw new Error(`IntersectionPointFeature: no point to update for feature "${feature.id}"`)
    }
    const point = scene.points.get(pointId)
    if (!point) {
      throw new Error(`IntersectionPointFeature: point "${pointId}" not found for update`)
    }
    const state = params as { name?: string; visible?: boolean; nameVisible?: boolean; valueVisible?: boolean; labelOffsetX?: number; labelOffsetY?: number }
    if (state.name !== undefined) point.name = state.name
    if (state.visible !== undefined) point.visible = state.visible
    if (state.nameVisible !== undefined) point.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) point.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) point.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) point.labelOffsetY = state.labelOffsetY
    return { elementIds: { points: [pointId] } }
  },
}
