// src/core/scene/Selection.ts
export class Selection {
  points = new Set<string>()
  lines = new Set<string>()
  rays = new Set<string>()

  clear() {
    this.points.clear()
    this.lines.clear()
    this.rays.clear()
  }

  selectPoint(id: string, additive = false) {
    if (!additive) this.clear()
    this.points.add(id)
  }

  selectLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.lines.add(id)
  }

  selectRay(id: string, additive = false) {
    if (!additive) this.clear()
    this.rays.add(id)
  }

  isEmpty() {
    return this.points.size === 0 && this.lines.size === 0 && this.rays.size === 0
  }
}
