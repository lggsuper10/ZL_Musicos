import { memo, type PropsWithChildren } from 'react'
import { View, type ViewStyle } from 'react-native'
import TVText from './TVText'
import Focusable from './Focusable'
import { useTVFocusRef } from './useTVFocusRef'
import { tvColors, tvSize } from '@/theme/tv'

interface Props {
  progressPercent: number
  now: string
  total: string
  style?: ViewStyle | ViewStyle[]
  controlsStyle?: ViewStyle | ViewStyle[]
  // 聚焦进度条且正在 seek 时的预览态：覆盖进度条位置与左侧时间，传 null 表示未聚焦
  seekPreview?: { percent: number, time: string } | null
  onSeekFocusChange?: (focused: boolean) => void
}

const TVNowPlayingDock = ({ progressPercent, now, total, style, controlsStyle, seekPreview, onSeekFocusChange, children }: PropsWithChildren<Props>) => {
  const seekFocus = useTVFocusRef()
  const displayPercent = seekPreview ? seekPreview.percent : progressPercent
  const displayNow = seekPreview ? seekPreview.time : now
  return (
    <View style={[styles.root, style]}>
      <Focusable
        ref={seekFocus.ref as any}
        style={styles.seekBar}
        focusStyle={styles.seekBarFocus}
        onFocus={() => onSeekFocusChange?.(true)}
        onBlur={() => onSeekFocusChange?.(false)}
        nextFocusLeft={seekFocus.getNodeHandle() ?? undefined}
        nextFocusRight={seekFocus.getNodeHandle() ?? undefined}
      >
        <View style={styles.progressTrack}>
          <View style={[styles.progressBar, { width: `${Math.max(0, Math.min(displayPercent, 100))}%` }]} />
        </View>
        {seekPreview ? <View style={[styles.seekThumb, { left: `${Math.max(0, Math.min(displayPercent, 100))}%` }]} /> : null}
      </Focusable>
      <View style={styles.timeRow}>
        <TVText variant="caption">{displayNow}</TVText>
        <TVText variant="caption">{total}</TVText>
      </View>
      <View style={[styles.controls, controlsStyle]}>{children}</View>
    </View>
  )
}

const styles: Record<string, ViewStyle> = {
  root: {
    position: 'relative',
    paddingTop: 0,
  },
  seekBar: {
    position: 'relative',
    width: '100%',
    height: tvSize(22),
    justifyContent: 'center',
  },
  seekBarFocus: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 999,
  },
  progressTrack: {
    width: '100%',
    height: tvSize(4),
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: tvColors.text,
  },
  seekThumb: {
    position: 'absolute',
    top: '50%',
    width: tvSize(14),
    height: tvSize(14),
    borderRadius: 999,
    backgroundColor: tvColors.text,
    borderWidth: tvSize(3),
    borderColor: tvColors.bgDeep,
    transform: [{ translateX: -tvSize(7) }, { translateY: -tvSize(7) }],
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  timeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: tvSize(6),
    opacity: 0.70,
  },
  controls: {
    position: 'absolute',
    marginTop: tvSize(8),
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
  },
}

export default memo(TVNowPlayingDock)
