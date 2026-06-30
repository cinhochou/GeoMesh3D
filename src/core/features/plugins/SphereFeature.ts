// src/core/features/plugins/SphereFeature.ts
// Sphere 的 Feature 插件。把“两点球体”或“半径球体”的创建逻辑从命令文件下沉到这里。

import type { Feature, FeaturePlugin, GeneratedGeometry } from '../Feature'
import type { Scene } from '../../scene/Scene'
import { Sphere3 } from '../../geometry/Sphere3'

export interface SphereFeatureParams {
  /** 球体中心点 id */
  centerPointId: string
  /** 半径点 id；为空时表示使用 radiusValue */
  radiusPointId?: string
  /** 半径数值；仅在 radiusPointId 为空时使用 */
  radiusValue?: number
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

export interface SphereUpdateState {
  name?: string
  nameVisible?: boolean
  valueVisible?: boolean
  labelOffsetX?: number
  labelOffsetY?: number
  visible?: boolean
  userLocked?: boolean
  radiusValue?: number
}

export const sphereFeaturePlugin: FeaturePlugin = {
  type: 'sphere',

  getDependencies(params) {
    const p = params as unknown as SphereFeatureParams
    const deps: string[] = [p.centerPointId]
    if (p.radiusPointId) deps.push(p.radiusPointId)
    return deps
  },

  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const params = feature.params as unknown as SphereFeatureParams
    const centerPoint = scene.points.get(params.centerPointId)
    if (!centerPoint) {
      throw new Error(`SphereFeature: center point "${params.centerPointId}" not found`)
    }

    const radiusPoint = params.radiusPointId ? scene.points.get(params.radiusPointId) ?? null : null

    const sphere = new Sphere3(
      feature.id,
      params.name ?? '球体',
      centerPoint,
      radiusPoint,
      params.nameVisible ?? true,
      params.visible ?? true,
      false,
      params.labelOffsetX ?? 0,
      params.labelOffsetY ?? 0,
      params.valueVisible ?? true,
      params.radiusValue ?? 0,
    )

    scene.addSphere(sphere)
    sphere.centerPoint.sphereId = sphere.id
    sphere.centerPoint.sphereRole = 'center'
    if (sphere.radiusPoint) {
      sphere.radiusPoint.sphereId = sphere.id
      sphere.radiusPoint.sphereRole = 'radius'
    }

    return {
      elementIds: {
        spheres: [sphere.id],
      },
    }
  },

  update(scene: Scene, feature: Feature, _geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    void _geometry
    const state = params as unknown as SphereUpdateState
    const sphere = scene.spheres.get(feature.id)
    if (!sphere) {
      throw new Error(`SphereFeature: sphere "${feature.id}" not found for update`)
    }

    if (state.name !== undefined) sphere.name = state.name
    if (state.nameVisible !== undefined) sphere.nameVisible = state.nameVisible
    if (state.valueVisible !== undefined) sphere.valueVisible = state.valueVisible
    if (state.labelOffsetX !== undefined) sphere.labelOffsetX = state.labelOffsetX
    if (state.labelOffsetY !== undefined) sphere.labelOffsetY = state.labelOffsetY
    if (state.visible !== undefined) sphere.visible = state.visible
    if (state.userLocked !== undefined) sphere.userLocked = state.userLocked
    if (state.radiusValue !== undefined) sphere.radiusValue = state.radiusValue

    return { elementIds: { spheres: [sphere.id] } }
  },

  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    const sphereIds = geometry.elementIds.spheres
    if (!sphereIds) return
    for (const sphereId of sphereIds) {
      if (!sphereId) continue
      const sphere = scene.spheres.get(sphereId)
      if (!sphere) continue
      sphere.centerPoint.sphereId = null
      sphere.centerPoint.sphereRole = null
      if (sphere.radiusPoint) {
        sphere.radiusPoint.sphereId = null
        sphere.radiusPoint.sphereRole = null
      }
      scene.removeSphere(sphereId)
      scene.selection.spheres.delete(sphereId)
    }
  },
}
