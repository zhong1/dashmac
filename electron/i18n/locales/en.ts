const en = {
  tray: { tooltip: 'DashMac', open: 'Open DashMac', quit: 'Quit' },
  common: { cancel: 'Cancel' },
  processControl: {
    confirmTitle: 'Quit process?',
    confirmTermMessage: 'Are you sure you want to quit {name} (PID {pid})?',
    confirmForceMessage: 'Force quit {name} (PID {pid})? Unsaved data will be lost.',
    confirmButton: 'Quit',
    confirmForceButton: 'Force Quit',
    cannotKillSelf: 'Cannot kill DashMac itself',
    protected: 'Cannot kill protected system process',
    error: {
      permission: 'No permission to kill this process. System processes or those owned by other users require admin privileges.',
      notFound: 'Process does not exist (may have already exited)',
      invalidSignal: 'Invalid signal',
      generic: 'Failed to kill process: {message}',
    },
  },
  screenshot: {
    permission: {
      title: 'Screen Recording permission required',
      message: 'DashMac needs Screen Recording permission to capture screenshots.',
      detail: 'Steps to grant:\n1. Click "Open System Settings" below\n2. In "Privacy & Security → Screen Recording", enable DashMac\n3. Restart DashMac (macOS requires a restart for new permissions to take effect)',
      openSettings: 'Open System Settings',
      later: 'Later',
    },
  },
}

export default en
