// 协作占用锁「写入点集」作用域解析
//
// 判定模型：两次拖拽冲突的充要条件是「写入点集相交」——
//   writeSet(A) ∩ writeSet(B) ≠ ∅  ⟹  冲突
// 其中 writeSet(目标) = 该次拖拽实际会写入的点集合 = 直接平移的点 ∪ 求解器会回写的点。
//
// 该判据天然对称（双方判定一致），并且能排掉「只读关系」造成的过度锁定：
// 例如圆 K 与立方体 C 通过「K × 正多边形 R 求交得交点 M」间接关联，
// 但拖 K 只写 K 的 p1/p2/p3，与 writeSet(C) 不相交 → K 不必锁。
//
// 本文件当前为【阶段 1 近似】：求解回写部分用各约束的 getDependencyPointIds() 作超集，
// 只会「多锁一点」，不会「漏锁」。后续阶段 2 再为各约束补精确的 getWritePointIds()。

import { Scene, type SceneConstraint } from '../scene/Scene'
import { CubeConstraint } from '../constraints/CubeConstraint'
import { RegularPolygonConstraint } from '../constraints/RegularPolygonConstraint'
import { PrismConstraint } from '../constraints/PrismConstraint'
import { PyramidConstraint } from '../constraints/PyramidConstraint'
import { IntersectionPointConstraint } from '../constraints/IntersectionPointConstraint'

export type LockScopeTarget = {
  elementId: string
  elementType: string
  elementName: string
}

export type LockScope = {
  /** 原始拖拽目标元素 */
  elementId: string
  elementType: string
  elementName: string
  /** 对象级主语（气泡 / 提示文案用） */
  rootId: string
  rootType: string
  rootName: string
  /** 写入点集（锁判定用，最小精确） */
  writePoints: string[]
  /** 呈现集（渲染红光用，对象级 + 元素级） */
  presentIds: string[]
}

/** 迭代收敛上限：约束链深度有限，多余轮次会被「无增长即退出」提前结束 */
const MAX_CLOSURE_ROUNDS = 8
/** 呈现集体量上限：超出后只保留前 N 个，避免大场景红光刷屏与渲染开销 */
const MAX_PRESENT_IDS = 400

function addAll(target: Set<string>, source: Iterable<string> | null | undefined): void {
  if (!source) return
  for (const id of source) target.add(id)
}

/**
 * 求解器 / 预览平移都不会写入的点：硬锁定点（原点 `locked=true` 等）。
 * 把它们排除在写入点集外，既是语义正确的，也能显著降低「原点把全场景串起来」的过度锁定。
 */
function isWritablePoint(scene: Scene, pointId: string): boolean {
  const point = scene.points.get(pointId)
  if (!point) return false
  return point.locked !== true
}

/** 依据 id 反查它在场景中的元素类型；未命中返回 null */
export function resolveElementType(scene: Scene, id: string): string | null {
  if (scene.points.has(id)) return 'point'
  if (scene.lines.has(id)) return 'line'
  if (scene.straightLines.has(id)) return 'straightLine'
  if (scene.perpendicularLines.has(id)) return 'perpendicularLine'
  if (scene.parallelLines.has(id)) return 'parallelLine'
  if (scene.rays.has(id)) return 'ray'
  if (scene.vectors.has(id)) return 'vector'
  if (scene.circles.has(id)) return 'circle'
  if (scene.faces.has(id)) return 'face'
  if (scene.spheres.has(id)) return 'sphere'
  if (scene.cones.has(id)) return 'cone'
  if (scene.cylinders.has(id)) return 'cylinder'
  if (scene.nets.has(id)) return 'net'
  if (scene.cubeConstraints.has(id)) return 'cube'
  if (scene.prismConstraints.has(id)) return 'prism'
  if (scene.pyramidConstraints.has(id)) return 'pyramid'
  if (scene.regularPolygonConstraints.has(id)) return 'regularPolygon'
  return null
}

