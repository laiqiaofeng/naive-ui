import {
  h,
  defineComponent,
  computed,
  provide,
  PropType,
  ref,
  watch,
  toRef,
  CSSProperties,
  isReactive,
  watchEffect
} from 'vue'
import { createTreeMate, SubtreeNotLoadedError, CheckStrategy } from 'treemate'
import {
  VBinder,
  VTarget,
  VFollower,
  FollowerPlacement,
  FollowerInst
} from 'vueuc'
import { depx, changeColor, happensIn } from 'seemly'
import { useIsMounted, useMergedState } from 'vooks'
import { SelectBaseOption } from '../../select/src/interface'
import { NInternalSelection, InternalSelectionInst } from '../../_internal'
import { useLocale, useTheme, useConfig, useFormItem } from '../../_mixins'
import type { ThemeProps } from '../../_mixins'
import { call, useAdjustedTo, warnOnce } from '../../_utils'
import type { ExtractPublicPropTypes, MaybeArray } from '../../_utils'
import { cascaderLight } from '../styles'
import type { CascaderTheme } from '../styles'
import { getPathLabel, getRawNodePath } from './utils'
import CascaderMenu from './CascaderMenu'
import CascaderSelectMenu from './CascaderSelectMenu'
import {
  CascaderOption,
  cascaderInjectionKey,
  CascaderMenuInstance,
  ExpandTrigger,
  Filter,
  Key,
  OnLoad,
  OnUpdateValue,
  OnUpdateValueImpl,
  SelectMenuInstance,
  Value
} from './interface'
import style from './styles/index.cssr'

const cascaderProps = {
  ...(useTheme.props as ThemeProps<CascaderTheme>),
  to: useAdjustedTo.propTo,
  bordered: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined
  },
  options: {
    type: Array as PropType<CascaderOption[]>,
    default: () => []
  },
  value: [String, Number, Array] as PropType<Value | null>,
  defaultValue: {
    type: [String, Number, Array] as PropType<Value | null>,
    default: null
  },
  placeholder: String,
  multiple: Boolean,
  size: String as PropType<'small' | 'medium' | 'large'>,
  filterable: Boolean,
  disabled: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined
  },
  expandTrigger: {
    type: String as PropType<ExpandTrigger>,
    default: 'click'
  },
  clearable: Boolean,
  remote: Boolean,
  onLoad: Function as PropType<OnLoad>,
  separator: {
    type: String,
    default: ' / '
  },
  filter: Function as PropType<Filter>,
  placement: {
    type: String as PropType<FollowerPlacement>,
    default: 'bottom-start'
  },
  cascade: {
    type: Boolean,
    default: true
  },
  leafOnly: Boolean,
  showPath: {
    type: Boolean,
    default: true
  },
  show: {
    type: Boolean as PropType<boolean | undefined>,
    default: undefined
  },
  maxTagCount: [String, Number] as PropType<number | 'responsive'>,
  virtualScroll: {
    type: Boolean,
    default: true
  },
  checkStrategy: {
    type: String as PropType<CheckStrategy>,
    default: 'all'
  },
  valueField: {
    type: String,
    default: 'value'
  },
  labelField: {
    type: String,
    default: 'label'
  },
  childrenField: {
    type: String,
    default: 'children'
  },
  'onUpdate:value': [Function, Array] as PropType<MaybeArray<OnUpdateValue>>,
  onUpdateValue: [Function, Array] as PropType<MaybeArray<OnUpdateValue>>,
  onBlur: Function as PropType<(e: FocusEvent) => void>,
  onFocus: Function as PropType<(e: FocusEvent) => void>,
  // deprecated
  onChange: [Function, Array] as PropType<MaybeArray<OnUpdateValue> | undefined>
} as const

export type CascaderProps = ExtractPublicPropTypes<typeof cascaderProps>

