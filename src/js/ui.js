/**
 * ui.js — DOM rendering, navigation, and toast notifications
 */
import Toastify from 'toastify-js'
import 'toastify-js/src/toastify.css'
import DOMPurify from 'dompurify'
import { getLogs, saveLog, deleteLog, getConfig, getSugarTotals } from './db.js'
import { fmt, glucoseLevel, startOfDay, endOfDay, calculateRecommendedMaxSugar } from './helpers.js'
import { chartDefaults, renderHomeChart, renderStatsChart } from './charts.js'
import { getAchievementList } from './gamification.js'
import { getAppVersion, fetchLatestReleaseInfo, fetchReleasesList } from './update.js'
import { getGeminiKey } from './secureStorage.js'

/* ── Material Ripple ── */
export function initRipples() {
  document.addEventListener('click', (e) => {
    const target = e.target.closest('.btn-accent, .nav-btn, .sort-btn, .day-card, .list-card, button')
    if (!target) return

    // Set position relative dynamically if not already set to avoid breaking layouts
    const computedStyle = window.getComputedStyle(target)
    if (computedStyle.position === 'static') {
      target.style.position = 'relative'
    }
    target.style.overflow = 'hidden'
    const rect = target.getBoundingClientRect()
    const size = Math.max(rect.width, rect.height)
    const x = e.clientX - rect.left - size / 2
    const y = e.clientY - rect.top - size / 2

    const span = document.createElement('span')
    span.className = 'ripple-span'
    if (target.classList.contains('dark-ripple')) {
      span.classList.add('dark-ripple')
    }

    span.style.width = span.style.height = `${size}px`
    span.style.left = `${x}px`
    span.style.top = `${y}px`

    target.appendChild(span)
    setTimeout(() => span.remove(), 600)
  })
}

/* ── Toast ── */
export function showToast(text, isError = false) {
  Toastify({
    text,
    duration: 2800,
    gravity: 'top',
    position: 'center',
    style: {
      background: isError ? '#dc2626' : 'var(--accent-d)',
      borderRadius: '12px',
      fontSize: '14px',
      fontWeight: '600',
      boxShadow: '0 4px 18px rgba(0,0,0,.2)',
      fontFamily: "'SN Pro','Inter',sans-serif"
    }
  }).showToast()
}

/* ── animateCounter ── */
function animateCounter(el, target, dur) {
  if (!el || !target) return
  var st=null, isF=target%1!==0
  function step(ts){if(!st)st=ts;var p=Math.min((ts-st)/dur,1),e=p===1?1:1-Math.pow(2,-10*p);el.textContent=isF?(target*e).toFixed(1):Math.round(target*e);if(p<1)requestAnimationFrame(step);else el.textContent=isF?target.toFixed(1):target}
  requestAnimationFrame(step)
}
function getFrequentFoods(logs,n){var c={};logs.forEach(function(l){var k=(l.food||'').toLowerCase().trim();if(!k)return;if(!c[k])c[k]={name:l.food,sugar:l.sugar,count:0};c[k].count++;c[k].sugar=l.sugar});return Object.values(c).sort(function(a,b){return b.count-a.count}).slice(0,n)}
async function renderFrequentChips(){var row=document.getElementById('freq-chips-row');if(!row)return;var logs=await getLogs(),foods=getFrequentFoods(logs,6);row.innerHTML='';if(!foods.length){row.style.display='none';return}row.style.display='flex';foods.forEach(function(f){var chip=document.createElement('button');chip.className='freq-chip';chip.innerHTML='<span>'+f.name+'</span><span class="freq-chip-sugar">'+f.sugar+'gr</span>';chip.addEventListener('click',function(){document.getElementById('add-food').value=f.name;document.getElementById('add-sugar').value=f.sugar;chip.style.transform='scale(0.93)';setTimeout(function(){chip.style.transform=''},150)});row.appendChild(chip)})}
async function deleteEntry(id){await deleteLog(id);await renderHome();if(document.getElementById('overlay-stats')?.classList.contains('open')){var r=await renderStatsChart(window.__currentRange||'7d');if(r)renderFoodTable(r.logs,r.range)}if(document.getElementById('overlay-day-detail')?.classList.contains('open')){dayDetailLogs=dayDetailLogs.filter(function(l){return l.id!==id});renderDayDetailList()}showToast(window.t?window.t('settings.deleted','Registro eliminado.'):'Registro eliminado.',false,'info')}
export function openEditSheet(entry){var dt=new Date(entry.date),local=new Date(dt.getTime()-dt.getTimezoneOffset()*60000).toISOString().slice(0,16);document.getElementById('add-datetime').value=local;document.getElementById('add-food').value=entry.food||'';document.getElementById('add-sugar').value=entry.sugar??'';document.getElementById('add-fiber').value=entry.fiber||'';document.getElementById('add-error').style.display='none';renderFrequentChips();document.getElementById('sheet-backdrop').classList.add('open');var sheet=document.getElementById('sheet-add');if(sheet){sheet.dataset.editId=entry.id;sheet.style.maxHeight='92dvh';sheet.style.borderRadius='28px 28px 0 0';sheet.style.transform='';sheet.classList.add('open');setTimeout(function(){setSheetExpanded(sheet,true)},560)}var sb=document.getElementById('btn-save-entry');if(sb)sb.textContent=window.t?window.t('add.btn_update','Guardar cambios'):'Guardar cambios'}
function attachSwipe(content,editBg,delBg,onEdit,onDelete){var sX=0,sT=0,cX=0,sw=false,rW=0;content.addEventListener('touchstart',function(e){rW=content.offsetWidth||300;sX=e.touches[0].clientX;sT=Date.now();cX=0;sw=true;content.style.transition='none'},{passive:true});content.addEventListener('touchmove',function(e){if(!sw)return;var dx=e.touches[0].clientX-sX;cX=dx;content.style.transform='translateX('+Math.max(-rW*.55,Math.min(rW*.55,dx))+'px)';var p=Math.abs(dx)/(rW*.35);if(dx>10){editBg.style.opacity=Math.min(1,p);delBg.style.opacity=0}else if(dx<-10){delBg.style.opacity=Math.min(1,p);editBg.style.opacity=0}else{editBg.style.opacity=0;delBg.style.opacity=0}},{passive:true});content.addEventListener('touchend',function(){if(!sw)return;sw=false;var ease='cubic-bezier(0.71,0.40,0.16,0.99)';content.style.transition='transform .32s '+ease;editBg.style.opacity=0;delBg.style.opacity=0;var vel=Math.abs(cX)/Math.max(1,Date.now()-sT),hit=Math.abs(cX)>rW*.35||vel>.4;if(hit&&cX>0){content.style.transform='translateX(0)';setTimeout(onEdit,160)}else if(hit&&cX<0){content.style.transform='translateX(-110%)';setTimeout(onDelete,280)}else content.style.transform='translateX(0)'},{passive:true})}
/* ── Range state ── */
let currentRange = '7d'
export function getCurrentRange() { return currentRange }

