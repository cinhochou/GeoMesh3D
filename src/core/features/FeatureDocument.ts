// src/core/features/FeatureDocument.ts
// Document API：把 Feature 创建/删除/更新封装为对 Scene 的一次事务操作，
// 并生成可撤销的 HistoryEntry。这是外部程序和 UI 调用作图能力的统一入口。

import type { Feature, FeatureType, GeneratedGeometry } from './Feature'
import { featureRegistry } from './FeatureRegistry'
import { SnapshotCommand } from '../editor/commands/SnapshotCommand'
import type { Scene } from '../scene/Scene'
import type { HistoryEntry } from '../editor/HistoryManager'

const genId = (prefix: string) => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}

export interface CreateOperation {
  op: 'create'
  featureType: FeatureType
  id?: string
  params: Record<string, unknown>
}

export interface DeleteOperation {
  op: 'delete'
  featureType: FeatureType
  featureId: string
  /** 复杂几何的删除需要依赖信息时，通过 params 传入；简单几何可省略。 */
  params?: Record<string, unknown>
}

export interface UpdateOperation {
  op: 'update'
  featureType: FeatureType
  featureId: string
  params: Record<string, unknown>
}

export type FeatureOperation = CreateOperation | DeleteOperation | UpdateOperation

interface FeatureEntry {
  feature: Feature
  geometry: GeneratedGeometry
}

/**
 * FeatureDocument 是 Scene 之上的一层薄封装。
 * 它维护 Feature 与生成几何之间的映射，并提供基于操作描述（Operation）的 API。
 */
export class FeatureDocument {
  /**
   * featureId -> Feature 及其生成的几何元素描述。
   */
  private entries = new Map<string, FeatureEntry>()

  constructor(
    private scene: Scene,
    private pushHistory?: (entry: HistoryEntry) => void,
  ) {}

  /**
   * 根据操作描述执行一次作图操作。
   * 返回生成的 HistoryEntry，方便调用方继续处理（如批量提交事务）。
   */
  applyOperation(operation: FeatureOperation): HistoryEntry {
    switch (operation.op) {
      case 'create':
        return this.applyCreate(operation)
      case 'delete':
        return this.applyDelete(operation)
      case 'update':
        return this.applyUpdate(operation)
    }
  }

  /**
   * 创建一个 Feature 并加入 Scene，同时记录历史。
   */
  createFeature(type: FeatureType, params: Record<string, unknown>): HistoryEntry {
    return this.applyCreate({ op: 'create', featureType: type, params })
  }

  private applyCreate(operation: CreateOperation): HistoryEntry {
    const feature: Feature = {
      id: operation.id ?? genId(operation.featureType),
      type: operation.featureType,
      params: operation.params,
      dependencies: featureRegistry.get(operation.featureType)?.getDependencies(operation.params) ?? [],
    }

    let geometry: GeneratedGeometry | undefined
    const cmd = new SnapshotCommand(`create-${feature.type}`, this.scene, () => {
      geometry = featureRegistry.create(this.scene, feature)
    })
    cmd.executeAndCapture()

    if (!geometry) {
      throw new Error(`FeatureDocument: create failed for feature "${feature.id}"`)
    }
    this.entries.set(feature.id, { feature, geometry })

    if (this.pushHistory) {
      this.pushHistory(cmd)
    }
    return cmd
  }

  private applyDelete(operation: DeleteOperation): HistoryEntry {
    const entry = this.entries.get(operation.featureId)
    if (!entry) {
      throw new Error(`FeatureDocument: cannot delete unknown feature "${operation.featureId}"`)
    }

    const feature: Feature = {
      ...entry.feature,
      params: operation.params ?? entry.feature.params,
    }

    const cmd = new SnapshotCommand(`delete-${feature.type}`, this.scene, () => {
      featureRegistry.delete(this.scene, feature, entry.geometry)
      this.entries.delete(feature.id)
    })
    cmd.executeAndCapture()

    if (this.pushHistory) {
      this.pushHistory(cmd)
    }
    return cmd
  }

  private applyUpdate(operation: UpdateOperation): HistoryEntry {
    const entry = this.entries.get(operation.featureId)
    if (!entry) {
      throw new Error(`FeatureDocument: cannot update unknown feature "${operation.featureId}"`)
    }

    const feature: Feature = {
      ...entry.feature,
      params: operation.params,
      dependencies: featureRegistry.get(operation.featureType)?.getDependencies(operation.params) ?? [],
    }

    const cmd = new SnapshotCommand(`update-${feature.type}`, this.scene, () => {
      const updated = featureRegistry.update(this.scene, feature, entry.geometry, operation.params)
      this.entries.set(feature.id, { feature, geometry: updated })
    })
    cmd.executeAndCapture()

    if (this.pushHistory) {
      this.pushHistory(cmd)
    }
    return cmd
  }

  /**
   * 获取某个 Feature 当前生成的几何元素描述。
   */
  getGeometry(featureId: string): GeneratedGeometry | undefined {
    return this.entries.get(featureId)?.geometry
  }

  /**
   * 手动注册 Feature 与生成几何的映射。
   * 用于兼容从旧命令迁移过来的场景：旧命令已经创建了几何体，
   * 但后续仍希望把这次创建当作一个 Feature 来管理。
   */
  registerGeometry(featureId: string, geometry: GeneratedGeometry, params: Record<string, unknown> = {}): void {
    const feature: Feature = {
      id: featureId,
      type: this.inferFeatureType(geometry),
      params,
      dependencies: [],
    }
    this.entries.set(featureId, { feature, geometry })
  }

  private inferFeatureType(geometry: GeneratedGeometry): FeatureType {
    if (geometry.elementIds.points && !geometry.elementIds.lines && !geometry.elementIds.faces) return 'point'
    if (geometry.elementIds.lines) return 'line'
    if (geometry.elementIds.circles) return 'circle'
    if (geometry.elementIds.faces) return 'face'
    if (geometry.elementIds.spheres) return 'sphere'
    if (geometry.elementIds.cones) return 'cone'
    if (geometry.elementIds.cylinders) return 'cylinder'
    if (geometry.elementIds.cubes) return 'hexahedron'
    if (geometry.elementIds.perpendicularLines) return 'perpendicularLine'
    if (geometry.elementIds.parallelLines) return 'parallelLine'
    return 'point'
  }
}
