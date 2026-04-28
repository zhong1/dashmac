import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { I18nProvider } from './i18n/index'
import './styles/globals.css'

async function bootstrap() {
  const settings = await window.api.getSettings()
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <I18nProvider initialLang={settings.resolvedLanguage}>
        <App />
      </I18nProvider>
    </React.StrictMode>,
  )
}

bootstrap()
