import { createContext } from 'react'
import { findNodeHandle } from 'react-native'
import type { ComponentRef } from 'react'
import type { Pressable } from 'react-native'
import { requestTVFocus } from '@/utils/nativeModules/utils'

type Direction = 'up' | 'down' | 'left' | 'right'

type FocusTargetRef = ComponentRef<typeof Pressable>

interface FocusTarget {
  id: number
  scopeId: string
  ref: FocusTargetRef | null
  preferred: boolean
  rect: FocusRect | null
  nextFocusUp?: number
  nextFocusDown?: number
  nextFocusLeft?: number
  nextFocusRight?: number
  onPress?: () => void
  onLongPress?: () => void
}

type FocusStateListener = (focused: boolean) => void

interface FocusRect {
  x: number
  y: number
  width: number
  height: number
}

export const TVFocusScopeContext = createContext('tv-root')
const targets = new Map<number, FocusTarget>()
const focusListeners = new Map<number, FocusStateListener>()
let activeTargetId: number | null = null
let activeScopeId: string | null = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null
let nextTargetId = 1

const centerX = (rect: FocusRect) => rect.x + rect.width / 2
const centerY = (rect: FocusRect) => rect.y + rect.height / 2
const getDirectionalThreshold = (from: FocusRect, to: FocusRect, direction: Direction) => {
  const primarySize = direction === 'up' || direction === 'down'
    ? Math.min(from.height, to.height)
    : Math.min(from.width, to.width)
  return Math.max(14, primarySize * 0.28)
}

const isVisibleRect = (rect: FocusRect | null): rect is FocusRect => {
  return !!rect && rect.width > 1 && rect.height > 1
}

const requestNativeFocus = (target: FocusTarget) => {
  const tag = target.ref ? findNodeHandle(target.ref) : null
  if (tag) requestTVFocus(tag)
  // 不要再调 target.ref.focus()：它走 RN 的 dispatchViewManagerCommand，view 一旦
  // 在测量与调用之间被导航切换卸载，会抛 "focus on view with tag ... does not exist"，
  // 这是异步抛到 UI 线程的错误，JS 层 try/catch 接不住（顶部导航焦点即切换时频发）。
  // requestTVFocus 走 UIBlock + resolveView，内部已经兜住异常。
}

const emitFocusState = (id: number | null, focused: boolean) => {
  if (!id) return
  focusListeners.get(id)?.(focused)
}

const clearActiveTarget = () => {
  if (activeTargetId) emitFocusState(activeTargetId, false)
  activeTargetId = null
}

export const blurActiveTVTarget = clearActiveTarget

const setActiveTarget = (target: FocusTarget) => {
  // 测量是异步的：等 measureInWindow 回来时页面可能已被导航切换卸载，
  // 目标已从 targets 移除。此时再对死 view 发 focus，原生会抛 "view does not exist"
  if (!targets.has(target.id)) return
  if (activeTargetId && activeTargetId !== target.id) emitFocusState(activeTargetId, false)
  activeTargetId = target.id
  emitFocusState(target.id, true)
  requestNativeFocus(target)
}

const getScopedTargets = () => {
  const list = Array.from(targets.values())
  return activeScopeId ? list.filter(target => target.scopeId === activeScopeId) : list
}

const measureTarget = async(target: FocusTarget) => new Promise<FocusTarget | null>(resolve => {
  if (!target.ref?.measureInWindow) {
    resolve(null)
    return
  }

  target.ref.measureInWindow((x, y, width, height) => {
    target.rect = { x, y, width, height }
    resolve(isVisibleRect(target.rect) ? target : null)
  })
})

const measureTargets = async() => {
  const measured = await Promise.all(getScopedTargets().map(measureTarget))
  return measured.filter(Boolean) as FocusTarget[]
}

const getNativeHandle = (target: FocusTarget) => target.ref ? findNodeHandle(target.ref) : null

