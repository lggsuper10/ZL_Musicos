import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ScrollView, View, useWindowDimensions, findNodeHandle, type ViewStyle } from 'react-native'
import TVAppleScaffold from '@/components/TV/TVAppleScaffold'
import TVTopTabs from '@/components/TV/TVTopTabs'
import TVHeroShelf from '@/components/TV/TVHeroShelf'
import TVShelf from '@/components/TV/TVShelf'
import TVPosterCard from '@/components/TV/TVPosterCard'
import TVButton from '@/components/TV/TVButton'
import type Focusable from '@/components/TV/Focusable'
import { tvColors, tvSize } from '@/theme/tv'
import { setComponentId } from '@/core/common'
import { COMPONENT_IDS } from '@/config/constant'
import { togglePlay } from '@/core/player/player'
import { useIsPlay, usePlayerMusicInfo } from '@/store/player/hook'
import { getList as getSonglist } from '@/core/songlist'
import songlistState, { type ListInfoItem } from '@/store/songlist/state'
import { useBackHandler } from '@/utils/hooks/useBackHandler'
import { useTVRemoteActions } from '@/utils/hooks/useTVRemoteActions'
import { exitApp } from '@/utils/tools'
import TVDialog from '@/components/TV/TVDialog'
import { useTVFocusRef } from '@/components/TV/useTVFocusRef'
import { useTVFocusRefresh } from '@/components/TV/useTVFocusRefresh'
import { useNavigationComponentDidAppear } from '@/navigation/hooks'
import { getTVTabHostActiveId, getTVTabHostFor, hasTVPushedScreen } from '@/components/TV/tvTabHost'
import { pushTVDetailScreen, pushTVPlayerScreen, pushTVSearchScreen } from '@/navigation/navigation'
import { createTVTabs, getSourceName } from './utils'
import { dot, tvText } from './labels'
import { getData } from '@/plugins/storage'

type FocusNode = ComponentRef<typeof Focusable> | null
type FocusRefMap = Record<string, FocusNode>

