(() => {
  "use strict";

  const ds = window.DataService;
  const $ = id => document.getElementById(id);
  if (!ds?.client || !$("messagesView")) return;


  const patchStyle=document.createElement("style");
  patchStyle.textContent=`
    .fwm-point-picker-map{height:260px;border-radius:16px;overflow:hidden;margin:.5rem 0 1rem}
    .fwm-admin-attachment-tools{display:grid;gap:.65rem;margin:.65rem 0}
    .fwm-coords-wrap{display:grid;gap:.55rem}
    .fwm-attachment-summary{padding:.7rem .85rem;border:1px solid #dfe5e8;border-radius:12px;background:#f8fafb;font-size:.92rem}
    .fwm-map-picker-help{font-size:.9rem;color:#66727c}
  `;
  document.head.appendChild(patchStyle);

  const esc = v => String(v ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  }[c]));

  let rooms = [], targets = {crews:[], support:[]}, rows = [], points = [];
  let pointAttachment = null, pickerMap = null, pickerMarker = null;

  const rpc = async (n,p) => {
    const {data,error} = await ds.client.rpc(n,p);
    if(error) throw error;
    return data;
  };

  window.addEventListener("admin-dashboard-ready", () => init());
  document.querySelector('[data-view="messages"]')?.addEventListener("click", () => init());
  $("adminMessageRoom")?.addEventListener("change", () => loadRoom());
  $("adminMessageRefresh")?.addEventListener("click", () => loadRoom());
  $("adminMessageForm")?.addEventListener("submit", send);

  function ensureAttachmentUi(){
    const select = $("adminMessagePoint");
    if (!select || $("fwmAdminPointMode")) return;

    const wrap = document.createElement("div");
    wrap.className = "fwm-admin-attachment-tools";
    wrap.innerHTML = `
      <label>Τρόπος σημείου
        <select id="fwmAdminPointMode">
          <option value="none">Χωρίς σημείο</option>
          <option value="registered">Από καταχώρηση</option>
          <option value="coords">Επικόλληση συντεταγμένων</option>
          <option value="map">Επιλογή από χάρτη</option>
        </select>
      </label>

      <div id="fwmAdminRegisteredWrap" class="hidden"></div>

      <div id="fwmAdminCoordsWrap" class="hidden fwm-coords-wrap">
        <label>Συντεταγμένες
          <input id="fwmAdminCoords" type="text" placeholder="π.χ. 37.9755, 22.9773">
        </label>
        <label>Ονομασία σημείου
          <input id="fwmAdminPointName" type="text" placeholder="π.χ. Σημείο συνάντησης Α">
        </label>
        <button id="fwmAdminUseCoords" class="action-button" type="button">✓ Χρήση συντεταγμένων</button>
      </div>

      <div id="fwmAdminMapWrap" class="hidden">
        <div class="fwm-map-picker-help">Πάτησε στον χάρτη για να ορίσεις προσωρινό σημείο.</div>
        <div id="fwmAdminPointMap" class="fwm-point-picker-map"></div>
        <label>Ονομασία σημείου
          <input id="fwmAdminMapPointName" type="text" placeholder="π.χ. Είσοδος από χωματόδρομο">
        </label>
      </div>

      <div id="fwmAdminAttachmentSummary" class="fwm-attachment-summary">Χωρίς σημείο χάρτη</div>`;

    select.parentElement?.insertAdjacentElement("beforebegin", wrap);
    $("fwmAdminRegisteredWrap").appendChild(select);
    select.closest("label")?.classList.add("fwm-registered-label");

    $("fwmAdminPointMode").addEventListener("change", renderAttachmentMode);
    $("fwmAdminUseCoords").addEventListener("click", useCoordinates);
    select.addEventListener("change", () => {
      if ($("fwmAdminPointMode").value !== "registered") return;
      const p = points.find(x => x.id === select.value);
      pointAttachment = p ? {id:p.id,name:p.name,latitude:p.latitude,longitude:p.longitude} : null;
      renderAttachmentSummary();
    });
    renderAttachmentMode();
  }

  function renderAttachmentMode(){
    const mode = $("fwmAdminPointMode")?.value || "none";
    $("fwmAdminRegisteredWrap")?.classList.toggle("hidden", mode !== "registered");
    $("fwmAdminCoordsWrap")?.classList.toggle("hidden", mode !== "coords");
    $("fwmAdminMapWrap")?.classList.toggle("hidden", mode !== "map");
    if(mode === "none"){
      pointAttachment = null;
      if($("adminMessagePoint")) $("adminMessagePoint").value = "";
      renderAttachmentSummary();
    } else if(mode === "map"){
      setTimeout(initPickerMap, 50);
    }
  }

  function parseCoords(value){
    const match = String(value || "").trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!match) return null;
    const lat = Number(match[1]), lng = Number(match[2]);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat < -90||lat > 90||lng < -180||lng > 180) return null;
    return {latitude:lat,longitude:lng};
  }

  function useCoordinates(){
    const parsed = parseCoords($("fwmAdminCoords")?.value);
    if(!parsed){ notice("Οι συντεταγμένες δεν είναι έγκυρες. Χρησιμοποίησε μορφή: 37.9755, 22.9773", true); return; }
    pointAttachment = {
      ...parsed,
      id:null,
      name:$("fwmAdminPointName")?.value.trim() || "Προσωρινό σημείο"
    };
    notice("");
    renderAttachmentSummary();
  }

  function initPickerMap(){
    if(!window.L || !$("fwmAdminPointMap")) return;
    if(pickerMap){ setTimeout(()=>pickerMap.invalidateSize(), 30); return; }

    pickerMap = L.map("fwmAdminPointMap").setView([37.95, 22.98], 10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{
      maxZoom:19,
      attribution:"&copy; OpenStreetMap"
    }).addTo(pickerMap);

    pickerMap.on("click", e => {
      if(pickerMarker) pickerMarker.setLatLng(e.latlng);
      else pickerMarker = L.marker(e.latlng).addTo(pickerMap);
      pointAttachment = {
        id:null,
        name:$("fwmAdminMapPointName")?.value.trim() || "Προσωρινό σημείο",
        latitude:e.latlng.lat,
        longitude:e.latlng.lng
      };
      renderAttachmentSummary();
    });
    $("fwmAdminMapPointName")?.addEventListener("input", () => {
      if(pointAttachment && $("fwmAdminPointMode").value === "map"){
        pointAttachment.name = $("fwmAdminMapPointName").value.trim() || "Προσωρινό σημείο";
        renderAttachmentSummary();
      }
    });
  }

  function renderAttachmentSummary(){
    const box = $("fwmAdminAttachmentSummary");
    if(!box) return;
    box.textContent = pointAttachment
      ? `📍 ${pointAttachment.name} · ${Number(pointAttachment.latitude).toFixed(5)}, ${Number(pointAttachment.longitude).toFixed(5)}`
      : "Χωρίς σημείο χάρτη";
  }

  async function init(){
    ensureAttachmentUi();
    try{
      // Room list via RPC; fallback to direct table so the UI remains usable.
      try {
        rooms = await rpc("message_rooms_center_v36", {}) || [];
      } catch {
        const {data,error} = await ds.client.from("operation_rooms")
          .select("id,name,is_active,created_at").order("is_active",{ascending:false}).order("created_at",{ascending:false});
        if(error) throw error;
        rooms = data || [];
      }

      const sel = $("adminMessageRoom"), old = sel.value;
      sel.innerHTML = rooms.map(r=>`<option value="${r.id}">${r.is_active?'●':'○'} ${esc(r.name)}</option>`).join("");
      if(old && rooms.some(r=>r.id===old)) sel.value=old;
      else if(rooms[0]) sel.value=rooms[0].id;

      const {data:pdata} = await ds.client.from("water_points")
        .select("id,name,latitude,longitude")
        .in("publication_status",["published","hidden"]).order("name");
      points = pdata || [];
      renderPoints();
      await loadRoom();
    }catch(e){
      notice(e.message || "Δεν είναι διαθέσιμα τα μηνύματα.", true);
    }
  }

  function renderPoints(){
    const s=$("adminMessagePoint");
    if(!s) return;
    s.innerHTML='<option value="">Επίλεξε καταχωρημένο σημείο</option>'+
      points.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
  }

  async function directTargets(room){
    const out={crews:[],support:[]};

    const crewRes = await ds.client.from("crew_positions")
      .select("session_id,vehicle_name,crew_members_text,room_id,is_sharing,last_seen_at")
      .eq("room_id",room)
      .order("last_seen_at",{ascending:false});
    if(!crewRes.error){
      const seen=new Set();
      out.crews=(crewRes.data||[]).filter(x=>{
        if(!x.session_id || seen.has(x.session_id)) return false;
        seen.add(x.session_id); return true;
      }).map(x=>({
        session_id:x.session_id,
        label:[x.vehicle_name,x.crew_members_text].filter(Boolean).join(" · ") || "Πλήρωμα"
      }));
    }

    const supRes = await ds.client.from("support_requests_v35")
      .select("id,full_name,support_type,vehicle_info,room_id,status")
      .eq("room_id",room).eq("status","approved");
    if(!supRes.error){
      out.support=(supRes.data||[]).map(x=>({
        id:x.id,
        label:[x.full_name,x.support_type,x.vehicle_info].filter(Boolean).join(" · ")
      }));
    }
    return out;
  }

  async function loadRoom(){
    const room=$("adminMessageRoom").value;
    if(!room) return;

    notice("");
    // IMPORTANT: recipients are loaded independently from message history.
    // One broken RPC must not empty the "Προς" field.
    try{
      targets = await directTargets(room);
      renderTargets();
    }catch(e){
      targets={crews:[],support:[]};
      renderTargets();
      notice("Δεν ήταν δυνατή η φόρτωση παραληπτών: "+(e.message||e),true);
    }

    try{
      rows = await rpc("list_messages_center_v36",{p_room_id:room,p_limit:150}) || [];
      render();
      for(const m of rows.filter(x=>x.sender_type!=="center").slice(0,40)){
        rpc("mark_message_center_v36",{p_message_id:m.id,p_ack:false}).catch(()=>{});
      }
    }catch(e){
      rows=[];
      render();
      // Keep recipient UI working even if the history RPC still needs SQL repair.
      notice(`Ιστορικό μηνυμάτων: ${e.message||e}`, true);
    }
  }

  function renderTargets(){
    const s=$("adminMessageRecipient"),old=s.value;
    const crewOptions=(targets.crews||[]).map(x=>
      `<option value="crew:${x.session_id}">🚒 ${esc(String(x.label||"Όχημα").split(" · ")[0])}</option>`
    ).join("");
    const supportOptions=(targets.support||[]).map(x=>
      `<option value="support:${x.id}">◆ ${esc(x.label||"Υποστήριξη")}</option>`
    ).join("");

    s.innerHTML =
      '<option value="all_crews">📣 Όλα τα πληρώματα</option>'+
      crewOptions+supportOptions;

    if([...s.options].some(o=>o.value===old)) s.value=old;
  }

  function time(v){return new Date(v).toLocaleString("el-GR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});}
  function nav(m){return m.latitude!=null&&m.longitude!=null?`<a class="fwm-message-map" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${esc(m.point_name||"Πλοήγηση")}</a>`:"";}

  function render(){
    const box=$("adminMessagesList");
    box.innerHTML=rows.length?rows.map(m=>`
      <article class="fwm-message ${m.sender_type==='center'?'mine':'received'} ${m.priority==='urgent'?'urgent':''}">
        <div class="fwm-message-head">
          <strong>${m.sender_type==='center'?'Κέντρο':esc(m.sender_label||"Πλήρωμα")}</strong>
          <span>${m.priority==='urgent'?'🚨 ':''}${time(m.created_at)}</span>
        </div>
        <p>${esc(m.body)}</p>${nav(m)}
        <small>${m.read_count?`Αναγνώσεις: ${m.read_count}`:''}${m.ack_required?` · Επιβεβαιώσεις: ${m.ack_count}`:''}</small>
        ${m.priority==='urgent'&&m.sender_type!=='center'?`<button class="action-button danger-button" data-center-ack="${m.id}" type="button">✓ Επιβεβαίωση λήψης από Κέντρο</button>`:''}
      </article>`).join(""):'<p class="empty-table">Δεν υπάρχουν ακόμη μηνύματα σε αυτή την επιχείρηση.</p>';
    box.querySelectorAll("[data-center-ack]").forEach(b=>b.onclick=async()=>{
      await rpc("mark_message_center_v36",{p_message_id:b.dataset.centerAck,p_ack:true});
      loadRoom();
    });
  }

  function notice(t,e=false){
    const n=$("adminMessageNotice");
    n.textContent=t||"";
    n.classList.toggle("error",e);
  }

  async function send(e){
    e.preventDefault();
    const room=$("adminMessageRoom").value;
    const body=$("adminMessageBody").value.trim();
    const r=$("adminMessageRecipient").value;
    if(!room||!body||!r) return;

    let rt=r,rs=null,sp=null;
    if(r.startsWith("crew:")){rt="crew";rs=r.slice(5);}
    if(r.startsWith("support:")){rt="support";sp=r.slice(8);}

    // If registered point mode is selected, sync the selected point before sending.
    if($("fwmAdminPointMode")?.value==="registered"){
      const p=points.find(x=>x.id===$("adminMessagePoint").value);
      pointAttachment=p?{id:p.id,name:p.name,latitude:p.latitude,longitude:p.longitude}:null;
    }

    notice("Αποστολή…");
    try{
      await rpc("send_message_center_v36",{
        p_room_id:room,
        p_recipient_type:rt,
        p_recipient_session_id:rs,
        p_recipient_support_id:sp,
        p_priority:$("adminMessagePriority").value,
        p_body:body,
        p_point_id:pointAttachment?.id||null,
        p_point_name:pointAttachment?.name||null,
        p_latitude:pointAttachment?.latitude??null,
        p_longitude:pointAttachment?.longitude??null
      });
      $("adminMessageBody").value="";
      pointAttachment=null;
      $("fwmAdminPointMode").value="none";
      renderAttachmentMode();
      renderAttachmentSummary();
      notice("");
      await loadRoom();
    }catch(err){
      notice(err.message||"Η αποστολή απέτυχε.",true);
    }
  }
})();