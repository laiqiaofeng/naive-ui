import {
  h,
  ref,
  computed,
  inject,
  defineComponent,
  PropType,
  renderSlot,
  CSSProperties,
  ButtonHTMLAttributes,
  watchEffect
} from 'vue'
import { useMemo } from 'vooks'
import { createHoverColor, createPressedColor } from '../../_utils/color/index'
import { useConfig, useFormItem, useTheme } from '../../_mixins'
import type { ThemeProps } from '../../_mixins'
import {
  NFadeInExpandTransition,
  NIconSwitchTransition,
  NBaseLoading,
  NBaseWave
} from '../../_internal'
import type { BaseWaveRef } from '../../_internal'
import { call, createKey, warnOnce } from '../../_utils'
import type { ExtractPublicPropTypes, MaybeArray } from '../../_utils'
import { buttonLight } from '../styles'
import type { ButtonTheme } from '../styles'
import { buttonGroupInjectionKey } from './ButtonGroup'
import type { Type, Size } from './interface'
import style from './styles/button.cssr'
import useRtl from '../../_mixins/use-rtl'
import { changeColor } from 'seemly'

const buttonProps = {
  ...(useTheme.props as ThemeProps<ButtonTheme>),
  color: String,
  textColor: String,
  text: Boolean,
  block: Boolean,
  loading: Boolean,
  disabled: Boolean,
  circle: Boolean,
  size: String as PropType<Size>,
  ghost: Boolean,
  round: Boolean,
  secondary: Boolean,
  tertiary: Boolean,
  quaternary: Boolean,
  strong: Boolean,
  focusable: {
    type: Boolean,
    default: true
  },
  keyboard: {
    type: Boolean,
    default: true
  },
  tag: {
    type: String as PropType<keyof HTMLElementTagNameMap>,
    default: 'button'
  },
  type: {
    type: String as PropType<Type>,
    default: 'default'
  },
  dashed: Boolean,
  iconPlacement: {
    type: String as PropType<'left' | 'right'>,
    default: 'left'
  },
  attrType: {
    type: String as PropType<'button' | 'submit' | 'reset'>,
    default: 'button'
  },
  onClick: [Function, Array] as PropType<MaybeArray<(e: MouseEvent) => void>>,
  bordered: {
    type: Boolean,
    default: true
  }
} as const

export type ButtonProps = ExtractPublicPropTypes<typeof buttonProps>

