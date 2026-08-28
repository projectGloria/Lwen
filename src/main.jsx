import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/index.css'

// Right-click context menus and text selection on chrome elements make a
// desktop app feel like a web page; suppress both outside of real inputs.
document.addEventListener('contextmenu', (e) => {
  const el = e.target
  const editable =
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el?.isContentEditable ||
    window.getSelection()?.toString()
  if (!editable) e.preventDefault()
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
