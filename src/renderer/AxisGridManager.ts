import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

type AxisArrowUserData = THREE.Object3D['userData'] & {
  __baseLength?: number
  __baseHeadLength?: number
  __baseHeadWidth?: number
}

type AxisLabelUserData = THREE.Object3D['userData'] & {
  __axisDir?: THREE.Vector3
  __axisLength?: number
  __axisLabelOffset?: number
  __axisYOffset?: number
}

interface AxisGridManagerDeps {
  makeColoredTextSprite: (text: string, color: number) => THREE.Sprite
  updateRendererPixelRatio: () => void
  refreshScreenSpaceScales: () => void
  getWorldScale: () => number
  getFovSpriteScale: () => number
  getARMode: () => boolean
  getARSceneScaleForAxisSize: (size: number) => number
  setWorldScale: (scale: number) => void
  camera: THREE.PerspectiveCamera
  controls: OrbitControls
  isMobileDevice: boolean
}

export class AxisGridManager {
  private static readonly AXIS_ARROW_BASE_LENGTH = 0.8
  private static readonly AXIS_ARROW_BASE_HEAD_LENGTH = 0.5
  private static readonly AXIS_ARROW_BASE_HEAD_WIDTH = 0.3
  private static readonly AXIS_LIFT_Y = 0
  public static readonly AXIS_LABEL_PIXEL = 28
  private static readonly AXIS_ARROW_MIN_SCALE_FACTOR = 0.6
  private static readonly AXIS_ARROW_MAX_SCALE_FACTOR = 3.2
  private static readonly AXIS_ARROW_MOBILE_SCALE_FACTOR = 2.4
  private static readonly POINT_SCALE_REFERENCE_DISTANCE =
    Math.sqrt(15 * 15 * 3) *
    (Math.tan((60 / 2) * Math.PI / 180) / Math.tan((30 / 2) * Math.PI / 180))

  axisGridGroup: THREE.Group
  private gridHelper: THREE.GridHelper | null = null
  private axisArrows: THREE.ArrowHelper[] = []
  public axisLabels: THREE.Sprite[] = []
  private axisGridSize = 10
  private isGridVisible = true
  private coordinateSystemVisible = true

  private deps: AxisGridManagerDeps

  constructor(deps: AxisGridManagerDeps) {
    this.deps = deps
    this.axisGridGroup = new THREE.Group()
  }

  addCustomAxes(len: number) {
    this.addSimpleAxis(new THREE.Vector3(1, 0, 0), 0xff0000, len, 'X轴')
    this.addAxisWithSimpleTicks(new THREE.Vector3(0, 1, 0), 0x00ff00, len, 'Y轴')
    this.addSimpleAxis(new THREE.Vector3(0, 0, 1), 0x0000ff, len, 'Z轴')
  }

  addSimpleAxis(dir: THREE.Vector3, color: number, length: number, label: string) {
    const isGroundAxis = dir.y === 0
    const axisYOffset = isGroundAxis ? AxisGridManager.AXIS_LIFT_Y : 0
    const axisMaterial = new THREE.LineBasicMaterial({ color, depthTest: false, depthWrite: false })

    const axisPoints = [
      dir.clone().multiplyScalar(-length).setY(axisYOffset),
      new THREE.Vector3(0, axisYOffset, 0),
      new THREE.Vector3(0, axisYOffset, 0),
      dir.clone().multiplyScalar(length).setY(axisYOffset),
    ]
    const axisGeometry = new THREE.BufferGeometry().setFromPoints(axisPoints)
    const axisLine = new THREE.LineSegments(axisGeometry, axisMaterial)
    axisLine.renderOrder = 20
    this.axisGridGroup.add(axisLine)

    const arrow = new THREE.ArrowHelper(
      dir,
      dir.clone().multiplyScalar(length).setY(axisYOffset),
      AxisGridManager.AXIS_ARROW_BASE_LENGTH,
      color,
      AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH,
      AxisGridManager.AXIS_ARROW_BASE_HEAD_WIDTH,
    )
    const arrowUserData = this.getAxisArrowUserData(arrow)
    arrowUserData.__baseLength = AxisGridManager.AXIS_ARROW_BASE_LENGTH
    arrowUserData.__baseHeadLength = AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH
    arrowUserData.__baseHeadWidth = AxisGridManager.AXIS_ARROW_BASE_HEAD_WIDTH
    arrow.renderOrder = 21
    arrow.traverse((obj) => {
      const material = (obj as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined
      if (Array.isArray(material)) {
        material.forEach((m) => {
          m.depthTest = false
          m.depthWrite = false
        })
      } else if (material) {
        material.depthTest = false
        material.depthWrite = false
      }
    })
    this.axisGridGroup.add(arrow)
    this.axisArrows.push(arrow)

    if (isGroundAxis) {
      const tickVertices: number[] = []
      const tickLength = 0.2
      const isXAxis = Math.abs(dir.x) > 0.5
      const tickOffset = isXAxis
        ? new THREE.Vector3(0, 0, tickLength)
        : new THREE.Vector3(tickLength, 0, 0)
      for (let i = -length; i <= length; i++) {
        if (i === 0) continue

        const base = dir.clone().multiplyScalar(i).setY(axisYOffset)
        const end = base.clone().add(tickOffset)
        tickVertices.push(base.x, base.y, base.z, end.x, end.y, end.z)
      }
      if (tickVertices.length > 0) {
        const tickGeo = new THREE.BufferGeometry()
        tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickVertices, 3))
        const tickLine = new THREE.LineSegments(
          tickGeo,
          new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
        )
        tickLine.renderOrder = 20
        this.axisGridGroup.add(tickLine)
      }
    }

