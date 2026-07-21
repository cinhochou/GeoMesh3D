import * as THREE from 'three'
import type { Scene } from '../core/scene/Scene'
import type { Net } from '../core/geometry/Net'

export interface NetControlPoint {
  faceId: string
  pointId: string
}

export function buildNetFaceMatrices(
  net: Net,
  scene: Scene,
  unfoldRatioOverride?: number,
): Map<string, THREE.Matrix4> {
  const ratio = unfoldRatioOverride !== undefined ? unfoldRatioOverride : net.unfoldRatio

  const childrenMap = new Map<string, string[]>()
  net.faceIds.forEach((fid) => {
    const transform = net.faceTransforms.get(fid)
    const parentId = transform?.parentFaceId ?? null
    if (parentId) {
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, [])
      childrenMap.get(parentId)!.push(fid)
    }
  })

  const faceMatrices = new Map<string, THREE.Matrix4>()
  const baseMatrix = new THREE.Matrix4()
  faceMatrices.set(net.baseFaceId, baseMatrix)

  const queue: string[] = [net.baseFaceId]
  while (queue.length > 0) {
    const currentFaceId = queue.shift()!
    const currentMatrix = faceMatrices.get(currentFaceId)!
    const childFaceIds = childrenMap.get(currentFaceId) ?? []
    for (const childFaceId of childFaceIds) {
      const transform = net.faceTransforms.get(childFaceId)
      if (!transform) {
        faceMatrices.set(childFaceId, currentMatrix.clone())
        queue.push(childFaceId)
        continue
      }
      const hingeP1 = scene.points.get(transform.hingeEdgePointIds[0])
      const hingeP2 = scene.points.get(transform.hingeEdgePointIds[1])
      if (!hingeP1 || !hingeP2) {
        faceMatrices.set(childFaceId, currentMatrix.clone())
        queue.push(childFaceId)
        continue
      }

      const angle = transform.fullRotationAngle * ratio
      const p1Raw = new THREE.Vector3(hingeP1.position.x, hingeP1.position.y, hingeP1.position.z)
      const p2Raw = new THREE.Vector3(hingeP2.position.x, hingeP2.position.y, hingeP2.position.z)
      const p1Transformed = p1Raw.clone().applyMatrix4(currentMatrix)
      const edgeRaw = p2Raw.clone().sub(p1Raw)
      const edgeTransformed = edgeRaw.clone().transformDirection(currentMatrix)
      const axisTransformed = edgeTransformed.normalize()

      const localRotMatrix = new THREE.Matrix4()
      const tToOrigin = new THREE.Matrix4().makeTranslation(-p1Transformed.x, -p1Transformed.y, -p1Transformed.z)
      const rotMat = new THREE.Matrix4().makeRotationAxis(axisTransformed, angle)
      const tBack = new THREE.Matrix4().makeTranslation(p1Transformed.x, p1Transformed.y, p1Transformed.z)
      localRotMatrix.multiplyMatrices(tBack, rotMat).multiply(tToOrigin)

      const childMatrix = new THREE.Matrix4().multiplyMatrices(localRotMatrix, currentMatrix)
      faceMatrices.set(childFaceId, childMatrix)
      queue.push(childFaceId)
    }
  }

  return faceMatrices
}

export function getNetVertexWorldPosition(
  net: Net,
  scene: Scene,
  cp: NetControlPoint,
  faceMatrices: Map<string, THREE.Matrix4>,
): THREE.Vector3 | null {
  const point = scene.points.get(cp.pointId)
  if (!point) return null
  const mat = faceMatrices.get(cp.faceId)
  if (!mat) return null
  const raw = new THREE.Vector3(point.position.x, point.position.y, point.position.z)
  return raw.applyMatrix4(mat)
}

export function evalNetDragDistance(
  net: Net,
  scene: Scene,
  points: NetControlPoint[],
  ratio: number,
  ray: THREE.Ray,
  basePos?: THREE.Vector3,
): number {
  const fm = buildNetFaceMatrices(net, scene, ratio)
  const pos = basePos ?? new THREE.Vector3()
  let total = 0
  let count = 0
  for (const cp of points) {
    const wp = getNetVertexWorldPosition(net, scene, cp, fm)
    if (!wp) continue
    wp.add(pos)
    const closest = new THREE.Vector3()
    ray.closestPointToPoint(wp, closest)
    total += closest.distanceTo(wp)
    count++
  }
  if (count === 0) return Infinity
  return total / count
}

