import { memo, useEffect, useRef } from 'react'
import { Animated, Easing, View, type ImageStyle, type ViewStyle } from 'react-native'
import Image from '@/components/common/Image'
import { tvColors } from '@/theme/tv'

interface Props {
  image?: string | number | null
  isPlaying: boolean
  size?: number
  onCoverError?: (url: string | number) => void
  style?: ViewStyle | ViewStyle[]
}

// 33⅓ 转/分（黑胶唱片标准转速）：1.8s 一圈。
// 匀速旋转、rotate 映射到 0→360deg，360deg 与 0deg 视觉等价，循环衔接处无
// 跳变；暂停冻结角度、续播从原角度接着转，不会回弹——杜绝「雨刮式」顿挫。
const SPIN_PERIOD = 1800

// 唱臂绕右上角支点摆动：播放时压进唱片，暂停时摆回唱片右侧（抬起）
const PLAY_ANGLE = '-74deg'
const REST_ANGLE = '-96deg'

// 唱片纹理，圆心对称，随唱片一起转也看不出方向，只负责质感
const GROOVE_SCALES = [0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46]

const TVVinylRecord = ({ image, isPlaying, size = 392, onCoverError, style }: Props) => {
  const spinValue = useRef(new Animated.Value(0)).current
  const spinAnimRef = useRef<Animated.CompositeAnimation | null>(null)
  const spinProgressRef = useRef(0)
  const spinFromRef = useRef(0)
  const spinStartRef = useRef(0)
  const needleValue = useRef(new Animated.Value(isPlaying ? 1 : 0)).current

  // 旋转循环：RN 的 Animated.loop 返回对象没有 pause()/resume() 方法（运行时
  // 为 undefined，调用会抛 TypeError: undefined is not a function），因此用
  // 「stopAnimation + 墙上时钟计算当前角度 + 按剩余时长重建 timing」手动实现
  // 暂停/续播。360deg 与 0deg 视觉等价，续播无跳变，不会出现「雨刮式」顿挫。
  // 注：原生驱动下 stopAnimation 回调返回的是 JS 侧过期值，所以角度用
  // (起始角度 + 已播放时长/周期) 推算，而不依赖回调值。
  const pauseSpin = () => {
    if (!spinAnimRef.current) return
    spinAnimRef.current.stop()
    spinAnimRef.current = null
    const elapsed = Date.now() - spinStartRef.current
    spinProgressRef.current = spinFromRef.current + elapsed / SPIN_PERIOD
  }
  const startSpin = () => {
    if (spinAnimRef.current) return
    const from = spinProgressRef.current
    const to = Math.floor(from) + 1
    const anim = Animated.timing(spinValue, {
      toValue: to,
      duration: SPIN_PERIOD * (to - from),
      easing: Easing.linear,
      useNativeDriver: true,
      isInteraction: false,
    })
    anim.start(({ finished }) => {
      if (!finished) return
      spinProgressRef.current = to
      spinAnimRef.current = null
      startSpin()
    })
    spinFromRef.current = from
    spinStartRef.current = Date.now()
    spinAnimRef.current = anim
  }

  useEffect(() => {
    if (isPlaying) {
      startSpin()
    } else {
      pauseSpin()
    }
  }, [isPlaying, spinValue])

  useEffect(() => () => { spinAnimRef.current?.stop() }, [])

  useEffect(() => {
    Animated.timing(needleValue, {
      toValue: isPlaying ? 1 : 0,
      duration: isPlaying ? 600 : 460,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    }).start()
  }, [isPlaying, needleValue])

  const recordRotate = spinValue.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
    extrapolate: 'extend',
  })
  const needleRotate = needleValue.interpolate({
    inputRange: [0, 1],
    outputRange: [REST_ANGLE, PLAY_ANGLE],
  })

  const recordSize = size * 0.82
  const coverSize = size * 0.34
  const centerHoleSize = size * 0.052
  const recordBorder = Math.max(10, Math.round(size * 0.04))
  const coverBorder = Math.max(5, Math.round(size * 0.026))
  // 随盘旋转的小标记点：无封面时盘面是同心圆、对称看不出在转，用它提供旋转参照
  const spinMarkSize = Math.max(5, Math.round(size * 0.028))
  // 唱臂：旋转容器以支点为中心（right/top 各回退一个半径），唱臂从支点向左伸出。
  // 这样旋转原点就是支点本身（原实现绕臂中心转，摆动时臂根会甩离底座）
  const pivotRight = size * 0.1
  const pivotTop = size * 0.1
  const armLen = size * 0.43
  const armT = Math.max(6, Math.round(size * 0.024))
  const headLen = size * 0.12
  const headH = size * 0.07
  const baseSize = size * 0.17

  return (
    <View style={[styles.root, { width: size, height: size }, style]}>
      <View style={[styles.redHalo, { borderRadius: size / 2 }]} />
      <View style={[styles.platter, { width: size * 0.9, height: size * 0.9, borderRadius: size * 0.45, borderWidth: Math.max(9, Math.round(size * 0.035)) }]} />
      <Animated.View
        style={[
          styles.record,
          {
            width: recordSize,
            height: recordSize,
            borderRadius: recordSize / 2,
            borderWidth: recordBorder,
            transform: [{ rotate: recordRotate }],
          },
        ]}
      >
        {GROOVE_SCALES.map((scale, index) => (
          <View
            key={scale}
            style={[styles.groove, {
              width: recordSize * scale,
              height: recordSize * scale,
              borderRadius: recordSize * scale / 2,
              borderColor: index % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.055)',
            }]}
          />
        ))}
        <View style={[styles.spinMark, {
          top: recordSize * 0.11,
          left: (recordSize - spinMarkSize) / 2,
          width: spinMarkSize,
          height: spinMarkSize,
          borderRadius: spinMarkSize / 2,
        }]} />
        <View style={[styles.coverWrap, { width: coverSize, height: coverSize, borderRadius: coverSize / 2, borderWidth: coverBorder }]}>
          {image ? (
            <Image url={image} style={styles.coverImage as ImageStyle} onError={onCoverError} />
          ) : null}
          <View style={[styles.centerHole, { width: centerHoleSize, height: centerHoleSize, borderRadius: centerHoleSize / 2 }]} />
        </View>
      </Animated.View>
      {/* 固定高光：不跟唱片转。唱片转、反光不动，才像一张真唱片 */}
      <View pointerEvents="none" style={[styles.sheenLayer, { width: recordSize, height: recordSize }]}>
        <View style={[styles.sheenWide, { width: recordSize * 0.24, height: recordSize * 0.84 }]} />
        <View style={[styles.sheenNarrow, { width: recordSize * 0.07, height: recordSize * 0.78 }]} />
      </View>

      <View style={[styles.armBaseOuter, {
        right: pivotRight - baseSize / 2,
        top: pivotTop - baseSize / 2,
        width: baseSize,
        height: baseSize,
        borderRadius: baseSize / 2,
        borderWidth: Math.max(4, Math.round(size * 0.02)),
      }]} />
      <View style={[styles.armBaseInner, {
        right: pivotRight - baseSize * 0.32,
        top: pivotTop - baseSize * 0.32,
        width: baseSize * 0.64,
        height: baseSize * 0.64,
        borderRadius: baseSize * 0.32,
      }]} />
      <Animated.View style={[styles.armPivot, {
        right: pivotRight - armLen,
        top: pivotTop - armLen,
        width: armLen * 2,
        height: armLen * 2,
        transform: [{ rotate: needleRotate }],
      }]}>
        <View style={[styles.toneArm, { right: armLen, top: armLen - armT / 2, width: armLen, height: armT, borderRadius: armT / 2 }]} />
        <View style={[styles.toneArmShine, {
          right: armLen + armLen * 0.08,
          top: armLen - armT / 2 + Math.max(1, armT * 0.22),
          width: armLen * 0.8,
          height: Math.max(1, Math.round(armT * 0.2)),
        }]} />
        <View style={[styles.headshell, {
          right: armLen * 2 - headLen,
          top: armLen - headH / 2,
          width: headLen,
          height: headH,
          borderRadius: headH * 0.32,
        }]} />
        <View style={[styles.stylus, {
          right: armLen * 2 - size * 0.012,
          top: armLen - size * 0.006,
          width: size * 0.024,
          height: Math.max(3, size * 0.012),
          borderRadius: 999,
        }]} />
      </Animated.View>
      <View style={[styles.pivotCap, {
        right: pivotRight - size * 0.022,
        top: pivotTop - size * 0.022,
        width: size * 0.044,
        height: size * 0.044,
        borderRadius: size * 0.022,
      }]} />
    </View>
  )
}

