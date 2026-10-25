// @flow

import { Navigation } from 'react-native-navigation'

import {
  Home,
  PlayDetail,
  SonglistDetail,
  Comment,
  TVPlayer,
  TVSearch,
  TVQueue,
  TVHistory,
  TVSettings,
  TVDetail,
  TVMyList,
  TVRename,
} from '@/screens'
import { Provider } from '@/store/Provider'
import TVShell from '@/screens/TV/Shell'
import TVRemoteFocusController from '@/components/TV/TVRemoteFocusController'
import { TVPushedScreenMarker } from '@/components/TV/tvTabHost'
import { TVFocusScopeContext } from '@/components/TV/tvFocusManager'

import {
  HOME_SCREEN,
  PLAY_DETAIL_SCREEN,
  SONGLIST_DETAIL_SCREEN,
  COMMENT_SCREEN,
  VERSION_MODAL,
  PACT_MODAL,
  SYNC_MODE_MODAL,
  TV_HOME_SCREEN,
  TV_PLAYER_SCREEN,
  TV_SEARCH_SCREEN,
  TV_QUEUE_SCREEN,
  TV_HISTORY_SCREEN,
  TV_SETTINGS_SCREEN,
  TV_DETAIL_SCREEN,
  TV_MYLIST_SCREEN,
  TV_RENAME_SCREEN,
} from './screenNames'
import VersionModal from './components/VersionModal'
import PactModal from './components/PactModal'
import SyncModeModal from './components/SyncModeModal'

// pushed：该屏是否可能被 push 到 tab 宿主（Shell）之上。
// 是的话挂一个标记，让宿主和首页的返回键处理让路（见 tvTabHost 的 push 屏计数）
function WrappedComponent(Component: any, pushed = false) {
  return function inject(props: Record<string, any>) {
    const componentId = String(props.componentId ?? 'tv-root')
    const EnhancedComponent = () => (
      <Provider>
        <TVFocusScopeContext.Provider value={componentId}>
          {pushed ? <TVPushedScreenMarker /> : null}
          <TVRemoteFocusController componentId={componentId} />
          <Component
            {...props}
          />
        </TVFocusScopeContext.Provider>
      </Provider>
    )

    return <EnhancedComponent />
  }
}

export default () => {
  Navigation.registerComponent(HOME_SCREEN, () => WrappedComponent(Home))
  Navigation.registerComponent(PLAY_DETAIL_SCREEN, () => WrappedComponent(PlayDetail))
  Navigation.registerComponent(SONGLIST_DETAIL_SCREEN, () => WrappedComponent(SonglistDetail))
  Navigation.registerComponent(COMMENT_SCREEN, () => WrappedComponent(Comment))
  Navigation.registerComponent(VERSION_MODAL, () => WrappedComponent(VersionModal))
  Navigation.registerComponent(PACT_MODAL, () => WrappedComponent(PactModal))
  Navigation.registerComponent(SYNC_MODE_MODAL, () => WrappedComponent(SyncModeModal))
  // 顶部导航的六个 tab 共用一个原生 screen（见 TV/Shell.tsx）：
  // 切 tab 不再 popToRoot + push 重建整页，避免切页卡顿和首帧空底色的「黑一下」
  Navigation.registerComponent(TV_HOME_SCREEN, () => WrappedComponent(TVShell))
  Navigation.registerComponent(TV_PLAYER_SCREEN, () => WrappedComponent(TVPlayer, true))
  Navigation.registerComponent(TV_SEARCH_SCREEN, () => WrappedComponent(TVSearch, true))
  Navigation.registerComponent(TV_QUEUE_SCREEN, () => WrappedComponent(TVQueue, true))
  Navigation.registerComponent(TV_HISTORY_SCREEN, () => WrappedComponent(TVHistory, true))
  Navigation.registerComponent(TV_SETTINGS_SCREEN, () => WrappedComponent(TVSettings, true))
  Navigation.registerComponent(TV_DETAIL_SCREEN, () => WrappedComponent(TVDetail, true))
  Navigation.registerComponent(TV_MYLIST_SCREEN, () => WrappedComponent(TVMyList, true))
  Navigation.registerComponent(TV_RENAME_SCREEN, () => WrappedComponent(TVRename, true))

  console.info('All screens have been registered...')
}
