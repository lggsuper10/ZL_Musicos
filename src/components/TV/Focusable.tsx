import { forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState, type ComponentRef } from 'react'
import { Pressable, type NativeSyntheticEvent, type PressableProps, type StyleProp, type TargetedEvent, type ViewStyle } from 'react-native'
import { tvColors, tvSize, tvTokens } from '@/theme/tv'
import { notifyTVTargetFocused, registerTVFocusTarget, subscribeTVTargetFocusState, TVFocusScopeContext, unregisterTVFocusTarget, updateTVFocusTarget } from './tvFocusManager'
import { getTVTabHostActiveId, subscribeTVTabHostActive, TVTabHostContext, TVTabPageIdContext } from './tvTabHost'

export interface FocusableProps extends PressableProps {
  focusStyle?: StyleProp<ViewStyle>
  onPress?: PressableProps['onPress']
  onLongPress?: PressableProps['onLongPress']
  onTVFocusChange?: (focused: boolean) => void
  hasTVPreferredFocus?: boolean
  forceFocused?: boolean
  nextFocusUp?: number
  nextFocusDown?: number
  nextFocusLeft?: number
  nextFocusRight?: number
}

type FocusEvent = NativeSyntheticEvent<TargetedEvent>

const Focusable = forwardRef<ComponentRef<typeof Pressable>, FocusableProps>(({
  style,
  focusStyle,
  children,
  onPress,
  onLongPress,
  hasTVPreferredFocus,
  forceFocused,
  nextFocusUp,
  nextFocusDown,
  nextFocusLeft,
  nextFocusRight,
  onFocus,
  onBlur,
  onTVFocusChange,
  ...rest
}, ref) => {
  const [focused, setFocused] = useState(false)
  const nativeRef = useRef<ComponentRef<typeof Pressable> | null>(null)
  const targetIdRef = useRef<number | null>(null)
  const focusScopeId = useContext(TVFocusScopeContext)
  const inTabHost = useContext(TVTabHostContext)
  const tabPageId = useContext(TVTabPageIdContext)
  const focusedRef = useRef(false)
  const focusChangeRef = useRef(onTVFocusChange)
  const longPressFiredRef = useRef(false)

  useImperativeHandle(ref, () => nativeRef.current!, [])

  useEffect(() => {
    focusChangeRef.current = onTVFocusChange
  }, [onTVFocusChange])

  const setTVFocused = useCallback((nextFocused: boolean) => {
    if (focusedRef.current === nextFocused) return
    focusedRef.current = nextFocused
    setFocused(nextFocused)
    focusChangeRef.current?.(nextFocused)
  }, [])

  const triggerTVPress = useCallback(() => {
    if (!onPress) return
    if (longPressFiredRef.current) {
      longPressFiredRef.current = false
      return
    }
    // 长按检测已由 TVRemoteFocusController 通过 repeat 事件处理
    // 这里直接触发短按（无延迟）
    ;(onPress as unknown as () => void)()
  }, [onPress])

  const handleLongPress = useCallback(() => {
    longPressFiredRef.current = true
    onLongPress?.()
  }, [onLongPress])

  const handlePressIn = useCallback(() => {
    longPressFiredRef.current = false
  }, [])

  const handleFocus = useCallback((event: FocusEvent) => {
    setTVFocused(true)
    if (targetIdRef.current) notifyTVTargetFocused(targetIdRef.current)
    onFocus?.(event)
  }, [onFocus, setTVFocused])

  const handleBlur = useCallback((event: FocusEvent) => {
    setTVFocused(false)
    onBlur?.(event)
  }, [onBlur, setTVFocused])

  // 外部直接控制视觉焦点状态：不走 useEffect（会被引擎回调覆盖），
  // 直接在样式计算里用 focused || forceFocused，React 渲染 100% 可靠

  // 切页广播可能在任意时刻到达（组件不会因此重渲染），注册时要拿最新的 props，
  // 所以每次渲染都把要写进焦点注册表的值存到 ref 里。
  const latestRef = useRef({
    focusScopeId,
    hasTVPreferredFocus,
    nextFocusUp,
    nextFocusDown,
    nextFocusLeft,
    nextFocusRight,
    onPress,
    onLongPress,
    triggerTVPress,
    handleLongPress,
  })
  latestRef.current = {
    focusScopeId,
    hasTVPreferredFocus,
    nextFocusUp,
    nextFocusDown,
    nextFocusLeft,
    nextFocusRight,
    onPress,
    onLongPress,
    triggerTVPress,
    handleLongPress,
  }

  useEffect(() => {
    const node = nativeRef.current
    if (!node) return
    const isActive = () => !inTabHost || !tabPageId || getTVTabHostActiveId() === tabPageId
    let id: number | null = null
    let unsubscribeState: (() => void) | null = null

    const register = () => {
      if (id != null) return
      const latest = latestRef.current
      const nextId = registerTVFocusTarget(latest.focusScopeId, node, !!latest.hasTVPreferredFocus)
      id = nextId
      targetIdRef.current = nextId
      // 注册和写入同一帧完成：否则隐藏页重新激活时只注册了空目标，
      // nextFocus/onPress 要等父组件碰巧重渲染才会补上。
      updateTVFocusTarget(nextId, {
        scopeId: latest.focusScopeId,
        ref: node,
        preferred: !!latest.hasTVPreferredFocus,
        nextFocusUp: latest.nextFocusUp,
        nextFocusDown: latest.nextFocusDown,
        nextFocusLeft: latest.nextFocusLeft,
        nextFocusRight: latest.nextFocusRight,
        onPress: latest.onPress ? latest.triggerTVPress : undefined,
        onLongPress: latest.onLongPress ? latest.handleLongPress : undefined,
      })
      unsubscribeState = subscribeTVTargetFocusState(nextId, setTVFocused)
    }

    const unregister = () => {
      if (id == null) return
      unsubscribeState?.()
      unsubscribeState = null
      unregisterTVFocusTarget(id)
      id = null
      targetIdRef.current = null
      setTVFocused(false)
    }

    const sync = () => {
      if (isActive()) register()
      else unregister()
    }

    // 隐藏的 tab 页不注册焦点目标：tvFocusManager 每次按键都要把注册表里的目标
    // 全量 measureInWindow 一遍，六个页面全挂载时会拖到近一秒才落位。
    // 切页时由宿主广播同步注册/注销，不经过 React 重渲染，页面组件不会重渲染。
    sync()
    const unsubscribeActive = inTabHost ? subscribeTVTabHostActive(sync) : null

    return () => {
      unsubscribeActive?.()
      unregister()
    }
  }, [focusScopeId, inTabHost, tabPageId, setTVFocused])

  useEffect(() => {
    const id = targetIdRef.current
    if (id == null) return
    updateTVFocusTarget(id, {
      scopeId: focusScopeId,
      ref: nativeRef.current,
      preferred: !!hasTVPreferredFocus,
      nextFocusUp,
      nextFocusDown,
      nextFocusLeft,
      nextFocusRight,
      onPress: onPress ? triggerTVPress : undefined,
      onLongPress: onLongPress ? handleLongPress : undefined,
    })
  }, [focusScopeId, hasTVPreferredFocus, nextFocusDown, nextFocusLeft, nextFocusRight, nextFocusUp, onPress, onLongPress, triggerTVPress, handleLongPress])

  return (
    <Pressable
      ref={nativeRef}
      focusable
      accessible
      accessibilityRole="button"
      hasTVPreferredFocus={hasTVPreferredFocus}
      nextFocusUp={nextFocusUp}
      nextFocusDown={nextFocusDown}
      nextFocusLeft={nextFocusLeft}
      nextFocusRight={nextFocusRight}
      onPress={onPress ? triggerTVPress : undefined}
      onLongPress={onLongPress ? handleLongPress : undefined}
      onPressIn={handlePressIn}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={state => [
        styles.base,
        typeof style === 'function' ? style(state) : style,
        (focused || forceFocused) ? styles.focused : null,
        (focused || forceFocused) ? focusStyle : null,
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  )
})

const styles: Record<string, ViewStyle> = {
  base: {
    borderRadius: tvTokens.radius,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focused: {
    borderColor: tvColors.primaryHigh,
    shadowColor: tvColors.primaryHigh,
    shadowOpacity: 0.5,
    shadowRadius: tvSize(14),
    shadowOffset: { width: 0, height: tvSize(3) },
    elevation: 10,
    zIndex: 8,
  },
}

export default Focusable
