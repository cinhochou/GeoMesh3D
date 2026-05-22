import * as THREE from 'three'
import { Scene as GeoScene, type SceneRenderSyncState } from '../core/scene/Scene'
import { Point3 } from '../core/geometry/Point3'
import { Ray3 } from '../core/geometry/Ray3'
import { GeoVector3 } from '../core/geometry/GeoVector3'
import { Vec3 } from '../core/geometry/Vec3'
import { Cone3 } from '../core/geometry/Cone3'
import { computePlaneBasis, projectPoint2D, triangulateFace } from '../core/geometry/PlanarUtils'
import { CubeConstraint } from '../core/constraints/CubeConstraint'
import type { FacePreviewData } from '../core/editor/Editor'
import { ARManager } from './ARManager'
import { AxisGridManager } from './AxisGridManager'
import { LabelRenderer } from './LabelRenderer'

type RenderObjectType = 'point' | 'line' | 'straightLine' | 'ray' | 'vector' | 'circle' | 'face' | 'sphere' | 'cone' | 'axisLabel'

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
const POINT_SCALE_EXPONENT = 0.72
const POINT_MIN_SCALE_FACTOR = 0.45
const POINT_MAX_SCALE_FACTOR = 1.08
const POINT_LABEL_BASE_PIXEL = 70
const LINE_LABEL_BASE_PIXEL = 68
const POINT_LABEL_SCALE_MULTIPLIER = 5.6
const LINE_LABEL_SCALE_MULTIPLIER = 5.4
const LABEL_MIN_SCALE_FACTOR = 0.52
const LABEL_MAX_SCALE_FACTOR = 1.38
const LABEL_OFFSET_EXPONENT = 0.65
const LABEL_OFFSET_MIN_FACTOR = 0.7
const LABEL_OFFSET_MAX_FACTOR = 1.15
const POINT_LABEL_OFFSET_X = 3
const POINT_LABEL_OFFSET_Y = 3
const POINT_VALUE_ONLY_EXTRA_OFFSET_X = 20
const LINE_LABEL_OFFSET_Y = 3
const POINT_LABEL_CENTER_X = 0.32
const POINT_LABEL_CENTER_Y = 0.32
const LINE_LABEL_CENTER_X = 0.5
const LINE_LABEL_CENTER_Y = 0.3
const LINEAR_COLOR = 0xffffff
const LINEAR_WIDTH = 2
const INTERSECTION_POINT_COLOR = 0xffd84a
const CUBE_DEPENDENT_POINT_COLOR = 0xcfd3d8
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

const LINEAR_TYPES = new Set<string>([
  'line', 'straightLine', 'ray', 'vector', 'circle', 'sphere', 'cone', 'face',
])

const TYPE_TO_SCENE_MAP: Record<string, (scene: GeoScene) => Map<string, { labelOffsetX: number; labelOffsetY: number }>> = {
  point: (s) => s.points,
  line: (s) => s.lines,
  straightLine: (s) => s.straightLines,
  ray: (s) => s.rays,
  vector: (s) => s.vectors,
  circle: (s) => s.circles,
  face: (s) => s.faces,
  sphere: (s) => s.spheres,
  cone: (s) => s.cones,
}

const DIRECTION_TYPE_TO_COLLECTION: Record<string, (scene: GeoScene) => Map<string, { p1: { position: Vec3 }; p2: { position: Vec3 } }>> = {
  line: (s) => s.lines,
  straightLine: (s) => s.straightLines,
  ray: (s) => s.rays,
  vector: (s) => s.vectors,
}

