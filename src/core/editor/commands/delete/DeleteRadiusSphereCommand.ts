import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

export function createDeleteRadiusSphereCommand(
  scene: Scene,
  sphere: Sphere3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteRadiusSphereCommand', scene, () => {
    scene.removeSphere(sphere.id)
    sphere.centerPoint.sphereId = null
    sphere.centerPoint.sphereRole = null
  })

  cmd.executeAndCapture()
  return cmd
}
