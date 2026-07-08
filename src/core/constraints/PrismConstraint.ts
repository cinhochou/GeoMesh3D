// src/core/constraints/PrismConstraint.ts
// 棱柱约束：以一个底面多边形 + 一个外部顶点（最高点）构造棱柱。
// 语义参考 GeoGebra3D 棱柱工具：底面多边形沿「底面参考顶点 → 最高点」向量平移得到顶面，
// 顶面其余顶点为 dependent，由约束求解实时跟随底面/最高点变化。
// 模式 A：直接管理 Point3/Line3/PlanarPolygon + PrismConstraint，与 CubeConstraint 一致。

import { Vec3 } from '../geometry/Vec3'
import { Scene } from '../scene/Scene'
import { computePlaneBasis, type PlaneBasis } from '../geometry/PlanarUtils'

/**
 * 棱柱 dependent 顶点布局。
 * 每个 dependent 顶点对应底面多边形 boundaryPointIds[baseIndex] 经平移后的顶点。
 * （baseIndex 不等于 ownerPointIds[0] 对应的底面参考顶点索引，因为参考顶点的对应顶点即最高点本身。）
 */
type PrismPointLayout = {
  pointId: string
  baseIndex: number
}

const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)

const subtract = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)

const addVec = (a: Vec3, b: Vec3) => new Vec3(a.x + b.x, a.y + b.y, a.z + b.z)

const scale = (v: Vec3, s: number) => new Vec3(v.x * s, v.y * s, v.z * s)

const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z

export class PrismConstraint {
  constructor(
    private scene: Scene,
    public readonly prismId: string,
    /**
     * ownerPointIds[0]：底面多边形的参考顶点 id（底面 boundaryPointIds 中与最高点最近的那个）。
     * ownerPointIds[1]：用户选中的最高点 id（棱柱顶面对应顶点）。
     * 这两个点共同定义棱柱的平移向量 = 最高点位置 - 参考顶点位置。
     */
    public readonly ownerPointIds: [string, string],
    public readonly dependentLayouts: PrismPointLayout[],
    public readonly bottomFaceId: string,
    public readonly topFaceId: string,
    public readonly sideFaceIds: string[],
    /** 底面参考顶点在 bottomFace.boundaryPointIds 中的索引，便于求解时定位。 */
    public readonly baseReferenceIndex: number,
    /**
     * vAxisHint：保留字段，与 CubeConstraint/RegularPolygonConstraint 保持接口一致。
     * 棱柱轴向即平移向量方向，求解时直接由 owner 两点计算，hint 仅用于记录/协作回放。
     */
    private readonly vAxisHint: Vec3,
    public name: string = '棱柱1',
    public valueVisible: boolean = false,
    /** 是否保持棱柱侧棱垂直于底面（直棱柱模式）。 */
    public keepVertical: boolean = false,
    /** 垂直模式下缓存的棱柱高度，保证底面变化时高度不变。 */
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

  /** 垂直模式下：返回当前缓存的带符号垂直高度；未缓存时从当前最高点计算。 */
  getVerticalHeight(): number {
    if (this.verticalHeight !== null) return this.verticalHeight
    const axes = this.getSlantAxes()
    return axes?.height ?? 0
  }

  /** 更新垂直模式缓存高度（允许负值，表示最高点在底面法线反方向）。 */
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
    const baseRefVertex = this.scene.points.get(this.ownerPointIds[0])
    if (!baseRefVertex) return null

    const basis = this.getBottomPlaneBasis()
    if (!basis) return null

    const dx = position.x - baseRefVertex.position.x
    const dy = position.y - baseRefVertex.position.y
    const dz = position.z - baseRefVertex.position.z
    const projectedHeight = dx * basis.normal.x + dy * basis.normal.y + dz * basis.normal.z
    if (Math.abs(projectedHeight) > 1e-8) return projectedHeight

    const translationLength = Math.hypot(dx, dy, dz)
    return projectedHeight >= 0 ? translationLength : -translationLength
  }

  /**
   * 计算开启垂直保持后最高点的目标位置（不修改状态）。
   * 用于命令构造时快照撤销/重做所需的位置，避免提前改变场景。
   */
  computeVerticalTopPosition(): Vec3 | null {
    const baseRefVertex = this.scene.points.get(this.ownerPointIds[0])
    const topPoint = this.scene.points.get(this.ownerPointIds[1])
    if (!baseRefVertex || !topPoint) return null

    const basis = this.getBottomPlaneBasis()
    if (!basis) return null

    const currentTranslation = subtract(topPoint.position, baseRefVertex.position)
    const projectedHeight = dot(currentTranslation, basis.normal)
    const translationLength = length(currentTranslation)
    const effectiveHeight =
      Math.abs(projectedHeight) > 1e-8
        ? projectedHeight
        : projectedHeight >= 0
          ? translationLength
          : -translationLength
    return addVec(baseRefVertex.position, scale(basis.normal, effectiveHeight))
  }

