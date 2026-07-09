// src/core/constraints/PyramidConstraint.ts
// 棱锥约束：以一个底面多边形 + 一个外部顶点（最高点/apex）构造棱锥。
// 语义参考 GeoGebra3D 棱锥工具：底面多边形为 owner，apex 为 owner，
// 侧面为三角形（底边 + apex），顶面退化为 apex 单点（无顶面、无 dependent 顶点）。
// 模式 A：直接管理 Point3/Line3/PlanarPolygon + PyramidConstraint，与 PrismConstraint 一致。

import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'
import { computePlaneBasis, type PlaneBasis } from '../geometry/PlanarUtils'

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

const subtract = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)

const addVec = (a: Vec3, b: Vec3) => new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)

const scale = (v: Vec3, s: number) => new Vec3(v.x * s, v.y * s, v.z * s)

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

export class PyramidConstraint {
  constructor(
    private scene: Scene,
    public readonly pyramidId: string,
    /**
     * ownerPointIds[0]：底面多边形的参考顶点 id（底面 boundaryPointIds 中与 apex 最近的那个）。
     * ownerPointIds[1]：用户选中的 apex（最高点）id。
     * 这两个点共同定义棱锥的高度向量 = apex 位置 - 参考顶点位置。
     * 棱锥无 dependent 顶点：底面所有顶点与 apex 均为 owner。
     */
    public readonly ownerPointIds: [string, string],
    public readonly bottomFaceId: string,
    /** 侧面 id 列表（每个侧面为三角形：底边 + apex）。无顶面。 */
    public readonly sideFaceIds: string[],
    /** 底面参考顶点在 bottomFace.boundaryPointIds 中的索引，便于求解时定位。 */
    public readonly baseReferenceIndex: number,
    /**
     * vAxisHint：保留字段，与 PrismConstraint 保持接口一致。
     * 棱锥轴向即 apex 相对底面的高度方向，求解时直接由 owner 两点计算，hint 仅用于记录/协作回放。
     */
    private readonly vAxisHint: Vec3,
    public name: string = '棱锥1',
    public valueVisible: boolean = false,
    /** 是否保持 apex 垂直于底面（直棱锥模式：apex 仅沿底面法线方向移动）。 */
    public keepVertical: boolean = false,
    /** 垂直模式下缓存的棱锥高度，保证底面变化时高度不变。 */
    private verticalHeight: number | null = null,
  ) {}

  setAxisHint(nextHint: Vec3) {
    this.vAxisHint.x = nextHint.x
    this.vAxisHint.y = nextHint.y
    this.vAxisHint.z = nextHint.z
  }

  getVAxisHint() {
    return this.vAxisHint
  }

  /** 获取底面多边形的局部坐标系（含法线）。 */
  getBottomPlaneBasis(): PlaneBasis | null {
    const bottomFace = this.getBottomFace()
    if (!bottomFace) return null
    const boundaryPoints = bottomFace
      .getBoundaryPoints(this.scene.points)
      .map((p) => p.position)
    return computePlaneBasis(boundaryPoints)
  }

  /** 垂直模式下：返回当前缓存的带符号垂直高度；未缓存时从当前 apex 计算。 */
  getVerticalHeight(): number {
    if (this.verticalHeight !== null) return this.verticalHeight
    const axes = this.getSlantAxes()
    return axes?.height ?? 0
  }

  /** 更新垂直模式缓存高度（允许负值，表示 apex 在底面法线反方向）。 */
  setVerticalHeight(height: number | null) {
    this.verticalHeight = Number.isFinite(height) ? height : null
  }

  /** 获取当前缓存的原始高度（可能为 null）。 */
  getRawVerticalHeight(): number | null {
    return this.verticalHeight
  }

  /**
   * 计算指定位置在垂直保持模式下对应的带符号缓存高度。
   * 返回 null 表示无法计算（缺少底面或参考顶点）。
   */
  computeVerticalHeightForPosition(position: Vec3): number | null {
    const basis = this.getBottomPlaneBasis()
    if (!basis) return null

    const centroid = this.getBottomCentroid()
    if (!centroid) return null

    const dx = position.x - centroid.x
    const dy = position.y - centroid.y
    const dz = position.z - centroid.z
    const projectedHeight = dx * basis.normal.x + dy * basis.normal.y + dz * basis.normal.z
    if (Math.abs(projectedHeight) > 1e-8) return projectedHeight

    const translationLength = Math.hypot(dx, dy, dz)
    return projectedHeight >= 0 ? translationLength : -translationLength
  }

