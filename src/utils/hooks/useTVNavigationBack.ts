import { useCallback } from 'react'
import { pop } from '@/navigation'
import { getTVTabHostFor, hasTVPushedScreen } from '@/components/TV/tvTabHost'
import { useBackHandler } from './useBackHandler'

export const useTVNavigationBack = (componentId?: string) => {
  const handleBack = useCallback(() => {
    // 只有调用方自己就是 tab 宿主屏（宿主内的 tab 页拿到的也是宿主的 componentId）
    // 才把返回键交给宿主切 tab；播放页/详情页这类 push 屏一律 pop 自己。
    // 之前不区分调用方，push 屏也拿到宿主，宿主把返回键当成「切 tab」吞掉，
    // 用户看到的就是「播放详情页按返回没反应」。
    const host = getTVTabHostFor(componentId)
    if (host) {
      // 有 push 屏盖在宿主上时让路：交给它 pop（appear/disappear 标记不可靠，见 tvTabHost）
      if (hasTVPushedScreen()) return false
      return host.back()
    }
    if (!componentId) return false
    void pop(componentId).catch(() => { })
    return true
  }, [componentId])

  useBackHandler(handleBack)
}
