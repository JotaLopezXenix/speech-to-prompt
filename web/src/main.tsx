import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/source-serif-4'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import './index.css'
import './i18n'
import App from './App'
import { ThemeProvider } from './theme/ThemeProvider'
import { AuthProvider } from './auth/AuthProvider'

// Fija la clase de tema antes del primer paint para evitar parpadeo (default claro).
if (localStorage.getItem('stp-theme') === 'dark') {
  document.documentElement.classList.add('dark')
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