/** 元素显示名（非拖拽写路径的提示文案用；缺失时回退为 id） */
export function resolveElementLabel(scene: Scene, id: string, type?: string | null): string {
  const kind = type ?? resolveElementType(scene, id)
  const nameOf = (obj: { name?: string } | undefined): string | null =>
    obj && typeof obj.name === 'string' && obj.name.length > 0 ? obj.name : null
  switch (kind) {
    case 'point':
      return nameOf(scene.points.get(id)) ?? id
    case 'line':
      return nameOf(scene.lines.get(id)) ?? id
    case 'straightLine':
      return nameOf(scene.straightLines.get(id)) ?? id
    case 'perpendicularLine':
      return nameOf(scene.perpendicularLines.get(id)) ?? id
    case 'parallelLine':
      return nameOf(scene.parallelLines.get(id)) ?? id
    case 'ray':
      return nameOf(scene.rays.get(id)) ?? id
    case 'vector':
      return nameOf(scene.vectors.get(id)) ?? id
    case 'circle':
      return nameOf(scene.circles.get(id)) ?? id
    case 'face':
      return nameOf(scene.faces.get(id)) ?? id
    case 'sphere':
      return nameOf(scene.spheres.get(id)) ?? id
    case 'cone':
      return nameOf(scene.cones.get(id)) ?? id
    case 'cylinder':
      return nameOf(scene.cylinders.get(id)) ?? id
    case 'net':
      return nameOf(scene.nets.get(id)) ?? id
    case 'cube':
      return nameOf(scene.cubeConstraints.get(id) as { name?: string } | undefined) ?? id
    case 'prism':
      return nameOf(scene.prismConstraints.get(id) as { name?: string } | undefined) ?? id
    case 'pyramid':
      return nameOf(scene.pyramidConstraints.get(id) as { name?: string } | undefined) ?? id
    case 'regularPolygon':
      return nameOf(scene.regularPolygonConstraints.get(id) as { name?: string } | undefined) ?? id
    default:
      return id
  }
}

/**
 * 第 1 步：按拖拽目标类型解析「种子点集」。
 * 即用户抓住这个元素拖动时，位置会被直接改写的点。
 */
export function collectSeedPointIds(scene: Scene, elementId: string, elementType: string): Set<string> {
  const seed = new Set<string>()
  const pushPoint = (id: string | null | undefined) => {
    if (id && scene.points.has(id)) seed.add(id)
  }

  switch (elementType) {
    case 'point':
      pushPoint(elementId)
      break
    case 'line': {
      const item = scene.lines.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
      }
      break
    }
    case 'straightLine': {
      const item = scene.straightLines.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
      }
      break
    }
    case 'perpendicularLine': {
      const item = scene.perpendicularLines.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
      }
      break
    }
    case 'parallelLine': {
      const item = scene.parallelLines.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
      }
      break
    }
    case 'ray': {
      const item = scene.rays.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
      }
      break
    }
    case 'vector': {
      const item = scene.vectors.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
      }
      break
    }
    case 'circle': {
      const item = scene.circles.get(elementId)
      if (item) {
        pushPoint(item.p1.id)
        pushPoint(item.p2.id)
        pushPoint(item.p3.id)
      }
      scene.points.forEach((point) => {
        if (point.circleId === elementId && point.circleRole === 'center') pushPoint(point.id)
      })
      break
    }
    case 'sphere': {
      const item = scene.spheres.get(elementId)
      if (item) {
        pushPoint(item.centerPoint.id)
        pushPoint(item.radiusPoint?.id)
      }
      break
    }
    case 'cone': {
      const item = scene.cones.get(elementId)
      if (item) {
        pushPoint(item.baseCenterPoint.id)
        pushPoint(item.apexPoint.id)
      }
      break
    }
    case 'cylinder': {
      const item = scene.cylinders.get(elementId)
      if (item) {
        pushPoint(item.bottomCenterPoint.id)
        pushPoint(item.topCenterPoint.id)
      }
      break
    }
    case 'face': {
      const item = scene.faces.get(elementId)
      if (item) addAll(seed, item.memberPointIds)
      break
    }
    case 'net': {
      const item = scene.nets.get(elementId)
      if (item) {
        item.faceIds.forEach((faceId) => {
          const face = scene.faces.get(faceId)
          if (face) addAll(seed, face.memberPointIds)
        })
      }
      break
    }
    case 'cube':
    case 'prism':
    case 'pyramid':
    case 'regularPolygon': {
      const constraint = lookupSolidConstraint(scene, elementId)
      if (constraint) addAll(seed, constraint.getDependencyPointIds?.())
      break
    }
    default:
      break
  }

  return seed
}

