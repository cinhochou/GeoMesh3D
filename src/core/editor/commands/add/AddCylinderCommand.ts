import { Scene } from '../../../scene/Scene'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Circle3 } from '../../../geometry/Circle3'
import { createAddFeatureCommand } from '../../../features'

export function createAddCylinderCommand(
  scene: Scene,
  cylinder: Cylinder3,
  bottomCircle: Circle3,
  topCircle: Circle3,
): ReturnType<typeof createAddFeatureCommand> {
  return createAddFeatureCommand(scene, cylinder.id, 'cylinder', {
    bottomCenterPointId: cylinder.bottomCenterPoint.id,
    topCenterPointId: cylinder.topCenterPoint.id,
    cylinder,
    bottomCircle,
    topCircle,
    name: cylinder.name,
    visible: cylinder.visible,
    nameVisible: cylinder.nameVisible,
    valueVisible: cylinder.valueVisible,
    labelOffsetX: cylinder.labelOffsetX,
    labelOffsetY: cylinder.labelOffsetY,
  })
}