const getExplicitNextFocusHandle = (target: FocusTarget, direction: Direction) => {
  switch (direction) {
    case 'up': return target.nextFocusUp
    case 'down': return target.nextFocusDown
    case 'left': return target.nextFocusLeft
    case 'right': return target.nextFocusRight
  }
}

/**
 * 按原生 handle 在注册表里直接定位目标（限定 scope），跳过 measureInWindow。
 * 首页/详情页的卡片都设了显式 nextFocus，走这条链时每次方向键零测量，焦点跟手
 * （原实现会先无条件全量 measure 一遍再取显式目标，几十个节点时每次按键都慢半拍）。
 */
const findScopedTargetByHandle = (handle: number | null, scopeId: string | null): FocusTarget | null => {
  if (handle == null) return null
  for (const target of targets.values()) {
    if (scopeId != null && target.scopeId !== scopeId) continue
    if (getNativeHandle(target) === handle) return target
  }
  return null
}

const getCandidateScore = (from: FocusRect, to: FocusRect, direction: Direction) => {
  const fromX = centerX(from)
  const fromY = centerY(from)
  const toX = centerX(to)
  const toY = centerY(to)
  const dx = toX - fromX
  const dy = toY - fromY
  const sameColumnPenalty = Math.abs(dx)
  const sameRowPenalty = Math.abs(dy)
  const minDistance = getDirectionalThreshold(from, to, direction)

  switch (direction) {
    case 'up':
      if (dy >= -minDistance) return null
      return Math.abs(dy) * 1000 + sameColumnPenalty
    case 'down':
      if (dy <= minDistance) return null
      return Math.abs(dy) * 1000 + sameColumnPenalty
    case 'left':
      if (dx >= -minDistance) return null
      return Math.abs(dx) * 1000 + sameRowPenalty
    case 'right':
      if (dx <= minDistance) return null
      return Math.abs(dx) * 1000 + sameRowPenalty
  }
}

/**
 * 两个矩形在垂直方向是否有重叠（用于左右移动判定「同一排」）。
 */
const hasVerticalOverlap = (from: FocusRect, to: FocusRect) =>
  Math.min(from.y + from.height, to.y + to.height) > Math.max(from.y, to.y)

/**
 * 两个矩形在水平方向是否有重叠（用于上下移动判定「同一列」）。
 */
const hasHorizontalOverlap = (from: FocusRect, to: FocusRect) =>
  Math.min(from.x + from.width, to.x + to.width) > Math.max(from.x, to.x)

/**
 * 从候选里挑出「同排 / 同列」的那些。
 *
 * 为什么需要这一步：getCandidateScore 里主轴差 ×1000、副轴差 ×1，
 * 于是「副轴偏离」的权重几乎为 0 —— 只要在主轴方向上近 1px（1000 分），
 * 就足以压过一个副轴偏离几百像素的候选。
 * 典型翻车现场：顶部导航条（tab）与下方内容卡片在水平方向上落在同一段 x 区间时，
 * 从卡片按「右」会被导航条抢走（导航条水平上近几像素，竖直上偏了三五百像素），
 * 反之从导航条按「左」也会跳到下方卡片上。用户表现就是「遥控器选不中那张卡」。
 * 这里先只看「有重叠」的候选（同一排 / 同一列），没有重叠候选时才退回原来的全局打分。
 */
const getSameBandCandidates = (from: FocusRect, candidates: Array<{ target: FocusTarget, score: number }>, direction: Direction) => {
  const horizontalMove = direction === 'left' || direction === 'right'
  const inBand = candidates.filter(({ target }) => {
    if (!target.rect) return false
    return horizontalMove ? hasVerticalOverlap(from, target.rect) : hasHorizontalOverlap(from, target.rect)
  })
  return inBand.length ? inBand : candidates
}

export const setActiveTVFocusScope = (scopeId: string) => {
  if (activeScopeId !== scopeId) {
    clearActiveTarget()
    activeScopeId = scopeId
  }
  scheduleTVInitialFocus()
}

