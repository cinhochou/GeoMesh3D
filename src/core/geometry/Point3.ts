import { Vec3 } from './Vec3'

export class Point3 {
  id: string
  position: Vec3 //向量位置

  constructor(id: string, position = new Vec3()) {
    this.id = id
    this.position = position
  }

  setPosition(v: Vec3) {
    this.position = v
  }
}
