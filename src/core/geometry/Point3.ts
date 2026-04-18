import { Vec3 } from './Vec3'

export class Point3 {
  id: string
  name: string
  nameVisible: boolean
  position: Vec3
  locked: boolean
  userLocked: boolean
  cubeId: string | null
  cubeRole: 'owner' | 'dependent' | null

  constructor(
    id: string,
    name: string,
    position = new Vec3(),
    locked: boolean = false,
    nameVisible: boolean = true,
    userLocked: boolean = false,
  ) {
    this.id = id
    this.name = name
    this.nameVisible = nameVisible
    this.position = position
    this.locked = locked
    this.userLocked = userLocked
    this.cubeId = null
    this.cubeRole = null
  }

  setPosition(v: Vec3) {
    if (this.locked) return
    this.position = v
  }
}