export const clearActiveTVFocusScope = (scopeId: string) => {
  if (activeScopeId === scopeId) {
    clearActiveTarget()
    activeScopeId = null
  }
}

export const isActiveTVFocusScope = (scopeId: string) => activeScopeId === scopeId

export const registerTVFocusTarget = (scopeId: string, ref: FocusTargetRef | null, preferred: boolean, onPress?: () => void) => {
  const id = nextTargetId++
  targets.set(id, { id, scopeId, ref, preferred, rect: null, onPress })

  if (preferred && (!activeScopeId || activeScopeId === scopeId)) scheduleTVInitialFocus()

  return id
}

export const updateTVFocusTarget = (id: number, patch: Partial<Omit<FocusTarget, 'id'>>) => {
  const target = targets.get(id)
  if (!target) return
  targets.set(id, { ...target, ...patch })
}

export const unregisterTVFocusTarget = (id: number) => {
  if (activeTargetId === id) emitFocusState(id, false)
  focusListeners.delete(id)
  targets.delete(id)
  if (activeTargetId === id) activeTargetId = null
}

export const notifyTVTargetFocused = (id: number) => {
  if (activeTargetId && activeTargetId !== id) emitFocusState(activeTargetId, false)
  activeTargetId = id
  emitFocusState(id, true)
}

export const subscribeTVTargetFocusState = (id: number, listener: FocusStateListener) => {
  focusListeners.set(id, listener)
  listener(activeTargetId === id)
  return () => {
    if (focusListeners.get(id) === listener) focusListeners.delete(id)
  }
}

export const focusPreferredTVTarget = async() => {
  const measured = await measureTargets()
  // 已有仍挂载的活动焦点时不抢：preferred 调度只该兜底（无焦点/焦点目标已卸载），
  // 不该覆盖。否则 FlatList 滚回顶部时 preferred 首行重挂载会把焦点从当前行拽回首行、
  // 进屏的双次调度（260ms+580ms）也会抢回用户刚移动过的焦点
  if (activeTargetId) {
    const active = measured.find(target => target.id === activeTargetId)
    if (active) return true
  }
  // 取最后一个 preferred 目标（最近注册的——弹窗按钮比页面按钮晚注册，
  // 这样弹窗打开时初始焦点落在弹窗按钮而非背景按钮）
  let target: FocusTarget | null = null
  for (const t of measured) {
    if (t.preferred) target = t
  }
  if (!target) target = measured[0]
  if (!target) return false
  setActiveTarget(target)
  return true
}

export const scheduleTVInitialFocus = () => {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  fallbackTimer = setTimeout(() => {
    fallbackTimer = null
    void focusPreferredTVTarget()
  }, 260)
}