// TODO refactor cascader menu keyboard scroll (use virtual list)
export default defineComponent({
  name: 'Cascader',
  props: cascaderProps,
  setup (props) {
    if (__DEV__) {
      watchEffect(() => {
        if (props.leafOnly) {
          warnOnce(
            'cascader',
            '`leaf-only` is deprecated, please use `check-strategy="child"` instead'
          )
        }
        if (props.onChange !== undefined) {
          warnOnce(
            'cascader',
            '`on-change` is deprecated, please use `on-update:value` instead.'
          )
        }
      })
    }
    const { mergedBorderedRef, mergedClsPrefixRef, namespaceRef } =
      useConfig(props)
    const themeRef = useTheme(
      'Cascader',
      'Cascader',
      style,
      cascaderLight,
      props,
      mergedClsPrefixRef
    )
    const { localeRef } = useLocale('Cascader')
    const uncontrolledValueRef = ref(props.defaultValue)
    const controlledValueRef = computed(() => props.value)
    const mergedValueRef = useMergedState(
      controlledValueRef,
      uncontrolledValueRef
    )
    const mergedCheckStrategyRef = computed(() => {
      return props.leafOnly ? 'child' : props.checkStrategy
    })
    const patternRef = ref('')
    const formItem = useFormItem(props)
    const { mergedSizeRef, mergedDisabledRef } = formItem
    const cascaderMenuInstRef = ref<CascaderMenuInstance | null>(null)
    const selectMenuInstRef = ref<SelectMenuInstance | null>(null)
    const triggerInstRef = ref<InternalSelectionInst | null>(null)
    const keyboardKeyRef = ref<Key | null>(null)
    const hoverKeyRef = ref<Key | null>(null)
    const loadingKeySetRef = ref<Set<Key>>(new Set())
    const selectMenuFollowerRef = ref<FollowerInst | null>(null)
    const cascaderMenuFollowerRef = ref<FollowerInst | null>(null)
    const adjustedToRef = useAdjustedTo(props)
    const focusedRef = ref(false)
    const addLoadingKey = (key: Key): void => {
      loadingKeySetRef.value.add(key)
    }
    const deleteLoadingKey = (key: Key): void => {
      loadingKeySetRef.value.delete(key)
    }
    const treeMateRef = computed(() => {
      const { valueField, childrenField } = props
      return createTreeMate(props.options, {
        getKey (node) {
          return (node as any)[valueField]
        },
        getChildren (node) {
          return (node as any)[childrenField]
        }
      })
    })
    const mergedKeysRef = computed(() => {
      const { cascade, multiple } = props
      if (multiple && Array.isArray(mergedValueRef.value)) {
        return treeMateRef.value.getCheckedKeys(mergedValueRef.value, {
          cascade
        })
      } else {
        return {
          checkedKeys: [],
          indeterminateKeys: []
        }
      }
    })
    const checkedKeysRef = computed(() => mergedKeysRef.value.checkedKeys)
    const indeterminateKeysRef = computed(
      () => mergedKeysRef.value.indeterminateKeys
    )
    const menuModelRef = computed(() => {
      const { treeNodePath, treeNode } = treeMateRef.value.getPath(
        hoverKeyRef.value
      )
      let ret
      if (treeNode === null) {
        ret = [treeMateRef.value.treeNodes]
      } else {
        ret = treeNodePath.map((treeNode) => treeNode.siblings)
        if (
          !treeNode.isLeaf &&
          !loadingKeySetRef.value.has(treeNode.key) &&
          treeNode.children
        ) {
          ret.push(treeNode.children)
        }
      }
      return ret
    })
    const hoverKeyPathRef = computed(() => {
      const { keyPath } = treeMateRef.value.getPath(hoverKeyRef.value)
      return keyPath
    })
    const optionHeightRef = computed(() => {
      return themeRef.value.self.optionHeight
    })
    if (isReactive(props.options)) {
      watch(props.options, (value, oldValue) => {
        if (!(value === oldValue)) {
          hoverKeyRef.value = null
          keyboardKeyRef.value = null
        }
      })
    }
    function doUpdateValue (
      value: Value | null,
      option: CascaderOption | null | Array<CascaderOption | null>,
      optionPath: null | CascaderOption[] | Array<CascaderOption[] | null>
    ): void {
      const {
        onUpdateValue,
        'onUpdate:value': _onUpdateValue,
        onChange
      } = props
      const { nTriggerFormInput, nTriggerFormChange } = formItem
      if (onUpdateValue) {
        call(onUpdateValue as OnUpdateValueImpl, value, option, optionPath)
      }
      if (_onUpdateValue) {
        call(_onUpdateValue as OnUpdateValueImpl, value, option, optionPath)
      }
      if (onChange) {
        call(onChange as OnUpdateValueImpl, value, option, optionPath)
      }
      uncontrolledValueRef.value = value
      nTriggerFormInput()
      nTriggerFormChange()
    }
    function updateKeyboardKey (key: Key | null): void {
      keyboardKeyRef.value = key
    }
    function updateHoverKey (key: Key | null): void {
      hoverKeyRef.value = key
    }
    function doCheck (key: Key): boolean {
      const { cascade, multiple, filterable } = props
      const {
        value: { check, getNode, getPath }
      } = treeMateRef
      if (multiple) {
        try {
          const { checkedKeys } = check(key, mergedKeysRef.value.checkedKeys, {
            cascade,
            checkStrategy: mergedCheckStrategyRef.value
          })
          doUpdateValue(
            checkedKeys,
            checkedKeys.map(
              (checkedKey) => getNode(checkedKey)?.rawNode || null
            ),
            checkedKeys.map((checkedKey) =>
              getRawNodePath(getPath(checkedKey)?.treeNodePath)
            )
          )
          if (filterable) focusSelectionInput()
        } catch (err) {
          if (err instanceof SubtreeNotLoadedError) {
            if (cascaderMenuInstRef.value) {
              const tmNode = getNode(key)
              if (tmNode !== null) {
                cascaderMenuInstRef.value.showErrorMessage(
                  (tmNode.rawNode as any)[props.labelField]
                )
              }
            }
          } else {
            throw err
          }
        }
      } else {
        if (mergedCheckStrategyRef.value === 'child') {
          const tmNode = getNode(key)
          if (tmNode?.isLeaf) {
            doUpdateValue(
              key,
              tmNode.rawNode,
              getRawNodePath(getPath(key).treeNodePath)
            )
          } else {
            return false
          }
        } else {
          const tmNode = getNode(key)
          doUpdateValue(
            key,
            tmNode?.rawNode || null,
            getRawNodePath(getPath(key)?.treeNodePath)
          )
        }
      }
      return true
    }
    function doUncheck (key: Key): void {
      const { cascade, multiple } = props
      if (multiple) {
        const {
          value: { uncheck, getNode, getPath }
        } = treeMateRef
        const { checkedKeys } = uncheck(key, mergedKeysRef.value.checkedKeys, {
          cascade,
          checkStrategy: mergedCheckStrategyRef.value
        })
        doUpdateValue(
          checkedKeys,
          checkedKeys.map((checkedKey) => getNode(checkedKey)?.rawNode || null),
          checkedKeys.map((checkedKey) =>
            getRawNodePath(getPath(checkedKey)?.treeNodePath)
          )
        )
      }
    }
    const selectedOptionsRef = computed(() => {
      if (props.multiple) {
        const { showPath, separator, labelField, cascade } = props
        const { getCheckedKeys, getNode } = treeMateRef.value
        const value = getCheckedKeys(checkedKeysRef.value, {
          cascade,
          checkStrategy: mergedCheckStrategyRef.value
        }).checkedKeys
        return value.map((key) => {
          const node = getNode(key)
          if (node === null) {
            return {
              label: String(key),
              value: key
            }
          } else {
            return {
              label: showPath
                ? getPathLabel(node, separator, labelField)
                : (node.rawNode as any)[labelField],
              value: node.key
            }
          }
        })
      } else return []
    })
    const selectedOptionRef = computed(() => {
      const { multiple, showPath, separator, labelField } = props
      const { value } = mergedValueRef
      if (!multiple && !Array.isArray(value)) {
        const { getNode } = treeMateRef.value
        if (value === null) {
          return null
        }
        const node = getNode(value)
        if (node === null) {
          return {
            label: String(value),
            value
          }
        } else {
          return {
            label: showPath
              ? getPathLabel(node, separator, labelField)
              : (node.rawNode as any)[labelField],
            value: node.key
          }
        }
      } else return null
    })
    const uncontrolledShowRef = ref(false)
    const controlledShowRef = toRef(props, 'show')
    const mergedShowRef = useMergedState(controlledShowRef, uncontrolledShowRef)
    const localizedPlaceholderRef = computed(() => {
      const { placeholder } = props
      if (placeholder !== undefined) return placeholder
      return localeRef.value.placeholder
    })
    // select option related
    const showSelectMenuRef = computed(() => {
      return !!(props.filterable && patternRef.value)
    })
    // --- methods
    function doBlur (e: FocusEvent): void {
      const { onBlur } = props
      const { nTriggerFormBlur } = formItem
      if (onBlur) call(onBlur, e)
      nTriggerFormBlur()
    }
    function doFocus (e: FocusEvent): void {
      const { onFocus } = props
      const { nTriggerFormFocus } = formItem
      if (onFocus) call(onFocus, e)
      nTriggerFormFocus()
    }
    function focusSelectionInput (): void {
      triggerInstRef.value?.focusInput()
    }
    function focusSelection (): void {
      triggerInstRef.value?.focus()
    }
    function openMenu (): void {
      if (!mergedDisabledRef.value) {
        patternRef.value = ''
        uncontrolledShowRef.value = true
        if (props.filterable) {
          focusSelectionInput()
        }
      }
    }
    function closeMenu (returnFocus = false): void {
      if (returnFocus) {
        focusSelection()
      }
      uncontrolledShowRef.value = false
      patternRef.value = ''
    }
    function handleCascaderMenuClickOutside (e: MouseEvent): void {
      if (showSelectMenuRef.value) return
      if (mergedShowRef.value) {
        if (!triggerInstRef.value?.$el.contains(e.target as Node)) {
          closeMenu()
        }
      }
    }
    function handleSelectMenuClickOutside (e: MouseEvent): void {
      if (!showSelectMenuRef.value) return
      handleCascaderMenuClickOutside(e)
    }
    // --- keyboard
    function move (direction: 'prev' | 'next' | 'child' | 'parent'): void {
      const { value: keyboardKey } = keyboardKeyRef
      const { value: treeMate } = treeMateRef
      switch (direction) {
        case 'prev':
          if (keyboardKey !== null) {
            const node = treeMate.getPrev(keyboardKey, { loop: true })
            if (node !== null) {
              updateKeyboardKey(node.key)
              cascaderMenuInstRef.value?.scroll(
                node.level,
                node.index,
                depx(optionHeightRef.value)
              )
            }
          }
          break
        case 'next':
          if (keyboardKey === null) {
            const node = treeMate.getFirstAvailableNode()
            if (node !== null) {
              updateKeyboardKey(node.key)
              cascaderMenuInstRef.value?.scroll(
                node.level,
                node.index,
                depx(optionHeightRef.value)
              )
            }
          } else {
            const node = treeMate.getNext(keyboardKey, { loop: true })
            if (node !== null) {
              updateKeyboardKey(node.key)
              cascaderMenuInstRef.value?.scroll(
                node.level,
                node.index,
                depx(optionHeightRef.value)
              )
            }
          }
          break
        case 'child':
          if (keyboardKey !== null) {
            const currentNode = treeMate.getNode(keyboardKey)
            if (currentNode !== null) {
              if (currentNode.shallowLoaded) {
                const node = treeMate.getChild(keyboardKey)
                if (node !== null) {
                  updateHoverKey(keyboardKey)
                  updateKeyboardKey(node.key)
                }
              } else {
                const { value: loadingKeySet } = loadingKeySetRef
                if (!loadingKeySet.has(keyboardKey)) {
                  addLoadingKey(keyboardKey)
                  updateHoverKey(keyboardKey)
                  const { onLoad } = props
                  if (onLoad) {
                    onLoad(currentNode.rawNode)
                      .then(() => {
                        deleteLoadingKey(keyboardKey)
                      })
                      .catch(() => {
                        deleteLoadingKey(keyboardKey)
                      })
                  }
                }
              }
            }
          }
          break
        case 'parent':
          if (keyboardKey !== null) {
            const node = treeMate.getParent(keyboardKey)
            if (node !== null) {
              updateKeyboardKey(node.key)
              const parentNode = node.getParent()
              if (parentNode === null) {
                updateHoverKey(null)
              } else {
                updateHoverKey(parentNode.key)
              }
            }
          }
          break
      }
    }
    function handleKeyUp (e: KeyboardEvent): void {
      if (happensIn(e, 'action')) return
      switch (e.code) {
        case 'Space':
          if (props.filterable) return
        // eslint-disable-next-line no-fallthrough
        case 'Enter':
        case 'NumpadEnter':
          if (!mergedShowRef.value) {
            openMenu()
          } else {
            const { value: showSelectMenu } = showSelectMenuRef
            const { value: keyboardKey } = keyboardKeyRef
            if (!showSelectMenu) {
              if (keyboardKey !== null) {
                if (
                  checkedKeysRef.value.includes(keyboardKey) ||
                  indeterminateKeysRef.value.includes(keyboardKey)
                ) {
                  doUncheck(keyboardKey)
                } else {
                  const checkIsValid = doCheck(keyboardKey)
                  if (!props.multiple && checkIsValid) {
                    closeMenu(true)
                  }
                }
              }
            } else {
              if (selectMenuInstRef.value) {
                const hasCorrespondingOption = selectMenuInstRef.value.enter()
                if (hasCorrespondingOption) patternRef.value = ''
              }
            }
          }
          break
        case 'ArrowUp':
          e.preventDefault()
          if (mergedShowRef.value) {
            if (showSelectMenuRef.value) {
              selectMenuInstRef.value?.prev()
            } else {
              move('prev')
            }
          }
          break
        case 'ArrowDown':
          e.preventDefault()
          if (mergedShowRef.value) {
            if (showSelectMenuRef.value) {
              selectMenuInstRef.value?.next()
            } else {
              move('next')
            }
          } else {
            openMenu()
          }
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (mergedShowRef.value && !showSelectMenuRef.value) {
            move('parent')
          }
          break
        case 'ArrowRight':
          e.preventDefault()
          if (mergedShowRef.value && !showSelectMenuRef.value) {
            move('child')
          }
          break
        case 'Escape':
          closeMenu(true)
      }
    }
    function handleMenuKeyUp (e: KeyboardEvent): void {
      handleKeyUp(e)
    }
    // --- search
    function handleClear (e: MouseEvent): void {
      e.stopPropagation()
      if (props.multiple) {
        doUpdateValue([], [], [])
      } else {
        doUpdateValue(null, null, null)
      }
    }
    function handleTriggerFocus (e: FocusEvent): void {
      if (!cascaderMenuInstRef.value?.$el.contains(e.relatedTarget as Node)) {
        focusedRef.value = true
        doFocus(e)
      }
    }
    function handleTriggerBlur (e: FocusEvent): void {
      if (!cascaderMenuInstRef.value?.$el.contains(e.relatedTarget as Node)) {
        focusedRef.value = false
        doBlur(e)
        closeMenu()
      }
    }
    function handleMenuFocus (e: FocusEvent): void {
      if (!triggerInstRef.value?.$el.contains(e.relatedTarget as Node)) {
        focusedRef.value = true
        doFocus(e)
      }
    }
    function handleMenuBlur (e: FocusEvent): void {
      if (!triggerInstRef.value?.$el.contains(e.relatedTarget as Node)) {
        focusedRef.value = false
        doBlur(e)
      }
    }
    function handleMenuMousedown (e: MouseEvent): void {
      if (!happensIn(e, 'action')) {
        if (props.multiple && props.filter) {
          e.preventDefault()
          focusSelectionInput()
        }
      }
    }
    function handleMenuTabout (): void {
      closeMenu(true)
    }
    function handleTriggerClick (): void {
      if (props.filterable) {
        openMenu()
      } else {
        if (mergedShowRef.value) {
          closeMenu(true)
        } else {
          openMenu()
        }
      }
    }
    function handlePatternInput (e: InputEvent): void {
      patternRef.value = (e.target as HTMLInputElement).value
    }
    function handleDeleteOption (option: SelectBaseOption): void {
      const { multiple } = props
      const { value: mergedValue } = mergedValueRef
      if (multiple && Array.isArray(mergedValue)) {
        doUncheck(option.value)
      } else {
        doUpdateValue(null, null, null)
      }
    }
    function handleKeyDown (e: KeyboardEvent): void {
      switch (e.code) {
        case 'Space':
        case 'ArrowDown':
        case 'ArrowUp':
          if (props.filterable && mergedShowRef.value) {
            return
          }
          e.preventDefault()
          break
      }
    }
    // sync position
    function syncSelectMenuPosition (): void {
      selectMenuFollowerRef.value?.syncPosition()
    }
    function syncCascaderMenuPosition (): void {
      cascaderMenuFollowerRef.value?.syncPosition()
    }
    provide(cascaderInjectionKey, {
      mergedClsPrefixRef,
      mergedThemeRef: themeRef,
      mergedValueRef,
      checkedKeysRef,
      indeterminateKeysRef,
      hoverKeyPathRef,
      mergedCheckStrategyRef,
      cascadeRef: toRef(props, 'cascade'),
      multipleRef: toRef(props, 'multiple'),
      keyboardKeyRef,
      hoverKeyRef,
      remoteRef: toRef(props, 'remote'),
      loadingKeySetRef,
      expandTriggerRef: toRef(props, 'expandTrigger'),
      isMountedRef: useIsMounted(),
      onLoadRef: toRef(props, 'onLoad'),
      virtualScrollRef: toRef(props, 'virtualScroll'),
      optionHeightRef,
      localeRef,
      labelFieldRef: toRef(props, 'labelField'),
      syncCascaderMenuPosition,
      syncSelectMenuPosition,
      updateKeyboardKey,
      updateHoverKey,
      addLoadingKey,
      deleteLoadingKey,
      doCheck,
      doUncheck,
      closeMenu,
      handleSelectMenuClickOutside,
      handleCascaderMenuClickOutside
    })
    return {
      selectMenuFollowerRef,
      cascaderMenuFollowerRef,
      triggerInstRef,
      selectMenuInstRef,
      cascaderMenuInstRef,
      mergedBordered: mergedBorderedRef,
      mergedClsPrefix: mergedClsPrefixRef,
      namespace: namespaceRef,
      mergedValue: mergedValueRef,
      mergedShow: mergedShowRef,
      showSelectMenu: showSelectMenuRef,
      pattern: patternRef,
      treeMate: treeMateRef,
      mergedSize: mergedSizeRef,
      mergedDisabled: mergedDisabledRef,
      localizedPlaceholder: localizedPlaceholderRef,
      selectedOption: selectedOptionRef,
      selectedOptions: selectedOptionsRef,
      adjustedTo: adjustedToRef,
      menuModel: menuModelRef,
      handleMenuTabout,
      handleMenuFocus,
      handleMenuBlur,
      handleMenuKeyUp,
      handleMenuMousedown,
      handleTriggerFocus,
      handleTriggerBlur,
      handleTriggerClick,
      handleClear,
      handleDeleteOption,
      handlePatternInput,
      handleKeyDown,
      handleKeyUp,
      focused: focusedRef,
      optionHeight: optionHeightRef,
      mergedTheme: themeRef,
      cssVars: computed(() => {
        const {
          self: {
            optionArrowColor,
            optionTextColor,
            optionTextColorActive,
            optionTextColorDisabled,
            optionCheckMarkColor,
            menuColor,
            menuBoxShadow,
            menuDividerColor,
            menuBorderRadius,
            menuHeight,
            optionColorHover,
            optionHeight,
            optionFontSize,
            loadingColor,
            columnWidth
          },
          common: { cubicBezierEaseInOut }
        } = themeRef.value
        return {
          '--bezier': cubicBezierEaseInOut,
          '--menu-border-radius': menuBorderRadius,
          '--menu-box-shadow': menuBoxShadow,
          '--menu-height': menuHeight,
          '--column-width': columnWidth,
          '--menu-color': menuColor,
          '--menu-divider-color': menuDividerColor,
          '--option-height': optionHeight,
          '--option-font-size': optionFontSize,
          '--option-text-color': optionTextColor,
          '--option-text-color-disabled': optionTextColorDisabled,
          '--option-text-color-active': optionTextColorActive,
          '--option-color-hover': optionColorHover,
          '--option-check-mark-color': optionCheckMarkColor,
          '--option-arrow-color': optionArrowColor,
          '--menu-mask-color': changeColor(menuColor, { alpha: 0.75 }),
          '--loading-color': loadingColor
        }
      })
    }
  },
  render () {
    const { mergedClsPrefix, $slots } = this
    return (
      <div class={`${mergedClsPrefix}-cascader`}>
        <VBinder>
          {{
            default: () => [
              <VTarget>
                {{
                  default: () => (
                    <NInternalSelection
                      ref="triggerInstRef"
                      clsPrefix={mergedClsPrefix}
                      maxTagCount={this.maxTagCount}
                      bordered={this.mergedBordered}
                      size={this.mergedSize}
                      theme={this.mergedTheme.peers.InternalSelection}
                      themeOverrides={
                        this.mergedTheme.peerOverrides.InternalSelection
                      }
                      active={this.mergedShow}
                      pattern={this.pattern}
                      placeholder={this.localizedPlaceholder}
                      selectedOption={this.selectedOption}
                      selectedOptions={this.selectedOptions}
                      multiple={this.multiple}
                      filterable={this.filterable}
                      clearable={this.clearable}
                      disabled={this.mergedDisabled}
                      focused={this.focused}
                      onFocus={this.handleTriggerFocus}
                      onBlur={this.handleTriggerBlur}
                      onClick={this.handleTriggerClick}
                      onClear={this.handleClear}
                      onDeleteOption={this.handleDeleteOption}
                      onPatternInput={this.handlePatternInput}
                      onKeydown={this.handleKeyDown}
                      onKeyup={this.handleKeyUp}
                    />
                  )
                }}
              </VTarget>,
              <VFollower
                key="cascaderMenu"
                ref="cascaderMenuFollowerRef"
                show={this.mergedShow && !this.showSelectMenu}
                containerClass={this.namespace}
                placement="bottom-start"
                width={!this.options.length ? 'target' : undefined}
                teleportDisabled={this.adjustedTo === useAdjustedTo.tdkey}
                to={this.adjustedTo}
              >
                {{
                  default: () => (
                    <CascaderMenu
                      ref="cascaderMenuInstRef"
                      value={this.mergedValue}
                      show={this.mergedShow && !this.showSelectMenu}
                      menuModel={this.menuModel}
                      style={this.cssVars as CSSProperties}
                      onFocus={this.handleMenuFocus}
                      onBlur={this.handleMenuBlur}
                      onKeyup={this.handleMenuKeyUp}
                      onMousedown={this.handleMenuMousedown}
                      onTabout={this.handleMenuTabout}
                    >
                      {$slots}
                    </CascaderMenu>
                  )
                }}
              </VFollower>,
              <VFollower
                key="selectMenu"
                ref="selectMenuFollowerRef"
                show={this.mergedShow && this.showSelectMenu}
                containerClass={this.namespace}
                width="target"
                placement="bottom-start"
                to={this.adjustedTo}
                teleportDisabled={this.adjustedTo === useAdjustedTo.tdkey}
              >
                {{
                  default: () => (
                    <CascaderSelectMenu
                      ref="selectMenuInstRef"
                      value={this.mergedValue}
                      show={this.mergedShow && this.showSelectMenu}
                      pattern={this.pattern}
                      multiple={this.multiple}
                      tmNodes={this.treeMate.treeNodes}
                      filter={this.filter}
                      labelField={this.labelField}
                      separator={this.separator}
                      style={this.cssVars as CSSProperties}
                    />
                  )
                }}
              </VFollower>
            ]
          }}
        </VBinder>
      </div>
    )
  }
})
