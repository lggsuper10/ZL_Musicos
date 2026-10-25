import { forwardRef, memo, type ComponentProps, type ReactNode } from 'react'
import { Text, type TextStyle, type ViewStyle } from 'react-native'
import Focusable from './Focusable'
import { Icon } from '@/components/common/Icon'
import { tvColors } from '@/theme/tv'

interface Props extends Omit<ComponentProps<typeof Focusable>, 'children'> {
  label: string
  iconName?: ComponentProps<typeof Icon>['name']
  /** 图标字体里没有的自绘图标（如图钉），优先于 iconName/label */
  iconNode?: ReactNode
  primary?: boolean
  size?: number
  style?: ViewStyle | ViewStyle[]
  textStyle?: TextStyle | TextStyle[]
  iconStyle?: TextStyle | TextStyle[]
}

const TVRoundControl = forwardRef<any, Props>(({ label, iconName, iconNode, primary, size = 64, style, textStyle, iconStyle, ...props }, ref) => (
  <Focusable
    ref={ref}
    style={[
      styles.root,
      { width: size, height: size, borderRadius: size / 2 },
      primary ? styles.primary : styles.normal,
      style,
    ]}
    focusStyle={primary ? styles.primaryFocus : styles.focus}
    {...props}
  >
    {iconNode ?? (iconName
      ? (
          <Icon
            name={iconName}
            rawSize={Math.round(size * (primary ? 0.42 : 0.46))}
            color={primary ? tvColors.bgDeep : tvColors.text}
            style={[styles.icon, { width: size, height: size, lineHeight: size }, iconStyle]}
          />
        )
      : (
          <Text
            style={[
              styles.text,
              {
                width: size,
                height: size,
                lineHeight: size,
                fontSize: Math.round(size * (primary ? 0.44 : 0.48)),
              },
              primary ? styles.primaryText : null,
              textStyle,
            ]}
            numberOfLines={1}
            allowFontScaling={false}
          >
            {label}
          </Text>
        ))}
  </Focusable>
))

const styles: Record<string, ViewStyle | TextStyle> = {
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  normal: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderColor: 'rgba(255,255,255,0.16)',
  },
  primary: {
    backgroundColor: tvColors.text,
    borderColor: tvColors.text,
  },
  focus: {
    backgroundColor: 'rgba(255,255,255,0.30)',
    borderColor: tvColors.focus,
    borderWidth: 3,
    shadowColor: tvColors.focus,
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 8,
  },
  primaryFocus: {
    backgroundColor: '#ffffff',
    borderColor: tvColors.focus,
    borderWidth: 3,
    shadowColor: tvColors.focus,
    shadowOpacity: 0.95,
    shadowRadius: 10,
    elevation: 8,
  },
  text: {
    color: tvColors.text,
    fontWeight: '900',
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  icon: {
    includeFontPadding: false,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  primaryText: {
    color: tvColors.bgDeep,
  },
}

export default memo(TVRoundControl)
