// renderer/Interaction.ts
import * as THREE from 'three'
import { Editor, EditorMode } from '../core/editor/Editor'
import { Vec3 } from '../core/geometry/Vec3'
import { ThreeRenderer } from './ThreeRenderer'

export class Interaction {
  editor: Editor
  renderer: ThreeRenderer
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  draggingPointId: string | null = null

  constructor(editor: Editor, renderer: ThreeRenderer) {
    this.editor = editor
    this.renderer = renderer
  }

  bind(dom: HTMLElement) {
    dom.addEventListener('mousedown', this.onMouseDown)
    dom.addEventListener('mousemove', this.onMouseMove)
    dom.addEventListener('mouseup', this.onMouseUp)
  }

  onMouseDown = (e: MouseEvent) => {
    this.updateMouse(e)

    const hit = this.pickPoint()
    if (hit) {
      if (this.editor.mode === EditorMode.Select) {
        this.draggingPointId = hit.userData.geoId
      }

      if (this.editor.mode === EditorMode.CreateLine) {
        this.editor.tryCreateLineWith(this.editor.scene.points.get(hit.userData.geoId)!)
      }
    } else {
      // 点击空白
      if (this.editor.mode === EditorMode.CreatePoint) {
        const pos = this.getWorldPositionOnPlane(e)
        this.editor.createPoint(pos)
      }
    }
  }

  onMouseMove = (e: MouseEvent) => {
    if (!this.draggingPointId) return
    this.editor.movePoint(
      this.draggingPointId,
      new Vec3(e.movementX * 0.01, -e.movementY * 0.01, 0),
    )
  }

  onMouseUp = () => {
    this.draggingPointId = null
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

  getWorldPositionOnPlane(e: MouseEvent): Vec3 {
    // z=0 平面
    this.updateMouse(e)
    this.raycaster.setFromCamera(this.mouse, this.renderer.camera)
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
    const pos = new THREE.Vector3()
    this.raycaster.ray.intersectPlane(plane, pos)
    return new Vec3(pos.x, pos.y, pos.z)
  }
}
