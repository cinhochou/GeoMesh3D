// src/core/features/FeatureRegistry.ts
// Feature 插件注册中心。所有几何类型的创建/删除/更新逻辑通过这里注册，
// 而不是分散在各自的命令文件中。

import type { Feature, FeaturePlugin, FeatureType, GeneratedGeometry } from './Feature'
import type { Scene } from '../scene/Scene'

export class FeatureRegistry {
  private plugins = new Map<FeatureType, FeaturePlugin>()

  /**
   * 注册一个 Feature 插件。
   * 同类型的旧插件会被覆盖。
   */
  register(plugin: FeaturePlugin): void {
    this.plugins.set(plugin.type, plugin)
  }

  /**
   * 获取已注册的插件。
   */
  get(type: FeatureType): FeaturePlugin | undefined {
    return this.plugins.get(type)
  }

  /**
   * 在 Scene 中执行 Feature 创建。
   */
  create(scene: Scene, feature: Feature): GeneratedGeometry {
    const plugin = this.get(feature.type)
    if (!plugin) {
      throw new Error(`Feature type "${feature.type}" is not registered`)
    }
    return plugin.create(scene, feature)
  }

  /**
   * 在 Scene 中执行 Feature 删除。
   * 优先使用插件自定义的 delete 方法，否则按 GeneratedGeometry.elementIds 通用删除。
   */
  delete(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void {
    const plugin = this.get(feature.type)
    if (plugin?.delete) {
      plugin.delete(scene, feature, geometry)
      return
    }
    this.deleteByElementIds(scene, geometry.elementIds)
  }

  /**
   * 在 Scene 中执行 Feature 更新。
   * 由插件根据新的 params 修改已存在的几何元素。
   */
  update(scene: Scene, feature: Feature, geometry: GeneratedGeometry, params: Record<string, unknown>): GeneratedGeometry {
    const plugin = this.get(feature.type)
    if (!plugin?.update) {
      throw new Error(`Feature type "${feature.type}" does not support update`)
    }
    return plugin.update(scene, feature, geometry, params)
  }

  /**
   * 通用删除：根据 elementIds 从 Scene 的对应容器中移除元素。
   * 当前仅处理简单几何体；复杂级联删除由插件自定义 delete 实现。
   */
  private deleteByElementIds(scene: Scene, elementIds: Record<string, string[]>): void {
    for (const [kind, ids] of Object.entries(elementIds)) {
      const container = (scene as unknown as Record<string, Map<string, unknown> | undefined>)[kind]
      if (!(container instanceof Map)) continue
      for (const id of ids) {
        const element = container.get(id)
        if (!element) continue

        // 优先调用元素自带的 remove 方法（如 sphere、cone、cylinder 需要清理角色）
        const removable = element as unknown as { remove?: () => void }
        if (typeof removable.remove === 'function') {
          removable.remove()
          continue
        }

        // 否则调用 Scene 上对应的 remove 方法
        const removerName = `remove${kind.charAt(0).toUpperCase()}${kind.slice(1, -1)}`
        const remover = (scene as unknown as Record<string, (id: string) => void>)[removerName]
        if (typeof remover === 'function') {
          remover.call(scene, id)
          continue
        }

        // 最后兜底：直接从 Map 删除，并同步清理选择集
        container.delete(id)
        const selectionSet = (scene.selection as unknown as Record<string, Set<string> | undefined>)[kind]
        selectionSet?.delete(id)
        scene.invalidateRenderSyncCache()
      }
    }
  }
}

/**
 * 全局单例注册表。
 * 后续可通过 plugin 机制替换为按 Document 实例的注册表。
 */
export const featureRegistry = new FeatureRegistry()
