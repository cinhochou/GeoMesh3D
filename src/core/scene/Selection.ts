// src/core/scene/Selection.ts
//
// 场景选中态。除作为编辑器交互的选中容器外，还对外提供**变化通知**：
// 操作录像机（AnimationRecorder）据此旁听选中变化，把「有意义的选中」录成动画步骤。
// 通知只如实汇报「本类发生了变更」，是否值得录制（纯浏览选中、创建后的自动选中、
// 取消选中等）由监听方按操作模式与后续操作过滤 —— 本类不做语义判断。

export class Selection {
  points = new Set<string>()
  lines = new Set<string>()
  straightLines = new Set<string>()
  perpendicularLines = new Set<string>()
  parallelLines = new Set<string>()
  rays = new Set<string>()
  vectors = new Set<string>()
  circles = new Set<string>()
  faces = new Set<string>()
  spheres = new Set<string>()
  cones = new Set<string>()
  cylinders = new Set<string>()
  nets = new Set<string>()

  /**
   * 用户通过 geo-link 按钮显式点击选中的面 id 集合。
   * 这些面即使属于已完全选中的棱柱/棱锥/六面体，也会在场景中独立高亮、
   * 并在选中区作为独立面卡片显示（渲染于多面体卡片之前）。
   */
  explicitFaces = new Set<string>()

  /** 选中态变化监听（单一监听者；传入 null 取消监听） */
  private changeListener: (() => void) | null = null

  /**
   * 注册选中态变化监听。
   * 供操作录像机使用：录制期间把构造性选中缓冲为候选动画步。
   */
  setChangeListener(listener: (() => void) | null) {
    this.changeListener = listener
  }

  private notifyChange() {
    this.changeListener?.()
  }

  clear() {
    this.points.clear()
    this.lines.clear()
    this.straightLines.clear()
    this.perpendicularLines.clear()
    this.parallelLines.clear()
    this.rays.clear()
    this.vectors.clear()
    this.circles.clear()
    this.faces.clear()
    this.spheres.clear()
    this.cones.clear()
    this.cylinders.clear()
    this.nets.clear()
    this.explicitFaces.clear()
    this.notifyChange()
  }

  selectPoint(id: string, additive = false) {
    if (!additive) this.clear()
    this.points.add(id)
    this.notifyChange()
  }

  deselectPoint(id: string) {
    this.points.delete(id)
    this.notifyChange()
  }

  selectLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.lines.add(id)
    this.notifyChange()
  }

  deselectLine(id: string) {
    this.lines.delete(id)
    this.notifyChange()
  }

  selectStraightLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.straightLines.add(id)
    this.notifyChange()
  }

  deselectStraightLine(id: string) {
    this.straightLines.delete(id)
    this.notifyChange()
  }

  selectPerpendicularLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.perpendicularLines.add(id)
    this.notifyChange()
  }

  deselectPerpendicularLine(id: string) {
    this.perpendicularLines.delete(id)
    this.notifyChange()
  }

  selectParallelLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.parallelLines.add(id)
    this.notifyChange()
  }

  deselectParallelLine(id: string) {
    this.parallelLines.delete(id)
    this.notifyChange()
  }

  selectRay(id: string, additive = false) {
    if (!additive) this.clear()
    this.rays.add(id)
    this.notifyChange()
  }

  deselectRay(id: string) {
    this.rays.delete(id)
    this.notifyChange()
  }

  selectVector(id: string, additive = false) {
    if (!additive) this.clear()
    this.vectors.add(id)
    this.notifyChange()
  }

  deselectVector(id: string) {
    this.vectors.delete(id)
    this.notifyChange()
  }

  selectCircle(id: string, additive = false) {
    if (!additive) this.clear()
    this.circles.add(id)
    this.notifyChange()
  }

  deselectCircle(id: string) {
    this.circles.delete(id)
    this.notifyChange()
  }

  selectFace(id: string, additive = false) {
    if (!additive) this.clear()
    this.faces.add(id)
    this.notifyChange()
  }

  /** 将面标记为"显式选中"（通过 geo-link 按钮点击），用于独立高亮与卡片显示。 */
  markFaceExplicit(id: string) {
    if (this.faces.has(id)) this.explicitFaces.add(id)
    this.notifyChange()
  }

  deselectFace(id: string) {
    this.faces.delete(id)
    this.explicitFaces.delete(id)
    this.notifyChange()
  }

  selectSphere(id: string, additive = false) {
    if (!additive) this.clear()
    this.spheres.add(id)
    this.notifyChange()
  }

  deselectSphere(id: string) {
    this.spheres.delete(id)
    this.notifyChange()
  }

  selectCone(id: string, additive = false) {
    if (!additive) this.clear()
    this.cones.add(id)
    this.notifyChange()
  }

  deselectCone(id: string) {
    this.cones.delete(id)
    this.notifyChange()
  }

  selectCylinder(id: string, additive = false) {
    if (!additive) this.clear()
    this.cylinders.add(id)
    this.notifyChange()
  }

  deselectCylinder(id: string) {
    this.cylinders.delete(id)
    this.notifyChange()
  }

  selectNet(id: string, additive = false) {
    if (!additive) this.clear()
    this.nets.add(id)
    this.notifyChange()
  }

  deselectNet(id: string) {
    this.nets.delete(id)
    this.notifyChange()
  }

  isEmpty() {
    return (
      this.points.size === 0 &&
      this.lines.size === 0 &&
      this.straightLines.size === 0 &&
      this.perpendicularLines.size === 0 &&
      this.parallelLines.size === 0 &&
      this.rays.size === 0 &&
      this.vectors.size === 0 &&
      this.circles.size === 0 &&
      this.faces.size === 0 &&
      this.spheres.size === 0 &&
      this.cones.size === 0 &&
      this.cylinders.size === 0 &&
      this.nets.size === 0
    )
  }
}