/* ── Render Home ── */
export async function renderHome() {
  const cfg = await getConfig()
  const now = new Date()
  const sod = startOfDay(now)

  const today = await getSugarTotals(sod, endOfDay(now))

  const weekStart = new Date(now)
  weekStart.setDate(weekStart.getDate() - 7)
  weekStart.setHours(0, 0, 0, 0)
  const week = await getSugarTotals(weekStart, endOfDay(now))

  // Calculate true medical maximum limit based on WHO guidelines
  // Assume default values if user hasn't configured them
  const trueMaxSugar = calculateRecommendedMaxSugar(cfg.weight || 70, cfg.height || 170)

  // Use user's manual override if set, otherwise fallback to medical truth
  const activeMaxSugar = cfg.maxSugar > 0 ? cfg.maxSugar : trueMaxSugar

  const pct = Math.min(999, Math.round(today / activeMaxSugar * 100))

  var tN=today%1===0?today:parseFloat(today.toFixed(1));animateCounter(document.getElementById('stat-today'),tN,700)
  document.getElementById('stat-pct').textContent=Math.min(pct,999)+'%'
  document.getElementById('stat-week').textContent=fmt(week)
  var sp2=document.getElementById('stat-pct-secondary');if(sp2)sp2.textContent=Math.min(pct,999)+'%'
  var rng=document.getElementById('home-ring');if(rng){rng.style.strokeDashoffset=220-Math.min(pct,100)/100*220;rng.style.stroke=pct<60?'var(--accent)':pct<85?'#f59e0b':'#ef4444'}
  var pb=document.getElementById('home-progress-bar');if(pb){pb.style.width=Math.min(pct,100)+'%';pb.style.background=pct<60?'var(--accent)':pct<85?'#f59e0b':'#ef4444'}
  var hl=document.getElementById('home-logo');if(hl)hl.src=document.documentElement.classList.contains('light')?'assets/icons/icono-oscuro.png':'assets/icons/icono-claro.png'
  var ge=document.getElementById('home-greeting');if(ge){const k=cfg.sex==='male'?'home.welcome_m':'home.welcome_f';ge.setAttribute('data-i18n',k);try{const{t}=await import('./i18n.js');ge.textContent=t(k)}catch(e){}}
  var im=document.getElementById('info-max-gr');if(im)im.textContent=fmt(activeMaxSugar)
  var it=document.getElementById('info-today-gr');if(it)it.textContent=fmt(today)
  var iw=document.getElementById('info-week-avg');if(iw)iw.textContent=fmt(week/7)

  // Food list
  const allLogs = await getLogs()
  window.__lastCfg  = cfg
  window.__lastLogs = allLogs
  const todayLogs = allLogs
    .filter(l => new Date(l.date) >= sod)
    .sort((a, b) => new Date(b.date) - new Date(a.date))

  // Calculate today's total fiber for the glucose dampening formula
  const todayFiber = todayLogs.reduce((sum, l) => sum + (l.fiber || 0), 0)
  const fiberRatio = today > 0 ? todayFiber / today : 0
  const gluco = glucoseLevel(pct, fiberRatio)

  document.getElementById('glucose-pct').textContent=gluco+'%'
  var gf=document.getElementById('glucose-fill');if(gf&&gf.style)gf.style.height=gluco+'%'
  var ul=document.getElementById('home-food-list'),emp=document.getElementById('home-food-empty'),cnt=document.getElementById('home-logs-count');ul.innerHTML=''
  if(!todayLogs.length){emp.style.display='block';ul.style.display='none';if(cnt)cnt.textContent=''}
  else{emp.style.display='none';ul.style.display='flex';ul.style.flexDirection='column';if(cnt)cnt.textContent=todayLogs.length+' registro'+(todayLogs.length!==1?'s':'');todayLogs.forEach(function(l,i){var li=document.createElement('li'),sn=DOMPurify.sanitize(l.food,{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}),tm=new Date(l.date).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),sp=activeMaxSugar>0?l.sugar/activeMaxSugar:0,sc=sp>=.4?'#f87171':sp>=.2?'#f59e0b':'var(--accent-l)',fb=l.fiber?'<span style="font-size:10px;font-weight:600;padding:1px 7px;border-radius:99px;background:rgba(139,141,242,0.1);color:var(--accent-l);">+'+l.fiber+'f</span>':'';li.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:11px 18px;'+(i<todayLogs.length-1?'border-bottom:1px solid var(--border);':'');li.innerHTML='<div style="display:flex;align-items:center;gap:8px;min-width:0;flex:1;"><span style="font-size:11px;color:var(--text-dim);font-weight:500;flex-shrink:0;">'+tm+'</span><span style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+sn+'</span>'+fb+'</div><span style="font-size:14px;font-weight:700;color:'+sc+';flex-shrink:0;margin-left:10px;">'+l.sugar+'gr</span>';ul.appendChild(li)})}

  chartDefaults()
  await renderHomeChart()

  // Streak & achievements (only if elements exist)
  const streakEl = document.getElementById('streak-count')
  if (streakEl) streakEl.textContent = cfg.streak || 0
  const bestEl = document.getElementById('streak-best')
  if (bestEl) bestEl.textContent = cfg.bestStreak || 0
  const achRow = document.getElementById('achievements-row')
  if (achRow) {
    const list = getAchievementList(cfg.achievements || [])
    achRow.innerHTML = list
      .filter(a => a.unlocked)
      .map(a => `<span title="${a.name}" style="font-size:18px;cursor:default;">${a.icon}</span>`)
      .join('')
  }
}