const TWO_POINT_COLLECTIONS: ((scene: GeoScene) => Map<string, { visible?: boolean; p1: { id: string }; p2: { id: string } }>)[]
  = [(s) => s.lines, (s) => s.rays, (s) => s.vectors, (s) => s.straightLines]

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
    return INTERSECTION_POINT_COLOR
  }
  if (p.cubeRole === 'dependent') {
    return CUBE_DEPENDENT_POINT_COLOR
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
  public pointMeshes = new Map<string, THREE.Points>()
  public facePreviewMesh: THREE.Mesh | null = null
  public rubberBandLine: THREE.Line | null = null

  private currentSceneRef: GeoScene | null = null
  private activeLabelTarget: { type: string; geoId: string } | null = null
  private activePointValueTarget: { type: 'point'; geoId: string } | null = null
  private facePreviewGroup: THREE.Group | null = null
  private rubberBand: THREE.Line | undefined

  constructor(deps: GeometrySyncerDeps) {
    this.deps = deps
  }

  private getRenderUserData(object: THREE.Object3D): RenderObjectUserData {
    return object.userData as RenderObjectUserData
  }

  private getLabelUserData(sprite: THREE.Sprite): LabelSpriteUserData {
    return sprite.userData as LabelSpriteUserData
  }

  sync(
    geoScene: GeoScene,
    previewData?: { from: THREE.Vector3; to: THREE.Vector3 } | null,
    facePreviewData?: FacePreviewData | null,
    activeLabelTarget?: { type: string; geoId: string } | null,
    activePointValueTarget?: { type: 'point'; geoId: string } | null,
  ): void {
    this.currentSceneRef = geoScene
    this.activeLabelTarget = activeLabelTarget ?? null
    this.activePointValueTarget = activePointValueTarget ?? null
    const dirtyState = geoScene.consumeRenderSyncState()
    if (dirtyState) {
      this.cleanupMissingMeshes(geoScene)
      this.syncPoints(geoScene, dirtyState)
      this.syncLines(geoScene, dirtyState)
      this.syncStraightLines(geoScene, dirtyState)
      this.syncRays(geoScene, dirtyState)
      this.syncVectors(geoScene, dirtyState)
      this.syncCircles(geoScene, dirtyState)
      this.syncFaces(geoScene, dirtyState)
      this.syncSpheres(geoScene, dirtyState)
      this.syncCones(geoScene, dirtyState)
      this.syncCubeValueLabels(geoScene)
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
        sprite.renderOrder = 2

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
          const resolvedDirection = circle.isNormalCircle() && circle.directionType && circle.directionId
            ? this.resolveDirectionVectorForCircle(circle.directionType, circle.directionId)
            : undefined
          const frame = circle.getFrame(resolvedDirection)
          if (frame) {
            p.position = frame.center
          }
        }
      }
      sprite.position.set(p.position.x, p.position.y, p.position.z)

      const isSelected = scene.selection.points.has(p.id)
      const baseColor = computePointBaseColor(p, scene)
      ;(sprite.material as THREE.SpriteMaterial).color.set(isSelected ? SELECTED_COLOR : baseColor)

      let pointSpriteVisible = true
      const isCircleCenterPoint = p.circleRole === 'center'
      if (isCircleCenterPoint && p.circleId) {
        const circle = scene.circles.get(p.circleId)
        const circleVisible = circle ? circle.centerVisible && circle.visible : false
        if (circleVisible) {
          pointSpriteVisible = true
        } else {
          pointSpriteVisible = this.isPointReferencedByOtherVisibleGeometry(p.id, scene, p.circleId)
        }
        sprite.visible = pointSpriteVisible
      }

      const isLabelActive =
        this.activeLabelTarget?.type === 'point' && this.activeLabelTarget.geoId === p.id
      const labelColor = isLabelActive ? SELECTED_COLOR : 0xffffff
      const labelKey = '__labelSprite'
      const spriteUserData = this.getRenderUserData(sprite)
      const existingLabel = spriteUserData[labelKey] as THREE.Sprite | undefined
      const existingValueLabel = spriteUserData.__valueLabelSprite
      if (existingValueLabel) existingValueLabel.visible = false
      spriteUserData.__labelOffsetX = p.labelOffsetX
      spriteUserData.__labelOffsetY = p.labelOffsetY
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
        if (existingLabel) existingLabel.visible = false
      } else if (!existingLabel) {
        const nameSprite = p.nameVisible
          ? this.deps.labelRenderer.makePointLabelSprite(p.name ?? '', labelColor, combinedPointText)
          : this.deps.labelRenderer.makeValueLabelSprite(pointValueText, labelColor, true)
        nameSprite.position.copy(
          this.getScreenOffsetPosition(
            sprite.position,
            POINT_LABEL_OFFSET_X +
              (p.nameVisible ? 0 : POINT_VALUE_ONLY_EXTRA_OFFSET_X),
            POINT_LABEL_OFFSET_Y,
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
            POINT_LABEL_OFFSET_X +
              (p.nameVisible ? 0 : POINT_VALUE_ONLY_EXTRA_OFFSET_X),
            POINT_LABEL_OFFSET_Y,
          ),
        )
        const nextText = p.nameVisible ? `${p.name ?? ''}${combinedPointText}` : pointValueText
        const labelText = this.getLabelUserData(existingLabel).text ?? ''
        if (labelText !== nextText) {
          this.getLabelUserData(existingLabel).text = nextText
          const material = existingLabel.material as THREE.SpriteMaterial
          const newSprite = p.nameVisible
            ? this.deps.labelRenderer.makePointLabelSprite(p.name ?? '', labelColor, combinedPointText)
            : this.deps.labelRenderer.makeValueLabelSprite(pointValueText, labelColor, true)
          Object.assign(this.getLabelUserData(existingLabel), this.getLabelUserData(newSprite))
          material.map = (newSprite.material as THREE.SpriteMaterial).map
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
              Object.assign(
                this.getLabelUserData(existingLabel),
                p.nameVisible
                  ? this.deps.labelRenderer.drawCombinedLabel(
                      ctx,
                      map.image as HTMLCanvasElement,
                      p.name ?? '',
                      combinedPointText,
                      labelColor,
                      72,
                    )
                  : this.deps.labelRenderer.drawPlainLabel(
                      ctx,
                      map.image as HTMLCanvasElement,
                      pointValueText,
                      labelColor,
                      72,
                    ),
              )
              map.needsUpdate = true
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
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]

      if (!line) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: LINEAR_COLOR,
          linewidth: LINEAR_WIDTH,
          depthTest: !lineData.faceOwned,
        })
        line = new THREE.Line(geo, mat)
        line.userData = { geoId: id, type: 'line' }
        if (lineData.faceOwned) line.renderOrder = 12
        this.deps.world.add(line)
        this.meshMap.set(id, line)
      } else {
        line.geometry.setFromPoints(points)
        line.geometry.attributes.position!.needsUpdate = true
        line.geometry.computeBoundingBox()
        line.geometry.computeBoundingSphere()
        const mat = line.material as THREE.LineBasicMaterial
        mat.depthTest = !lineData.faceOwned
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
      ;(line.material as THREE.LineBasicMaterial).color.set(
        (isSelected || isFaceHighlight) ? SELECTED_COLOR : LINEAR_COLOR,
      )

      const mid = new THREE.Vector3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
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
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(end.x, end.y, end.z)]

      if (!ray) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: LINEAR_COLOR,
          linewidth: LINEAR_WIDTH,
        })
        ray = new THREE.Line(geo, mat)
        ray.userData = { geoId: id, type: 'ray' }
        this.attachRayArrowHead(ray)
        this.deps.world.add(ray)
        this.meshMap.set(id, ray)
      } else {
        ray.geometry.setFromPoints(points)
        ray.geometry.attributes.position!.needsUpdate = true
        ray.geometry.computeBoundingBox()
        ray.geometry.computeBoundingSphere()
      }

      ray.visible = rayData.visible
      const isSelected = scene.selection.rays.has(id)
      ;(ray.material as THREE.LineBasicMaterial).color.set(
        isSelected ? SELECTED_COLOR : LINEAR_COLOR,
      )

      this.updateRayArrowHead(ray, rayData, isSelected)
      const mid = new THREE.Vector3((p1.x + end.x) / 2, (p1.y + end.y) / 2, (p1.z + end.z) / 2)
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
      const points = [
        new THREE.Vector3(start.x, start.y, start.z),
        new THREE.Vector3(end.x, end.y, end.z),
      ]

      if (!line) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: LINEAR_COLOR,
          linewidth: LINEAR_WIDTH,
        })
        line = new THREE.Line(geo, mat)
        line.userData = { geoId: id, type: 'straightLine' }
        this.deps.world.add(line)
        this.meshMap.set(id, line)
      } else {
        line.geometry.setFromPoints(points)
        line.geometry.attributes.position!.needsUpdate = true
        line.geometry.computeBoundingBox()
        line.geometry.computeBoundingSphere()
      }

      line.visible = lineData.visible
      const isSelected = scene.selection.straightLines.has(id)
      ;(line.material as THREE.LineBasicMaterial).color.set(
        isSelected ? SELECTED_COLOR : LINEAR_COLOR,
      )

      const mid = new THREE.Vector3(
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

  syncVectors(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.vectorIds.forEach((id) => {
      const vectorData = scene.vectors.get(id)
      if (!vectorData) return
      let vector = this.meshMap.get(id) as THREE.Line | undefined
      const p1 = vectorData.p1.position
      const p2 = vectorData.p2.position
      const start = new THREE.Vector3(p1.x, p1.y, p1.z)
      const end = new THREE.Vector3(p2.x, p2.y, p2.z)
      const direction = end.clone().sub(start)
      const length = direction.length()
      const headScale = this.getLinearArrowScale()
      const headLen = RAY_HEAD_LENGTH * headScale
      const shortEnough = length <= headLen
      const lineEnd = shortEnough
        ? end.clone()
        : end.clone().sub(direction.clone().normalize().multiplyScalar(headLen))
      const points = [start.clone(), lineEnd]

      if (!vector) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: LINEAR_COLOR,
          linewidth: LINEAR_WIDTH,
        })
        vector = new THREE.Line(geo, mat)
        vector.userData = { geoId: id, type: 'vector' }
        this.attachVectorArrowHead(vector)
        this.deps.world.add(vector)
        this.meshMap.set(id, vector)
      } else {
        vector.geometry.setFromPoints(points)
        vector.geometry.attributes.position!.needsUpdate = true
        vector.geometry.computeBoundingBox()
        vector.geometry.computeBoundingSphere()
      }

      vector.visible = vectorData.visible
      const isSelected = scene.selection.vectors.has(id)
      ;(vector.material as THREE.LineBasicMaterial).color.set(
        isSelected ? SELECTED_COLOR : LINEAR_COLOR,
      )

      this.updateVectorArrowHead(vector, vectorData, isSelected)
      const mid = new THREE.Vector3((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, (p1.z + p2.z) / 2)
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
      }
      const frame = circleData.getFrame(resolvedDirection)
      let circle = this.meshMap.get(id) as THREE.LineLoop | undefined
      if (!frame) {
        if (circle) circle.visible = false
        return
      }

      const segments = 128
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

      if (!circle) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({
          color: LINEAR_COLOR,
          linewidth: LINEAR_WIDTH,
        })
        circle = new THREE.LineLoop(geo, mat)
        circle.userData = { geoId: id, type: 'circle' }
        circle.renderOrder = 6
        this.deps.world.add(circle)
        this.meshMap.set(id, circle)
      } else {
        circle.geometry.setFromPoints(points)
        circle.geometry.attributes.position!.needsUpdate = true
        circle.geometry.computeBoundingBox()
        circle.geometry.computeBoundingSphere()
      }

      circle.visible = circleData.visible
      const isSelected = scene.selection.circles.has(id)
      ;(circle.material as THREE.LineBasicMaterial).color.set(
        isSelected ? SELECTED_COLOR : LINEAR_COLOR,
      )
      const isLabelActive =
        this.activeLabelTarget?.type === 'circle' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        circle,
        circleData.name ?? '',
        circleData.nameVisible && circleData.visible,
        circleData.valueVisible === true && circleData.visible,
        `=${this.deps.labelRenderer.formatMetricNumber(frame.radius)}`,
        new THREE.Vector3(frame.center.x, frame.center.y, frame.center.z),
        isLabelActive ? SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncFaces(scene: GeoScene, dirtyState: SceneRenderSyncState): void {
    dirtyState.faceIds.forEach((id) => {
      const faceData = scene.faces.get(id)
      if (!faceData) return
      let faceMesh = this.meshMap.get(id) as THREE.Mesh | undefined
      const triangulated = triangulateFace(faceData.boundaryPointIds, scene.points)
      if (!triangulated) return

      if (!faceMesh) {
        const geometry = new THREE.BufferGeometry()
        const material = new THREE.MeshBasicMaterial({
          color: faceData.fillColor ?? FACE_FILL_COLOR,
          transparent: true,
          opacity: faceData.fillOpacity ?? FACE_FILL_OPACITY,
          side: THREE.DoubleSide,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -1,
          polygonOffsetUnits: -1,
        })
        faceMesh = new THREE.Mesh(geometry, material)
        faceMesh.userData = { geoId: id, type: 'face' }
        const outline = new THREE.LineLoop(
          new THREE.BufferGeometry(),
          new THREE.LineBasicMaterial({
            color: LINEAR_COLOR,
            depthTest: false,
            transparent: true,
            opacity: 0.95,
          }),
        )
        outline.userData = { geoId: id, type: 'face' }
        outline.renderOrder = 12
        faceMesh.add(outline)
        this.deps.world.add(faceMesh)
        this.meshMap.set(id, faceMesh)
      }

      const geometry = faceMesh.geometry as THREE.BufferGeometry
      geometry.setFromPoints(triangulated.positions)
      geometry.setIndex(triangulated.indices)
      geometry.computeVertexNormals()
      geometry.computeBoundingBox()
      geometry.computeBoundingSphere()

      const outline = faceMesh.children[0] as THREE.LineLoop | undefined
      const hasBoundaryLines = faceData.boundaryLineIds.length > 0 &&
        faceData.boundaryLineIds.some((lineId) => scene.lines.has(lineId))
      if (outline) {
        outline.geometry.setFromPoints([
          ...faceData
            .getBoundaryPoints(scene.points)
            .map(
              (point) => new THREE.Vector3(point.position.x, point.position.y, point.position.z),
            ),
        ])
        outline.geometry.computeBoundingBox()
        outline.geometry.computeBoundingSphere()
      }

      faceMesh.visible = faceData.visible !== false
      if (outline) outline.visible = faceData.visible !== false && !hasBoundaryLines

      const isSelected = scene.selection.faces.has(id)
      const cubeConstraint = faceData.cubeId
        ? (scene.getCubeConstraint(faceData.cubeId) as CubeConstraint | null)
        : null
      const isCubeFullySelected = Boolean(
        cubeConstraint &&
          cubeConstraint.faceIds.length > 0 &&
          cubeConstraint.faceIds.every((faceId) => scene.selection.faces.has(faceId)),
      )
      const shouldHighlightFaceFill = isSelected && !isCubeFullySelected
      const baseColor = faceData.fillColor ?? FACE_FILL_COLOR
      const baseOpacity = faceData.fillOpacity ?? FACE_FILL_OPACITY
      ;(faceMesh.material as THREE.MeshBasicMaterial).color.set(
        shouldHighlightFaceFill ? FACE_SELECTED_COLOR : baseColor,
      )
      ;(faceMesh.material as THREE.MeshBasicMaterial).opacity = shouldHighlightFaceFill
        ? Math.max(baseOpacity, FACE_SELECTED_OPACITY)
        : baseOpacity
      if (outline) {
        ;(outline.material as THREE.LineBasicMaterial).color.set(
          isSelected ? FACE_SELECTED_COLOR : LINEAR_COLOR,
        )
        ;(outline.material as THREE.LineBasicMaterial).opacity = isSelected ? 1 : 0.95
      }

      const isLabelActive =
        this.activeLabelTarget?.type === 'face' && this.activeLabelTarget.geoId === id
      this.syncLinearLabel(
        faceMesh,
        faceData.name ?? '',
        faceData.nameVisible && faceData.visible !== false,
        faceData.valueVisible === true && faceData.visible !== false,
        `=${this.deps.labelRenderer.formatMetricNumber(faceData.getArea(scene.points))}`,
        new THREE.Vector3(
          faceData.getCentroid(scene.points).x,
          faceData.getCentroid(scene.points).y,
          faceData.getCentroid(scene.points).z,
        ),
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
          depthWrite: true,
          shininess: 100,
          specular: 0x666666,
        })
        sphereMesh = new THREE.Mesh(geometry, material)
        sphereMesh.userData = { geoId: id, type: 'sphere' }
        sphereMesh.renderOrder = 5
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
        new THREE.Vector3(center.x, center.y + safeRadius, center.z),
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
        this.deps.world.add(coneGroup)
        this.groupMap.set(id, coneGroup)
      }

      while (coneGroup.children.length > 0) {
        const child = coneGroup.children[0]
        if (child) coneGroup.remove(child)
      }

      const { center, radius, height, normal, apex } = frame
      const segments = CONE_SEGMENTS

      const sideGeometry = new THREE.ConeGeometry(1, 1, segments, 1, false)
      const sideMaterial = new THREE.MeshPhongMaterial({
        color: CONE_FILL_COLOR,
        transparent: true,
        opacity: CONE_FILL_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: true,
        shininess: 100,
        specular: 0x666666,
      })
      const sideMesh = new THREE.Mesh(sideGeometry, sideMaterial)
      sideMesh.userData = { geoId: id, type: 'cone' }
      sideMesh.renderOrder = 1

      const baseGeometry = new THREE.CircleGeometry(1, segments)
      const baseMaterial = new THREE.MeshPhongMaterial({
        color: CONE_FILL_COLOR,
        transparent: true,
        opacity: CONE_FILL_OPACITY,
        side: THREE.DoubleSide,
        depthWrite: true,
        shininess: 100,
        specular: 0x666666,
      })
      const baseMesh = new THREE.Mesh(baseGeometry, baseMaterial)
      baseMesh.userData = { geoId: id, type: 'cone' }
      baseMesh.renderOrder = 1

      const safeRadius = Math.max(radius, 0.001)
      const safeHeight = Math.max(height, 0.001)

      sideMesh.scale.set(safeRadius, safeHeight, safeRadius)
      sideMesh.position.set(0, safeHeight / 2, 0)

      baseMesh.scale.set(safeRadius, safeRadius, 1)
      baseMesh.rotation.x = -Math.PI / 2
      baseMesh.position.set(0, 0, 0)

      coneGroup.add(sideMesh)
      coneGroup.add(baseMesh)

      const yAxis = new THREE.Vector3(0, 1, 0)
      const targetNormal = new THREE.Vector3(normal.x, normal.y, normal.z)
      const quaternion = new THREE.Quaternion().setFromUnitVectors(yAxis, targetNormal)

      coneGroup.position.set(center.x, center.y, center.z)
      coneGroup.quaternion.copy(quaternion)
      coneGroup.visible = coneData.visible !== false

      const isSelected = scene.selection.cones.has(id)
      const sideMat = sideMesh.material as THREE.MeshPhongMaterial
      const baseMat = baseMesh.material as THREE.MeshPhongMaterial
      const fillColor = isSelected ? CONE_SELECTED_COLOR : CONE_FILL_COLOR
      const fillOpacity = isSelected ? CONE_SELECTED_OPACITY : CONE_FILL_OPACITY
      sideMat.color.set(fillColor)
      sideMat.opacity = fillOpacity
      baseMat.color.set(fillColor)
      baseMat.opacity = fillOpacity

      const isLabelActive =
        this.activeLabelTarget?.type === 'cone' && this.activeLabelTarget.geoId === id
      const midPoint = new THREE.Vector3(
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
        midPoint,
        isLabelActive ? CONE_SELECTED_COLOR : LINEAR_COLOR,
      )
    })
  }

  syncCubeValueLabels(scene: GeoScene): void {
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
        sprite.position.copy(
          this.getScreenOffsetPosition(
            new THREE.Vector3(centroid.x, centroid.y, centroid.z),
            0,
            LINE_LABEL_OFFSET_Y,
          ),
        )
        this.deps.labelRenderer.cubeValueLabels.set(cube.cubeId, sprite)
        this.deps.world.add(sprite)
        return
      }
      existing.visible = true
      existing.position.copy(
        this.getScreenOffsetPosition(
          new THREE.Vector3(centroid.x, centroid.y, centroid.z),
          0,
          LINE_LABEL_OFFSET_Y,
        ),
      )
      const labelData = this.getLabelUserData(existing)
      if (labelData.text !== text) {
        labelData.text = text
        const material = existing.material as THREE.SpriteMaterial
        const nextSprite = this.deps.labelRenderer.makeValueLabelSprite(text, color, false)
        material.map = (nextSprite.material as THREE.SpriteMaterial).map
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
      if (existingLabel) existingLabel.visible = false
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
      const nextText = visible ? `${text}${combinedValueText}` : valueText
      const labelText = this.getLabelUserData(existingLabel).text ?? ''
      if (labelText !== nextText) {
        this.getLabelUserData(existingLabel).text = nextText
        const material = existingLabel.material as THREE.SpriteMaterial
        const newSprite = visible
          ? this.deps.labelRenderer.makeLineLabelSprite(text, color, combinedValueText)
          : this.deps.labelRenderer.makeValueLabelSprite(valueText, color, false)
        Object.assign(this.getLabelUserData(existingLabel), this.getLabelUserData(newSprite))
        material.map = (newSprite.material as THREE.SpriteMaterial).map
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
            Object.assign(
              this.getLabelUserData(existingLabel),
              visible
                ? this.deps.labelRenderer.drawCombinedLabel(
                    ctx,
                    map.image as HTMLCanvasElement,
                    text,
                    combinedValueText,
                    color,
                    56,
                  )
                : this.deps.labelRenderer.drawPlainLabel(ctx, map.image as HTMLCanvasElement, valueText, color, 56),
            )
            map.needsUpdate = true
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
      if (!scene.cones.has(id)) {
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
  }

  removeMeshWithLabels(obj: THREE.Object3D, userData: RenderObjectUserData, map: Map<string, THREE.Object3D>, id: string): void {
    const label = userData.__labelSprite
    if (label) this.deps.world.remove(label)
    const valueLabel = userData.__valueLabelSprite
    if (valueLabel) this.deps.world.remove(valueLabel)
    this.deps.world.remove(obj)
    map.delete(id)
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
    fillGeometry.computeBoundingBox()
    fillGeometry.computeBoundingSphere()

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
      this.rubberBand.geometry.attributes.position!.needsUpdate = true
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
    const worldPoint = this.deps.world.localToWorld(pointPos.clone())
    const ndc = worldPoint.project(camera)
    const w = this.deps.renderer.domElement.clientWidth || 1
    const h = this.deps.renderer.domElement.clientHeight || 1
    const offsetNdcX = (this.getZoomResponsivePixelOffset(offsetXpx) / w) * 2
    const offsetNdcY = (this.getZoomResponsivePixelOffset(offsetYpx) / h) * 2
    ndc.x += offsetNdcX
    ndc.y += offsetNdcY
    return this.deps.world.worldToLocal(ndc.unproject(camera))
  }

  updateScreenSpaceLabels(): void {
    this.meshMap.forEach((obj) => {
      const userData = this.getRenderUserData(obj)
      const label = userData.__labelSprite
      if (!label || !label.visible) return

      const offsetX = Number(userData.__labelOffsetX ?? 0)
      const offsetY = Number(userData.__labelOffsetY ?? 0)

      if (userData.type === 'point') {
        const extraX = Number(userData.__valueOnlyExtraOffsetX ?? 0)
        label.position.copy(
          this.getScreenOffsetPosition(obj.position, offsetX + extraX, offsetY),
        )
      } else if (isLinearType(userData.type)) {
        const anchor = userData.__labelAnchor?.clone()
        if (!anchor) return
        label.position.copy(this.getScreenOffsetPosition(anchor, offsetX, offsetY))
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

    const distance = this.deps.camera.position.distanceTo(this.deps.controls.target)
    const safeDistance = Math.max(distance, 0.001)
    const rawFactor = Math.pow(
      POINT_SCALE_REFERENCE_DISTANCE / safeDistance,
      POINT_SCALE_EXPONENT,
    )
    const clampedFactor = Math.min(
      POINT_MAX_SCALE_FACTOR,
      Math.max(POINT_MIN_SCALE_FACTOR, rawFactor),
    )

    return baseScale * clampedFactor
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
    if (this.deps.arManager.isARMode) return basePixel

    const distance = this.deps.camera.position.distanceTo(this.deps.controls.target)
    const safeDistance = Math.max(distance, 0.001)
    const rawFactor = Math.pow(
      POINT_SCALE_REFERENCE_DISTANCE / safeDistance,
      LABEL_OFFSET_EXPONENT,
    )
    const clampedFactor = Math.min(
      LABEL_OFFSET_MAX_FACTOR,
      Math.max(LABEL_OFFSET_MIN_FACTOR, rawFactor),
    )
    return basePixel * clampedFactor
  }

  private attachRayArrowHead(ray: THREE.Line): void {
    const geometry = new THREE.ConeGeometry(
      RAY_HEAD_RADIUS,
      RAY_HEAD_LENGTH,
      16,
    )
    const material = new THREE.MeshBasicMaterial({ color: LINEAR_COLOR })
    const arrowHead = new THREE.Mesh(geometry, material)
    arrowHead.rotation.x = Math.PI / 2
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
    const material = new THREE.MeshBasicMaterial({ color: LINEAR_COLOR })
    const arrowHead = new THREE.Mesh(geometry, material)
    arrowHead.rotation.x = Math.PI / 2
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
    const lineEnd =
      length <= headLen
        ? end.clone()
        : end.clone().sub(normalized.clone().multiplyScalar(headLen))
    vector.geometry.setFromPoints([start.clone(), lineEnd])
    vector.geometry.attributes.position!.needsUpdate = true
    vector.geometry.computeBoundingBox()
    vector.geometry.computeBoundingSphere()

    if (length <= headLen) {
      const scale = length / headLen
      arrowHead.scale.set(headScale, headScale * scale, headScale)
    } else {
      arrowHead.scale.set(headScale, headScale, headScale)
    }
    arrowHead.position.copy(end.clone().sub(normalized.clone().multiplyScalar(headLen / 2)))
    arrowHead.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normalized)
  }
}
