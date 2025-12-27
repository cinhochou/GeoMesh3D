// src/core/scene/Selection.ts
export class Selection {
  points = new Set<string>()
  lines = new Set<string>()

  clear() {
    this.points.clear()
    this.lines.clear()
  }

  selectPoint(id: string, additive = false) {
    if (!additive) this.clear()
    this.points.add(id)
  }

  selectLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.lines.add(id)
  }

  isEmpty() {
    return this.points.size === 0 && this.lines.size === 0
  }
}
