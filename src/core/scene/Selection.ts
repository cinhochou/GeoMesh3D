// src/core/scene/Selection.ts
export class Selection {
  points = new Set<string>()
  lines = new Set<string>()
  straightLines = new Set<string>()
  rays = new Set<string>()
  faces = new Set<string>()

  clear() {
    this.points.clear()
    this.lines.clear()
    this.straightLines.clear()
    this.rays.clear()
    this.faces.clear()
  }

  selectPoint(id: string, additive = false) {
    if (!additive) this.clear()
    this.points.add(id)
  }

  selectLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.lines.add(id)
  }

  selectStraightLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.straightLines.add(id)
  }

  selectRay(id: string, additive = false) {
    if (!additive) this.clear()
    this.rays.add(id)
  }

  selectFace(id: string, additive = false) {
    if (!additive) this.clear()
    this.faces.add(id)
  }

  isEmpty() {
    return (
      this.points.size === 0 &&
      this.lines.size === 0 &&
      this.straightLines.size === 0 &&
      this.rays.size === 0 &&
      this.faces.size === 0
    )
  }
}
