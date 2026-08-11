(() => {
  "use strict";

  const patchStyle=document.createElement("style");
  patchStyle.textContent=`
    .fwm-point-picker-map{height:230px;border-radius:16px;overflow:hidden;margin:.5rem 0 1rem}
    .fwm-public-attachment{display:grid;gap:.65rem;margin:.65rem 0}
    .fwm-attachment-summary{padding:.65rem .75rem;border:1px solid #dfe5e8;border-radius:12px;background:#f8fafb;font-size:.88rem}
    .fwm-map-picker-help{font-size:.88rem;color:#66727c}
    @media(max-width:720px){.fwm-messages-card{max-height:92dvh;overflow:auto}}
  `;
  document.head.appendChild(patchStyle);

  function repairLocationToasts(){
    document.querySelectorAll("body *").forEach(el=>{
      const text=(el.textContent||"").trim();
      if(text.startsWith("Η εμφάνιση της θέσης μου") || text.startsWith("Η θέση μου εμφανίζεται")){
        const cs=getComputedStyle(el);
        if(cs.position==="fixed" || cs.position==="absolute"){
          el.style.bottom=window.innerWidth<=720?"165px":"90px";
          el.style.zIndex="5000";
          el.style.maxWidth=window.innerWidth<=720?"calc(100vw - 32px)":"";
        }
      }
    });
  }
  new MutationObserver(()=>setTimeout(repairLocationToasts,0)).observe(document.body,{childList:true,subtree:true});
  window.addEventListener("resize",repairLocationToasts);

  const ds=window.DataService;if(!ds?.client)return;
  const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  let access={mode:"public"},timer=null,currentRows=[],pointAttachment=null,points=[],pickerMap=null,pickerMarker=null;
  const getCode=()=>localStorage.getItem("fwm-operation-code")||"",getSession=()=>localStorage.getItem("fwm-crew-session")||"",getSupport=()=>localStorage.getItem("fwm-support-access-token")||"";
  const rpc=async(n,p)=>{const{data,error}=await ds.client.rpc(n,p);if(error)throw error;return data;};

  function inject(){if($("fwmMessagesButton"))return;document.body.insertAdjacentHTML("beforeend",`
    <button id="fwmMessagesButton" class="fwm-message-fab hidden" type="button" aria-label="Μηνύματα">💬<b id="fwmMessageBadge" class="hidden">0</b></button>
    <div id="fwmMessagesModal" class="modal-backdrop hidden" role="dialog" aria-modal="true">
      <section class="compact-sheet-card fwm-messages-card"><button id="fwmMessagesClose" class="modal-close" type="button">×</button>
        <div class="sheet-section-heading"><span>💬</span><div><h2>Επιχειρησιακά μηνύματα</h2><p id="fwmMessagesContext">Online επικοινωνία</p></div></div>
        <div id="fwmMessageNotice" class="form-message"></div>
        <form id="fwmMessageForm" class="fwm-message-form">
          <div id="fwmRecipientWrap"><label>Προς<select id="fwmMessageRecipient"></select></label></div>
          <label>Τύπος<select id="fwmMessagePriority"><option value="normal">Απλό</option><option value="urgent">🚨 Επείγον — απαιτεί επιβεβαίωση</option></select></label>
          <label>Μήνυμα<textarea id="fwmMessageBody" rows="3" maxlength="1000" required placeholder="Γράψε σύντομο επιχειρησιακό μήνυμα…"></textarea></label>

          <div class="fwm-public-attachment">
            <label>Σημείο χάρτη
              <select id="fwmPublicPointMode">
                <option value="none">Χωρίς σημείο</option>
                <option value="registered">Από καταχώρηση</option>
                <option value="coords">Επικόλληση συντεταγμένων</option>
                <option value="map">Επιλογή από χάρτη</option>
                <option value="mine">Η θέση μου</option>
              </select>
            </label>
            <div id="fwmPublicRegisteredWrap" class="hidden"><select id="fwmPublicRegisteredPoint"></select></div>
            <div id="fwmPublicCoordsWrap" class="hidden">
              <input id="fwmPublicCoords" type="text" placeholder="37.9755, 22.9773">
              <input id="fwmPublicCoordsName" type="text" placeholder="Ονομασία σημείου">
              <button id="fwmPublicUseCoords" type="button" class="action-button">✓ Χρήση</button>
            </div>
            <div id="fwmPublicMapWrap" class="hidden">
              <div class="fwm-map-picker-help">Πάτησε στον χάρτη.</div>
              <div id="fwmPublicPointMap" class="fwm-point-picker-map"></div>
              <input id="fwmPublicMapName" type="text" placeholder="Ονομασία προσωρινού σημείου">
            </div>
            <div id="fwmPointAttachmentLabel" class="fwm-attachment-summary">Χωρίς σημείο χάρτη</div>
          </div>

          <button class="action-button primary full" type="submit">Αποστολή</button>
        </form>
        <div class="fwm-message-toolbar"><strong>Συνομιλία</strong><button id="fwmMessagesRefresh" class="action-button" type="button">↻</button></div>
        <div id="fwmMessagesList" class="fwm-message-list"></div>
      </section></div>`);
    $("fwmMessagesButton").onclick=()=>open();$("fwmMessagesClose").onclick=close;$("fwmMessagesModal").onclick=e=>{if(e.target===$("fwmMessagesModal"))close();};$("fwmMessagesRefresh").onclick=load;
    $("fwmMessageForm").onsubmit=send;
    $("fwmPublicPointMode").onchange=renderPointMode;
    $("fwmPublicUseCoords").onclick=useCoords;
    $("fwmPublicRegisteredPoint").onchange=useRegistered;
    $("fwmPublicMapName").oninput=()=>{if(pointAttachment&&$("fwmPublicPointMode").value==="map"){pointAttachment.name=$("fwmPublicMapName").value.trim()||"Προσωρινό σημείο";renderAttachment();}};
  }

  const visible=()=>!!getSupport()||(["crew","admin"].includes(access.mode)&&!!getSession()&&!!getCode());
  function renderVisibility(){const b=$("fwmMessagesButton");if(!b)return;b.classList.toggle("hidden",!visible());if(!visible())close();}
  function open(){if(!visible())return;$("fwmMessagesModal").classList.remove("hidden");document.body.classList.add("modal-open");load();loadPoints();clearInterval(timer);timer=setInterval(load,8000);}
  function close(){$("fwmMessagesModal")?.classList.add("hidden");document.body.classList.remove("modal-open");clearInterval(timer);timer=null;}
  function setNotice(t,error=false){const e=$("fwmMessageNotice");e.textContent=t||"";e.classList.toggle("error",error);}

  async function loadPoints(){
    try{
      const {data}=await ds.client.from("water_points").select("id,name,latitude,longitude").in("publication_status",["published","hidden"]).order("name");
      points=data||[];
      $("fwmPublicRegisteredPoint").innerHTML='<option value="">Επίλεξε σημείο</option>'+points.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    }catch{}
  }

  function renderPointMode(){
    const m=$("fwmPublicPointMode").value;
    $("fwmPublicRegisteredWrap").classList.toggle("hidden",m!=="registered");
    $("fwmPublicCoordsWrap").classList.toggle("hidden",m!=="coords");
    $("fwmPublicMapWrap").classList.toggle("hidden",m!=="map");
    if(m==="none"){pointAttachment=null;renderAttachment();}
    if(m==="mine") attachLocation();
    if(m==="map") setTimeout(initMapPicker,50);
  }

  function parseCoords(v){
    const x=String(v||"").trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!x)return null;
    const latitude=Number(x[1]),longitude=Number(x[2]);
    return Number.isFinite(latitude)&&Number.isFinite(longitude)&&latitude>=-90&&latitude<=90&&longitude>=-180&&longitude<=180?{latitude,longitude}:null;
  }
  function useCoords(){
    const p=parseCoords($("fwmPublicCoords").value);
    if(!p){setNotice("Μη έγκυρες συντεταγμένες. Παράδειγμα: 37.9755, 22.9773",true);return;}
    pointAttachment={...p,name:$("fwmPublicCoordsName").value.trim()||"Προσωρινό σημείο"};setNotice("");renderAttachment();
  }
  function useRegistered(){
    const p=points.find(x=>x.id===$("fwmPublicRegisteredPoint").value);
    pointAttachment=p?{id:p.id,name:p.name,latitude:p.latitude,longitude:p.longitude}:null;renderAttachment();
  }
  function initMapPicker(){
    if(!window.L||!$("fwmPublicPointMap"))return;
    if(pickerMap){pickerMap.invalidateSize();return;}
    pickerMap=L.map("fwmPublicPointMap").setView([37.95,22.98],10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(pickerMap);
    pickerMap.on("click",e=>{
      if(pickerMarker)pickerMarker.setLatLng(e.latlng);else pickerMarker=L.marker(e.latlng).addTo(pickerMap);
      pointAttachment={name:$("fwmPublicMapName").value.trim()||"Προσωρινό σημείο",latitude:e.latlng.lat,longitude:e.latlng.lng};
      renderAttachment();
    });
  }
  function attachLocation(){
    if(!navigator.geolocation){setNotice("Η συσκευή δεν υποστηρίζει GPS.",true);return;}
    setNotice("Λήψη θέσης…");navigator.geolocation.getCurrentPosition(p=>{pointAttachment={name:"Τρέχουσα θέση αποστολέα",latitude:p.coords.latitude,longitude:p.coords.longitude};setNotice("");renderAttachment();},()=>setNotice("Δεν ήταν δυνατή η λήψη θέσης.",true),{enableHighAccuracy:true,timeout:15000,maximumAge:5000});
  }
  function renderAttachment(){$("fwmPointAttachmentLabel").textContent=pointAttachment?`📍 ${pointAttachment.name} · ${Number(pointAttachment.latitude).toFixed(5)}, ${Number(pointAttachment.longitude).toFixed(5)}`:"Χωρίς σημείο χάρτη";}

  function time(v){return new Date(v).toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit"});}
  function nav(m){return m.latitude!=null&&m.longitude!=null?`<a class="fwm-message-map" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${esc(m.point_name||"Πλοήγηση")}</a>`:"";}

  async function directCrewTargets(){
    const {data,error}=await ds.client.from("crew_positions").select("session_id,vehicle_name,crew_members_text,is_sharing,last_seen_at").eq("is_sharing",true).order("last_seen_at",{ascending:false});
    if(error)throw error;
    const seen=new Set();
    return (data||[]).filter(x=>x.session_id&&!seen.has(x.session_id)&&seen.add(x.session_id)).map(x=>({session_id:x.session_id,label:[x.vehicle_name,x.crew_members_text].filter(Boolean).join(" · ")}));
  }

  async function load(){
    if(!visible())return;
    try{
      let rows=[],crews=[];
      if(getSupport()){
        try{rows=await rpc("list_messages_support_v36",{p_access_token:getSupport(),p_limit:100})||[];}catch(e){setNotice(e.message,true);}
        $("fwmMessagesContext").textContent="Υποστήριξη ↔ Κέντρο";$("fwmRecipientWrap").classList.add("hidden");
      }else{
        try{rows=await rpc("list_messages_crew_v36",{p_code:getCode(),p_session_id:getSession(),p_limit:100})||[];}catch(e){setNotice(e.message,true);}
        try{crews=await directCrewTargets();}catch{}
        $("fwmMessagesContext").textContent=`${localStorage.getItem("fwm-operation-name")||"Επιχείρηση"} · ${localStorage.getItem("fwm-crew-name")||"Πλήρωμα"}`;
        $("fwmRecipientWrap").classList.remove("hidden");
        const sel=$("fwmMessageRecipient"),old=sel.value;
        sel.innerHTML='<option value="center">🏢 Κέντρο</option><option value="all_crews">📣 Όλα τα πληρώματα</option>'+crews.filter(x=>x.session_id!==getSession()).map(x=>`<option value="crew:${x.session_id}">🚒 ${esc(String(x.label||"Όχημα").split(" · ")[0])}</option>`).join("");
        if([...sel.options].some(o=>o.value===old))sel.value=old;
      }
      currentRows=rows;render(rows);await markVisible(rows);updateBadge(rows);
    }catch(e){setNotice(e.message||"Τα μηνύματα δεν είναι διαθέσιμα.",true);}
  }

  function render(rows){const box=$("fwmMessagesList");box.innerHTML=rows.length?rows.map(m=>{const mine=!!m.is_mine;const urgent=m.priority==="urgent";return `<article class="fwm-message ${mine?'mine':'received'} ${urgent?'urgent':''}"><div class="fwm-message-head"><strong>${mine?'Εσύ':esc(m.sender_label||m.sender_type)}</strong><span>${urgent?'🚨 ':''}${time(m.created_at)}</span></div><p>${esc(m.body)}</p>${nav(m)}${urgent&&!mine&&!m.is_acknowledged?`<button class="action-button danger-button fwm-ack" data-ack="${m.id}" type="button">✓ Επιβεβαίωση λήψης</button>`:""}${urgent&&m.is_acknowledged?'<small class="fwm-ack-ok">✓ Επιβεβαιώθηκε</small>':""}</article>`;}).join(""):'<p class="empty-table">Δεν υπάρχουν ακόμη μηνύματα.</p>';box.querySelectorAll("[data-ack]").forEach(b=>b.onclick=()=>ack(b.dataset.ack));}
  async function markVisible(rows){for(const m of rows.filter(x=>!x.is_mine&&!x.is_read).slice(0,20)){try{if(getSupport())await rpc("mark_message_support_v36",{p_access_token:getSupport(),p_message_id:m.id,p_ack:false});else await rpc("mark_message_crew_v36",{p_message_id:m.id,p_session_id:getSession(),p_ack:false});}catch{}}}
  async function ack(id){try{if(getSupport())await rpc("mark_message_support_v36",{p_access_token:getSupport(),p_message_id:id,p_ack:true});else await rpc("mark_message_crew_v36",{p_message_id:id,p_session_id:getSession(),p_ack:true});await load();}catch(e){setNotice(e.message,true);}}
  function updateBadge(rows){const n=rows.filter(x=>!x.is_mine&&!x.is_read).length,b=$("fwmMessageBadge");b.textContent=n;b.classList.toggle("hidden",!n);}

  async function send(e){
    e.preventDefault();const body=$("fwmMessageBody").value.trim();if(!body)return;setNotice("Αποστολή…");
    try{
      if(getSupport()){
        await rpc("send_message_support_v36",{p_access_token:getSupport(),p_body:body,p_priority:$("fwmMessagePriority").value});
      }else{
        const v=$("fwmMessageRecipient").value;let type=v,sid=null;if(v.startsWith("crew:")){type="crew";sid=v.slice(5);}
        await rpc("send_message_crew_v36",{p_code:getCode(),p_session_id:getSession(),p_recipient_type:type,p_recipient_session_id:sid,p_priority:$("fwmMessagePriority").value,p_body:body,p_point_name:pointAttachment?.name||null,p_latitude:pointAttachment?.latitude??null,p_longitude:pointAttachment?.longitude??null});
      }
      $("fwmMessageBody").value="";pointAttachment=null;$("fwmPublicPointMode").value="none";renderPointMode();setNotice("");await load();
    }catch(err){setNotice(err.message||"Η αποστολή απέτυχε.",true);}
  }

  async function refreshAccess(e){access=e?.detail||await ds.currentAccess();renderVisibility();}
  inject();window.addEventListener("fwm-access-changed",refreshAccess);refreshAccess();
})();