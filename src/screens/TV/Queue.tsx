import { memo, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef } from 'react'
import { FlatList, View, useWindowDimensions, findNodeHandle, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native'
import TVAppleScaffold from '@/components/TV/TVAppleScaffold'
import TVTopTabs from '@/components/TV/TVTopTabs'
import TVText from '@/components/TV/TVText'
import TVButton from '@/components/TV/TVButton'
import TVFadeOverlay from '@/components/TV/TVFadeOverlay'
import TVMusicRow from '@/components/TV/TVMusicRow'
import type Focusable from '@/components/TV/Focusable'
import Image from '@/components/common/Image'
import TVDialog, { type TVDialogRequest } from '@/components/TV/TVDialog'
import { getPicUrl } from '@/core/music/online'
import { tvColors, tvFont, tvSize, tvTokens } from '@/theme/tv'
import { usePlayerMusicInfo } from '@/store/player/hook'
import { useMyList } from '@/store/list/hook'
import { getUserLists } from '@/utils/listManage'
import listState from '@/store/list/state'
import { useSettingValue } from '@/store/setting/hook'
import { clearListMusics, removeListMusics, addListMusics, getListMusics } from '@/core/list'
import { playList } from '@/core/player/player'
import { LIST_IDS, MUSIC_TOGGLE_MODE_LIST } from '@/config/constant'
import { pushTVPlayerScreen } from '@/navigation/navigation'
import { updateSetting } from '@/core/common'
import { useTVNavigationBack } from '@/utils/hooks/useTVNavigationBack'
import { useTVRemoteActions } from '@/utils/hooks/useTVRemoteActions'
import { useTVFocusRef } from '@/components/TV/useTVFocusRef'
import { useTVFocusRefresh } from '@/components/TV/useTVFocusRefresh'
import { dot, tvText } from './labels'
import { createTVTabs, getMusicImage, getMusicSubtitle, getSourceName } from './utils'
import { useTVFetchedMusicList } from './useTVFetchedMusicList'

type FocusNode = ComponentRef<typeof Focusable> | null
type FocusRefMap = Record<string, FocusNode>

const PLAY_MODE_LABELS: Record<string, string> = {
  listLoop: '列表循环',
  random: '随机播放',
  list: '顺序播放',
  singleLoop: '单曲循环',
  none: '播完停止',
}

function TVQueue({ componentId }: { componentId: string }) {
  const currentMusicInfo = usePlayerMusicInfo()
  const fetchedMusicList = useTVFetchedMusicList()
  const playMode = useSettingValue('player.togglePlayMethod')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const playModeFocus = useTVFocusRef()
  const clearFocus = useTVFocusRef()
  const addAllFocus = useTVFocusRef()
  const firstQueueFocus = useTVFocusRef()
  const activeTabFocus = useRef<FocusNode>(null)
  const tabRefresh = useTVFocusRefresh()
  const getActiveTabHandle = () => (activeTabFocus.current ? findNodeHandle(activeTabFocus.current) : null)
  const listRef = useRef<FlatList<LX.Music.MusicInfo>>(null)
  const queueRefs = useRef<FocusRefMap>({})
  const [localDialog, setLocalDialog] = useState<TVDialogRequest | null>(null)

  // 与首页同一套等比缩放：首页按可用高度把 hero + 歌单架整体缩进一屏，
  // 播放列表页用同一个系数缩放标题、行高和预览，两个标签页的字号/留白比例才一致
  // 用 useWindowDimensions 同步拿屏高，首帧即正确缩放，无需 onLayout+opacity 首帧隐藏（避免白屏回归）
  const { height: windowHeight } = useWindowDimensions()
  const contentScale = useMemo(() => Math.max(0.5, Math.min(1, windowHeight / tvSize(680))), [windowHeight])
  // 列表可视高度：仅供「进入页自动滚动到当前播放歌曲」定位 effect 使用（root onLayout 测量），
  // 与 contentScale 解耦，避免再和首帧缩放隐藏耦合导致白屏
  const [contentHeight, setContentHeight] = useState(0)
  const z = useCallback((value: number) => Math.max(1, Math.round(value * contentScale)), [contentScale])
  // 行高 = 封面高度 + 上下内边距 + 上下边框 + 分隔线。
  // 边框也算进布局，行高公式必须和 TVMusicRow 里的实际值一致，
  // 否则 getItemLayout 的估算会和真实布局越差越远（长列表滚到后面偏出好几行）。
  const itemBorder = Math.max(1, Math.round(2 * contentScale))
  const itemSize = z(tvSize(58)) + z(tvSize(8)) * 2 + itemBorder * 2 + z(tvSize(1))

  // 加歌到自建歌单：前后快照对比，如实区分「新加 / 已存在 / 未写入」。
  // 注：musicInfos/label 必须走参数传入（旧版从 songlistDialog 状态里取，
  // 但那个状态在弹窗改为 localDialog 后已无人写入，守卫直接 return →
  // 按 OK 变成完全空操作、连结果弹窗都没有，09-20 老板实测发现）
  // 加歌位置：默认加到最前（新歌置顶更好找，09-20 需求）；弹窗里可一键切换
  const [addPosition, setAddPosition] = useState<'top' | 'bottom'>('top')

  const handleAddToSonglist = async(listId: string, musicInfos: LX.Music.MusicInfo[], label: string, position: 'top' | 'bottom' = 'top') => {
    try {
      const before = await getListMusics(listId)
      const beforeIds = new Set(before.map(m => m.id))
      const alreadyCount = musicInfos.filter(m => beforeIds.has(m.id)).length
      await addListMusics(listId, musicInfos, position === 'top' ? 'top' : 'bottom')
      const after = await getListMusics(listId)
      const afterIds = new Set(after.map(m => m.id))
      const newlyLanded = musicInfos.filter(m => afterIds.has(m.id) && !beforeIds.has(m.id)).length
      if (newlyLanded === 0 && alreadyCount === musicInfos.length) {
        showLocalDialog({
          title: '无需重复添加',
          message: `「${label}」的 ${musicInfos.length} 首都已在这个歌单里（现共 ${after.length} 首）`,
          buttons: [{ label: '确定', tone: 'primary' }],
        })
        return
      }
      if (newlyLanded + alreadyCount < musicInfos.length) {
        showLocalDialog({
          title: '部分未写入',
          message: `${musicInfos.length - newlyLanded - alreadyCount} 首未写入，歌单现共 ${after.length} 首，可到「我的歌单」核对`,
          buttons: [{ label: '确定', tone: 'primary' }],
        })
        return
      }
      showLocalDialog({
        title: '添加成功',
        message: `已添加 ${newlyLanded} 首${alreadyCount ? `（${alreadyCount} 首已存在跳过）` : ''}，歌单现共 ${after.length} 首`,
        buttons: [{ label: '确定', tone: 'primary' }],
      })
    } catch (err) {
      showLocalDialog({
        title: '添加失败',
        message: err instanceof Error ? err.message : '未知错误',
        buttons: [{ label: '确定', tone: 'primary' }],
      })
    }
  }

  const openSonglistPicker = async(musicInfos: LX.Music.MusicInfo[], label: string, nextPosition?: 'top' | 'bottom') => {
    try {
      const lists = await getUserLists()
      // 「我的收藏」常驻第一项（09-20 需求）：上游一直有这个列表，之前 TV 端没有任何收藏入口
      const loveCount = (await getListMusics(LIST_IDS.LOVE)).length
      // 只展示最近创建的几个：弹窗按钮太多难选；自动命名的歌单名几乎一样，
      // 按钮里必须带歌曲数才能分出哪张是哪张（老板 09-19 实测：加完歌不知道加到哪张了）
      const maxButtons = 5
      const start = Math.max(0, lists.length - maxButtons)
      const visible = lists.slice(start)
      const counted = await Promise.all(visible.map(async(list) => ({
        id: list.id,
        name: list.name,
        count: (await getListMusics(list.id)).length,
      })))
      // 位置必须走参数：递归重开弹窗时若从 state 闭包回读，读到的还是本次渲染的旧值，
      // 「改为加到末尾」当场不生效（只有取消后重开才对）
      const position = nextPosition ?? addPosition
      const positionLabel = position === 'top' ? '最前（新歌置顶）' : '末尾'
      showLocalDialog({
        title: '选择要添加到的歌单',
        message: `将「${label}」${musicInfos.length > 1 ? `（${musicInfos.length} 首）` : ''}添加到【${positionLabel}】${lists.length > visible.length ? `，共 ${lists.length} 个歌单仅列出最近 ${visible.length} 个` : ''}`,
        buttons: [
          {
            label: `❤ 我的收藏（${loveCount} 首）`,
            tone: 'primary' as const,
            onPress: () => { void handleAddToSonglist(LIST_IDS.LOVE, musicInfos, label, position) },
          },
          ...counted.map(item => ({
            label: `${item.name}（${item.count} 首）`,
            tone: 'primary' as const,
            onPress: () => { void handleAddToSonglist(item.id, musicInfos, label, position) },
          })),
          {
            label: `📍 改为加到${position === 'top' ? '末尾' : '最前'}`,
            tone: 'dark' as const,
            onPress: () => {
              const toggled = position === 'top' ? 'bottom' : 'top'
              setAddPosition(toggled)
              void openSonglistPicker(musicInfos, label, toggled)
            },
          },
          { label: '取消', tone: 'dark' as const },
        ],
      })
    } catch {
      showLocalDialog({
        title: '获取歌单失败',
        message: '无法读取歌单列表',
        buttons: [{ label: '确定', tone: 'primary' }],
      })
    }
  }

  // 页面挂载后补一次延迟刷新，确保所有按钮/行的 nextFocus 句柄就位（
  // 首次渲染时 ref 为空 → getNodeHandle 返回 null → nextFocusUp 为 undefined → 引擎找不到目标）
  const mountRefreshRef = useRef(false)
  useEffect(() => {
    if (mountRefreshRef.current) return
    mountRefreshRef.current = true
    const timer = setTimeout(() => { tabRefresh() }, 350)
    return () => { clearTimeout(timer) }
  }, [tabRefresh])

  useTVNavigationBack(componentId)

  // 进入页面时自动滚动到当前播放歌曲（仅首次定位）：
  // deps 不能带整个 fetchedMusicList——本页删歌、外部改 TEMP 都会重跑，
  // 把视图从用户所在位置猛地拽回播放歌曲处并重置选中态
  const locatedRef = useRef(false)
  const handleRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (handleRefreshTimerRef.current) clearTimeout(handleRefreshTimerRef.current)
  }, [])
  useEffect(() => {
    if (locatedRef.current) return
    // 等布局量出高度、缩放系数确定后再定位：否则会按未缩放的行高滚到一个错误位置
    if (!contentHeight || !fetchedMusicList.length || !currentMusicInfo.id) return
    const playingIndex = fetchedMusicList.findIndex(m => m.id === currentMusicInfo.id)
    if (playingIndex >= 0) {
      locatedRef.current = true
      setSelectedIndex(playingIndex)
      requestAnimationFrame(() => {
        // 用 scrollToIndex + viewOffset 而不是裸 offset：有 getItemLayout 时按行定位，
        // 原生不会因为「内容还没量完」把目标位置夹到列表中部
        listRef.current?.scrollToIndex({ index: playingIndex, animated: false, viewOffset: itemSize * 2 })
        // 目标行是滚动之后才挂载的：等它挂上再强制渲染一次，顶部按钮的 nextFocusDown
        // 才能拿到「当前播放行」的最新句柄；否则下键会退回第一行，长列表里像焦点丢了
        handleRefreshTimerRef.current = setTimeout(() => {
          handleRefreshTimerRef.current = null
          tabRefresh()
        }, 500)
      })
    }
  }, [contentHeight, currentMusicInfo.id, fetchedMusicList, itemSize, tabRefresh])

  useEffect(() => {
    if (!fetchedMusicList.length) {
      setSelectedIndex(0)
      return
    }
    if (selectedIndex >= fetchedMusicList.length) setSelectedIndex(fetchedMusicList.length - 1)
  }, [selectedIndex, fetchedMusicList.length])

  const selectedMusicInfo = fetchedMusicList[selectedIndex] ?? null
  const selectedIsPlaying = !!selectedMusicInfo && currentMusicInfo.id === selectedMusicInfo.id

  // 右侧预览封面：优先用歌曲自带图；没有就按需解析一次（与列表行的懒加载一致，
  // 只在选中项变化时请求，列表滚动不会每行都发网络请求）
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  useEffect(() => {
    const ownImage = getMusicImage(selectedMusicInfo)
    setPreviewImage(ownImage)
    if (!selectedMusicInfo) return
    if (ownImage) return
    let cancelled = false
    void getPicUrl({ musicInfo: selectedMusicInfo as LX.Music.MusicInfoOnline, isRefresh: false, allowToggleSource: false }).then(url => {
      if (!cancelled && url) setPreviewImage(url)
    }).catch(() => { })
    return () => { cancelled = true }
  }, [selectedMusicInfo])

  const getQueueItemKey = (item: LX.Music.MusicInfo, index: number) => `${item.id}_${index}`
  // 固定行高交给 FlatList：内容总高立即确定，进页定位不会被虚拟列表的估算高度夹住
  const getQueueItemLayout = (_data: unknown, index: number) => ({ length: itemSize, offset: itemSize * index, index })
  const getQueueHandle = (key?: string | null) => key && queueRefs.current[key] ? findNodeHandle(queueRefs.current[key]) : null
  // 从顶部操作区按下键时回到「当前选中/正在播放」那一行，而不是永远跳到第 1 首
  // （队列很长时第 1 首在屏幕外，焦点会莫名消失到列表顶部）
  const getSelectedQueueHandle = () => {
    const item = fetchedMusicList[selectedIndex]
    return item ? getQueueHandle(getQueueItemKey(item, selectedIndex)) : null
  }
  const bindQueueRef = (key: string, syncFirst = false) => (node: FocusNode) => {
    queueRefs.current[key] = node
    if (syncFirst) firstQueueFocus.ref.current = node as any
  }

  const handleQueueFocus = (index: number) => {
    setSelectedIndex(index)
    listRef.current?.scrollToOffset({ offset: Math.max(0, index * itemSize - itemSize), animated: true })
  }

  const handlePlayNow = async(index: number) => {
    const item = fetchedMusicList[index]
    if (!item) return
    await playList(LIST_IDS.TEMP, index)
    pushTVPlayerScreen(componentId)
  }

  const showLocalDialog = (request: TVDialogRequest) => {
    setLocalDialog(request)
  }

  const handleRemoveMusic = (item: LX.Music.MusicInfo, index: number) => {
    showLocalDialog({
      title: item.name ?? '未知歌曲',
      message: '选择要执行的操作',
      buttons: [
        { label: '加入我的歌单', tone: 'primary', onPress: () => { void openSonglistPicker([item], item.name ?? '未知歌曲') } },
        { label: '从播放列表删除', tone: 'danger', onPress: () => { void removeListMusics(LIST_IDS.TEMP, [item.id]) } },
        { label: '取消', tone: 'dark' },
      ],
    })
  }

  const handleClear = () => {
    showLocalDialog({
      title: '清空播放列表',
      message: `确定清空全部 ${fetchedMusicList.length} 首歌曲吗？`,
      buttons: [
        { label: '取消', tone: 'dark' },
        { label: '清空', tone: 'danger', onPress: () => { void clearListMusics([LIST_IDS.TEMP]) } },
      ],
    })
  }

  const handleCyclePlayMode = () => {
    const currentIndex = MUSIC_TOGGLE_MODE_LIST.indexOf(playMode)
    const nextIndex = (currentIndex + 1) % MUSIC_TOGGLE_MODE_LIST.length
    updateSetting({ 'player.togglePlayMethod': MUSIC_TOGGLE_MODE_LIST[nextIndex] })
  }

  const playModeLabel = PLAY_MODE_LABELS[playMode] ?? '列表循环'

  // 队列的出处：从「我的歌单」播进来的话，tempListMeta.id 就是那个歌单的 id。
  // 显示出来用户才能确认「我现在放的到底是不是我那张歌单」。
  const myLists = useMyList()
  const queueSourceName = myLists.find(l => l.id === listState.tempListMeta.id)?.name

  useTVRemoteActions({
    playPause: () => {
      if (currentMusicInfo.id) {
        pushTVPlayerScreen(componentId)
        return
      }
      if (selectedMusicInfo) void handlePlayNow(selectedIndex)
    },
  })

  const actionButtonStyle = useMemo(() => ({
    minHeight: z(tvSize(54)),
    paddingHorizontal: z(tvSize(26)),
    paddingVertical: z(tvSize(14)),
  }), [z])
  const listContentStyle = useMemo(() => ({
    paddingTop: z(tvSize(4)),
    paddingBottom: z(tvSize(28)),
    paddingRight: z(tvSize(4)),
  }), [z])
  const ListSeparator = useCallback(() => (
    <View style={[styles.rowDivider, { height: z(tvSize(1)), marginHorizontal: z(tvSize(14)) }]} />
  ), [z])

  return (
    <TVAppleScaffold image={currentMusicInfo.pic}>
      <TVTopTabs items={createTVTabs(componentId, 'queue')} activeId="queue" nextFocusDown={playModeFocus.getNodeHandle() ?? firstQueueFocus.getNodeHandle() ?? undefined} activeTabRef={activeTabFocus} onActiveTabReady={tabRefresh} />
      <View style={styles.root} onLayout={(e: any) => {
        const height = Math.round(e.nativeEvent.layout.height)
        if (height < 120) return
        setContentHeight(prev => prev || height)
      }}>
        <View style={[styles.header, { marginBottom: z(tvSize(18)), gap: z(tvSize(20)) }]}>
          <View style={styles.headerMain}>
            <TVText variant="pageTitle" style={[styles.title, { fontSize: z(tvTokens.heroTitle), lineHeight: z(tvFont(66)) }]}>播放列表</TVText>
            <TVText variant="caption" style={[styles.subtitle, { marginTop: z(tvSize(4)) }]} numberOfLines={1}>
              {`${fetchedMusicList.length} 首${dot}${playModeLabel}${queueSourceName ? `${dot}${tvText.queueFromSonglist}「${queueSourceName}」` : ''}`}
            </TVText>
          </View>
          <View style={[styles.actions, { gap: z(tvSize(12)) }]}>
            <TVButton ref={playModeFocus.ref as any} label={`模式: ${playModeLabel}`} tone="dark" style={actionButtonStyle} onPress={handleCyclePlayMode} hasTVPreferredFocus nextFocusUp={getActiveTabHandle() ?? undefined} nextFocusRight={addAllFocus.getNodeHandle() ?? undefined} nextFocusDown={getSelectedQueueHandle() ?? firstQueueFocus.getNodeHandle() ?? undefined} />
            <TVButton ref={addAllFocus.ref as any} label="全部加入歌单" tone={fetchedMusicList.length ? 'ghost' : 'dark'} style={actionButtonStyle} onPress={() => { void openSonglistPicker(fetchedMusicList, `播放列表全部 ${fetchedMusicList.length} 首`) }} nextFocusUp={getActiveTabHandle() ?? undefined} nextFocusLeft={playModeFocus.getNodeHandle() ?? undefined} nextFocusRight={clearFocus.getNodeHandle() ?? undefined} nextFocusDown={getSelectedQueueHandle() ?? firstQueueFocus.getNodeHandle() ?? undefined} />
            <TVButton ref={clearFocus.ref as any} label={tvText.clearList} tone={fetchedMusicList.length ? 'ghost' : 'dark'} style={actionButtonStyle} onPress={handleClear} nextFocusUp={getActiveTabHandle() ?? undefined} nextFocusLeft={addAllFocus.getNodeHandle() ?? undefined} nextFocusDown={getSelectedQueueHandle() ?? firstQueueFocus.getNodeHandle() ?? undefined} />
          </View>
        </View>

        <View style={[styles.body, { gap: z(tvSize(28)) }]}>
          <View style={styles.listColumn}>
            <FlatList
              ref={listRef}
              data={fetchedMusicList}
              showsVerticalScrollIndicator={false}
              keyExtractor={getQueueItemKey}
              removeClippedSubviews={false}
              style={styles.list}
              getItemLayout={getQueueItemLayout}
              contentContainerStyle={listContentStyle}
              ItemSeparatorComponent={ListSeparator}
              ListEmptyComponent={<TVText variant="meta" style={[styles.empty, { marginTop: z(tvSize(24)) }]}>{tvText.emptyQueueHint}</TVText>}
              // 操作提示放在列表顶部而不是右栏：右栏高度随屏幕变化，长提示在短屏上会被裁掉
              ListHeaderComponent={fetchedMusicList.length ? (
                <TVText variant="caption" color={tvColors.dimText} style={[styles.listHint, { marginLeft: z(tvSize(14)), marginBottom: z(tvSize(8)) }]}>{`OK 立即播放${dot}长按 OK 加入歌单 / 删除`}</TVText>
              ) : null}
              renderItem={({ item, index }) => {
                const itemKey = getQueueItemKey(item, index)
                const prevKey = fetchedMusicList[index - 1] ? getQueueItemKey(fetchedMusicList[index - 1], index - 1) : null
                const nextKey = fetchedMusicList[index + 1] ? getQueueItemKey(fetchedMusicList[index + 1], index + 1) : null
                const isCurrentPlaying = currentMusicInfo.id === item.id
                return (
                  <TVMusicRow
                    ref={bindQueueRef(itemKey, index === 0) as any}
                    index={index}
                    title={item.name ?? tvText.unknownSong}
                    subtitle={getMusicSubtitle(item)}
                    meta={item.interval ?? getSourceName(item.source)}
                    badge={isCurrentPlaying ? '▶ 正在播放' : undefined}
                    lazyMusicInfo={item as LX.Music.MusicInfoOnline}
                    active={isCurrentPlaying}
                    scale={contentScale}
                    style={[
                      styles.row,
                      {
                        minHeight: z(tvSize(58)),
                        paddingHorizontal: z(tvSize(14)),
                        paddingVertical: z(tvSize(8)),
                        borderRadius: z(tvSize(14)),
                      },
                      isCurrentPlaying ? styles.rowPlaying : null,
                    ]}
                    focusStyle={styles.rowFocus}
                    // 与排行榜页一致：遥控焦点由 tvFocusManager 直接分发，onFocus 在部分设备上不触发
                    onTVFocusChange={focused => { if (focused) handleQueueFocus(index) }}
                    onPress={() => { void handlePlayNow(index) }}
                    onLongPress={() => { handleRemoveMusic(item, index) }}
                    nextFocusUp={index === 0 ? playModeFocus.getNodeHandle() ?? undefined : getQueueHandle(prevKey) ?? undefined}
                    nextFocusDown={getQueueHandle(nextKey) ?? undefined}
                  />
                )
              }}
            />
            {/* 列表底部渐隐：最后一行常被下边缘截半个字，淡出比硬切干净 */}
            <View pointerEvents="none" style={[styles.listFade, { height: z(tvSize(84)) }]}>
              <TVFadeOverlay height={z(tvSize(84))} peak={0.92} direction="up" />
            </View>
          </View>

          {/* 选中歌曲预览：封面 + 出处 + 曲名/歌手，与排行榜页右栏同一套版式 */}
          <View style={[styles.preview, { minWidth: z(tvSize(280)), maxHeight: z(tvSize(500)), borderRadius: z(tvSize(28)), padding: z(tvSize(26)) }]}>
            <View style={[styles.previewCoverWrap, { maxWidth: z(tvSize(190)), borderRadius: z(tvSize(24)), marginBottom: z(tvSize(16)) }]}>
              {previewImage
                ? <Image url={previewImage} resizeMode="cover" style={styles.previewCover as ImageStyle} />
                : <TVText variant="pageTitle" color={tvColors.primaryHigh} style={[styles.previewCoverPlaceholder, { fontSize: z(tvFont(64)) }]}>{selectedMusicInfo ? (selectedMusicInfo.name ?? '?').slice(0, 1) : '♪'}</TVText>}
            </View>
            <TVText variant="caption" color={tvColors.primaryHigh} numberOfLines={1} style={[styles.previewKicker, { marginBottom: z(tvSize(8)) }]}>
              {selectedMusicInfo ? `${getSourceName(selectedMusicInfo.source)}${selectedIsPlaying ? `${dot}${tvText.nowPlaying}` : ''}` : '当前播放队列'}
            </TVText>
            {selectedMusicInfo ? (
              <>
                <TVText style={[styles.previewName, { fontSize: z(tvTokens.railTitle), lineHeight: z(tvFont(36)) }]} numberOfLines={2}>{selectedMusicInfo.name ?? tvText.unknownSong}</TVText>
                <TVText variant="caption" style={[styles.previewMeta, { marginTop: z(tvSize(6)) }]} numberOfLines={2}>{getMusicSubtitle(selectedMusicInfo)}</TVText>
              </>
            ) : (
              <TVText variant="meta" style={[styles.previewEmpty, { marginTop: z(tvSize(8)), lineHeight: z(tvFont(24)) }]}>{tvText.emptyQueueHint}</TVText>
            )}
            {selectedMusicInfo ? (
              <View pointerEvents="none" style={[styles.previewWatermarkWrap, { right: z(tvSize(14)), bottom: -z(tvSize(28)) }]}>
                <TVText style={[styles.previewWatermark, { color: tvColors.primaryHigh, fontSize: z(tvFont(120)), lineHeight: z(tvFont(128)) }]}>{String(selectedIndex + 1).padStart(2, '0')}</TVText>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      <TVDialog
        visible={!!localDialog}
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
    </TVAppleScaffold>
  )
}

const styles: Record<string, ViewStyle | TextStyle | ImageStyle | any> = {
  root: { flex: 1 },
  // 标题 / 模式 / 批量操作挤在同一行，省下的纵向空间全部留给队列
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: tvSize(20), marginBottom: tvSize(18) },
  headerMain: { flexShrink: 1, minWidth: 0 },
  // 字号与推荐页对齐：页面标题用推荐页大标题同款（heroTitle），正文用卡片内容字号
  title: { fontSize: tvTokens.heroTitle, lineHeight: tvFont(66), flexShrink: 0 },
  subtitle: { marginTop: tvSize(4), color: tvColors.subtext },
  actions: { flexDirection: 'row', alignItems: 'center', gap: tvSize(12) },
  body: { flex: 1, minHeight: 0, flexDirection: 'row', gap: tvSize(28), overflow: 'hidden' },
  // FlatList 必须显式 flex:1 + 外层 overflow:hidden，否则短屏上列表按内容高度撑开，
  // 会盖住页脚、最后一两行被屏幕边缘裁掉
  listColumn: { flex: 1, minWidth: 0, overflow: 'hidden' },
  list: { flex: 1 },
  listContent: { paddingTop: tvSize(4), paddingBottom: tvSize(28), paddingRight: tvSize(4) },
  listFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: tvSize(84) },
  // 行本身透明，靠分隔线区分；正在播放才铺一层淡色，焦点态才出现高亮块
  row: { backgroundColor: 'transparent', minHeight: tvSize(58), paddingHorizontal: tvSize(14), paddingVertical: tvSize(8), borderRadius: tvSize(14) },
  rowPlaying: { backgroundColor: 'rgba(255,77,79,0.14)' },
  rowFocus: { backgroundColor: 'rgba(255,255,255,0.14)' },
  rowDivider: { height: tvSize(1), backgroundColor: 'rgba(255,255,255,0.07)', marginHorizontal: tvSize(14) },
  empty: { marginTop: tvSize(24) },
  // 右栏预览：选中歌曲的封面 + 出处 + 曲名，版式与排行榜页右栏一致
  preview: {
    width: '34%',
    minWidth: tvSize(280),
    height: '100%',
    maxHeight: tvSize(500),
    alignSelf: 'center',
    borderRadius: tvSize(28),
    padding: tvSize(26),
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  previewCoverWrap: {
    // 宽度按栏宽走、flexShrink 让封面在短屏上自动让位给文字，避免长曲名把提示挤出面板
    width: '72%',
    maxWidth: tvSize(190),
    aspectRatio: 1,
    flexShrink: 1,
    borderRadius: tvSize(24),
    overflow: 'hidden',
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: tvSize(16),
    backgroundColor: 'rgba(138,173,255,0.13)',
    elevation: 20,
    shadowColor: '#000',
    shadowOpacity: 0.45,
    shadowRadius: tvSize(26),
    shadowOffset: { width: 0, height: tvSize(18) },
  },
  previewCover: { width: '100%', height: '100%' },
  previewCoverPlaceholder: { fontSize: tvFont(64), fontWeight: '900', opacity: 0.7 },
  previewKicker: { fontWeight: '900', letterSpacing: 1.1, marginBottom: tvSize(8) },
  // 预览卡标题与推荐页「推荐歌单」同级（railTitle），列表行才是卡片内容字号
  previewName: { fontSize: tvTokens.railTitle, lineHeight: tvFont(36), fontWeight: '900', color: tvColors.text },
  previewMeta: { marginTop: tvSize(6), color: tvColors.subtext },
  listHint: { marginLeft: tvSize(14), marginBottom: tvSize(8) },
  previewEmpty: { marginTop: tvSize(8), color: tvColors.subtext, lineHeight: tvFont(24) },
  previewWatermarkWrap: { position: 'absolute', right: tvSize(14), bottom: -tvSize(28), opacity: 0.12 },
  previewWatermark: { fontSize: tvFont(120), lineHeight: tvFont(128), fontWeight: '900' },
}

export default memo(TVQueue)
