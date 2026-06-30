// src/core/features/FeatureUpdateCommand.ts
// 通用更新命令：把“before/after + apply”的重复模式收敛到一个命令类。
// 实际的状态应用由 FeatureRegistry 中对应插件的 update 方法完成。

import { ConstraintAwareCommand } from '../editor/commands/ConstraintAwareCommand'
import { featureRegistry } from './FeatureRegistry'
import type { Feature, GeneratedGeometry } from './Feature'
import type { Scene } from '../scene/Scene'

export class UpdateFeatureCommand extends ConstraintAwareCommand {
  readonly label: string

  constructor(
    scene: Scene,
    label: string,
    private feature: Feature,
    private geometry: GeneratedGeometry,
    private before: Record<string, unknown>,
    private after: Record<string, unknown>,
    affectedPointIds: string[],
  ) {
    super(scene)
    this.label = label
    this.markAffected(...affectedPointIds)
  }

  protected doExecute(): void {
    featureRegistry.update(this.scene, this.feature, this.geometry, this.after)
  }

  protected doUndo(): void {
    featureRegistry.update(this.scene, this.feature, this.geometry, this.before)
  }
}

/**
 * 工厂函数：构造一个通用的更新命令。
 * 调用方只需要提供目标 Feature、产物描述、before/after 状态以及受影响的点 ID。
 */
export function createUpdateFeatureCommand(
  scene: Scene,
  label: string,
  feature: Feature,
  geometry: GeneratedGeometry,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  affectedPointIds: string[],
): UpdateFeatureCommand {
  return new UpdateFeatureCommand(scene, label, feature, geometry, before, after, affectedPointIds)
}
