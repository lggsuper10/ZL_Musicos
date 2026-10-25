import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { ScrollView, View, useWindowDimensions, findNodeHandle, type TextStyle, type ViewStyle } from 'react-native'
import TVAppleScaffold from '@/components/TV/TVAppleScaffold'
import TVTopTabs from '@/components/TV/TVTopTabs'
import TVText from '@/components/TV/TVText'
import TVPosterCard from '@/components/TV/TVPosterCard'
import Focusable from '@/components/TV/Focusable'
import TVDialog, { type TVDialogRequest } from '@/components/TV/TVDialog'
import TVChoosePath from '@/components/TV/TVChoosePath'
import { tvColors, tvFont, tvSize, tvTokens } from '@/theme/tv'
import { useMyList } from '@/store/list/hook'
import { removeUserList, getListMusics } from '@/core/list'
import { LIST_IDS } from '@/config/constant'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { pushTVDetailScreen, pushTVPlayerScreen, pushTVRenameScreen, pushTVSettingsScreen } from '@/navigation/navigation'
import { confirmDialog, tipDialog } from '@/utils/tools'
import { useTVFocusRef } from '@/components/TV/useTVFocusRef'
import { useTVFocusRefresh } from '@/components/TV/useTVFocusRefresh'
import { useTVNavigationBack } from '@/utils/hooks/useTVNavigationBack'
import { useTVRemoteActions } from '@/utils/hooks/useTVRemoteActions'
import { tvText } from './labels'
import { createTVTabs, getSourceName } from './utils'

type FocusNode = ComponentRef<typeof Focusable> | null
type FocusRefMap = Record<string, FocusNode>
interface SonglistResult { ok: boolean, message: string }

// 手机端导入/改名/删除的结果缓存在模块级：本页被切走再回来时组件会重新挂载、
// state 会被重置，这里留一份，保证用户回到本页仍能看到「上次的结果」。
let lastSonglistResultCache: SonglistResult | null = null

// 常驻的「导入歌单」入口卡片。这张卡任何时候都在（空态时它兼任空态提示），
// 所以 key 用固定的 IMPORT_CARD_KEY，不随歌单数量变化。
const IMPORT_CARD_KEY = '__mylist_import__'

