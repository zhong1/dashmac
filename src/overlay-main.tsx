import React from 'react'
import ReactDOM from 'react-dom/client'
import OverlayApp from './components/screenshot/OverlayApp'
import './styles/globals.css'

ReactDOM.createRoot(document.getElementById('overlay-root')!).render(
  <React.StrictMode>
    <OverlayApp />
  </React.StrictMode>,
)
