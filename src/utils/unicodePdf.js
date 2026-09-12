import { jsPDF } from 'jspdf'

const PX_PER_MM = 4
const PT_TO_PX = 96 / 72
const PAGE_WIDTH_MM = 210
const PAGE_HEIGHT_MM = 297

const createCanvas = () => {
  const canvas = document.createElement('canvas')
  canvas.width = PAGE_WIDTH_MM * PX_PER_MM
  canvas.height = PAGE_HEIGHT_MM * PX_PER_MM
  const context = canvas.getContext('2d')
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.textBaseline = 'alphabetic'
  return { canvas, context }
}

const toPixels = (value) => value * PX_PER_MM

const canvasToPng = (canvas) => canvas.toDataURL('image/png')

export function createUnicodePdf() {
  let page = createCanvas()
  const pages = []
  let fontFamily = 'Arial, "Segoe UI", sans-serif'
  let fontWeight = '400'
  let fontSize = 10
  let textColor = '#000000'
  let fillColor = '#ffffff'
  let strokeColor = '#000000'
  let currentPageIndex = 0

  const applyFont = () => {
    page.context.font = `${fontWeight} ${fontSize * PT_TO_PX}px ${fontFamily}`
  }

  const addPage = () => {
    pages.push(canvasToPng(page.canvas))
    page = createCanvas()
    currentPageIndex += 1
    applyFont()
  }

  return {
    setFont(_family, style = 'normal') {
      fontFamily = 'Arial, "Segoe UI", sans-serif'
      fontWeight = style === 'bold' ? '700' : '400'
      applyFont()
    },
    setFontSize(size) {
      fontSize = Number(size) || 10
      applyFont()
    },
    setTextColor(red, green, blue) {
      textColor = typeof red === 'string'
        ? red
        : `rgb(${red}, ${green}, ${blue})`
    },
    setFillColor(red, green, blue) {
      fillColor = typeof red === 'string'
        ? red
        : `rgb(${red}, ${green}, ${blue})`
    },
    setDrawColor(red, green, blue) {
      strokeColor = typeof red === 'string'
        ? red
        : `rgb(${red}, ${green}, ${blue})`
    },
    setLineWidth(width) {
      page.context.lineWidth = Math.max(0.1, toPixels(Number(width) || 0.1))
    },
    splitTextToSize(value, width) {
      applyFont()
      const maxWidth = toPixels(width)
      const words = String(value ?? '').split(/\s+/)
      const lines = []
      let current = ''

      words.forEach((word) => {
        const candidate = current ? `${current} ${word}` : word
        if (current && page.context.measureText(candidate).width > maxWidth) {
          lines.push(current)
          current = word
        } else {
          current = candidate
        }
      })

      if (current || !lines.length) lines.push(current)
      return lines
    },
    text(value, x, y, options = {}) {
      applyFont()
      page.context.fillStyle = textColor
      const lines = Array.isArray(value) ? value : [String(value ?? '')]
      const lineHeight = fontSize * PT_TO_PX * 1.2
      lines.forEach((line, index) => {
        const text = String(line ?? '')
        const width = page.context.measureText(text).width
        let drawX = toPixels(x)
        if (options.align === 'center') drawX -= width / 2
        if (options.align === 'right') drawX -= width
        page.context.fillText(text, drawX, toPixels(y) + index * lineHeight)
      })
    },
    rect(x, y, width, height, style = 'F') {
      const context = page.context
      context.fillStyle = fillColor
      context.strokeStyle = strokeColor
      context.beginPath()
      context.rect(toPixels(x), toPixels(y), toPixels(width), toPixels(height))
      if (style.includes('F')) context.fill()
      if (style.includes('D')) context.stroke()
    },
    addPage,
    save(filename) {
      pages.push(canvasToPng(page.canvas))
      const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
      pages.forEach((image, index) => {
        if (index > 0) pdf.addPage()
        pdf.addImage(image, 'PNG', 0, 0, 210, 297, undefined, 'FAST')
      })
      pdf.save(filename)
    }
  }
}