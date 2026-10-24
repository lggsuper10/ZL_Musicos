import { getCachedIsTV } from '@/utils/tvMode'
import { Navigation } from 'react-native-navigation'
// import { InteractionManager } from 'react-native'

import {
  HOME_SCREEN,
  PLAY_DETAIL_SCREEN,
  SONGLIST_DETAIL_SCREEN,
  COMMENT_SCREEN,
  TV_HOME_SCREEN,
  TV_PLAYER_SCREEN,
  TV_SEARCH_SCREEN,
  TV_QUEUE_SCREEN,
  TV_HISTORY_SCREEN,
  TV_SETTINGS_SCREEN,
  TV_DETAIL_SCREEN,
  TV_MYLIST_SCREEN,
  TV_RENAME_SCREEN,
  PACT_MODAL,
  SYNC_MODE_MODAL,
} from './screenNames'

import themeState from '@/store/theme/state'
import commonState from '@/store/common/state'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'
import { getStatusBarStyle } from './utils'
import { windowSizeTools } from '@/utils/windowSizeTools'
import { type ListInfoItem } from '@/store/songlist/state'
import type { TVDetailPayload } from '@/screens/TV/types'
import { requestTabFocusOnArrival } from '@/components/TV/TVTopTabs'
import { getTVTabHost } from '@/components/TV/tvTabHost'

const TV_BACKGROUND_COLOR = '#060810'
const TV_PUSH_ANIMATION = {
  content: {
    alpha: {
      from: 0,
      to: 1,
      duration: 220,
    },
    translationY: {
      from: 16,
      to: 0,
      duration: 220,
    },
  },
  element: {
    alpha: {
      from: 0,
      duration: 220,
    },
  },
}

const TV_POP_ANIMATION = {
  content: {
    alpha: {
      from: 1,
      to: 0,
      duration: 160,
    },
    translationY: {
      from: 0,
      to: 12,
      duration: 160,
    },
  },
}

// 顶栏切页的兜底 push：只有宿主不在（例如某些入口直接 push 了某个 tab 屏）时才走这里。
// 关掉进出场动画瞬时完成；不要再加 waitForRender —— 连按左右时旧页会被 popToRoot 销毁，
// RNN 的 StackAnimator 在 appeared 回调里访问已销毁的 view 会 FATAL 崩进程。
const TV_TAB_PUSH_ANIMATION = {
  enabled: false,
}

