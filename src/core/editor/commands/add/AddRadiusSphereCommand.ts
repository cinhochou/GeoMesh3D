import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

export function createAddRadiusSphereCommand(
  scene: Scene,
  sphere: Sphere3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('AddRadiusSphereCommand', scene, () => {
    scene.addSphere(sphere)
    sphere.centerPoint.sphereId = sphere.id
    sphere.centerPoint.sphereRole = 'center'
  })

  cmd.executeAndCapture()
  return cmd
}
