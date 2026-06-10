import { SnapshotCommand } from '../SnapshotCommand'
import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'

export function createDeleteSphereCommand(
  scene: Scene,
  sphere: Sphere3,
): SnapshotCommand {
  const cmd = new SnapshotCommand('DeleteSphereCommand', scene, () => {
    scene.removeSphere(sphere.id)
    sphere.centerPoint.sphereId = null
    sphere.centerPoint.sphereRole = null
    if (sphere.radiusPoint) {
      sphere.radiusPoint.sphereId = null
      sphere.radiusPoint.sphereRole = null
    }
  })

  cmd.executeAndCapture()
  return cmd
}