  /**
   * 计算开启垂直保持后 apex 的目标位置（不修改状态）。
   * 用于命令构造时快照撤销/重做所需的位置，避免提前改变场景。
   * 垂直保持模式下，apex 位于底面重心的正上方（沿底面法线方向）。
   */
  computeVerticalTopPosition(): Vec3 | null {
    const topPoint = this.scene.points.get(this.ownerPointIds[1])
    if (!topPoint) return null

    const basis = this.getBottomPlaneBasis()
    if (!basis) return null

    const centroid = this.getBottomCentroid()
    if (!centroid) return null

    const currentTranslation = subtract(topPoint.position, centroid)
    const projectedHeight = dot(currentTranslation, basis.normal)
    const translationLength = length(currentTranslation)
    const effectiveHeight =
      Math.abs(projectedHeight) > 1e-8
        ? projectedHeight
        : projectedHeight >= 0
          ? translationLength
          : -translationLength
    return addVec(centroid, scale(basis.normal, effectiveHeight))
  }

  /** 获取底面多边形的重心（边界顶点位置的算术平均）。 */
  getBottomCentroid(): Vec3 | null {
    const bottomFace = this.getBottomFace()
    if (!bottomFace) return null
    return bottomFace.getCentroid(this.scene.points)
  }

  /**
   * 求解棱锥的高度向量与高度（斜棱锥模式）。
   * translation = apex.position - baseRefVertex.position
   */
  private getSlantAxes() {
    const p1 = this.scene.points.get(this.ownerPointIds[0])
    const p2 = this.scene.points.get(this.ownerPointIds[1])
    if (!p1 || !p2) return null

    const translation = subtract(p2.position, p1.position)
    const height = length(translation)
    if (height <= 1e-8) return null

    return {
      origin: p1.position,
      translation,
      height,
    }
  }

  /**
   * 求解棱锥的高度向量与高度。
   * 开启 keepVertical 时，translation 始终垂直于底面（沿底面法线方向），
   * apex 位于底面重心的正上方。
   */
  getResolvedAxes() {
    if (!this.keepVertical) return this.getSlantAxes()

    const topPoint = this.scene.points.get(this.ownerPointIds[1])
    if (!topPoint) return null

    const basis = this.getBottomPlaneBasis()
    if (!basis) return this.getSlantAxes()

    const centroid = this.getBottomCentroid()
    if (!centroid) return this.getSlantAxes()

    // apex 被直接移动时（包括编辑、拖拽、撤销/重做），用当前位置更新缓存高度，
    // 使其可沿法线方向移动，同时保证 undo/redo 后缓存高度与位置一致。
    if (!topPoint.locked && this.scene.isPointDirty(topPoint.id)) {
      const currentTranslation = subtract(topPoint.position, centroid)
      const projectedHeight = dot(currentTranslation, basis.normal)
      if (Math.abs(projectedHeight) > 1e-8) {
        this.verticalHeight = projectedHeight
      }
    }

    const signedHeight = this.getVerticalHeight()
    if (!Number.isFinite(signedHeight)) return this.getSlantAxes()

    const translation = scale(basis.normal, signedHeight)
    return {
      origin: centroid,
      translation,
      height: Math.abs(signedHeight),
    }
  }

  /**
   * 棱锥无 dependent 顶点：依赖点集合含底面所有边界顶点与 apex（均为 owner）。
   * 任一点移动都需重新求解（垂直保持模式下 apex 需跟随底面重心变化）。
   */
  getDependencyPointIds() {
    const bottomFace = this.getBottomFace()
    const ids: string[] = []
    if (bottomFace) {
      ids.push(...bottomFace.boundaryPointIds)
    } else {
      ids.push(this.ownerPointIds[0])
    }
    ids.push(this.ownerPointIds[1])
    return [...new Set(ids)]
  }

  /** 获取底面多边形（原始选中的多边形）。 */
  getBottomFace() {
    return this.scene.faces.get(this.bottomFaceId) ?? null
  }