export function findBestUnfoldRatioByGradient(
  net: Net,
  scene: Scene,
  points: NetControlPoint[],
  ray: THREE.Ray,
  currentRatio: number,
  basePos?: THREE.Vector3,
): number {
  if (points.length === 0) return currentRatio

  const h = 0.005
  let ratio = Math.max(0, Math.min(1, currentRatio))
  let dist = evalNetDragDistance(net, scene, points, ratio, ray, basePos)

  for (let iter = 0; iter < 20; iter++) {
    const distPlus = evalNetDragDistance(net, scene, points, Math.min(1, ratio + h), ray, basePos)
    const distMinus = evalNetDragDistance(net, scene, points, Math.max(0, ratio - h), ray, basePos)
    const grad = (distPlus - distMinus) / (2 * h)

    if (Math.abs(grad) < 1e-8) break

    const second = (distPlus - 2 * dist + distMinus) / (h * h)
    let step = second > 1e-8 ? grad / second : grad * 0.5
    step = Math.max(-0.15, Math.min(0.15, step))

    const nextRatio = Math.max(0, Math.min(1, ratio - step))
    const nextDist = evalNetDragDistance(net, scene, points, nextRatio, ray, basePos)

    if (nextDist >= dist) {
      const smallStep = Math.sign(-grad) * 0.01
      const smallNext = Math.max(0, Math.min(1, ratio + smallStep))
      const smallDist = evalNetDragDistance(net, scene, points, smallNext, ray, basePos)
      if (smallDist < dist) {
        ratio = smallNext
        dist = smallDist
        continue
      }
      break
    }

    ratio = nextRatio
    dist = nextDist
  }

  return ratio
}

export function getNetVertexMotionDirection(
  net: Net,
  scene: Scene,
  cp: NetControlPoint,
  ratio: number,
  basePos?: THREE.Vector3,
): THREE.Vector3 | null {
  const delta = 0.005
  const fmPlus = buildNetFaceMatrices(net, scene, Math.min(1, ratio + delta))
  const fmMinus = buildNetFaceMatrices(net, scene, Math.max(0, ratio - delta))
  const pPlus = getNetVertexWorldPosition(net, scene, cp, fmPlus)
  const pMinus = getNetVertexWorldPosition(net, scene, cp, fmMinus)
  if (!pPlus || !pMinus) return null
  const pos = basePos ?? new THREE.Vector3()
  pPlus.add(pos)
  pMinus.add(pos)
  const dir = new THREE.Vector3().subVectors(pPlus, pMinus)
  if (dir.lengthSq() < 1e-12) return null
  return dir.normalize()
}

export function getNetVertexScreenMotion(
  net: Net,
  scene: Scene,
  cp: NetControlPoint,
  ratio: number,
  camera: THREE.Camera,
  basePos?: THREE.Vector3,
): THREE.Vector2 | null {
  const delta = 0.005
  const fmNow = buildNetFaceMatrices(net, scene, ratio)
  const fmPlus = buildNetFaceMatrices(net, scene, Math.min(1, ratio + delta))
  const pNow = getNetVertexWorldPosition(net, scene, cp, fmNow)
  const pPlus = getNetVertexWorldPosition(net, scene, cp, fmPlus)
  if (!pNow || !pPlus) return null
  const pos = basePos ?? new THREE.Vector3()
  pNow.add(pos)
  pPlus.add(pos)

  const toScreen = (v: THREE.Vector3): THREE.Vector2 => {
    const proj = v.clone().project(camera)
    return new THREE.Vector2(proj.x, proj.y)
  }

  const sNow = toScreen(pNow)
  const sPlus = toScreen(pPlus)
  const d = new THREE.Vector2().subVectors(sPlus, sNow)
  if (d.lengthSq() < 1e-12) return null
  return d.normalize()
}

export function selectNetDragPointsByScreenDirection(
  net: Net,
  scene: Scene,
  candidatePoints: NetControlPoint[],
  screenDir: THREE.Vector2,
  camera: THREE.Camera,
  currentRatio: number,
  basePos?: THREE.Vector3,
): NetControlPoint[] {
  if (candidatePoints.length <= 1) return [...candidatePoints]

  const best: { cp: NetControlPoint; score: number }[] = []
  for (const cp of candidatePoints) {
    const motion = getNetVertexScreenMotion(net, scene, cp, currentRatio, camera, basePos)
    if (!motion) continue
    const score = motion.dot(screenDir)
    best.push({ cp, score })
  }

  if (best.length === 0) return [...candidatePoints]
  best.sort((a, b) => b.score - a.score)

  const top = best[0]!
  if (top.score < 0.1) return [top.cp]

  const selected: NetControlPoint[] = [top.cp]
  for (let i = 1; i < best.length; i++) {
    if (best[i]!.score < 0.1) break
    selected.push(best[i]!.cp)
  }
  return selected
}
