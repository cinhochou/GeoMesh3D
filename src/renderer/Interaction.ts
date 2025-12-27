// src/renderer/Interaction.ts
import * as THREE from 'three'
import { Editor, EditorMode } from '../core/editor/Editor'
import { Vec3 } from '../core/geometry/Vec3'
import { ThreeRenderer } from './ThreeRenderer'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'

export class Interaction {
  editor: Editor
  renderer: ThreeRenderer
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  draggingPointId: string | null = null

  isDraggingRect = false
  rectStart = new THREE.Vector2()
  rectEnd = new THREE.Vector2()

  selectionBox = new THREE.Box2()

  controls: OrbitControls

  // 已移除 workingPlane（不再需要固定在 Z=0 平面）

  constructor(editor: Editor, renderer: ThreeRenderer) {
    this.editor = editor
    this.renderer = renderer
    this.controls = renderer.controls
  }

  bind(dom: HTMLElement) {
    dom.addEventListener('mousedown', this.onMouseDown)
    dom.addEventListener('mousemove', this.onMouseMove)
    dom.addEventListener('mouseup', this.onMouseUp)
  }

  onMouseDown = (e: MouseEvent) => {
    this.updateMouse(e)

    if (this.editor.mode === EditorMode.CreatePoint) {
      this.raycaster.setFromCamera(this.mouse, this.renderer.camera)

      const direction = this.raycaster.ray.direction

      const position = this.renderer.camera.position
        .clone()
        .add(direction.clone().multiplyScalar(10))

      this.editor.createPoint(new Vec3(position.x, position.y, position.z))
      return
    }

    const hit = this.pickPoint()
    if (hit) {
      if (this.editor.mode === EditorMode.Select) {
        const geoId = hit.userData.geoId
        const type = hit.userData.type

        this.draggingPointId = hit.userData.geoId
        if (type === 'point') {
          this.editor.scene.selection.selectPoint(geoId)
        }
        if (type === 'line') {
          this.editor.scene.selection.selectLine(geoId)
        }
      }
      if (this.editor.mode === EditorMode.CreateLine) {
        this.editor.tryCreateLineWith(this.editor.scene.points.get(hit.userData.geoId)!)
      }
    } else {
      // 点击空白 → 清空选中
      if (this.editor.mode === EditorMode.Select) {
        this.editor.scene.selection.clear()
      }
    }
    this.updateControlsState()
  }

  onMouseMove = (e: MouseEvent) => {
    this.updateMouse(e)

    if (this.editor.mode === EditorMode.CreatePoint) {
      this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
      const direction = this.raycaster.ray.direction
      const previewPos = this.renderer.camera.position
        .clone()
        .add(direction.clone().multiplyScalar(10))

      this.renderer.showAxisGuidesAt(previewPos)
      return
    }

    // ============ 关键修改：真正的屏幕空间拖动 ============
    if (!this.draggingPointId) return

    const point = this.editor.scene.points.get(this.draggingPointId)
    if (!point) return

    // 1. 获取当前点在世界坐标
    const pointWorld = new THREE.Vector3(point.position.x, point.position.y, point.position.z)

    // 2. 将当前点投影到屏幕（NDC 坐标）
    pointWorld.project(this.renderer.camera)

    // 3. 计算当前鼠标在 NDC 坐标下的射线
    this.raycaster.setFromCamera(this.mouse, this.renderer.camera)

    // 4. 定义一个“拖动平面”：过当前点，法线为相机方向（即平行于屏幕）
    const cameraDirection = new THREE.Vector3()
    this.renderer.camera.getWorldDirection(cameraDirection)
    const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
      cameraDirection,
      pointWorld.unproject(this.renderer.camera), // 确保点在平面上
    )

    // 5. 从当前鼠标射线与拖动平面求交点 → 这就是目标位置
    const targetPos = new THREE.Vector3()
    this.raycaster.ray.intersectPlane(dragPlane, targetPos)

    if (targetPos) {
      // 6. 计算位移 delta 并应用
      const delta = new Vec3(
        targetPos.x - point.position.x,
        targetPos.y - point.position.y,
        targetPos.z - point.position.z,
      )

      this.editor.movePoint(this.draggingPointId, delta)
    }
  }

  onMouseUp = () => {
    this.draggingPointId = null
    this.updateControlsState()
    if (this.editor.mode !== EditorMode.CreatePoint) {
      this.renderer.hideAxisGuides()
    }
  }

  /* ---------- picking ---------- */

  pickPoint(): THREE.Object3D | null {
    this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
    const hits = this.raycaster.intersectObjects([...this.renderer.meshMap.values()])
    return hits.find((h) => h.object.userData.type === 'point')?.object ?? null
  }

  updateMouse(e: MouseEvent) {
    const rect = this.renderer.renderer.domElement.getBoundingClientRect()
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1
  }

  // 已移除 getWorldPositionOnPlane 方法

  updateControlsState() {
    const selection = this.editor.scene.selection

    const hasSelection = !selection.isEmpty()
    const isInteracting = this.draggingPointId !== null && this.isDraggingRect

    // 只要在操作几何 → 禁用 Orbit，避免冲突
    this.controls.enabled = !(hasSelection || isInteracting)
  }
}
