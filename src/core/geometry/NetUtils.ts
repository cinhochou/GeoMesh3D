import { Vec3 } from './Vec3'
import { PlanarPolygon } from './PlanarPolygon'
import type { Point3 } from './Point3'
import { Net, type NetFaceTransform, type NetSolidType } from './Net'

const subtract = (a: Vec3, b: Vec3) => new Vec3(a.x - b.x, a.y - b.y, a.z - b.z)
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z
const cross = (a: Vec3, b: Vec3) => new Vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x)
const length = (v: Vec3) => Math.hypot(v.x, v.y, v.z)
const normalize = (v: Vec3): Vec3 | null => {
  const len = length(v)
  if (len <= 1e-8) return null
  return new Vec3(v.x / len, v.y / len, v.z / len)
}

function getSharedEdgePoints(face1: PlanarPolygon, face2: PlanarPolygon): [string, string] | null {
  const idx1 = new Map<string, number>()
  face1.boundaryPointIds.forEach((id, i) => idx1.set(id, i))
  const shared: Array<{ id: string; idx1: number; idx2: number }> = []
  face2.boundaryPointIds.forEach((id, i) => {
    if (idx1.has(id)) shared.push({ id, idx1: idx1.get(id)!, idx2: i })
  })
  if (shared.length >= 2) {
    return [shared[0]!.id, shared[1]!.id]
  }
  return null
}

function getFacesForSolid(
  solidId: string,
  solidType: NetSolidType,
  faces: Map<string, PlanarPolygon>
): PlanarPolygon[] {
  const result: PlanarPolygon[] = []
  for (const face of faces.values()) {
    switch (solidType) {
      case 'hexahedron':
      case 'tetrahedron':
        if (face.cubeId === solidId) result.push(face)
        break
      case 'prism':
        if (face.prismId === solidId) result.push(face)
        break
      case 'pyramid':
        if (face.pyramidId === solidId) result.push(face)
        break
    }
  }
  return result
}

function getBaseFace(
  solidFaces: PlanarPolygon[],
  _solidType: NetSolidType,
  points: Map<string, Point3>
): PlanarPolygon {
  // 坐标系网格位于 XZ 平面 (y=0)。
  // 选择最靠近网格且面向网格的那个面作为展开基座。
  const faceCentroids = solidFaces.map((f) => f.getCentroid(points))
  const solidCentroid = new Vec3(0, 0, 0)
  for (const c of faceCentroids) {
    solidCentroid.x += c.x
    solidCentroid.y += c.y
    solidCentroid.z += c.z
  }
  const n = faceCentroids.length || 1
  solidCentroid.x /= n
  solidCentroid.y /= n
  solidCentroid.z /= n

  let best: PlanarPolygon | null = null
  let bestDist = Infinity
  let fallback: PlanarPolygon | null = null
  let fallbackDist = Infinity

  for (let i = 0; i < solidFaces.length; i++) {
    const face = solidFaces[i]!
    const c = faceCentroids[i]!
    const dist = Math.abs(c.y)
    if (dist < fallbackDist) {
      fallbackDist = dist
      fallback = face
    }
    // 近似外法线方向：从多面体质心指向面质心
    const oy = c.y - solidCentroid.y
    // 面向网格：外法线 Y 分量指向 y=0
    const facesGrid = c.y >= 0 ? oy < -1e-9 : oy > 1e-9
    if (facesGrid && dist < bestDist) {
      bestDist = dist
      best = face
    }
  }

  return best ?? fallback ?? solidFaces[0]!
}

function buildAdjacencyGraph(faces: PlanarPolygon[]): Map<string, Array<{ faceId: string; edge: [string, string] }>> {
  const adj = new Map<string, Array<{ faceId: string; edge: [string, string] }>>()
  for (const face of faces) {
    adj.set(face.id, [])
  }
  for (let i = 0; i < faces.length; i++) {
    for (let j = i + 1; j < faces.length; j++) {
      const shared = getSharedEdgePoints(faces[i]!, faces[j]!)
      if (shared) {
        adj.get(faces[i]!.id)!.push({ faceId: faces[j]!.id, edge: shared })
        adj.get(faces[j]!.id)!.push({ faceId: faces[i]!.id, edge: shared })
      }
    }
  }
  return adj
}

function computeUnfoldRotation(
  childFace: PlanarPolygon,
  parentFace: PlanarPolygon,
  sharedEdge: [string, string],
  points: Map<string, Point3>
): { axis: Vec3; angle: number; hingeP1: Vec3 } | null {
  const pA = points.get(sharedEdge[0])?.position
  const pB = points.get(sharedEdge[1])?.position
  if (!pA || !pB) return null

  const edgeDir = normalize(subtract(pB, pA))
  if (!edgeDir) return null

  const findOffVertex = (face: PlanarPolygon): Vec3 | null => {
    for (const pid of face.boundaryPointIds) {
      if (pid !== sharedEdge[0] && pid !== sharedEdge[1]) {
        return points.get(pid)?.position ?? null
      }
    }
    return null
  }

  const parentOff = findOffVertex(parentFace)
  const childOff = findOffVertex(childFace)
  if (!parentOff || !childOff) return null

  const projectPerp = (v: Vec3): Vec3 => {
    const along = dot(v, edgeDir)
    return new Vec3(v.x - along * edgeDir.x, v.y - along * edgeDir.y, v.z - along * edgeDir.z)
  }

  const toParent = subtract(parentOff, pA)
  const toChild = subtract(childOff, pA)

  const dParent = normalize(projectPerp(toParent))
  const dChild = normalize(projectPerp(toChild))
  if (!dParent || !dChild) return null

  const targetDir = new Vec3(-dParent.x, -dParent.y, -dParent.z)

  const cos = dot(dChild, targetDir)
  const sin = dot(cross(dChild, targetDir), edgeDir)
  const angle = Math.atan2(sin, cos)

  return { axis: edgeDir.clone(), angle, hingeP1: pA }
}

