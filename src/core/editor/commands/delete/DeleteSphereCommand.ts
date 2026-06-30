import { Scene } from '../../../scene/Scene'
import { Sphere3 } from '../../../geometry/Sphere3'
import { createDeleteFeatureCommand } from '../../../features'

export function createDeleteSphereCommand(
  scene: Scene,
  sphere: Sphere3,
): ReturnType<typeof createDeleteFeatureCommand> {
  return createDeleteFeatureCommand(scene, sphere.id, 'sphere', {
    elementIds: { spheres: [sphere.id] },
  })
}
