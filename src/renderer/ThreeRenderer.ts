// src/renderer/ThreeRenderer.ts
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { Scene as GeoScene } from '../core/scene/Scene'
// 为新版 Three.js 补上旧版的 getInverse 方法，防止 AR.js 崩溃
if (typeof (THREE.Matrix4.prototype as any).getInverse !== 'function') {
  ;(THREE.Matrix4.prototype as any).getInverse = function (m: THREE.Matrix4) {
    return this.copy(m).invert()
  }
}
export class ThreeRenderer {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer
  controls: OrbitControls
  arCamera: THREE.Camera
  private container: HTMLElement
  private projectionGroup: THREE.Group | null = null
  private guideLabel: THREE.Sprite | null = null
  private rubberBand?: THREE.Line

  private arToolkitSource: any = null
  private arToolkitContext: any = null
  private arMarkerControls: any = null
  private isARMode = false

  // 用于备份进入 AR 前的相机和控制器状态
  private backupState = {
    position: new THREE.Vector3(),
    quaternion: new THREE.Quaternion(),
    target: new THREE.Vector3(), // OrbitControls 的聚焦点
    zoom: 1,
    fov: 60,
  }

  /** geoId -> mesh */
  meshMap = new Map<string, THREE.Object3D>()

  constructor(container: HTMLElement) {
    this.container = container
    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x111111)

    const w = container.clientWidth
    const h = container.clientHeight