function TVHome({ componentId }: { componentId: string }) {
  const musicInfo = usePlayerMusicInfo()
  const isPlay = useIsPlay()
  const [songlists, setSonglists] = useState<ListInfoItem[]>([])
  const [exitConfirmVisible, setExitConfirmVisible] = useState(false)
  const playFocus = useTVFocusRef()
  const searchFocus = useTVFocusRef()
  const firstCardFocus = useTVFocusRef()
  const contentScrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  // 内容区实测高度（顶栏以下、上下页边距以内）。TV 屏高差异很大（720p/1080p/4K、
  // 不同 density 下逻辑高度能差一倍），固定尺寸必然在某些屏上把歌单架顶出屏幕，
  // 所以首页按实测高度等比压缩 hero + 歌单架，保证一屏放得下、不需要下滑。
  // 用 useWindowDimensions 同步拿屏高，首帧即正确缩放，无需 onLayout+opacity 首帧隐藏（避免白屏回归）
  const { height: windowHeight } = useWindowDimensions()
  const activeTabFocus = useRef<FocusNode>(null)
  const cardRefs = useRef<FocusRefMap>({})
  const sectionOffsetRef = useRef({ hero: 0, songlists: 0 })
  const appearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueFocusRefresh = useTVFocusRefresh()

  useEffect(() => { setComponentId(COMPONENT_IDS.home, componentId) }, [componentId])
  useEffect(() => () => {
    if (appearTimerRef.current) clearTimeout(appearTimerRef.current)
  }, [])
  // 首页返回键：先弹退出确认，避免遥控器误触直接退出应用。
  // 用本地 TVDialog（不走全局 showTVDialog）：Shell 内多 tab 页常驻、各自挂了 TVDialogHost，
  // 全局注册表的 activeListener 会指向最后预挂载的页，导致首页的确认框渲染到不可见页而不显示。
  //
  // 必须严格限定「首页自己当前可见」才处理，否则会吞掉别人的返回键：
  // - 有 push 屏（播放页/详情页）盖在上面时让路，否则 push 屏关不掉；
  // - 当前在别的 tab 时让路，交给那个 tab 的 useTVNavigationBack 切回首页。
  // 以前不管在哪都弹确认框，而确认框渲染在不可见的首页里 —— 用户看到的就是
  // 「返回键和方向键全都没反应」（弹窗激活后焦点控制器整个让路）。
  // 回调必须稳定（useCallback）：内联箭头函数会让这个监听在每次渲染后重新注册，
  // 永远排在 BackHandler 分发的第一位，把其它页的返回键全抢走。
  const handleHomeBack = useCallback(() => {
    if (hasTVPushedScreen()) return false
    if (!getTVTabHostFor(componentId)) return false
    if (getTVTabHostActiveId() !== 'home') return false
    setExitConfirmVisible(true)
    return true
  }, [componentId])
  useBackHandler(handleHomeBack)

  useTVRemoteActions({
    playPause: () => {
      if (musicInfo.id) {
        togglePlay()
        pushTVPlayerScreen(componentId)
        return
      }
      pushTVSearchScreen(componentId)
    },
  })

  // 排行榜推荐源跟随排行榜页选择（09-22 老板需求）：
  // 持久化键 tv_board_source（History 页写入），未选过时回退 sources[0]（酷我）
  const [boardSource, setBoardSource] = useState<LX.OnlineSource | null>(null)
  const readBoardSource = useCallback(() => {
    void getData<LX.OnlineSource>('tv_board_source').then(saved => {
      if (saved && songlistState.sources.includes(saved)) setBoardSource(saved)
    }).catch(() => { })
  }, [])
  useEffect(() => { readBoardSource() }, [readBoardSource])
  const songlistSource = boardSource ?? songlistState.sources[0]
  const sortId = songlistSource ? songlistState.sortList[songlistSource]?.[0]?.id : ''

  useEffect(() => {
    let mounted = true
    const load = async() => {
      try {
        const emptySonglistResult: Awaited<ReturnType<typeof getSonglist>> = {
          list: [],
          total: 0,
          page: 1,
          limit: 30,
          maxPage: 1,
          key: null,
          source: songlistSource ?? 'kw',
          tagId: '',
          sortId: sortId ?? '',
        }
        const songlistResult = songlistSource && sortId ? await getSonglist(songlistSource, '', sortId, 1) : emptySonglistResult
        if (!mounted) return
        setSonglists(songlistResult.list.slice(0, 12))
      } catch {
        if (!mounted) return
        setSonglists([])
      }
    }
    void load()
    return () => { mounted = false }
  }, [songlistSource, sortId])

  // 性能关键：ref 回调必须保持稳定引用，并且只在「节点真的换了」时才触发刷新。
  // 若每次渲染都新建箭头函数，React 会在每次提交时先以 null、再以节点调用它，
  // cardRefs 里的引用随之看似变化 → queueFocusRefresh() → setState → 再渲染，
  // 于是形成每帧一次的重渲染死循环（首页 30 多张卡片、每帧上百次 findNodeHandle），
  // 表现就是遥控器移动焦点明显卡顿。这里做两件事：缓存回调 + 按节点去重通知。
  const cardRefCallbacks = useRef<Record<string, (node: FocusNode) => void>>({})
  const notifiedCardNodes = useRef<Record<string, FocusNode>>({})

  const getCardRefCallback = (key: string, syncFirst = false) => {
    const cacheKey = `${key}_${syncFirst ? 1 : 0}`
    let callback = cardRefCallbacks.current[cacheKey]
    if (!callback) {
      callback = (node: FocusNode) => {
        cardRefs.current[key] = node
        if (!node) return
        const needSyncFirst = syncFirst && firstCardFocus.ref.current !== node
        if (needSyncFirst) firstCardFocus.ref.current = node as any
        const freshNode = notifiedCardNodes.current[key] !== node
        if (freshNode) notifiedCardNodes.current[key] = node
        if (freshNode || needSyncFirst) queueFocusRefresh()
      }
      cardRefCallbacks.current[cacheKey] = callback
    }
    return callback
  }
  const getActiveTabHandle = () => activeTabFocus.current ? findNodeHandle(activeTabFocus.current) : null
  const getCardHandle = (key?: string | null) => key && cardRefs.current[key] ? findNodeHandle(cardRefs.current[key]) : null
  const scrollToHero = useCallback((animated = true) => {
    contentScrollRef.current?.scrollTo({ y: Math.max(0, sectionOffsetRef.current.hero - tvSize(12)), animated })
  }, [])
  const scrollToSonglists = useCallback((animated = true) => {
    contentScrollRef.current?.scrollTo({ y: Math.max(0, sectionOffsetRef.current.songlists - tvSize(18)), animated })
  }, [])
  const handleHeroFocusChange = useCallback((focused: boolean) => {
    if (focused) scrollToHero()
  }, [scrollToHero])
  const handleSonglistFocusChange = useCallback((focused: boolean) => {
    if (focused) scrollToSonglists()
  }, [scrollToSonglists])

  useNavigationComponentDidAppear(componentId, useCallback(() => {
    const resetHomeContent = () => { scrollToHero(false) }
    requestAnimationFrame(resetHomeContent)
    if (appearTimerRef.current) clearTimeout(appearTimerRef.current)
    appearTimerRef.current = setTimeout(() => {
      appearTimerRef.current = null
      resetHomeContent()
    }, 260)
    // 回到首页时重读排行榜页选的源，推荐架即时跟随（09-22）
    readBoardSource()
    queueFocusRefresh()
  }, [queueFocusRefresh, readBoardSource, scrollToHero]))

  const openSonglist = (songlist: ListInfoItem) => {
    pushTVDetailScreen(componentId, { type: 'songlist', id: songlist.id, source: songlist.source, title: songlist.name, subtitle: songlist.desc ?? songlist.author, songlist })
  }

  // 一屏布局：设计稿里 hero(≈280) + 歌单架(≈310) 在 720p 逻辑高度下正好占满，
  // 换算成 tvSize 约 680。
  // 关键：顶栏和页面上下内边距是固定占用的高度，必须先扣掉，剩下的才是内容视口。
  // 之前直接拿 windowHeight / 680 算系数，把顶栏和内边距也算进了内容区，系数偏大
  // （720p 上算出来是 1.0），hero + 歌单架仍超出视口一截，首页不得不下滑。
  // 短屏按可用高度等比压缩，长屏保持 1 不放大；下限 0.5 防止极端小窗把字压到看不清。
  const chromeHeight = tvSize(34) * 2 + tvSize(74) + tvSize(26)
  // 再留 12px 余量：各段尺寸都是取整后的和，四舍五入累加可能刚好差出 1~2px，
  // 那点差值也会让 ScrollView 变成「可下滑」。
  const contentScale = useMemo(() => Math.max(0.5, Math.min(1, (windowHeight - chromeHeight - tvSize(12)) / tvSize(680))), [chromeHeight, windowHeight])
  // 紧凑模式（屏幕矮）下省掉卡片第三行播放量：两行文字足够识别，
  // 省下的高度让给封面和标题，比把三行全挤成小字更好认。
  const compactCards = contentScale < 0.95
  const z = useCallback((value: number) => Math.max(1, Math.round(value * contentScale)), [contentScale])
  const heroButtonStyle = useMemo(() => ({
    minHeight: z(tvSize(54)),
    paddingHorizontal: z(tvSize(26)),
    paddingVertical: z(tvSize(14)),
  }), [z])

  const heroTitle = musicInfo.name || tvText.livingRoom
  const heroSubtitle = musicInfo.id
    ? `${musicInfo.singer || tvText.unknownSinger}${dot}${isPlay ? tvText.playing : tvText.paused}`
    : tvText.allMusicDesc
  // Hero 上按「下」落到第一张推荐歌单卡：「我的歌单」已搬到顶部 Tab，不再出现在首页，
  // 所以焦点链改为指向下方第一条推荐内容（firstCardFocus 由首张推荐卡同步）。
  const heroNextDownHandle = firstCardFocus.getNodeHandle()

  return (
    <TVAppleScaffold image={musicInfo.pic}>
      <TVTopTabs items={createTVTabs(componentId, 'home')} activeId="home" hasTVPreferredFocus nextFocusDown={playFocus.getNodeHandle() ?? undefined} activeTabRef={activeTabFocus as any} onActiveTabReady={queueFocusRefresh} />
      <ScrollView ref={contentScrollRef} style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        <View onLayout={event => { sectionOffsetRef.current.hero = event.nativeEvent.layout.y }}>
          <TVHeroShelf kicker={tvText.todayRecommend} title={heroTitle} subtitle={heroSubtitle} image={musicInfo.pic} scale={contentScale}>
            <TVButton ref={playFocus.ref as any} label={musicInfo.id ? '查看详情' : tvText.searchSong} tone="dark" style={heroButtonStyle} onFocus={() => { scrollToHero() }} onTVFocusChange={handleHeroFocusChange} onPress={() => {
              if (musicInfo.id) { pushTVPlayerScreen(componentId); return }
              pushTVSearchScreen(componentId)
            }} nextFocusUp={getActiveTabHandle() ?? undefined} nextFocusRight={searchFocus.getNodeHandle() ?? undefined} nextFocusDown={heroNextDownHandle ?? undefined} />
            <TVButton ref={searchFocus.ref as any} label={tvText.search} tone="dark" style={heroButtonStyle} onFocus={() => { scrollToHero() }} onTVFocusChange={handleHeroFocusChange} onPress={() => { pushTVSearchScreen(componentId) }} nextFocusUp={getActiveTabHandle() ?? undefined} nextFocusLeft={playFocus.getNodeHandle() ?? undefined} nextFocusDown={heroNextDownHandle ?? undefined} />
          </TVHeroShelf>
        </View>

        <View onLayout={event => { sectionOffsetRef.current.songlists = event.nativeEvent.layout.y }}>
          <TVShelf title={tvText.recommendSonglist} subtitle={songlistSource ? `${getSourceName(songlistSource)}` : tvText.loading} scale={contentScale}>
            {songlists.map((item, index) => {
              const key = `songlist_${item.source}_${item.id}`
              const nextKey = songlists[index + 1] ? `songlist_${songlists[index + 1].source}_${songlists[index + 1].id}` : null
              const prevKey = songlists[index - 1] ? `songlist_${songlists[index - 1].source}_${songlists[index - 1].id}` : null
              return <TVPosterCard key={key} ref={getCardRefCallback(key, index === 0) as any} title={item.name} subtitle={item.author || tvText.songlist} meta={compactCards ? undefined : (item.play_count ? `${item.play_count}` : tvText.openSonglist)} image={item.img} size="medium" scale={contentScale} tint={index % 2 ? tvColors.purple : tvColors.primary} onFocus={() => { scrollToSonglists() }} onTVFocusChange={handleSonglistFocusChange} onPress={() => { openSonglist(item) }} nextFocusUp={getActiveTabHandle() ?? undefined} nextFocusLeft={getCardHandle(prevKey) ?? playFocus.getNodeHandle() ?? undefined} nextFocusRight={getCardHandle(nextKey) ?? getCardHandle(key) ?? undefined} nextFocusDown={getCardHandle(key) ?? undefined} />
            })}
          </TVShelf>
        </View>
      </ScrollView>
      <TVDialog
        visible={exitConfirmVisible}
        title={tvText.exitConfirmTitle}
        message={tvText.exitConfirmMessage}
        buttons={[
          { label: tvText.cancelAction, tone: 'dark', onPress: () => { setExitConfirmVisible(false) } },
          { label: tvText.exitApp, tone: 'primary', onPress: () => { setExitConfirmVisible(false); exitApp() } },
        ]}
      />
    </TVAppleScaffold>
  )
}

const styles: Record<string, ViewStyle | any> = {
  contentScroll: { flex: 1 },
}

export default memo(TVHome)
