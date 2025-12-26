import { Point3 } from './Point3'

export class Line3 {
  id: string
  p1: Point3
  p2: Point3

  constructor(id: string, p1: Point3, p2: Point3) {
    this.id = id
    this.p1 = p1
    this.p2 = p2
  }
}
