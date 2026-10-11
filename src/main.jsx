import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'

function loadFonts() {
  const href =
    'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
  if (document.querySelector(`link[href="${href}"]`)) return

  const preconnectApi = Object.assign(document.createElement('link'), {
    rel: 'preconnect',
    href: 'https://fonts.googleapis.com',
  })
  const preconnectFiles = Object.assign(document.createElement('link'), {
    rel: 'preconnect',
    href: 'https://fonts.gstatic.com',
    crossOrigin: '',
  })
  const sheet = Object.assign(document.createElement('link'), { rel: 'stylesheet', href })
  document.head.append(preconnectApi, preconnectFiles, sheet)
}
loadFonts()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
