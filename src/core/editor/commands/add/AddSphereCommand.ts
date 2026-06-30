import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'
import { createAddFeatureCommand } from '../../../features'

export function createAddSphereCommand(
  scene: Scene,
  sphere: Sphere3,
): ReturnType<typeof createAddFeatureCommand> {
  const dependencies: string[] = [sphere.centerPoint.id]
  if (sphere.radiusPoint) dependencies.push(sphere.radiusPoint.id)

  return createAddFeatureCommand(scene, sphere.id, 'sphere', {
    centerPointId: sphere.centerPoint.id,
    radiusPointId: sphere.radiusPoint?.id,
    radiusValue: sphere.radiusValue,
    name: sphere.name,
    visible: sphere.visible,
    nameVisible: sphere.nameVisible,
    valueVisible: sphere.valueVisible,
    labelOffsetX: sphere.labelOffsetX,
    labelOffsetY: sphere.labelOffsetY,
  })
}
