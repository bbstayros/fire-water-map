(() => {
  "use strict";
  const ds = window.DataService;
  if (!ds?.client) return;

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
  }[c]));

  const state = {
    access: {mode:"public"},
    sessionId: localStorage.getItem("fwm-crew-session") || "",
    deviceId: localStorage.getItem("fwm-device-id") || "",
    vehicleName: localStorage.getItem("fwm-crew-name") || "",
    peers: [],
    threads: [],
    activeConversation: null,
    activeRecipient: {type:"center", id:"main", label:"Κέντρο"},
    pointAttachment: null,
    points: [],
    timer: null,
    pickerMap: null,
    pickerMarker: null
  };

  const style = document.createElement("style");
  style.textContent = `
    .v37-msg-fab{position:fixed;right:18px;bottom:118px;z-index:1750;width:64px;height:64px;border:0;border-radius:20px;background:#981b16;color:#fff;font-size:28px;box-shadow:0 8px 24px #0003}
    .v37-msg-fab b{position:absolute;right:-5px;top:-6px;background:#168c4c;color:white;border-radius:999px;min-width:24px;height:24px;display:grid;place-items:center;font-size:12px}
    .v37-msg-modal{position:fixed;inset:0;z-index:4100;background:#0007;display:grid;place-items:center;padding:18px}
    .v37-msg-card{width:min(760px,100%);max-height:92dvh;overflow:auto;background:#fff;border-radius:28px;padding:22px;box-shadow:0 24px 70px #0005}
    .v37-msg-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
    .v37-msg-close{border:0;border-radius:50%;width:46px;height:46px;font-size:28px}
    .v37-tabs{display:flex;gap:8px;margin:14px 0}
    .v37-tabs button{flex:1;padding:11px;border:1px solid #d9e0e4;border-radius:14px;background:#fff;font-weight:700}
    .v37-tabs button.active{background:#111f29;color:white}
    .v37-pane.hidden,.v37-msg-modal.hidden{display:none!important}
    .v37-thread{display:block;width:100%;text-align:left;border:1px solid #e0e5e8;border-radius:16px;background:#fff;padding:12px 14px;margin:8px 0}
    .v37-thread-top{display:flex;justify-content:space-between;gap:10px}
    .v37-thread p{margin:.35rem 0 0;color:#66727c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .v37-unread{background:#981b16;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px}
    .v37-compose{display:grid;gap:10px}
    .v37-compose label{display:grid;gap:5px;font-weight:700}
    .v37-compose select,.v37-compose textarea,.v37-compose input{width:100%;padding:12px;border:1px solid #d8dfe3;border-radius:14px;font:inherit}
    .v37-send{border:0;border-radius:14px;padding:13px;background:#981b16;color:white;font-weight:800}
    .v37-chat{display:flex;flex-direction:column;gap:8px;margin-top:12px}
    .v37-bubble{max-width:88%;padding:10px 12px;border-radius:16px;background:#f1f4f6}
    .v37-bubble.mine{align-self:flex-end;background:#e8f5ee}
    .v37-bubble.urgent{outline:2px solid #d04737}
    .v37-bubble small{display:block;color:#6a7580;margin-top:4px}
    .v37-map-link{display:inline-block;margin-top:6px}
    .v37-ack{margin-top:7px;border:0;border-radius:10px;padding:8px;background:#981b16;color:#fff;font-weight:700}
    .v37-point-tools{display:grid;gap:8px}
    .v37-map-picker{height:230px;border-radius:14px;overflow:hidden}
    .v37-summary{padding:9px 11px;background:#f6f8f9;border:1px solid #e0e5e8;border-radius:12px;color:#5d6972}
    .v37-popup-message{flex:1;border:1px solid #d8dfe3;border-radius:14px;padding:11px;background:#fff;font-weight:800}
    @media(max-width:720px){.v37-msg-fab{bottom:165px}.v37-msg-card{padding:18px;border-radius:24px}}
  `;
  document.head.appendChild(style);

  function inject(){
    if($("v37MsgFab")) return;
    document.body.insertAdjacentHTML("beforeend", `
      <button id="v37MsgFab" class="v37-msg-fab hidden" type="button">💬<b id="v37Unread" class="hidden">0</b></button>
      <div id="v37MsgModal" class="v37-msg-modal hidden">
        <section class="v37-msg-card">
          <div class="v37-msg-head">
            <div><h2>💬 Επιχειρησιακά μηνύματα</h2><p id="v37Context">${esc(state.vehicleName || "Πλήρωμα")}</p></div>
            <button id="v37Close" class="v37-msg-close" type="button">×</button>
          </div>
          <div id="v37Notice"></div>
          <div class="v37-tabs">
            <button id="v37TabCompose" class="active" type="button">Νέο μήνυμα</button>
            <button id="v37TabHistory" type="button">Ιστορικό</button>
          </div>
          <div id="v37ComposePane" class="v37-pane">
            <form id="v37Compose" class="v37-compose">
              <label>Προς<select id="v37Recipient"></select></label>
              <label>Τύπος<select id="v37Priority"><option value="normal">Απλό</option><option value="urgent">🚨 Επείγον</option></select></label>
              <label>Μήνυμα<textarea id="v37Body" rows="3" maxlength="1000" required></textarea></label>
              <div class="v37-point-tools">
                <label>Σημείο χάρτη
                  <select id="v37PointMode">
                    <option value="none">Χωρίς σημείο</option>
                    <option value="registered">Από καταχώρηση</option>
                    <option value="coords">Επικόλληση συντεταγμένων</option>
                    <option value="map">Επιλογή από χάρτη</option>
                    <option value="mine">Η θέση μου</option>
                  </select>
                </label>
                <div id="v37RegisteredWrap" class="hidden"><select id="v37Registered"></select></div>
                <div id="v37CoordsWrap" class="hidden"><input id="v37Coords" placeholder="37.9755, 22.9773"><input id="v37CoordsName" placeholder="Ονομασία"><button id="v37UseCoords" type="button">Χρήση</button></div>
                <div id="v37MapWrap" class="hidden"><div id="v37MapPicker" class="v37-map-picker"></div><input id="v37MapName" placeholder="Ονομασία προσωρινού σημείου"></div>
                <div id="v37PointSummary" class="v37-summary">Χωρίς σημείο χάρτη</div>
              </div>
              <button class="v37-send" type="submit">Αποστολή</button>
            </form>
          </div>
          <div id="v37HistoryPane" class="v37-pane hidden">
            <div id="v37Threads"></div>
            <div id="v37ChatHeader" class="hidden"><button id="v37BackThreads" type="button">← Συνομιλίες</button><strong id="v37ChatTitle"></strong></div>
            <div id="v37Chat" class="v37-chat"></div>
          </div>
        </section>
      </div>`);
    $("v37MsgFab").onclick=()=>open();
    $("v37Close").onclick=close;
    $("v37MsgModal").onclick=e=>{if(e.target===$("v37MsgModal")) close();};
    $("v37TabCompose").onclick=()=>showTab("compose");
    $("v37TabHistory").onclick=()=>showTab("history");
    $("v37Compose").onsubmit=send;
    $("v37PointMode").onchange=renderPointMode;
    $("v37UseCoords").onclick=useCoords;
    $("v37Registered").onchange=useRegistered;
    $("v37MapName").oninput=()=>{if(state.pointAttachment){state.pointAttachment.name=$("v37MapName").value.trim()||"Προσωρινό σημείο";renderPointSummary();}};
    $("v37BackThreads").onclick=()=>{state.activeConversation=null;renderThreads();};
  }

  const rpc=async(name,params)=>{const{data,error}=await ds.client.rpc(name,params);if(error)throw error;return data;};
  const visible=()=>["crew","admin"].includes(state.access.mode)&&state.sessionId&&state.deviceId;

  async function refreshAccess(e){
    state.access=e?.detail || await ds.currentAccess();
    state.sessionId=localStorage.getItem("fwm-crew-session")||"";
    state.deviceId=localStorage.getItem("fwm-device-id")||"";
    state.vehicleName=localStorage.getItem("fwm-crew-name")||"";
    $("v37MsgFab")?.classList.toggle("hidden",!visible());
  }

  function notice(text,error=false){
    const n=$("v37Notice"); n.textContent=text||""; n.style.color=error?"#b42318":"";
  }
  function showTab(tab){
    $("v37TabCompose").classList.toggle("active",tab==="compose");
    $("v37TabHistory").classList.toggle("active",tab==="history");
    $("v37ComposePane").classList.toggle("hidden",tab!=="compose");
    $("v37HistoryPane").classList.toggle("hidden",tab!=="history");
    if(tab==="history") loadThreads();
  }
  async function open(recipientSessionId=null, recipientLabel=null){
    if(!visible()) return;
    $("v37MsgModal").classList.remove("hidden");
    document.body.classList.add("modal-open");
    await Promise.all([loadPeers(),loadPoints()]);
    if(recipientSessionId){
      state.activeRecipient={type:"crew",id:recipientSessionId,label:recipientLabel||"Πλήρωμα"};
      $("v37Recipient").value=`crew:${recipientSessionId}`;
    }
    clearInterval(state.timer);
    state.timer=setInterval(loadThreads,10000);
  }
  function close(){
    $("v37MsgModal")?.classList.add("hidden");
    document.body.classList.remove("modal-open");
    clearInterval(state.timer);state.timer=null;
  }

  async function loadPeers(){
    try{
      state.peers=await rpc("crew_peers_v37",{p_session_id:state.sessionId,p_device_id:state.deviceId})||[];
      const old=$("v37Recipient").value;
      $("v37Recipient").innerHTML='<option value="center">🏢 Κέντρο</option>'+
        state.peers.map(p=>`<option value="crew:${p.session_id}">🚒 ${esc(p.vehicle_name||"Πλήρωμα")}</option>`).join("");
      $("v37Recipient").value=[...$("v37Recipient").options].some(o=>o.value===old)?old:"center";
    }catch(e){notice(e.message,true);}
  }

  async function loadThreads(){
    if(!visible()) return;
    try{
      state.threads=await rpc("crew_threads_v37",{p_session_id:state.sessionId,p_device_id:state.deviceId})||[];
      renderThreads();
      const unread=state.threads.reduce((s,t)=>s+Number(t.unread_count||0),0);
      $("v37Unread").textContent=unread;$("v37Unread").classList.toggle("hidden",!unread);
    }catch(e){notice(e.message,true);}
  }
  function otherLabel(t){
    const me=state.sessionId;
    if(t.endpoint_a_type==="crew"&&t.endpoint_a_id===me) return t.endpoint_b_label;
    return t.endpoint_a_label;
  }
  function renderThreads(){
    const box=$("v37Threads");
    $("v37Chat").innerHTML="";
    $("v37ChatHeader").classList.toggle("hidden",!state.activeConversation);
    if(state.activeConversation) return;
    box.classList.remove("hidden");
    box.innerHTML=state.threads.length?state.threads.map(t=>`
      <button class="v37-thread" data-thread="${t.conversation_id}" type="button">
        <div class="v37-thread-top"><strong>${esc(otherLabel(t))}</strong>${Number(t.unread_count)>0?`<span class="v37-unread">${t.unread_count}</span>`:""}</div>
        <p>${esc(t.last_message||"")}</p>
      </button>`).join(""):'<p>Δεν υπάρχουν ακόμη συνομιλίες.</p>';
    box.querySelectorAll("[data-thread]").forEach(b=>b.onclick=()=>openThread(b.dataset.thread));
  }
  async function openThread(id){
    state.activeConversation=id;
    $("v37Threads").classList.add("hidden");$("v37ChatHeader").classList.remove("hidden");
    const t=state.threads.find(x=>x.conversation_id===id);
    $("v37ChatTitle").textContent=t?otherLabel(t):"Συνομιλία";
    try{
      const rows=await rpc("crew_thread_messages_v37",{p_conversation_id:id,p_session_id:state.sessionId,p_device_id:state.deviceId,p_limit:200})||[];
      $("v37Chat").innerHTML=rows.map(m=>bubble(m)).join("");
      $("v37Chat").querySelectorAll("[data-ack]").forEach(b=>b.onclick=()=>ack(b.dataset.ack));
    }catch(e){notice(e.message,true);}
  }
  function bubble(m){
    const mine=m.sender_type==="crew"&&m.sender_id===state.sessionId;
    const nav=m.latitude!=null&&m.longitude!=null?`<a class="v37-map-link" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${esc(m.point_name||"Πλοήγηση")}</a>`:"";
    const ack=m.priority==="urgent"&&!mine&&!m.acknowledged_at?`<button class="v37-ack" data-ack="${m.id}" type="button">✓ Επιβεβαίωση λήψης</button>`:"";
    return `<article class="v37-bubble ${mine?"mine":""} ${m.priority==="urgent"?"urgent":""}"><strong>${mine?"Εσύ":esc(m.sender_label)}</strong><div>${esc(m.body)}</div>${nav}${ack}<small>${new Date(m.created_at).toLocaleString("el-GR")}${m.acknowledged_at?" · ✓ Επιβεβαιώθηκε":""}</small></article>`;
  }
  async function ack(id){
    await rpc("ack_message_crew_v37",{p_message_id:id,p_session_id:state.sessionId,p_device_id:state.deviceId});
    if(state.activeConversation) openThread(state.activeConversation);
  }

  async function send(e){
    e.preventDefault();
    const body=$("v37Body").value.trim(); if(!body) return;
    const raw=$("v37Recipient").value;
    const recipientType=raw==="center"?"center":"crew";
    const recipientId=raw.startsWith("crew:")?raw.slice(5):null;
    try{
      notice("Αποστολή…");
      await rpc("send_crew_message_v37",{
        p_sender_session_id:state.sessionId,
        p_device_id:state.deviceId,
        p_recipient_type:recipientType,
        p_recipient_session_id:recipientId,
        p_body:body,
        p_priority:$("v37Priority").value,
        p_point_name:state.pointAttachment?.name||null,
        p_latitude:state.pointAttachment?.latitude??null,
        p_longitude:state.pointAttachment?.longitude??null
      });
      $("v37Body").value="";state.pointAttachment=null;$("v37PointMode").value="none";renderPointMode();notice("");
      await loadThreads();
    }catch(e2){notice(e2.message,true);}
  }

  async function loadPoints(){
    try{
      const {data}=await ds.client.from("water_points").select("id,name,latitude,longitude").in("publication_status",["published","hidden"]).order("name");
      state.points=data||[];
      $("v37Registered").innerHTML='<option value="">Επίλεξε σημείο</option>'+state.points.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    }catch{}
  }
  function renderPointMode(){
    const m=$("v37PointMode").value;
    $("v37RegisteredWrap").classList.toggle("hidden",m!=="registered");
    $("v37CoordsWrap").classList.toggle("hidden",m!=="coords");
    $("v37MapWrap").classList.toggle("hidden",m!=="map");
    if(m==="none"){state.pointAttachment=null;renderPointSummary();}
    if(m==="mine") useMine();
    if(m==="map") setTimeout(initMapPicker,50);
  }
  function parseCoords(v){
    const x=String(v||"").trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);
    if(!x) return null;
    const latitude=Number(x[1]),longitude=Number(x[2]);
    return Number.isFinite(latitude)&&Number.isFinite(longitude)?{latitude,longitude}:null;
  }
  function useCoords(){
    const p=parseCoords($("v37Coords").value);if(!p){notice("Μη έγκυρες συντεταγμένες.",true);return;}
    state.pointAttachment={...p,name:$("v37CoordsName").value.trim()||"Προσωρινό σημείο"};notice("");renderPointSummary();
  }
  function useRegistered(){
    const p=state.points.find(x=>x.id===$("v37Registered").value);
    state.pointAttachment=p?{name:p.name,latitude:p.latitude,longitude:p.longitude}:null;renderPointSummary();
  }
  function useMine(){
    navigator.geolocation?.getCurrentPosition(p=>{
      state.pointAttachment={name:"Η θέση μου",latitude:p.coords.latitude,longitude:p.coords.longitude};renderPointSummary();
    },()=>notice("Δεν ήταν δυνατή η λήψη θέσης.",true),{enableHighAccuracy:true,timeout:15000});
  }
  function initMapPicker(){
    if(!window.L||!$("v37MapPicker")) return;
    if(state.pickerMap){state.pickerMap.invalidateSize();return;}
    state.pickerMap=L.map("v37MapPicker").setView([37.95,22.98],10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(state.pickerMap);
    state.pickerMap.on("click",e=>{
      if(state.pickerMarker) state.pickerMarker.setLatLng(e.latlng); else state.pickerMarker=L.marker(e.latlng).addTo(state.pickerMap);
      state.pointAttachment={name:$("v37MapName").value.trim()||"Προσωρινό σημείο",latitude:e.latlng.lat,longitude:e.latlng.lng};renderPointSummary();
    });
  }
  function renderPointSummary(){
    $("v37PointSummary").textContent=state.pointAttachment?`📍 ${state.pointAttachment.name} · ${state.pointAttachment.latitude.toFixed(5)}, ${state.pointAttachment.longitude.toFixed(5)}`:"Χωρίς σημείο χάρτη";
  }

  // Add direct "Message" button to a vehicle popup/sheet.
  const observer=new MutationObserver(async()=>{
    const content=document.getElementById("sheetContent");if(!content||content.querySelector(".v37-popup-message")) return;
    const name=content.querySelector(".vehicle-sheet-heading h2")?.textContent?.trim();if(!name||!visible()) return;
    try{
      if(!state.peers.length) await loadPeers();
      const peer=state.peers.find(p=>String(p.vehicle_name||"").trim()===name);
      if(!peer) return;
      const actions=content.querySelector(".vehicle-sheet-actions");
      if(!actions) return;
      const btn=document.createElement("button");
      btn.className="v37-popup-message";btn.type="button";btn.textContent="💬 Μήνυμα";
      btn.onclick=()=>open(peer.session_id,peer.vehicle_name);
      actions.insertBefore(btn,actions.lastElementChild);
    }catch{}
  });
  observer.observe(document.body,{childList:true,subtree:true});

  inject();
  window.addEventListener("fwm-access-changed",refreshAccess);
  refreshAccess();
  setInterval(()=>{if(visible()) loadThreads();},15000);
})();