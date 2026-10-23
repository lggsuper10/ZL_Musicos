import { memo, type PropsWithChildren } from 'react'
import { ScrollView, View, type TextStyle, type ViewStyle } from 'react-native'
import TVText from './TVText'
import { tvColors, tvSize, tvTokens } from '@/theme/tv'

interface Props {
  title: string
  subtitle?: string
  horizontal?: boolean
  style?: ViewStyle | ViewStyle[]
  contentStyle?: ViewStyle | ViewStyle[]
  /** 整架等比缩放系数（标题、间距），配合 TVPosterCard 的 scale 一起用 */
  scale?: number
}

const TVShelf = ({ title, subtitle, horizontal = true, style, contentStyle, scale = 1, children }: PropsWithChildren<Props>) => {
  const z = (value: number) => Math.max(1, Math.round(value * scale))
  return (
    <View style={[styles.root, { marginTop: z(tvSize(28)) }, style]}>
      <View style={[styles.header, { marginBottom: z(tvSize(14)) }]}>
        <TVText variant="sectionTitle" style={{ fontSize: z(tvTokens.railTitle) }}>{title}</TVText>
        {subtitle ? <TVText variant="caption" style={[styles.subtitle, { fontSize: z(tvTokens.caption) }]}>{subtitle}</TVText> : null}
      </View>
      {horizontal ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { gap: z(tvSize(18)), paddingRight: z(tvSize(48)), paddingBottom: z(tvSize(10)) }, contentStyle]}>
          {children}
        </ScrollView>
      ) : (
        <View style={contentStyle}>{children}</View>
      )}
    </View>
  )
}

const styles: Record<string, ViewStyle | TextStyle> = {
  root: {},
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  subtitle: {
    color: tvColors.dimText,
  },
  row: {},
}

export default memo(TVShelf)