export async function pushHomeScreen() {
  const theme = themeState.theme

  if (getCachedIsTV()) {
    return Navigation.setRoot({
      root: {
        stack: {
          children: [{
            component: {
              name: TV_HOME_SCREEN,
              options: {
                topBar: {
                  visible: false,
                  height: 0,
                  drawBehind: false,
                },
                statusBar: {
                  drawBehind: true,
                  visible: false,
                  style: getStatusBarStyle(theme.isDark),
                  backgroundColor: 'transparent',
                },
                navigationBar: {
                  backgroundColor: TV_BACKGROUND_COLOR,
                },
                layout: {
                  componentBackgroundColor: TV_BACKGROUND_COLOR,
                },
              },
            },
          }],
        },
      },
    })
  }

  return Navigation.setRoot({
    root: {
      stack: {
        children: [{
          component: {
            name: HOME_SCREEN,
            options: {
              topBar: {
                visible: false,
                height: 0,
                drawBehind: false,
              },
              statusBar: {
                drawBehind: true,
                visible: true,
                style: getStatusBarStyle(theme.isDark),
                backgroundColor: 'transparent',
              },
              navigationBar: {
                // visible: false,
                backgroundColor: theme['c-content-background'],
              },
              layout: {
                componentBackgroundColor: theme['c-content-background'],
              },
            },
          },
        }],
      },
    },
  })
}
export function pushPlayDetailScreen(componentId: string, skipAnimation = false) {
  /*
    Navigation.setDefaultOptions({
      topBar: {
        background: {
          color: '#039893',
        },
        title: {
          color: 'white',
        },
        backButton: {
          title: '', // Remove previous screen name from back button
          color: 'white',
        },
        buttonColor: 'white',
      },
      statusBar: {
        style: 'light',
      },
      layout: {
        orientation: ['portrait'],
      },
      bottomTabs: {
        titleDisplayMode: 'alwaysShow',
      },
      bottomTab: {
        textColor: 'gray',
        selectedTextColor: 'black',
        iconColor: 'gray',
        selectedIconColor: 'black',
      },
    })
  */
  requestAnimationFrame(() => {
    const theme = themeState.theme

    void Navigation.push(componentId, {
      component: {
        name: PLAY_DETAIL_SCREEN,
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            // visible: false,
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: skipAnimation ? {} : {
              sharedElementTransitions: [
                {
                  fromId: NAV_SHEAR_NATIVE_IDS.playDetail_pic,
                  toId: NAV_SHEAR_NATIVE_IDS.playDetail_pic,
                  interpolation: { type: 'spring' },
                },
              ],
              elementTransitions: [
                {
                  id: NAV_SHEAR_NATIVE_IDS.playDetail_header,
                  alpha: {
                    from: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationY: {
                    from: -32, // Animate translationY from 16dp to 0dp
                    duration: 300,
                  },
                },
                {
                  id: NAV_SHEAR_NATIVE_IDS.playDetail_player,
                  alpha: {
                    from: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationY: {
                    from: 32, // Animate translationY from 16dp to 0dp
                    duration: 300,
                  },
                },
              ],
              // content: {
              //   translationX: {
              //     from: windowSizeTools.getSize().width,
              //     to: 0,
              //     duration: 300,
              //   },
              // },
            },
            pop: {
              content: {
                translationX: {
                  from: 0,
                  to: windowSizeTools.getSize().width,
                  duration: 300,
                },
              },
            },
          },
        },
      },
    })
  })
}
export function pushSonglistDetailScreen(componentId: string, info: ListInfoItem) {
  const theme = themeState.theme

  requestAnimationFrame(() => {
    void Navigation.push(componentId, {
      component: {
        name: SONGLIST_DETAIL_SCREEN,
        passProps: {
          info,
        },
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            // visible: false,
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
          animations: {
            push: {
              sharedElementTransitions: [
                {
                  fromId: `${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_from_${info.id}`,
                  toId: `${NAV_SHEAR_NATIVE_IDS.songlistDetail_pic}_to_${info.id}`,
                  interpolation: { type: 'spring' },
                },
              ],
              elementTransitions: [
                {
                  id: NAV_SHEAR_NATIVE_IDS.songlistDetail_title,
                  alpha: {
                    from: 0, // We don't declare 'to' value as that is the element's current alpha value, here we're essentially animating from 0 to 1
                    duration: 300,
                  },
                  translationX: {
                    from: 16, // Animate translationX from 16dp to 0dp
                    duration: 300,
                  },
                },
              ],
              // content: {
              //   scaleX: {
              //     from: 1.2,
              //     to: 1,
              //     duration: 200,
              //   },
              //   scaleY: {
              //     from: 1.2,
              //     to: 1,
              //     duration: 200,
              //   },
              // },
            },
          },
        },
      },
    })
  })
}
export function pushCommentScreen(componentId: string, musicInfo: LX.Music.MusicInfo) {
  const theme = themeState.theme

  requestAnimationFrame(() => {
    void Navigation.push(componentId, {
      component: {
        name: COMMENT_SCREEN,
        passProps: {
          musicInfo,
        },
        options: {
          topBar: {
            visible: false,
            height: 0,
            drawBehind: false,
          },
          statusBar: {
            drawBehind: true,
            visible: true,
            style: getStatusBarStyle(theme.isDark),
            backgroundColor: 'transparent',
          },
          navigationBar: {
            // visible: false,
            backgroundColor: theme['c-content-background'],
          },
          layout: {
            componentBackgroundColor: theme['c-content-background'],
          },
        },
      },
    })
  })
}
export function showPactModal() {
  const theme = themeState.theme

  void Navigation.showModal({
    stack: {
      children: [{
        component: {
          name: PACT_MODAL,
          options: {
            topBar: {
              visible: false,
              height: 0,
              drawBehind: false,
            },
            statusBar: {
              drawBehind: true,
              visible: true,
              style: getStatusBarStyle(theme.isDark),
              backgroundColor: 'transparent',
            },
            navigationBar: {
              backgroundColor: theme['c-content-background'],
            },
            layout: {
              componentBackgroundColor: 'rgba(0,0,0,0.5)',
            },
          },
        },
      }],
    },
  })
}

export function showSyncModeModal() {
  const theme = themeState.theme

  void Navigation.showModal({
    stack: {
      children: [{
        component: {
          name: SYNC_MODE_MODAL,
          options: {
            topBar: {
              visible: false,
              height: 0,
              drawBehind: false,
            },
            statusBar: {
              drawBehind: true,
              visible: true,
              style: getStatusBarStyle(theme.isDark),
              backgroundColor: 'transparent',
            },
            navigationBar: {
              backgroundColor: theme['c-content-background'],
            },
            layout: {
              componentBackgroundColor: 'rgba(0,0,0,0.5)',
            },
          },
        },
      }],
    },
  })
}

