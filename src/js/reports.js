/**
 * reports.js — PDF and CSV report generation for medical use
 */
import { jsPDF } from 'jspdf'
import 'jspdf-autotable'
import { getLogs, getConfig } from './db.js'
import { dailyTotalsSync, calculateRecommendedMaxSugar } from './helpers.js'
import { showToast } from './ui.js'

/**
 * Generate a styled medical PDF report
 */
export async function generatePDF(range = '30') {
  try {
    const logs = await getLogs()
    const cfg = await getConfig()
    const days = parseInt(range) || 30
    const maxSugar = cfg.maxSugar > 0 ? cfg.maxSugar : calculateRecommendedMaxSugar(cfg.weight || 70, cfg.height || 170)

    const doc = new jsPDF({ unit: 'mm', format: 'a4' })
    const pw = doc.internal.pageSize.getWidth()

    // Header
    doc.setFillColor(115, 108, 237)
    doc.rect(0, 0, pw, 32, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(18)
    doc.text('Sugar Counter — Informe Médico', pw / 2, 15, { align: 'center' })
    doc.setFontSize(10)
    doc.text(`Generado: ${new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}`, pw / 2, 24, { align: 'center' })

    // Patient info
    doc.setTextColor(50, 50, 50)
    doc.setFontSize(11)
    let y = 42
    doc.text(`Peso: ${cfg.weight || '—'} kg    |    Altura: ${cfg.height || '—'} cm    |    Límite diario: ${maxSugar} gr`, 14, y)
    y += 10

    // Summary stats
    const dailyData = dailyTotalsSync(logs, days)
    const totals = dailyData.map(d => d.total)
    const totalSum = totals.reduce((s, v) => s + v, 0)
    const avg = totals.length ? (totalSum / totals.length).toFixed(1) : 0
    const maxDay = Math.max(...totals, 0)
    const minDay = Math.min(...totals.filter(t => t > 0), 0) || 0
    const daysOverLimit = totals.filter(t => t > maxSugar).length

    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text(`Resumen — Últimos ${days} días`, 14, y)
    doc.setFont(undefined, 'normal')
    doc.setFontSize(10)
    y += 8

    const summaryData = [
      ['Total consumido', `${totalSum.toFixed(1)} gr`],
      ['Promedio diario', `${avg} gr`],
      ['Máximo en un día', `${maxDay} gr`],
      ['Mínimo en un día', `${minDay} gr`],
      ['Días por encima del límite', `${daysOverLimit} / ${days}`],
      ['Racha actual', `${cfg.streak || 0} días`],
      ['Mejor racha', `${cfg.bestStreak || 0} días`],
    ]

    doc.autoTable({
      startY: y,
      head: [['Métrica', 'Valor']],
      body: summaryData,
      theme: 'grid',
      headStyles: { fillColor: [115, 108, 237], textColor: 255 },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 9 },
    })

    y = doc.lastAutoTable.finalY + 12

    // Daily breakdown table
    doc.setFontSize(12)
    doc.setFont(undefined, 'bold')
    doc.text('Desglose Diario', 14, y)
    doc.setFont(undefined, 'normal')
    y += 4

    const tableBody = dailyData.map(d => [
      d.label,
      `${d.total.toFixed(1)} gr`,
      `${Math.round(d.total / maxSugar * 100)}%`,
      d.total > maxSugar ? '⚠ Excedido' : '✓ OK'
    ])

    doc.autoTable({
      startY: y,
      head: [['Fecha', 'Azúcar', '% Límite', 'Estado']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [115, 108, 237], textColor: 255 },
      margin: { left: 14, right: 14 },
      styles: { fontSize: 8 },
    })

    // Footer
    const pageCount = doc.internal.getNumberOfPages()
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(150)
      doc.text('Sugar Counter — Informe generado automáticamente. No sustituye consejo médico.', pw / 2, doc.internal.pageSize.getHeight() - 8, { align: 'center' })
    }

    doc.save(`sugar-counter-informe-${new Date().toISOString().slice(0, 10)}.pdf`)
    showToast(window.t ? window.t('reports.pdf_ok', 'Informe PDF generado.') : 'Informe PDF generado.')
  } catch (err) {
    console.error('PDF generation failed:', err)
    showToast(window.t ? window.t('reports.pdf_error', 'Error al generar PDF.') : 'Error al generar PDF.', true)
  }
}

/**
 * Generate a CSV file suitable for spreadsheet / medical import
 */
export async function generateCSV() {
  try {
    const logs = await getLogs()
    const cfg = await getConfig()

    const header = 'Fecha,Hora,Alimento,Azúcar (gr),Fibra (gr)\n'
    const rows = logs
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map(l => {
        const d = new Date(l.date)
        return `${d.toLocaleDateString('es-ES')},${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })},"${l.food}",${l.sugar},${l.fiber || 0}`
      })
      .join('\n')

    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sugar-counter-datos-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a)
    a.click()
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
    showToast(window.t ? window.t('reports.csv_ok', 'CSV exportado.') : 'CSV exportado.')
  } catch (err) {
    console.error('CSV generation failed:', err)
    showToast(window.t ? window.t('reports.csv_error', 'Error al exportar CSV.') : 'Error al exportar CSV.', true)
  }
}