/* ── Render Settings ── */
export async function renderSettings() {
  const cfg = await getConfig()
  document.getElementById('cfg-max-sugar').value = cfg.maxSugar || ''
  document.getElementById('cfg-weight').value = cfg.weight || ''
  document.getElementById('cfg-height').value = cfg.height || ''
  var ageEl=document.getElementById('cfg-age');if(ageEl)ageEl.value=cfg.age||''
  var sexEl=document.getElementById('cfg-sex');if(sexEl)sexEl.value=cfg.sex||'female'
  var sexVal=cfg.sex||'female';document.querySelectorAll('.sex-btn').forEach(function(b){var a=b.dataset.sex===sexVal;b.style.borderColor=a?'var(--accent)':'var(--border)';b.style.background=a?'rgba(139,141,242,0.1)':'transparent';b.style.color=a?'var(--accent-l)':'var(--text-dim)';b.style.fontWeight=a?'700':'600'})
  var actV=cfg.activity||'moderate';document.querySelectorAll('.activity-option[data-activity]').forEach(function(o){var isA=o.dataset.activity===actV;o.classList.toggle('active',isA);var c=o.querySelector('.activity-check');if(c)c.style.opacity=isA?'1':'0'})
  if(window.updateAutoLimitChip)window.updateAutoLimitChip(cfg)
  document.getElementById('cfg-font').value = cfg.font || ''

  // Gemini key viene de Secure Storage, no de IndexedDB
  const geminiKey = await getGeminiKey()
  document.getElementById('cfg-gemini-key').value = geminiKey ? '••••••••' : ''

  // Base notification toggle
  document.getElementById('notif-toggle').classList.toggle('on', cfg.notifications)

  // Notification times container visibility
  const container = document.getElementById('notif-times-container')
  if (cfg.notifications) {
    container.style.opacity = '1'
    container.style.maxHeight = '350px'
  } else {
    container.style.opacity = '0'
    container.style.maxHeight = '0'
  }

  // Populate time inputs
  document.getElementById('cfg-notif-comer-start').value = cfg.notifComerStart || '14:30'
  document.getElementById('cfg-notif-comer-end').value = cfg.notifComerEnd || '15:30'

  document.getElementById('cfg-notif-cena-start').value = cfg.notifCenaStart || '21:00'
  document.getElementById('cfg-notif-cena-end').value = cfg.notifCenaEnd || '22:00'

  const meriendaToggle = document.getElementById('cfg-notif-merienda-toggle')
  const meriendaStart = document.getElementById('cfg-notif-merienda-start')
  const meriendaEnd = document.getElementById('cfg-notif-merienda-end')
  meriendaToggle.checked = !!cfg.notifMeriendaEnabled
  meriendaStart.value = cfg.notifMeriendaStart || '18:00'
  meriendaEnd.value = cfg.notifMeriendaEnd || '19:00'

  if (meriendaToggle.checked) {
    meriendaStart.style.opacity = '1'
    meriendaStart.style.pointerEvents = 'all'
    meriendaEnd.style.opacity = '1'
    meriendaEnd.style.pointerEvents = 'all'
  } else {
    meriendaStart.style.opacity = '0.5'
    meriendaStart.style.pointerEvents = 'none'
    meriendaEnd.style.opacity = '0.5'
    meriendaEnd.style.pointerEvents = 'none'
  }

  // Theme segmentation
  ;['dark', 'light', 'system'].forEach(t =>
    document.getElementById('seg-' + t).classList.toggle('active', cfg.theme === t)
  )

  // Version label in About section
  const versionLabel = document.getElementById('app-version-label')
  if (versionLabel) {
    const version = getAppVersion()
    versionLabel.textContent = `v${version}`
  }

  // Version pill in Updater section
  const updaterPill = document.getElementById('updater-version-pill')
  if (updaterPill) {
    const version = getAppVersion()
    updaterPill.textContent = `Versión ${version}`
  }

  // Update toggles
  document.getElementById('auto-update-toggle')?.classList.toggle('on', !!cfg.autoUpdate)
  document.getElementById('notif-update-toggle')?.classList.toggle('on', !!cfg.notifUpdate)
}

/* ── Sort state ── */
let foodSortOrder = 'desc' // 'desc' = most sugar first, 'asc' = least first
let lastFoodTableData = null // cache for re-sorting without refetch

export function setSortOrder(order) {
  foodSortOrder = order
  // Update button styles
  document.getElementById('btn-sort-desc')?.classList.toggle('active', order === 'desc')
  document.getElementById('btn-sort-asc')?.classList.toggle('active', order === 'asc')
  // Re-render with cached data
  if (lastFoodTableData) {
    renderFoodTable(lastFoodTableData.logs, lastFoodTableData.range)
  }
}