function TVMyList({ componentId }: { componentId: string }) {
  const musicInfo = usePlayerMusicInfo()
  const [localDiskFocused, setLocalDiskFocused] = useState(false)
  const [chooseLocalVisible, setChooseLocalVisible] = useState(false)
  const allLists = useMyList()
  // 「我的歌单」只展示用户自己建的（含手机导入的）列表，试听列表/我的收藏不在这里重复出现
  const userSonglists = useMemo(
    () => allLists.filter((item): item is LX.List.UserListInfo => item.id !== LIST_IDS.DEFAULT && item.id !== LIST_IDS.LOVE),
    [allLists],
  )
  // 卡片带歌曲数：自动命名的歌单名几乎一样，没数量分不出哪张是哪张（09-19 实测：加完歌不知道加到哪张了）；
  // 歌单内容/列表结构变化时实时重算，从播放列表加完歌回本页，数量立刻更新
  const [songCounts, setSongCounts] = useState<Record<string, number>>({})
  const [importFocused, setImportFocused] = useState(false)
  // 卡片封面：取每个歌单第一首歌的专辑图（没有则保持占位图）；「我的收藏」一并计数（09-20 需求）
  const [cardCovers, setCardCovers] = useState<Record<string, string>>({})
  useEffect(() => {
    let mounted = true
    const load = async() => {
      const targetIds = [LIST_IDS.LOVE, ...userSonglists.map(list => list.id)]
      const results = await Promise.all(targetIds.map(async(id): Promise<[string, number, string]> => {
        const musics = await getListMusics(id)
        const first = musics[0] as unknown as { meta?: { picUrl?: string | null } } | undefined
        const pic = first?.meta?.picUrl ?? ''
        return [id, musics.length, pic]
      }))
      if (!mounted) return
      setSongCounts(Object.fromEntries(results.map(([id, count]) => [id, count])))
      setCardCovers(Object.fromEntries(results.map(([id, , pic]) => [id, pic])))
    }
    void load()
    const handleMusicUpdate = (ids: string[]) => {
      if (ids.some(id => id === LIST_IDS.LOVE || userSonglists.some(list => list.id === id))) void load()
    }
    const handleListsChanged = () => { void load() }
    global.app_event.on('myListMusicUpdate', handleMusicUpdate)
    global.state_event.on('mylistUpdated', handleListsChanged)
    return () => {
      mounted = false
      global.app_event.off('myListMusicUpdate', handleMusicUpdate)
      global.state_event.off('mylistUpdated', handleListsChanged)
    }
  }, [userSonglists])
  // 手机端操作歌单的结果（由设置页广播），直接显示在本页
  const [importResult, setImportResult] = useState<SonglistResult | null>(() => lastSonglistResultCache)
  const [localDialog, setLocalDialog] = useState<TVDialogRequest | null>(null)
  const firstCardFocus = useTVFocusRef()
  const cardRefs = useRef<FocusRefMap>({})
  const listRefresh = useTVFocusRefresh()
  // 顶部导航接线契约：首排卡片按上直达导航栏（不接的话靠几何回退兜底，布局一变就脆）
  const activeTabFocus = useRef<FocusNode>(null)
  const getActiveTabHandle = () => (activeTabFocus.current ? findNodeHandle(activeTabFocus.current) : null)

  // 与推荐页（Home）同一套等比缩放：按实测视口高度把标题、卡片、间距整体缩进一屏。
  // 只认第一次有效测量——顶栏 tab 获得/失去焦点时高度会变，跟着重算会让整页字号跳一下。
  // 用 useWindowDimensions 同步拿到屏高，首帧即给出正确缩放系数，无需 onLayout+opacity 首帧隐藏
  // （那套方案在部分 TV 设备上 onLayout 未触发会导致整页永久 opacity:0 白屏）。缩放行为不变：高屏不缩、矮屏等比缩进一屏。
  const { height: windowHeight } = useWindowDimensions()
  const contentScale = useMemo(() => Math.max(0.5, Math.min(1, windowHeight / tvSize(680))), [windowHeight])
  const z = useCallback((value: number) => Math.max(1, Math.round(value * contentScale)), [contentScale])

  // ── 「聚焦即滚动」 ──────────────────────────────────────────────
  // 本页 ScrollView 原先没有任何滚动管理：卡片换行到第二排及以后时，整排在屏幕外，
  // 但焦点引擎用 measureInWindow 仍量得到（rect 只是 y 越界）→ 焦点能移过去、用户却看不见。
  // Home.tsx 已有同款做法；这里按「聚焦到哪张卡，就把那张卡所在的【整排】露出来」实现，
  // 比 Home 多一步：Home 每屏只有一排（shelf），本页是 flexWrap 多排网格，只滚到面板顶不够
  // （实测 960x540dp 6 张卡时仍有 5 张在屏外）。
  const contentScrollRef = useRef<ComponentRef<typeof ScrollView>>(null)
  const scrollYRef = useRef(0) // 当前滚动位移（onScroll，仅写 ref → 不触发重渲染）
  const viewportHRef = useRef(0) // ScrollView 可视高度（onLayout）
  const gridTopRef = useRef(0) // 卡片网格在「滚动内容」坐标系里的 y（onLayout 挂在网格节点上）
  const cardBoxes = useRef<Record<string, { y: number, height: number }>>({})

  const recordCardBox = (key: string, y: number, height: number) => {
    const prev = cardBoxes.current[key]
    if (prev && prev.y === y && prev.height === height) return
    cardBoxes.current[key] = { y, height }
  }

  // 只在「该排没完整露出来」时才滚动，且只滚最小距离 —— 内容放得下时是纯 no-op
  const revealCardRow = useCallback((key: string) => {
    const scroller = contentScrollRef.current
    const box = cardBoxes.current[key]
    const viewport = viewportHRef.current
    if (!scroller || !box || viewport <= 0) return
    const margin = tvSize(12)
    // 卡片是 grid 的直接子节点，onLayout.y 相对 grid；grid 自身在滚动内容里的 y 另由 onLayout 记录
    const rowTop = gridTopRef.current + box.y
    const rowBottom = rowTop + box.height
    const y = scrollYRef.current
    if (rowBottom > y + viewport - margin) {
      scroller.scrollTo({ y: rowBottom - viewport + margin, animated: true })
    } else if (rowTop < y + margin) {
      scroller.scrollTo({ y: Math.max(0, rowTop - margin), animated: true })
    }
  }, [])

  useEffect(() => {
    const handleImportResult = (result: SonglistResult) => {
      lastSonglistResultCache = result
      setImportResult(result)
    }
    global.app_event.on('songlistImportResult', handleImportResult)
    return () => { global.app_event.off('songlistImportResult', handleImportResult) }
  }, [])

  // 页面挂载后补一次延迟刷新：首次渲染时卡片 ref 为空 → 顶部 Tab 的 nextFocusDown 拿不到句柄，
  // 引擎找不到「下」的目标，焦点会「悬空」。
  const mountRefreshRef = useRef(false)
  useEffect(() => {
    if (mountRefreshRef.current) return
    mountRefreshRef.current = true
    const timer = setTimeout(() => { listRefresh() }, 350)
    return () => { clearTimeout(timer) }
  }, [listRefresh])

  useTVNavigationBack(componentId)
  useTVRemoteActions({
    playPause: () => { if (musicInfo.id) pushTVPlayerScreen(componentId) },
  })

  // 性能关键：ref 回调必须保持稳定引用，并且只在「节点真的换了」时才触发刷新。
  // 若每次渲染都新建箭头函数，React 会在每次提交时先以 null、再以节点调用它，
  // cardRefs 里的引用随之看似变化 → listRefresh() → setState → 再渲染，
  // 于是形成每帧一次的重渲染死循环，遥控器移动焦点会明显卡顿。
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
        if (freshNode || needSyncFirst) listRefresh()
      }
      cardRefCallbacks.current[cacheKey] = callback
    }
    return callback
  }

  const openMySonglist = (list: LX.List.UserListInfo) => {
    pushTVDetailScreen(componentId, { type: 'userlist', id: list.id, title: list.name, subtitle: list.source ? getSourceName(list.source) : undefined, source: list.source, userlist: list })
  }

  const handleRemoveSonglist = async(list: LX.List.UserListInfo) => {
    const confirmed = await confirmDialog({
      title: `${tvText.deleteSonglist}：${list.name}`,
      message: tvText.deleteSonglistConfirm,
      confirmButtonText: tvText.deleteSonglist,
      cancelButtonText: tvText.cancelAction,
    })
    if (!confirmed) return
    try {
      await removeUserList([list.id])
      // 歌单没了，聚焦的那张卡也被卸载了，重排一次焦点免得遥控器「悬空」
      listRefresh()
      await tipDialog({ title: tvText.deleteSonglistDone, message: list.name, btnText: tvText.knowIt })
    } catch (err: unknown) {
      await tipDialog({ title: tvText.deleteSonglistFailed, message: err instanceof Error ? err.message : '', btnText: tvText.knowIt })
    }
  }

  // 遥控器「长按 OK」= 歌单管理。改名现在可以直接在电视上做（屏上键盘），
  // 但电视遥控器输不了中文，所以仍保留「去手机改」的说明。
  const handleManageSonglist = (list: LX.List.UserListInfo) => {
    setLocalDialog({
      title: `${tvText.managingSonglist}：${list.name}`,
      message: tvText.renameSonglistNeedPhone,
      buttons: [
        { label: tvText.cancelAction, tone: 'dark' },
        { label: tvText.renameAction, tone: 'primary', onPress: () => { pushTVRenameScreen(componentId, { id: list.id, name: list.name }) } },
        { label: tvText.deleteSonglist, tone: 'danger', onPress: () => { void handleRemoveSonglist(list) } },
      ],
    })
  }

  const hasLists = userSonglists.length > 0

  return (
    <TVAppleScaffold image={musicInfo.pic}>
      <TVTopTabs items={createTVTabs(componentId, 'mylist')} activeId="mylist" hasTVPreferredFocus nextFocusDown={firstCardFocus.getNodeHandle() ?? undefined} activeTabRef={activeTabFocus} onActiveTabReady={listRefresh} />
      {/* 聚焦即滚动：ScrollView 记录滚动位移 / 可视高度，卡片获焦时把它所在的【整排】滚进视野（见上方 revealCardRow） */}
      <ScrollView
        ref={contentScrollRef}
        style={styles.bodyScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: z(tvSize(36)) }]}
        scrollEventThrottle={16}
        onScroll={(e) => { scrollYRef.current = e.nativeEvent.contentOffset.y }}
        onLayout={(e) => { viewportHRef.current = e.nativeEvent.layout.height }}
      >
        {/* 版式与排行榜 / 播放列表页一致：无外框、大标题 + 一行说明，内容直接铺在背景上 */}
        <View style={[styles.header, { marginBottom: z(tvSize(18)) }]}>
          <TVText variant="pageTitle" style={[styles.title, { fontSize: z(tvTokens.heroTitle), lineHeight: z(tvFont(66)) }]}>{tvText.mySonglists}</TVText>
          <TVText variant="caption" style={[styles.subtitle, { marginTop: z(tvSize(6)) }]} numberOfLines={1}>
            {hasLists ? `${userSonglists.length} ${tvText.songlist}` : tvText.emptyMySonglists}
          </TVText>
        </View>
        <TVText variant="caption" color={tvColors.dimText} style={[styles.hint, { marginBottom: z(tvSize(12)), marginLeft: z(tvSize(8)) }]}>{tvText.myListHint}</TVText>
        {/* 注意：这里【不再】按 hasLists 二选一渲染。
            以前「导入歌单」入口只长在空态卡上，一旦导入成功第一张歌单，hasLists 变 true，
            整张空态卡（连同 onPress → 扫码页）就被卸载了，页面上再也没有第二次导入的入口 ——
            这就是「歌单只能导入一个，想导入第二个没反应」的直接原因。
            入口卡保持与歌单卡同尺寸的方形卡（虚线边框 + ＋ 号），换行后由「聚焦即滚动」保证可见。 */}
        <View style={[styles.grid, { gap: z(tvSize(18)) }]} onLayout={(e) => { gridTopRef.current = e.nativeEvent.layout.y }}>
          <Focusable
            ref={getCardRefCallback(IMPORT_CARD_KEY, true) as any}
            style={[styles.importCard, { width: z(tvSize(210)), padding: z(tvSize(8)) }]}
            focusStyle={styles.importCardFocus}
            onPress={() => { pushTVSettingsScreen(componentId) }}
            onTVFocusChange={setImportFocused}
            onFocus={() => { revealCardRow(IMPORT_CARD_KEY) }}
            onLayout={(e) => { recordCardBox(IMPORT_CARD_KEY, e.nativeEvent.layout.y, e.nativeEvent.layout.height) }}
            nextFocusUp={getActiveTabHandle() ?? undefined}
          >
            {/* 虚线边框只包封面、不包文字，尺寸与右侧歌单卡完全对齐（焦点时才换成实线高亮） */}
            <View style={[styles.importArt, { width: z(tvSize(210)), height: z(tvSize(210)), borderRadius: z(tvTokens.radiusLg) }, importFocused ? styles.importArtFocus : null]}>
              <TVText style={[styles.importPlus, { fontSize: z(tvFont(56)) }]}>＋</TVText>
            </View>
            <TVText variant="cardTitle" numberOfLines={1} style={[styles.importTitle, { marginTop: z(tvSize(14)), fontSize: z(tvFont(21)) }]}>{tvText.importSonglist}</TVText>
            <TVText variant="caption" color={tvColors.dimText} numberOfLines={1} style={[styles.importHint, { marginTop: z(tvSize(5)), fontSize: z(tvTokens.caption) }]}>手机扫码 / 粘贴链接</TVText>
          </Focusable>
          {/* 「从硬盘添加本地歌」常驻卡：TV 端此前完全没有本地文件导入入口，
              手机端只能在「我的歌单」菜单里选文件夹、遥控器用不了。这里提供一个 TV 入口，
              打开 TVChoosePath 目录浏览器选文件夹，把里面的音频扫进「本地歌曲」歌单。 */}
          <Focusable
            ref={getCardRefCallback('mylist_local_disk') as any}
            style={[styles.importCard, { width: z(tvSize(210)), padding: z(tvSize(8)) }]}
            focusStyle={styles.importCardFocus}
            onPress={() => { setChooseLocalVisible(true) }}
            onTVFocusChange={setLocalDiskFocused}
            onFocus={() => { revealCardRow('mylist_local_disk') }}
            onLayout={(e) => { recordCardBox('mylist_local_disk', e.nativeEvent.layout.y, e.nativeEvent.layout.height) }}
            nextFocusUp={getActiveTabHandle() ?? undefined}
          >
            <View style={[styles.importArt, { width: z(tvSize(210)), height: z(tvSize(210)), borderRadius: z(tvTokens.radiusLg) }, localDiskFocused ? styles.importArtFocus : null]}>
              <TVText style={[styles.importPlus, { fontSize: z(tvFont(56)) }]}>💿</TVText>
            </View>
            <TVText variant="cardTitle" numberOfLines={1} style={[styles.importTitle, { marginTop: z(tvSize(14)), fontSize: z(tvFont(21)) }]}>{tvText.addLocalSongDisk}</TVText>
            <TVText variant="caption" color={tvColors.dimText} numberOfLines={1} style={[styles.importHint, { marginTop: z(tvSize(5)), fontSize: z(tvTokens.caption) }]}>选择文件夹</TVText>
          </Focusable>
          {/* 「我的收藏」常驻卡：上游一直存在这个列表，但 TV 端此前无任何入口（09-20 需求）；
              红色调与自建歌单区分，封面取收藏里第一首歌的专辑图 */}
          <TVPosterCard
            key="mylist_love"
            ref={getCardRefCallback('mylist_love') as any}
            title="我的收藏"
            subtitle={`收藏 · ${songCounts[LIST_IDS.LOVE] ?? '…'} 首`}
            size="medium"
            scale={contentScale}
            tint={tvColors.warn}
            coverFallback="music"
            image={cardCovers[LIST_IDS.LOVE] || undefined}
            onPress={() => {
              pushTVDetailScreen(componentId, { type: 'userlist', id: LIST_IDS.LOVE, title: '我的收藏', subtitle: '收藏', userlist: { id: LIST_IDS.LOVE, name: '我的收藏', locationUpdateTime: null } as unknown as LX.List.UserListInfo })
            }}
            onFocus={() => { revealCardRow('mylist_love') }}
            onLayout={(e) => { recordCardBox('mylist_love', e.nativeEvent.layout.y, e.nativeEvent.layout.height) }}
            nextFocusUp={getActiveTabHandle() ?? undefined}
          />
          {userSonglists.map((item, index) => (
            <TVPosterCard
              key={`mylist_${item.id}`}
              ref={getCardRefCallback(`mylist_${item.id}`) as any}
              title={item.name}
              subtitle={`${item.source ? getSourceName(item.source) : tvText.songlist} · ${songCounts[item.id] ?? '…'} 首`}
              meta={tvText.longPressManage}
              size="medium"
              scale={contentScale}
              tint={index % 2 ? tvColors.primary : tvColors.purple}
              coverFallback="music"
              image={cardCovers[item.id] || undefined}
              onPress={() => { openMySonglist(item) }}
              onLongPress={() => { handleManageSonglist(item) }}
              onFocus={() => { revealCardRow(`mylist_${item.id}`) }}
              onLayout={(e) => { recordCardBox(`mylist_${item.id}`, e.nativeEvent.layout.y, e.nativeEvent.layout.height) }}
              nextFocusUp={getActiveTabHandle() ?? undefined}
            />
          ))}
        </View>
        {importResult
          ? <TVText variant="caption" color={importResult.ok ? tvColors.primaryHigh : tvColors.warn} style={[styles.resultLine, { marginTop: z(tvSize(16)) }]}>{`${tvText.lastImportResult}${importResult.message}`}</TVText>
          : null}
      </ScrollView>
      <TVDialog
        visible={!!localDialog}
        resetKey={localDialog}
        title={localDialog?.title ?? ''}
        message={localDialog?.message}
        buttons={localDialog?.buttons?.map(btn => ({
          ...btn,
          onPress: () => {
            setLocalDialog(null)
            btn.onPress?.()
          },
        })) ?? []}
        onDismiss={() => {
          localDialog?.onDismiss?.()
          setLocalDialog(null)
        }}
      />
      <TVChoosePath visible={chooseLocalVisible} onClose={() => setChooseLocalVisible(false)} />
    </TVAppleScaffold>
  )
}

