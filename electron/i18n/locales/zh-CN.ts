import en from './en'

const zhCN: typeof en = {
  tray: { tooltip: 'DashMac', open: '打开 DashMac', quit: '退出' },
  common: { cancel: '取消' },
  processControl: {
    confirmTitle: '终止进程？',
    confirmTermMessage: '确定要退出 {name}（PID {pid}）吗？',
    confirmForceMessage: '强制退出 {name}（PID {pid}）？未保存的数据将丢失。',
    confirmButton: '退出',
    confirmForceButton: '强制退出',
    cannotKillSelf: '不能终止 DashMac 自身',
    protected: '不能终止受保护的系统进程',
    error: {
      permission: '无权终止该进程。系统进程或其他用户的进程需要管理员权限。',
      notFound: '进程不存在（可能已退出）',
      invalidSignal: '无效的信号',
      generic: '终止进程失败：{message}',
    },
  },
  screenshot: {
    permission: {
      title: '需要屏幕录制权限',
      message: 'DashMac 需要屏幕录制权限来截屏。',
      detail: '请按以下步骤授权：\n1. 点击下方"打开系统设置"\n2. 在"隐私与安全性 → 屏幕录制"中勾选 DashMac\n3. 重启 DashMac（macOS 要求新授予的权限重启后生效）',
      openSettings: '打开系统设置',
      later: '稍后再说',
    },
  },
}

export default zhCN