/* ── Food table (stats) ── */
export function renderFoodTable(logs, range) {
  lastFoodTableData = { logs, range }

  let cutoff = new Date()
  switch (range) {
    case '24h': cutoff.setHours(cutoff.getHours() - 24); break
    case '7d': cutoff.setDate(cutoff.getDate() - 7); break
    case '14d': cutoff.setDate(cutoff.getDate() - 14); break
    case '1m': cutoff.setMonth(cutoff.getMonth() - 1); break
    case '6m': cutoff.setMonth(cutoff.getMonth() - 6); break
    case '1y': cutoff.setFullYear(cutoff.getFullYear() - 1); break
  }

  let filtered = logs.filter(l => new Date(l.date) >= cutoff)

  // Sort by sugar amount
  if (foodSortOrder === 'desc') {
    filtered.sort((a, b) => b.sugar - a.sugar)
  } else {
    filtered.sort((a, b) => a.sugar - b.sugar)
  }

  const tbl = document.getElementById('stats-food-table')
  const emp = document.getElementById('stats-food-empty')
  tbl.innerHTML = ''
  const _si3 = document.getElementById('stats-search')
  if (_si3) {
    const _ns3 = _si3.cloneNode(true); _si3.parentNode.replaceChild(_ns3, _si3)
    _ns3.addEventListener('input', () => {
      const q = _ns3.value.toLowerCase().trim()
      tbl.querySelectorAll('.food-row').forEach(r => { const nm = r.querySelector('p') ? r.querySelector('p').textContent.toLowerCase() : ''; r.style.display = (!q || nm.includes(q)) ? '' : 'none' })
    })
  }

  if (!filtered.length) { emp.style.display = 'block'; return }
  emp.style.display = 'none'

  var si=document.getElementById('stats-search');if(si){var ns=si.cloneNode(true);si.parentNode.replaceChild(ns,si);ns.addEventListener('input',function(){var q=ns.value.toLowerCase().trim();tbl.querySelectorAll('.food-row').forEach(function(r){var nm=r.querySelector('.food-row-content p')?r.querySelector('.food-row-content p').textContent.toLowerCase():'';r.style.display=(!q||nm.includes(q))?'':'none'})})}
  if(!tbl.parentNode.querySelector('.swipe-hint')){var sh=document.createElement('p');sh.className='swipe-hint';sh.style.cssText='font-size:11px;color:var(--text-dim);text-align:center;padding:4px 0 8px;margin:0;';sh.textContent='\u2190 borrar \u00b7 editar \u2192';tbl.parentNode.insertBefore(sh,tbl)}
  filtered.slice(0,60).forEach(function(l){var d7=new Date(l.date),ds7=d7.toLocaleDateString('es-ES',{day:'numeric',month:'short'})+' \u00b7 '+d7.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}),sn7=DOMPurify.sanitize(l.food,{ALLOWED_TAGS:[],ALLOWED_ATTR:[]}),fb7=l.fiber?'<span style="font-size:10px;font-weight:600;padding:1px 6px;border-radius:99px;background:rgba(139,141,242,0.1);color:var(--accent-l);margin-left:4px;">+'+l.fiber+'f</span>':'',w7=document.createElement('div');w7.className='food-row';var eb7=document.createElement('div');eb7.className='food-row-action-bg food-row-edit-bg';eb7.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg><span>Editar</span>';var db7=document.createElement('div');db7.className='food-row-action-bg food-row-delete-bg';db7.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg><span>Borrar</span>';var c7=document.createElement('div');c7.className='food-row-content';c7.innerHTML='<div style="flex:1;min-width:0;overflow:hidden;"><p style="font-size:13px;font-weight:500;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;">'+sn7+fb7+'</p><p style="font-size:11px;color:var(--text-dim);margin:3px 0 0;">'+ds7+'</p></div><span style="font-size:13px;font-weight:700;color:var(--accent-l);flex-shrink:0;">'+l.sugar+'gr</span>';w7.appendChild(eb7);w7.appendChild(db7);w7.appendChild(c7);tbl.appendChild(w7);(function(e7){attachSwipe(c7,eb7,db7,function(){openEditSheet(e7)},function(){deleteEntry(e7.id)})})(l)})
}

/* ── Navigation ── */
export function goTo(name) {
  document.getElementById('view-home').classList.toggle('active', name === 'home')
  document.getElementById('nav-home').classList.toggle('nav-active', name === 'home')
  document.getElementById('nav-home').style.color = name === 'home' ? '#fff' : 'var(--text-dim)'
  document.getElementById('nav-cfg').classList.remove('nav-active')
  document.getElementById('nav-cfg').style.color = 'var(--text-dim)'
  closeStats()
  closeSettings()
  if (name === 'home') renderHome()
}

export function openStats() {
  document.getElementById('overlay-stats').classList.add('open')
  chartDefaults()
  setRange(currentRange)
}

export function closeStats() {
  document.getElementById('overlay-stats').classList.remove('open')
}

/* ── Day Detail overlay ── */
let dayDetailSort = 'time-desc'
let dayDetailLogs = []
let dayDetailMaxSugar = 50 // fallback, se actualiza al abrir

export function closeDayDetail() {
  document.getElementById('overlay-day-detail')?.classList.remove('open')
}

