import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

export function createAddSphereCommand(
  scene: Scene,
  sphere: Sphere3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddSphereCommand', scene, () => {
    scene.addSphere(sphere)
    sphere.centerPoint.sphereId = sphere.id
    sphere.centerPoint.sphereRole = 'center'
    if (sphere.radiusPoint) {
      sphere.radiusPoint.sphereId = sphere.id
      sphere.radiusPoint.sphereRole = 'radius'
    }
  })

  cmd.executeAndCapture()
  return cmd
}
