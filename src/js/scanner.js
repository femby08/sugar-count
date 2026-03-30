/**
 * scanner.js — Barcode scanning + OpenFoodFacts integration
 * 
 * Uses a simple HTML5 approach: opens a camera stream, captures a barcode
 * via the BarcodeDetector API (Chrome/Android), then looks up the product
 * on OpenFoodFacts to auto-fill the food name and sugar content.
 * 
 * Fallback: if BarcodeDetector is not available, prompts for manual entry.
 */
import { showToast } from './ui.js'
import { getConfig } from './db.js'

/**
 * Lookup a product on OpenFoodFacts by barcode
 */
export async function lookupProduct(barcode) {
  try {
    const resp = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json`)
    if (!resp.ok) return null
    const data = await resp.json()
    
    if (data.status !== 1 || !data.product) return null
    
    const product = data.product
    return {
      name: product.product_name || product.product_name_es || 'Producto desconocido',
      sugar: product.nutriments?.sugars_100g ?? null,
      fiber: product.nutriments?.fiber_100g ?? null,
      servingSize: product.serving_size || '100g',
    }
  } catch (err) {
    console.error('OpenFoodFacts lookup failed:', err)
    return null
  }
}

let currentStream = null
let isScanning = false
let currentOverlay = null

export function forceCleanupScanner() {
  isScanning = false
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop())
    currentStream = null
  }
  if (currentOverlay) {
    currentOverlay.remove()
    currentOverlay = null
  }
}

/**
 * Attempt to scan a barcode using BarcodeDetector API
 * Falls back to manual input if not supported
 */
export async function scanBarcode() {
  // Check if BarcodeDetector is available (Chrome 83+, most Android browsers)
  if (!('BarcodeDetector' in window)) {
    // Fallback: prompt for manual barcode entry
    const code = prompt('Tu navegador no soporta el escáner. Introduce el código de barras manualmente:')
    if (code && code.trim()) {
      return await handleBarcodeResult(code.trim())
    }
    return null
  }

  // Prevent double launch
  if (isScanning) return
  isScanning = true

  return new Promise((resolve) => {
    // Create a fullscreen camera overlay
    currentOverlay = document.createElement('div')
    currentOverlay.id = 'scanner-overlay'
    currentOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#000;display:flex;flex-direction:column;align-items:center;justify-content:center;'
    
    const video = document.createElement('video')
    video.style.cssText = 'width:100%;max-height:70vh;object-fit:cover;border-radius:12px;'
    video.autoplay = true
    video.playsInline = true

    const label = document.createElement('p')
    label.textContent = 'Apunta al código de barras...'
    label.style.cssText = 'color:#fff;font-size:16px;margin-top:16px;'
    
    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.style.cssText = 'margin-top:16px;padding:10px 30px;border-radius:12px;background:#736CED;color:#fff;font-weight:600;font-size:14px;border:none;cursor:pointer;'
    
    currentOverlay.appendChild(video)
    currentOverlay.appendChild(label)
    currentOverlay.appendChild(cancelBtn)
    document.body.appendChild(currentOverlay)

    const cleanup = () => {
      forceCleanupScanner()
    }

    cancelBtn.addEventListener('click', () => {
      cleanup()
      resolve(null)
    })

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (mediaStream) => {
        currentStream = mediaStream
        video.srcObject = mediaStream

        const detector = new BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'] })
        
        const scanFrame = async () => {
          if (!isScanning) return
          try {
            const barcodes = await detector.detect(video)
            if (barcodes.length > 0) {
              const code = barcodes[0].rawValue
              cleanup()
              const result = await handleBarcodeResult(code)
              resolve(result)
              return
            }
          } catch (e) { /* frame not ready */ }
          requestAnimationFrame(scanFrame)
        }
        
        video.onloadedmetadata = () => scanFrame()
      })
      .catch(err => {
        console.error('Camera access failed:', err)
        cleanup()
        showToast('No se pudo acceder a la cámara.', true)
        resolve(null)
      })
  })
}

/**
 * Process a scanned barcode: lookup + auto-fill form fields
 */
async function handleBarcodeResult(barcode) {
  showToast(`Buscando código: ${barcode}...`)
  
  const product = await lookupProduct(barcode)
  
  if (!product) {
    showToast('Producto no encontrado en la base de datos.', true)
    return null
  }

  // Auto-fill the form fields
  const foodInput = document.getElementById('add-food')
  const sugarInput = document.getElementById('add-sugar')
  const fiberInput = document.getElementById('add-fiber')
  
  if (foodInput) foodInput.value = product.name
  if (sugarInput && product.sugar !== null) sugarInput.value = product.sugar
  if (fiberInput && product.fiber !== null) fiberInput.value = product.fiber

  showToast(`${product.name} — ${product.sugar ?? '?'}gr azúcar/100g`)
  return product
}

/**
 * ── AI NUTRITION LABEL SCANNER (Gemini Vision) ──
 * Takes a photo of the nutrition label and extracts sugar/fiber using Gemini 1.5 Flash
 */
export async function scanNutritionLabel() {
  // Check camera support
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('La cámara no es accesible en este dispositivo.', true)
    return null
  }

  if (isScanning) return
  isScanning = true

  return new Promise((resolve) => {
    // 1. Create a camera overlay specifically designed for a snapshot
    currentOverlay = document.createElement('div')
    currentOverlay.id = 'ai-scanner-overlay'
    currentOverlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#12121A;display:flex;flex-direction:column;align-items:center;justify-content:center;'
    
    // Header
    const header = document.createElement('div')
    header.style.cssText = 'position:absolute;top:0;left:0;right:0;padding:20px;text-align:center;background:linear-gradient(to bottom, rgba(0,0,0,0.8), transparent);z-index:2;'
    header.innerHTML = '<h3 style="color:#fff;font-weight:700;margin:0;">Analizador con IA</h3><p style="color:var(--text-dim);font-size:12px;margin:4px 0 0;">Enfoca la tabla nutricional</p>'

    const video = document.createElement('video')
    video.style.cssText = 'width:100%;height:100%;object-fit:cover;'
    video.autoplay = true
    video.playsInline = true

    // Controls container
    const controls = document.createElement('div')
    controls.style.cssText = 'position:absolute;bottom:0;left:0;right:0;padding:30px;display:flex;justify-content:space-around;align-items:center;background:linear-gradient(to top, rgba(0,0,0,0.9) 20%, transparent);z-index:2;'

    const cancelBtn = document.createElement('button')
    cancelBtn.textContent = 'Cancelar'
    cancelBtn.style.cssText = 'padding:12px 24px;border-radius:12px;background:var(--card);color:var(--text);font-weight:600;font-size:14px;border:1px solid var(--border);cursor:pointer;'
    
    const captureBtn = document.createElement('button')
    captureBtn.style.cssText = 'width:70px;height:70px;border-radius:50%;background:#fff;border:6px solid rgba(255,255,255,0.4);background-clip:padding-box;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);position:relative;display:flex;align-items:center;justify-content:center;'
    
    controls.appendChild(cancelBtn)
    controls.appendChild(captureBtn)
    
    currentOverlay.appendChild(video)
    currentOverlay.appendChild(header)
    currentOverlay.appendChild(controls)
    document.body.appendChild(currentOverlay)

    const cleanup = () => {
      forceCleanupScanner()
    }

    cancelBtn.addEventListener('click', () => {
      cleanup()
      resolve(null)
    })

    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (mediaStream) => {
        currentStream = mediaStream
        video.srcObject = mediaStream
        
        // Wait for video stream to initialize dimensions
        video.onloadedmetadata = () => {
          captureBtn.addEventListener('click', async () => {
            // Stop stream immediately to freeze frame and feel responsive
            captureBtn.disabled = true
            captureBtn.innerHTML = '<div style="width:24px;height:24px;border:3px solid var(--accent-d);border-top-color:#fff;border-radius:50%;animation:spin 1s linear infinite;"></div>'
            // Add spin animation to document if not exists
            if (!document.getElementById('spin-anim')) {
              const style = document.createElement('style')
              style.id = 'spin-anim'
              style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }'
              document.head.appendChild(style)
            }

            // 2. Take Snapshot
            const canvas = document.createElement('canvas')
            canvas.width = video.videoWidth
            canvas.height = video.videoHeight
            const ctx = canvas.getContext('2d')
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
            
            // Convert to base64 jpeg, highly compressed to save bandwidth
            const base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1] 
            
            // Stop camera hardware but keep UI running
            if (currentStream) currentStream.getTracks().forEach(t => t.stop())
            
            // 3. Send to Gemini
            showToast('Analizando imagen con IA...', false)
            try {
              const result = await callGeminiAPI(base64Image)
              cleanup()
              
              if (result && !result.error) {
                // Auto-fill the form fields
                const sugarInput = document.getElementById('add-sugar')
                const fiberInput = document.getElementById('add-fiber')
                
                if (sugarInput && result.sugar !== null) sugarInput.value = result.sugar
                if (fiberInput && result.fiber !== null) fiberInput.value = result.fiber
                
                showToast(`Análisis completo: ${result.sugar ?? 0}gr azúcar`, false)
                resolve(result)
              } else {
                showToast('No se encontraron datos claros. Rellénalo manual.', true)
                resolve(null)
              }
            } catch (e) {
              console.error(e)
              cleanup()
              showToast('Error de conexión con la IA.', true)
              resolve(null)
            }
          })
        }
      })
      .catch(err => {
        console.error('Camera access failed:', err)
        cleanup()
        showToast('No se pudo acceder a la cámara.', true)
        resolve(null)
      })
  })
}

/**
 * Calls the Gemini 1.5 Flash API with the base64 image
 * Returns { sugar: number, fiber: number } or { error: true }
 */
async function callGeminiAPI(base64Image) {
  const cfg = await getConfig()
  const API_KEY = cfg.geminiApiKey
  
  if (!API_KEY) {
    showToast('Añade tu API Key de Gemini en Ajustes.', true)
    return { error: true }
  }

  const promptText = `
    Analiza esta tabla de información nutricional. Extrae exclusivamente dos valores estandarizados POR CADA 100 GRAMOS (o 100ml):
    1. Azúcares totales (no hidratos de carbono totales, sino específicamente los azúcares).
    2. Fibra alimentaria.
    
    Devuelve ÚNICAMENTE un objeto JSON válido con este formato estricto y sin texto adicional:
    {
      "sugar": <número o null>,
      "fiber": <número o null>
    }
  `

  const payload = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: "image/jpeg", data: base64Image } }
      ]
    }],
    generationConfig: {
      temperature: 0.1, // We want precise extraction
      response_mime_type: "application/json" // Force JSON mode
    }
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!res.ok) throw new Error('Gemini API Error')
  
  const data = await res.json()
  const responseText = data.candidates[0].content.parts[0].text
  
  try {
    const parsed = JSON.parse(responseText)
    return {
      sugar: typeof parsed.sugar === 'number' ? parsed.sugar : null,
      fiber: typeof parsed.fiber === 'number' ? parsed.fiber : null
    }
  } catch(e) {
    console.warn("Could not parse JSON from Gemini:", responseText)
    return { error: true }
  }
}
