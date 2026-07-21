// src/core/features/plugins/HexahedronFeature.ts
// Hexahedron（立方体）的 Feature 插件。当前接收已构造好的几何对象集合，
// 将其加入场景；后续可逐步参数化。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import type { Point3 } from '../../geometry/Point3'
import type { Line3 } from '../../geometry/Line3'
import type { PlanarPolygon } from '../../geometry/PlanarPolygon'
import type { CubeConstraint } from '../../constraints/CubeConstraint'
import type { IntersectionPointConstraint } from '../../constraints/IntersectionPointConstraint'
import type { PerpendicularLine3 } from '../../geometry/PerpendicularLine3'
import type { ParallelLine3 } from '../../geometry/ParallelLine3'

export interface HexahedronFeatureParams {
  points: Point3[]
  boundaryLines: Line3[]
  faces: PlanarPolygon[]
  constraint: CubeConstraint
}

export interface DeleteHexahedronParams {
  faces: PlanarPolygon[]
  dependentPoints: Point3[]
  constraint: CubeConstraint
  dependentIntersectionPoints: Array<{
    point: Point3
    constraint: IntersectionPointConstraint
  }>
  relatedPerpendicularLines: PerpendicularLine3[]
  relatedParallelLines: ParallelLine3[]
}

export interface CubeUpdateState {
  name?: string
  valueVisible?: boolean
  edgeLengthLocked?: boolean
  lockedEdgeLength?: number | null
}

export const hexahedronFeaturePlugin: FeaturePlugin = {
  type: 'hexahedron',

  getDependencies(params) {
    const p = params as unknown as HexahedronFeatureParams
    return p.points.map((point) => point.id)
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as HexahedronFeatureParams

    params.points.forEach((point) => scene.addPoint(point))
    params.boundaryLines.forEach((line) => scene.addLine(line))
    params.faces.forEach((face) => scene.addFace(face))
    scene.addCubeConstraint(params.constraint)

    return {
      elementIds: {
        points: params.points.map((p) => p.id),
        lines: params.boundaryLines.map((l) => l.id),
        faces: params.faces.map((f) => f.id),
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as CubeUpdateState
    const cube = scene.cubeConstraints.get(feature.id) as unknown as CubeConstraint | undefined
    if (!cube) {
      throw new Error(`HexahedronFeature: cube "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) cube.name = state.name
    if (state.valueVisible !== undefined) cube.valueVisible = state.valueVisible
    if (state.edgeLengthLocked !== undefined) cube.edgeLengthLocked = state.edgeLengthLocked
    if (state.lockedEdgeLength !== undefined) cube.lockedEdgeLength = state.lockedEdgeLength

    return { elementIds: { cubes: [cube.cubeId] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    void geometry
    const deleteParams = feature.params as unknown as DeleteHexahedronParams
    const cubeId = deleteParams.constraint.cubeId

    const associatedNets = scene.getNetsForSolid(cubeId)
    associatedNets.forEach((net) => {
      scene.removeNet(net.id)
    })

    deleteParams.relatedPerpendicularLines?.forEach((line) => {
      scene.removePerpendicularLine(line.id)
      scene.selection.perpendicularLines.delete(line.id)
    })
    deleteParams.relatedParallelLines?.forEach((line) => {
      scene.removeParallelLine(line.id)
      scene.selection.parallelLines.delete(line.id)
    })

    scene.removeCubeConstraint(cubeId)
    deleteParams.faces.forEach((face) => scene.removeFace(face.id))

    const allBoundaryLineIds = new Set(deleteParams.faces.flatMap((face) => face.boundaryLineIds))
    const deletedBoundaryLines = [...allBoundaryLineIds]
      .map((lineId) => scene.lines.get(lineId))
      .filter((line): line is Line3 => line !== undefined && line.faceOwned)

    deletedBoundaryLines.forEach((line) => {
      scene.lines.delete(line.id)
      scene.selection.lines.delete(line.id)
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
  },
}