window.openDayDetail = async function(label, logs, range) {
  dayDetailLogs = logs
  dayDetailSort = 'time-desc'

  // Obtener límite del usuario para calcular % del día
  try {
    const cfg = await getConfig()
    dayDetailMaxSugar = cfg.maxSugar > 0 ? cfg.maxSugar : 50
  } catch { dayDetailMaxSugar = 50 }

  const overlay = document.getElementById('overlay-day-detail')
  if (!overlay) return
  overlay.classList.add('open')

  document.getElementById('day-detail-title').textContent = label
  document.getElementById('day-detail-subtitle').textContent =
    range === '24h' ? 'Registros de esta hora' : 'Registros del día'

  // Reset sort buttons
  document.querySelectorAll('.day-sort-btn').forEach(b => {
    b.style.background  = 'var(--card)'
    b.style.color       = 'var(--text-dim)'
    b.style.borderColor = 'var(--border)'
  })
  const activeBtn = document.querySelector('[data-day-sort="time-desc"]')
  if (activeBtn) {
    activeBtn.style.background  = 'var(--accent)'
    activeBtn.style.color       = '#fff'
    activeBtn.style.borderColor = 'var(--accent)'
  }

  renderDayDetailList()

  document.querySelectorAll('.day-sort-btn').forEach(btn => {
    btn.onclick = () => {
      dayDetailSort = btn.dataset.daySort
      document.querySelectorAll('.day-sort-btn').forEach(b => {
        b.style.background  = 'var(--card)'
        b.style.color       = 'var(--text-dim)'
        b.style.borderColor = 'var(--border)'
      })
      btn.style.background  = 'var(--accent)'
      btn.style.color       = '#fff'
      btn.style.borderColor = 'var(--accent)'
      renderDayDetailList()
    }
  })
}

function renderDayDetailList() {
  const list  = document.getElementById('day-detail-list')
  const empty = document.getElementById('day-detail-empty')
  if (!list) return

  let sorted = [...dayDetailLogs]
  if (dayDetailSort === 'time-desc')  sorted.sort((a, b) => new Date(b.date) - new Date(a.date))
  else if (dayDetailSort === 'time-asc')   sorted.sort((a, b) => new Date(a.date) - new Date(b.date))
  else if (dayDetailSort === 'sugar-desc') sorted.sort((a, b) => b.sugar - a.sugar)
  else if (dayDetailSort === 'sugar-asc')  sorted.sort((a, b) => a.sugar - b.sugar)

  const total      = sorted.reduce((s, l) => s + l.sugar, 0)
  const totalFiber = sorted.reduce((s, l) => s + (l.fiber || 0), 0)
  const max        = sorted.length ? Math.max(...sorted.map(l => l.sugar)) : 0
  const pctDay     = dayDetailMaxSugar > 0 ? Math.round((total / dayDetailMaxSugar) * 100) : 0
  const fmt        = n => (n % 1 === 0 ? n : n.toFixed(1)) + 'gr'

  document.getElementById('day-detail-total').textContent=fmt(total);document.getElementById('day-detail-count').textContent=sorted.length;document.getElementById('day-detail-max').textContent=fmt(max)
  var fr8=total>0?totalFiber/total:0,gd8=glucoseLevel(pctDay,fr8),ge8=document.getElementById('day-detail-glucose');if(ge8)ge8.textContent=gd8+'%'
  var sub8=document.getElementById('day-detail-subtitle');if(sub8){var ex8=pctDay+'% del l\u00edmite';if(totalFiber>0)ex8+=' \u00b7 '+fmt(totalFiber)+' fibra';ex8+=' \u00b7 glucosa '+gd8+'%';sub8.textContent=ex8}

  list.innerHTML = ''

  if (!sorted.length) {
    empty.style.display = 'block'
    list.style.display  = 'none'
    return
  }
  empty.style.display = 'none'
  list.style.display  = 'flex'
  list.style.flexDirection = 'column'

  sorted.forEach(l => {
    const d        = new Date(l.date)
    const time     = d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    const safeName = l.food?.replace(/</g, '&lt;') || '—'
    const barPct   = max > 0 ? Math.round((l.sugar / max) * 100) : 0
    const pctLimit = dayDetailMaxSugar > 0 ? Math.round((l.sugar / dayDetailMaxSugar) * 100) : 0

    // Color de nivel según % del límite
    const levelColor = pctLimit >= 40 ? '#f87171' : pctLimit >= 20 ? '#facc15' : 'var(--accent)'

    // Etiqueta de fibra
    const fiberBadge = l.fiber
      ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:99px;background:rgba(139,141,242,0.12);color:var(--accent-l);">+${l.fiber}f fibra</span>`
      : ''

    // Impacto neto (azúcar - fibra*0.5, simplificado)
    const netSugar = Math.max(0, l.sugar - (l.fiber || 0) * 0.5)
    const netLabel = l.fiber ? `<span style="font-size:10px;color:var(--text-dim);">Neto: ~${netSugar.toFixed(1)}gr</span>` : ''

    var w9=document.createElement('div');w9.className='food-row';w9.style.borderBottom='1px solid var(--border)';var eb9=document.createElement('div');eb9.className='food-row-action-bg food-row-edit-bg';eb9.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg><span>Editar</span>';var db9=document.createElement('div');db9.className='food-row-action-bg food-row-delete-bg';db9.innerHTML='<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg><span>Borrar</span>';var rc9=document.createElement('div');rc9.className='food-row-content';rc9.style.cssText='';rc9.innerHTML='<div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:5px;"><span style="font-size:14px;font-weight:600;color:var(--text);">'+safeName+'</span>'+fiberBadge+'</div><div style="height:3px;border-radius:99px;background:var(--bg);overflow:hidden;margin-bottom:5px;"><div style="height:100%;width:'+barPct+'%;background:'+levelColor+';border-radius:99px;transition:width .4s ease;"></div></div><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:11px;color:var(--text-dim);">'+time+'</span><span style="font-size:11px;color:'+levelColor+';font-weight:600;">'+pctLimit+'%</span>'+netLabel+'</div></div><div style="text-align:right;flex-shrink:0;"><span style="font-size:15px;font-weight:700;color:'+levelColor+';">'+fmt(l.sugar)+'</span></div>';w9.appendChild(eb9);w9.appendChild(db9);w9.appendChild(rc9);list.appendChild(w9);(function(e9){attachSwipe(rc9,eb9,db9,function(){openEditSheet(e9)},function(){deleteEntry(e9.id)})})(l)
  })
}