function lookupSolidConstraint(
  scene: Scene,
  solidId: string,
): SceneConstraint | undefined {
  return (
    scene.cubeConstraints.get(solidId) ??
    scene.prismConstraints.get(solidId) ??
    scene.pyramidConstraints.get(solidId) ??
    scene.regularPolygonConstraints.get(solidId)
  )
}

/**
 * 第 2 步：直接写入扩张。
 * 复刻 Interaction.previewMovePoints / Editor.translatePrism / Editor.translatePyramid 的实际平移范围：
 * - 棱柱 dependent 点：整体平移 owner + dependent + 底面边界点
 * - 棱锥任一点（棱锥无 dependent，全部为 owner）：整体平移 owner + 底面边界点
 * - 圆/圆弧心点：圆心移动即整圆平移，其定义点一并写入
 * - 长度锁定线段：拖一端连带另一端
 */
function expandDirectWritePoints(scene: Scene, seed: Set<string>): Set<string> {
  const result = new Set(seed)

  for (const pointId of seed) {
    const point = scene.points.get(pointId)
    if (!point) continue

    if (point.prismId && point.prismRole === 'dependent') {
      const constraint = scene.prismConstraints.get(point.prismId)
      if (constraint instanceof PrismConstraint) {
        addAll(result, constraint.ownerPointIds)
        constraint.dependentLayouts.forEach((layout) => result.add(layout.pointId))
        const bottomFace = scene.faces.get(constraint.bottomFaceId)
        if (bottomFace) addAll(result, bottomFace.boundaryPointIds)
      }
    }

    if (point.pyramidId) {
      const constraint = scene.pyramidConstraints.get(point.pyramidId)
      if (constraint instanceof PyramidConstraint) {
        addAll(result, constraint.ownerPointIds)
        const bottomFace = scene.faces.get(constraint.bottomFaceId)
        if (bottomFace) addAll(result, bottomFace.boundaryPointIds)
      }
    }

    if (point.circleRole === 'center' && point.circleId) {
      addAll(result, collectCircleOwnPoints(scene, point.circleId))
    }
  }

  return expandLockedLinePoints(scene, result)
}

/**
 * 第 3 步：求解回写扩张。
 *
 * 关键是「写目标」而非「参与集」：各约束的 getDependencyPointIds() 返回的是**读写混合**的参与集
 * （用于脏标记），拿它当写集会显著过度锁定。这里按各约束 solve() 的真实写行为取值：
 *
 * | 约束 | 输入（读） | 输出（写） |
 * |---|---|---|
 * | 立方体 / 正多边形 | ownerPointIds | dependentLayouts |
 * | 棱柱 | ownerPointIds | dependentLayouts（+ keepVertical 时 ownerPointIds[1]） |
 * | 棱锥 | ownerPointIds | 仅 keepVertical 时写 apex（ownerPointIds[1]） |
 * | 面 | supportPointIds | memberPointIds \\ supportPointIds（投影回平面） |
 * | 交点 | sourceA/sourceB 的端点 | pointId；**若 pointId 被拖则反向驱动 sourceA/sourceB** |
 * | 受约束点 | 宿主对象的点 | pointId |
 * | 垂线 / 平行线 | p1 与目标实体 | p2 |
 * | 圆柱 | 上下底面圆心 | ∅（只写构成圆 lockedRadius） |
 *
 * 只有「输入命中当前写入点集」的约束才会贡献输出，因此只读关联（如与交点求交的圆）
 * 不会被牵连进来，这正是「不会全场景锁死」的来源。
 */
