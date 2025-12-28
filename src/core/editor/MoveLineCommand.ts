// src/core/editor/MoveLineCommand.ts
import type { Command } from './Command'
import { Line3 } from '../geometry/Line3'
import { Vec3 } from '../geometry/Vec3'

export class MoveLineCommand implements Command {
  constructor(
    private line: Line3,
    private beforeP1: Vec3,
    private beforeP2: Vec3,
    private afterP1: Vec3,
    private afterP2: Vec3,
  ) {}

  execute() {
    this.line.p1.setPosition(this.afterP1)
    this.line.p2.setPosition(this.afterP2)
  }

  undo() {
    this.line.p1.setPosition(this.beforeP1)
    this.line.p2.setPosition(this.beforeP2)
  }
}
