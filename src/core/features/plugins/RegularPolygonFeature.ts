// src/core/features/plugins/RegularPolygonFeature.ts
// 正多边形的 Feature 插件。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import type { Point3 } from '../../geometry/Point3'
import type { Line3 } from '../../geometry/Line3'
import { PlanarPolygon } from '../../geometry/PlanarPolygon'
import type { RegularPolygonConstraint } from '../../constraints/RegularPolygonConstraint'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'

export interface RegularPolygonFeatureParams {
  points: Point3[]
  boundaryLines: Line3[]
  face: PlanarPolygon
  constraint: RegularPolygonConstraint
}

export interface DeleteRegularPolygonParams {
  face: PlanarPolygon
  constraint: RegularPolygonConstraint
  dependentPoints: Point3[]
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface RegularPolygonUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  edgeLengthLocked?: boolean
  lockedEdgeLength?: number | null
}

export const regularPolygonFeaturePlugin: FeaturePlugin = {
  type: 'regularPolygon',

  getDependencies(params) {
    const p = params as unknown as RegularPolygonFeatureParams
    return p.points.map((point) => point.id)
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as RegularPolygonFeatureParams

    params.points.forEach((point) => scene.addPoint(point))
    params.boundaryLines.forEach((line) => scene.addLine(line))
    scene.addFace(params.face)
    scene.addRegularPolygonConstraint(params.constraint)

    return {
      elementIds: {
        points: params.points.map((p) => p.id),
        lines: params.boundaryLines.map((l) => l.id),
        faces: [params.face.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as RegularPolygonUpdateState
    const polygonParams = feature.params as unknown as RegularPolygonFeatureParams
    const constraint = (scene.regularPolygonConstraints.get(feature.id) as unknown as RegularPolygonConstraint | undefined) ?? polygonParams.constraint
    if (!constraint) {
      throw new Error(`RegularPolygonFeature: constraint "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) constraint.name = state.name
    if (state.nameVisible !== undefined) constraint.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) constraint.valueVisible = state.valueVisible
    if (state.edgeLengthLocked !== undefined) constraint.edgeLengthLocked = state.edgeLengthLocked
    if (state.lockedEdgeLength !== undefined) constraint.lockedEdgeLength = state.lockedEdgeLength

    const faceId = constraint.faceId ?? polygonParams.face.id
    return { elementIds: { faces: [faceId] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    void geometry
    const deleteParams = feature.params as unknown as DeleteRegularPolygonParams

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

    deleteParams.dependentPoints?.forEach((point) => {
      scene.points.delete(point.id)
      scene.selection.points.delete(point.id)
    })

    scene.removeRegularPolygonConstraint(deleteParams.constraint.constraintId)
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
