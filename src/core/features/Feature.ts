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
  | 'prism'
  | 'pyramid'

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

import { toSubscriptName } from '../geometry/displayName'

/** 要素类型的中文名（历史标签、动画步骤标签等显示层统一取自这里） */
export const FEATURE_TYPE_LABELS: Record<FeatureType, string> = {
  point: '点',
  line: '线段',
  straightLine: '直线',
  ray: '射线',
  vector: '向量',
  circle: '圆',
  sphere: '两点球',
  cone: '圆锥',
  cylinder: '圆柱',
  face: '多边形面',
  perpendicularLine: '垂线',
  parallelLine: '平行线',
  hexahedron: '正六面体',
  intersectionPoint: '交点',
  constrainedPoint: '约束点',
  regularPolygon: '正多边形',
  prism: '棱柱',
  pyramid: '棱锥',
}

/**
 * 构造可读的操作标签：`动词 + 类型中文名 + 名称`。
 *
 * ⚠ 历史/动画步骤标签**不要**再用 `add-${type}` 这类内部机器名 ——
 * 它们会原样出现在时间轴的步骤标题与悬停提示里（用户反馈「第 1 步：add-point」）。
 * 名称本身已含类型词时不重复拼接（例如名称就是「正六面体1」）。
 */
export function buildFeatureActionLabel(
  action: '创建' | '删除' | '更新',
  type: FeatureType,
  name?: unknown,
): string {
  const typeName = FEATURE_TYPE_LABELS[type] ?? type
  // 名称按侧栏同一口径做下标化（正六面体1 → 正六面体₁），保证两处显示一致
  const text = toSubscriptName(typeof name === 'string' ? name.trim() : '')
  if (!text) return `${action}${typeName}`
  return text.includes(typeName) ? `${action}${text}` : `${action}${typeName} ${text}`
}

/**
 * 从特征参数里解析可读名称。
 *
 * 各类型的参数结构不统一：点/线等是扁平的（顶层就有 name），
 * 而圆/面/垂线是嵌套对象、正六面体等实体是 `{ constraint }`。
 * 因此这里同时看顶层 name 与常见嵌套对象的 name，供标签构造统一取用。
 */
export function resolveFeatureName(params: Record<string, unknown> | undefined): string | undefined {
  if (!params) return undefined
  const direct = params.name
  if (typeof direct === 'string' && direct.trim()) return direct.trim()
  for (const key of ['constraint', 'circle', 'face', 'line', 'sphere', 'cone', 'cylinder']) {
    const nested = params[key] as { name?: unknown } | undefined
    if (nested && typeof nested.name === 'string' && nested.name.trim()) return nested.name.trim()
  }
  return undefined
}
