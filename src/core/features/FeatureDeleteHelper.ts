// src/core/features/FeatureDeleteHelper.ts
// 辅助函数：把简单几何体的删除也纳入 FeatureRegistry 统一处理。

import type { Feature, FeatureType, GeneratedGeometry } from './Feature'
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

  const cmd = new SnapshotCommand(`delete-${featureType}`, scene, () => {
    featureRegistry.delete(scene, feature, geometry)
  })

  cmd.executeAndCapture()
  return cmd
}