    this.camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000)
    this.camera.position.set(15, 15, 15)
    this.camera.lookAt(0, 0, 0)

    this.arCamera = new THREE.Camera()

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(window.devicePixelRatio)
    this.renderer.setSize(w, h)

    // 设置 Canvas 样式，确保它覆盖在视频之上
    this.renderer.domElement.style.position = 'absolute'
    this.renderer.domElement.style.top = '0'
    this.renderer.domElement.style.left = '0'
    this.renderer.domElement.style.zIndex = '10' // Canvas 层级设为 10
    this.renderer.domElement.style.pointerEvents = 'auto' // 允许鼠标交互
    container.appendChild(this.renderer.domElement)

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 5)
    this.scene.add(light)
    this.scene.add(new THREE.AmbientLight(0x404040))
    this.scene.add(new THREE.AxesHelper(10))

    const size = 20
    const divisions = 20
    const gridHelper = new THREE.GridHelper(size, divisions)
    this.scene.add(gridHelper)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.05
    this.controls.minDistance = 1
    this.controls.maxDistance = 100

    this.addCustomAxes()
  }

  /* ---------- Scene → Three ---------- */

  sync(geoScene: GeoScene, previewData?: { from: THREE.Vector3; to: THREE.Vector3 } | null) {
    this.syncPoints(geoScene)
    this.syncLines(geoScene)
    this.updateRubberBand(previewData) // 处理虚线
  }

  // 切换 AR 模式
  async toggleAR(enabled: boolean) {
    this.isARMode = enabled

    if (enabled) {
      // ===== 进入 AR=====
      this.backupState.position.copy(this.camera.position)
      this.backupState.quaternion.copy(this.camera.quaternion)
      this.backupState.target.copy(this.controls.target)
      this.backupState.zoom = this.camera.zoom
      this.backupState.fov = this.camera.fov

      this.renderer.setClearColor(0x000000, 0)
      this.scene.background = null
      this.controls.enabled = false

      this.initAR()
    } else {
      // ===== 退出 AR =====
      if (this.arToolkitSource) {
        if (this.arToolkitSource.domElement) {
          this.arToolkitSource.domElement.srcObject?.getTracks().forEach((t: any) => t.stop())
          this.arToolkitSource.domElement.remove()
        }
        this.arToolkitSource = null
      }
      this.arToolkitContext = null
      this.arMarkerControls = null

      this.scene.visible = true
      this.camera.visible = true

      // 恢复 matrixAutoUpdate
      this.camera.matrixAutoUpdate = true

      // 强制清空 AR 留下的矩阵
      this.camera.matrix.identity()
      this.camera.matrixWorld.identity()

      // --- 原有恢复逻辑 ---
      this.camera.fov = this.backupState.fov
      this.camera.near = 0.1
      this.camera.far = 1000
      this.camera.zoom = this.backupState.zoom
      this.camera.aspect = this.container.clientWidth / this.container.clientHeight

      this.camera.projectionMatrix.identity()
      this.camera.updateProjectionMatrix()

      this.camera.position.copy(this.backupState.position)
      this.camera.quaternion.copy(this.backupState.quaternion)
      this.camera.updateMatrixWorld(true)

      this.controls.target.copy(this.backupState.target)
      this.controls.enabled = true
      this.controls.update()

      this.renderer.setClearColor(0x111111, 1)
      this.scene.background = new THREE.Color(0x111111)

      const canvas = this.renderer.domElement
      canvas.style.display = 'block'
      canvas.style.width = '100%'
      canvas.style.height = '100%'
      canvas.style.position = 'absolute'
      canvas.style.top = '0'
      canvas.style.left = '0'
      canvas.style.marginTop = '0px'
      canvas.style.marginLeft = '0px'

      this.onResize()
    }
  }

  private initAR() {
    //@ts-expect-error THREEx
    // source
    this.arToolkitSource = new THREEx.ArToolkitSource({ sourceType: 'webcam' })
    this.arToolkitSource.init(() => {
      const video = this.arToolkitSource.domElement as HTMLVideoElement
      if (!video) return

      //  AR.js 会把video插到body里，必须移走
      if (video.parentElement !== this.container) {
        video.parentElement?.removeChild(video)
        this.container.appendChild(video)
      }

      this.applyVideoForceStyle(video)

      setTimeout(() => {
        if (this.isARMode) this.onResize()
      }, 200)
    })

    //@ts-expect-error THREEx
    // context
    this.arToolkitContext = new THREEx.ArToolkitContext({
      cameraParametersUrl: '/data/camera_para.dat',
      detectionMode: 'mono',
    })

    this.arToolkitContext.init(() => {
      this.arCamera.projectionMatrix.copy(this.arToolkitContext.getProjectionMatrix())
    })

    //@ts-expect-error THREEx
    // marker → camera
    this.arMarkerControls = new THREEx.ArMarkerControls(this.arToolkitContext, this.arCamera, {
      type: 'pattern',
      patternUrl: '/arcode/marker89.td',
      changeMatrixMode: 'cameraTransformMatrix',
      maxDetectionRate: 60,
    })

    this.scene.visible = false
  }

  // 强制样式工具函数
  private applyVideoForceStyle(video: HTMLVideoElement) {
    video.style.position = 'absolute'
    video.style.top = '0'
    video.style.left = '0'
    video.style.width = '100%'
    video.style.height = '100%'
    video.style.objectFit = 'contain' // 确保完整显示画面
    video.style.zIndex = '0'

    // 关键：清除 AR.js 可能会自动生成的负 margin
    video.style.marginLeft = '0px'
    video.style.marginTop = '0px'
  }

  render() {
    if (this.isARMode) {
      if (this.arToolkitSource?.ready === false) return

      this.arToolkitContext.update(this.arToolkitSource.domElement)

      // 关键：完全交给 AR.js
      this.scene.visible = this.arCamera.visible
    } else {
      this.scene.visible = true
      this.controls.update()
    }

    this.renderer.render(this.scene, this.camera)
  }

  // 暴露给外部用于处理窗口缩放
  onResize() {
    if (!this.container) return
    const w = this.container.clientWidth
    const h = this.container.clientHeight

    // 更新渲染器
    this.renderer.setSize(w, h)

    if (!this.isARMode) {
      this.camera.aspect = w / h
      this.camera.updateProjectionMatrix()
    } else if (this.arToolkitSource && this.arToolkitSource.ready) {
      const source = this.arToolkitSource
      const video = source.domElement

      // 尝试调用 AR.js 自带的 resize
      if (typeof source.onResizeElement === 'function') source.onResizeElement()
      else if (typeof source.onResize === 'function') source.onResize()

      // 在 AR.js 计算完后，立即强行把样式改回来
      // AR.js 经常会把视频设为 width: 640px 这种固定值，我们要强行覆盖它
      if (video) {
        this.applyVideoForceStyle(video)
      }

      //同步 Canvas 尺寸
      if (typeof source.copyElementSizeTo === 'function') {
        source.copyElementSizeTo(this.renderer.domElement)
      } else if (typeof source.copySizeTo === 'function') {
        source.copySizeTo(this.renderer.domElement)
      }

      // 如果使用了 contain，我们要确保渲染器 domElement 也是 absolute 居中的
      this.renderer.domElement.style.width = '100%'
      this.renderer.domElement.style.height = '100%'
      this.renderer.domElement.style.objectFit = 'contain'
    }
  }

  private syncPoints(scene: GeoScene) {
    scene.points.forEach((p) => {
      let sprite = this.meshMap.get(p.id) as THREE.Sprite

      if (!sprite) {
        const material = new THREE.SpriteMaterial({
          color: 0xff5555,
          depthTest: false, // 始终可见
          depthWrite: false,
          sizeAttenuation: false,
        })

        sprite = new THREE.Sprite(material)

        // 屏幕空间 ≈ 10px
        const pixelSize = 6
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
    scene.lines.forEach((lineData, id) => {
      let line = this.meshMap.get(id) as THREE.Line
      const p1 = lineData.p1.position
      const p2 = lineData.p2.position
      const points = [new THREE.Vector3(p1.x, p1.y, p1.z), new THREE.Vector3(p2.x, p2.y, p2.z)]

      if (!line) {
        // 首次创建
        const geo = new THREE.BufferGeometry().setFromPoints(points)
        const mat = new THREE.LineBasicMaterial({ color: 0xffffff })
        line = new THREE.Line(geo, mat)
        line.userData = { geoId: id, type: 'line' }
        this.scene.add(line)
        this.meshMap.set(id, line)
      } else {
        // 1. 更新顶点数据
        line.geometry.setFromPoints(points)

        // 2. 必须告诉 Three.js 顶点缓冲区需要更新
        line.geometry.attributes.position!.needsUpdate = true

        // 3. 必须重新计算包围盒，否则射线检测（Raycaster）还会去旧地方找线
        line.geometry.computeBoundingBox()
        line.geometry.computeBoundingSphere()
      }

      // 选中高亮逻辑
      const isSelected = scene.selection.lines.has(id)
      ;(line.material as THREE.LineBasicMaterial).color.set(isSelected ? 0x43f260 : 0xffffff)
    })
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

  /**
   * 更新坐标投影线
   * 包含：从点到 X 轴、Z 轴的地面方形投影，以及 Y 轴垂直线
   */
  updateGuide(pos: THREE.Vector3, visible: boolean = true) {
    if (!this.projectionGroup) {
      this.projectionGroup = new THREE.Group()

      // 创建投影线物体 (使用 LineSegments 以便绘制不连续的线)
      const mat = new THREE.LineDashedMaterial({
        color: 0xffff00,
        dashSize: 0.2,
        gapSize: 0.1,
        depthTest: false,
        transparent: true,
        opacity: 0.8,
      })
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), mat)
      line.name = 'guideLines'
      this.projectionGroup.add(line)

      // 创建坐标浮窗
      this.guideLabel = new THREE.Sprite(
        new THREE.SpriteMaterial({ depthTest: false, sizeAttenuation: false }),
      )
      this.guideLabel.scale.set(0.18, 0.1, 1)
      this.projectionGroup.add(this.guideLabel)

      this.scene.add(this.projectionGroup)
    }

    this.projectionGroup.visible = visible
    if (!visible) return

    const line = this.projectionGroup.getObjectByName('guideLines') as THREE.LineSegments

    // 构建方形投影顶点数据
    // 1. 从点 (x,y,z) 到地面 (x,0,z) 的垂直线
    // 2. 从地面点 (x,0,z) 到 X 轴 (x,0,0) 的连线
    // 3. 从地面点 (x,0,z) 到 Z 轴 (0,0,z) 的连线
    const points = [
      // 垂直线
      pos,
      new THREE.Vector3(pos.x, 0, pos.z),
      // X方向投影
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(pos.x, 0, 0),
      // Z方向投影
      new THREE.Vector3(pos.x, 0, pos.z),
      new THREE.Vector3(0, 0, pos.z),
    ]

    line.geometry.setFromPoints(points)
    line.computeLineDistances() // 虚线必须

    // 更新浮窗文字和位置
    this.drawLabel(pos)
    this.guideLabel!.position.copy(pos).add(new THREE.Vector3(0.5, 0.5, 0.5))
  }

  private drawLabel(pos: THREE.Vector3) {
    const canvas = document.createElement('canvas')
    canvas.width = 288
    canvas.height = 192
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(0,0,0,0.6)'
    ctx.roundRect(0, 0, 288, 192, 15)
    ctx.fill()
    ctx.fillStyle = '#0f0'
    ctx.font = 'bold 32px monospace'
    ctx.fillText(`X: ${pos.x.toFixed(2)}`, 20, 40)
    ctx.fillText(`Y: ${pos.y.toFixed(2)}`, 20, 75)
    ctx.fillText(`Z: ${pos.z.toFixed(2)}`, 20, 110)

    // 添加提示文本
    ctx.fillStyle = '#ffffff' // 使用白色文字以便区分
    ctx.font = 'normal 24px monospace' // 稍小的字体
    ctx.fillText(`Tips: 放大缩小坐标轴`, 20, 145) // 在底部添加提示
    ctx.fillText(`以更好确定落点`, 20, 175) // 分两行显示提示
    this.guideLabel!.material.map = new THREE.CanvasTexture(canvas)
  }

  showAxisGuidesAt(pos: THREE.Vector3) {
    this.updateGuide(pos, true)
  }
  hideAxisGuides() {
    this.updateGuide(new THREE.Vector3(), false)
  }

  //处理连接时的橡皮筋虚线
  private updateRubberBand(data?: { from: THREE.Vector3; to: THREE.Vector3 } | null) {
    if (!data) {
      if (this.rubberBand) this.rubberBand.visible = false
      return
    }

    if (!this.rubberBand) {
      const geo = new THREE.BufferGeometry().setFromPoints([data.from, data.to])
      // 使用 LineDashedMaterial 实现虚线效果
      const mat = new THREE.LineDashedMaterial({
        color: 0x43f260,
        dashSize: 0.2,
        gapSize: 0.1,
      })
      this.rubberBand = new THREE.Line(geo, mat)
      this.rubberBand.computeLineDistances() // 必须调用才能显示虚线
      this.scene.add(this.rubberBand)
    } else {
      this.rubberBand.visible = true
      this.rubberBand.geometry.setFromPoints([data.from, data.to])
      this.rubberBand.geometry.attributes.position!.needsUpdate = true
      this.rubberBand.computeLineDistances()
    }
  }
}
