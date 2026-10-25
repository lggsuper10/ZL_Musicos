import { forwardRef, memo, useCallback, useEffect, useRef, useState, type ComponentProps } from 'react'
import { View, type ImageStyle, type ViewStyle } from 'react-native'
import Image from '@/components/common/Image'
import { getPicUrl } from '@/core/music/online'
import { tvColors, tvSize, tvTokens } from '@/theme/tv'
import Focusable from './Focusable'
import TVText from './TVText'

interface Props extends Omit<ComponentProps<typeof Focusable>, 'children'> {
  index?: number
  title: string
  subtitle?: string
  meta?: string
  badge?: string
  image?: string | null
  active?: boolean
  lazyMusicInfo?: LX.Music.MusicInfoOnline | null
  style?: ViewStyle | ViewStyle[]
  /**
   * 行内几何与字号等比缩放系数（默认 1）。
   * 桌面/短屏上首页会把 hero + 歌单架按可用高度等比缩小，播放列表页传同一个系数，
   * 两个页面的字号和行高比例才会一致。
   */
  scale?: number
}

const TVMusicRow = forwardRef<any, Props>(({
  index,
  title,
  subtitle,
  meta,
  badge,
  image,
  active,
  lazyMusicInfo,
  style,
  scale = 1,
  ...props
}, ref) => {
  const showArt = image !== undefined || lazyMusicInfo !== undefined
  const z = (value: number) => Math.max(1, Math.round(value * scale))
  const [resolvedImage, setResolvedImage] = useState<string | null>(image ?? null)
  const loadedRef = useRef(false)

  useEffect(() => { setResolvedImage(image ?? null) }, [image])

  const handleRowFocus = useCallback((event: Parameters<NonNullable<ComponentProps<typeof Focusable>['onFocus']>>[0]) => {
    if (!loadedRef.current && lazyMusicInfo && !resolvedImage) {
      loadedRef.current = true
      void getPicUrl({ musicInfo: lazyMusicInfo, isRefresh: false, allowToggleSource: false }).then((url) => {
        if (url) setResolvedImage(url)
      }).catch(() => {})
    }
    const onFocus = props.onFocus as ((e: typeof event) => void) | undefined
    onFocus?.(event)
  }, [lazyMusicInfo, resolvedImage, props])

  return (
    <Focusable
      ref={ref}
      style={[
        styles.root,
        {
          minHeight: z(tvSize(72)),
          borderRadius: z(tvSize(18)),
          paddingHorizontal: z(tvSize(18)),
          paddingVertical: z(tvSize(11)),
          // 边框参与布局高度，必须跟缩放进退，否则列表按公式算出的行高会和实际差几像素
          borderWidth: Math.max(1, Math.round(2 * scale)),
        },
        active ? styles.active : null,
        style,
      ]}
      focusStyle={styles.focus}
      {...props}
      onFocus={handleRowFocus}
    >
      <View style={[styles.indexBox, { width: z(tvSize(50)) }]}>
        <TVText variant="body" color={active ? tvColors.primaryHigh : tvColors.dimText} style={{ fontSize: z(tvTokens.body) }}>
          {typeof index === 'number' ? String(index + 1).padStart(2, '0') : '\u266b'}
        </TVText>
      </View>
      {showArt ? (
        <View style={[styles.art, { width: z(tvSize(58)), height: z(tvSize(58)), borderRadius: z(tvSize(14)), marginRight: z(tvSize(16)) }]}>
          {resolvedImage ? <Image url={resolvedImage} resizeMode="cover" style={styles.artImage as ImageStyle} /> : <TVText variant="body" style={[styles.artPlaceholder, { fontSize: z(tvTokens.body) }]}>{title.slice(0, 1)}</TVText>}
        </View>
      ) : null}
      <View style={styles.info}>
        <TVText variant="cardTitle" numberOfLines={1} style={{ fontSize: z(tvTokens.cardTitle) }}>{title}</TVText>
        {subtitle ? <TVText variant="caption" style={[styles.subtitle, { fontSize: z(tvTokens.caption), marginTop: z(tvSize(6)) }]} numberOfLines={1}>{subtitle}</TVText> : null}
      </View>
      <View style={[styles.meta, { minWidth: z(tvSize(86)) }]}>
        {badge ? <TVText variant="caption" color={tvColors.primaryHigh} numberOfLines={1} style={{ fontSize: z(tvTokens.caption) }}>{badge}</TVText> : null}
        {meta ? <TVText variant="caption" style={[styles.metaText, { fontSize: z(tvTokens.caption) }]} numberOfLines={1}>{meta}</TVText> : null}
      </View>
    </Focusable>
  )
})

const styles: Record<string, ViewStyle | any> = {
  root: {
    minHeight: tvSize(72),
    borderRadius: tvSize(18),
    paddingHorizontal: tvSize(18),
    paddingVertical: tvSize(11),
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    width: '100%',
    backgroundColor: 'rgba(20,24,36,0.55)',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  focus: {
    backgroundColor: tvColors.glassHigh,
    borderColor: tvColors.focus,
    shadowColor: tvColors.focus,
    shadowOpacity: 0.4,
    shadowRadius: tvSize(12),
    shadowOffset: { width: 0, height: tvSize(3) },
    elevation: 8,
  },
  active: {
    backgroundColor: tvColors.surfaceRed,
  },
  indexBox: {
    width: tvSize(50),
  },
  art: {
    width: tvSize(58),
    height: tvSize(58),
    borderRadius: tvSize(14),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: tvSize(16),
    backgroundColor: tvColors.surfaceWarm,
    borderWidth: 1,
    borderColor: tvColors.line,
  },
  artImage: {
    width: '100%',
    height: '100%',
  },
  artPlaceholder: {
    color: tvColors.primaryHigh,
    fontWeight: '900',
  },
  info: {
    flex: 1,
    minWidth: 0,
    paddingRight: tvSize(12),
  },
  subtitle: {
    marginTop: tvSize(6),
  },
  meta: {
    minWidth: tvSize(86),
    alignItems: 'flex-end',
  },
  metaText: {
    marginTop: tvSize(4),
  },
}

export default memo(TVMusicRow)
