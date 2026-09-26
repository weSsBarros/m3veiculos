import { useCallback, useState } from 'react'
import ConfirmDialog from './ConfirmDialog.jsx'

// Substitui o window.confirm(): alguns navegadores (embutidos em apps,
// alguns de celular) bloqueiam a janela nativa e respondem "Cancelar" sozinhos.
// Uso: const { confirm, confirmDialog } = useConfirm()
//      if (!(await confirm('Excluir?'))) return
//      ...e renderizar {confirmDialog} no JSX.
export default function useConfirm() {
  const [pending, setPending] = useState(null)

  const confirm = useCallback(
    (message, { title = 'Confirmar', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar' } = {}) =>
      new Promise((resolve) => {
        setPending({ message, title, confirmLabel, cancelLabel, resolve })
      }),
    []
  )

  function close(result) {
    pending?.resolve(result)
    setPending(null)
  }

  const confirmDialog = pending ? (
    <ConfirmDialog
      title={pending.title}
      message={pending.message}
      onClose={() => close(false)}
      options={[
        { label: pending.confirmLabel, variant: 'primary', onClick: () => close(true) },
        { label: pending.cancelLabel, onClick: () => close(false) },
      ]}
    />
  ) : null

  return { confirm, confirmDialog }
}