function collectConstraintWritePoints(scene: Scene, input: Set<string>): Set<string> {
  const output = new Set<string>()
  const touches = (ids: Iterable<string> | undefined | null): boolean => {
    if (!ids) return false
    for (const id of ids) {
      if (input.has(id)) return true
    }
    return false
  }

  // 立体约束：owner 被改 → dependent 被重算
  scene.cubeConstraints.forEach((constraint) => {
    if (!(constraint instanceof CubeConstraint)) return
    if (!touches(constraint.ownerPointIds)) return
    constraint.dependentLayouts.forEach((layout) => output.add(layout.pointId))
  })
  scene.regularPolygonConstraints.forEach((constraint) => {
    if (!(constraint instanceof RegularPolygonConstraint)) return
    if (!touches(constraint.ownerPointIds)) return
    constraint.dependentLayouts.forEach((layout) => output.add(layout.pointId))
  })
  scene.prismConstraints.forEach((constraint) => {
    if (!(constraint instanceof PrismConstraint)) return
    if (!touches(constraint.ownerPointIds)) return
    constraint.dependentLayouts.forEach((layout) => output.add(layout.pointId))
    // 垂直保持模式下会把最高点矫正到底面法线方向
    if (constraint.keepVertical) output.add(constraint.ownerPointIds[1])
  })
  scene.pyramidConstraints.forEach((constraint) => {
    if (!(constraint instanceof PyramidConstraint)) return
    if (!touches(constraint.ownerPointIds)) return
    // 棱锥无 dependent 顶点；仅垂直保持模式会写 apex
    if (constraint.keepVertical) output.add(constraint.ownerPointIds[1])
  })

  // 面约束：支撑点变化 → 非支撑成员点被投影回平面
  scene.faceConstraints.forEach((constraint) => {
    const faceId = constraint.faceId
    if (!faceId) return
    const face = scene.faces.get(faceId)
    if (!face) return
    const support = face.supportPointIds
    if (!touches(support) && !touches(face.boundaryPointIds)) return
    const supportSet = new Set(support)
    face.memberPointIds.forEach((id) => {
      if (!supportSet.has(id)) output.add(id)
    })
  })

  // 交点约束：来源被改 → 交点被重算（交点会出现在写入点集里）
  // 注意：反向驱动（拖交点 → 改写来源）不在这里处理，见 expandReverseDrivePoints——
  // 它只能作用于「用户直接抓取的点」，否则会把交点的来源（如无关的圆）误纳入锁集。
  scene.intersectionConstraints.forEach((constraint, pointId) => {
    if (!(constraint instanceof IntersectionPointConstraint)) return
    const sources: string[] = []
    for (const id of constraint.getDependencyPointIds()) {
      if (id !== pointId) sources.push(id)
    }
    if (touches(sources)) output.add(pointId)
  })

  // 对象受约束点：宿主对象被改 → 受约束点被重算
  scene.objectConstrainedPointConstraints.forEach((constraint, pointId) => {
    const host: string[] = []
    for (const id of constraint.getDependencyPointIds()) {
      if (id !== pointId) host.push(id)
    }
    if (touches(host)) output.add(pointId)
  })

  // 垂线 / 平行线：p1 或目标实体被改 → p2 被重算
  scene.perpendicularLineConstraints.forEach((constraint, lineId) => {
    if (!touches(constraint.getDependencyPointIds?.())) return
    const line = scene.perpendicularLines.get(lineId)
    if (line) output.add(line.p2.id)
  })
  scene.parallelLineConstraints.forEach((constraint, lineId) => {
    if (!touches(constraint.getDependencyPointIds?.())) return
    const line = scene.parallelLines.get(lineId)
    if (line) output.add(line.p2.id)
  })

  return output
}