  /** 获取 apex（最高点）。 */
  getApex() {
    return this.scene.points.get(this.ownerPointIds[1]) ?? null
  }

  /** 棱锥高度 = apex 到底面的垂直距离（取绝对值，保证非负）。 */
  getHeight() {
    const axes = this.getResolvedAxes()
    return axes?.height ?? 0
  }

  /** 底面面积。 */
  getBaseArea() {
    const bottomFace = this.getBottomFace()
    if (!bottomFace) return 0
    return bottomFace.getArea(this.scene.points)
  }

  /** 体积 = 底面积 × 高 / 3（棱锥体积公式）。 */
  getVolume() {
    const baseArea = this.getBaseArea()
    const height = this.getHeight()
    if (baseArea <= 0 || height <= 0) return 0
    return (baseArea * height) / 3
  }

  /** 侧面积 = 各侧面（三角形）面积之和。 */
  getLateralArea() {
    let lateral = 0
    for (const sideFaceId of this.sideFaceIds) {
      const sideFace = this.scene.faces.get(sideFaceId)
      if (!sideFace) continue
      lateral += sideFace.getArea(this.scene.points)
    }
    return lateral
  }

  /** 表面积 = 底面积 + 侧面积（无顶面，不乘 2）。 */
  getSurfaceArea() {
    return this.getBaseArea() + this.getLateralArea()
  }

  /** 棱锥几何重心 = 底面重心 × 3/4 + apex × 1/4（棱锥体积重心公式）。 */
  getCentroid() {
    const bottomFace = this.getBottomFace()
    const apex = this.getApex()
    if (!bottomFace || !apex) return null
    const bottomCentroid = bottomFace.getCentroid(this.scene.points)
    return new Vec3(
      bottomCentroid.x * 0.75 + apex.position.x * 0.25,
      bottomCentroid.y * 0.75 + apex.position.y * 0.25,
      bottomCentroid.z * 0.75 + apex.position.z * 0.25,
    )
  }

  solve() {
    // 棱锥无 dependent 顶点需要求解。
    // 垂直模式下，仅需将 apex 约束到底面法线方向上（过底面重心）。
    if (!this.keepVertical) return

    const axes = this.getResolvedAxes()
    if (!axes) return

    const topPoint = this.scene.points.get(this.ownerPointIds[1])
    if (topPoint && !topPoint.locked) {
      const expectedTop = addVec(axes.origin, axes.translation)
      if (
        Math.abs(topPoint.position.x - expectedTop.x) > 1e-9 ||
        Math.abs(topPoint.position.y - expectedTop.y) > 1e-9 ||
        Math.abs(topPoint.position.z - expectedTop.z) > 1e-9
      ) {
        topPoint.setPosition(expectedTop)
      }
    }
  }

  /**
   * 切换 keepVertical 状态。
   * 开启时：以底面为基准，将 apex 强行矫正到底面法线方向上，并缓存当前高度。
   * 关闭时：清空缓存高度，恢复斜棱锥自由模式。
   * 返回切换后是否需要对 apex 进行位置矫正。
   */
  setKeepVertical(value: boolean): { changed: boolean; correction: Vec3 | null } {
    if (this.keepVertical === value) return { changed: false, correction: null }

    this.keepVertical = value

    if (value) {
      const topPoint = this.scene.points.get(this.ownerPointIds[1])
      if (!topPoint) return { changed: true, correction: null }

      const basis = this.getBottomPlaneBasis()
      if (!basis) return { changed: true, correction: null }

      const centroid = this.getBottomCentroid()
      if (!centroid) return { changed: true, correction: null }

      const currentTranslation = subtract(topPoint.position, centroid)
      const height = dot(currentTranslation, basis.normal)
      const translationLength = length(currentTranslation)
      const effectiveHeight =
        Math.abs(height) > 1e-8
          ? height
          : height >= 0
            ? translationLength
            : -translationLength
      this.verticalHeight = effectiveHeight

      const expectedTop = addVec(centroid, scale(basis.normal, effectiveHeight))
      return { changed: true, correction: expectedTop }
    }

    this.verticalHeight = null
    return { changed: true, correction: null }
  }
}
