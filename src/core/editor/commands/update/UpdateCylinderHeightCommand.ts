import { UpdateFeatureCommand } from '../../../features/FeatureUpdateCommand'
import { Scene } from '../../../scene/Scene'
import { Vec3 } from '../../../geometry/Vec3'

type CylinderHeightState = {
  position: Vec3
}

export class UpdateCylinderHeightCommand extends UpdateFeatureCommand {
  constructor(
    scene: Scene,
    private cylinderId: string,
    private topPointId: string,
    newHeight: number,
  ) {
    const cylinder = scene.cylinders.get(cylinderId)
    const topPoint = scene.points.get(topPointId)
    const affectedPointIds: string[] = []
    let before: CylinderHeightState
    let after: CylinderHeightState
    if (cylinder && topPoint) {
      before = { position: topPoint.position.clone() }
      const center = cylinder.bottomCenterPoint.position
      const axis = new Vec3(
        topPoint.position.x - center.x,
        topPoint.position.y - center.y,
        topPoint.position.z - center.z,
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
      affectedPointIds.push(cylinder.bottomCenterPoint.id, topPoint.id)
    } else {
      before = { position: new Vec3(0, 0, 0) }
      after = { position: new Vec3(0, 0, 0) }
    }

    super(
      scene,
      '更新圆柱高度',
      { id: cylinderId, type: 'cylinder', params: {}, dependencies: [] },
      { elementIds: { cylinders: [cylinderId] } },
      before as unknown as Record<string, unknown>,
      { position: { x: after.position.x, y: after.position.y, z: after.position.z } } as Record<string, unknown>,
      affectedPointIds,
    )
  }
}
