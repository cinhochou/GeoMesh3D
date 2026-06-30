// src/core/features/plugins/ParallelLineFeature.ts
// 平行线（ParallelLine）的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import { ParallelLine3 } from '../../geometry/ParallelLine3'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'

export interface ParallelLineFeatureParams {
  line: ParallelLine3
}

export interface DeleteParallelLineParams {
  line: ParallelLine3
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface ParallelLineUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  displayLength?: number
  userLocked?: boolean
}

export const parallelLineFeaturePlugin: FeaturePlugin = {
  type: 'parallelLine',

  getDependencies(params) {
    const p = params as unknown as ParallelLineFeatureParams
    return [p.line.p1.id, p.line.p2.id]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as ParallelLineFeatureParams
    const line = params.line

    scene.addParallelLine(line)

    return {
      elementIds: {
        parallelLines: [line.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as ParallelLineUpdateState
    const lineParams = feature.params as unknown as ParallelLineFeatureParams
    const line = scene.parallelLines.get(feature.id) ?? lineParams.line
    if (!line) {
      throw new Error(`ParallelLineFeature: line "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) line.name = state.name
    if (state.nameVisible !== undefined) line.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) line.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) line.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) line.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) line.visible = state.visible
    if (state.displayLength !== undefined) line.displayLength = ParallelLine3.normalizeDisplayLength(state.displayLength)
    if (state.userLocked !== undefined) line.userLocked = state.userLocked

    return { elementIds: { parallelLines: [line.id] } }
  },

  delete(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
    void _geometry
    const deleteParams = feature.params as unknown as DeleteParallelLineParams

    deleteParams.relatedPerpendicularLines?.forEach((l) => {
      scene.removePerpendicularLine(l.id)
      scene.selection.perpendicularLines.delete(l.id)
    })
    deleteParams.relatedParallelLines?.forEach((l) => {
      scene.removeParallelLine(l.id)
      scene.selection.parallelLines.delete(l.id)
    })
    scene.removeParallelLine(deleteParams.line.id)
    scene.selection.parallelLines.delete(deleteParams.line.id)
  },
}
