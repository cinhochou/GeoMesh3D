// src/core/features/plugins/PerpendicularLineFeature.ts
// 垂线（PerpendicularLine）的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'
import type { Point3 } from '../../geometry/Point3'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'

export interface PerpendicularLineFeatureParams {
  line: PerpendicularLine3
}

export interface DeletePerpendicularLineParams {
  line: PerpendicularLine3
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface PerpendicularLineUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  displayLength?: number
  userLocked?: boolean
}

export const perpendicularLineFeaturePlugin: FeaturePlugin = {
  type: 'perpendicularLine',

  getDependencies(params) {
    const p = params as unknown as PerpendicularLineFeatureParams
    return [p.line.p1.id, p.line.p2.id]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as PerpendicularLineFeatureParams
    const line = params.line

    scene.addPerpendicularLine(line)

    return {
      elementIds: {
        perpendicularLines: [line.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as PerpendicularLineUpdateState
    const lineParams = feature.params as unknown as PerpendicularLineFeatureParams
    const line = scene.perpendicularLines.get(feature.id) ?? lineParams.line
    if (!line) {
      throw new Error(`PerpendicularLineFeature: line "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) line.name = state.name
    if (state.nameVisible !== undefined) line.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) line.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) line.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) line.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) line.visible = state.visible
    if (state.displayLength !== undefined) line.displayLength = PerpendicularLine3.normalizeDisplayLength(state.displayLength)
    if (state.userLocked !== undefined) line.userLocked = state.userLocked

    return { elementIds: { perpendicularLines: [line.id] } }
  },

  delete(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
    void _geometry
    const deleteParams = feature.params as unknown as DeletePerpendicularLineParams

    deleteParams.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    deleteParams.relatedPerpendicularLines?.forEach((l) => {
      scene.removePerpendicularLine(l.id)
      scene.selection.perpendicularLines.delete(l.id)
    })
    deleteParams.relatedParallelLines?.forEach((l) => {
      scene.removeParallelLine(l.id)
      scene.selection.parallelLines.delete(l.id)
    })
    scene.removePerpendicularLine(deleteParams.line.id)
    scene.selection.perpendicularLines.delete(deleteParams.line.id)
  },
}
