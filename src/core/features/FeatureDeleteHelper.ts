// src/core/features/FeatureDeleteHelper.ts
// 辅助函数：把简单几何体的删除也纳入 FeatureRegistry 统一处理。

import {
  buildFeatureActionLabel,
  resolveFeatureName,
  type Feature,
  type FeatureType,
  type GeneratedGeometry,
} from './Feature'
import { featureRegistry } from './FeatureRegistry'
import { SnapshotCommand } from '../editor/commands/SnapshotCommand'
import type { Scene } from '../scene/Scene'

export function createDeleteFeatureCommand(
  scene: Scene,
  featureId: string,
  featureType: FeatureType,
  geometry: GeneratedGeometry,
  params: Record<string, unknown> = {},
): SnapshotCommand {
  const feature: Feature = {
    id: featureId,
    type: featureType,
    params,
    dependencies: [],
  }

  const cmd = new SnapshotCommand(
    buildFeatureActionLabel('删除', featureType, resolveFeatureName(params) ?? lookupElementName(scene, featureId)),
    scene,
    () => {
      featureRegistry.delete(scene, feature, geometry)
    },
  )
  // 记录用户真正删除的目标 id（点视图下同一次删除会连带消失多个对象，快照无法反推）
  cmd.deleteTargetId = featureId
  cmd.intent = { category: 'delete', targetId: featureId, targetType: featureType }

  cmd.executeAndCapture()
  return cmd
}

/**
 * 按 id 在场景各集合中查名称（用于生成可读的步骤/历史标签）。
 * 查不到（例如正六面体等以约束 id 挂载的实体）返回 undefined，
 * 此时标签退化为「删除<类型名>」，仍是可读的中文。
 */
function lookupElementName(scene: Scene, id: string): string | undefined {
  // 实体（正六面体/棱柱/棱锥/正多边形）以约束 id 挂载，名称在约束对象上
  const fromConstraint = (map: Map<string, unknown> | undefined): string | undefined => {
    const c = map?.get(id) as { name?: unknown } | undefined
    return typeof c?.name === 'string' && c.name.trim() ? c.name.trim() : undefined
  }
  const solid = (['cubeConstraints', 'prismConstraints', 'pyramidConstraints', 'regularPolygonConstraints'] as const)
    .map((key) => fromConstraint(scene[key] as unknown as Map<string, unknown>))
    .find((n): n is string => !!n)
  if (solid) return solid

  return (
    scene.points.get(id)?.name ??
    scene.lines.get(id)?.name ??
    scene.straightLines.get(id)?.name ??
    scene.rays.get(id)?.name ??
    scene.vectors.get(id)?.name ??
    scene.circles.get(id)?.name ??
    scene.spheres.get(id)?.name ??
    scene.cones.get(id)?.name ??
    scene.cylinders.get(id)?.name ??
    scene.faces.get(id)?.name ??
    scene.perpendicularLines.get(id)?.name ??
    scene.parallelLines.get(id)?.name
  )
}
