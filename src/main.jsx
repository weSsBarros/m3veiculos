import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { installWhatsAppRouter } from './utils/whatsappRouter.js'

// Botões de WhatsApp do site vão para o número de Configurações (fixo ou rodízio)
installWhatsAppRouter()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
