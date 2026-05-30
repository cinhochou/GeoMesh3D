import { Vec3 } from '../geometry/Vec3'
import type { ParallelLineTargetRef } from '../geometry/ParallelLine3'
import { Scene } from '../scene/Scene'

export class ParallelLineConstraint {
  private static readonly EPSILON = 1e-5
  private static readonly MAX_COORD_ABS = 1e6

  constructor(
    private scene: Scene,
    public readonly parallelLineId: string,
    public readonly target: ParallelLineTargetRef,
  ) {}

  private isSafePosition(v: Vec3) {
    return (
      Number.isFinite(v.x) &&
      Number.isFinite(v.y) &&
      Number.isFinite(v.z) &&
      Math.abs(v.x) <= ParallelLineConstraint.MAX_COORD_ABS &&
      Math.abs(v.y) <= ParallelLineConstraint.MAX_COORD_ABS &&
      Math.abs(v.z) <= ParallelLineConstraint.MAX_COORD_ABS
    )
  }

  private getLength(v: Vec3) {
    return Math.hypot(v.x, v.y, v.z)
  }

  private getLinearEntity() {
    return this.target.type === 'line'
      ? this.scene.lines.get(this.target.id)
      : this.target.type === 'straightLine'
        ? this.scene.straightLines.get(this.target.id)
        : this.target.type === 'ray'
          ? this.scene.rays.get(this.target.id)
          : this.target.type === 'vector'
            ? this.scene.vectors.get(this.target.id)
            : this.target.type === 'perpendicularLine'
              ? this.scene.perpendicularLines.get(this.target.id)
              : this.target.type === 'parallelLine'
                ? this.scene.parallelLines.get(this.target.id)
                : undefined
  }

  private getTargetDirection(): Vec3 | null {
    const entity = this.getLinearEntity()
    if (!entity) return null
    const dx = entity.p2.position.x - entity.p1.position.x
    const dy = entity.p2.position.y - entity.p1.position.y
    const dz = entity.p2.position.z - entity.p1.position.z
    const len = Math.hypot(dx, dy, dz)
    if (len <= ParallelLineConstraint.EPSILON) return null
    return new Vec3(dx / len, dy / len, dz / len)
  }

  isEffective() {
    return this.getTargetDirection() !== null
  }

  getDependencyPointIds() {
    const ids = new Set<string>()
    const line = this.scene.parallelLines.get(this.parallelLineId)
    if (line) {
      ids.add(line.p1.id)
    }
    const entity = this.getLinearEntity()
    if (entity) {
      ids.add(entity.p1.id)
      ids.add(entity.p2.id)
    }
    return ids
  }

  solve() {
    const line = this.scene.parallelLines.get(this.parallelLineId)
    if (!line) return
    const p2 = line.p2
    if (p2.locked) return
    if (!this.isSafePosition(line.p1.position)) return

    const targetDir = this.getTargetDirection()
    if (!targetDir) return

    const currentDir = new Vec3(
      p2.position.x - line.p1.position.x,
      p2.position.y - line.p1.position.y,
      p2.position.z - line.p1.position.z,
    )
    const currentLen = this.getLength(currentDir)
    if (currentLen <= ParallelLineConstraint.EPSILON) {
      const defaultLen = 10
      const expected = new Vec3(
        line.p1.position.x + targetDir.x * defaultLen,
        line.p1.position.y + targetDir.y * defaultLen,
        line.p1.position.z + targetDir.z * defaultLen,
      )
      if (!this.isSafePosition(expected)) return
      p2.setPosition(expected)
      return
    }

    const normalizedCurrent = new Vec3(
      currentDir.x / currentLen,
      currentDir.y / currentLen,
      currentDir.z / currentLen,
    )

    const dot = normalizedCurrent.x * targetDir.x + normalizedCurrent.y * targetDir.y + normalizedCurrent.z * targetDir.z
    const expected = new Vec3(
      line.p1.position.x + targetDir.x * currentLen,
      line.p1.position.y + targetDir.y * currentLen,
      line.p1.position.z + targetDir.z * currentLen,
    )

    if (dot < 0) {
      expected.x = line.p1.position.x - targetDir.x * currentLen
      expected.y = line.p1.position.y - targetDir.y * currentLen
      expected.z = line.p1.position.z - targetDir.z * currentLen
    }

    if (!this.isSafePosition(expected)) return

    const delta = new Vec3(
      expected.x - p2.position.x,
      expected.y - p2.position.y,
      expected.z - p2.position.z,
    )
    const deltaLen = this.getLength(delta)
    if (deltaLen <= ParallelLineConstraint.EPSILON) return
    p2.setPosition(expected)
  }
}
