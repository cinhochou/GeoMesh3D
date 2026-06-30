// src/core/features/FeatureAddHelper.ts
// 通用创建命令：把 FeatureRegistry.create 包装成一个 SnapshotCommand，
// 使所有 Add 命令都可以复用同一个 HistoryEntry 外壳。

import { SnapshotCommand } from '../editor/commands/SnapshotCommand'
import { Scene } from '../scene/Scene'
import { featureRegistry } from './FeatureRegistry'
import type { FeatureType } from './Feature'

export function createAddFeatureCommand(
  scene: Scene,
  id: string,
  type: FeatureType,
  params: Record<string, unknown>,
): SnapshotCommand {
  const dependencies = featureRegistry.get(type)?.getDependencies(params) ?? []
  const cmd = new SnapshotCommand(`add-${type}`, scene, () => {
    featureRegistry.create(scene, { id, type, params, dependencies })
  })

  cmd.executeAndCapture()
  return cmd
}
