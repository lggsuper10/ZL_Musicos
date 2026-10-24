import { useCallback } from 'react'
import { pop } from '@/navigation'
import { getTVTabHost } from '@/components/TV/tvTabHost'
import { useBackHandler } from './useBackHandler'

export const useTVNavigationBack = (componentId?: string) => {
  const handleBack = useCallback(() => {
    // 顶部导航宿主内：页面是常驻挂载的，直接 pop 会把整个宿主屏关掉，
    // 返回键应该先退回首页 tab（回到首页后由首页自己的处理器决定是否退出应用）
    const host = getTVTabHost()
    if (host) return host.back()
    if (!componentId) return false
    void pop(componentId)
    return true
  }, [componentId])

  useBackHandler(handleBack)
}
