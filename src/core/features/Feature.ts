// src/core/features/Feature.ts
// Feature 抽象层：把“创建/更新/删除几何体”建模为可注册、可重建的参数化特征。
// 该层不依赖具体 UI，也不直接操作 Scene 的细节 Map，只通过 Scene 的公开 add/remove 方法生效。

import type { Scene } from '../scene/Scene'

/**
 * 所有支持的 Feature 类型。
 * 新增几何类型时只需要在这里扩展枚举，并注册对应的 FeaturePlugin。
 */
export type FeatureType =
  | 'point'
  | 'line'
  | 'straightLine'
  | 'ray'
  | 'vector'
  | 'circle'
  | 'sphere'
  | 'cone'
  | 'cylinder'
  | 'face'
  | 'perpendicularLine'
  | 'parallelLine'
  | 'hexahedron'
  | 'intersectionPoint'
  | 'constrainedPoint'
  | 'regularPolygon'

/**
 * 一个 Feature 是用户一次作图意图的参数化描述。
 * 它只包含 id、类型、参数和依赖的 feature id，不持有具体几何对象引用。
 */
export interface Feature<TParams = Record<string, unknown>> {
  readonly id: string
  readonly type: FeatureType
  readonly params: TParams
  readonly dependencies: readonly string[]
}

/**
 * Feature 生成后返回的“产物描述”。
 * 用于在删除或更新时快速定位该 Feature 贡献到 Scene 中的具体元素。
 */
export interface GeneratedGeometry {
  /**
   * 按元素类型分类的 id 列表。
   * 键与 Scene 中的容器名称保持一致，例如：
   * { points: ['p1'], spheres: ['sph_1'] }
   */
  readonly elementIds: Record<string, string[]>
}

/**
 * Feature 插件接口。
 * 每个几何类型实现一个插件并注册到 FeatureRegistry。
 */
export interface FeaturePlugin {
  readonly type: FeatureType

  /**
   * 根据参数在 Scene 中创建几何元素。
   * 返回该 Feature 生成的元素 id 集合，供删除/更新使用。
   *
   * 插件内部负责把 feature.params 断言为具体参数类型。
   */
  create(scene: Scene, feature: Feature): GeneratedGeometry

  /**
   * 可选：从 Scene 中删除该 Feature 生成的元素。
   * 如果插件不提供，则框架根据 GeneratedGeometry.elementIds 执行通用删除。
   */
  delete?(scene: Scene, feature: Feature, geometry: GeneratedGeometry): void

  /**
   * 可选：根据新参数更新 Scene 中已存在的元素。
   * 返回更新后的产物描述。
   */
  update?(
    scene: Scene,
    feature: Feature,
    geometry: GeneratedGeometry,
    params: Record<string, unknown>,
  ): GeneratedGeometry

  /**
   * 从参数中提取该 Feature 依赖的其他 Feature id。
   * 用于构建 DAG 和级联更新。
   */
  getDependencies(params: Record<string, unknown>): string[]
}
