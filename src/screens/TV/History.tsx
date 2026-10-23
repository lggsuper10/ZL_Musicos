import { memo, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { FlatList, ScrollView, View, findNodeHandle, type TextStyle, type ViewStyle } from 'react-native'
import TVAppleScaffold from '@/components/TV/TVAppleScaffold'
import TVTopTabs from '@/components/TV/TVTopTabs'
import TVText from '@/components/TV/TVText'
import TVButton from '@/components/TV/TVButton'
import TVFadeOverlay from '@/components/TV/TVFadeOverlay'
import Focusable from '@/components/TV/Focusable'
import searchMusicState from '@/store/search/music/state'
import { tvColors, tvFont, tvSize } from '@/theme/tv'
import { getBoardsList } from '@/core/leaderboard'
import leaderboardState, { type BoardItem } from '@/store/leaderboard/state'
import { pushTVDetailScreen, pushTVPlayerScreen } from '@/navigation/navigation'
import { useTVNavigationBack } from '@/utils/hooks/useTVNavigationBack'
import { useTVRemoteActions } from '@/utils/hooks/useTVRemoteActions'
import { useTVFocusRef } from '@/components/TV/useTVFocusRef'
import { useTVFocusRefresh } from '@/components/TV/useTVFocusRefresh'
import { focusTVTargetByRef } from '@/components/TV/tvFocusManager'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { dot, tvText } from './labels'
import { createTVTabs, getSourceName } from './utils'
import { getData, saveData } from '@/plugins/storage'

type FocusNode = ComponentRef<typeof Focusable> | null
type FocusRefMap = Record<string, FocusNode>
const ITEM_SIZE = tvSize(66)

function TVHistory({ componentId }: { componentId: string }) {
  const currentMusicInfo = usePlayerMusicInfo()
  const [boards, setBoards] = useState<BoardItem[]>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [loadingText, setLoadingText] = useState(tvText.loading + tvText.hotChart)
  const playerFocus = useTVFocusRef()
  const firstBoardFocus = useTVFocusRef()
  const activeTabFocus = useRef<FocusNode>(null)
  const listRef = useRef<FlatList<BoardItem>>(null)
  const boardRefs = useRef<FocusRefMap>({})
  const queueFocusRefresh = useTVFocusRefresh()
  // 首次加载焦点补偿只做一次（见 load effect 内注释）
  const initialFocusDoneRef = useRef(false)

  useTVNavigationBack(componentId)
  const [sourceSel, setSourceSel] = useState<string>(leaderboardState.sources[0] ?? '')
  const boardSource = sourceSel as typeof leaderboardState.sources[0]
  const sourceRefs = useRef<FocusRefMap>({})
  const sourceOptions = useMemo(() => searchMusicState.sources.filter(s => s !== 'all'), [searchMusicState.sources])
  const sourceTabs = useMemo(() => sourceOptions.map(s => ({ id: s, label: getSourceName(s) ?? s })), [sourceOptions])
  // 首选源持久化（09-22 老板需求）：排行榜页选过的源记住，首页推荐架跟随同一源
  useEffect(() => {
    void getData<string>('tv_board_source').then(saved => {
      if (saved && sourceOptions.includes(saved) && saved !== sourceSel) setSourceSel(saved)
    }).catch(() => { })
  }, [])
  const getSourceHandle = (id?: string | null) => id && sourceRefs.current[id] ? findNodeHandle(sourceRefs.current[id]) : null
  const bindSourceRef = (id: string) => (node: FocusNode) => { sourceRefs.current[id] = node }
  const handleSourceChange = (newSource: string) => {
    if (newSource === sourceSel) return
    setSourceSel(newSource)
    setSelectedIndex(0)
    setLoadingText(tvText.loading + tvText.hotChart)
    void saveData('tv_board_source', newSource).catch(() => { })
  }
  const selectedBoard = boards[selectedIndex] ?? null
  // 右栏光晕颜色随选中榜单轮换，让「焦点移动 → 右侧预览变化」有更明显的视觉反馈
  const previewTint = [tvColors.primary, tvColors.purple, tvColors.orange][selectedIndex % 3]

  useEffect(() => {
    let mounted = true
    const load = async() => {
      try {
        const result = boardSource ? await getBoardsList(boardSource) : []
        if (!mounted) return
        // 复制快照：getBoardsList 返回 store 活引用，进 state 必须复制（项目铁律）
        setBoards([...result])
        setLoadingText(result.length ? '' : tvText.noAvailableCharts)
        // 焦点引擎已改为「preferred 不抢仍挂载的活动焦点」：榜单行是异步挂载的 preferred，
        // 冷加载慢时进屏初始焦点已落在顶部导航、晚到的 preferred 不再抢到首行——首次加载
        // 成功后显式补偿。切源不补偿：焦点留在源 Tab 方便连续对比，与旧版由用户自己下键一致
        if (!initialFocusDoneRef.current && result.length) {
          initialFocusDoneRef.current = true
          requestAnimationFrame(() => { void focusTVTargetByRef(firstBoardFocus.ref.current) })
        }
      } catch (err: unknown) {
        if (!mounted) return
        setBoards([])
        setLoadingText(err instanceof Error ? `${tvText.chartLoadFailed}${dot}${err.message}` : tvText.chartLoadFailed)
      }
    }
    void load()
    return () => { mounted = false }
  }, [boardSource])

  const getBoardKey = (item: BoardItem, index: number) => `${boardSource}_${item.bangid}_${index}`
  const getActiveTabHandle = () => activeTabFocus.current ? findNodeHandle(activeTabFocus.current) : null
  const getBoardHandle = (key?: string | null) => key && boardRefs.current[key] ? findNodeHandle(boardRefs.current[key]) : null
  const bindBoardRef = (key: string, syncFirst = false) => (node: FocusNode) => {
    const changed = boardRefs.current[key] !== node
    boardRefs.current[key] = node
    if (node && changed) queueFocusRefresh()
    if (syncFirst) firstBoardFocus.ref.current = node as any
  }

  const handleBoardFocus = (index: number) => {
    setSelectedIndex(index)
    listRef.current?.scrollToOffset({ offset: Math.max(0, index * ITEM_SIZE - ITEM_SIZE), animated: true })
  }

  const openBoard = (board = selectedBoard) => {
    if (!board || !boardSource) return
    pushTVDetailScreen(componentId, {
      type: 'board',
      id: `${boardSource}__${board.bangid}`,
      source: boardSource,
      title: board.name,
      subtitle: tvText.platformHot,
      board,
    })
  }

  useTVRemoteActions({
    playPause: () => {
      if (currentMusicInfo.id) {
        pushTVPlayerScreen(componentId)
        return
      }
      openBoard()
    },
  })

  return (
    <TVAppleScaffold image={currentMusicInfo.pic}>
      <TVTopTabs items={createTVTabs(componentId, 'new')} activeId="new" nextFocusDown={getSourceHandle(sourceTabs[0]?.id) ?? firstBoardFocus.getNodeHandle() ?? undefined} activeTabRef={activeTabFocus as any} onActiveTabReady={queueFocusRefresh} />
      <View style={styles.root}>
        <View style={styles.header}>
          <TVText variant="pageTitle" style={styles.title}>{tvText.ranking}</TVText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sourceTabWrap} contentContainerStyle={styles.sourceTabContent}>
            {sourceTabs.map((tab, index) => (
              <Focusable
                key={tab.id}
                ref={bindSourceRef(tab.id) as any}
                style={[styles.sourceTab, sourceSel === tab.id && styles.sourceTabActive]}
                onPress={() => { handleSourceChange(tab.id) }}
                nextFocusLeft={getSourceHandle(sourceTabs[index - 1]?.id) ?? undefined}
                nextFocusRight={getSourceHandle(sourceTabs[index + 1]?.id) ?? undefined}
                nextFocusDown={firstBoardFocus.getNodeHandle() ?? undefined}
                nextFocusUp={getActiveTabHandle() ?? undefined}
              >
                <TVText variant="caption" style={sourceSel === tab.id ? styles.sourceTabTextActive : styles.sourceTabText}>
                  {tab.label}
                </TVText>
              </Focusable>
            ))}
          </ScrollView>
          <TVButton ref={playerFocus.ref as any} label={tvText.nowPlaying} tone="ghost" onPress={() => { pushTVPlayerScreen(componentId) }} />
        </View>

        <View style={styles.body}>
          <View style={styles.listColumn}>
            <FlatList
              ref={listRef}
              style={styles.list}
              data={boards}
              showsVerticalScrollIndicator={false}
              keyExtractor={getBoardKey}
              removeClippedSubviews={false}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={<TVText variant="meta" style={styles.empty}>{loadingText}</TVText>}
              renderItem={({ item, index }) => {
                const itemKey = getBoardKey(item, index)
                const prevKey = boards[index - 1] ? getBoardKey(boards[index - 1], index - 1) : null
                const nextKey = boards[index + 1] ? getBoardKey(boards[index + 1], index + 1) : null
                const active = selectedIndex === index
                return (
                  <Focusable
                    ref={bindBoardRef(itemKey, index === 0) as any}
                    style={[styles.row, active ? styles.rowActive : null]}
                    focusStyle={styles.rowFocus}
                    hasTVPreferredFocus={index === 0}
                    // 用 onTVFocusChange 而不是 onFocus：遥控器焦点由 tvFocusManager 直接
                    // 分发（emitFocusState），不依赖原生 requestFocus，onFocus 在部分设备/模拟器
                    // 上不触发，右侧预览和选中态就会卡在第一项
                    onTVFocusChange={focused => { if (focused) handleBoardFocus(index) }}
                    onPress={() => { openBoard(item) }}
                    nextFocusUp={index === 0 ? getSourceHandle(sourceTabs[sourceTabs.length - 1]?.id) ?? getActiveTabHandle() ?? undefined : getBoardHandle(prevKey) ?? undefined}
                    nextFocusRight={playerFocus.getNodeHandle() ?? undefined}
                    nextFocusDown={getBoardHandle(nextKey) ?? undefined}
                  >
                    <TVText style={[styles.rowIndex, index < 3 ? styles.rowIndexTop : null]}>{String(index + 1).padStart(2, '0')}</TVText>
                    <TVText style={styles.rowName} numberOfLines={1}>{item.name}</TVText>
                  </Focusable>
                )
              }}
            />
            {/* 列表底部渐隐：短屏上最后一行常被下边缘截半个字，加一层淡出比硬切干净 */}
            <View pointerEvents="none" style={styles.listFade}>
              <TVFadeOverlay height={tvSize(84)} peak={0.92} direction="up" />
            </View>
          </View>

          {/* 当前榜单预览：榜单接口没有封面图，右栏用「品牌色光晕 + 大字标题 + 序号水印」
              做视觉锚点，避免整页全是可以左右拉伸的纯文本行 */}
          <View style={styles.preview}>
            <View style={[styles.previewAccent, { backgroundColor: previewTint }]} />
            <TVText variant="caption" style={[styles.previewKicker, { color: previewTint }]}>
              {`${boardSource ? getSourceName(boardSource) : tvText.noMusic}${dot}${tvText.charts}`}
            </TVText>
            <TVText style={styles.previewName} numberOfLines={3}>{selectedBoard?.name ?? tvText.noAvailableCharts}</TVText>
            {selectedBoard ? <TVText variant="caption" style={styles.previewHint}>{tvText.chartPreviewHint}</TVText> : null}
            <View pointerEvents="none" style={styles.previewWatermarkWrap}>
              <TVText style={[styles.previewWatermark, { color: previewTint }]}>{String(selectedIndex + 1).padStart(2, '0')}</TVText>
            </View>
          </View>
        </View>
      </View>
    </TVAppleScaffold>
  )
}

