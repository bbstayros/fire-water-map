(() => {
  "use strict";
  const ds=window.DataService;
  if(!ds?.client || !document.getElementById("messagesView")) return;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const rpc=async(n,p)=>{const{data,error}=await ds.client.rpc(n,p);if(error)throw error;return data;};

  const state={peers:[],threads:[],activeVehicleIds:new Set(),activeConversation:null,pointAttachment:null,points:[],pickerMap:null,pickerMarker:null};

  const style=document.createElement("style");
  style.textContent=`
    .v37-admin-grid{display:grid;grid-template-columns:minmax(330px,430px) 1fr;gap:18px}
    .v37-admin-panel{background:white;border-radius:22px;padding:18px}
    .v37-admin-compose{display:grid;gap:10px}
    .v37-admin-compose label{display:grid;gap:5px;font-weight:700}
    .v37-admin-compose select,.v37-admin-compose textarea,.v37-admin-compose input{width:100%;padding:11px;border:1px solid #d9e0e4;border-radius:13px;font:inherit}
    .v37-admin-send{border:0;border-radius:13px;padding:12px;background:#981b16;color:#fff;font-weight:800}
    .v37-admin-thread{display:block;width:100%;text-align:left;border:1px solid #e0e5e8;border-radius:15px;background:#fff;padding:11px 13px;margin:7px 0}
    .v37-admin-thread p{margin:.3rem 0 0;color:#68747d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .v37-admin-thread-top{display:flex;justify-content:space-between;gap:10px}
    .v37-admin-unread{background:#981b16;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px}
    .v37-admin-chat{display:flex;flex-direction:column;gap:8px}
    .v37-admin-bubble{max-width:82%;padding:10px 12px;border-radius:15px;background:#f2f4f5}
    .v37-admin-bubble.mine{align-self:flex-end;background:#e9f5ee}
    .v37-admin-bubble.urgent{outline:2px solid #d04a3a}
    .v37-admin-map{height:230px;border-radius:14px;overflow:hidden}
    .v37-admin-point-summary{padding:9px 11px;background:#f6f8f9;border:1px solid #e0e5e8;border-radius:12px}
    .v37-admin-readonly{padding:9px 12px;background:#fff4d9;border-radius:12px;margin-bottom:8px}
    @media(max-width:1000px){.v37-admin-grid{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);

  function build(){
    const view=$("messagesView");
    view.innerHTML=`
      <div class="v37-admin-grid">
        <section class="v37-admin-panel">
          <h2>Νέο μήνυμα</h2>
          <p>Αποστολή σε ενεργό καταχωρημένο όχημα ή μαζικά σε όλα τα ενεργά πληρώματα.</p>
          <div id="v37AdminNotice"></div>
          <form id="v37AdminCompose" class="v37-admin-compose">
            <label>Προς<select id="v37AdminRecipient"></select></label>
            <label>Τύπος<select id="v37AdminPriority"><option value="normal">Απλό</option><option value="urgent">🚨 Επείγον</option></select></label>
            <label>Μήνυμα<textarea id="v37AdminBody" rows="4" maxlength="1000" required></textarea></label>
            <label>Σημείο χάρτη
              <select id="v37AdminPointMode">
                <option value="none">Χωρίς σημείο</option>
                <option value="registered">Από καταχώρηση</option>
                <option value="coords">Επικόλληση συντεταγμένων</option>
                <option value="map">Επιλογή από χάρτη</option>
              </select>
            </label>
            <div id="v37AdminRegisteredWrap" class="hidden"><select id="v37AdminRegistered"></select></div>
            <div id="v37AdminCoordsWrap" class="hidden"><input id="v37AdminCoords" placeholder="37.9755, 22.9773"><input id="v37AdminCoordsName" placeholder="Ονομασία"><button id="v37AdminUseCoords" type="button">Χρήση</button></div>
            <div id="v37AdminMapWrap" class="hidden"><div id="v37AdminMap" class="v37-admin-map"></div><input id="v37AdminMapName" placeholder="Ονομασία προσωρινού σημείου"></div>
            <div id="v37AdminPointSummary" class="v37-admin-point-summary">Χωρίς σημείο χάρτη</div>
            <button class="v37-admin-send" type="submit">Αποστολή</button>
          </form>
        </section>
        <section class="v37-admin-panel">
          <div style="display:flex;justify-content:space-between;gap:10px"><div><h2>Ιστορικό συνομιλιών</h2><p>Ομαδοποίηση ανά ζευγάρι αποστολής.</p></div><button id="v37AdminRefresh" type="button">↻</button></div>
          <div id="v37AdminThreads"></div>
          <div id="v37AdminChatWrap" class="hidden">
            <button id="v37AdminBack" type="button">← Συνομιλίες</button>
            <h3 id="v37AdminChatTitle"></h3>
            <div id="v37AdminReadonly" class="v37-admin-readonly hidden">Η συνομιλία είναι μεταξύ δύο πληρωμάτων. Το Κέντρο τη βλέπει ως ιστορικό αλλά δεν απαντά μέσα σε αυτή.</div>
            <div id="v37AdminChat" class="v37-admin-chat"></div>
          </div>
        </section>
      </div>`;
    $("v37AdminCompose").onsubmit=send;
    $("v37AdminRefresh").onclick=loadThreads;
    $("v37AdminBack").onclick=()=>{state.activeConversation=null;renderThreads();};
    $("v37AdminPointMode").onchange=renderPointMode;
    $("v37AdminUseCoords").onclick=useCoords;
    $("v37AdminRegistered").onchange=useRegistered;
    $("v37AdminMapName").oninput=()=>{if(state.pointAttachment){state.pointAttachment.name=$("v37AdminMapName").value.trim()||"Προσωρινό σημείο";renderPointSummary();}};
  }

  function notice(t,e=false){const n=$("v37AdminNotice");n.textContent=t||"";n.style.color=e?"#b42318":"";}
  async function init(){
    if(!$("v37AdminCompose")) build();
    try{
      const [peers,threads,registry]=await Promise.all([
        rpc("center_peers_v37",{}),
        rpc("center_threads_v37",{}),
        ds.client.from("vehicle_registry").select("id").eq("is_active",true)
      ]);
      state.peers=peers||[];state.threads=threads||[];
      state.activeVehicleIds=new Set((registry.data||[]).map(v=>String(v.id)));
      renderPeers();renderThreads();loadPoints();
    }catch(e){notice(e.message,true);}
  }
  function usablePeers(){
    const now=Date.now(),seen=new Set();
    return state.peers
      .filter(p=>p.vehicle_id && state.activeVehicleIds.has(String(p.vehicle_id)))
      .filter(p=>p.last_seen_at && now-new Date(p.last_seen_at).getTime()<=5*60*1000)
      .sort((a,b)=>new Date(b.last_seen_at)-new Date(a.last_seen_at))
      .filter(p=>{const k=String(p.vehicle_id);if(seen.has(k))return false;seen.add(k);return true;})
      .sort((a,b)=>String(a.vehicle_name||"").localeCompare(String(b.vehicle_name||""),"el"));
  }
  function renderPeers(){
    const peers=usablePeers();
    $("v37AdminRecipient").innerHTML=peers.length?
      '<option value="__ALL_ACTIVE_CREWS__">📢 Όλα τα ενεργά πληρώματα</option>'+
      peers.map(p=>`<option value="${p.session_id}">🚒 ${esc(p.vehicle_name||"Πλήρωμα")}</option>`).join(""):
      '<option value="">Δεν υπάρχουν ενεργά καταχωρημένα οχήματα</option>';
  }
  async function loadThreads(){
    try{state.threads=await rpc("center_threads_v37",{})||[];renderThreads();}catch(e){notice(e.message,true);}
  }
  function pairLabel(t){return `${t.endpoint_a_label} ↔ ${t.endpoint_b_label}`;}
  function renderThreads(){
    const box=$("v37AdminThreads");
    $("v37AdminChatWrap").classList.add("hidden");box.classList.remove("hidden");
    box.innerHTML=state.threads.length?state.threads.map(t=>`
      <button class="v37-admin-thread" data-thread="${t.conversation_id}" type="button">
        <div class="v37-admin-thread-top"><strong>${esc(pairLabel(t))}</strong>${Number(t.unread_count)>0?`<span class="v37-admin-unread">${t.unread_count}</span>`:""}</div>
        <p>${esc(t.last_message||"")}</p>
      </button>`).join(""):'<p>Δεν υπάρχουν ακόμη συνομιλίες.</p>';
    box.querySelectorAll("[data-thread]").forEach(b=>b.onclick=()=>openThread(b.dataset.thread));
  }
  async function openThread(id){
    const t=state.threads.find(x=>x.conversation_id===id);state.activeConversation=id;
    $("v37AdminThreads").classList.add("hidden");$("v37AdminChatWrap").classList.remove("hidden");
    $("v37AdminChatTitle").textContent=t?pairLabel(t):"Συνομιλία";
    const centerParticipant=t && (
      (t.endpoint_a_type==="center"&&t.endpoint_a_id==="main") ||
      (t.endpoint_b_type==="center"&&t.endpoint_b_id==="main")
    );
    $("v37AdminReadonly").classList.toggle("hidden",!!centerParticipant);
    try{
      const rows=await rpc("center_thread_messages_v37",{p_conversation_id:id,p_limit:200})||[];
      $("v37AdminChat").innerHTML=rows.map(m=>bubble(m)).join("");
      $("v37AdminChat").querySelectorAll("[data-ack]").forEach(b=>b.onclick=()=>ack(b.dataset.ack));
    }catch(e){notice(e.message,true);}
  }
  function bubble(m){
    const mine=m.sender_type==="center";
    const nav=m.latitude!=null&&m.longitude!=null?`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${esc(m.point_name||"Πλοήγηση")}</a>`:"";
    const ack=m.priority==="urgent"&&!mine&&!m.acknowledged_at?`<button data-ack="${m.id}" type="button">✓ Επιβεβαίωση λήψης</button>`:"";
    return `<article class="v37-admin-bubble ${mine?"mine":""} ${m.priority==="urgent"?"urgent":""}"><strong>${esc(m.sender_label)}</strong><div>${esc(m.body)}</div>${nav}${ack}<small>${new Date(m.created_at).toLocaleString("el-GR")}${m.acknowledged_at?" · ✓ Επιβεβαιώθηκε":""}</small></article>`;
  }
  async function ack(id){await rpc("ack_message_center_v37",{p_message_id:id});if(state.activeConversation)openThread(state.activeConversation);}

  async function send(e){
    e.preventDefault();const recipient=$("v37AdminRecipient").value,body=$("v37AdminBody").value.trim();
    if(!recipient||!body)return;
    const payload=sessionId=>({
      p_recipient_session_id:sessionId,
      p_body:body,
      p_priority:$("v37AdminPriority").value,
      p_point_name:state.pointAttachment?.name||null,
      p_latitude:state.pointAttachment?.latitude??null,
      p_longitude:state.pointAttachment?.longitude??null
    });
    try{
      const broadcast=recipient==="__ALL_ACTIVE_CREWS__";
      const peers=broadcast?usablePeers():[];
      if(broadcast && !peers.length){notice("Δεν υπάρχουν ενεργά καταχωρημένα πληρώματα.",true);return;}
      notice(broadcast?`Μαζική αποστολή σε ${peers.length} πληρώματα…`:"Αποστολή…");
      if(broadcast){
        const results=await Promise.allSettled(peers.map(p=>rpc("send_center_message_v37",payload(p.session_id))));
        const ok=results.filter(r=>r.status==="fulfilled").length;
        const failed=results.length-ok;
        if(failed) notice(`Στάλθηκε σε ${ok}/${results.length} πληρώματα. ${failed} αποστολές απέτυχαν.`,true);
        else notice(`✓ Στάλθηκε σε ${ok} πληρώματα.`);
      }else{
        await rpc("send_center_message_v37",payload(recipient));
        notice("✓ Το μήνυμα στάλθηκε.");
      }
      $("v37AdminBody").value="";state.pointAttachment=null;$("v37AdminPointMode").value="none";renderPointMode();
      await loadThreads();
      setTimeout(()=>notice(""),3500);
    }catch(e2){notice(e2.message,true);}
  }

  async function loadPoints(){
    try{
      const{data}=await ds.client.from("water_points").select("id,name,latitude,longitude").in("publication_status",["published","hidden"]).order("name");
      state.points=data||[];
      $("v37AdminRegistered").innerHTML='<option value="">Επίλεξε σημείο</option>'+state.points.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join("");
    }catch{}
  }
  function renderPointMode(){
    const m=$("v37AdminPointMode").value;
    $("v37AdminRegisteredWrap").classList.toggle("hidden",m!=="registered");
    $("v37AdminCoordsWrap").classList.toggle("hidden",m!=="coords");
    $("v37AdminMapWrap").classList.toggle("hidden",m!=="map");
    if(m==="none"){state.pointAttachment=null;renderPointSummary();}
    if(m==="map")setTimeout(initMap,50);
  }
  function parseCoords(v){
    const x=String(v||"").trim().match(/^\s*(-?\d+(?:\.\d+)?)\s*[,;\s]\s*(-?\d+(?:\.\d+)?)\s*$/);if(!x)return null;
    return {latitude:Number(x[1]),longitude:Number(x[2])};
  }
  function useCoords(){
    const p=parseCoords($("v37AdminCoords").value);if(!p){notice("Μη έγκυρες συντεταγμένες.",true);return;}
    state.pointAttachment={...p,name:$("v37AdminCoordsName").value.trim()||"Προσωρινό σημείο"};notice("");renderPointSummary();
  }
  function useRegistered(){
    const p=state.points.find(x=>x.id===$("v37AdminRegistered").value);
    state.pointAttachment=p?{name:p.name,latitude:p.latitude,longitude:p.longitude}:null;renderPointSummary();
  }
  function initMap(){
    if(!window.L||!$("v37AdminMap"))return;
    if(state.pickerMap){state.pickerMap.invalidateSize();return;}
    state.pickerMap=L.map("v37AdminMap").setView([37.95,22.98],10);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"&copy; OpenStreetMap"}).addTo(state.pickerMap);
    state.pickerMap.on("click",e=>{
      if(state.pickerMarker)state.pickerMarker.setLatLng(e.latlng);else state.pickerMarker=L.marker(e.latlng).addTo(state.pickerMap);
      state.pointAttachment={name:$("v37AdminMapName").value.trim()||"Προσωρινό σημείο",latitude:e.latlng.lat,longitude:e.latlng.lng};renderPointSummary();
    });
  }
  function renderPointSummary(){
    $("v37AdminPointSummary").textContent=state.pointAttachment?`📍 ${state.pointAttachment.name} · ${state.pointAttachment.latitude.toFixed(5)}, ${state.pointAttachment.longitude.toFixed(5)}`:"Χωρίς σημείο χάρτη";
  }

  window.addEventListener("admin-dashboard-ready",init);
  document.querySelector('[data-view="messages"]')?.addEventListener("click",init);
})();