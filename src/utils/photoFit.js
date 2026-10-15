// Fotos dos carros no site (14/10/2026): a maioria é tirada com o celular em
// pé, e o quadro deitado dos cartões e da galeria cortava o meio da foto (a
// roda e a frente do carro sumiam). Quando a foto é bem mais alta que o quadro,
// ela aparece inteira e a própria foto, desfocada, preenche as laterais. Foto
// deitada continua cobrindo o quadro (corte pequeno).
//
// Vale para toda foto de carro (/uploads/carros/) com object-fit: cover, em
// qualquer tela do site, sem mexer no cartão de cada loja. O painel fica de fora.

const CAR_PHOTO = /\/uploads\/carros\//
// Cortar até uns 20% da foto ainda fica bom; mais que isso, mostra inteira
const MAX_CROP = 0.8
// Quadro marcado com data-foto-cheia (palco do modelo Vitrine): a foto deitada cobre
// o quadro largo (corta mais); só a foto em pé (ou muito estreita) aparece inteira
const MAX_CROP_CHEIA = 0.5

const STYLE = `
.photo-fit-box { isolation: isolate; overflow: hidden; }
.photo-fit-box::before {
  content: '';
  position: absolute;
  inset: -30px;
  z-index: -1;
  background: var(--photo-fit-bg) center / cover no-repeat;
  filter: blur(24px) brightness(0.82);
  pointer-events: none;
}
img.photo-fit-contain { object-fit: contain !important; }
`

// Decide o encaixe de uma foto já carregada. Devolve true se mostrou inteira.
export function fitPhoto(img) {
  const src = img?.currentSrc || img?.src || ''
  if (!CAR_PHOTO.test(src) || img.closest('.admin-shell')) return false
  const box = img.parentElement
  const { naturalWidth: w, naturalHeight: h } = img
  if (!box || !w || !h || !box.clientWidth || !box.clientHeight) return false
  const fit = getComputedStyle(img).objectFit
  if (fit !== 'cover' && !img.classList.contains('photo-fit-contain')) return false
  const photo = w / h
  const frame = box.clientWidth / box.clientHeight
  const contain = img.closest('[data-foto-cheia]') ? photo < 1 || shouldShowWhole(photo, frame, MAX_CROP_CHEIA) : shouldShowWhole(photo, frame)
  img.classList.toggle('photo-fit-contain', contain)
  box.classList.toggle('photo-fit-box', contain)
  if (contain) {
    if (getComputedStyle(box).position === 'static') box.style.position = 'relative'
    box.style.setProperty('--photo-fit-bg', `url("${src.replace(/"/g, '%22')}")`)
  }
  return contain
}

// photo e frame: largura / altura
export function shouldShowWhole(photo, frame, maxCrop = MAX_CROP) {
  return photo > 0 && frame > 0 && photo < frame * maxCrop
}

export function installPhotoFit() {
  if (typeof document === 'undefined' || window.__photoFitInstalled) return
  window.__photoFitInstalled = true
  const style = document.createElement('style')
  style.textContent = STYLE
  document.head.appendChild(style)
  // "load" não sobe pela página, mas passa pela captura
  document.addEventListener(
    'load',
    (e) => {
      if (e.target?.tagName === 'IMG') fitPhoto(e.target)
    },
    true
  )
}
