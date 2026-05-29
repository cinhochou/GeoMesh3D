// src/core/scene/Selection.ts
export class Selection {
  points = new Set<string>()
  lines = new Set<string>()
  straightLines = new Set<string>()
  perpendicularLines = new Set<string>()
  rays = new Set<string>()
  vectors = new Set<string>()
  circles = new Set<string>()
  faces = new Set<string>()
  spheres = new Set<string>()
  cones = new Set<string>()
  cylinders = new Set<string>()

  clear() {
    this.points.clear()
    this.lines.clear()
    this.straightLines.clear()
    this.perpendicularLines.clear()
    this.rays.clear()
    this.vectors.clear()
    this.circles.clear()
    this.faces.clear()
    this.spheres.clear()
    this.cones.clear()
    this.cylinders.clear()
  }

  selectPoint(id: string, additive = false) {
    if (!additive) this.clear()
    this.points.add(id)
  }

  deselectPoint(id: string) {
    this.points.delete(id)
  }

  selectLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.lines.add(id)
  }

  deselectLine(id: string) {
    this.lines.delete(id)
  }

  selectStraightLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.straightLines.add(id)
  }

  deselectStraightLine(id: string) {
    this.straightLines.delete(id)
  }

  selectPerpendicularLine(id: string, additive = false) {
    if (!additive) this.clear()
    this.perpendicularLines.add(id)
  }

  deselectPerpendicularLine(id: string) {
    this.perpendicularLines.delete(id)
  }

  selectRay(id: string, additive = false) {
    if (!additive) this.clear()
    this.rays.add(id)
  }

  deselectRay(id: string) {
    this.rays.delete(id)
  }

  selectVector(id: string, additive = false) {
    if (!additive) this.clear()
    this.vectors.add(id)
  }

  deselectVector(id: string) {
    this.vectors.delete(id)
  }

  selectCircle(id: string, additive = false) {
    if (!additive) this.clear()
    this.circles.add(id)
  }

  deselectCircle(id: string) {
    this.circles.delete(id)
  }

  selectFace(id: string, additive = false) {
    if (!additive) this.clear()
    this.faces.add(id)
  }

  deselectFace(id: string) {
    this.faces.delete(id)
  }

  selectSphere(id: string, additive = false) {
    if (!additive) this.clear()
    this.spheres.add(id)
  }

  deselectSphere(id: string) {
    this.spheres.delete(id)
  }

  selectCone(id: string, additive = false) {
    if (!additive) this.clear()
    this.cones.add(id)
  }

  deselectCone(id: string) {
    this.cones.delete(id)
  }

  selectCylinder(id: string, additive = false) {
    if (!additive) this.clear()
    this.cylinders.add(id)
  }

  deselectCylinder(id: string) {
    this.cylinders.delete(id)
  }

  isEmpty() {
    return (
      this.points.size === 0 &&
      this.lines.size === 0 &&
      this.straightLines.size === 0 &&
      this.perpendicularLines.size === 0 &&
      this.rays.size === 0 &&
      this.vectors.size === 0 &&
      this.circles.size === 0 &&
      this.faces.size === 0 &&
      this.spheres.size === 0 &&
      this.cones.size === 0 &&
      this.cylinders.size === 0
    )
  }
}
