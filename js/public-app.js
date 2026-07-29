(() => {
  const cfg = window.APP_CONFIG;
  const map = L.map("map", { zoomControl: false }).setView(cfg.initialCenter, cfg.initialZoom);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);

  const iconMap = { hydrant: "icons/hydrant.svg", tank: "icons/tank.svg", water_source: "icons/water-source.svg" };
  const labels = { hydrant: "Κρουνός", tank: "Δεξαμενή", water_source: "Σημείο υδροληψίας" };
  const conditionLabels = { available: "Λειτουργικό", unknown: "Άγνωστη κατάσταση", unavailable: "Εκτός λειτουργίας" };
  let points = [], markers = [], user = null, radiusKm = cfg.defaultRadiusKm, radiusCircle = null, userMarker = null, nearby = false;

  const toastEl = document.getElementById("toast");
  const sheet = document.getElementById("bottomSheet");
  const sheetContent = document.getElementById("sheetContent");

  function toast(message) { toastEl.textContent = message; toastEl.classList.add("show"); setTimeout(() => toastEl.classList.remove("show"), 3500); }
  function distanceKm(a,b,c,d){ const R=6371, r=x=>x*Math.PI/180, x=r(c-a), y=r(d-b); const h=Math.sin(x/2)**2+Math.cos(r(a))*Math.cos(r(c))*Math.sin(y/2)**2; return 2*R*Math.asin(Math.sqrt(h)); }
  function markerIcon(category){ return L.icon({ iconUrl: iconMap[category], iconSize:[38,46], iconAnchor:[19,44], popupAnchor:[0,-42] }); }
  function currentCategories(){ return [...document.querySelectorAll('.filter-chip input:checked')].map(x=>x.value); }

  function visiblePoints(){
    const q = document.getElementById("searchInput").value.trim().toLocaleLowerCase("el");
    const cats = currentCategories();
    return points.filter(p => cats.includes(p.category))
      .filter(p => !q || `${p.name} ${p.notes}`.toLocaleLowerCase("el").includes(q))
      .filter(p => !nearby || !user || distanceKm(user.lat,user.lng,p.latitude,p.longitude) <= radiusKm);
  }

  function render(){
    markers.forEach(m => map.removeLayer(m)); markers=[];
    const visible = visiblePoints();
    visible.forEach(p => {
      const m=L.marker([p.latitude,p.longitude],{icon:markerIcon(p.category)}).addTo(map).on("click",()=>openSheet(p));
      markers.push(m);
    });
    document.getElementById("mapCounter").textContent = `${visible.length} ${visible.length===1?"σημείο":"σημεία"}`;
  }

  function openSheet(p){
    const distance = user ? `${distanceKm(user.lat,user.lng,p.latitude,p.longitude).toFixed(1)} km από εσένα` : "";
    const nav=`https://www.google.com/maps/dir/?api=1&destination=${p.latitude},${p.longitude}`;
    sheetContent.innerHTML=`<div class="sheet-type"><img src="${iconMap[p.category]}" alt=""><span>${labels[p.category]}</span></div><h2>${escapeHtml(p.name)}</h2><div class="status-line ${p.condition}">${conditionLabels[p.condition]}</div>${distance?`<p class="distance">📍 ${distance}</p>`:""}${p.notes?`<p class="notes">${escapeHtml(p.notes)}</p>`:""}<div class="detail-row"><span>Τελευταίος έλεγχος</span><strong>${p.last_checked_at||"Δεν έχει καταχωριστεί"}</strong></div><a class="navigate-button" target="_blank" rel="noopener" href="${nav}">🧭 Έναρξη πλοήγησης</a>`;
    sheet.classList.add("open"); sheet.setAttribute("aria-hidden","false");
  }
  function escapeHtml(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}
  function closeSheet(){sheet.classList.remove("open");sheet.setAttribute("aria-hidden","true");}
  document.getElementById("sheetClose").addEventListener("click",closeSheet);
  map.on("click",closeSheet);

  function redrawRadius(){ if(radiusCircle)map.removeLayer(radiusCircle); if(nearby&&user) radiusCircle=L.circle([user.lat,user.lng],{radius:radiusKm*1000,weight:2,dashArray:"8 8",fillOpacity:.04}).addTo(map); }
  document.querySelectorAll('input[name="radius"]').forEach(i=>i.addEventListener("change",()=>{radiusKm=Number(i.value); if(nearby){redrawRadius();render();toast(`Ακτίνα ${radiusKm} km`);}}));
  document.querySelectorAll('.filter-chip input').forEach(i=>i.addEventListener("change",render));
  document.getElementById("searchInput").addEventListener("input",render);
  document.getElementById("clearSearch").addEventListener("click",()=>{document.getElementById("searchInput").value="";render();});
  document.getElementById("showAllButton").addEventListener("click",()=>{nearby=false; if(radiusCircle)map.removeLayer(radiusCircle); radiusCircle=null; document.querySelectorAll('.filter-chip input').forEach(i=>i.checked=true); render(); if(markers.length)L.featureGroup(markers).getBounds().isValid()&&map.fitBounds(L.featureGroup(markers).getBounds(),{padding:[40,40],maxZoom:15}); toast("Εμφανίζονται όλα τα σημεία");});
  document.getElementById("locateButton").addEventListener("click",()=>{
    if(!navigator.geolocation)return toast("Η συσκευή δεν υποστηρίζει GPS");
    toast("Εντοπισμός θέσης…");
    navigator.geolocation.getCurrentPosition(pos=>{user={lat:pos.coords.latitude,lng:pos.coords.longitude}; nearby=true; if(userMarker)map.removeLayer(userMarker); userMarker=L.circleMarker([user.lat,user.lng],{radius:9,weight:4,fillOpacity:1}).addTo(map).bindTooltip("Η θέση μου"); redrawRadius();render();map.fitBounds(radiusCircle.getBounds(),{padding:[20,20]});toast(`Κοντινά σημεία σε ακτίνα ${radiusKm} km`);},()=>toast("Δεν ήταν δυνατός ο εντοπισμός θέσης"),{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  });

  DataService.publicPoints().then(result=>{points=result.points; document.getElementById("dataBadge").textContent=result.source==="supabase"?"Ζωντανά δεδομένα":"Λειτουργία επίδειξης"; document.getElementById("dataBadge").classList.add(result.source); render(); if(markers.length)map.fitBounds(L.featureGroup(markers).getBounds(),{padding:[40,40],maxZoom:14});}).catch(e=>{document.getElementById("dataBadge").textContent="Σφάλμα δεδομένων";toast(e.message);});
})();
