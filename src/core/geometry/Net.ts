import { Vec3 } from './Vec3'
import type { PlanarPolygon } from './PlanarPolygon'

export type NetSolidType = 'hexahedron' | 'tetrahedron' | 'prism' | 'pyramid'
export type NetMode = 'attached' | 'free'

export interface NetFaceTransform {
  hingeEdgePointIds: [string, string]
  rotationAxis: Vec3
  fullRotationAngle: number
  parentFaceId: string | null
}

export class Net {
  public visible: boolean = true
  public unfoldRatio: number = 1
  public position: Vec3 = new Vec3(0, 0, 0)
  public mode: NetMode = 'attached'
  public readonly faceTransforms: Map<string, NetFaceTransform>
  public controlEdgeFaceId: string | null = null
  public controlEdgePointIds: [string, string] | null = null

  /**
   * 展开图结构指纹缓存。指纹由 baseFaceId、faceIds 以及每个 face 的 boundaryPointIds 组成，
   * 仅在拓扑变化时改变，用于 GeometrySyncer 快速判断是否需要重建 netGroup。
   * 避免每帧在 GeometrySyncer 中重新拼接长字符串。
   */
  private _cachedStructureKey: string | null = null
  private _structureKeyFacesSignature = 0

  constructor(
    public readonly id: string,
    public name: string,
    public readonly solidId: string,
    public readonly solidType: NetSolidType,
    public readonly baseFaceId: string,
    public readonly faceIds: string[],
    faceTransforms: Map<string, NetFaceTransform> | Record<string, NetFaceTransform>,
    public color: number = 0x4a9eff,
  ) {
    if (faceTransforms instanceof Map) {
      this.faceTransforms = faceTransforms
    } else {
      this.faceTransforms = new Map()
      for (const [faceId, transform] of Object.entries(faceTransforms)) {
        this.faceTransforms.set(faceId, transform)
      }
    }
  }

  clone(): Net {
    const transforms = new Map<string, NetFaceTransform>()
    for (const [faceId, t] of this.faceTransforms) {
      transforms.set(faceId, {
        hingeEdgePointIds: [...t.hingeEdgePointIds] as [string, string],
        rotationAxis: new Vec3(t.rotationAxis.x, t.rotationAxis.y, t.rotationAxis.z),
        fullRotationAngle: t.fullRotationAngle,
        parentFaceId: t.parentFaceId,
      })
    }
    const cloned = new Net(
      this.id,
      this.name,
      this.solidId,
      this.solidType,
      this.baseFaceId,
      [...this.faceIds],
      transforms,
      this.color,
    )
    cloned.visible = this.visible
    cloned.unfoldRatio = this.unfoldRatio
    cloned.position = new Vec3(this.position.x, this.position.y, this.position.z)
    cloned.mode = this.mode
    cloned.controlEdgeFaceId = this.controlEdgeFaceId
    cloned.controlEdgePointIds = this.controlEdgePointIds
      ? [...this.controlEdgePointIds] as [string, string]
      : null
    return cloned
  }

  setName(name: string) {
    this.name = name
  }

  setVisible(visible: boolean) {
    this.visible = visible
  }

  setUnfoldRatio(ratio: number) {
    this.unfoldRatio = Math.max(0, Math.min(1, ratio))
  }

  setPosition(pos: Vec3) {
    this.position = pos
  }

  setMode(mode: NetMode) {
    this.mode = mode
  }

  reset() {
    this.unfoldRatio = 0
    this.position = new Vec3(0, 0, 0)
    this.mode = 'attached'
  }

  /**
   * 获取展开图结构指纹。首次调用或拓扑/面边界变化时重新计算，否则直接返回缓存值。
   */
  getStructureKey(scene: { faces: Map<string, PlanarPolygon> }): string {
    let signature = 0
    for (const faceId of this.faceIds) {
      const face = scene.faces.get(faceId)
      if (face) signature += face.boundaryPointIds.length
    }
    if (this._cachedStructureKey !== null && this._structureKeyFacesSignature === signature) {
      return this._cachedStructureKey
    }

    const parts: string[] = [this.baseFaceId, this.faceIds.length.toString()]
    for (const faceId of this.faceIds) {
      const face = scene.faces.get(faceId)
      const bpIds = face ? face.boundaryPointIds.join(',') : ''
      parts.push(`${faceId}:${bpIds}`)
    }
    this._cachedStructureKey = parts.join('|')
    this._structureKeyFacesSignature = signature
    return this._cachedStructureKey
  }

  /** 当展开图拓扑（faceIds / baseFaceId / face boundaryPointIds）可能变化时调用，使结构指纹失效。 */
  invalidateStructureKey() {
    this._cachedStructureKey = null
  }
}