const styles: Record<string, ViewStyle> = {
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  redHalo: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(236,45,56,0.16)',
  },
  platter: {
    position: 'absolute',
    backgroundColor: '#151720',
    borderColor: '#20232d',
    shadowColor: '#000',
    shadowOpacity: 0.65,
    shadowRadius: 28,
    elevation: 18,
  },
  record: {
    backgroundColor: '#050508',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#101219',
    overflow: 'hidden',
  },
  groove: {
    position: 'absolute',
    borderWidth: 1,
  },
  spinMark: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  coverWrap: {
    overflow: 'hidden',
    backgroundColor: tvColors.bgWarm,
    borderColor: '#282a32',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  centerHole: {
    position: 'absolute',
    backgroundColor: '#030303',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.36)',
  },
  sheenLayer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheenWide: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.045)',
    transform: [{ rotate: '-30deg' }],
  },
  sheenNarrow: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.04)',
    transform: [{ rotate: '-30deg' }],
  },
  armBaseOuter: {
    position: 'absolute',
    backgroundColor: '#151822',
    borderColor: '#262936',
    shadowColor: tvColors.primaryHigh,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  armBaseInner: {
    position: 'absolute',
    backgroundColor: '#3c3f4b',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  // 边长 2*armLen，旋转原点在容器中心 = 唱臂支点
  armPivot: {
    position: 'absolute',
  },
  toneArm: {
    position: 'absolute',
    backgroundColor: '#f4eeee',
  },
  toneArmShine: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  headshell: {
    position: 'absolute',
    backgroundColor: tvColors.primaryHigh,
  },
  stylus: {
    position: 'absolute',
    backgroundColor: '#fef2f2',
  },
  pivotCap: {
    position: 'absolute',
    backgroundColor: '#dfe3ea',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
}

export default memo(TVVinylRecord)