const Button = defineComponent({
  name: 'Button',
  props: buttonProps,
  setup (props) {
    if (__DEV__) {
      watchEffect(() => {
        const { dashed, ghost, text, secondary, tertiary, quaternary } = props
        if (
          (dashed || ghost || text) &&
          (secondary || tertiary || quaternary)
        ) {
          warnOnce(
            'button',
            "`dashed`, `ghost` and `text` props can't be used along with `secondary`, `tertiary` and `quaterary` props."
          )
        }
      })
    }
    const selfRef = ref<HTMLElement | null>(null)
    const waveRef = ref<BaseWaveRef | null>(null)
    const enterPressedRef = ref(false)
    const showBorderRef = useMemo(() => {
      return (
        !props.quaternary &&
        !props.tertiary &&
        !props.secondary &&
        !props.text &&
        (!props.color || props.ghost || props.dashed) &&
        props.bordered
      )
    })
    const NButtonGroup = inject(buttonGroupInjectionKey, {})
    const { mergedSizeRef } = useFormItem(
      {},
      {
        defaultSize: 'medium',
        mergedSize: (NFormItem) => {
          const { size } = props
          if (size) return size
          const { size: buttonGroupSize } = NButtonGroup
          if (buttonGroupSize) return buttonGroupSize
          const { mergedSize: formItemSize } = NFormItem || {}
          if (formItemSize) {
            return formItemSize.value
          }
          return 'medium'
        }
      }
    )
    const mergedFocusableRef = computed(() => {
      return props.focusable && !props.disabled
    })
    const handleMousedown = (e: MouseEvent): void => {
      e.preventDefault()
      if (props.disabled) {
        return
      }
      if (mergedFocusableRef.value) {
        selfRef.value?.focus({ preventScroll: true })
      }
    }
    const handleClick = (e: MouseEvent): void => {
      if (!props.disabled && !props.loading) {
        const { onClick } = props
        if (onClick) call(onClick, e)
        if (!props.text) {
          const { value } = waveRef
          if (value) {
            value.play()
          }
        }
      }
    }
    const handleKeyup = (e: KeyboardEvent): void => {
      switch (e.code) {
        case 'Enter':
        case 'NumpadEnter':
          if (!props.keyboard) {
            return
          }
          enterPressedRef.value = false
      }
    }
    const handleKeydown = (e: KeyboardEvent): void => {
      switch (e.code) {
        case 'Enter':
        case 'NumpadEnter':
          if (!props.keyboard) {
            e.preventDefault()
            return
          }
          enterPressedRef.value = true
      }
    }
    const handleBlur = (): void => {
      enterPressedRef.value = false
    }
    const { mergedClsPrefixRef, NConfigProvider } = useConfig(props)
    const themeRef = useTheme(
      'Button',
      'Button',
      style,
      buttonLight,
      props,
      mergedClsPrefixRef
    )
    const rtlEnabledRef = useRtl(
      'Button',
      NConfigProvider?.mergedRtlRef,
      mergedClsPrefixRef
    )
    return {
      selfRef,
      waveRef,
      mergedClsPrefix: mergedClsPrefixRef,
      mergedFocusable: mergedFocusableRef,
      mergedSize: mergedSizeRef,
      showBorder: showBorderRef,
      enterPressed: enterPressedRef,
      rtlEnabled: rtlEnabledRef,
      handleMousedown,
      handleKeydown,
      handleBlur,
      handleKeyup,
      handleClick,
      customColorCssVars: computed(() => {
        const { color } = props
        if (!color) return null
        const hoverColor = createHoverColor(color)
        return {
          '--n-border-color': color,
          '--n-border-color-hover': hoverColor,
          '--n-border-color-pressed': createPressedColor(color),
          '--n-border-color-focus': hoverColor,
          '--n-border-color-disabled': color
        }
      }),
      cssVars: computed(() => {
        const theme = themeRef.value
        const {
          common: { cubicBezierEaseInOut, cubicBezierEaseOut },
          self
        } = theme
        const {
          rippleDuration,
          opacityDisabled,
          fontWeight,
          fontWeightStrong
        } = self
        const size = mergedSizeRef.value
        const {
          dashed,
          type,
          ghost,
          text,
          color,
          round,
          circle,
          textColor,
          secondary,
          tertiary,
          quaternary,
          strong
        } = props
        // font
        const fontProps = {
          fontWeight: strong ? fontWeightStrong : fontWeight
        }
        // color
        let colorProps = {
          '--n-color': 'initial',
          '--n-color-hover': 'initial',
          '--n-color-pressed': 'initial',
          '--n-color-focus': 'initial',
          '--n-color-disabled': 'initial',
          '--n-ripple-color': 'initial',
          '--n-text-color': 'initial',
          '--n-text-color-hover': 'initial',
          '--n-text-color-pressed': 'initial',
          '--n-text-color-focus': 'initial',
          '--n-text-color-disabled': 'initial'
        }
        const typeIsTertiary = type === 'tertiary'
        const typeIsDefault = type === 'default'
        const mergedType = typeIsTertiary ? 'default' : type
        if (text) {
          const propTextColor = textColor || color
          const mergedTextColor =
            propTextColor || self[createKey('textColorText', mergedType)]
          colorProps = {
            '--n-color': '#0000',
            '--n-color-hover': '#0000',
            '--n-color-pressed': '#0000',
            '--n-color-focus': '#0000',
            '--n-color-disabled': '#0000',
            '--n-ripple-color': '#0000',
            '--n-text-color': mergedTextColor,
            '--n-text-color-hover': propTextColor
              ? createHoverColor(propTextColor)
              : self[createKey('textColorTextHover', mergedType)],
            '--n-text-color-pressed': propTextColor
              ? createPressedColor(propTextColor)
              : self[createKey('textColorTextPressed', mergedType)],
            '--n-text-color-focus': propTextColor
              ? createHoverColor(propTextColor)
              : self[createKey('textColorTextHover', mergedType)],
            '--n-text-color-disabled':
              propTextColor ||
              self[createKey('textColorTextDisabled', mergedType)]
          }
        } else if (ghost || dashed) {
          const mergedTextColor = textColor || color
          colorProps = {
            '--n-color': '#0000',
            '--n-color-hover': '#0000',
            '--n-color-pressed': '#0000',
            '--n-color-focus': '#0000',
            '--n-color-disabled': '#0000',
            '--n-ripple-color':
              color || self[createKey('rippleColor', mergedType)],
            '--n-text-color':
              mergedTextColor || self[createKey('textColorGhost', mergedType)],
            '--n-text-color-hover': mergedTextColor
              ? createHoverColor(mergedTextColor)
              : self[createKey('textColorGhostHover', mergedType)],
            '--n-text-color-pressed': mergedTextColor
              ? createPressedColor(mergedTextColor)
              : self[createKey('textColorGhostPressed', mergedType)],
            '--n-text-color-focus': mergedTextColor
              ? createHoverColor(mergedTextColor)
              : self[createKey('textColorGhostHover', mergedType)],
            '--n-text-color-disabled':
              mergedTextColor ||
              self[createKey('textColorGhostDisabled', mergedType)]
          }
        } else if (secondary) {
          const typeTextColor = typeIsDefault
            ? self.textColor
            : typeIsTertiary
              ? self.textColorTertiary
              : self[createKey('color', mergedType)]
          const mergedTextColor = color || typeTextColor
          const isColoredType = type !== 'default' && type !== 'tertiary'
          colorProps = {
            '--n-color': isColoredType
              ? changeColor(mergedTextColor, {
                alpha: Number(self.colorOpacitySecondary)
              })
              : self.colorSecondary,
            '--n-color-hover': isColoredType
              ? changeColor(mergedTextColor, {
                alpha: Number(self.colorOpacitySecondaryHover)
              })
              : self.colorSecondaryHover,
            '--n-color-pressed': isColoredType
              ? changeColor(mergedTextColor, {
                alpha: Number(self.colorOpacitySecondaryPressed)
              })
              : self.colorSecondaryPressed,
            '--n-color-focus': isColoredType
              ? changeColor(mergedTextColor, {
                alpha: Number(self.colorOpacitySecondaryHover)
              })
              : self.colorSecondaryHover,
            '--n-color-disabled': self.colorSecondary,
            '--n-ripple-color': '#0000',
            '--n-text-color': mergedTextColor,
            '--n-text-color-hover': mergedTextColor,
            '--n-text-color-pressed': mergedTextColor,
            '--n-text-color-focus': mergedTextColor,
            '--n-text-color-disabled': mergedTextColor
          }
        } else if (tertiary || quaternary) {
          const typeColor = typeIsDefault
            ? self.textColor
            : typeIsTertiary
              ? self.textColorTertiary
              : self[createKey('color', mergedType)]
          const mergedColor = color || typeColor
          if (tertiary) {
            colorProps['--n-color'] = self.colorTertiary
            colorProps['--n-color-hover'] = self.colorTertiaryHover
            colorProps['--n-color-pressed'] = self.colorTertiaryPressed
            colorProps['--n-color-focus'] = self.colorSecondaryHover
            colorProps['--n-color-disabled'] = self.colorTertiary
          } else {
            colorProps['--n-color'] = self.colorQuaternary
            colorProps['--n-color-hover'] = self.colorQuaternaryHover
            colorProps['--n-color-pressed'] = self.colorQuaternaryPressed
            colorProps['--n-color-focus'] = self.colorQuaternaryHover
            colorProps['--n-color-disabled'] = self.colorQuaternary
          }
          colorProps['--n-ripple-color'] = '#0000'
          colorProps['--n-text-color'] = mergedColor
          colorProps['--n-text-color-hover'] = mergedColor
          colorProps['--n-text-color-pressed'] = mergedColor
          colorProps['--n-text-color-focus'] = mergedColor
          colorProps['--n-text-color-disabled'] = mergedColor
        } else {
          colorProps = {
            '--n-color': color || self[createKey('color', mergedType)],
            '--n-color-hover': color
              ? createHoverColor(color)
              : self[createKey('colorHover', mergedType)],
            '--n-color-pressed': color
              ? createPressedColor(color)
              : self[createKey('colorPressed', mergedType)],
            '--n-color-focus': color
              ? createHoverColor(color)
              : self[createKey('colorFocus', mergedType)],
            '--n-color-disabled':
              color || self[createKey('colorDisabled', mergedType)],
            '--n-ripple-color':
              color || self[createKey('rippleColor', mergedType)],
            '--n-text-color':
              textColor ||
              (color
                ? self.textColorPrimary
                : typeIsTertiary
                  ? self.textColorTertiary
                  : self[createKey('textColor', mergedType)]),
            '--n-text-color-hover':
              textColor ||
              (color
                ? self.textColorHoverPrimary
                : self[createKey('textColorHover', mergedType)]),
            '--n-text-color-pressed':
              textColor ||
              (color
                ? self.textColorPressedPrimary
                : self[createKey('textColorPressed', mergedType)]),
            '--n-text-color-focus':
              textColor ||
              (color
                ? self.textColorFocusPrimary
                : self[createKey('textColorFocus', mergedType)]),
            '--n-text-color-disabled':
              textColor ||
              (color
                ? self.textColorDisabledPrimary
                : self[createKey('textColorDisabled', mergedType)])
          }
        }
        // border
        let borderProps = {
          '--n-border': 'initial',
          '--n-border-hover': 'initial',
          '--n-border-pressed': 'initial',
          '--n-border-focus': 'initial',
          '--n-border-disabled': 'initial'
        }
        if (text) {
          borderProps = {
            '--n-border': 'none',
            '--n-border-hover': 'none',
            '--n-border-pressed': 'none',
            '--n-border-focus': 'none',
            '--n-border-disabled': 'none'
          }
        } else {
          borderProps = {
            '--n-border': self[createKey('border', mergedType)],
            '--n-border-hover': self[createKey('borderHover', mergedType)],
            '--n-border-pressed': self[createKey('borderPressed', mergedType)],
            '--n-border-focus': self[createKey('borderFocus', mergedType)],
            '--n-border-disabled': self[createKey('borderDisabled', mergedType)]
          }
        }
        // size
        const {
          [createKey('height', size)]: height,
          [createKey('fontSize', size)]: fontSize,
          [createKey('padding', size)]: padding,
          [createKey('paddingRound', size)]: paddingRound,
          [createKey('iconSize', size)]: iconSize,
          [createKey('borderRadius', size)]: borderRadius,
          [createKey('iconMargin', size)]: iconMargin,
          waveOpacity
        } = self
        const sizeProps = {
          '--n-width': circle && !text ? height : 'initial',
          '--n-height': text ? 'initial' : height,
          '--n-font-size': fontSize,
          '--n-padding': circle
            ? 'initial'
            : text
              ? 'initial'
              : round
                ? paddingRound
                : padding,
          '--n-icon-size': iconSize,
          '--n-icon-margin': iconMargin,
          '--n-border-radius': text
            ? 'initial'
            : circle || round
              ? height
              : borderRadius
        }
        return {
          '--n-bezier': cubicBezierEaseInOut,
          '--n-bezier-ease-out': cubicBezierEaseOut,
          '--n-ripple-duration': rippleDuration,
          '--n-opacity-disabled': opacityDisabled,
          '--n-wave-opacity': waveOpacity,
          ...fontProps,
          ...colorProps,
          ...borderProps,
          ...sizeProps
        }
      })
    }
  },
  render () {
    const { $slots, mergedClsPrefix, tag: Component } = this
    return (
      <Component
        ref="selfRef"
        class={[
          `${mergedClsPrefix}-button`,
          `${mergedClsPrefix}-button--${this.type}-type`,
          `${mergedClsPrefix}-button--${this.mergedSize}-type`,
          this.rtlEnabled && `${mergedClsPrefix}-button--rtl`,
          this.disabled && `${mergedClsPrefix}-button--disabled`,
          this.block && `${mergedClsPrefix}-button--block`,
          this.enterPressed && `${mergedClsPrefix}-button--pressed`,
          !this.text && this.dashed && `${mergedClsPrefix}-button--dashed`,
          this.color && `${mergedClsPrefix}-button--color`,
          this.secondary && `${mergedClsPrefix}-button--secondary`,
          this.loading && `${mergedClsPrefix}-button--loading`,
          this.ghost && `${mergedClsPrefix}-button--ghost` // required for button group border collapse
        ]}
        tabindex={this.mergedFocusable ? 0 : -1}
        type={this.attrType}
        style={this.cssVars as CSSProperties}
        disabled={this.disabled}
        onClick={this.handleClick}
        onBlur={this.handleBlur}
        onMousedown={this.handleMousedown}
        onKeyup={this.handleKeyup}
        onKeydown={this.handleKeydown}
      >
        {$slots.default && this.iconPlacement === 'right' ? (
          <span class={`${mergedClsPrefix}-button__content`}>{$slots}</span>
        ) : null}
        <NFadeInExpandTransition width>
          {{
            default: () =>
              $slots.icon || this.loading ? (
                <span
                  class={`${mergedClsPrefix}-button__icon`}
                  style={{
                    margin: !$slots.default ? 0 : ''
                  }}
                >
                  <NIconSwitchTransition>
                    {{
                      default: () =>
                        this.loading ? (
                          <NBaseLoading
                            clsPrefix={mergedClsPrefix}
                            key="loading"
                            class={`${mergedClsPrefix}-icon-slot`}
                            strokeWidth={20}
                          />
                        ) : (
                          <div
                            key="icon"
                            class={`${mergedClsPrefix}-icon-slot`}
                            role="none"
                          >
                            {renderSlot($slots, 'icon')}
                          </div>
                        )
                    }}
                  </NIconSwitchTransition>
                </span>
              ) : null
          }}
        </NFadeInExpandTransition>
        {$slots.default && this.iconPlacement === 'left' ? (
          <span class={`${mergedClsPrefix}-button__content`}>{$slots}</span>
        ) : null}
        {!this.text ? (
          <NBaseWave ref="waveRef" clsPrefix={mergedClsPrefix} />
        ) : null}
        {this.showBorder ? (
          <div
            aria-hidden
            class={`${mergedClsPrefix}-button__border`}
            style={this.customColorCssVars as CSSProperties}
          />
        ) : null}
        {this.showBorder ? (
          <div
            aria-hidden
            class={`${mergedClsPrefix}-button__state-border`}
            style={this.customColorCssVars as CSSProperties}
          />
        ) : null}
      </Component>
    )
  }
})

type NativeButtonProps = Omit<ButtonHTMLAttributes, keyof ButtonProps>
type MergedProps = Partial<ButtonProps & NativeButtonProps>

export default Button

// XButton is for tsx type checking
// It's not compitable with render function `h`
// Currently we don't expose it as public
// If there's any issue about this, we may expose it
// Since most people use template, the type checking phase doesn't work as tsx
export const XButton: new () => { $props: MergedProps } = Button as any

// Also, we may make XButton a generic type which support `tag` prop
// but currently vue doesn't export IntrinsicElementAttributes from runtime-dom
// so we can't easily make an attr map by hand
// just leave it for later