function collectCircleOwnPoints(scene: Scene, circleId: string): Set<string> {
  const ids = new Set<string>()
  const circle = scene.circles.get(circleId)
  if (circle) {
    ids.add(circle.p1.id)
    ids.add(circle.p2.id)
    ids.add(circle.p3.id)
  }
  scene.points.forEach((point) => {
    if (point.circleId === circleId && point.circleRole === 'center') ids.add(point.id)
  })
  return ids
}

/**
 * 长度锁定的线段：拖一端会连带另一端（Interaction.expandLockedLinePreviewPointIds 的同源语义），
 * 属于「直接写入」，必须参与锁判定。
 */
function expandLockedLinePoints(scene: Scene, seed: Set<string>): Set<string> {
  const result = new Set(seed)
  let changed = true
  while (changed) {
    changed = false
    scene.lines.forEach((line) => {
      if (!line.lengthLocked) return
      const hasP1 = result.has(line.p1.id)
      const hasP2 = result.has(line.p2.id)
      if (hasP1 === hasP2) return
      const other = hasP1 ? line.p2.id : line.p1.id
      if (result.has(other)) return
      result.add(other)
      changed = true
    })
  }
  return result
}

/**
 * 反向驱动扩张：仅对「用户直接抓取的点」生效。
 *
 * IntersectionPointConstraint.solve() 在 point.userLocked 或 point 正被拖拽时走 driveTargetsToPoint()，
 * 把来源实体整体平移。也就是说「拖交点」等价于「拖它的两条来源」——这部分写入必须计入本目标的作用域，
 * 但绝不能在闭包传播中对「被重算出来的交点」再次展开，否则与交点求交的无关图元（例：只参与求交的圆 K）
 * 会被牵连进锁集，重新变成全场景锁死。
 *
 * 受约束点（ObjectConstrainedPointConstraint）没有反向驱动路径，因此不在此处理。
 */
function expandReverseDrivePoints(scene: Scene, direct: Set<string>): Set<string> {
  const result = new Set(direct)
  scene.intersectionConstraints.forEach((constraint, pointId) => {
    if (!direct.has(pointId)) return
    if (!(constraint instanceof IntersectionPointConstraint)) return
    for (const id of constraint.getDependencyPointIds()) {
      if (id !== pointId) result.add(id)
    }
  })
  return result
}

/**
 * 计算拖拽目标的写入点集（锁判定用）。
 * 三段式：
 *   ① 直接写入（种子点 + 棱柱/棱锥整体平移 + 长度锁定线段连带 + 圆心整圆）
 *   ② 反向驱动（仅对直接抓取的点：拖交点 → 改写来源）
 *   ③ 求解回写不动点（各约束的精确写目标，带上限）
 */
export function computeWritePointsForTarget(
  scene: Scene,
  elementId: string,
  elementType: string,
): Set<string> {
  let points = expandDirectWritePoints(scene, collectSeedPointIds(scene, elementId, elementType))
  points = expandDirectWritePoints(scene, expandReverseDrivePoints(scene, points))

  // 不动点：约束输出「并入」当前集合（而不是替换），直到不再增长。
  // 注意此处只做约束输出扩张，不再重跑 expandDirectWritePoints——
  // 棱柱/棱锥整体平移与锁定线段连带只由「用户直接抓取」触发，求解器重算不会引发又一次整体平移。
  for (let round = 0; round < MAX_CLOSURE_ROUNDS; round += 1) {
    const outputs = collectConstraintWritePoints(scene, points)
    let grew = false
    outputs.forEach((id) => {
      if (!points.has(id)) {
        points.add(id)
        grew = true
      }
    })
    if (!grew) break
  }

  // 硬锁定点（原点等）永远不会被写入，剔除以免污染相交判定
  const writable = new Set<string>()
  points.forEach((id) => {
    if (isWritablePoint(scene, id)) writable.add(id)
  })
  return writable
}

