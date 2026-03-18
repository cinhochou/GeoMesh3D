import { Point3 } from './Point3'

export class Line3 {
  id: string
  name: string
  nameVisible: boolean
  p1: Point3
  p2: Point3

  constructor(id: string, name: string, p1: Point3, p2: Point3, nameVisible: boolean = true) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.p1 = p1
    this.p2 = p2
  }
}