export async function openLogros() {
  document.getElementById('overlay-logros')?.classList.add('open')
  document.getElementById('nav-logros')?.classList.add('nav-active')
  if (document.getElementById('nav-logros')) document.getElementById('nav-logros').style.color = '#fff'
  document.getElementById('nav-home')?.classList.remove('nav-active')
  if (document.getElementById('nav-home')) document.getElementById('nav-home').style.color = 'var(--text-dim)'
  document.getElementById('nav-cfg')?.classList.remove('nav-active')
  if (document.getElementById('nav-cfg')) document.getElementById('nav-cfg').style.color = 'var(--text-dim)'

  try {
    const cfg  = await getConfig()
    const logs = await getLogs()
    window.__lastCfg  = cfg
    window.__lastLogs = logs
    if (window.renderLogros) window.renderLogros(cfg, logs)
  } catch {
    if (window.__lastCfg && window.__lastLogs && window.renderLogros) {
      window.renderLogros(window.__lastCfg, window.__lastLogs)
    }
  }
}

export function closeLogros() {
  document.getElementById('overlay-logros')?.classList.remove('open')
  document.getElementById('nav-logros')?.classList.remove('nav-active')
  if (document.getElementById('nav-logros')) document.getElementById('nav-logros').style.color = 'var(--text-dim)'
}

export function openSettings() {
  document.getElementById('overlay-settings').classList.add('open')
  document.getElementById('nav-cfg').classList.add('nav-active')
  document.getElementById('nav-cfg').style.color = '#fff'
  document.getElementById('nav-home').classList.remove('nav-active')
  document.getElementById('nav-home').style.color = 'var(--text-dim)'

  // Reset to main list view
  const main = document.getElementById('settings-main-list')
  const details = document.querySelectorAll('.settings-detail')
  if (main) main.style.display = 'flex'
  details.forEach((d) => (d.style.display = 'none'))
  const titleEl = document.getElementById('settings-title')
  if (titleEl) titleEl.textContent = 'Configuración'

  renderSettings()
}

export function openSettingsSection(sectionId, title) {
  const main = document.getElementById('settings-main-list')
  const details = document.querySelectorAll('.settings-detail')
  if (!main || !details.length) return

  // Animate main out
  main.style.opacity = '0'
  main.style.transform = 'translateX(-20px)'
  main.style.transition = 'opacity .18s ease, transform .18s ease'

  setTimeout(() => {
    main.style.display = 'none'
    main.style.opacity = ''; main.style.transform = ''; main.style.transition = ''

    details.forEach((d) => {
      const isTarget = d.id === 'settings-detail-' + sectionId
      d.style.display = isTarget ? 'flex' : 'none'
      if (isTarget) {
        d.classList.remove('settings-enter')
        void d.offsetWidth
        d.classList.add('settings-enter')
      }
    })
  }, 160)

  const titleEl = document.getElementById('settings-title')
  if (titleEl && title) titleEl.textContent = title

  // Wire sex toggle when opening profile
  if (sectionId === 'profile') {
    setTimeout(() => {
      document.querySelectorAll('.sex-btn').forEach(btn => {
        btn.addEventListener('click', function() {
          const sex = this.dataset.sex
          document.querySelectorAll('.sex-btn').forEach(b => {
            const active = b.dataset.sex === sex
            b.style.borderColor = active ? 'var(--accent)' : 'var(--border)'
            b.style.background  = active ? 'rgba(139,141,242,0.1)' : 'transparent'
            b.style.color       = active ? 'var(--accent-l)' : 'var(--text-dim)'
            b.style.fontWeight  = active ? '700' : '600'
          })
          const sel = document.getElementById('cfg-sex'); if (sel) sel.value = sex
          if (window.updateAutoLimit) window.updateAutoLimit()
        })
      })
    }, 200)
  }

  if (sectionId === 'changelog') renderDynamicChangelog()
}