  /**
   * 求解棱柱的平移向量与高度（斜棱柱模式）。
   * translation = topPoint.position - baseRefVertex.position
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
   * 求解棱柱的平移向量与高度。
   * 开启 keepVertical 时，translation 始终垂直于底面（沿底面法线方向）。
   */
  getResolvedAxes() {
    if (!this.keepVertical) return this.getSlantAxes()

    const baseRefVertex = this.scene.points.get(this.ownerPointIds[0])
    const topPoint = this.scene.points.get(this.ownerPointIds[1])
    if (!baseRefVertex || !topPoint) return null

    const basis = this.getBottomPlaneBasis()
    if (!basis) return this.getSlantAxes()

    // 最高点被直接移动时（包括编辑、拖拽、撤销/重做），用当前位置更新缓存高度，
    // 使其可沿法线方向移动，同时保证 undo/redo 后缓存高度与位置一致。
    if (!topPoint.locked && this.scene.isPointDirty(topPoint.id)) {
      const currentTranslation = subtract(topPoint.position, baseRefVertex.position)
      const projectedHeight = dot(currentTranslation, basis.normal)
      if (Math.abs(projectedHeight) > 1e-8) {
        this.verticalHeight = projectedHeight
      }
    }

    const signedHeight = this.getVerticalHeight()
    if (!Number.isFinite(signedHeight)) return this.getSlantAxes()

    const translation = scale(basis.normal, signedHeight)
    return {
      origin: baseRefVertex.position,
      translation,
      height: Math.abs(signedHeight),
    }
  }

  /**
   * 根据底面顶点索引计算对应顶面顶点位置 = bottomVertex[baseIndex] + translation。
   */
  getLayoutPosition(
    baseIndex: number,
    axes: NonNullable<ReturnType<PrismConstraint['getResolvedAxes']>>,
  ) {
    const bottomFace = this.scene.faces.get(this.bottomFaceId)
    if (!bottomFace) return null
    const bottomVertexId = bottomFace.boundaryPointIds[baseIndex]
    const bottomVertex = bottomVertexId ? this.scene.points.get(bottomVertexId) : null
    if (!bottomVertex) return null
    return addVec(bottomVertex.position, axes.translation)
  }

  getDependencyPointIds() {
    return [
      this.ownerPointIds[0],
      this.ownerPointIds[1],
      ...this.dependentLayouts.map((item) => item.pointId),
    ]
  }

  /** 获取底面多边形（原始选中的多边形）。 */
  getBottomFace() {
    return this.scene.faces.get(this.bottomFaceId) ?? null
  }

  /** 棱柱高度 = 平移向量长度。 */
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

  /** 体积 = 底面积 × 高。 */
  getVolume() {
    const baseArea = this.getBaseArea()
    const height = this.getHeight()
    if (baseArea <= 0 || height <= 0) return 0
    return baseArea * height
  }

  /** 侧面积 = 各侧面面积之和。 */
  getLateralArea() {
    let lateral = 0
    for (const sideFaceId of this.sideFaceIds) {
      const sideFace = this.scene.faces.get(sideFaceId)
      if (!sideFace) continue
      lateral += sideFace.getArea(this.scene.points)
    }
    return lateral
  }

  /** 表面积 = 2 × 底面积 + 侧面积。 */
  getSurfaceArea() {
    return 2 * this.getBaseArea() + this.getLateralArea()
  }

  /** 棱柱几何中心 = 底面中心与顶面中心的中点。 */
  getCentroid() {
    const bottomFace = this.getBottomFace()
    const topFace = this.scene.faces.get(this.topFaceId)
    if (!bottomFace || !topFace) return null
    const bottomCentroid = bottomFace.getCentroid(this.scene.points)
    const topCentroid = topFace.getCentroid(this.scene.points)
    return new Vec3(
      (bottomCentroid.x + topCentroid.x) / 2,
      (bottomCentroid.y + topCentroid.y) / 2,
      (bottomCentroid.z + topCentroid.z) / 2,
    )
  }

  solve() {
    const axes = this.getResolvedAxes()
    if (!axes) return

    // 垂直模式下，最高点也应被约束到底面法线方向上
    if (this.keepVertical) {
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

    this.dependentLayouts.forEach(({ pointId, baseIndex }) => {
      const point = this.scene.points.get(pointId)
      if (!point || point.locked) return
      const next = this.getLayoutPosition(baseIndex, axes)
      if (!next) return
      point.setPosition(next)
    })
  }

  /**
   * 切换 keepVertical 状态。
   * 开启时：以底面为基准，将最高点强行矫正到底面法线方向上，并缓存当前高度。
   * 关闭时：清空缓存高度，恢复斜棱柱自由模式。
   * 返回切换后是否需要对最高点进行位置矫正。
   */
  setKeepVertical(value: boolean): { changed: boolean; correction: Vec3 | null } {
    if (this.keepVertical === value) return { changed: false, correction: null }

    this.keepVertical = value

    if (value) {
      const baseRefVertex = this.scene.points.get(this.ownerPointIds[0])
      const topPoint = this.scene.points.get(this.ownerPointIds[1])
      if (!baseRefVertex || !topPoint) return { changed: true, correction: null }

      const basis = this.getBottomPlaneBasis()
      if (!basis) return { changed: true, correction: null }

      const currentTranslation = subtract(topPoint.position, baseRefVertex.position)
      const height = dot(currentTranslation, basis.normal)
      const translationLength = length(currentTranslation)
      const effectiveHeight =
        Math.abs(height) > 1e-8
          ? height
          : height >= 0
            ? translationLength
            : -translationLength
      this.verticalHeight = effectiveHeight

      const expectedTop = addVec(baseRefVertex.position, scale(basis.normal, effectiveHeight))
      return { changed: true, correction: expectedTop }
    }

    this.verticalHeight = null
    return { changed: true, correction: null }
  }
}
