import { Point3 } from './Point3'

export class Plane {
  id: string
  points: [Point3, Point3, Point3]

  constructor(id: string, a: Point3, b: Point3, c: Point3) {
    this.id = id
    this.points = [a, b, c]
  }
}
