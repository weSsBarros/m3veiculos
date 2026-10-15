import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import './mobile.css'
import App from './App.jsx'
import { installWhatsAppRouter } from './utils/whatsappRouter.js'
import { applyAdminTheme, readAdminTheme } from './utils/adminTheme.js'
import { installPhotoFit } from './utils/photoFit.js'

// Botões de WhatsApp do site vão para o número de Configurações (fixo ou rodízio)
installWhatsAppRouter()

// Foto de carro em pé aparece inteira, com fundo desfocado (utils/photoFit.js)
installPhotoFit()

// Painel aberto direto (loja ou WB.Dev): o tema escolhido entra antes de desenhar (sem piscar branco)
if (/^\/(admin|wbdev)(\/|$)/.test(window.location.pathname)) applyAdminTheme(readAdminTheme())

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
