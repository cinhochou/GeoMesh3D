// src/core/features/plugins/FaceFeature.ts
// 平面多边形（Face）的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import type { Line3 } from '../../geometry/Line3'
import type { Point3 } from '../../geometry/Point3'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'

export interface FaceFeatureParams {
  face: PlanarPolygon
  boundaryLines: Line3[]
}

export interface DeleteFaceParams {
  face: PlanarPolygon
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface FaceUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  userLocked?: boolean
  areaLocked?: boolean
  lockedArea?: number
  edgeLengthLocks?: Array<number | null>
}

export const faceFeaturePlugin: FeaturePlugin = {
  type: 'face',

  getDependencies(params) {
    const p = params as unknown as FaceFeatureParams
    return [...p.face.boundaryPointIds, ...p.face.supportPointIds]
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as FaceFeatureParams

    params.boundaryLines.forEach((line) => scene.addLine(line))
    scene.addFace(params.face)

    return {
      elementIds: {
        lines: params.boundaryLines.map((l) => l.id),
        faces: [params.face.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as FaceUpdateState
    const faceParams = feature.params as unknown as FaceFeatureParams
    const face = scene.faces.get(feature.id) ?? faceParams.face
    if (!face) {
      throw new Error(`FaceFeature: face "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) face.name = state.name
    if (state.nameVisible !== undefined) face.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) face.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) face.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) face.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) face.visible = state.visible
    if (state.userLocked !== undefined) face.userLocked = state.userLocked
    if (state.areaLocked !== undefined) face.areaLocked = state.areaLocked
    if (state.lockedArea !== undefined) face.lockedArea = state.lockedArea
    if (state.edgeLengthLocks !== undefined) face.edgeLengthLocks = [...state.edgeLengthLocks]

    return { elementIds: { faces: [face.id] } }
  },

  delete(scene: Scene, feature: Feature, _geometry: GeneratedGeometry): void {
    void _geometry
    const deleteParams = feature.params as unknown as DeleteFaceParams

    deleteParams.relatedPerpendicularLines?.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    deleteParams.relatedParallelLines?.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })
    deleteParams.dependentIntersectionPoints?.forEach(({ point, constraint }) => {
      scene.removeIntersectionConstraint(constraint.pointId)
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })
    scene.removeFace(deleteParams.face.id)

    const deletedBoundaryLines = deleteParams.face.boundaryLineIds
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)
      .filter((line) => !PlanarPolygon.isBoundaryLineUsedByOtherFace(scene.faces, line.id, deleteParams.face.id))

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
    })
  },
}