export const pushTVPlayerScreen = (componentId: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_PLAYER_SCREEN,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export const pushTVSearchScreen = (componentId: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_SEARCH_SCREEN,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export const pushTVQueueScreen = (componentId: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_QUEUE_SCREEN,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export const pushTVHistoryScreen = (componentId: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_HISTORY_SCREEN,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export const pushTVSettingsScreen = (componentId: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_SETTINGS_SCREEN,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export const pushTVDetailScreen = (componentId: string, payload: TVDetailPayload) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_DETAIL_SCREEN,
      passProps: {
        payload,
      },
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export const pushTVMyListScreen = (componentId: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_MYLIST_SCREEN,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}

export type TVTabTarget = 'home' | 'new' | 'mylist' | 'search' | 'queue' | 'settings'

const TV_TAB_SCREEN_NAMES: Record<Exclude<TVTabTarget, 'home'>, string> = {
  new: TV_HISTORY_SCREEN,
  mylist: TV_MYLIST_SCREEN,
  search: TV_SEARCH_SCREEN,
  queue: TV_QUEUE_SCREEN,
  settings: TV_SETTINGS_SCREEN,
}

// 顶栏切页的 push：目标页渲染完成后再短暂淡入，避免露底色造成黑屏闪一下
const pushTVTabScreen = (componentId: string, name: string) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name,
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_TAB_PUSH_ANIMATION,
          pop: { enabled: false },
        },
      },
    },
  })
}

let tvTabSwitchSeq = 0
// popToRoot / push 串行执行：连按左右时多个命令并发，RNN 会拒绝后发的命令
// （实测表现为停在首页且没有任何焦点），或把页面压错位置
let tvTabSwitchChain: Promise<void> = Promise.resolve()
// 同目标的重复切换（焦点刚落到 tab 时按 OK，或遥控器抖一次发两个事件）直接忽略，
// 否则会把刚 push 的页面再重建一遍
let tvTabSwitchPending: { target: TVTabTarget, at: number } | null = null

/**
 * 顶部导航「焦点即切换」的页面切换（09-22 老板需求：焦点移到哪个菜单就切到哪个）。
 *
 * 正常路径走 TV 宿主（src/screens/TV/Shell.tsx）：六个 tab 页共用一个原生 screen，
 * 切 tab 只是 React 换可见页，不压栈出栈，所以既没有重建整页的卡顿，也没有
 * 原生容器首帧空白造成的「黑一下」。
 *
 * 下面的原生兜底只在宿主不在场时使用（例如某处直接 push 了某个 tab 屏）：
 * 先 popToRoot 回到首页再 push，栈始终是「首页 + 当前 tab 页」，返回键一次回首页；
 * 连按左右时以最后一次为准：旧命令回到首页后发现自己已过期就不再 push。
 */
export const switchTVTab = (componentId: string, target: TVTabTarget) => {
  const host = getTVTabHost()
  if (host) {
    // 标记「这次是顶栏切过来的」，目标页里异步加载完成的焦点补偿会让位给顶栏
    if (target !== 'home') requestTabFocusOnArrival(target)
    host.show(target)
    return
  }

  if (tvTabSwitchPending && tvTabSwitchPending.target === target && Date.now() - tvTabSwitchPending.at < 1000) return
  tvTabSwitchPending = { target, at: Date.now() }
  const seq = ++tvTabSwitchSeq
  // 目标页挂载后把焦点还给顶部导航。home 不标记：目标页就是首页本身（已挂载），
  // 焦点由首页自己的 preferred tab 接管
  if (target !== 'home') requestTabFocusOnArrival(target)
  const rootId = commonState.componentIds.home
  if (!rootId) {
    // 极端情况（首页组件 id 尚未登记）：直接 push，功能可用但返回栈会多一层
    if (target !== 'home') pushTVTabScreen(componentId, TV_TAB_SCREEN_NAMES[target])
    return
  }
  tvTabSwitchChain = tvTabSwitchChain.then(async() => {
    if (seq !== tvTabSwitchSeq) return
    try {
      await Navigation.popToRoot(rootId, { animations: { pop: { enabled: false } } })
    } catch {
      // 回到首页失败也继续 push：宁可多一层返回栈，也不能停在无焦点的空页面
    }
    if (seq !== tvTabSwitchSeq || target === 'home') return
    pushTVTabScreen(rootId, TV_TAB_SCREEN_NAMES[target])
  }).catch(() => { })
}

export const pushTVRenameScreen = (componentId: string, payload: { id: string, name: string }) => {
  const theme = themeState.theme
  void Navigation.push(componentId, {
    component: {
      name: TV_RENAME_SCREEN,
      passProps: {
        ...payload,
      },
      options: {
        topBar: {
          visible: false,
          height: 0,
          drawBehind: false,
        },
        statusBar: {
          drawBehind: true,
          visible: false,
          style: getStatusBarStyle(theme.isDark),
        },
        navigationBar: {
          backgroundColor: TV_BACKGROUND_COLOR,
        },
        layout: {
          componentBackgroundColor: TV_BACKGROUND_COLOR,
        },
        animations: {
          push: TV_PUSH_ANIMATION,
          pop: TV_POP_ANIMATION,
        },
      },
    },
  })
}
