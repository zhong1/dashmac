import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayApp from './components/screenshot/OverlayApp'
import { I18nProvider } from './i18n/index'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
  <React.StrictMode>
    <I18nProvider initialLang="en">
      <OverlayApp />
    </I18nProvider>
  </React.StrictMode>,
)
