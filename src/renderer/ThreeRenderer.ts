// src/renderer/ThreeRenderer.ts
import * as THREE from 'three'
import { Scene as GeoScene } from '../core/scene/Scene'

export class ThreeRenderer {
  scene: THREE.Scene
  camera: THREE.PerspectiveCamera
  renderer: THREE.WebGLRenderer

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

    this.scene.add(new THREE.AxesHelper(5))
  }

  /* ---------- Scene → Three ---------- */

  sync(scene: GeoScene) {
    this.syncPoints(scene)
    this.syncLines(scene)
  }

  private syncPoints(scene: GeoScene) {
    scene.points.forEach((p) => {
      let mesh = this.meshMap.get(p.id) as THREE.Mesh

      if (!mesh) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.06, 16, 16),
          new THREE.MeshStandardMaterial({ color: 0xff5555 }),
        )
        mesh.userData = {
          type: 'point',
          geoId: p.id,
        }
        this.scene.add(mesh)
        this.meshMap.set(p.id, mesh)
      }

      mesh.position.set(p.position.x, p.position.y, p.position.z)
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
    })
  }

  render() {
    this.renderer.render(this.scene, this.camera)
  }

  resize(w: number, h: number) {
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }
}