    const labelPos = dir
      .clone()
      .multiplyScalar(length + 1.2)
      .setY(axisYOffset)
    const textSprite = this.deps.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    const labelUserData = this.getAxisLabelUserData(textSprite)
    labelUserData.__axisDir = dir.clone()
    labelUserData.__axisLength = length
    labelUserData.__axisLabelOffset = 1.2
    labelUserData.__axisYOffset = axisYOffset
    this.axisGridGroup.add(textSprite)
    this.axisLabels.push(textSprite)
  }

  addAxisWithSimpleTicks(dir: THREE.Vector3, color: number, length: number, label: string) {
    const points = [
      dir.clone().multiplyScalar(-length),
      new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(length),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color })
    const line = new THREE.Line(geometry, material)
    this.axisGridGroup.add(line)

    const arrow = new THREE.ArrowHelper(
      dir,
      dir.clone().multiplyScalar(length),
      AxisGridManager.AXIS_ARROW_BASE_LENGTH,
      color,
      AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH,
      AxisGridManager.AXIS_ARROW_BASE_HEAD_WIDTH,
    )
    const arrowUserData = this.getAxisArrowUserData(arrow)
    arrowUserData.__baseLength = AxisGridManager.AXIS_ARROW_BASE_LENGTH
    arrowUserData.__baseHeadLength = AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH
    arrowUserData.__baseHeadWidth = AxisGridManager.AXIS_ARROW_BASE_HEAD_WIDTH
    this.axisGridGroup.add(arrow)
    this.axisArrows.push(arrow)

    const tickVertices: number[] = []
    for (let i = -length; i <= length; i++) {
      if (i === 0) continue

      const tickStart = dir.clone().multiplyScalar(i)
      const tickEnd = tickStart.clone().add(new THREE.Vector3(0.2, 0, 0))
      tickVertices.push(tickStart.x, tickStart.y, tickStart.z, tickEnd.x, tickEnd.y, tickEnd.z)
    }
    if (tickVertices.length > 0) {
      const tickGeo = new THREE.BufferGeometry()
      tickGeo.setAttribute('position', new THREE.Float32BufferAttribute(tickVertices, 3))
      const tickLine = new THREE.LineSegments(
        tickGeo,
        new THREE.LineBasicMaterial({ color: 0xffffff }),
      )
      this.axisGridGroup.add(tickLine)
    }

    const labelPos = dir.clone().multiplyScalar(length + 1.2)
    const textSprite = this.deps.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    const labelUserData = this.getAxisLabelUserData(textSprite)
    labelUserData.__axisDir = dir.clone()
    labelUserData.__axisLength = length
    labelUserData.__axisLabelOffset = 1.2
    labelUserData.__axisYOffset = 0
    this.axisGridGroup.add(textSprite)
    this.axisLabels.push(textSprite)
  }

  getDefaultCameraPositionForAxisSize(size: number): THREE.Vector3 {
    if (size === 20) return new THREE.Vector3(54, 54, 54)
    if (size === 40) return new THREE.Vector3(65, 140, 65)
    return new THREE.Vector3(32, 32, 32)
  }

  setAxisGridSize(size: number) {
    this.axisGridSize = size
    this.deps.updateRendererPixelRatio()
    this.axisArrows = []
    this.axisLabels = []

    while (this.axisGridGroup.children.length > 0) {
      const child = this.axisGridGroup.children.pop()!
      this.axisGridGroup.remove(child)
      const geometry = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined
      const material = (child as THREE.Mesh).material as
        | THREE.Material
        | THREE.Material[]
        | undefined
      geometry?.dispose()
      if (Array.isArray(material)) material.forEach((m) => m.dispose())
      else material?.dispose()
    }

    this.addCustomAxes(size)

    const gridSize = size * 2
    const divisions = gridSize
    this.gridHelper = new THREE.GridHelper(gridSize, divisions)
    this.gridHelper.renderOrder = 0
    const gridMaterial = this.gridHelper.material as THREE.Material | THREE.Material[]
    const applyGridMaterial = (material: THREE.Material) => {
      material.depthWrite = false
      material.polygonOffset = true
      material.polygonOffsetFactor = 1
      material.polygonOffsetUnits = 1
    }
    if (Array.isArray(gridMaterial)) gridMaterial.forEach(applyGridMaterial)
    else applyGridMaterial(gridMaterial)
    this.gridHelper.visible = this.isGridVisible
    this.axisGridGroup.add(this.gridHelper)
    this.deps.camera.position.copy(this.getDefaultCameraPositionForAxisSize(this.axisGridSize))
    if (this.deps.getARMode()) {
      this.deps.setWorldScale(this.deps.getARSceneScaleForAxisSize(this.axisGridSize))
      this.updateAxisArrowScales()
      return
    }
    this.deps.refreshScreenSpaceScales()
    this.updateAxisArrowScales()
  }

  setAxisGridVisible(visible: boolean) {
    this.isGridVisible = visible
    if (this.gridHelper) {
      this.gridHelper.visible = visible
    }
  }

  setCoordinateSystemVisible(visible: boolean) {
    this.coordinateSystemVisible = visible
    this.axisGridGroup.visible = visible
  }

  getAxisGridSize(): number {
    return this.axisGridSize
  }

  isAxisGridVisible(): boolean {
    return this.isGridVisible
  }

  isCoordinateSystemVisible(): boolean {
    return this.coordinateSystemVisible
  }

  updateAxisArrowScales() {
    if (this.axisArrows.length === 0) return

    let factor = 1
    if (!this.deps.getARMode()) {
      const distance = this.deps.camera.position.distanceTo(this.deps.controls.target)
      const safeDistance = Math.max(distance, 0.001)
      factor = safeDistance / AxisGridManager.POINT_SCALE_REFERENCE_DISTANCE
      factor = Math.min(
        AxisGridManager.AXIS_ARROW_MAX_SCALE_FACTOR,
        Math.max(AxisGridManager.AXIS_ARROW_MIN_SCALE_FACTOR, factor),
      )
      if (this.deps.isMobileDevice) {
        factor *= AxisGridManager.AXIS_ARROW_MOBILE_SCALE_FACTOR
      }
    }

    this.axisArrows.forEach((arrow) => {
      const data = this.getAxisArrowUserData(arrow)
      const baseLength = data.__baseLength ?? AxisGridManager.AXIS_ARROW_BASE_LENGTH
      const baseHeadLength = data.__baseHeadLength ?? AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH
      const baseHeadWidth = data.__baseHeadWidth ?? AxisGridManager.AXIS_ARROW_BASE_HEAD_WIDTH
      arrow.setLength(baseLength * factor, baseHeadLength * factor, baseHeadWidth * factor)
    })

    this.axisLabels.forEach((label) => {
      const data = this.getAxisLabelUserData(label)
      const dir = data.__axisDir
      const axisLength = data.__axisLength
      const labelOffset = data.__axisLabelOffset
      const yOffset = data.__axisYOffset ?? 0
      if (!dir || axisLength === undefined || labelOffset === undefined) return

      const mobileExtra =
        this.deps.isMobileDevice && !this.deps.getARMode()
          ? (AxisGridManager.AXIS_ARROW_BASE_LENGTH +
              AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH * 0.35) *
            Math.max(0, AxisGridManager.AXIS_ARROW_MOBILE_SCALE_FACTOR - 1)
          : 0
      const extra =
        (AxisGridManager.AXIS_ARROW_BASE_LENGTH +
          AxisGridManager.AXIS_ARROW_BASE_HEAD_LENGTH * 0.35) *
        Math.max(0, factor - 1)
      const labelPos = dir
        .clone()
        .multiplyScalar(axisLength + labelOffset + extra + mobileExtra)
      if (Math.abs(dir.y) < 1e-6) {
        labelPos.y = yOffset
      } else {
        labelPos.y += yOffset
      }
      label.position.copy(labelPos)
    })
  }

  getAxisArrowUserData(arrow: THREE.Object3D): AxisArrowUserData {
    return arrow.userData as AxisArrowUserData
  }

  getAxisLabelUserData(label: THREE.Object3D): AxisLabelUserData {
    return label.userData as AxisLabelUserData
  }
}
