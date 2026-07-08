import * as THREE from 'three'
import { Scene as GeoScene, type SceneRenderSyncState } from '../core/scene/Scene'
import { Point3 } from '../core/geometry/Point3'
import { Ray3 } from '../core/geometry/Ray3'
import { GeoVector3 } from '../core/geometry/GeoVector3'
import { Vec3 } from '../core/geometry/Vec3'
import { Cone3 } from '../core/geometry/Cone3'
import { Cylinder3 } from '../core/geometry/Cylinder3'
import { computePlaneBasis, projectPoint2D, triangulateFace } from '../core/geometry/PlanarUtils'
import { CubeConstraint } from '../core/constraints/CubeConstraint'
import { PrismConstraint } from '../core/constraints/PrismConstraint'
import { PerpendicularLineConstraint } from '../core/constraints/PerpendicularLineConstraint'
import { PerpendicularLine3 } from '../core/geometry/PerpendicularLine3'
import type { FacePreviewData } from '../core/editor/Editor'
import { ARManager } from './ARManager'
import { AxisGridManager } from './AxisGridManager'
import { LabelRenderer } from './LabelRenderer'

type RenderObjectType =
  | 'point'
  | 'line'
  | 'straightLine'
  | 'perpendicularLine'
  | 'parallelLine'
  | 'ray'
  | 'vector'
  | 'circle'
  | 'face'
  | 'sphere'
  | 'cone'
  | 'coneBase'
  | 'cylinder'
  | 'cylinderBottom'
  | 'cylinderTop'
  | 'axisLabel'

type RenderObjectUserData = THREE.Object3D['userData'] & {
  type?: RenderObjectType
  geoId?: string
  __labelSprite?: THREE.Sprite
  __valueLabelSprite?: THREE.Sprite
  __labelAnchor?: THREE.Vector3
  __labelOffsetX?: number
  __labelOffsetY?: number
  __arrowHead?: THREE.Mesh
  __valueOnlyExtraOffsetX?: number
}

type LabelSpriteUserData = THREE.Object3D['userData'] & {
  text?: string
  isNameLabel?: boolean
  isValueLabel?: boolean
  layoutMode?: 'name' | 'combined' | 'value'
  geoId?: string
  geoType?: Exclude<RenderObjectType, 'axisLabel'>
  textPixelWidth?: number
  textPixelHeight?: number
  canvasPixelWidth?: number
  canvasPixelHeight?: number
  canvasResized?: boolean
  __textureDirty?: boolean
}

export interface GeometrySyncerDeps {
  scene: THREE.Scene
  world: THREE.Group
  container: HTMLElement
  getActiveCamera: () => THREE.Camera
  getActiveCameraSpriteScaleFactor: () => number
  isARActive: () => boolean
  labelRenderer: LabelRenderer
  axisGridManager: AxisGridManager
  arManager: ARManager
  isTouchPreferredDevice: () => boolean
  isMobileDevice: boolean
  renderer: THREE.WebGLRenderer
  camera: THREE.PerspectiveCamera
  controls: { target: THREE.Vector3 }
}

const POINT_PIXEL = 9
const POINT_SCALE_REFERENCE_DISTANCE = Math.sqrt(15 * 15 * 3) * (Math.tan(60 / 2 * Math.PI / 180) / Math.tan(30 / 2 * Math.PI / 180))
const POINT_SCALE_EXPONENT = 0.82
const POINT_MIN_SCALE_FACTOR = 0.3
const POINT_MAX_SCALE_FACTOR = 2.2
const POINT_LABEL_BASE_PIXEL = 70
const LINE_LABEL_BASE_PIXEL = 68
const POINT_LABEL_SCALE_MULTIPLIER = 5.6
const LINE_LABEL_SCALE_MULTIPLIER = 5.4
const LABEL_MIN_SCALE_FACTOR = 0.3
const LABEL_MAX_SCALE_FACTOR = 2.2
const POINT_LABEL_OFFSET_X = 3
const POINT_LABEL_OFFSET_Y = 3
const POINT_VALUE_ONLY_EXTRA_OFFSET_X = 20
const LINE_LABEL_OFFSET_Y = 3
// Use center (0.5, 0.5) so the sprite canvas is centered on `sprite.position`.
// This keeps the label visually centered on its anchor in any direction,
// and (more importantly) makes the drag-range symmetric about the point.
// The "label is offset to the upper-right of the point" look is provided
// by POINT_LABEL_OFFSET_X / POINT_LABEL_OFFSET_Y instead of shifting the
// sprite center.
const POINT_LABEL_CENTER_X = 0.5
const POINT_LABEL_CENTER_Y = 0.5
const LINE_LABEL_CENTER_X = 0.5
const LINE_LABEL_CENTER_Y = 0.3
const LINEAR_COLOR = 0xffffff
const CONSTRAINED_POINT_COLOR = 0xffd84a
const CUBE_DEPENDENT_POINT_COLOR = 0xcfd3d8
const PRISM_DEPENDENT_POINT_COLOR = 0xcfd3d8
export const DEFAULT_POINT_COLOR = 0xff5555
export const SELECTED_COLOR = 0x43f260
const FACE_FILL_COLOR = 0x74a4ff
const FACE_SELECTED_COLOR = SELECTED_COLOR
const FACE_FILL_OPACITY = 0.22
const FACE_SELECTED_OPACITY = 0.3
const FACE_PREVIEW_COLOR = 0x7fffd4
const FACE_PREVIEW_OPACITY = 0.16
const RAY_HEAD_LENGTH = 0.7
const RAY_HEAD_RADIUS = 0.22
const LINEAR_ARROW_PHONE_BREAKPOINT = 640
const LINEAR_ARROW_PHONE_SCALE_FACTOR = 1.8
const AR_POINT_SCALE_FACTOR = 0.95
const AR_POINT_ZOOM_RESPONSE_EXPONENT = 0.85
const AR_POINT_ZOOM_MIN_FACTOR = 0.65
const AR_POINT_ZOOM_MAX_FACTOR = 2.4
const SPHERE_FILL_COLOR = 0x74a4ff
const SPHERE_FILL_OPACITY = 0.6
const SPHERE_SELECTED_COLOR = SELECTED_COLOR
const SPHERE_SELECTED_OPACITY = 0.7
const CONE_FILL_COLOR = 0x74a4ff
const CONE_FILL_OPACITY = 0.6
const CONE_SELECTED_COLOR = SELECTED_COLOR
const CONE_SELECTED_OPACITY = 0.7
const CONE_SEGMENTS = 48
const CYLINDER_FILL_COLOR = 0x3a8fbf
const CYLINDER_FILL_OPACITY = 0.45
const CYLINDER_SELECTED_COLOR = SELECTED_COLOR
const CYLINDER_SELECTED_OPACITY = 0.7
const CYLINDER_SEGMENTS = 48
const HIDDEN_EDGE_DASH_SIZE = 0.3
const HIDDEN_EDGE_GAP_SIZE = 0.15
const HIDDEN_EDGE_OPACITY = 0.45
const SOLID_EDGE_RENDER_ORDER = 3
const HIDDEN_EDGE_RENDER_ORDER = 4
const SURFACE_RENDER_ORDER = 0

const LINEAR_TYPES = new Set<string>([
  'line', 'straightLine', 'perpendicularLine', 'parallelLine', 'ray', 'vector', 'circle', 'sphere', 'cone', 'cylinder', 'face',
])

const TYPE_TO_SCENE_MAP: Record<string, (scene: GeoScene) => Map<string, { labelOffsetX: number; labelOffsetY: number; visible?: boolean }>> = {
  point: (s) => s.points,
  line: (s) => s.lines,
  straightLine: (s) => s.straightLines,
  perpendicularLine: (s) => s.perpendicularLines,
  parallelLine: (s) => s.parallelLines,
  ray: (s) => s.rays,
  vector: (s) => s.vectors,
  circle: (s) => s.circles,
  face: (s) => s.faces,
  sphere: (s) => s.spheres,
  cone: (s) => s.cones,
  cylinder: (s) => s.cylinders,
}

const DIRECTION_TYPE_TO_COLLECTION: Record<string, (scene: GeoScene) => Map<string, { p1: { position: Vec3 }; p2: { position: Vec3 } }>> = {
  line: (s) => s.lines,
  straightLine: (s) => s.straightLines,
  perpendicularLine: (s) => s.perpendicularLines,
  parallelLine: (s) => s.parallelLines,
  ray: (s) => s.rays,
  vector: (s) => s.vectors,
}

const TWO_POINT_COLLECTIONS: ((scene: GeoScene) => Map<string, { visible?: boolean; p1: { id: string }; p2: { id: string } }>)[]
  = [(s) => s.lines, (s) => s.rays, (s) => s.vectors, (s) => s.straightLines, (s) => s.perpendicularLines]

export function isLinearType(type: string | undefined): boolean {
  return type != null && LINEAR_TYPES.has(type)
}

function computePointBaseColor(p: Point3, scene: GeoScene): number {
  if (p.locked) {
    if (p.circleRole === 'center' || p.regularPolygonRole === 'dependent') {
      return CUBE_DEPENDENT_POINT_COLOR
    }
    return 0xffffff
  }
  if (scene.getIntersectionConstraint(p.id)) {
    return CONSTRAINED_POINT_COLOR
  }
  if (p.isConstrainedPoint) {
    return CONSTRAINED_POINT_COLOR
  }
  if (p.cubeRole === 'dependent') {
    return CUBE_DEPENDENT_POINT_COLOR
  }
  if (p.prismRole === 'dependent') {
    return PRISM_DEPENDENT_POINT_COLOR
  }
  if (p.regularPolygonRole === 'dependent') {
    return 0xffffff
  }
  if (p.circleRole === 'center') {
    return CUBE_DEPENDENT_POINT_COLOR
  }
  return DEFAULT_POINT_COLOR
}

export class GeometrySyncer {
  private readonly deps: GeometrySyncerDeps

  public meshMap = new Map<string, THREE.Object3D>()
  public groupMap = new Map<string, THREE.Group>()
  public hiddenLineMap = new Map<string, THREE.Object3D>()
  public pointMeshes = new Map<string, THREE.Points>()
  public facePreviewMesh: THREE.Mesh | null = null
  public rubberBandLine: THREE.Line | null = null
  public footMarkerMap = new Map<string, THREE.Mesh>()

  private syncFrameCounter = 0
  private static readonly DRAG_LABEL_UPDATE_INTERVAL = 3

  private occlusionRaycaster = new THREE.Raycaster()
  private occlusionFrameCounter = 0
  private readonly OCCLUSION_CHECK_INTERVAL = 3
  private pointOcclusionTarget = new Map<string, number>()
  private pointOcclusionLastResult = new Map<string, boolean>()
  private pointOcclusionStableCount = new Map<string, number>()
  private pointBaseColor = new Map<string, THREE.Color>()
  private pointRefCache = new Map<string, boolean>()
  private pointRefCacheValid = false
  private pointCurrentDim = new Map<string, number>()
  private depthOcclusionEnabled = true
  private hiddenEdgeEnabled = true

  private currentSceneRef: GeoScene | null = null
  private activeLabelTarget: { type: string; geoId: string } | null = null
  private activePointValueTarget: { type: 'point'; geoId: string } | null = null
  private facePreviewGroup: THREE.Group | null = null
  private rubberBand: THREE.Line | undefined

  private _cachedOccluders: THREE.Object3D[] | null = null
  private _cachedOccludersFrame = -1
  private _screenOffsetTmpWorld = new THREE.Vector3()
  private _screenOffsetTmpView = new THREE.Vector3()
  private _screenOffsetTmpResult = new THREE.Vector3()
  private _screenOffsetTmpNdc = new THREE.Vector3()
  private _syncTmpA = new THREE.Vector3()
  private _syncTmpB = new THREE.Vector3()
  private _syncTmpC = new THREE.Vector3()
  private _syncTmpD = new THREE.Vector3()

  constructor(deps: GeometrySyncerDeps) {
    this.deps = deps
  }

  private createSolidEdgeMaterial(color: number): THREE.LineBasicMaterial {
    return new THREE.LineBasicMaterial({
      color,
      depthFunc: this.hiddenEdgeEnabled ? THREE.LessEqualDepth : THREE.AlwaysDepth,
      depthTest: this.hiddenEdgeEnabled,
      transparent: true,
      opacity: 0.95,
    })
  }

  private createHiddenEdgeMaterial(color: number): THREE.LineDashedMaterial {
    return new THREE.LineDashedMaterial({
      color,
      dashSize: HIDDEN_EDGE_DASH_SIZE,
      gapSize: HIDDEN_EDGE_GAP_SIZE,
      depthFunc: THREE.GreaterDepth,
      transparent: true,
      opacity: HIDDEN_EDGE_OPACITY,
    })
  }

  private generateCirclePoints(
    center: THREE.Vector3,
    uAxis: THREE.Vector3,
    vAxis: THREE.Vector3,
    radius: number,
    segments: number,
  ): THREE.Vector3[] {
    return Array.from({ length: segments }, (_, i) => {
      const angle = (Math.PI * 2 * i) / segments
      return center.clone()
        .addScaledVector(uAxis, Math.cos(angle) * radius)
        .addScaledVector(vAxis, Math.sin(angle) * radius)
    })
  }

  private addDualLineLoopToParent(
    parent: THREE.Object3D,
    points: THREE.Vector3[],
    color: number,
    name: string,
  ): { solid: THREE.LineLoop; hidden: THREE.LineLoop } {
    const solid = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      this.createSolidEdgeMaterial(color),
    )
    solid.name = name
    solid.renderOrder = SOLID_EDGE_RENDER_ORDER

