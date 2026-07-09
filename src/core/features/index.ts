// src/core/features/index.ts
// Feature 层统一入口：导出抽象类型并注册所有内置插件。

import { featureRegistry } from './FeatureRegistry'
import { sphereFeaturePlugin } from './plugins/SphereFeature'
import { coneFeaturePlugin } from './plugins/ConeFeature'
import {
  pointFeaturePlugin,
  lineFeaturePlugin,
  straightLineFeaturePlugin,
  rayFeaturePlugin,
  vectorFeaturePlugin,
} from './plugins/BasicElementFeature'
import { cylinderFeaturePlugin } from './plugins/CylinderFeature'
import { hexahedronFeaturePlugin } from './plugins/HexahedronFeature'
import { intersectionPointFeaturePlugin } from './plugins/IntersectionPointFeature'
import { constrainedPointFeaturePlugin } from './plugins/ConstrainedPointFeature'
import { regularPolygonFeaturePlugin } from './plugins/RegularPolygonFeature'
import { prismFeaturePlugin } from './plugins/PrismFeature'
import { pyramidFeaturePlugin } from './plugins/PyramidFeature'
import { circleFeaturePlugin } from './plugins/CircleFeature'
import { faceFeaturePlugin } from './plugins/FaceFeature'
import { perpendicularLineFeaturePlugin } from './plugins/PerpendicularLineFeature'
import { parallelLineFeaturePlugin } from './plugins/ParallelLineFeature'

export * from './Feature'
export * from './FeatureRegistry'
export * from './FeatureDocument'
export * from './FeatureDeleteHelper'
export * from './FeatureUpdateCommand'
export * from './FeatureAddHelper'
export { sphereFeaturePlugin }
export { coneFeaturePlugin }
export { cylinderFeaturePlugin }
export { hexahedronFeaturePlugin }
export { intersectionPointFeaturePlugin }
export { constrainedPointFeaturePlugin }
export { regularPolygonFeaturePlugin }
export { prismFeaturePlugin }
export { pyramidFeaturePlugin }
export { circleFeaturePlugin }
export { faceFeaturePlugin }
export { perpendicularLineFeaturePlugin }
export { parallelLineFeaturePlugin }

// 注册内置 Feature 插件
featureRegistry.register(pointFeaturePlugin)
featureRegistry.register(lineFeaturePlugin)
featureRegistry.register(straightLineFeaturePlugin)
featureRegistry.register(rayFeaturePlugin)
featureRegistry.register(vectorFeaturePlugin)
featureRegistry.register(sphereFeaturePlugin)
featureRegistry.register(coneFeaturePlugin)
featureRegistry.register(cylinderFeaturePlugin)
featureRegistry.register(hexahedronFeaturePlugin)
featureRegistry.register(intersectionPointFeaturePlugin)
featureRegistry.register(constrainedPointFeaturePlugin)
featureRegistry.register(regularPolygonFeaturePlugin)
featureRegistry.register(prismFeaturePlugin)
featureRegistry.register(pyramidFeaturePlugin)
featureRegistry.register(circleFeaturePlugin)
featureRegistry.register(faceFeaturePlugin)
featureRegistry.register(perpendicularLineFeaturePlugin)
featureRegistry.register(parallelLineFeaturePlugin)