const styles: Record<string, ViewStyle | TextStyle | any> = {
  bodyScroll: { flex: 1 },
  content: { paddingBottom: tvSize(40) },
  header: { marginBottom: tvSize(20) },
  title: { fontSize: tvTokens.heroTitle, lineHeight: tvFont(66), flexShrink: 0 },
  subtitle: { marginTop: tvSize(8), color: tvColors.subtext },
  hint: { marginTop: tvSize(10) },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: tvSize(18) },
  // 入口卡：与歌单卡同尺寸的方形卡，用「虚线边框 + ＋ 号」与歌单卡区分，
  // 刻意不改成独占整行的横幅 —— 横幅会造成明显布局位移，卡片换行后的可见性由「聚焦即滚动」保证。
  importCard: {
    width: tvSize(210),
    padding: tvSize(8),
  },
  importArt: {
    width: tvSize(210),
    height: tvSize(210),
    borderRadius: tvTokens.radiusLg,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: tvColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  // 焦点高亮只画在封面上（见 importArtFocus），整卡不再套一圈，避免双边框
  importCardFocus: { backgroundColor: 'transparent', borderColor: 'transparent', shadowOpacity: 0, elevation: 0 },
  importArtFocus: { borderColor: tvColors.focus, borderStyle: 'solid', backgroundColor: 'rgba(255,255,255,0.08)' },
  importPlus: { color: tvColors.primaryHigh, fontWeight: '900' },
  importTitle: { marginTop: tvSize(14) },
  importHint: { marginTop: tvSize(5) },
  resultLine: { marginTop: tvSize(16), lineHeight: tvSize(22) },
}

export default memo(TVMyList)