async function renderDynamicChangelog() {
  const container = document.getElementById('changelog-container')
  if (!container) return

  container.innerHTML = `
    <div class="section-loading">
      <svg class="m3-spinner" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="20"/>
      </svg>
      <span>Cargando historial…</span>
    </div>`

  try {
    const releases = await fetchReleasesList()
    if (!releases.length) {
      container.innerHTML = `<div style="text-align:center;padding:32px 20px;color:var(--text-dim);">No se pudo cargar desde GitHub.</div>`
      return
    }

    container.innerHTML = ''

    // Inline markdown parser
    function parseInline(text) {
      return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/_(.+?)_/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, `<code style="font-size:11px;padding:1px 5px;border-radius:4px;background:rgba(139,141,242,0.15);color:var(--accent-l);font-family:monospace;">$1</code>`)
        .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" style="color:var(--accent-l);text-decoration:underline;" target="_blank">$1</a>')
    }

    releases.forEach((release, idx) => {
      const d = new Date(release.published_at)
      const dateStr = `${d.getDate().toString().padStart(2,'0')}-${(d.getMonth()+1).toString().padStart(2,'0')}-${d.getFullYear()}`
      const tag = release.tag_name || release.name
      const body = release.body || ''
      const lines = body.split('\n')

      let html = ''
      let inList = false

      lines.forEach(line => {
        const t = line.trim()
        if (!t || t === '---' || t === '***' || t === '---\r') {
          if (inList) { html += '</ul>'; inList = false }
          return
        }
        // Blockquote: > texto
        if (/^>\s/.test(t)) {
          if (inList) { html += '</ul>'; inList = false }
          const text = parseInline(t.replace(/^>\s*/, ''))
          html += `<p style="font-size:13px;color:var(--text-dim);line-height:1.5;font-style:italic;padding:8px 12px;border-left:3px solid var(--accent);background:rgba(139,141,242,0.06);border-radius:0 6px 6px 0;margin:6px 0;">${text}</p>`
        } else if (/^#{1,6}\s/.test(t)) {
          if (inList) { html += '</ul>'; inList = false }
          const level = t.match(/^(#+)/)[1].length
          const text = parseInline(t.replace(/^#+\s*/, ''))
          const isTop = level <= 2
          html += `<p style="font-size:${isTop ? 13 : 12}px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--accent-l);margin-top:${isTop ? 16 : 10}px;padding-top:${isTop ? 12 : 8}px;border-top:1px solid var(--border);">${text}</p>`
        } else if (/^[-*+]\s/.test(t)) {
          if (!inList) { html += '<ul style="list-style:none;padding:0;margin:4px 0;display:flex;flex-direction:column;gap:5px;">'; inList = true }
          const text = parseInline(t.replace(/^[-*+]\s/, ''))
          html += `<li style="font-size:13px;color:var(--text);line-height:1.55;display:flex;gap:8px;align-items:flex-start;"><span style="color:var(--accent);flex-shrink:0;margin-top:3px;font-size:8px;">●</span><span>${text}</span></li>`
        } else {
          if (inList) { html += '</ul>'; inList = false }
          html += `<p style="font-size:13px;color:var(--text-dim);line-height:1.5;font-style:italic;margin:4px 0;">${parseInline(t)}</p>`
        }
      })
      if (inList) html += '</ul>'

      const block = document.createElement('div')
      block.style.cssText = `animation: fadeSlideUp .35s ease both; animation-delay: ${idx * 60}ms;`
      block.innerHTML = `
        <div class="changelog-meta">
          <span class="changelog-tag">${tag}</span>
          <span class="changelog-date">${dateStr}</span>
        </div>
        <div class="changelog-box">${html}</div>`
      container.appendChild(block)
    })
  } catch {
    container.innerHTML = `<div style="text-align:center;padding:32px 20px;color:var(--text-dim);">Error al conectar con GitHub.</div>`
  }
}

export function closeSettings() {
  document.getElementById('overlay-settings').classList.remove('open')
  document.getElementById('nav-cfg').classList.remove('nav-active')
  document.getElementById('nav-cfg').style.color = 'var(--text-dim)'
  document.getElementById('nav-home').classList.add('nav-active')
  document.getElementById('nav-home').style.color = '#fff'
}

export function settingsBack() {
  const main = document.getElementById('settings-main-list')
  const details = Array.from(document.querySelectorAll('.settings-detail'))
  const visibleDetail = details.find(d => d.style.display && d.style.display !== 'none')

  if (visibleDetail) {
    // Animate detail out
    visibleDetail.style.opacity = '0'
    visibleDetail.style.transform = 'translateX(20px)'
    visibleDetail.style.transition = 'opacity .16s ease, transform .16s ease'

    setTimeout(() => {
      details.forEach(d => { d.style.display = 'none'; d.style.opacity = ''; d.style.transform = ''; d.style.transition = '' })
      if (main) {
        main.style.display = 'flex'
        main.classList.remove('settings-back-enter')
        void main.offsetWidth
        main.classList.add('settings-back-enter')
      }
      const titleEl = document.getElementById('settings-title')
      if (titleEl) titleEl.textContent = window.t ? window.t('cfg.title') : 'Configuración'
    }, 140)
    return true
  }

  if (document.getElementById('overlay-settings')?.classList.contains('open')) {
    closeSettings()
    return true
  }

  return false
}


export async function setRange(range) {
  currentRange = range
  window.__currentRange = range
  document.querySelectorAll('.range-pill').forEach(el =>
    el.classList.toggle('active', el.dataset.range === range)
  )
  const result = await renderStatsChart(range)
  if (result) renderFoodTable(result.logs, result.range)
}

/* ── Add Sheet ── */
export function openAddSheet() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
  document.getElementById('add-datetime').value = local
  document.getElementById('add-food').value  = ''
  document.getElementById('add-sugar').value = ''
  document.getElementById('add-fiber').value = ''
  document.getElementById('add-error').style.display = 'none'
  renderFrequentChips()
  document.getElementById('sheet-backdrop').classList.add('open')

  const sheet = document.getElementById('sheet-add')
  if (sheet) {
    // Primero abrir con el estilo normal (border radius correcto)
    sheet.style.maxHeight    = '92dvh'
    sheet.style.borderRadius = '28px 28px 0 0'
    sheet.style.transform    = ''
    sheet.classList.add('open')

    // Después de que la animación de entrada termine, expandir a pantalla completa
    setTimeout(() => setSheetExpanded(sheet, true), 560)
  }
  // Sin autofocus — el usuario elige cuándo escribir
}

export function closeAddSheet() {
  document.getElementById('sheet-backdrop').classList.remove('open')
  var s4=document.getElementById('sheet-add')
  if(s4){if(s4.dataset.editId){delete s4.dataset.editId;var sb4=document.getElementById('btn-save-entry');if(sb4)sb4.textContent='A\u00f1adir'}s4.style.transform='';s4.style.maxHeight='';s4.style.borderRadius='';s4.classList.remove('open');s4.classList.remove('sheet-fullscreen')}
  sheetExpanded = false
}

/* ── Camera Menu Sheet ── */
export function openCameraMenu() {
  document.getElementById('sheet-backdrop').classList.add('open')
  const sheet = document.getElementById('sheet-camera-menu')
  if (sheet) {
    sheet.style.transform = ''
    sheet.classList.add('open')
  }
}

export function closeCameraMenu() {
  document.getElementById('sheet-backdrop').classList.remove('open')
  const sheet = document.getElementById('sheet-camera-menu')
  if (sheet) {
    sheet.style.transform = ''
    sheet.classList.remove('open')
  }
}

/* ── Bottom sheet drag — touch events for mobile ── */
let activeSheet       = null
let sheetDragStartY   = 0
let sheetDragCurrentY = 0
let sheetDragging     = false
let sheetExpanded     = false

const CLOSE_THRESHOLD  = 80
const EXPAND_THRESHOLD = 60

function setSheetExpanded(sheet, expand) {
  sheetExpanded = expand
  const ease = 'cubic-bezier(0.71, 0.40, 0.16, 0.99)'
  sheet.style.transition = `max-height .45s ${ease}`
  sheet.style.maxHeight    = expand ? '100dvh' : '92dvh'
  sheet.style.borderRadius = '28px 28px 0 0'
  sheet.style.transform    = 'translateX(-50%) translateY(0)'
  sheet.classList.toggle('sheet-fullscreen', expand)
  setTimeout(() => { sheet.style.transition = '' }, 450)
}

function attachSheetTouch(sheet) {
  // Usar el handle como zona de arrastre principal
  const handle = sheet.querySelector('.sheet-handle')
  const dragTarget = handle || sheet

  function onTouchStart(e) {
    // Si viene del handle, siempre capturar
    // Si viene del sheet pero no del handle, solo capturar si no es input/button
    if (!handle && e.target.closest('input, button, textarea, select, label')) return

    sheetDragging     = true
    sheetDragStartY   = e.touches[0].clientY
    sheetDragCurrentY = 0
    activeSheet       = sheet
    sheet.style.transition = 'none'
  }

  function onTouchMove(e) {
    if (!sheetDragging || !activeSheet) return
    const dy = e.touches[0].clientY - sheetDragStartY

    // Solo arrastrar hacia abajo
    if (dy < 0) return

    sheetDragCurrentY = dy
    // Resistencia logarítmica para sensación natural
    const resistance = dy < 20 ? dy : 20 + (dy - 20) * 0.6
    sheet.style.transform = `translateX(-50%) translateY(${resistance}px)`

    // Prevenir scroll del sheet mientras arrastramos
    if (dy > 5) e.preventDefault()
  }

  function onTouchEnd() {
    if (!sheetDragging) return
    sheetDragging = false
    const dy = sheetDragCurrentY
    sheetDragCurrentY = 0
    activeSheet = null

    const ease = 'cubic-bezier(0.71, 0.40, 0.16, 0.99)'

    if (dy > CLOSE_THRESHOLD) {
      if (sheetExpanded) {
        // Pantalla completa → colapsar
        setSheetExpanded(sheet, false)
      } else {
        // Normal → cerrar
        if (sheet.id === 'sheet-add') closeAddSheet()
        else if (sheet.id === 'sheet-camera-menu') closeCameraMenu()
      }
    } else {
      // Snap back
      sheet.style.transition = `transform .4s ${ease}`
      sheet.style.transform  = 'translateX(-50%) translateY(0)'
      setTimeout(() => { sheet.style.transition = '' }, 400)
    }
  }

  dragTarget.addEventListener('touchstart', onTouchStart, { passive: true })
  dragTarget.addEventListener('touchmove',  onTouchMove,  { passive: false })
  dragTarget.addEventListener('touchend',   onTouchEnd,   { passive: true })
}

export function initSheetGestures() {
  ;['sheet-add', 'sheet-camera-menu'].forEach(id => {
    const sheet = document.getElementById(id)
    if (sheet) attachSheetTouch(sheet)
  })
}

export async function saveEntry() {
  const rawFood = document.getElementById('add-food').value.trim()
  const food = DOMPurify.sanitize(rawFood, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  const sugar = parseFloat(document.getElementById('add-sugar').value)
  const fiber = parseFloat(document.getElementById('add-fiber').value) || 0
  const dt = document.getElementById('add-datetime').value

  if (!food || isNaN(sugar) || sugar <= 0 || sugar > 9999 || !dt) {
    document.getElementById('add-error').style.display = 'block'
    return
  }
  if (fiber < 0 || fiber > 9999) {
    document.getElementById('add-error').style.display = 'block'
    return
  }

  var sheet3=document.getElementById('sheet-add'),editId3=sheet3&&sheet3.dataset.editId
  if(editId3){await saveLog({id:editId3,date:new Date(dt).toISOString(),food,sugar,fiber});delete sheet3.dataset.editId;var sb3=document.getElementById('btn-save-entry');if(sb3)sb3.textContent='A\u00f1adir';closeAddSheet();await renderHome();if(document.getElementById('overlay-stats')?.classList.contains('open')){var r3=await renderStatsChart(window.__currentRange||'7d');if(r3)renderFoodTable(r3.logs,r3.range)}showToast('Registro actualizado. \u2713',false,'success')}else{await saveLog({id:crypto.randomUUID(),date:new Date(dt).toISOString(),food,sugar,fiber});closeAddSheet();await renderHome();showToast('\u00a1Az\u00facar a\u00f1adida! \u2713',false,'success')}
}

/* ── Card Expansion ── */
let expandedCard = null

export function initCardExpansion() {
  document.addEventListener('click', e => {
    const card = e.target.closest('.card')
    // Don't expand if clicking inside an interactive element within a card
    if (!card) return
    if (e.target.closest('button, input, .toggle-track, .seg-btn, .range-pill, .del-btn, a')) return

    if (expandedCard === card) {
      closeExpandedCard()
    } else {
      if (expandedCard) closeExpandedCard()
      expandedCard = card
      card.classList.add('expanded')
      document.getElementById('card-backdrop').classList.add('active')
    }
  })

  document.getElementById('card-backdrop')?.addEventListener('click', closeExpandedCard)
}

export function closeExpandedCard() {
  if (!expandedCard) return false
  expandedCard.classList.remove('expanded')
  document.getElementById('card-backdrop').classList.remove('active')
  expandedCard = null
  return true // Indicates a card was closed
}
