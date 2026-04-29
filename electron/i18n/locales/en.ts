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
}

export default en
