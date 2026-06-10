import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Cylinder3 } from '../../../geometry/Cylinder3'
import { Circle3 } from '../../../geometry/Circle3'
import { CylinderConstraint } from '../../../constraints/CylinderConstraint'

export function createAddCylinderCommand(
  scene: Scene,
  cylinder: Cylinder3,
  bottomCircle: Circle3,
  topCircle: Circle3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddCylinderCommand', scene, () => {
    scene.addCylinder(cylinder)
    cylinder.bottomCenterPoint.cylinderId = cylinder.id
    cylinder.bottomCenterPoint.cylinderRole = 'bottomCenter'
    cylinder.topCenterPoint.cylinderId = cylinder.id
    cylinder.topCenterPoint.cylinderRole = 'topCenter'
    scene.addCircle(bottomCircle)
    bottomCircle.p1.circleId = bottomCircle.id
    bottomCircle.p1.circleRole = 'center'
    scene.addCircle(topCircle)
    topCircle.p1.circleId = topCircle.id
    topCircle.p1.circleRole = 'center'
    const constraint = new CylinderConstraint(
      scene,
      cylinder.id,
      bottomCircle.id,
      topCircle.id,
      cylinder.name,
      cylinder.valueVisible,
    )
    scene.addCylinderConstraint(constraint)
  })

  cmd.executeAndCapture()
  return cmd
}
