import { Vec3 } from './Vec3'

export class Point3 {
  id: string
  name: string
  position: Vec3 //鍚戦噺浣嶇疆
  locked: boolean

  constructor(id: string, name: string, position = new Vec3(), locked: boolean = false) {
    this.id = id
    this.name = name
    this.position = position
    this.locked = locked
  }

  setPosition(v: Vec3) {
    if (this.locked) return
    this.position = v
  }
}
