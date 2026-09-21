(() => {
  "use strict";
  const $=id=>document.getElementById(id);
  const modal=$("offlineSetupModal"), summary=$("offlineDeviceSummary"), instructions=$("offlineInstructions"), status=$("offlineSetupStatus"), pointsSummary=$("offlinePointsSummary"), confirmed=$("offlineMapConfirmed");
  if(!modal) return;
  const ua=navigator.userAgent||"";
  const ios=/iPad|iPhone|iPod/.test(ua) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  const android=/Android/.test(ua);
  const READY_KEY="fwm-offline-ready-v40", MAP_KEY="fwm-google-maps-offline-confirmed-v40";
  let gpsOk=false;
  const esc=s=>String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function deviceLabel(){return ios?"iPhone / iPad":android?"Android":"Υπολογιστής / άλλη συσκευή";}
  function cached(){try{return window.OfflineStore?.cachedPoints?.()||null;}catch{return null;}}
  function renderPoints(){const c=cached();const n=c?.points?.length||0;const when=c?.savedAt?new Date(c.savedAt).toLocaleString("el-GR"):null;pointsSummary.innerHTML=n?`<strong>✓ ${n} σημεία</strong> αποθηκευμένα${when?`<br><small>Τελευταίος συγχρονισμός: ${esc(when)}</small>`:""}`:"Δεν υπάρχουν ακόμη αποθηκευμένα σημεία. Χρειάζεται μία online φόρτωση του χάρτη.";}
  function render(){
    const mapOk=localStorage.getItem(MAP_KEY)==="1"; confirmed.checked=mapOk;
    const ready=localStorage.getItem(READY_KEY);
    summary.innerHTML=`<div><strong>Συσκευή</strong><span>${deviceLabel()}</span></div><div><strong>Internet</strong><span>${navigator.onLine?"🟢 Online":"🟠 Offline"}</span></div><div><strong>Κατάσταση</strong><span class="${ready?"ready":"not-ready"}">${ready?`✓ Έτοιμο · ${esc(ready)}`:"Δεν ολοκληρώθηκε"}</span></div>`;
    instructions.innerHTML=`<ol><li>Πάτησε «Άνοιγμα Google Maps».</li><li>Στο Google Maps πάτησε τη φωτογραφία προφίλ σου.</li><li>Επίλεξε «Χάρτες εκτός σύνδεσης».</li><li>Πάτησε «Επιλέξτε τον δικό σας χάρτη» και κάλυψε την Κορινθία.</li><li>Πάτησε «Λήψη» και περίμενε να ολοκληρωθεί.</li></ol>${ios?'<p><small>Σε iPhone/iPad χρειάζεται εγκατεστημένο το Google Maps.</small></p>':''}`;
    renderPoints();
  }
  function open(){render();status.textContent="Ολοκλήρωσε τα παραπάνω βήματα.";status.className="offline-setup-status";modal.classList.remove("hidden");document.body.classList.add("modal-open");}
  function close(){modal.classList.add("hidden");document.body.classList.remove("modal-open");}
  function openMaps(){window.open("https://www.google.com/maps/search/?api=1&query=Corinthia%2C%20Greece","_blank","noopener");}
  async function refreshData(){
    if(!navigator.onLine){status.textContent="Δεν υπάρχει σύνδεση. Διατηρούνται τα τελευταία αποθηκευμένα σημεία.";status.className="offline-setup-status warning";renderPoints();return;}
    status.textContent="Ενημέρωση επιχειρησιακών δεδομένων…";status.className="offline-setup-status";
    try{const r=await window.DataService?.mapPoints?.(); if(r?.points?.length) window.OfflineStore?.cachePoints?.(r.points); renderPoints(); status.textContent="✓ Τα σημεία ενημερώθηκαν.";status.className="offline-setup-status success";}catch(e){renderPoints();status.textContent="Δεν έγινε νέα λήψη. Τα ήδη αποθηκευμένα δεδομένα παραμένουν διαθέσιμα.";status.className="offline-setup-status warning";}
  }
  function testGps(){
    if(!navigator.geolocation){status.textContent="Η συσκευή δεν παρέχει GPS στον browser.";status.className="offline-setup-status error";return;}
    status.textContent="Γίνεται λήψη νέου στίγματος…";status.className="offline-setup-status";
    navigator.geolocation.getCurrentPosition(p=>{gpsOk=true;status.textContent=`✓ GPS OK · ακρίβεια ±${Math.round(p.coords.accuracy||0)} m`;status.className="offline-setup-status success";},e=>{gpsOk=false;status.textContent=({1:"Δεν δόθηκε άδεια GPS.",2:"Δεν βρέθηκε θέση GPS.",3:"Η λήψη GPS καθυστέρησε."})[e.code]||"Σφάλμα GPS.";status.className="offline-setup-status error";},{enableHighAccuracy:true,maximumAge:0,timeout:25000});
  }
  function finish(){
    const c=cached(), mapOk=confirmed.checked;
    if(!mapOk){status.textContent="Πρώτα επιβεβαίωσε ότι κατέβασες την Κορινθία στο Google Maps.";status.className="offline-setup-status error";return;}
    if(!c?.points?.length){status.textContent="Δεν υπάρχουν αποθηκευμένα σημεία νερού. Πάτησε «Ενημέρωση σημείων τώρα» ενώ είσαι online.";status.className="offline-setup-status error";return;}
    if(!gpsOk){status.textContent="Κάνε πρώτα μία δοκιμή GPS σε αυτή τη συσκευή.";status.className="offline-setup-status error";return;}
    const d=new Date().toLocaleString("el-GR");localStorage.setItem(READY_KEY,d);status.innerHTML=`✅ <strong>ΕΤΟΙΜΟ ΓΙΑ OFFLINE ΧΡΗΣΗ</strong><br>${c.points.length} σημεία αποθηκευμένα · ${esc(d)}<br><small>Για τελικό έλεγχο, βάλε λειτουργία πτήσης και δοκίμασε Fire Water Map + Google Maps.</small>`;status.className="offline-setup-status success ready-final";render();
  }
  confirmed.addEventListener("change",()=>{localStorage.setItem(MAP_KEY,confirmed.checked?"1":"0");});
  $("closeOfflineSetup")?.addEventListener("click",close);$("openMapsForSetup")?.addEventListener("click",openMaps);$("refreshOfflineData")?.addEventListener("click",refreshData);$("testGpsButton")?.addEventListener("click",testGps);$("markOfflineReady")?.addEventListener("click",finish);
  modal.addEventListener("click",e=>{if(e.target===modal)close();});
  window.addEventListener("fwm:open-offline-setup",open);window.addEventListener("online",render);window.addEventListener("offline",render);
})();
