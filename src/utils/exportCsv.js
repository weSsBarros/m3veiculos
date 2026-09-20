// Exportação CSV sem dependências externas. Usa ";" como separador (padrão do
// Excel em pt-BR) e BOM UTF-8 (evita acentos quebrados ao abrir no Excel).

function escapeCell(value) {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[";\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function downloadCsv(filename, columns, rows) {
  const headerLine = columns.map((c) => escapeCell(c.label)).join(';')
  const lines = rows.map((row) => columns.map((c) => escapeCell(c.value(row))).join(';'))
  const csv = [headerLine, ...lines].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