/**
 * 计算呈现集（红光渲染用）：写入点 + 引用这些点的几何对象 + 所属立体/圆的全部可视元素。
 * 判定用点级（最小），呈现用对象级（直观），两者分离。
 */
function collectPresentIds(scene: Scene, writePoints: Set<string>, targetId: string): Set<string> {
  const present = new Set<string>()
  present.add(targetId)
  writePoints.forEach((id) => present.add(id))

  const faces = new Set<string>()

  writePoints.forEach((pointId) => {
    const refs = scene.getPointRefsForPoint(pointId)
    if (!refs) return
    addAll(present, refs.lines)
    addAll(present, refs.straightLines)
    addAll(present, refs.perpendicularLines)
    addAll(present, refs.parallelLines)
    addAll(present, refs.rays)
    addAll(present, refs.vectors)
    addAll(present, refs.circles)
    addAll(present, refs.spheres)
    addAll(present, refs.cones)
    addAll(present, refs.cylinders)
    addAll(present, refs.nets)
    addAll(faces, refs.faces)
    present.add(pointId)
  })

  // 所属立体 → 其全部面
  const solidIds = new Set<string>()
  writePoints.forEach((pointId) => {
    const point = scene.points.get(pointId)
    if (!point) return
    if (point.cubeId) solidIds.add(point.cubeId)
    if (point.prismId) solidIds.add(point.prismId)
    if (point.pyramidId) solidIds.add(point.pyramidId)
    if (point.regularPolygonId) solidIds.add(point.regularPolygonId)
    if (point.circleId) present.add(point.circleId)
    if (point.sphereId) present.add(point.sphereId)
    if (point.coneId) present.add(point.coneId)
    if (point.cylinderId) present.add(point.cylinderId)
  })
  solidIds.forEach((solidId) => {
    scene.getFacesForSolidId(solidId).forEach((face) => faces.add(face.id))
  })

  faces.forEach((faceId) => {
    present.add(faceId)
    const face = scene.faces.get(faceId)
    if (face) addAll(present, face.boundaryLineIds)
  })

  if (present.size <= MAX_PRESENT_IDS) return present

  // 超限截断：优先保留近端元素（目标、写入点、面），再补其余
  const ordered = new Set<string>()
  ordered.add(targetId)
  writePoints.forEach((id) => ordered.add(id))
  faces.forEach((id) => ordered.add(id))
  for (const id of present) {
    if (ordered.size >= MAX_PRESENT_IDS) break
    ordered.add(id)
  }
  return ordered
}

/** 推断对象级主语（气泡 / 提示文案用）：优先取点所属立体，否则回退目标自身 */
function resolveRoot(scene: Scene, target: LockScopeTarget): {
  rootId: string
  rootType: string
  rootName: string
} {
  const pointOwner = (pointId: string): { id: string; type: string } | null => {
    const point = scene.points.get(pointId)
    if (!point) return null
    if (point.cubeId) return { id: point.cubeId, type: 'cube' }
    if (point.prismId) return { id: point.prismId, type: 'prism' }
    if (point.pyramidId) return { id: point.pyramidId, type: 'pyramid' }
    if (point.regularPolygonId) return { id: point.regularPolygonId, type: 'regularPolygon' }
    if (point.sphereId) return { id: point.sphereId, type: 'sphere' }
    if (point.cylinderId) return { id: point.cylinderId, type: 'cylinder' }
    if (point.coneId) return { id: point.coneId, type: 'cone' }
    if (point.circleId) return { id: point.circleId, type: 'circle' }
    return null
  }

  // 目标本身就是对象 id
  if (
    target.elementType === 'cube' ||
    target.elementType === 'prism' ||
    target.elementType === 'pyramid' ||
    target.elementType === 'regularPolygon' ||
    target.elementType === 'sphere' ||
    target.elementType === 'cone' ||
    target.elementType === 'cylinder' ||
    target.elementType === 'circle' ||
    target.elementType === 'face'
  ) {
    return {
      rootId: target.elementId,
      rootType: target.elementType,
      rootName: target.elementName,
    }
  }

  // 拖点/线等元素：看能否找到所属对象作为主语
  const candidates: string[] = []
  if (target.elementType === 'point') {
    candidates.push(target.elementId)
  } else {
    const seed = collectSeedPointIds(scene, target.elementId, target.elementType)
    seed.forEach((id) => candidates.push(id))
  }
  for (const pointId of candidates) {
    const owner = pointOwner(pointId)
    if (!owner) continue
    return {
      rootId: owner.id,
      rootType: owner.type,
      rootName: resolveElementLabel(scene, owner.id, owner.type),
    }
  }

  return {
    rootId: target.elementId,
    rootType: target.elementType,
    rootName: target.elementName,
  }
}

