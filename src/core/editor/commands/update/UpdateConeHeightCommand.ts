import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { Vec3 } from '../../../geometry/Vec3'

type ConeHeightState = {
  position: Vec3
}

export class UpdateConeHeightCommand extends UpdateFeatureCommand {
  constructor(
    scene: Scene,
    private coneId: string,
    private apexPointId: string,
    newHeight: number,
  ) {
    const cone = scene.cones.get(coneId)
    const apexPoint = scene.points.get(apexPointId)
    const affectedPointIds: string[] = []
    let before: ConeHeightState
    let after: ConeHeightState
    if (cone && apexPoint) {
      before = { position: apexPoint.position.clone() }
      const center = cone.baseCenterPoint.position
      const axis = new Vec3(
        apexPoint.position.x - center.x,
        apexPoint.position.y - center.y,
        apexPoint.position.z - center.z,
      )
      const axisLength = Math.hypot(axis.x, axis.y, axis.z)
      if (axisLength <= 1e-8) {
        after = { position: before.position.clone() }
      } else {
        const normalizedAxis = new Vec3(axis.x / axisLength, axis.y / axisLength, axis.z / axisLength)
        after = {
          position: new Vec3(
            center.x + normalizedAxis.x * newHeight,
            center.y + normalizedAxis.y * newHeight,
            center.z + normalizedAxis.z * newHeight,
          ),
        }
      }
      affectedPointIds.push(cone.baseCenterPoint.id, apexPoint.id)
    } else {
      before = { position: new Vec3(0, 0, 0) }
      after = { position: new Vec3(0, 0, 0) }
    }

    super(
      scene,
      '更新圆锥高度',
      { id: coneId, type: 'cone', params: {}, dependencies: [] },
      { elementIds: { cones: [coneId] } },
      before as unknown as Record<string, unknown>,
      { position: { x: after.position.x, y: after.position.y, z: after.position.z } } as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
