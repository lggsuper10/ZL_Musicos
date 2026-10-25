import { memo, type PropsWithChildren, type ReactNode } from 'react'
import { View, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native'
import Image from '@/components/common/Image'
import TVText from './TVText'
import { tvColors, tvFont, tvSize, tvTokens } from '@/theme/tv'

interface Props {
  kicker?: string
  title: string
  subtitle?: string
  image?: string | null
  /** 副标题前的内联元素（如「正在播放」跳动条），与文本同一行 */
  leadingIndicator?: ReactNode
  style?: ViewStyle | ViewStyle[]
  /**
   * Hero 整体等比缩放系数（标题、副标题、封面、按钮间距一起缩）。
   * 首页按实测视口高度算出系数传进来，保证 hero + 歌单架一屏放得下。
   */
  scale?: number
}

const TVHeroShelf = ({ kicker, title, subtitle, image, style, scale = 1, leadingIndicator, children }: PropsWithChildren<Props>) => {
  const z = (value: number) => Math.max(1, Math.round(value * scale))
  return (
    <View style={[styles.root, { minHeight: z(tvSize(300)) }, style]}>
      <View style={[styles.copy, { paddingRight: z(tvSize(44)) }]}>
        {kicker ? <TVText variant="caption" style={[styles.kicker, { fontSize: z(tvTokens.caption) }]}>{kicker}</TVText> : null}
        <TVText variant="pageTitle" style={[styles.title, { marginTop: z(tvSize(10)), fontSize: z(tvFont(56)), lineHeight: z(tvFont(66)) }]} numberOfLines={2}>{title}</TVText>
        {subtitle ? (
          <View style={[styles.subtitleRow, { marginTop: z(tvSize(12)) }]}>
            {leadingIndicator}
            <TVText variant="body" style={[styles.subtitle, { fontSize: z(tvFont(19)), lineHeight: z(tvFont(29)) }]} numberOfLines={2}>{subtitle}</TVText>
          </View>
        ) : null}
        <View style={[styles.actions, { gap: z(tvSize(14)), marginTop: z(tvSize(28)) }]}>{children}</View>
      </View>
      <View style={[styles.coverWrap, { width: z(tvSize(276)), height: z(tvSize(276)), borderRadius: z(tvSize(36)) }]}>
        {image ? <Image url={image} resizeMode="cover" style={styles.cover as ImageStyle} /> : <TVText variant="pageTitle" style={[styles.placeholder, { fontSize: z(tvFont(110)) }]}>?</TVText>}
      </View>
    </View>
  )
}

const styles: Record<string, ViewStyle | TextStyle | ImageStyle> = {
  root: {
    flexDirection: 'row',
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
  },
  kicker: {
    color: tvColors.primaryHigh,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    marginTop: tvSize(10),
    fontSize: tvTokens.heroTitle,
    lineHeight: tvFont(66),
  },
  subtitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tvSize(10),
  },
  subtitle: {
    color: tvColors.subtext,
    lineHeight: tvFont(29),
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tvSize(14),
    marginTop: tvSize(28),
  },
  coverWrap: {
    width: tvSize(276),
    height: tvSize(276),
    borderRadius: tvSize(36),
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(145,164,196,0.18)',
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: tvSize(28),
    shadowOffset: { width: 0, height: tvSize(14) },
    elevation: 14,
  },
  cover: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    fontSize: tvFont(110),
  },
}

export default memo(TVHeroShelf)
