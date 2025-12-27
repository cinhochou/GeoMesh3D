// src/renderer/ThreeRenderer.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Scene as GeoScene } from '../core/scene/Scene'

export class ThreeRenderer {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  axisGuides?: {
    x: THREE.Line
    y: THREE.Line
    z: THREE.Line
  }

  /** geoId -> mesh */
  meshMap = new Map<string, THREE.Object3D>()

  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x111111)

    const w = container.clientWidth
    const h = container.clientHeight

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    this.camera.position.set(5, 5, 5)
    this.camera.lookAt(0, 0, 0)

    this.renderer = new THREE.WebGLRenderer({ antialias: true })
    this.renderer.setSize(w, h)
    container.appendChild(this.renderer.domElement)

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 5)
    this.scene.add(light)

    this.scene.add(new THREE.AxesHelper(10))

    const size = 20
    const divisions = 20
    const gridHelper = new THREE.GridHelper(size, divisions)
    this.scene.add(gridHelper)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05

    this.addCustomAxes()
  }

  /* ---------- Scene → Three ---------- */

  sync(scene: GeoScene) {
    this.syncPoints(scene)
    this.syncLines(scene)
  }

  private syncPoints(scene: GeoScene) {
    scene.points.forEach((p) => {
      let sprite = this.meshMap.get(p.id) as THREE.Sprite

      if (!sprite) {
        const material = new THREE.SpriteMaterial({
          color: 0xff5555,
          depthTest: false, // 始终可见（编辑器推荐）
          depthWrite: false,
          sizeAttenuation: false,
        })

        sprite = new THREE.Sprite(material)

        // 屏幕空间 ≈ 8px
        const pixelSize = 8
        const h = this.renderer.domElement.clientHeight
        const scale = pixelSize / h

        sprite.scale.set(scale, scale, 1)

        sprite.userData = {
          type: 'point',
          geoId: p.id,
        }

        this.scene.add(sprite)
        this.meshMap.set(p.id, sprite)
      }

      // 同步位置
      sprite.position.set(p.position.x, p.position.y, p.position.z)

      // 选中高亮
      const isSelected = scene.selection.points.has(p.id)
      ;(sprite.material as THREE.SpriteMaterial).color.set(isSelected ? 0x43f260 : 0xff5555)
    })
  }

  private syncLines(scene: GeoScene) {
    scene.lines.forEach((l) => {
      let line = this.meshMap.get(l.id) as THREE.Line

      const p1 = l.p1.position
      const p2 = l.p2.position

      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]

      if (!line) {
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff })
        line = new THREE.Line(geo, mat)

        line.userData = {
          type: 'line',
          geoId: l.id,
        }

        this.scene.add(line)
        this.meshMap.set(l.id, line)
      } else {
        line.geometry.setFromPoints(points)
      }

      const isSelected = scene.selection.lines.has(l.id)
      ;(line.material as THREE.LineBasicMaterial).color.set(isSelected ? 0x43f260 : 0xffffff)
    })
  }

  render() {
    this.controls.update()
    this.renderer.render(this.scene, this.camera)
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  private addCustomAxes() {
    const len = 10 // 主轴长度，可自行调整

    // X 轴：红色箭头 + 红色 "X" 标签
    this.addSimpleAxis(new THREE.Vector3(1, 0, 0), 0xff0000, len, 'X轴')

    // Y 轴：绿色箭头 + 绿色 "Y" 标签 + 白色刻度线
    this.addAxisWithSimpleTicks(new THREE.Vector3(0, 1, 0), 0x00ff00, len, 'Y轴')

    // Z 轴：蓝色箭头 + 蓝色 "Z" 标签
    this.addSimpleAxis(new THREE.Vector3(0, 0, 1), 0x0000ff, len, 'Z轴')
  }

  /** 简单轴：箭头 + 反向线 + 与轴同色的文字标签 */
  private addSimpleAxis(dir: THREE.Vector3, color: number, length: number, label: string) {
    // 正方向箭头
    const arrow = new THREE.ArrowHelper(dir, new THREE.Vector3(0, 0, 0), length, color, 0.5, 0.3)
    this.scene.add(arrow)

    // 反方向轴线
    const negPoints = [new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(-length)]
    const negGeo = new THREE.BufferGeometry().setFromPoints(negPoints)
    const negLine = new THREE.Line(negGeo, new THREE.LineBasicMaterial({ color }))
    this.scene.add(negLine)

    // 与轴同色的文字标签，位置远离轴端（距离 1.5 单位）
    const labelPos = dir.clone().multiplyScalar(length + 1.5)
    const textSprite = this.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    this.scene.add(textSprite)
  }

  /** Y 轴专用：主轴 + 箭头 + 白色刻度线 + 绿色 "Y" 标签 */
  private addAxisWithSimpleTicks(dir: THREE.Vector3, color: number, length: number, label: string) {
    // 主轴线（正负方向完整显示）
    const points = [
      dir.clone().multiplyScalar(-length),
      new THREE.Vector3(0, 0, 0),
      dir.clone().multiplyScalar(length),
    ]
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const material = new THREE.LineBasicMaterial({ color })
    const line = new THREE.Line(geometry, material)
    this.scene.add(line)

    // 正方向箭头
    const arrow = new THREE.ArrowHelper(
      dir,
      dir.clone().multiplyScalar(length),
      0.8,
      color,
      0.5,
      0.3,
    )
    this.scene.add(arrow)

    // 白色刻度线（每1单位一条短横线）
    for (let i = -length; i <= length; i++) {
      if (i === 0) continue

      const tickStart = dir.clone().multiplyScalar(i)
      const tickEnd = tickStart.clone().add(new THREE.Vector3(0.4, 0, 0)) // 向 X 方向偏移

      const tickGeo = new THREE.BufferGeometry().setFromPoints([tickStart, tickEnd])
      const tickLine = new THREE.Line(tickGeo, new THREE.LineBasicMaterial({ color: 0xffffff }))
      this.scene.add(tickLine)
    }

    // 绿色 "Y" 标签，远离轴端
    const labelPos = dir.clone().multiplyScalar(length + 1.5)
    const textSprite = this.makeColoredTextSprite(label, color)
    textSprite.position.copy(labelPos)
    this.scene.add(textSprite)
  }

  /** 创建与轴同色的纯文字 Sprite（无背景、无边框） */
  private makeColoredTextSprite(message: string, axisColor: number): THREE.Sprite {
    const canvas = document.createElement('canvas')
    const size = 128
    canvas.width = size
    canvas.height = size

    const context = canvas.getContext('2d')!
    context.font = 'Bold 64px Arial'

    // 将十六进制颜色转为 RGB
    const r = (axisColor >> 16) & 255
    const g = (axisColor >> 8) & 255
    const b = axisColor & 255

    context.fillStyle = `rgb(${r}, ${g}, ${b})`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.fillText(message, size / 2, size / 2)

    const texture = new THREE.CanvasTexture(canvas)
    texture.minFilter = THREE.LinearFilter

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false, // 始终可见
    })

    const sprite = new THREE.Sprite(material)
    sprite.scale.set(1.2, 1.2, 1) // 略微放大一点，更醒目

    return sprite
  }

  createAxisGuides() {
    const size = 1000 // 足够大的长度，制造“无限”错觉

    const makeLine = (dir: THREE.Vector3, color: number) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        dir.clone().multiplyScalar(-size),
        dir.clone().multiplyScalar(size),
      ])
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        depthTest: false,
      })
      return new THREE.Line(geo, mat)
    }

    this.axisGuides = {
      x: makeLine(new THREE.Vector3(1, 0, 0), 0xff0000),
      y: makeLine(new THREE.Vector3(0, 1, 0), 0x00ff00),
      z: makeLine(new THREE.Vector3(0, 0, 1), 0x0000ff),
    }

    this.scene.add(this.axisGuides.x)
    this.scene.add(this.axisGuides.y)
    this.scene.add(this.axisGuides.z)
  }

  showAxisGuidesAt(pos: THREE.Vector3) {
    if (!this.axisGuides) {
      this.createAxisGuides()
    }

    this.axisGuides!.x.position.copy(pos)
    this.axisGuides!.y.position.copy(pos)
    this.axisGuides!.z.position.copy(pos)
  }

  hideAxisGuides() {
    if (!this.axisGuides) return

    this.scene.remove(this.axisGuides.x)
    this.scene.remove(this.axisGuides.y)
    this.scene.remove(this.axisGuides.z)
    this.axisGuides = undefined
  }
}