const styles: Record<string, ViewStyle | TextStyle | any> = {
  root: { flex: 1 },
  // 标题 / 音源切换 / 正在播放挤在同一行，省下的纵向空间全部留给榜单列表
  header: { flexDirection: 'row', alignItems: 'center', gap: tvSize(20), marginBottom: tvSize(18) },
  title: { fontSize: tvFont(48), lineHeight: tvFont(56), flexShrink: 0 },
  sourceTabWrap: { flex: 1, maxWidth: tvSize(640) },
  sourceTabContent: { flexDirection: 'row', gap: tvSize(8), alignItems: 'center', minHeight: tvSize(40), paddingRight: tvSize(8) },
  sourceTab: { minHeight: tvSize(30), borderRadius: 999, paddingHorizontal: tvSize(14), alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: tvColors.border },
  sourceTabActive: { backgroundColor: 'rgba(0,103,192,0.25)', borderColor: tvColors.primary },
  sourceTabText: { color: tvColors.subtext },
  sourceTabTextActive: { color: tvColors.text, fontWeight: '700' },
  body: { flex: 1, minHeight: 0, flexDirection: 'row', gap: tvSize(28), overflow: 'hidden' },
  // FlatList 必须显式 flex:1 + 外层 overflow:hidden，否则短屏上列表按内容高度撑开，
  // 会盖住页脚、最后一两行被屏幕边缘裁掉
  listColumn: { flex: 1, minWidth: 0, overflow: 'hidden' },
  list: { flex: 1 },
  listFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: tvSize(84) },
  listContent: { paddingBottom: tvSize(28), paddingRight: tvSize(4) },
  empty: { marginTop: tvSize(24) },
  row: { minHeight: tvSize(58), marginBottom: tvSize(8), paddingHorizontal: tvSize(16), borderRadius: tvSize(16), flexDirection: 'row', alignItems: 'center', gap: tvSize(14), borderWidth: 2, borderColor: 'transparent' },
  rowActive: { backgroundColor: 'rgba(255,255,255,0.06)' },
  rowFocus: { backgroundColor: 'rgba(255,255,255,0.16)', borderColor: tvColors.primaryHigh },
  rowIndex: { width: tvSize(40), fontSize: tvFont(18), fontWeight: '900', color: tvColors.dimText, textAlign: 'right' },
  rowIndexTop: { color: tvColors.primaryHigh },
  rowName: { flex: 1, fontSize: tvFont(22), fontWeight: '700', color: tvColors.text },
  // 右栏预览：榜单接口没有封面图，用「品牌色竖条 + 大字标题 + 序号水印」撑起视觉重心，
  // 大高屏上限制最大高度并居中，避免整块空白面板拉满整屏
  preview: { width: '32%', minWidth: tvSize(250), height: '100%', maxHeight: tvSize(470), alignSelf: 'center', borderRadius: tvSize(28), padding: tvSize(30), justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  previewAccent: { width: tvSize(56), height: tvSize(5), borderRadius: tvSize(3), marginBottom: tvSize(16) },
  previewKicker: { fontWeight: '900', letterSpacing: 1.2 },
  previewName: { marginTop: tvSize(14), fontSize: tvFont(38), lineHeight: tvFont(48), fontWeight: '900', color: tvColors.text },
  previewHint: { marginTop: tvSize(16), color: tvColors.subtext },
  previewWatermarkWrap: { position: 'absolute', right: tvSize(16), bottom: -tvSize(30), opacity: 0.16 },
  previewWatermark: { fontSize: tvFont(150), lineHeight: tvFont(160), fontWeight: '900' },
}

export default memo(TVHistory)
