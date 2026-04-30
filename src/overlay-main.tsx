import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayApp from './components/screenshot/OverlayApp'
import { I18nProvider, type Lang } from './i18n/index'
import './styles/globals.css'

const queryLang = new URLSearchParams(window.location.search).get('lang')
const initialLang: Lang = queryLang === 'zh-CN' ? 'zh-CN' : 'en'

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
  <React.StrictMode>
    <I18nProvider initialLang={initialLang}>
      <OverlayApp />
    </I18nProvider>
  </React.StrictMode>,
)