function buildFaceTransforms(
  solidFaces: PlanarPolygon[],
  baseFace: PlanarPolygon,
  points: Map<string, Point3>
): { transforms: Map<string, NetFaceTransform>; lastFaceId: string | null } {
  const adj = buildAdjacencyGraph(solidFaces)
  const faceTransforms = new Map<string, NetFaceTransform>()

  faceTransforms.set(baseFace.id, {
    hingeEdgePointIds: [baseFace.boundaryPointIds[0]!, baseFace.boundaryPointIds[1]!],
    rotationAxis: new Vec3(0, 0, 1),
    fullRotationAngle: 0,
    parentFaceId: null,
  })

  const queue: Array<{ faceId: string; parentId: string }> = []
  const visited = new Set<string>([baseFace.id])
  let lastFaceId: string | null = null

  const baseNeighbors = adj.get(baseFace.id) ?? []
  for (const neighbor of baseNeighbors) {
    if (!visited.has(neighbor.faceId)) {
      queue.push({ faceId: neighbor.faceId, parentId: baseFace.id })
      visited.add(neighbor.faceId)
    }
  }

  while (queue.length > 0) {
    const { faceId, parentId } = queue.shift()!
    const face = solidFaces.find((f) => f.id === faceId)
    const parentFace = solidFaces.find((f) => f.id === parentId)
    if (!face || !parentFace) continue

    const sharedEdge = getSharedEdgePoints(face, parentFace)
    if (!sharedEdge) continue

    const rot = computeUnfoldRotation(face, parentFace, sharedEdge, points)
    if (!rot) continue

    faceTransforms.set(faceId, {
      hingeEdgePointIds: sharedEdge,
      rotationAxis: rot.axis,
      fullRotationAngle: rot.angle,
      parentFaceId: parentId,
    })

    lastFaceId = faceId

    const neighbors = adj.get(faceId) ?? []
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor.faceId)) {
        queue.push({ faceId: neighbor.faceId, parentId: faceId })
        visited.add(neighbor.faceId)
      }
    }
  }

  return { transforms: faceTransforms, lastFaceId }
}

function findControlEdge(
  lastFaceId: string | null,
  solidFaces: PlanarPolygon[],
  faceTransforms: Map<string, NetFaceTransform>,
): { faceId: string; edgePointIds: [string, string] } | null {
  if (!lastFaceId) return null
  const face = solidFaces.find(f => f.id === lastFaceId)
  if (!face) return null
  const transform = faceTransforms.get(lastFaceId)
  if (!transform) return null

  const hingeSet = new Set(transform.hingeEdgePointIds)
  for (let i = 0; i < face.boundaryPointIds.length; i++) {
    const p1 = face.boundaryPointIds[i]!
    const p2 = face.boundaryPointIds[(i + 1) % face.boundaryPointIds.length]!
    if (!(hingeSet.has(p1) && hingeSet.has(p2))) {
      return { faceId: face.id, edgePointIds: [p1, p2] }
    }
  }
  return null
}

export function generateNetTransforms(
  netId: string,
  netName: string,
  solidId: string,
  solidType: NetSolidType,
  faces: Map<string, PlanarPolygon>,
  points: Map<string, Point3>
): Net | null {
  const solidFaces = getFacesForSolid(solidId, solidType, faces)
  if (solidFaces.length < 4) return null

  const baseFace = getBaseFace(solidFaces, solidType, points)
  const result = buildFaceTransforms(solidFaces, baseFace, points)
  if (!result.transforms || result.transforms.size === 0) return null

  const allFaceIds = solidFaces.map((f) => f.id)
  const net = new Net(
    netId,
    netName,
    solidId,
    solidType,
    baseFace.id,
    allFaceIds,
    result.transforms,
    0x4a9eff,
  )

  const controlEdge = findControlEdge(result.lastFaceId, solidFaces, result.transforms)
  if (controlEdge) {
    net.controlEdgeFaceId = controlEdge.faceId
    net.controlEdgePointIds = controlEdge.edgePointIds
  }

  return net
}

export function updateNetTransforms(
  net: Net,
  faces: Map<string, PlanarPolygon>,
  points: Map<string, Point3>
): boolean {
  const solidFaces = getFacesForSolid(net.solidId, net.solidType, faces)
  if (solidFaces.length < 4) return false

  const baseFace = solidFaces.find(f => f.id === net.baseFaceId) ?? getBaseFace(solidFaces, net.solidType, points)
  const result = buildFaceTransforms(solidFaces, baseFace, points)
  if (!result.transforms || result.transforms.size === 0) return false

  net.faceTransforms.clear()
  result.transforms.forEach((t, faceId) => net.faceTransforms.set(faceId, t))

  // 拓扑或基座面可能变化，使结构指纹缓存失效
  net.invalidateStructureKey()

  if (!net.controlEdgeFaceId || !net.faceTransforms.has(net.controlEdgeFaceId)) {
    const controlEdge = findControlEdge(result.lastFaceId, solidFaces, result.transforms)
    if (controlEdge) {
      net.controlEdgeFaceId = controlEdge.faceId
      net.controlEdgePointIds = controlEdge.edgePointIds
    }
  }

  return true
}

export function getNetNextName(scene: { nets: Map<string, Net> }): string {
  let index = 1
  const names = new Set([...scene.nets.values()].map((n) => n.name))
  while (names.has(`展开图${index}`)) {
    index++
  }
  return `展开图${index}`
}