const moveTVFocusNow = async(direction: Direction) => {
  const active = activeTargetId != null ? targets.get(activeTargetId) : null

  // 无活跃焦点（切页/挂载空窗）：回退到全量测量 + preferred 兜底，低频场景
  if (!active) {
    const measured = await measureTargets()
    const preferred = measured.find(target => target.preferred) ?? measured[0]
    if (!preferred) return false
    setActiveTarget(preferred)
    return true
  }

  // 显式链优先：直接查注册表，零 measureInWindow。命中即用，焦点瞬间落位。
  // 首页/详情页/播放页控制栏的卡片都设了 nextFocus，这一步把「每次方向键全量测一遍」
  // 降为「零测量」，根除焦点慢半拍（注释见 Focusable.tsx / Home.tsx 的 nextFocus 设置）。
  const explicitHandle = getExplicitNextFocusHandle(active, direction)
  const explicitTarget = explicitHandle != null ? findScopedTargetByHandle(explicitHandle, active.scopeId) : null
  if (explicitTarget) {
    setActiveTarget(explicitTarget)
    return true
  }

  // 无显式链：才走几何候选，需要实时坐标，全量 measure 一次（原逻辑）
  const measured = await measureTargets()
  const activeMeasured = measured.find(target => target.id === active.id) ?? active
  if (!activeMeasured?.rect) {
    const preferred = measured.find(target => target.preferred) ?? measured[0]
    if (!preferred) return false
    setActiveTarget(preferred)
    return true
  }

  const candidates: Array<{ target: FocusTarget, score: number }> = []
  for (const target of measured) {
    if (target.id === active.id || !target.rect) continue
    const score = getCandidateScore(activeMeasured.rect, target.rect, direction)
    if (score == null) continue
    candidates.push({ target, score })
  }
  if (!candidates.length) return false

  // 同排（左右移动）/ 同列（上下移动）优先，避免顶部导航条抢走同一排的卡片，详见 getSameBandCandidates
  const pool = getSameBandCandidates(activeMeasured.rect, candidates, direction)

  let best: { target: FocusTarget, score: number } | null = null
  for (const candidate of pool) {
    if (!best || candidate.score < best.score) best = candidate
  }

  if (!best) return false
  setActiveTarget(best.target)
  return true
}

/**
 * 方向键串行化。
 *
 * moveTVFocus 要先异步测一遍目标位置再算下一步，两次按键挨得近时（快速连按，
 * 或长按方向键的 repeat）会并发跑：两次都从「按键前的焦点」出发，最后写回同一个
 * 目标，表现就是「连按几下只跳一格」。排队后每次按键都基于上一次移动的结果。
 */
let moveChain: Promise<boolean> = Promise.resolve(true)

export const moveTVFocus = async(direction: Direction) => {
  const next = moveChain.then(
    async() => moveTVFocusNow(direction),
    async() => moveTVFocusNow(direction),
  )
  moveChain = next.catch(() => false)
  return next
}

/** 按组件 ref 直接聚焦某个目标。
 * 供页面里「程序性移动焦点」的场景使用（如详情页从操作按钮下键进列表首行）。
 * 旧做法靠 preferred 翻转+重调度间接实现，初始焦点改为仅挂载时调度后不再可用（09-22）。
 *
 * 这里按 handle 同步查注册表，不再 measureInWindow 全量测量：切顶栏时六个页面
 * 全挂载，几十上百个目标挨个走一遍原生测量要一秒多，焦点肉眼可见地「慢半拍」。
 * 注册表里的目标都是已挂载的 view，requestTVFocus 不依赖测量结果。 */
export const focusTVTargetByRef = async(ref: FocusTargetRef | null) => {
  if (!ref) return false
  const handle = findNodeHandle(ref)
  if (handle == null) return false
  let target: FocusTarget | null = null
  for (const candidate of targets.values()) {
    if (getNativeHandle(candidate) === handle) {
      target = candidate
      break
    }
  }
  if (!target) return false
  setActiveTarget(target)
  return true
}

export const pressActiveTVTarget = () => {
  const active = activeTargetId ? targets.get(activeTargetId) : null
  if (activeScopeId && active?.scopeId !== activeScopeId) return
  active?.onPress?.()
}

/** 当前聚焦目标是否具备长按能力 */
export const activeTargetHasLongPress = () => {
  const active = activeTargetId ? targets.get(activeTargetId) : null
  if (activeScopeId && active?.scopeId !== activeScopeId) return false
  return !!active?.onLongPress
}

/** 触发当前聚焦目标的长按动作 */
export const longPressActiveTVTarget = () => {
  const active = activeTargetId ? targets.get(activeTargetId) : null
  if (activeScopeId && active?.scopeId !== activeScopeId) return
  active?.onLongPress?.()
}

/** 弹窗激活标记：弹窗打开时控制器让路，弹窗自己处理按键 */
let tvDialogActive = false
export const setTVDialogActive = (active: boolean) => { tvDialogActive = active }
export const isTVDialogActive = () => tvDialogActive
