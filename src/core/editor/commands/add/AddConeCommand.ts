import { Scene } from '../../../scene/Scene'
import { Cone3 } from '../../../geometry/Cone3'
import { createAddFeatureCommand } from '../../../features'

export function createAddConeCommand(
  scene: Scene,
  cone: Cone3,
): ReturnType<typeof createAddFeatureCommand> {
  return createAddFeatureCommand(scene, cone.id, 'cone', {
    baseCenterPointId: cone.baseCenterPoint.id,
    apexPointId: cone.apexPoint.id,
    coneType: cone.coneType,
    name: cone.name,
    visible: cone.visible,
    nameVisible: cone.nameVisible,
    valueVisible: cone.valueVisible,
    labelOffsetX: cone.labelOffsetX,
    labelOffsetY: cone.labelOffsetY,
    radiusValue: cone.radiusValue,
    normalCircleId: cone.normalCircleId,
  })
}