/** 解析拖拽目标的完整占用作用域 */
export function computeLockScope(scene: Scene, target: LockScopeTarget): LockScope {
  const writePoints = computeWritePointsForTarget(scene, target.elementId, target.elementType)
  const presentIds = collectPresentIds(scene, writePoints, target.elementId)
  const root = resolveRoot(scene, target)
  return {
    elementId: target.elementId,
    elementType: target.elementType,
    elementName: target.elementName,
    rootId: root.rootId,
    rootType: root.rootType,
    rootName: root.rootName,
    writePoints: [...writePoints],
    presentIds: [...presentIds],
  }
}

/** 任意元素 id 列表 → 并集写入点集（非拖拽写路径用） */
export function computeWritePointsForElementIds(scene: Scene, elementIds: Iterable<string>): Set<string> {
  const result = new Set<string>()
  for (const id of elementIds) {
    const type = resolveElementType(scene, id)
    if (!type) continue
    const points = computeWritePointsForTarget(scene, id, type)
    points.forEach((pointId) => result.add(pointId))
  }
  return result
}

/** 点集相交判定（两侧均以 Set 传入，O(min(|a|,|b|))） */
export function pointSetsIntersect(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a]
  for (const id of small) {
    if (large.has(id)) return true
  }
  return false
}

/**
 * 从任意对象（通常是命令实例）中扫描出「场景里真实存在的元素 id」，
 * 用于让非拖拽写路径（侧边栏改数值、删除对象等）复用同一套写入点集判据。
 *
 * 扫描策略刻意保守：
 * - 只扫描自有可枚举属性，深度上限 3；
 * - 跳过快照/场景/历史等容器字段（避免把整份场景快照当成读写目标 → 全量误锁）；
 * - 节点数与命中数都有上限，避免在复杂命令上产生不可控开销。
 */
const ELEMENT_SCAN_SKIP_KEY =
  /snapshot|scene|editor|history|manager|provider|ydoc|renderer|before|after/i
const ELEMENT_SCAN_MAX_DEPTH = 3
const ELEMENT_SCAN_MAX_NODES = 256
const ELEMENT_SCAN_MAX_IDS = 128

export function collectSceneElementIds(scene: Scene, source: unknown): string[] {
  const found = new Set<string>()
  let visited = 0

  const visit = (value: unknown, depth: number) => {
    if (visited >= ELEMENT_SCAN_MAX_NODES || found.size >= ELEMENT_SCAN_MAX_IDS) return
    visited += 1

    if (typeof value === 'string') {
      if (value.length === 0 || value.length > 128) return
      if (value === Scene.ORIGIN_ID) return
      if (!resolveElementType(scene, value)) return
      found.add(value)
      return
    }
    if (depth >= ELEMENT_SCAN_MAX_DEPTH) return
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1)
      return
    }
    if (!value || typeof value !== 'object') return
    for (const key of Object.keys(value as Record<string, unknown>)) {
      if (key.startsWith('_') || ELEMENT_SCAN_SKIP_KEY.test(key)) continue
      visit((value as Record<string, unknown>)[key], depth + 1)
    }
  }

  visit(source, 0)
  return [...found]
}
