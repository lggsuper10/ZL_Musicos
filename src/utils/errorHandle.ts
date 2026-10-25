import { Alert } from 'react-native'
// import { exitApp } from '@/utils/common'
import { setJSExceptionHandler, setNativeExceptionHandler } from 'react-native-exception-handler'
import { log } from '@/utils/log'
import { toast } from './tools'
import { getCachedIsTV } from '@/utils/tvMode'
import { showTVDialog } from '@/components/TV/TVDialog'

// 防递归标志：errorHandler 执行期间再次上报的错误直接吞掉。
// 否则 handler 内部任何一个调用（log/fs/dialog/console）抛错或产生未处理
// rejection，都会被 RN 再次送进本 handler，无限递归直到原生栈溢出崩溃
// （表现为闪退到 "Critical Error Occured!" 原生错误页）。
let handlingError = false

const errorHandler = (e: Error, isFatal: boolean) => {
  if (handlingError) return
  handlingError = true
  try {
    const excludedErrors = [
      'Failed to construct \'Response\'',
    ]
    const stack = typeof e?.stack === 'string' ? e.stack : `${e?.name ?? 'Error'} ${e?.message ?? String(e)}`
    // 打印完整堆栈到 logcat（可用 adb logcat -s ReactNativeJS 查看）
    console.error('[AppError]', isFatal ? 'Fatal: ' : '', e?.name, e?.message, '\n', stack)
    if (isFatal) {
      // 堆栈可能很长，弹窗里截断到前 1200 字符，足够定位出错文件/行号
      const stackText = `\n\nStack:\n${stack.slice(0, 1200)}${stack.length > 1200 ? '\n...(完整堆栈见 logcat)' : ''}`
      if (excludedErrors.some((excludedError) => e.message.includes(excludedError))) {
        toast('应用遇到了错误，如果你有固定的复现方式，请截图并在 GitHub 反馈（并附上具体的操作步骤，以及“设置-错误日志”的内容）')
      } else if (getCachedIsTV()) {
        showTVDialog({
          title: '💥 应用遇到错误',
          message: `以下是错误信息，请截图并在 GitHub 反馈。现在应用可能会出现异常，若出现异常请尝试强制结束应用后重新启动。\n\nError: ${isFatal ? 'Fatal: ' : ''}${e.name} ${e.message}${stackText}`,
          buttons: [
            { label: '关闭', tone: 'dark' },
          ],
        })
      } else {
        Alert.alert(
          '💥Unexpected error occurred💥',
          `
  应用出 bug 了😭，以下是错误异常信息。请截图并在 GitHub 反馈（并附上刚才你进行了什么操作，以及附上“设置-错误日志”的内容）。现在应用可能会出现异常，若出现异常请尝试强制结束应用后重新启动！

  Error:
  ${isFatal ? 'Fatal:' : ''} ${e.name} ${e.message}
  ${stackText}
  `,
          [{
            text: '关闭 (Close)',
            onPress: () => {
              // exitApp()
            },
          }],
        )
      }
    }
    log.error(stack)
  } catch (innerError) {
    // handler 内部任何异常都不允许再抛出去，否则会再次触发递归
    try {
      console.error('[AppError] errorHandler internal failure:', innerError)
    } catch {}
  } finally {
    handlingError = false
  }
}

if (process.env.NODE_ENV !== 'development') {
  setJSExceptionHandler(errorHandler)

  setNativeExceptionHandler((errorString) => {
    log.error(errorString)
    console.log('+++++', errorString, '+++++')
  }, false)
}
