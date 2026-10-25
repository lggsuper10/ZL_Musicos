import { memo, useEffect, useRef } from 'react'
import { Animated, Easing, View, type ImageStyle, type ViewStyle } from 'react-native'
import Image from '@/components/common/Image'
import { tvColors } from '@/theme/tv'
import TVText from './TVText'

interface Props {
  image?: string | number | null
  isPlaying: boolean
  size?: number
  onCoverError?: (url: string | number) => void
  style?: ViewStyle | ViewStyle[]
}

// 33⅓ 转/分（黑胶唱片标准转速）。原实现 18s 才转一圈，大约是 3.3 转/分，
// 在电视上几乎看不出在转，这也是「黑胶出来了但动画不对」的主因。
const SPIN_PERIOD = 1800
// 起转 / 刹车时长。用二次缓动：加速段结束时、减速段刚开始时的角速度
// 都恰好等于匀速段的角速度，因此换挡处不会有「一顿」。
const SPIN_RAMP = 900
const RAMP_TURNS = SPIN_RAMP / (2 * SPIN_PERIOD)

// 唱臂绕右上角支点摆动：播放时压进唱片，暂停时摆回唱片右侧（抬起）
const PLAY_ANGLE = '-74deg'
const REST_ANGLE = '-96deg'

// 唱片纹理，圆心对称，随唱片一起转也看不出方向，只负责质感
const GROOVE_SCALES = [0.88, 0.82, 0.76, 0.7, 0.64, 0.58, 0.52, 0.46]

const TVVinylRecord = ({ image, isPlaying, size = 392, onCoverError, style }: Props) => {
  const spinValue = useRef(new Animated.Value(0)).current
  // 累计圈数（不是 0~1 循环）。用 stopAnimation 同步到当前值后从该角度继续，
  // 暂停/继续时唱片不会跳角度。
  const spinPosRef = useRef(0)
  const spinAnimRef = useRef<Animated.CompositeAnimation | null>(null)
  // 每次重新起停都换一个令牌：已被停掉的旧动画即使回调晚到（finished 为 true）
  // 也不能再接着串下一圈，否则会和新的动画叠成双倍转速
  const spinTokenRef = useRef(0)
  const playingRef = useRef(isPlaying)
  const wasPlayingRef = useRef(isPlaying)
  const aliveRef = useRef(true)
  const needleValue = useRef(new Animated.Value(isPlaying ? 1 : 0)).current

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      spinAnimRef.current?.stop()
    }
  }, [])

  useEffect(() => {
    playingRef.current = isPlaying
    const wasPlaying = wasPlayingRef.current
    wasPlayingRef.current = isPlaying
    const token = ++spinTokenRef.current
    const isStale = () => spinTokenRef.current !== token

    const runConstant = () => {
      if (!aliveRef.current || !playingRef.current || isStale()) return
      const to = spinPosRef.current + 1
      spinPosRef.current = to
      const anim = Animated.timing(spinValue, {
        toValue: to,
        duration: SPIN_PERIOD,
        easing: Easing.linear,
        useNativeDriver: true,
        isInteraction: false,
      })
      spinAnimRef.current = anim
      anim.start(({ finished }) => {
        if (finished && !isStale()) runConstant()
      })
    }

    // stopAnimation 会把原生驱动中的当前角度同步回来，以它为准继续/刹车
    spinValue.stopAnimation(value => {
      if (!aliveRef.current || isStale()) return
      if (playingRef.current) {
        const to = value + RAMP_TURNS
        spinPosRef.current = to
        const anim = Animated.timing(spinValue, {
          toValue: to,
          duration: SPIN_RAMP,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        })
        spinAnimRef.current = anim
        anim.start(({ finished }) => {
          if (finished && !isStale()) runConstant()
        })
      } else if (wasPlaying) {
        // 第一次挂载且本来就没在播时不要刹车，否则唱片会自己转小半圈
        const to = value + RAMP_TURNS
        spinPosRef.current = to
        const anim = Animated.timing(spinValue, {
          toValue: to,
          duration: SPIN_RAMP,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
          isInteraction: false,
        })
        spinAnimRef.current = anim
        anim.start()
      } else {
        spinPosRef.current = value
      }
    })

    return () => {
      spinTokenRef.current += 1
      spinAnimRef.current?.stop()
    }
  }, [isPlaying, spinValue])

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
  // 唱臂：零尺寸的旋转容器放在支点上，唱臂从支点向左伸出，
  // 这样旋转原点就是支点本身（原来绕臂中心转，臂根会甩离底座）
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
        <View style={[styles.coverWrap, { width: coverSize, height: coverSize, borderRadius: coverSize / 2, borderWidth: coverBorder }]}>
          {image ? (
            <Image url={image} style={styles.coverImage as ImageStyle} onError={onCoverError} />
          ) : (
            <TVText variant="cardTitle" color={tvColors.primaryHigh}>音乐</TVText>
          )}
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
          right: armLen * 2 - headLen * 0.72,
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
  // 宽高为 0，旋转原点即支点；唱臂用 right:0 从支点向左伸出
  armPivot: {
    position: 'absolute',
    width: 0,
    height: 0,
  },
  toneArm: {
    position: 'absolute',
    right: 0,
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
