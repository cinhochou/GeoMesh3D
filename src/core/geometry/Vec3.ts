export class Vec3 {
  constructor(
    public x = 0,
    public y = 0,
    public z = 0,
  ) {}

  clone() {
    return new Vec3(this.x, this.y, this.z)
  }

  add(v: Vec3) {
    return new Vec3(this.x + v.x, this.y + v.y, this.z + v.z)
  }
}