    const hidden = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(points),
      this.createHiddenEdgeMaterial(color),
    )
    hidden.name = name + '_hidden'
    hidden.renderOrder = HIDDEN_EDGE_RENDER_ORDER
    hidden.computeLineDistances()

    parent.add(solid)
    parent.add(hidden)
    return { solid, hidden }
  }

  private addDualLineSegmentsToParent(
    parent: THREE.Object3D,
    points: THREE.Vector3[],
    color: number,
    name: string,
  ): { solid: THREE.LineSegments; hidden: THREE.LineSegments } {
    const solid = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      this.createSolidEdgeMaterial(color),
    )
    solid.name = name
    solid.renderOrder = SOLID_EDGE_RENDER_ORDER

    const hidden = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(points),
      this.createHiddenEdgeMaterial(color),
    )
    hidden.name = name + '_hidden'
    hidden.renderOrder = HIDDEN_EDGE_RENDER_ORDER
    hidden.computeLineDistances()

    parent.add(solid)
    parent.add(hidden)
    return { solid, hidden }
  }

  private updateDualLineLoopGeometry(
    parent: THREE.Object3D,
    name: string,
    points: THREE.Vector3[],
  ): void {
    const solid = parent.getObjectByName(name) as THREE.LineLoop | undefined
    if (solid) {
      solid.geometry.setFromPoints(points)
      this.updateBounds(solid.geometry)
    }
    const hidden = parent.getObjectByName(name + '_hidden') as THREE.LineLoop | undefined
    if (hidden) {
      hidden.geometry.setFromPoints(points)
      hidden.computeLineDistances()
    }
  }

  private updateDualLineSegmentsGeometry(
    parent: THREE.Object3D,
    name: string,
    points: THREE.Vector3[],
  ): void {
    const solid = parent.getObjectByName(name) as THREE.LineSegments | undefined
    if (solid) {
      solid.geometry.setFromPoints(points)
      this.updateBounds(solid.geometry)
    }
    const hidden = parent.getObjectByName(name + '_hidden') as THREE.LineSegments | undefined
    if (hidden) {
      hidden.geometry.setFromPoints(points)
      hidden.computeLineDistances()
    }
  }

  private setDualEdgeColor(parent: THREE.Object3D, name: string, color: number): void {
    const solid = parent.getObjectByName(name) as THREE.Line | undefined
    if (solid) (solid.material as THREE.LineBasicMaterial).color.set(color)
    const hidden = parent.getObjectByName(name + '_hidden') as THREE.Line | undefined
    if (hidden) (hidden.material as THREE.LineDashedMaterial).color.set(color)
  }

  private setDualEdgeVisibility(parent: THREE.Object3D, name: string, visible: boolean): void {
    const solid = parent.getObjectByName(name)
    if (solid) solid.visible = visible
    const hidden = parent.getObjectByName(name + '_hidden')
    if (hidden) hidden.visible = visible
  }

  private getRenderUserData(object: THREE.Object3D): RenderObjectUserData {
    return object.userData as RenderObjectUserData
  }

  private getLabelUserData(sprite: THREE.Sprite): LabelSpriteUserData {
    return sprite.userData as LabelSpriteUserData
  }

  isDragging(): boolean {
    return (this.currentSceneRef?.activeDraggedPointIds.size ?? 0) > 0
  }

  private updateBounds(geo: THREE.BufferGeometry): void {
    if (this.isDragging()) return
    geo.computeBoundingBox()
    geo.computeBoundingSphere()
  }

  sync(
    geoScene: GeoScene,
    previewData?: { from: THREE.Vector3; to: THREE.Vector3 } | null,
    facePreviewData?: FacePreviewData | null,
    activeLabelTarget?: { type: string; geoId: string } | null,
    activePointValueTarget?: { type: 'point'; geoId: string } | null,
  ): void {
    this.syncFrameCounter++
    this.currentSceneRef = geoScene
    this.activeLabelTarget = activeLabelTarget ?? null
    this.activePointValueTarget = activePointValueTarget ?? null
    const dirtyState = geoScene.consumeRenderSyncState()
    if (dirtyState && dirtyState.fullSync) {
      this.pointRefCacheValid = false
    }
    if (dirtyState) {
      this.cleanupMissingMeshes(geoScene)
      this.syncPoints(geoScene, dirtyState)
      this.syncLines(geoScene, dirtyState)
      this.syncStraightLines(geoScene, dirtyState)
      this.syncPerpendicularLines(geoScene, dirtyState)
      this.syncParallelLines(geoScene, dirtyState)
      this.syncRays(geoScene, dirtyState)
      this.syncVectors(geoScene, dirtyState)
      this.syncCircles(geoScene, dirtyState)
      this.syncFaces(geoScene, dirtyState)
      this.syncSpheres(geoScene, dirtyState)
      this.syncCones(geoScene, dirtyState)
      this.syncCylinders(geoScene, dirtyState)
      this.syncCubeValueLabels(geoScene)
      this.syncPrismValueLabels(geoScene)
    }
    this.updateRubberBand(previewData)
    this.updateFacePreview(facePreviewData)
  }

  syncPoints(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.pointIds.forEach((pointId) => {
      const p = scene.points.get(pointId)
      if (!p) return
      let sprite = this.meshMap.get(p.id) as THREE.Sprite

      if (!sprite) {
        const material = new THREE.SpriteMaterial({
          color: DEFAULT_POINT_COLOR,
          depthTest: false,
          depthWrite: false,
          sizeAttenuation: false,
        })
        material.map = this.deps.labelRenderer.getPointTexture(0xffffff, 128)
        material.transparent = true
        material.alphaTest = 0.1

        sprite = new THREE.Sprite(material)
        sprite.renderOrder = 6

        const scale = this.getPointSpriteScale()

        sprite.scale.set(scale, scale, 1)

        sprite.userData = {
          type: 'point',
          geoId: p.id,
        }

        this.deps.world.add(sprite)
        this.meshMap.set(p.id, sprite)
      }

      if (p.circleRole === 'center' && p.circleId) {
        const circle = scene.circles.get(p.circleId)
        if (circle) {
          let resolvedDirection = circle.isNormalCircle() && circle.directionType && circle.directionId
            ? this.resolveDirectionVectorForCircle(circle.directionType, circle.directionId)
            : undefined
          if (circle.isNormalCircle()) {
            let coneForCircle: Cone3 | null = null
            const coneIds = scene.getConesForCircle(p.circleId)
            for (const id of coneIds) {
              const c = scene.cones.get(id)
              if (c) {
                coneForCircle = c
                break
              }
            }
            if (coneForCircle) {
              const cone = coneForCircle as Cone3
              const center = cone.baseCenterPoint.position
              const apex = cone.apexPoint.position
              const axis = new THREE.Vector3(
                apex.x - center.x,
                apex.y - center.y,
                apex.z - center.z,
              )
              if (axis.length() > 1e-8) {
                resolvedDirection = new Vec3(axis.x, axis.y, axis.z)
              }
            }
            let cylinderForCircle: Cylinder3 | null = null
            if (!coneForCircle) {
              const cylinderIds = scene.getCylindersForCircle(p.circleId)
              for (const id of cylinderIds) {
                const c = scene.cylinders.get(id)
                if (c) {
                  cylinderForCircle = c
                  break
                }
              }
              if (cylinderForCircle) {
                const cylinder = cylinderForCircle as Cylinder3
                const bottomCenter = cylinder.bottomCenterPoint.position
                const topCenter = cylinder.topCenterPoint.position
                const axis = new THREE.Vector3(
                  topCenter.x - bottomCenter.x,
                  topCenter.y - bottomCenter.y,
                  topCenter.z - bottomCenter.z,
                )
                if (axis.length() > 1e-8) {
                  resolvedDirection = new Vec3(axis.x, axis.y, axis.z)
                }
              }
            }
          }
          const frame = circle.getFrame(resolvedDirection)
          if (frame) {
            p.position = frame.center
          }
        }
      }
      sprite.position.set(p.position.x, p.position.y, p.position.z)

      const isSelected = scene.selection.points.has(p.id)
      const baseColor = computePointBaseColor(p, scene)
      const finalColor = isSelected ? SELECTED_COLOR : baseColor
      ;(sprite.material as THREE.SpriteMaterial).color.set(finalColor)
      this.pointBaseColor.set(p.id, new THREE.Color(finalColor))

      let pointSpriteVisible = p.visible !== false
      const isCircleCenterPoint = p.circleRole === 'center'
      if (isCircleCenterPoint && p.circleId) {
        const circle = scene.circles.get(p.circleId)
        const circleVisible = circle ? circle.centerVisible && circle.visible : false
        if (circleVisible) {
          pointSpriteVisible = p.visible !== false
        } else {
          pointSpriteVisible = (p.visible !== false) && this.getCachedPointRef(p.id, scene, p.circleId)
        }
      }
      sprite.visible = pointSpriteVisible

      const isLabelActive =
        this.activeLabelTarget?.type === 'point' && this.activeLabelTarget.geoId === p.id
      const labelColor = isLabelActive ? SELECTED_COLOR : 0xffffff
      const labelKey = '__labelSprite'
      const spriteUserData = this.getRenderUserData(sprite)
      const existingLabel = spriteUserData[labelKey] as THREE.Sprite | undefined
      const existingValueLabel = spriteUserData.__valueLabelSprite
      if (existingValueLabel) existingValueLabel.visible = false
      spriteUserData.__labelOffsetX = POINT_LABEL_OFFSET_X + p.labelOffsetX
      spriteUserData.__labelOffsetY = POINT_LABEL_OFFSET_Y + p.labelOffsetY
      const pointValueText = `=(${this.deps.labelRenderer.formatMetricNumber(p.position.x)},${this.deps.labelRenderer.formatMetricNumber(p.position.y)},${this.deps.labelRenderer.formatMetricNumber(p.position.z)})`
      const pointValueVisible =
        p.valueVisible ||
        (this.activePointValueTarget?.type === 'point' && this.activePointValueTarget.geoId === p.id)
      spriteUserData.__valueOnlyExtraOffsetX =
        !p.nameVisible && pointValueVisible
          ? POINT_VALUE_ONLY_EXTRA_OFFSET_X
          : 0
      const combinedPointText = pointValueVisible ? pointValueText : ''
      if (!pointSpriteVisible || (!p.nameVisible && !pointValueVisible)) {
        if (existingLabel) {
          existingLabel.visible = false
          this.getLabelUserData(existingLabel).__textureDirty = true
        }
      } else if (!existingLabel) {
        const nameSprite = p.nameVisible
          ? this.deps.labelRenderer.makePointLabelSprite(p.name ?? '', labelColor, combinedPointText)
          : this.deps.labelRenderer.makeValueLabelSprite(pointValueText, labelColor, true)
        nameSprite.position.copy(
          this.getScreenOffsetPosition(
            sprite.position,
            spriteUserData.__labelOffsetX +
              (p.nameVisible ? 0 : POINT_VALUE_ONLY_EXTRA_OFFSET_X),
            spriteUserData.__labelOffsetY,
          ),
        )
        const nameSpriteData = this.getLabelUserData(nameSprite)
        nameSprite.center.set(
          this.computePointLabelCenterX(p.nameVisible, combinedPointText, nameSpriteData.canvasPixelWidth ?? 256),
          POINT_LABEL_CENTER_Y,
        )
        nameSprite.renderOrder = 10
        const scale = this.getPointLabelScale()
        this.deps.labelRenderer.setLabelSpriteScale(nameSprite, scale)
        const labelUserData = nameSpriteData
        labelUserData.text = p.nameVisible ? `${p.name ?? ''}${combinedPointText}` : pointValueText
        labelUserData.isNameLabel = true
        labelUserData.geoId = p.id
        labelUserData.geoType = 'point'
        spriteUserData[labelKey] = nameSprite
        this.deps.world.add(nameSprite)
      } else {
        existingLabel.visible = true
        existingLabel.center.set(
          this.computePointLabelCenterX(p.nameVisible, combinedPointText, this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256),
          POINT_LABEL_CENTER_Y,
        )
        existingLabel.position.copy(
          this.getScreenOffsetPosition(
            sprite.position,
            spriteUserData.__labelOffsetX +
              (p.nameVisible ? 0 : POINT_VALUE_ONLY_EXTRA_OFFSET_X),
            spriteUserData.__labelOffsetY,
          ),
        )
        const labelData = this.getLabelUserData(existingLabel)
        const isDragging = scene.activeDraggedPointIds.size > 0
        const wasDirty = labelData.__textureDirty
        if (wasDirty) labelData.__textureDirty = false
        const nextText = p.nameVisible ? `${p.name ?? ''}${combinedPointText}` : pointValueText
        const labelText = this.getLabelUserData(existingLabel).text ?? ''
        const textChanged = labelText !== nextText
        const shouldUpdateTexture = wasDirty || textChanged || (!isDragging && (this.syncFrameCounter % GeometrySyncer.DRAG_LABEL_UPDATE_INTERVAL === 0))
        if (!shouldUpdateTexture) return
        if (labelText !== nextText) {
          this.getLabelUserData(existingLabel).text = nextText
          const material = existingLabel.material as THREE.SpriteMaterial
          const oldMap = material.map as THREE.CanvasTexture | null
          const newSprite = p.nameVisible
            ? this.deps.labelRenderer.makePointLabelSprite(p.name ?? '', labelColor, combinedPointText)
            : this.deps.labelRenderer.makeValueLabelSprite(pointValueText, labelColor, true)
          Object.assign(this.getLabelUserData(existingLabel), this.getLabelUserData(newSprite))
          material.map = (newSprite.material as THREE.SpriteMaterial).map
          if (oldMap) oldMap.dispose()
          existingLabel.center.set(
            this.computePointLabelCenterX(p.nameVisible, combinedPointText, this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256),
            POINT_LABEL_CENTER_Y,
          )
          this.deps.labelRenderer.setLabelSpriteScale(existingLabel, this.getPointLabelScale())
        } else {
          const material = existingLabel.material as THREE.SpriteMaterial
          const map = material.map as THREE.CanvasTexture | null
          if (map) {
            const ctx = (map.image as HTMLCanvasElement).getContext('2d')
            if (ctx) {
              const result = p.nameVisible
                ? combinedPointText
                  ? this.deps.labelRenderer.drawCombinedLabel(
                      ctx,
                      map.image as HTMLCanvasElement,
                      p.name ?? '',
                      combinedPointText,
                      labelColor,
                      72,
                    )
                  : this.deps.labelRenderer.drawNameLabel(
                      ctx,
                      map.image as HTMLCanvasElement,
                      p.name ?? '',
                      labelColor,
                      72,
                    )
                : this.deps.labelRenderer.drawPlainLabel(
                    ctx,
                    map.image as HTMLCanvasElement,
                    pointValueText,
                    labelColor,
                    72,
                  )
              Object.assign(this.getLabelUserData(existingLabel), result)
              material.map = this.deps.labelRenderer.safeUpdateCanvasTexture(
                map,
                result.canvasResized ?? false,
              )
              existingLabel.center.set(
                this.computePointLabelCenterX(p.nameVisible, combinedPointText, this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256),
                POINT_LABEL_CENTER_Y,
              )
              this.deps.labelRenderer.setLabelSpriteScale(existingLabel, this.getPointLabelScale())
            }
          }
        }
      }
    })
    if (this.currentSceneRef) {
      ;[...this.currentSceneRef.cubeConstraints.values()]
        .filter((constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint)
        .forEach((cube) => {
          const label = this.deps.labelRenderer.cubeValueLabels.get(cube.cubeId)
          const centroid = cube.getCentroid()
          if (!label || !label.visible || !centroid) return
          label.position.copy(
            this.getScreenOffsetPosition(
              new THREE.Vector3(centroid.x, centroid.y, centroid.z),
              0,
              LINE_LABEL_OFFSET_Y,
            ),
          )
        })
    }
  }

  syncLines(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.lineIds.forEach((id) => {
      const lineData = scene.lines.get(id)
      if (!lineData) return
      let line = this.meshMap.get(id) as THREE.Line
      const p1 = lineData.p1.position
      const p2 = lineData.p2.position

      if (!line) {
        const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        line = new THREE.Line(geo, mat)
        line.renderOrder = SOLID_EDGE_RENDER_ORDER

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenLine = new THREE.Line(hiddenGeo, hiddenMat)
        hiddenLine.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenLine.computeLineDistances()
        this.deps.world.add(hiddenLine)
        this.hiddenLineMap.set(id, hiddenLine)

        line.userData = { geoId: id, type: 'line' }
        this.deps.world.add(line)
        this.meshMap.set(id, line)
      } else {
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (posAttr && posAttr.count >= 2) {
          posAttr.setXYZ(0, p1.x, p1.y, p1.z)
          posAttr.setXYZ(1, p2.x, p2.y, p2.z)
          posAttr.needsUpdate = true
          this.updateBounds(line.geometry)
        } else {
          line.geometry.setFromPoints([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)])
          this.updateBounds(line.geometry)
        }

        const hiddenLine = this.hiddenLineMap.get(id) as THREE.Line | undefined
        if (hiddenLine) {
          const hPosAttr = hiddenLine.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count >= 2) {
            hPosAttr.setXYZ(0, p1.x, p1.y, p1.z)
            hPosAttr.setXYZ(1, p2.x, p2.y, p2.z)
            hPosAttr.needsUpdate = true
          } else {
            hiddenLine.geometry.setFromPoints([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)])
          }
          hiddenLine.computeLineDistances()
        }
      }

      line.visible = lineData.visible !== false

      const isSelected = scene.selection.lines.has(id)
      let isFaceHighlight = false
      if (lineData.faceOwned && !isSelected) {
        for (const face of scene.faces.values()) {
          if (face.boundaryLineIds.includes(id) && scene.selection.faces.has(face.id)) {
            isFaceHighlight = true
            break
          }
        }
      }
      const edgeColor = (isSelected || isFaceHighlight) ? SELECTED_COLOR : LINEAR_COLOR
      ;(line.material as THREE.LineBasicMaterial).color.set(edgeColor)

      const hiddenLine = this.hiddenLineMap.get(id) as THREE.Line | undefined
      if (hiddenLine) {
        hiddenLine.visible = this.hiddenEdgeEnabled && lineData.visible !== false
        ;(hiddenLine.material as THREE.LineDashedMaterial).color.set(edgeColor)
      }

      const mid = this._syncTmpA.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
      const isLabelActive =
        this.activeLabelTarget?.type === 'line' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        line,
        lineData.name ?? '',
        lineData.nameVisible && lineData.visible !== false,
        lineData.valueVisible === true && lineData.visible !== false,
        `=${this.deps.labelRenderer.formatMetricNumber(lineData.getLength())}`,
        mid,
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncRays(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.rayIds.forEach((id) => {
      const rayData = scene.rays.get(id)
      if (!rayData) return
      let ray = this.meshMap.get(id) as THREE.Line | undefined
      const p1 = rayData.p1.position
      const end = rayData.getDisplayEndPoint()

      if (!ray) {
        const points = [
          new THREE.Vector3(p1.x, p1.y, p1.z),
          new THREE.Vector3(end.x, end.y, end.z),
        ]
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        ray = new THREE.Line(geo, mat)
        ray.renderOrder = SOLID_EDGE_RENDER_ORDER
        ray.userData = { geoId: id, type: 'ray' }
        this.attachRayArrowHead(ray)
        this.deps.world.add(ray)
        this.meshMap.set(id, ray)

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenRay = new THREE.Line(hiddenGeo, hiddenMat)
        hiddenRay.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenRay.computeLineDistances()
        this.deps.world.add(hiddenRay)
        this.hiddenLineMap.set(id, hiddenRay)
      } else {
        const posAttr = ray.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (posAttr && posAttr.count >= 2) {
          posAttr.setXYZ(0, p1.x, p1.y, p1.z)
          posAttr.setXYZ(1, end.x, end.y, end.z)
          posAttr.needsUpdate = true
          this.updateBounds(ray.geometry)
        } else {
          ray.geometry.setFromPoints([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(end.x, end.y, end.z)])
          this.updateBounds(ray.geometry)
        }

        const hiddenRay = this.hiddenLineMap.get(id) as THREE.Line | undefined
        if (hiddenRay) {
          const hPosAttr = hiddenRay.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count >= 2) {
            hPosAttr.setXYZ(0, p1.x, p1.y, p1.z)
            hPosAttr.setXYZ(1, end.x, end.y, end.z)
            hPosAttr.needsUpdate = true
          } else {
            hiddenRay.geometry.setFromPoints([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(end.x, end.y, end.z)])
          }
          hiddenRay.computeLineDistances()
        }
      }

      ray.visible = rayData.visible
      const isSelected = scene.selection.rays.has(id)
      const rayColor = isSelected ? SELECTED_COLOR : LINEAR_COLOR
      ;(ray.material as THREE.LineBasicMaterial).color.set(rayColor)

      const hiddenRayObj = this.hiddenLineMap.get(id) as THREE.Line | undefined
      if (hiddenRayObj) {
        hiddenRayObj.visible = this.hiddenEdgeEnabled && rayData.visible
        ;(hiddenRayObj.material as THREE.LineDashedMaterial).color.set(rayColor)
      }

      this.updateRayArrowHead(ray, rayData, isSelected)
      const mid = this._syncTmpC.set((p1.x + end.x) / 2, (p1.y + end.y) / 2, (p1.z + end.z) / 2)
      const isLabelActive =
        this.activeLabelTarget?.type === 'ray' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        ray,
        rayData.name ?? '',
        rayData.nameVisible && rayData.visible,
        rayData.valueVisible === true && rayData.visible,
        `=(${this.deps.labelRenderer.formatMetricNumber(rayData.p1.position.x)},${this.deps.labelRenderer.formatMetricNumber(rayData.p1.position.y)},${this.deps.labelRenderer.formatMetricNumber(rayData.p1.position.z)})+λ(${this.deps.labelRenderer.formatMetricNumber(rayData.getDirectionVector().x)},${this.deps.labelRenderer.formatMetricNumber(rayData.getDirectionVector().y)},${this.deps.labelRenderer.formatMetricNumber(rayData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncStraightLines(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.straightLineIds.forEach((id) => {
      const lineData = scene.straightLines.get(id)
      if (!lineData) return
      let line = this.meshMap.get(id) as THREE.Line | undefined
      const display = lineData.getDisplayPoints()
      const start = display.start
      const end = display.end

      if (!line) {
        const points = [
          new THREE.Vector3(start.x, start.y, start.z),
          new THREE.Vector3(end.x, end.y, end.z),
        ]
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        line = new THREE.Line(geo, mat)
        line.renderOrder = SOLID_EDGE_RENDER_ORDER
        line.userData = { geoId: id, type: 'straightLine' }
        this.deps.world.add(line)
        this.meshMap.set(id, line)

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenLine = new THREE.Line(hiddenGeo, hiddenMat)
        hiddenLine.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenLine.computeLineDistances()
        this.deps.world.add(hiddenLine)
        this.hiddenLineMap.set(id, hiddenLine)
      } else {
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (posAttr && posAttr.count >= 2) {
          posAttr.setXYZ(0, start.x, start.y, start.z)
          posAttr.setXYZ(1, end.x, end.y, end.z)
          posAttr.needsUpdate = true
          this.updateBounds(line.geometry)
        } else {
          line.geometry.setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)])
          this.updateBounds(line.geometry)
        }

        const hiddenLine = this.hiddenLineMap.get(id) as THREE.Line | undefined
        if (hiddenLine) {
          const hPosAttr = hiddenLine.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count >= 2) {
            hPosAttr.setXYZ(0, start.x, start.y, start.z)
            hPosAttr.setXYZ(1, end.x, end.y, end.z)
            hPosAttr.needsUpdate = true
          } else {
            hiddenLine.geometry.setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)])
          }
          hiddenLine.computeLineDistances()
        }
      }

      line.visible = lineData.visible
      const isSelected = scene.selection.straightLines.has(id)
      const slColor = isSelected ? SELECTED_COLOR : LINEAR_COLOR
      ;(line.material as THREE.LineBasicMaterial).color.set(slColor)

      const hiddenSlObj = this.hiddenLineMap.get(id) as THREE.Line | undefined
      if (hiddenSlObj) {
        hiddenSlObj.visible = this.hiddenEdgeEnabled && lineData.visible
        ;(hiddenSlObj.material as THREE.LineDashedMaterial).color.set(slColor)
      }

      const mid = this._syncTmpC.set(
        (lineData.p1.position.x + lineData.p2.position.x) / 2,
        (lineData.p1.position.y + lineData.p2.position.y) / 2,
        (lineData.p1.position.z + lineData.p2.position.z) / 2,
      )
      const isLabelActive =
        this.activeLabelTarget?.type === 'straightLine' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        line,
        lineData.name ?? '',
        lineData.nameVisible && lineData.visible,
        lineData.valueVisible === true && lineData.visible,
        `=(${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.x)},${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.y)},${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.z)})+λ(${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().x)},${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().y)},${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncPerpendicularLines(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.perpendicularLineIds.forEach((id) => {
      const lineData = scene.perpendicularLines.get(id)
      if (!lineData) return
      let line = this.meshMap.get(id) as THREE.Line | undefined
      const display = lineData.getDisplayPoints(scene)
      const start = display.start
      const end = display.end

      if (!line) {
        const points = [
          new THREE.Vector3(start.x, start.y, start.z),
          new THREE.Vector3(end.x, end.y, end.z),
        ]
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        line = new THREE.Line(geo, mat)
        line.renderOrder = SOLID_EDGE_RENDER_ORDER
        line.userData = { geoId: id, type: 'perpendicularLine' }
        this.deps.world.add(line)
        this.meshMap.set(id, line)

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenLine = new THREE.Line(hiddenGeo, hiddenMat)
        hiddenLine.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenLine.computeLineDistances()
        this.deps.world.add(hiddenLine)
        this.hiddenLineMap.set(id, hiddenLine)
      } else {
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (posAttr && posAttr.count >= 2) {
          posAttr.setXYZ(0, start.x, start.y, start.z)
          posAttr.setXYZ(1, end.x, end.y, end.z)
          posAttr.needsUpdate = true
          this.updateBounds(line.geometry)
        } else {
          line.geometry.setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)])
          this.updateBounds(line.geometry)
        }

        const hiddenLine = this.hiddenLineMap.get(id) as THREE.Line | undefined
        if (hiddenLine) {
          const hPosAttr = hiddenLine.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count >= 2) {
            hPosAttr.setXYZ(0, start.x, start.y, start.z)
            hPosAttr.setXYZ(1, end.x, end.y, end.z)
            hPosAttr.needsUpdate = true
          } else {
            hiddenLine.geometry.setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)])
          }
          hiddenLine.computeLineDistances()
        }
      }

      line.visible = lineData.visible
      const isSelected = scene.selection.perpendicularLines.has(id)
      const plColor = isSelected ? SELECTED_COLOR : LINEAR_COLOR
      ;(line.material as THREE.LineBasicMaterial).color.set(plColor)

      const hiddenPlObj = this.hiddenLineMap.get(id) as THREE.Line | undefined
      if (hiddenPlObj) {
        hiddenPlObj.visible = this.hiddenEdgeEnabled && lineData.visible
        ;(hiddenPlObj.material as THREE.LineDashedMaterial).color.set(plColor)
      }

      let footMarker = this.footMarkerMap.get(id)
      const constraint = scene.perpendicularLineConstraints.get(id)
      const isFootOnTarget = constraint instanceof PerpendicularLineConstraint && constraint.isFootOnTarget()
      const halfLength = PerpendicularLine3.normalizeDisplayLength(lineData.displayLength) / 2
      const p1Pos = lineData.p1.position
      const cachedFoot = constraint instanceof PerpendicularLineConstraint ? constraint.getLastComputedFoot() : null
      const footPos = cachedFoot ?? lineData.p2.position
      const footDist = Math.hypot(footPos.x - p1Pos.x, footPos.y - p1Pos.y, footPos.z - p1Pos.z)
      const isFootInDisplayRange = footDist <= halfLength
      if (!footMarker) {
        const sphereGeo = new THREE.SphereGeometry(0.2, 16, 16)
        const sphereMat = new THREE.MeshBasicMaterial({
          color: 0xffaa00,
          transparent: true,
          opacity: 0.6,
          depthTest: false,
          depthWrite: false,
        })
        footMarker = new THREE.Mesh(sphereGeo, sphereMat)
        footMarker.renderOrder = 6
        footMarker.userData = { geoId: id, type: 'perpendicularLineFoot' }
        this.deps.world.add(footMarker)
        this.footMarkerMap.set(id, footMarker)
      }
      footMarker.position.set(footPos.x, footPos.y, footPos.z)
      footMarker.visible = lineData.visible && isFootOnTarget && isFootInDisplayRange

      const mid = this._syncTmpC.set(
        (lineData.p1.position.x + lineData.p2.position.x) / 2,
        (lineData.p1.position.y + lineData.p2.position.y) / 2,
        (lineData.p1.position.z + lineData.p2.position.z) / 2,
      )
      const isLabelActive =
        this.activeLabelTarget?.type === 'perpendicularLine' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        line,
        lineData.name ?? '',
        lineData.nameVisible && lineData.visible,
        lineData.valueVisible === true && lineData.visible,
        `=(${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.x)},${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.y)},${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.z)})+λ(${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().x)},${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().y)},${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncParallelLines(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.parallelLineIds.forEach((id) => {
      const lineData = scene.parallelLines.get(id)
      if (!lineData) return
      let line = this.meshMap.get(id) as THREE.Line | undefined
      const display = lineData.getDisplayPoints(scene)
      const start = display.start
      const end = display.end

      if (!line) {
        const points = [
          new THREE.Vector3(start.x, start.y, start.z),
          new THREE.Vector3(end.x, end.y, end.z),
        ]
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        line = new THREE.Line(geo, mat)
        line.renderOrder = SOLID_EDGE_RENDER_ORDER
        line.userData = { geoId: id, type: 'parallelLine' }
        this.deps.world.add(line)
        this.meshMap.set(id, line)

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenLine = new THREE.Line(hiddenGeo, hiddenMat)
        hiddenLine.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenLine.computeLineDistances()
        this.deps.world.add(hiddenLine)
        this.hiddenLineMap.set(id, hiddenLine)
      } else {
        const posAttr = line.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (posAttr && posAttr.count >= 2) {
          posAttr.setXYZ(0, start.x, start.y, start.z)
          posAttr.setXYZ(1, end.x, end.y, end.z)
          posAttr.needsUpdate = true
          this.updateBounds(line.geometry)
        } else {
          line.geometry.setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)])
          this.updateBounds(line.geometry)
        }

        const hiddenLine = this.hiddenLineMap.get(id) as THREE.Line | undefined
        if (hiddenLine) {
          const hPosAttr = hiddenLine.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count >= 2) {
            hPosAttr.setXYZ(0, start.x, start.y, start.z)
            hPosAttr.setXYZ(1, end.x, end.y, end.z)
            hPosAttr.needsUpdate = true
          } else {
            hiddenLine.geometry.setFromPoints([new THREE.Vector3(start.x, start.y, start.z), new THREE.Vector3(end.x, end.y, end.z)])
          }
          hiddenLine.computeLineDistances()
        }
      }

      line.visible = lineData.visible
      const isSelected = scene.selection.parallelLines.has(id)
      const plColor = isSelected ? SELECTED_COLOR : LINEAR_COLOR
      ;(line.material as THREE.LineBasicMaterial).color.set(plColor)

      const hiddenPlObj = this.hiddenLineMap.get(id) as THREE.Line | undefined
      if (hiddenPlObj) {
        hiddenPlObj.visible = this.hiddenEdgeEnabled && lineData.visible
        ;(hiddenPlObj.material as THREE.LineDashedMaterial).color.set(plColor)
      }

      const mid = this._syncTmpC.set(
        (lineData.p1.position.x + lineData.p2.position.x) / 2,
        (lineData.p1.position.y + lineData.p2.position.y) / 2,
        (lineData.p1.position.z + lineData.p2.position.z) / 2,
      )
      const isLabelActive =
        this.activeLabelTarget?.type === 'parallelLine' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        line,
        lineData.name ?? '',
        lineData.nameVisible && lineData.visible,
        lineData.valueVisible === true && lineData.visible,
        `=(${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.x)},${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.y)},${this.deps.labelRenderer.formatMetricNumber(lineData.p1.position.z)})+λ(${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().x)},${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().y)},${this.deps.labelRenderer.formatMetricNumber(lineData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncVectors(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.vectorIds.forEach((id) => {
      const vectorData = scene.vectors.get(id)
      if (!vectorData) return
      let vector = this.meshMap.get(id) as THREE.Line | undefined
      const p1 = vectorData.p1.position
      const p2 = vectorData.p2.position

      if (!vector) {
        const points = [
          new THREE.Vector3(p1.x, p1.y, p1.z),
          new THREE.Vector3(p2.x, p2.y, p2.z),
        ]
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        vector = new THREE.Line(geo, mat)
        vector.renderOrder = SOLID_EDGE_RENDER_ORDER
        vector.userData = { geoId: id, type: 'vector' }
        this.attachVectorArrowHead(vector)
        this.deps.world.add(vector)
        this.meshMap.set(id, vector)

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenVector = new THREE.Line(hiddenGeo, hiddenMat)
        hiddenVector.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenVector.computeLineDistances()
        this.deps.world.add(hiddenVector)
        this.hiddenLineMap.set(id, hiddenVector)
      } else {
        const posAttr = vector.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (posAttr && posAttr.count >= 2) {
          posAttr.setXYZ(0, p1.x, p1.y, p1.z)
          posAttr.setXYZ(1, p2.x, p2.y, p2.z)
          posAttr.needsUpdate = true
          this.updateBounds(vector.geometry)
        } else {
          vector.geometry.setFromPoints([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)])
          this.updateBounds(vector.geometry)
        }

        const hiddenVector = this.hiddenLineMap.get(id) as THREE.Line | undefined
        if (hiddenVector) {
          const hPosAttr = hiddenVector.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count >= 2) {
            hPosAttr.setXYZ(0, p1.x, p1.y, p1.z)
            hPosAttr.setXYZ(1, p2.x, p2.y, p2.z)
            hPosAttr.needsUpdate = true
          } else {
            hiddenVector.geometry.setFromPoints([new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)])
          }
          hiddenVector.computeLineDistances()
        }
      }

      vector.visible = vectorData.visible
      const isSelected = scene.selection.vectors.has(id)
      const vecColor = isSelected ? SELECTED_COLOR : LINEAR_COLOR
      ;(vector.material as THREE.LineBasicMaterial).color.set(vecColor)

      const hiddenVecObj = this.hiddenLineMap.get(id) as THREE.Line | undefined
      if (hiddenVecObj) {
        hiddenVecObj.visible = this.hiddenEdgeEnabled && vectorData.visible
        ;(hiddenVecObj.material as THREE.LineDashedMaterial).color.set(vecColor)
      }

      this.updateVectorArrowHead(vector, vectorData, isSelected)
      const mid = this._syncTmpC.set((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
      const isLabelActive =
        this.activeLabelTarget?.type === 'vector' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        vector,
        vectorData.name ?? '',
        vectorData.nameVisible && vectorData.visible,
        vectorData.valueVisible === true && vectorData.visible,
        `=(${this.deps.labelRenderer.formatMetricNumber(vectorData.getDirectionVector().x)},${this.deps.labelRenderer.formatMetricNumber(vectorData.getDirectionVector().y)},${this.deps.labelRenderer.formatMetricNumber(vectorData.getDirectionVector().z)})`,
        mid,
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncCircles(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.circleIds.forEach((id) => {
      const circleData = scene.circles.get(id)
      if (!circleData) return
      let resolvedDirection = circleData.isNormalCircle() && circleData.directionType && circleData.directionId
        ? this.resolveDirectionVectorForCircle(circleData.directionType, circleData.directionId)
        : undefined
      let coneForCircle: Cone3 | null = null
      if (circleData.isNormalCircle()) {
        const conesMap = scene.cones as unknown as Map<string, Cone3>
        conesMap.forEach((c) => {
          if (c.normalCircleId === id) coneForCircle = c
        })
        if (coneForCircle) {
          const cone = coneForCircle as Cone3
          const center = cone.baseCenterPoint.position
          const apex = cone.apexPoint.position
          const axis = new THREE.Vector3(
            apex.x - center.x,
            apex.y - center.y,
            apex.z - center.z,
          )
          if (axis.length() > 1e-8) {
            resolvedDirection = new Vec3(axis.x, axis.y, axis.z)
          }
        }
        let cylinderForCircle: Cylinder3 | null = null
        if (!coneForCircle) {
          const cylindersMap = scene.cylinders as unknown as Map<string, Cylinder3>
          cylindersMap.forEach((c) => {
            if (c.normalCircleId === id || c.topNormalCircleId === id) cylinderForCircle = c
          })
          if (cylinderForCircle) {
            const cylinder = cylinderForCircle as Cylinder3
            const bottomCenter = cylinder.bottomCenterPoint.position
            const topCenter = cylinder.topCenterPoint.position
            const axis = new THREE.Vector3(
              topCenter.x - bottomCenter.x,
              topCenter.y - bottomCenter.y,
              topCenter.z - bottomCenter.z,
            )
            if (axis.length() > 1e-8) {
              resolvedDirection = new Vec3(axis.x, axis.y, axis.z)
            }
          }
        }
      }
      const frame = circleData.getFrame(resolvedDirection)
      let circle = this.meshMap.get(id) as THREE.LineLoop | undefined
      if (!frame) {
        if (circle) circle.visible = false
        return
      }

      const segments = 128
      const posAttr = circle ? (circle.geometry.getAttribute('position') as THREE.BufferAttribute | null) : null
      const canDirectWrite = posAttr !== null && posAttr.count === segments

      if (!circle) {
        const points = Array.from({ length: segments }, (_, index) => {
          const angle = (Math.PI * 2 * index) / segments
          const x =
            frame.center.x +
            (frame.uAxis.x * Math.cos(angle) + frame.vAxis.x * Math.sin(angle)) * frame.radius
          const y =
            frame.center.y +
            (frame.uAxis.y * Math.cos(angle) + frame.vAxis.y * Math.sin(angle)) * frame.radius
          const z =
            frame.center.z +
            (frame.uAxis.z * Math.cos(angle) + frame.vAxis.z * Math.sin(angle)) * frame.radius
          return new THREE.Vector3(x, y, z)
        })
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = this.createSolidEdgeMaterial(LINEAR_COLOR)
        circle = new THREE.LineLoop(geo, mat)
        circle.userData = { geoId: id, type: 'circle' }
        circle.renderOrder = SOLID_EDGE_RENDER_ORDER

        const hiddenGeo = new THREE.BufferGeometry().setFromPoints(points)
        const hiddenMat = this.createHiddenEdgeMaterial(LINEAR_COLOR)
        const hiddenCircle = new THREE.LineLoop(hiddenGeo, hiddenMat)
        hiddenCircle.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        hiddenCircle.computeLineDistances()
        this.deps.world.add(hiddenCircle)
        this.hiddenLineMap.set(id, hiddenCircle)

        this.deps.world.add(circle)
        this.meshMap.set(id, circle)
      } else if (canDirectWrite) {
        for (let i = 0; i < segments; i++) {
          const angle = (Math.PI * 2 * i) / segments
          const cosA = Math.cos(angle)
          const sinA = Math.sin(angle)
          posAttr.setXYZ(
            i,
            frame.center.x + (frame.uAxis.x * cosA + frame.vAxis.x * sinA) * frame.radius,
            frame.center.y + (frame.uAxis.y * cosA + frame.vAxis.y * sinA) * frame.radius,
            frame.center.z + (frame.uAxis.z * cosA + frame.vAxis.z * sinA) * frame.radius,
          )
        }
        posAttr.needsUpdate = true
        this.updateBounds(circle.geometry)

        const hiddenCircle = this.hiddenLineMap.get(id) as THREE.LineLoop | undefined
        if (hiddenCircle) {
          const hPosAttr = hiddenCircle.geometry.getAttribute('position') as THREE.BufferAttribute | null
          if (hPosAttr && hPosAttr.count === segments) {
            for (let i = 0; i < segments; i++) {
              const angle = (Math.PI * 2 * i) / segments
              const cosA = Math.cos(angle)
              const sinA = Math.sin(angle)
              hPosAttr.setXYZ(
                i,
                frame.center.x + (frame.uAxis.x * cosA + frame.vAxis.x * sinA) * frame.radius,
                frame.center.y + (frame.uAxis.y * cosA + frame.vAxis.y * sinA) * frame.radius,
                frame.center.z + (frame.uAxis.z * cosA + frame.vAxis.z * sinA) * frame.radius,
              )
            }
            hPosAttr.needsUpdate = true
          } else {
            const points = Array.from({ length: segments }, (_, index) => {
              const angle = (Math.PI * 2 * index) / segments
              return new THREE.Vector3(
                frame.center.x + (frame.uAxis.x * Math.cos(angle) + frame.vAxis.x * Math.sin(angle)) * frame.radius,
                frame.center.y + (frame.uAxis.y * Math.cos(angle) + frame.vAxis.y * Math.sin(angle)) * frame.radius,
                frame.center.z + (frame.uAxis.z * Math.cos(angle) + frame.vAxis.z * Math.sin(angle)) * frame.radius,
              )
            })
            hiddenCircle.geometry.setFromPoints(points)
          }
          hiddenCircle.computeLineDistances()
        }
      } else {
        const points = Array.from({ length: segments }, (_, index) => {
          const angle = (Math.PI * 2 * index) / segments
          return new THREE.Vector3(
            frame.center.x + (frame.uAxis.x * Math.cos(angle) + frame.vAxis.x * Math.sin(angle)) * frame.radius,
            frame.center.y + (frame.uAxis.y * Math.cos(angle) + frame.vAxis.y * Math.sin(angle)) * frame.radius,
            frame.center.z + (frame.uAxis.z * Math.cos(angle) + frame.vAxis.z * Math.sin(angle)) * frame.radius,
          )
        })
        circle.geometry.setFromPoints(points)
        this.updateBounds(circle.geometry)

        const hiddenCircle = this.hiddenLineMap.get(id) as THREE.LineLoop | undefined
        if (hiddenCircle) {
          hiddenCircle.geometry.setFromPoints(points)
          hiddenCircle.computeLineDistances()
        }
      }

      circle.visible = circleData.visible
      const isSelected = scene.selection.circles.has(id)
      const circleColor = isSelected ? SELECTED_COLOR : LINEAR_COLOR
      ;(circle.material as THREE.LineBasicMaterial).color.set(circleColor)

      const hiddenCircle = this.hiddenLineMap.get(id) as THREE.LineLoop | undefined
      if (hiddenCircle) {
        hiddenCircle.visible = this.hiddenEdgeEnabled && circleData.visible
        ;(hiddenCircle.material as THREE.LineDashedMaterial).color.set(circleColor)
      }
      const isLabelActive =
        this.activeLabelTarget?.type === 'circle' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        circle,
        circleData.name ?? '',
        circleData.nameVisible && circleData.visible,
        circleData.valueVisible === true && circleData.visible,
        `=${this.deps.labelRenderer.formatMetricNumber(frame.radius)}`,
        this._syncTmpD.set(frame.center.x, frame.center.y, frame.center.z),
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncFaces(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.faceIds.forEach((id) => {
      const faceData = scene.faces.get(id)
      if (!faceData) return
      let faceMesh = this.meshMap.get(id) as THREE.Mesh | undefined
      const cachedIndices = faceData._cachedIndices
      const cachedBoundaryKey = faceData._cachedBoundaryKey
      const currentBoundaryKey = faceData.boundaryPointIds.join(',')
      const positions = faceData
        .getBoundaryPoints(scene.points)
        .map((p) => new THREE.Vector3(p.position.x, p.position.y, p.position.z))

      if (!faceMesh) {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.MeshBasicMaterial({
          color: faceData.fillColor ?? FACE_FILL_COLOR,
          transparent: true,
          opacity: faceData.fillOpacity ?? FACE_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
        })
        faceMesh = new THREE.Mesh(geometry, material)
        faceMesh.userData = { geoId: id, type: 'face' }
        faceMesh.renderOrder = SURFACE_RENDER_ORDER

        const depthMesh = new THREE.Mesh(
          new THREE.BufferGeometry(),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        depthMesh.name = 'faceDepthMesh'
        depthMesh.renderOrder = -1
        depthMesh.raycast = () => {}
        faceMesh.add(depthMesh)

        const outline = new THREE.LineLoop(
          new THREE.BufferGeometry(),
          this.createSolidEdgeMaterial(LINEAR_COLOR),
        )
        outline.name = 'faceOutline'
        outline.userData = { geoId: id, type: 'face' }
        outline.renderOrder = SOLID_EDGE_RENDER_ORDER
        faceMesh.add(outline)

        const hiddenOutline = new THREE.LineLoop(
          new THREE.BufferGeometry(),
          this.createHiddenEdgeMaterial(LINEAR_COLOR),
        )
        hiddenOutline.name = 'faceHiddenOutline'
        hiddenOutline.userData = { geoId: id, type: 'face' }
        hiddenOutline.renderOrder = HIDDEN_EDGE_RENDER_ORDER
        faceMesh.add(hiddenOutline)

        this.deps.world.add(faceMesh)
        this.meshMap.set(id, faceMesh)
      }

      let indices: number[]
      if (cachedIndices && cachedBoundaryKey === currentBoundaryKey) {
        indices = cachedIndices
      } else {
        const triangulated = triangulateFace(faceData.boundaryPointIds, scene.points)
        if (!triangulated) return
        indices = triangulated.indices
        faceData._cachedIndices = indices
        faceData._cachedBoundaryKey = currentBoundaryKey
      }

      const geometry = faceMesh.geometry as THREE.BufferGeometry
      const gPosAttr = geometry.getAttribute('position') as THREE.BufferAttribute | null
      if (gPosAttr && gPosAttr.count === positions.length) {
        for (let i = 0; i < positions.length; i++) {
          const p = positions[i]!
          gPosAttr.setXYZ(i, p.x, p.y, p.z)
        }
        gPosAttr.needsUpdate = true
      } else {
        geometry.setFromPoints(positions)
      }
      const gIndexAttr = geometry.getIndex()
      if (!gIndexAttr || gIndexAttr.count !== indices.length) {
        geometry.setIndex(indices)
      }
      const cachedNormalKey = faceData._cachedNormalKey
      const p0 = positions[0]!; const p1 = positions[1]!; const p2 = positions[2]!
      const d1x = p1.x - p0.x; const d1y = p1.y - p0.y; const d1z = p1.z - p0.z
      const d2x = p2.x - p0.x; const d2y = p2.y - p0.y; const d2z = p2.z - p0.z
      const currentNormalKey = `${d1x.toFixed(4)},${d1y.toFixed(4)},${d1z.toFixed(4)}|${d2x.toFixed(4)},${d2y.toFixed(4)},${d2z.toFixed(4)}`
      const normalsChanged = cachedNormalKey !== currentNormalKey
      if (normalsChanged) {
        geometry.computeVertexNormals()
        faceData._cachedNormalKey = currentNormalKey
      }
      this.updateBounds(geometry)

      const depthMesh = faceMesh.getObjectByName('faceDepthMesh') as THREE.Mesh | undefined
      if (depthMesh) {
        const depthGeo = depthMesh.geometry as THREE.BufferGeometry
        const dPosAttr = depthGeo.getAttribute('position') as THREE.BufferAttribute | null
        if (dPosAttr && dPosAttr.count === positions.length) {
          for (let i = 0; i < positions.length; i++) {
            const p = positions[i]!
            dPosAttr.setXYZ(i, p.x, p.y, p.z)
          }
          dPosAttr.needsUpdate = true
        } else {
          depthGeo.setFromPoints(positions)
        }
        const dIndexAttr = depthGeo.getIndex()
        if (!dIndexAttr || dIndexAttr.count !== indices.length) {
          depthGeo.setIndex(indices)
        }
        if (normalsChanged) {
          depthGeo.computeVertexNormals()
        }
        this.updateBounds(depthGeo)
      }

      const outline = faceMesh.getObjectByName('faceOutline') as THREE.LineLoop | undefined
      const hiddenOutline = faceMesh.getObjectByName('faceHiddenOutline') as THREE.LineLoop | undefined
      const hasBoundaryLines = faceData.boundaryLineIds.length > 0 &&
        faceData.boundaryLineIds.some((lineId) => scene.lines.has(lineId))

      if (outline) {
        const oPosAttr = outline.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (oPosAttr && oPosAttr.count === positions.length) {
          for (let i = 0; i < positions.length; i++) {
            const p = positions[i]!
            oPosAttr.setXYZ(i, p.x, p.y, p.z)
          }
          oPosAttr.needsUpdate = true
          this.updateBounds(outline.geometry)
        } else {
          outline.geometry.setFromPoints(positions)
          this.updateBounds(outline.geometry)
        }
      }
      if (hiddenOutline) {
        const hPosAttr = hiddenOutline.geometry.getAttribute('position') as THREE.BufferAttribute | null
        if (hPosAttr && hPosAttr.count === positions.length) {
          for (let i = 0; i < positions.length; i++) {
            const p = positions[i]!
            hPosAttr.setXYZ(i, p.x, p.y, p.z)
          }
          hPosAttr.needsUpdate = true
        } else {
          hiddenOutline.geometry.setFromPoints(positions)
        }
        hiddenOutline.computeLineDistances()
      }

      faceMesh.visible = faceData.visible !== false
      const outlineVisible = faceData.visible !== false && !hasBoundaryLines
      if (outline) outline.visible = outlineVisible
      if (hiddenOutline) hiddenOutline.visible = outlineVisible

      const isSelected = scene.selection.faces.has(id)
      const cubeConstraint = faceData.cubeId
        ? (scene.getCubeConstraint(faceData.cubeId) as CubeConstraint | null)
        : null
      const isCubeFullySelected = Boolean(
        cubeConstraint &&
          cubeConstraint.faceIds.length > 0 &&
          cubeConstraint.faceIds.every((faceId) => scene.selection.faces.has(faceId)),
      )
      const prismConstraint = faceData.prismId
        ? (scene.getPrismConstraint(faceData.prismId) as PrismConstraint | null)
        : null
      const prismFaceIds = prismConstraint
        ? [prismConstraint.bottomFaceId, prismConstraint.topFaceId, ...prismConstraint.sideFaceIds]
        : []
      const isPrismFullySelected = Boolean(
        prismConstraint &&
          prismFaceIds.length > 0 &&
          prismFaceIds.every((faceId) => scene.selection.faces.has(faceId)),
      )
      const shouldHighlightFaceFill = isSelected && !isCubeFullySelected && !isPrismFullySelected
      const baseColor = faceData.fillColor ?? FACE_FILL_COLOR
      const baseOpacity = faceData.fillOpacity ?? FACE_FILL_OPACITY
      ;(faceMesh.material as THREE.MeshBasicMaterial).color.set(
        shouldHighlightFaceFill ? FACE_SELECTED_COLOR : baseColor,
      )
      ;(faceMesh.material as THREE.MeshBasicMaterial).opacity = shouldHighlightFaceFill
        ? Math.max(baseOpacity, FACE_SELECTED_OPACITY)
        : baseOpacity

      const outlineColor = isSelected ? FACE_SELECTED_COLOR : LINEAR_COLOR
      if (outline) {
        ;(outline.material as THREE.LineBasicMaterial).color.set(outlineColor)
        ;(outline.material as THREE.LineBasicMaterial).opacity = isSelected ? 1 : 0.95
      }
      if (hiddenOutline) {
        ;(hiddenOutline.material as THREE.LineDashedMaterial).color.set(outlineColor)
      }

      const isLabelActive =
        this.activeLabelTarget?.type === 'face' && this.activeLabelTarget.geoId === id
      const centroid = faceData.getCentroid(scene.points)
      this._syncTmpA.set(centroid.x, centroid.y, centroid.z)
      this.syncLinearLabel(
        faceMesh,
        faceData.name ?? '',
        faceData.nameVisible && faceData.visible !== false,
        faceData.valueVisible === true && faceData.visible !== false,
        `=${this.deps.labelRenderer.formatMetricNumber(faceData.getArea(scene.points))}`,
        this._syncTmpA,
        isLabelActive ? FACE_SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncSpheres(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.sphereIds.forEach((id) => {
      const sphereData = scene.spheres.get(id)
      if (!sphereData) {
        const existing = this.meshMap.get(id)
        if (existing) {
          this.deps.world.remove(existing)
          this.meshMap.delete(id)
        }
        return
      }

      const radius = sphereData.getRadius()
      let sphereMesh = this.meshMap.get(id) as THREE.Mesh | undefined

      if (!sphereMesh) {
        const geometry = new THREE.SphereGeometry(1, 32, 24)
        const material = new THREE.MeshPhongMaterial({
          color: SPHERE_FILL_COLOR,
          transparent: true,
          opacity: SPHERE_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          shininess: 20,
          specular: 0x222222,
        })
        sphereMesh = new THREE.Mesh(geometry, material)
        sphereMesh.userData = { geoId: id, type: 'sphere' }
        sphereMesh.renderOrder = SURFACE_RENDER_ORDER

        const depthMesh = new THREE.Mesh(
          new THREE.SphereGeometry(1, 32, 24),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        depthMesh.name = 'sphereDepthMesh'
        depthMesh.renderOrder = -1
        depthMesh.raycast = () => {}
        sphereMesh.add(depthMesh)

        this.deps.world.add(sphereMesh)
        this.meshMap.set(id, sphereMesh)
      }

      const center = sphereData.centerPoint.position
      sphereMesh.position.set(center.x, center.y, center.z)
      const safeRadius = Math.max(radius, 0.001)
      sphereMesh.scale.set(safeRadius, safeRadius, safeRadius)
      sphereMesh.visible = sphereData.visible !== false

      const isSelected = scene.selection.spheres.has(id)
      const material = sphereMesh.material as THREE.MeshPhongMaterial
      material.color.set(isSelected ? SPHERE_SELECTED_COLOR : SPHERE_FILL_COLOR)
      material.opacity = isSelected ? SPHERE_SELECTED_OPACITY : SPHERE_FILL_OPACITY

      const isLabelActive =
        this.activeLabelTarget?.type === 'sphere' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        sphereMesh,
        sphereData.name ?? '',
        sphereData.nameVisible && sphereData.visible !== false,
        sphereData.valueVisible === true && sphereData.visible !== false,
        `=${this.deps.labelRenderer.formatMetricNumber(sphereData.getRadius())}`,
        this._syncTmpD.set(center.x, center.y + safeRadius, center.z),
        isLabelActive ? SPHERE_SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncCones(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.coneIds.forEach((id) => {
      const coneData = scene.cones.get(id)
      if (!coneData) {
        const existing = this.meshMap.get(id)
        if (existing) {
          this.deps.world.remove(existing)
          this.meshMap.delete(id)
        }
        const existingGroup = this.groupMap.get(id)
        if (existingGroup) {
          this.deps.world.remove(existingGroup)
          this.groupMap.delete(id)
        }
        return
      }

      const frame = coneData.getFrame()
      if (!frame) {
        const existingGroup = this.groupMap.get(id)
        if (existingGroup) {
          this.deps.world.remove(existingGroup)
          this.groupMap.delete(id)
        }
        return
      }

      let coneGroup = this.groupMap.get(id) as THREE.Group | undefined

      if (!coneGroup) {
        coneGroup = new THREE.Group()
        coneGroup.userData = { geoId: id, type: 'cone' }

        const sideGeometry = new THREE.ConeGeometry(1, 1, CONE_SEGMENTS, 1, true)
        const sideMaterial = new THREE.MeshPhongMaterial({
          color: CONE_FILL_COLOR,
          transparent: true,
          opacity: CONE_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          shininess: 20,
          specular: 0x222222,
        })
        const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial)
        sideMesh.userData = { geoId: id, type: 'cone' }
        sideMesh.renderOrder = SURFACE_RENDER_ORDER
        sideMesh.name = 'coneSide'

        const sideDepthMesh = new THREE.Mesh(
          new THREE.ConeGeometry(1, 1, CONE_SEGMENTS, 1, true),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        sideDepthMesh.renderOrder = -1
        sideDepthMesh.name = 'coneSideDepth'
        sideDepthMesh.raycast = () => {}
        sideMesh.add(sideDepthMesh)

        const baseGeometry = new THREE.CircleGeometry(1, CONE_SEGMENTS)
        const baseMaterial = new THREE.MeshPhongMaterial({
          color: CONE_FILL_COLOR,
          transparent: true,
          opacity: CONE_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          shininess: 20,
          specular: 0x222222,
        })
        const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial)
        baseMesh.userData = { geoId: id, type: 'coneBase' }
        baseMesh.renderOrder = SURFACE_RENDER_ORDER
        baseMesh.name = 'coneBase'

        const baseDepthMesh = new THREE.Mesh(
          new THREE.CircleGeometry(1, CONE_SEGMENTS),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        baseDepthMesh.renderOrder = -1
        baseDepthMesh.name = 'coneBaseDepth'
        baseDepthMesh.raycast = () => {}
        baseMesh.add(baseDepthMesh)

        coneGroup.add(sideMesh)
        coneGroup.add(baseMesh)
        this.deps.world.add(coneGroup)
        this.groupMap.set(id, coneGroup)
      }

      const { center, radius, height, normal, apex } = frame
      const safeRadius = Math.max(radius, 0.001)
      const safeHeight = Math.max(height, 0.001)

      const sideMesh = coneGroup.getObjectByName('coneSide') as THREE.Mesh
      if (sideMesh) {
        sideMesh.scale.set(safeRadius, safeHeight, safeRadius)
        sideMesh.position.set(0, safeHeight / 2, 0)
      }

      const baseMesh = coneGroup.getObjectByName('coneBase') as THREE.Mesh
      if (baseMesh) {
        baseMesh.scale.set(safeRadius, safeRadius, 1)
        baseMesh.rotation.x = -Math.PI / 2
        baseMesh.position.set(0, 0, 0)
      }

      const yAxis = new THREE.Vector3(0, 1, 0)
      const targetNormal = new THREE.Vector3(normal.x, normal.y, normal.z)
      const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, targetNormal)

      coneGroup.position.set(center.x, center.y, center.z)
      coneGroup.quaternion.copy(quaternion)
      coneGroup.visible = coneData.visible !== false

      const isSelected = scene.selection.cones.has(id)
      const isBaseCircleSelected = coneData.normalCircleId
        ? scene.selection.circles.has(coneData.normalCircleId)
        : false
      if (sideMesh) {
        const sideMat = sideMesh.material as THREE.MeshPhongMaterial
        sideMat.color.set(isSelected ? CONE_SELECTED_COLOR : CONE_FILL_COLOR)
        sideMat.opacity = isSelected ? CONE_SELECTED_OPACITY : CONE_FILL_OPACITY
      }
      if (baseMesh) {
        const baseMat = baseMesh.material as THREE.MeshPhongMaterial
        baseMat.color.set(isSelected || isBaseCircleSelected ? CONE_SELECTED_COLOR : CONE_FILL_COLOR)
        baseMat.opacity = isSelected || isBaseCircleSelected ? CONE_SELECTED_OPACITY : CONE_FILL_OPACITY
      }

      const isLabelActive =
        this.activeLabelTarget?.type === 'cone' && this.activeLabelTarget.geoId === id
      this._syncTmpD.set(
        (center.x + apex.x) / 2,
        (center.y + apex.y) / 2,
        (center.z + apex.z) / 2,
      )
      this.syncLinearLabel(
        coneGroup,
        coneData.name ?? '',
        coneData.nameVisible && coneData.visible !== false,
        coneData.valueVisible === true && coneData.visible !== false,
        `V=${this.deps.labelRenderer.formatMetricNumber(coneData.getVolume())}`,
        this._syncTmpD,
        isLabelActive ? CONE_SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncCylinders(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.cylinderIds.forEach((id) => {
      const cylinderData = scene.cylinders.get(id)
      if (!cylinderData) {
        const existing = this.meshMap.get(id)
        if (existing) {
          this.deps.world.remove(existing)
          this.meshMap.delete(id)
        }
        const existingGroup = this.groupMap.get(id)
        if (existingGroup) {
          this.deps.world.remove(existingGroup)
          this.groupMap.delete(id)
        }
        return
      }

      const frame = cylinderData.getFrame()
      if (!frame) {
        const existingGroup = this.groupMap.get(id)
        if (existingGroup) {
          this.deps.world.remove(existingGroup)
          this.groupMap.delete(id)
        }
        return
      }

      let cylinderGroup = this.groupMap.get(id) as THREE.Group | undefined

      if (!cylinderGroup) {
        cylinderGroup = new THREE.Group()
        cylinderGroup.userData = { geoId: id, type: 'cylinder' }

        const sideGeometry = new THREE.CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS, 1, true)
        const sideMaterial = new THREE.MeshPhongMaterial({
          color: CYLINDER_FILL_COLOR,
          transparent: true,
          opacity: CYLINDER_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          shininess: 20,
          specular: 0x222222,
        })
        const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial)
        sideMesh.userData = { geoId: id, type: 'cylinder' }
        sideMesh.renderOrder = SURFACE_RENDER_ORDER
        sideMesh.name = 'cylinderSide'

        const sideDepthMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(1, 1, 1, CYLINDER_SEGMENTS, 1, true),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        sideDepthMesh.renderOrder = -1
        sideDepthMesh.name = 'cylinderSideDepth'
        sideDepthMesh.raycast = () => {}
        sideMesh.add(sideDepthMesh)

        const bottomGeometry = new THREE.CircleGeometry(1, CYLINDER_SEGMENTS)
        const bottomMaterial = new THREE.MeshPhongMaterial({
          color: CYLINDER_FILL_COLOR,
          transparent: true,
          opacity: CYLINDER_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          shininess: 20,
          specular: 0x222222,
        })
        const bottomMesh = new THREE.Mesh(bottomGeometry, bottomMaterial)
        bottomMesh.userData = { geoId: id, type: 'cylinderBottom' }
        bottomMesh.renderOrder = SURFACE_RENDER_ORDER
        bottomMesh.name = 'cylinderBottom'

        const bottomDepthMesh = new THREE.Mesh(
          new THREE.CircleGeometry(1, CYLINDER_SEGMENTS),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        bottomDepthMesh.renderOrder = -1
        bottomDepthMesh.name = 'cylinderBottomDepth'
        bottomDepthMesh.raycast = () => {}
        bottomMesh.add(bottomDepthMesh)

        const topGeometry = new THREE.CircleGeometry(1, CYLINDER_SEGMENTS)
        const topMaterial = new THREE.MeshPhongMaterial({
          color: CYLINDER_FILL_COLOR,
          transparent: true,
          opacity: CYLINDER_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          depthTest: false,
          shininess: 20,
          specular: 0x222222,
        })
        const topMesh = new THREE.Mesh(topGeometry, topMaterial)
        topMesh.userData = { geoId: id, type: 'cylinderTop' }
        topMesh.renderOrder = SURFACE_RENDER_ORDER
        topMesh.name = 'cylinderTop'

        const topDepthMesh = new THREE.Mesh(
          new THREE.CircleGeometry(1, CYLINDER_SEGMENTS),
          new THREE.MeshBasicMaterial({
            colorWrite: false,
            depthWrite: true,
            side: THREE.DoubleSide,
          }),
        )
        topDepthMesh.renderOrder = -1
        topDepthMesh.name = 'cylinderTopDepth'
        topDepthMesh.raycast = () => {}
        topMesh.add(topDepthMesh)

        cylinderGroup.add(sideMesh)
        cylinderGroup.add(bottomMesh)
        cylinderGroup.add(topMesh)
        this.deps.world.add(cylinderGroup)
        this.groupMap.set(id, cylinderGroup)
      }

      const { bottomCenter, topCenter, radius, height, normal } = frame
      const safeRadius = Math.max(radius, 0.001)
      const safeHeight = Math.max(height, 0.001)

      const sideMesh = cylinderGroup.getObjectByName('cylinderSide') as THREE.Mesh
      if (sideMesh) {
        sideMesh.scale.set(safeRadius, safeHeight, safeRadius)
        sideMesh.position.set(0, safeHeight / 2, 0)
      }

      const bottomMesh = cylinderGroup.getObjectByName('cylinderBottom') as THREE.Mesh
      if (bottomMesh) {
        bottomMesh.scale.set(safeRadius, safeRadius, 1)
        bottomMesh.rotation.x = -Math.PI / 2
        bottomMesh.position.set(0, 0, 0)
      }

      const topMesh = cylinderGroup.getObjectByName('cylinderTop') as THREE.Mesh
      if (topMesh) {
        topMesh.scale.set(safeRadius, safeRadius, 1)
        topMesh.rotation.x = Math.PI / 2
        topMesh.position.set(0, safeHeight, 0)
      }

      const yAxis = new THREE.Vector3(0, 1, 0)
      const targetNormal = new THREE.Vector3(normal.x, normal.y, normal.z)
      const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, targetNormal)

      cylinderGroup.position.set(bottomCenter.x, bottomCenter.y, bottomCenter.z)
      cylinderGroup.quaternion.copy(quaternion)
      cylinderGroup.visible = cylinderData.visible !== false

      const isSelected = scene.selection.cylinders.has(id)
      const isBottomCircleSelected = cylinderData.normalCircleId
        ? scene.selection.circles.has(cylinderData.normalCircleId)
        : false
      const isTopCircleSelected = cylinderData.topNormalCircleId
        ? scene.selection.circles.has(cylinderData.topNormalCircleId)
        : false

      const fillColor = isSelected ? CYLINDER_SELECTED_COLOR : CYLINDER_FILL_COLOR
      const fillOpacity = isSelected ? CYLINDER_SELECTED_OPACITY : CYLINDER_FILL_OPACITY
      if (sideMesh) {
        const sideMat = sideMesh.material as THREE.MeshPhongMaterial
        sideMat.color.set(fillColor)
        sideMat.opacity = fillOpacity
      }
      if (bottomMesh) {
        const bottomMat = bottomMesh.material as THREE.MeshPhongMaterial
        bottomMat.color.set(isSelected || isBottomCircleSelected ? CYLINDER_SELECTED_COLOR : CYLINDER_FILL_COLOR)
        bottomMat.opacity = isSelected || isBottomCircleSelected ? CYLINDER_SELECTED_OPACITY : CYLINDER_FILL_OPACITY
      }
      if (topMesh) {
        const topMat = topMesh.material as THREE.MeshPhongMaterial
        topMat.color.set(isSelected || isTopCircleSelected ? CYLINDER_SELECTED_COLOR : CYLINDER_FILL_COLOR)
        topMat.opacity = isSelected || isTopCircleSelected ? CYLINDER_SELECTED_OPACITY : CYLINDER_FILL_OPACITY
      }

      const isLabelActive =
        this.activeLabelTarget?.type === 'cylinder' && this.activeLabelTarget.geoId === id
      this._syncTmpD.set(
        (bottomCenter.x + topCenter.x) / 2,
        (bottomCenter.y + topCenter.y) / 2,
        (bottomCenter.z + topCenter.z) / 2,
      )
      this.syncLinearLabel(
        cylinderGroup,
        cylinderData.name ?? '',
        cylinderData.nameVisible && cylinderData.visible !== false,
        cylinderData.valueVisible === true && cylinderData.visible !== false,
        `V=${this.deps.labelRenderer.formatMetricNumber(cylinderData.getVolume())}`,
        this._syncTmpD,
        isLabelActive ? CYLINDER_SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncCubeValueLabels(scene: GeoScene): void {
    const isDragging = scene.activeDraggedPointIds.size > 0
    const cubes = [...scene.cubeConstraints.values()].filter(
      (constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint,
    )
    const activeCubeIds = new Set(cubes.map((cube) => cube.cubeId))
    this.deps.labelRenderer.cubeValueLabels.forEach((label, cubeId) => {
      if (activeCubeIds.has(cubeId)) return
      this.deps.world.remove(label)
      this.deps.labelRenderer.cubeValueLabels.delete(cubeId)
    })

    cubes.forEach((cube) => {
      const centroid = cube.getCentroid()
      const visible = cube.valueVisible === true && centroid !== null
      const existing = this.deps.labelRenderer.cubeValueLabels.get(cube.cubeId)
      if (!visible) {
        if (existing) existing.visible = false
        return
      }
      const text = `=${this.deps.labelRenderer.formatMetricNumber(cube.getVolume())}`
      const color = LINEAR_COLOR
      if (!existing) {
        const sprite = this.deps.labelRenderer.makeValueLabelSprite(text, color, false)
        sprite.center.set(0.5, LINE_LABEL_CENTER_Y)
        sprite.renderOrder = 10
        this.deps.labelRenderer.setAdaptiveSpriteScale(sprite, this.getLineLabelScale())
        const userData = this.getLabelUserData(sprite)
        userData.text = text
        userData.isNameLabel = true
        userData.isValueLabel = true
        userData.geoId = cube.faceIds[0] ?? cube.cubeId
        userData.geoType = 'face'
        this._syncTmpA.set(centroid!.x, centroid!.y, centroid!.z)
        sprite.position.copy(
          this.getScreenOffsetPosition(this._syncTmpA, 0, LINE_LABEL_OFFSET_Y),
        )
        this.deps.labelRenderer.cubeValueLabels.set(cube.cubeId, sprite)
        this.deps.world.add(sprite)
        return
      }
      existing.visible = true
      this._syncTmpA.set(centroid!.x, centroid!.y, centroid!.z)
      existing.position.copy(
        this.getScreenOffsetPosition(this._syncTmpA, 0, LINE_LABEL_OFFSET_Y),
      )
      if (isDragging && this.syncFrameCounter % GeometrySyncer.DRAG_LABEL_UPDATE_INTERVAL !== 0) return
      const labelData = this.getLabelUserData(existing)
      if (labelData.text !== text) {
        labelData.text = text
        const material = existing.material as THREE.SpriteMaterial
        const oldMap = material.map as THREE.CanvasTexture | null
        const nextSprite = this.deps.labelRenderer.makeValueLabelSprite(text, color, false)
        material.map = (nextSprite.material as THREE.SpriteMaterial).map
        if (oldMap) oldMap.dispose()
        Object.assign(labelData, this.getLabelUserData(nextSprite))
        labelData.text = text
        labelData.isNameLabel = true
        labelData.isValueLabel = true
        labelData.geoId = cube.faceIds[0] ?? cube.cubeId
        labelData.geoType = 'face'
        this.deps.labelRenderer.setAdaptiveSpriteScale(existing, this.getLineLabelScale())
      }
    })
  }

  syncPrismValueLabels(scene: GeoScene): void {
    const isDragging = scene.activeDraggedPointIds.size > 0
    const prisms = [...scene.prismConstraints.values()].filter(
      (constraint): constraint is PrismConstraint => constraint instanceof PrismConstraint,
    )
    const activePrismIds = new Set(prisms.map((prism) => prism.prismId))
    this.deps.labelRenderer.prismValueLabels.forEach((label, prismId) => {
      if (activePrismIds.has(prismId)) return
      this.deps.world.remove(label)
      this.deps.labelRenderer.prismValueLabels.delete(prismId)
    })

    prisms.forEach((prism) => {
      const centroid = prism.getCentroid()
      const visible = prism.valueVisible === true && centroid !== null
      const existing = this.deps.labelRenderer.prismValueLabels.get(prism.prismId)
      if (!visible) {
        if (existing) existing.visible = false
        return
      }
      const text = `=${this.deps.labelRenderer.formatMetricNumber(prism.getVolume())}`
      const color = LINEAR_COLOR
      if (!existing) {
        const sprite = this.deps.labelRenderer.makeValueLabelSprite(text, color, false)
        sprite.center.set(0.5, LINE_LABEL_CENTER_Y)
        sprite.renderOrder = 10
        this.deps.labelRenderer.setAdaptiveSpriteScale(sprite, this.getLineLabelScale())
        const userData = this.getLabelUserData(sprite)
        userData.text = text
        userData.isNameLabel = true
        userData.isValueLabel = true
        userData.geoId = prism.topFaceId ?? prism.prismId
        userData.geoType = 'face'
        this._syncTmpA.set(centroid!.x, centroid!.y, centroid!.z)
        sprite.position.copy(
          this.getScreenOffsetPosition(this._syncTmpA, 0, LINE_LABEL_OFFSET_Y),
        )
        this.deps.labelRenderer.prismValueLabels.set(prism.prismId, sprite)
        this.deps.world.add(sprite)
        return
      }
      existing.visible = true
      this._syncTmpA.set(centroid!.x, centroid!.y, centroid!.z)
      existing.position.copy(
        this.getScreenOffsetPosition(this._syncTmpA, 0, LINE_LABEL_OFFSET_Y),
      )
      if (isDragging && this.syncFrameCounter % GeometrySyncer.DRAG_LABEL_UPDATE_INTERVAL !== 0) return
      const labelData = this.getLabelUserData(existing)
      if (labelData.text !== text) {
        labelData.text = text
        const material = existing.material as THREE.SpriteMaterial
        const oldMap = material.map as THREE.CanvasTexture | null
        const nextSprite = this.deps.labelRenderer.makeValueLabelSprite(text, color, false)
        material.map = (nextSprite.material as THREE.SpriteMaterial).map
        if (oldMap) oldMap.dispose()
        Object.assign(labelData, this.getLabelUserData(nextSprite))
        labelData.text = text
        labelData.isNameLabel = true
        labelData.isValueLabel = true
        labelData.geoId = prism.topFaceId ?? prism.prismId
        labelData.geoType = 'face'
        this.deps.labelRenderer.setAdaptiveSpriteScale(existing, this.getLineLabelScale())
      }
    })
  }

  syncLinearLabel(
    object: THREE.Object3D,
    text: string,
    visible: boolean,
    valueVisible: boolean,
    valueText: string,
    anchor: THREE.Vector3,
    color: number,
  ): void {
    const labelKey = '__labelSprite'
    const objectUserData = this.getRenderUserData(object)
    const existingLabel = objectUserData[labelKey] as THREE.Sprite | undefined
    const existingValueLabel = objectUserData.__valueLabelSprite
    if (existingValueLabel) existingValueLabel.visible = false
    objectUserData.__labelAnchor = anchor.clone()
    const source = this.getLinearLabelSource(object)
    objectUserData.__labelOffsetX = source?.labelOffsetX ?? 0
    objectUserData.__labelOffsetY = source?.labelOffsetY ?? LINE_LABEL_OFFSET_Y
    const showAny = visible || valueVisible
    const combinedValueText = valueVisible ? valueText : ''
    if (!showAny) {
      if (existingLabel) {
        existingLabel.visible = false
        this.getLabelUserData(existingLabel).__textureDirty = true
      }
    } else if (!existingLabel) {
      const nameSprite = visible
        ? this.deps.labelRenderer.makeLineLabelSprite(text, color, combinedValueText)
        : this.deps.labelRenderer.makeValueLabelSprite(valueText, color, false)
      const nameSpriteData = this.getLabelUserData(nameSprite)
      nameSprite.position.copy(
        this.getScreenOffsetPosition(anchor, 0, LINE_LABEL_OFFSET_Y),
      )
      nameSprite.center.set(
        this.computeLinearLabelCenterX(visible, combinedValueText, nameSpriteData.canvasPixelWidth ?? 256),
        LINE_LABEL_CENTER_Y,
      )
      nameSprite.renderOrder = 10
      const scale = this.getLineLabelScale()
      this.deps.labelRenderer.setLabelSpriteScale(nameSprite, scale)
      const labelUserData = nameSpriteData
      labelUserData.text = visible ? `${text}${combinedValueText}` : valueText
      labelUserData.isNameLabel = true
      labelUserData.geoId = object.userData.geoId
      labelUserData.geoType = object.userData.type
      objectUserData[labelKey] = nameSprite
      this.deps.world.add(nameSprite)
    } else {
      existingLabel.visible = true
      existingLabel.center.set(
        this.computeLinearLabelCenterX(visible, combinedValueText, this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256),
        LINE_LABEL_CENTER_Y,
      )
      existingLabel.position.copy(
        this.getScreenOffsetPosition(
          anchor,
          objectUserData.__labelOffsetX ?? 0,
          objectUserData.__labelOffsetY ?? LINE_LABEL_OFFSET_Y,
        ),
      )
      const labelData = this.getLabelUserData(existingLabel)
      const isDragging = (this.currentSceneRef?.activeDraggedPointIds.size ?? 0) > 0
      const wasDirty = labelData.__textureDirty
      if (wasDirty) labelData.__textureDirty = false
      const nextText = visible ? `${text}${combinedValueText}` : valueText
      const labelText = this.getLabelUserData(existingLabel).text ?? ''
      const textChanged = labelText !== nextText
      const shouldUpdateTexture = wasDirty || textChanged || (!isDragging && (this.syncFrameCounter % GeometrySyncer.DRAG_LABEL_UPDATE_INTERVAL === 0))
      if (!shouldUpdateTexture) return
      if (labelText !== nextText) {
        this.getLabelUserData(existingLabel).text = nextText
        const material = existingLabel.material as THREE.SpriteMaterial
        const oldMap = material.map as THREE.CanvasTexture | null
        const newSprite = visible
          ? this.deps.labelRenderer.makeLineLabelSprite(text, color, combinedValueText)
          : this.deps.labelRenderer.makeValueLabelSprite(valueText, color, false)
        Object.assign(this.getLabelUserData(existingLabel), this.getLabelUserData(newSprite))
        material.map = (newSprite.material as THREE.SpriteMaterial).map
        if (oldMap) oldMap.dispose()
        existingLabel.center.set(
          this.computeLinearLabelCenterX(visible, combinedValueText, this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256),
          LINE_LABEL_CENTER_Y,
        )
        this.deps.labelRenderer.setLabelSpriteScale(existingLabel, this.getLineLabelScale())
      } else {
        const material = existingLabel.material as THREE.SpriteMaterial
        const map = material.map as THREE.CanvasTexture | null
        if (map) {
          const ctx = (map.image as HTMLCanvasElement).getContext('2d')
          if (ctx) {
            const result = visible
              ? combinedValueText
                ? this.deps.labelRenderer.drawCombinedLabel(
                    ctx,
                    map.image as HTMLCanvasElement,
                    text,
                    combinedValueText,
                    color,
                    56,
                  )
                : this.deps.labelRenderer.drawNameLabel(
                    ctx,
                    map.image as HTMLCanvasElement,
                    text,
                    color,
                    56,
                  )
              : this.deps.labelRenderer.drawPlainLabel(ctx, map.image as HTMLCanvasElement, valueText, color, 56)
            Object.assign(this.getLabelUserData(existingLabel), result)
            material.map = this.deps.labelRenderer.safeUpdateCanvasTexture(
              map,
              result.canvasResized ?? false,
            )
            existingLabel.center.set(
              this.computeLinearLabelCenterX(visible, combinedValueText, this.getLabelUserData(existingLabel).canvasPixelWidth ?? 256),
              LINE_LABEL_CENTER_Y,
            )
            this.deps.labelRenderer.setLabelSpriteScale(existingLabel, this.getLineLabelScale())
          }
        }
      }
    }
  }

  cleanupMissingMeshes(scene: GeoScene): void {
    this.meshMap.forEach((obj, id) => {
      const userData = this.getRenderUserData(obj)
      const type = userData.type
      const getCollection = type ? TYPE_TO_SCENE_MAP[type] : undefined
      if (getCollection && !getCollection(scene).has(id)) {
        this.removeMeshWithLabels(obj, userData, this.meshMap, id)
      }
    })
    this.groupMap.forEach((obj, id) => {
      if (!scene.cones.has(id) && !scene.cylinders.has(id)) {
        const userData = this.getRenderUserData(obj)
        this.removeMeshWithLabels(obj, userData, this.groupMap, id)
      }
    })
    const activeCubeIds = new Set(
      [...scene.cubeConstraints.values()]
        .filter((constraint): constraint is CubeConstraint => constraint instanceof CubeConstraint)
        .map((constraint) => constraint.cubeId),
    )
    this.deps.labelRenderer.cubeValueLabels.forEach((label, cubeId) => {
      if (activeCubeIds.has(cubeId)) return
      this.deps.world.remove(label)
      this.deps.labelRenderer.cubeValueLabels.delete(cubeId)
    })

    const activePrismIds = new Set(
      [...scene.prismConstraints.values()]
        .filter((constraint): constraint is PrismConstraint => constraint instanceof PrismConstraint)
        .map((constraint) => constraint.prismId),
    )
    this.deps.labelRenderer.prismValueLabels.forEach((label, prismId) => {
      if (activePrismIds.has(prismId)) return
      this.deps.world.remove(label)
      this.deps.labelRenderer.prismValueLabels.delete(prismId)
    })

    this.hiddenLineMap.forEach((obj, id) => {
      if (!this.meshMap.has(id) && !this.groupMap.has(id)) {
        this.deps.world.remove(obj)
        this.hiddenLineMap.delete(id)
      }
    })

    this.footMarkerMap.forEach((mesh, id) => {
      if (!scene.perpendicularLines.has(id)) {
        this.deps.world.remove(mesh)
        this.footMarkerMap.delete(id)
      }
    })
  }

  removeMeshWithLabels(obj: THREE.Object3D, userData: RenderObjectUserData, map: Map<string, THREE.Object3D>, id: string): void {
    const label = userData.__labelSprite
    if (label) {
      const labelMat = (label as THREE.Sprite).material as THREE.SpriteMaterial
      if (labelMat.map) (labelMat.map as THREE.CanvasTexture).dispose()
      labelMat.dispose()
      this.deps.world.remove(label)
    }
    const valueLabel = userData.__valueLabelSprite
    if (valueLabel) {
      const vlMat = (valueLabel as THREE.Sprite).material as THREE.SpriteMaterial
      if (vlMat.map) (vlMat.map as THREE.CanvasTexture).dispose()
      vlMat.dispose()
      this.deps.world.remove(valueLabel)
    }
    this.deps.world.remove(obj)
    map.delete(id)

    const hiddenLine = this.hiddenLineMap.get(id)
    if (hiddenLine) {
      this.deps.world.remove(hiddenLine)
      this.hiddenLineMap.delete(id)
    }

    const footMarker = this.footMarkerMap.get(id)
    if (footMarker) {
      this.deps.world.remove(footMarker)
      this.footMarkerMap.delete(id)
    }
  }

  updateFacePreview(data: FacePreviewData | null | undefined): void {
    if (!this.facePreviewGroup) {
      this.facePreviewGroup = new THREE.Group()

      const fill = new THREE.Mesh(
        new THREE.BufferGeometry(),
        new THREE.MeshBasicMaterial({
          color: FACE_PREVIEW_COLOR,
          transparent: true,
          opacity: FACE_PREVIEW_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      )
      fill.name = 'facePreviewFill'
      this.facePreviewGroup.add(fill)

      const outline = new THREE.LineLoop(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          color: FACE_PREVIEW_COLOR,
          dashSize: 0.2,
          gapSize: 0.1,
          transparent: true,
          opacity: 0.9,
        }),
      )
      outline.name = 'facePreviewOutline'
      this.facePreviewGroup.add(outline)

      const adjustments = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineDashedMaterial({
          color: 0xffd166,
          dashSize: 0.12,
          gapSize: 0.08,
          transparent: true,
          opacity: 0.85,
        }),
      )
      adjustments.name = 'facePreviewAdjustments'
      this.facePreviewGroup.add(adjustments)

      this.deps.world.add(this.facePreviewGroup)
    }

    this.facePreviewGroup.visible = Boolean(data && data.boundary.length >= 3)
    if (!data || data.boundary.length < 3) return

    const fill = this.facePreviewGroup.getObjectByName('facePreviewFill') as THREE.Mesh
    const outline = this.facePreviewGroup.getObjectByName('facePreviewOutline') as THREE.LineLoop
    const adjustments = this.facePreviewGroup.getObjectByName(
      'facePreviewAdjustments',
    ) as THREE.LineSegments

    const boundary = data.boundary.map((point) => new THREE.Vector3(point.x, point.y, point.z))
    const plane = computePlaneBasis(data.boundary)
    if (!plane) {
      this.facePreviewGroup.visible = false
      return
    }
    const triangulated = THREE.ShapeUtils.triangulateShape(
      data.boundary.map((point) => {
        const projected = projectPoint2D(point, plane)
        return new THREE.Vector2(projected.x, projected.y)
      }),
      [],
    )
    const fillGeometry = fill.geometry as THREE.BufferGeometry
    fillGeometry.setFromPoints(boundary)
    fillGeometry.setIndex(triangulated.flat())
    fillGeometry.computeVertexNormals()
    this.updateBounds(fillGeometry)

    outline.geometry.setFromPoints(boundary)
    outline.computeLineDistances()

    const adjustmentPoints = data.adjustedPoints.flatMap((item) => [
      new THREE.Vector3(item.from.x, item.from.y, item.from.z),
      new THREE.Vector3(item.to.x, item.to.y, item.to.z),
    ])
    adjustments.visible = adjustmentPoints.length > 0
    adjustments.geometry.setFromPoints(adjustmentPoints)
    adjustments.computeLineDistances()
  }

  updateRubberBand(data?: { from: THREE.Vector3; to: THREE.Vector3 } | null): void {
    if (!data) {
      if (this.rubberBand) this.rubberBand.visible = false
      return
    }

    if (!this.rubberBand) {
      const geo = new THREE.BufferGeometry().setFromPoints([data.from, data.to])
      const mat = new THREE.LineDashedMaterial({
        color: SELECTED_COLOR,
        dashSize: 0.2,
        gapSize: 0.1,
      })
      this.rubberBand = new THREE.Line(geo, mat)
      this.rubberBand.computeLineDistances()
      this.deps.world.add(this.rubberBand)
    } else {
      this.rubberBand.visible = true
      this.rubberBand.geometry.setFromPoints([data.from, data.to])
      this.rubberBand.computeLineDistances()
    }
  }

  resolveDirectionVectorForCircle(directionType: string, directionId: string): Vec3 | null {
    if (directionType === 'point') {
      return new Vec3(0, 1, 0)
    }
    const getCollection = DIRECTION_TYPE_TO_COLLECTION[directionType]
    if (!getCollection) return null
    const geo = getCollection(this.currentSceneRef!).get(directionId)
    if (!geo) return null
    return new Vec3(
      geo.p2.position.x - geo.p1.position.x,
      geo.p2.position.y - geo.p1.position.y,
      geo.p2.position.z - geo.p1.position.z,
    )
  }

  isPointReferencedByOtherVisibleGeometry(
    pointId: string,
    scene: GeoScene,
    excludeCircleId?: string,
  ): boolean {
    for (const getCollection of TWO_POINT_COLLECTIONS) {
      for (const geo of getCollection(scene).values()) {
        if (geo.visible && (geo.p1.id === pointId || geo.p2.id === pointId)) return true
      }
    }
    for (const circle of scene.circles.values()) {
      if (circle.id !== excludeCircleId && circle.visible &&
        (circle.p1.id === pointId || circle.p2.id === pointId || circle.p3.id === pointId)) return true
    }
    for (const face of scene.faces.values()) {
      if (face.visible !== false && face.includesPoint(pointId)) return true
    }
    return false
  }

  invalidatePointRefCache() {
    this.pointRefCacheValid = false
  }

  getCachedPointRef(pointId: string, scene: GeoScene, excludeCircleId?: string): boolean {
    if (this.pointRefCacheValid) {
      const cached = this.pointRefCache.get(pointId)
      if (cached !== undefined) return cached
    }
    const result = this.isPointReferencedByOtherVisibleGeometry(pointId, scene, excludeCircleId)
    this.pointRefCache.set(pointId, result)
    return result
  }

  computePointBaseColor(p: Point3, scene: GeoScene): number {
    return computePointBaseColor(p, scene)
  }

  computeLinearLabelCenterX(visible: boolean, combinedValueText: string, canvasPixelWidth: number): number {
    if (visible && !combinedValueText) return this.getDefaultLabelCenterX(false)
    return this.getStableLabelCenterX(canvasPixelWidth, false)
  }

  computePointLabelCenterX(nameVisible: boolean, combinedValueText: string, canvasPixelWidth: number): number {
    if (nameVisible && !combinedValueText) return this.getDefaultLabelCenterX(true)
    return this.getStableLabelCenterX(canvasPixelWidth, true)
  }

  getDefaultLabelCenterX(isPoint: boolean): number {
    return isPoint ? POINT_LABEL_CENTER_X : LINE_LABEL_CENTER_X
  }

  getStableLabelCenterX(canvasWidth: number, isPoint: boolean): number {
    const baseCanvasWidth = 256
    const baseCenter = isPoint
      ? POINT_LABEL_CENTER_X * baseCanvasWidth
      : LINE_LABEL_CENTER_X * baseCanvasWidth
    return THREE.MathUtils.clamp(baseCenter / Math.max(canvasWidth, 1), 0, 0.5)
  }

  getPointLabelBaseOffset() {
    return { x: POINT_LABEL_OFFSET_X, y: POINT_LABEL_OFFSET_Y } as const
  }

  getLinearLabelBaseOffsetY() {
    return LINE_LABEL_OFFSET_Y
  }

  getLinearLabelSource(object: THREE.Object3D) {
    const geoId = object.userData.geoId
    const type = object.userData.type
    if (!geoId || !this.currentSceneRef || !type) return null
    const getCollection = TYPE_TO_SCENE_MAP[type]
    if (!getCollection) return null
    return getCollection(this.currentSceneRef).get(geoId) ?? null
  }

  getScreenOffsetPosition(pointPos: THREE.Vector3, offsetXpx: number, offsetYpx: number): THREE.Vector3 {
    const camera = this.deps.getActiveCamera()
    const worldPoint = this.deps.world.localToWorld(this._screenOffsetTmpWorld.copy(pointPos))
    const v = this._screenOffsetTmpView.copy(worldPoint).applyMatrix4(camera.matrixWorldInverse)

    const w = this.deps.renderer.domElement.clientWidth || 1
    const h = this.deps.renderer.domElement.clientHeight || 1
    const aspect = w / h
    const perspectiveCam = (camera as THREE.PerspectiveCamera).isPerspectiveCamera
      ? (camera as THREE.PerspectiveCamera)
      : null
    const orthoCam = (camera as THREE.OrthographicCamera).isOrthographicCamera
      ? (camera as THREE.OrthographicCamera)
      : null

    let offsetViewX: number
    let offsetViewY: number
    if (perspectiveCam) {
      const depth = -v.z
      const halfH = depth * Math.tan(((perspectiveCam.fov * Math.PI) / 180) / 2)
      const halfW = halfH * aspect
      offsetViewX = (offsetXpx / w) * 2 * halfW
      offsetViewY = (offsetYpx / h) * 2 * halfH
    } else if (orthoCam) {
      const halfH = (orthoCam.top - orthoCam.bottom) / 2
      const halfW = (orthoCam.right - orthoCam.left) / 2
      offsetViewX = (offsetXpx / w) * 2 * halfW
      offsetViewY = (offsetYpx / h) * 2 * halfH
    } else {
      offsetViewX = 0
      offsetViewY = 0
    }

    v.x += offsetViewX
    v.y += offsetViewY

    this._screenOffsetTmpResult.copy(v).applyMatrix4(camera.matrixWorld)
    return this.deps.world.worldToLocal(this._screenOffsetTmpResult)
  }

  updateScreenSpaceLabels(): void {
    const zoomFactor = this.getPointZoomFactor()
    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      const label = userData.__labelSprite
      if (!label || !label.visible) return

      const offsetX = Number(userData.__labelOffsetX ?? 0)
      const offsetY = Number(userData.__labelOffsetY ?? 0)

      if (userData.type === 'point') {
        const extraX = Number(userData.__valueOnlyExtraOffsetX ?? 0)
        label.position.copy(
          this.getScreenOffsetPosition(
            obj.position,
            offsetX * zoomFactor + extraX,
            offsetY * zoomFactor,
          ),
        )
      } else if (isLinearType(userData.type)) {
        const anchor = userData.__labelAnchor
        if (!anchor) return
        label.position.copy(
          this.getScreenOffsetPosition(
            anchor,
            offsetX * zoomFactor,
            offsetY * zoomFactor,
          ),
        )
      }
    })
  }

  refreshScreenSpaceScales(): void {
    const h = this.deps.renderer.domElement.clientHeight || 1
    const spriteScale = this.getPointSpriteScale()
    const labelScale = this.getPointLabelScale()
    const lineLabelScale = this.getLineLabelScale()
    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      if ((obj as THREE.Sprite).isSprite && userData.type === 'point') {
        ;(obj as THREE.Sprite).scale.set(spriteScale, spriteScale, 1)
        const label = userData.__labelSprite
        if (label) this.deps.labelRenderer.setLabelSpriteScale(label, labelScale)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.deps.labelRenderer.setAdaptiveSpriteScale(valueLabel, labelScale)
      } else if (isLinearType(userData.type)) {
        const label = userData.__labelSprite
        if (label) this.deps.labelRenderer.setLabelSpriteScale(label, lineLabelScale)
        const valueLabel = userData.__valueLabelSprite
        if (valueLabel) this.deps.labelRenderer.setAdaptiveSpriteScale(valueLabel, lineLabelScale)
      }
    })
    this.deps.labelRenderer.cubeValueLabels.forEach((label) => this.deps.labelRenderer.setAdaptiveSpriteScale(label, lineLabelScale))
    this.deps.axisGridManager.axisLabels.forEach((label) => {
      const axisLabelScale = (AxisGridManager.AXIS_LABEL_PIXEL / h / this.deps.arManager.currentWorldScale) * this.getFovSpriteScale()
      label.scale.set(axisLabelScale, axisLabelScale, 1)
    })
  }

  getFovSpriteScale(): number {
    const cam = this.deps.getActiveCamera()
    if (this.deps.arManager.isARMode) {
      const m = cam.projectionMatrix.elements
      const cotHalfFov = Math.abs(m[5])
      if (cotHalfFov > 0) {
        return (1 / cotHalfFov) / Math.tan((30 * Math.PI) / 180)
      }
    }
    if ((cam as THREE.PerspectiveCamera).isPerspectiveCamera) {
      const fov = (cam as THREE.PerspectiveCamera).fov
      if (fov > 0 && isFinite(fov)) {
        return Math.tan((fov / 2) * Math.PI / 180) / Math.tan((30 * Math.PI) / 180)
      }
    }
    const m = cam.projectionMatrix.elements
    const cotHalfFov = Math.abs(m[5])
    if (cotHalfFov > 0) {
      return (1 / cotHalfFov) / Math.tan((30 * Math.PI) / 180)
    }
    return 1
  }

  getPointSpriteScale(): number {
    const h = this.deps.renderer.domElement.clientHeight || 1
    const baseScale = (POINT_PIXEL / h / this.deps.arManager.currentWorldScale) * this.getFovSpriteScale()
    if (this.deps.arManager.isARMode) {
      const safeInitialScale = Math.max(this.deps.arManager.initialWorldScale, 0.0001)
      const zoomRatio = this.deps.arManager.currentWorldScale / safeInitialScale
      const zoomFactor = THREE.MathUtils.clamp(
        Math.pow(zoomRatio, AR_POINT_ZOOM_RESPONSE_EXPONENT),
        AR_POINT_ZOOM_MIN_FACTOR,
        AR_POINT_ZOOM_MAX_FACTOR,
      )
      return baseScale * AR_POINT_SCALE_FACTOR * zoomFactor
    }

    return baseScale * this.getPointZoomFactor()
  }

  getPointZoomFactor(): number {
    if (this.deps.arManager.isARMode) {
      const safeInitialScale = Math.max(this.deps.arManager.initialWorldScale, 0.0001)
      const zoomRatio = this.deps.arManager.currentWorldScale / safeInitialScale
      return THREE.MathUtils.clamp(
        Math.pow(zoomRatio, AR_POINT_ZOOM_RESPONSE_EXPONENT),
        AR_POINT_ZOOM_MIN_FACTOR,
        AR_POINT_ZOOM_MAX_FACTOR,
      )
    }

    const distance = this.deps.camera.position.distanceTo(this.deps.controls.target)
    const safeDistance = Math.max(distance, 0.001)
    const rawFactor = Math.pow(
      POINT_SCALE_REFERENCE_DISTANCE / safeDistance,
      POINT_SCALE_EXPONENT,
    )
    return Math.min(
      POINT_MAX_SCALE_FACTOR,
      Math.max(POINT_MIN_SCALE_FACTOR, rawFactor),
    )
  }

  getPointLabelScale(): number {
    return this.getResponsiveLabelScale(
      POINT_LABEL_BASE_PIXEL,
      POINT_LABEL_SCALE_MULTIPLIER,
    )
  }

  getLineLabelScale(): number {
    return this.getResponsiveLabelScale(
      LINE_LABEL_BASE_PIXEL,
      LINE_LABEL_SCALE_MULTIPLIER,
    )
  }

  getResponsiveLabelScale(basePixel: number, pointScaleMultiplier: number): number {
    const h = this.deps.renderer.domElement.clientHeight || 1
    const baseScale = (basePixel / h / this.deps.arManager.currentWorldScale) * this.getFovSpriteScale()
    const pointDrivenScale = this.getPointSpriteScale() * pointScaleMultiplier
    const minScale = baseScale * LABEL_MIN_SCALE_FACTOR
    const maxScale = baseScale * LABEL_MAX_SCALE_FACTOR
    return Math.min(maxScale, Math.max(minScale, pointDrivenScale))
  }

  updateLinearArrowHeadScales(): void {
    const scene = this.currentSceneRef
    if (!scene) return

    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      if (userData.type === 'ray' && userData.geoId) {
        const ray = scene.rays.get(userData.geoId)
        if (ray) this.updateRayArrowHead(obj as THREE.Line, ray, scene.selection.rays.has(userData.geoId))
      } else if (userData.type === 'vector' && userData.geoId) {
        const vector = scene.vectors.get(userData.geoId)
        if (vector) {
          this.updateVectorArrowHead(
            obj as THREE.Line,
            vector,
            scene.selection.vectors.has(userData.geoId),
          )
        }
      }
    })
  }

  private getLinearArrowScale(): number {
    const w = this.deps.renderer.domElement.clientWidth || window.innerWidth || 1
    const h = this.deps.renderer.domElement.clientHeight || window.innerHeight || 1
    const isPhone = Math.min(w, h) <= LINEAR_ARROW_PHONE_BREAKPOINT
    if (!isPhone) return 1

    if (this.deps.arManager.isARMode) {
      const safeWorldScale = Math.max(this.deps.arManager.currentWorldScale, 0.0001)
      return LINEAR_ARROW_PHONE_SCALE_FACTOR / safeWorldScale
    }

    return LINEAR_ARROW_PHONE_SCALE_FACTOR
  }

  private getZoomResponsivePixelOffset(basePixel: number): number {
    return basePixel
  }

  private attachRayArrowHead(ray: THREE.Line): void {
    const geometry = new THREE.ConeGeometry(
      RAY_HEAD_RADIUS,
      RAY_HEAD_LENGTH,
      16,
    )
    const material = new THREE.MeshBasicMaterial({
      color: LINEAR_COLOR,
      depthTest: false,
      depthWrite: false,
    })
    const arrowHead = new THREE.Mesh(geometry, material)
    arrowHead.rotation.x = Math.PI / 2
    arrowHead.renderOrder = 5
    this.getRenderUserData(ray).__arrowHead = arrowHead
    ray.add(arrowHead)
  }

  private updateRayArrowHead(ray: THREE.Line, rayData: Ray3, isSelected: boolean): void {
    const arrowHead = this.getRenderUserData(ray).__arrowHead
    if (!arrowHead) return

    arrowHead.visible = rayData.visible
    ;(arrowHead.material as THREE.MeshBasicMaterial).color.set(
      isSelected ? SELECTED_COLOR : LINEAR_COLOR,
    )

    const start = new THREE.Vector3(
      rayData.p1.position.x,
      rayData.p1.position.y,
      rayData.p1.position.z,
    )
    const end = new THREE.Vector3(
      rayData.getDisplayEndPoint().x,
      rayData.getDisplayEndPoint().y,
      rayData.getDisplayEndPoint().z,
    )
    const direction = end.clone().sub(start)
    const length = direction.length()
    if (length === 0) {
      arrowHead.position.copy(start)
      return
    }

    direction.normalize()
    const headScale = this.getLinearArrowScale()
    arrowHead.scale.set(headScale, headScale, headScale)
    arrowHead.position.copy(end)
    arrowHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction)
  }

  private attachVectorArrowHead(vector: THREE.Line): void {
    const geometry = new THREE.ConeGeometry(
      RAY_HEAD_RADIUS,
      RAY_HEAD_LENGTH,
      16,
    )
    const material = new THREE.MeshBasicMaterial({
      color: LINEAR_COLOR,
      depthTest: false,
      depthWrite: false,
    })
    const arrowHead = new THREE.Mesh(geometry, material)
    arrowHead.rotation.x = Math.PI / 2
    arrowHead.renderOrder = 5
    this.getRenderUserData(vector).__arrowHead = arrowHead
    vector.add(arrowHead)
  }

  private updateVectorArrowHead(
    vector: THREE.Line,
    vectorData: GeoVector3,
    isSelected: boolean,
  ): void {
    const arrowHead = this.getRenderUserData(vector).__arrowHead
    if (!arrowHead) return

    arrowHead.visible = vectorData.visible
    ;(arrowHead.material as THREE.MeshBasicMaterial).color.set(
      isSelected ? SELECTED_COLOR : LINEAR_COLOR,
    )

    const start = new THREE.Vector3(
      vectorData.p1.position.x,
      vectorData.p1.position.y,
      vectorData.p1.position.z,
    )
    const end = new THREE.Vector3(
      vectorData.p2.position.x,
      vectorData.p2.position.y,
      vectorData.p2.position.z,
    )
    const direction = end.clone().sub(start)
    const length = direction.length()
    if (length === 0) {
      arrowHead.visible = false
      return
    }

    const normalized = direction.clone().normalize()
    const headScale = this.getLinearArrowScale()
    const headLen = RAY_HEAD_LENGTH * headScale

    if (length <= headLen) {
      const scale = length / headLen
      arrowHead.scale.set(headScale, headScale * scale, headScale)
    } else {
      arrowHead.scale.set(headScale, headScale, headScale)
    }
    arrowHead.position.copy(end.clone().sub(normalized.clone().multiplyScalar(headLen / 2)))
    arrowHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalized)
  }

  setDepthOcclusionEnabled(enabled: boolean): void {
    this.depthOcclusionEnabled = enabled
    if (!enabled) {
      this.pointOcclusionTarget.clear()
      this.pointOcclusionLastResult.clear()
      this.pointOcclusionStableCount.clear()
      this.pointCurrentDim.clear()
      this.meshMap.forEach((obj) => {
        if (obj.userData.type !== 'point' || !obj.visible) return
        const geoId = obj.userData.geoId
        if (!geoId) return
        const sprite = obj as THREE.Sprite
        const material = sprite.material as THREE.SpriteMaterial
        material.opacity = 1.0
        const baseColor = this.pointBaseColor.get(geoId)
        if (baseColor) {
          material.color.copy(baseColor)
        }
        const label = this.getRenderUserData(obj).__labelSprite
        if (label && label.visible) {
          ;(label.material as THREE.SpriteMaterial).opacity = 1.0
        }
      })
    }
  }

  setHiddenEdgeEnabled(enabled: boolean): void {
    this.hiddenEdgeEnabled = enabled
    if (!enabled) {
      this.hiddenLineMap.forEach((obj) => {
        obj.visible = false
      })
    } else {
      this.hiddenLineMap.forEach((obj, id) => {
        const parentObj = this.meshMap.get(id) ?? this.groupMap.get(id)
        if (parentObj) {
          const type = parentObj.userData.type
          const geoId = parentObj.userData.geoId
          if (!type || !geoId || !this.currentSceneRef) {
            obj.visible = true
            return
          }
          const getCollection = TYPE_TO_SCENE_MAP[type]
          const collection = getCollection ? getCollection(this.currentSceneRef) : null
          const geoData = collection?.get(geoId)
          obj.visible = geoData ? (geoData.visible ?? true) : true
        } else {
          obj.visible = true
        }
      })
    }
    const solidDepthFunc = enabled ? THREE.LessEqualDepth : THREE.AlwaysDepth
    const solidDepthTest = enabled
    this.meshMap.forEach((obj) => {
      if (obj.userData.type === 'line' || obj.userData.type === 'straightLine' ||
          obj.userData.type === 'perpendicularLine' ||
          obj.userData.type === 'ray' || obj.userData.type === 'vector' ||
          obj.userData.type === 'circle') {
        const mat = (obj as THREE.Line).material as THREE.LineBasicMaterial
        if (mat) {
          mat.depthFunc = solidDepthFunc
          mat.depthTest = solidDepthTest
          mat.needsUpdate = true
        }
      }
    })
  }

  updateDepthOcclusion(): void {
    if (!this.depthOcclusionEnabled) return
    const isDragging = (this.currentSceneRef?.activeDraggedPointIds.size ?? 0) > 0
    if (isDragging) {
      this.occlusionFrameCounter = 0
      return
    }
    this.occlusionFrameCounter++
    const shouldCheck = this.occlusionFrameCounter % this.OCCLUSION_CHECK_INTERVAL === 0

    if (shouldCheck) {
      const camera = this.deps.getActiveCamera()
      const cameraWorldPos = new THREE.Vector3()
      camera.getWorldPosition(cameraWorldPos)

      if (this._cachedOccludersFrame !== this.syncFrameCounter) {
        this._cachedOccluders = this.collectOccluders()
        this._cachedOccludersFrame = this.syncFrameCounter
      }
      const occluders = this._cachedOccluders!
      const activePointIds = new Set<string>()
      const scene = this.currentSceneRef

      this.meshMap.forEach((obj) => {
        if (obj.userData.type !== 'point' || !obj.visible) return
        const geoId = obj.userData.geoId
        if (!geoId) return
        activePointIds.add(geoId)

        if (scene && scene.selection.points.has(geoId)) {
          this.pointOcclusionTarget.set(geoId, 1.0)
          this.pointOcclusionLastResult.delete(geoId)
          this.pointOcclusionStableCount.delete(geoId)
          return
        }

        const sprite = obj as THREE.Sprite
        const pointWorldPos = new THREE.Vector3()
        this.deps.world.localToWorld(pointWorldPos.copy(sprite.position))

        const direction = new THREE.Vector3().subVectors(pointWorldPos, cameraWorldPos)
        const distance = direction.length()
        if (distance < 0.001) {
          this.pointOcclusionTarget.set(geoId, 1.0)
          return
        }
        direction.normalize()

        this.occlusionRaycaster.set(cameraWorldPos, direction)
        this.occlusionRaycaster.near = 0.01
        this.occlusionRaycaster.far = distance - 0.1

        const hits = this.occlusionRaycaster.intersectObjects(occluders, true)
        const isOccluded = hits.length > 0

        const lastResult = this.pointOcclusionLastResult.get(geoId)
        this.pointOcclusionLastResult.set(geoId, isOccluded)

        if (lastResult === undefined) {
          this.pointOcclusionTarget.set(geoId, isOccluded ? 0.3 : 1.0)
          this.pointOcclusionStableCount.set(geoId, 1)
        } else if (isOccluded === lastResult) {
          const count = (this.pointOcclusionStableCount.get(geoId) ?? 0) + 1
          this.pointOcclusionStableCount.set(geoId, count)
          if (count >= 2) {
            this.pointOcclusionTarget.set(geoId, isOccluded ? 0.3 : 1.0)
          }
        } else {
          this.pointOcclusionStableCount.set(geoId, 1)
        }
      })

      for (const id of [...this.pointOcclusionTarget.keys()]) {
        if (!activePointIds.has(id)) {
          this.pointOcclusionTarget.delete(id)
          this.pointOcclusionLastResult.delete(id)
          this.pointOcclusionStableCount.delete(id)
          this.pointBaseColor.delete(id)
          this.pointCurrentDim.delete(id)
        }
      }
    }

    const LERP_SPEED = 0.15
    const OCCLUDED_LABEL_OPACITY = 0.2
    const OCCLUDED_DIM_FACTOR = 0.35

    this.meshMap.forEach((obj) => {
      if (obj.userData.type !== 'point' || !obj.visible) return
      const geoId = obj.userData.geoId
      if (!geoId) return

      const targetOpacity = this.pointOcclusionTarget.get(geoId) ?? 1.0
      const isOccluded = targetOpacity < 1.0
      const sprite = obj as THREE.Sprite
      const material = sprite.material as THREE.SpriteMaterial

      material.opacity = 1.0

      const targetDim = isOccluded ? OCCLUDED_DIM_FACTOR : 1.0
      const currentDim = this.pointCurrentDim.get(geoId) ?? 1.0
      const newDim = THREE.MathUtils.lerp(currentDim, targetDim, LERP_SPEED)
      this.pointCurrentDim.set(geoId, newDim)

      const baseColor = this.pointBaseColor.get(geoId)
      if (baseColor) {
        material.color.setRGB(
          baseColor.r * newDim,
          baseColor.g * newDim,
          baseColor.b * newDim,
        )
      }

      const label = this.getRenderUserData(obj).__labelSprite
      if (label && label.visible) {
        const labelMat = label.material as THREE.SpriteMaterial
        const labelTarget = isOccluded ? OCCLUDED_LABEL_OPACITY : 1.0
        const labelCurrent = labelMat.opacity
        const labelNew = THREE.MathUtils.lerp(labelCurrent, labelTarget, LERP_SPEED)
        labelMat.opacity = labelNew
      }
    })
  }

  private collectOccluders(): THREE.Object3D[] {
    const occluders: THREE.Object3D[] = []
    const occluderTypes = new Set(['face', 'sphere'])

    this.meshMap.forEach((obj) => {
      if (occluderTypes.has(obj.userData.type ?? '')) {
        occluders.push(obj)
      }
    })

    this.groupMap.forEach((obj) => {
      const type = obj.userData.type
      if (type === 'cone' || type === 'cylinder') {
        occluders.push(obj)
      }
    })

    return occluders
  }
}
