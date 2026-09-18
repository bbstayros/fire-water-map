(() => {
  "use strict";
  const ds=window.DataService;
  if(!ds?.client || !document.getElementById("messagesView")) return;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const rpc=async(n,p)=>{const{data,error}=await ds.client.rpc(n,p);if(error)throw error;return data;};
  const state={peers:[],supportPeers:[],threads:[],activeVehicleIds:new Set(),activeConversation:null,activeThread:null,pointAttachment:null,points:[],pickerMap:null,pickerMarker:null};

  const style=document.createElement("style");
  style.textContent=`
    .v382-shell{display:grid;gap:16px;max-width:1050px}
    .v382-panel{background:#fff;border-radius:22px;padding:18px}
    .v382-head{display:flex;justify-content:space-between;align-items:center;gap:12px}
    .v382-thread-list{display:grid;gap:8px;margin-top:12px;max-height:300px;overflow:auto}
    .v37-admin-thread{display:block;width:100%;text-align:left;border:1px solid #e0e5e8;border-radius:15px;background:#fff;padding:11px 13px;cursor:pointer}
    .v37-admin-thread.active{border-color:#981b16;background:#fff8f7}
    .v37-admin-thread p{margin:.3rem 0 0;color:#68747d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .v37-admin-thread-top{display:flex;justify-content:space-between;gap:10px}.v37-admin-unread{background:#981b16;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px}
    .v382-chat-head{display:flex;justify-content:space-between;align-items:center;gap:12px;border-bottom:1px solid #e7ebee;padding-bottom:12px}.v382-chat-actions{display:flex;gap:8px}
    .v382-delete{border:1px solid #d92d20;background:#fff;color:#b42318;border-radius:11px;padding:8px 11px;font-weight:700;cursor:pointer}
    .v37-admin-chat{display:flex;flex-direction:column;gap:8px;min-height:180px;max-height:430px;overflow:auto;padding:14px 4px}.v37-admin-bubble{max-width:82%;padding:10px 12px;border-radius:15px;background:#f2f4f5;display:grid;gap:4px}.v37-admin-bubble.mine{align-self:flex-end;background:#e9f5ee}.v37-admin-bubble.urgent{outline:2px solid #d04a3a}.v37-admin-bubble small{color:#68747d}
    .v37-admin-compose{display:grid;gap:10px;border-top:1px solid #e7ebee;padding-top:12px}.v37-admin-compose label{display:grid;gap:5px;font-weight:700}.v37-admin-compose select,.v37-admin-compose textarea,.v37-admin-compose input{width:100%;padding:11px;border:1px solid #d9e0e4;border-radius:13px;font:inherit}.v37-admin-send{border:0;border-radius:13px;padding:12px;background:#981b16;color:#fff;font-weight:800}.v37-admin-map{height:230px;border-radius:14px;overflow:hidden}.v37-admin-point-summary{padding:9px 11px;background:#f6f8f9;border:1px solid #e0e5e8;border-radius:12px}.v37-admin-readonly{padding:9px 12px;background:#fff4d9;border-radius:12px}.v382-new{border:0;border-radius:11px;padding:9px 12px;font-weight:800;cursor:pointer}
  `;document.head.appendChild(style);

  function build(){
    $("messagesView").innerHTML=`<div class="v382-shell">
      <section class="v382-panel"><div class="v382-head"><div><h2>Ιστορικό συνομιλιών</h2><p>Επίλεξε συνομιλία για να ανοίξει το chat.</p></div><div><button id="v382New" class="v382-new" type="button">＋ Νέα συνομιλία</button> <button id="v37AdminRefresh" type="button">↻</button></div></div><div id="v37AdminNotice"></div><div id="v37AdminThreads" class="v382-thread-list"></div></section>
      <section id="v37AdminChatWrap" class="v382-panel hidden">
        <div class="v382-chat-head"><div><h3 id="v37AdminChatTitle">Νέο μήνυμα</h3><small id="v382ChatSub"></small></div><div class="v382-chat-actions"><button id="v382Delete" class="v382-delete hidden" type="button">🗑️ Διαγραφή συνομιλίας</button></div></div>
        <div id="v37AdminReadonly" class="v37-admin-readonly hidden">Η συνομιλία είναι μεταξύ δύο πληρωμάτων. Το Κέντρο τη βλέπει ως ιστορικό αλλά δεν μπορεί να απαντήσει.</div>
        <div id="v37AdminChat" class="v37-admin-chat"></div>
        <form id="v37AdminCompose" class="v37-admin-compose">
          <label id="v382RecipientLabel">Προς<select id="v37AdminRecipient"></select></label>
          <label>Τύπος<select id="v37AdminPriority"><option value="normal">Απλό</option><option value="urgent">🚨 Επείγον</option></select></label>
          <label>Μήνυμα<textarea id="v37AdminBody" rows="3" maxlength="1000" required placeholder="Γράψε μήνυμα…"></textarea></label>
          <label>Σημείο χάρτη<select id="v37AdminPointMode"><option value="none">Χωρίς σημείο</option><option value="registered">Από καταχώρηση</option><option value="coords">Επικόλληση συντεταγμένων</option><option value="map">Επιλογή από χάρτη</option></select></label>
          <div id="v37AdminRegisteredWrap" class="hidden"><select id="v37AdminRegistered"></select></div>
          <div id="v37AdminCoordsWrap" class="hidden"><input id="v37AdminCoords" placeholder="37.9755, 22.9773"><input id="v37AdminCoordsName" placeholder="Ονομασία"><button id="v37AdminUseCoords" type="button">Χρήση</button></div>
          <div id="v37AdminMapWrap" class="hidden"><div id="v37AdminMap" class="v37-admin-map"></div><input id="v37AdminMapName" placeholder="Ονομασία προσωρινού σημείου"></div>
          <div id="v37AdminPointSummary" class="v37-admin-point-summary">Χωρίς σημείο χάρτη</div><button class="v37-admin-send" type="submit">Αποστολή</button>
        </form>
      </section></div>`;
    $("v37AdminCompose").onsubmit=send;$("v37AdminRefresh").onclick=init;$("v382New").onclick=openNew;$("v382Delete").onclick=deleteConversation;$("v37AdminPointMode").onchange=renderPointMode;$("v37AdminUseCoords").onclick=useCoords;$("v37AdminRegistered").onchange=useRegistered;$("v37AdminMapName").oninput=()=>{if(state.pointAttachment){state.pointAttachment.name=$("v37AdminMapName").value.trim()||"Προσωρινό σημείο";renderPointSummary();}};
  }
  function notice(t,e=false){const n=$("v37AdminNotice");n.textContent=t||"";n.style.color=e?"#b42318":"";}
  async function init(){if(!$("v37AdminCompose"))build();try{const [peers,supportPeers,threads,registry]=await Promise.all([rpc("center_peers_v37",{}),rpc("center_support_peers_v381",{}),rpc("center_threads_v37",{}),ds.client.from("vehicle_registry").select("id").eq("is_active",true)]);state.peers=peers||[];state.supportPeers=supportPeers||[];state.threads=threads||[];state.activeVehicleIds=new Set((registry.data||[]).map(v=>String(v.id)));renderPeers();renderThreads();loadPoints();if(state.activeConversation&&state.threads.some(t=>t.conversation_id===state.activeConversation))await openThread(state.activeConversation);else if(!state.activeConversation)openNew(false);}catch(e){notice(e.message,true);}}
  function usablePeers(){const now=Date.now(),seen=new Set();return state.peers.filter(p=>p.vehicle_id&&state.activeVehicleIds.has(String(p.vehicle_id))).filter(p=>p.last_seen_at&&now-new Date(p.last_seen_at).getTime()<=5*60*1000).sort((a,b)=>new Date(b.last_seen_at)-new Date(a.last_seen_at)).filter(p=>{const k=String(p.vehicle_id);if(seen.has(k))return false;seen.add(k);return true;}).sort((a,b)=>String(a.vehicle_name||"").localeCompare(String(b.vehicle_name||""),"el"));}
  function renderPeers(){const peers=usablePeers(),supports=(state.supportPeers||[]).filter(x=>x.request_id);let html="";if(peers.length)html+='<option value="__ALL_ACTIVE_CREWS__">📢 Όλα τα ενεργά πληρώματα</option>';if(peers.length)html+=`<optgroup label="Πληρώματα">${peers.map(p=>`<option value="crew:${p.session_id}">🚒 ${esc(p.vehicle_name||"Πλήρωμα")}</option>`).join("")}</optgroup>`;if(supports.length)html+=`<optgroup label="Υποστήριξη">${supports.map(x=>`<option value="support:${x.request_id}">◆ ${esc(x.full_name||"Υποστήριξη")}${x.support_type?` — ${esc(x.support_type)}`:""}${x.vehicle_info?` / ${esc(x.vehicle_info)}`:""}</option>`).join("")}</optgroup>`;$("v37AdminRecipient").innerHTML=html||'<option value="">Δεν υπάρχουν ενεργές μονάδες</option>';}
  function pairLabel(t){return `${t.endpoint_a_label} ↔ ${t.endpoint_b_label}`;}
  function renderThreads(){const box=$("v37AdminThreads");box.innerHTML=state.threads.length?state.threads.map(t=>`<button class="v37-admin-thread ${state.activeConversation===t.conversation_id?"active":""}" data-thread="${t.conversation_id}" type="button"><div class="v37-admin-thread-top"><strong>${esc(pairLabel(t))}</strong>${Number(t.unread_count)>0?`<span class="v37-admin-unread">${t.unread_count}</span>`:""}</div><p>${esc(t.last_message||"")}</p></button>`).join(""):'<p>Δεν υπάρχουν ακόμη συνομιλίες.</p>';box.querySelectorAll("[data-thread]").forEach(b=>b.onclick=()=>openThread(b.dataset.thread));}
  function openNew(show=true){state.activeConversation=null;state.activeThread=null;renderThreads();$("v37AdminChatWrap").classList.remove("hidden");$("v37AdminChatTitle").textContent="Νέο μήνυμα";$("v382ChatSub").textContent="Επίλεξε παραλήπτη και γράψε μήνυμα.";$("v37AdminChat").innerHTML="";$("v37AdminReadonly").classList.add("hidden");$("v382Delete").classList.add("hidden");$("v382RecipientLabel").classList.remove("hidden");$("v37AdminCompose").classList.remove("hidden");if(show)$("v37AdminBody").focus();}
  async function openThread(id){const t=state.threads.find(x=>x.conversation_id===id);if(!t)return;state.activeConversation=id;state.activeThread=t;renderThreads();$("v37AdminChatWrap").classList.remove("hidden");$("v37AdminChatTitle").textContent=pairLabel(t);$("v382ChatSub").textContent="Ιστορικό και νέα μηνύματα στην ίδια συνομιλία";$("v382Delete").classList.remove("hidden");const centerParticipant=(t.endpoint_a_type==="center"&&t.endpoint_a_id==="main")||(t.endpoint_b_type==="center"&&t.endpoint_b_id==="main");$("v37AdminReadonly").classList.toggle("hidden",centerParticipant);$("v37AdminCompose").classList.toggle("hidden",!centerParticipant);$("v382RecipientLabel").classList.add("hidden");try{const rows=await rpc("center_thread_messages_v37",{p_conversation_id:id,p_limit:200})||[];$("v37AdminChat").innerHTML=rows.map(bubble).join("");$("v37AdminChat").scrollTop=$("v37AdminChat").scrollHeight;$("v37AdminChat").querySelectorAll("[data-ack]").forEach(b=>b.onclick=()=>ack(b.dataset.ack));}catch(e){notice(e.message,true);}}
  function bubble(m){const mine=m.sender_type==="center",nav=m.latitude!=null&&m.longitude!=null?`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${esc(m.point_name||"Πλοήγηση")}</a>`:"",ack=m.priority==="urgent"&&!mine&&!m.acknowledged_at?`<button data-ack="${m.id}" type="button">✓ Επιβεβαίωση λήψης</button>`:"";return `<article class="v37-admin-bubble ${mine?"mine":""} ${m.priority==="urgent"?"urgent":""}"><strong>${esc(m.sender_label)}</strong><div>${esc(m.body)}</div>${nav}${ack}<small>${new Date(m.created_at).toLocaleString("el-GR")}${m.acknowledged_at?" · ✓ Επιβεβαιώθηκε":""}</small></article>`;}
  async function ack(id){await rpc("ack_message_center_v37",{p_message_id:id});if(state.activeConversation)openThread(state.activeConversation);}
  function recipientForThread(t){if(!t)return null;const peer=t.endpoint_a_type==="center"?{type:t.endpoint_b_type,id:t.endpoint_b_id}:{type:t.endpoint_a_type,id:t.endpoint_a_id};if(peer.type==="support")return `support:${peer.id}`;if(peer.type==="crew"){const p=usablePeers().find(x=>String(x.vehicle_id||x.session_id)===String(peer.id));return p?`crew:${p.session_id}`:null;}return null;}
  async function send(e){e.preventDefault();let recipient=state.activeThread?recipientForThread(state.activeThread):$("v37AdminRecipient").value;const body=$("v37AdminBody").value.trim();if(!body)return;if(!recipient){notice("Η μονάδα δεν είναι ενεργή αυτή τη στιγμή, οπότε δεν μπορεί να σταλεί νέο μήνυμα.",true);return;}const payload=sessionId=>({p_recipient_session_id:sessionId,p_body:body,p_priority:$("v37AdminPriority").value,p_point_name:state.pointAttachment?.name||null,p_latitude:state.pointAttachment?.latitude??null,p_longitude:state.pointAttachment?.longitude??null});try{const broadcast=recipient==="__ALL_ACTIVE_CREWS__",peers=broadcast?usablePeers():[];if(broadcast&&!peers.length){notice("Δεν υπάρχουν ενεργά πληρώματα.",true);return;}if(broadcast)await Promise.all(peers.map(p=>rpc("send_center_message_v37",payload(p.session_id))));else if(recipient.startsWith("support:"))await rpc("send_center_support_message_v381",{p_request_id:recipient.slice(8),p_body:body,p_priority:$("v37AdminPriority").value,p_point_name:state.pointAttachment?.name||null,p_latitude:state.pointAttachment?.latitude??null,p_longitude:state.pointAttachment?.longitude??null});else await rpc("send_center_message_v37",payload(recipient.slice(5)));$("v37AdminBody").value="";state.pointAttachment=null;$("v37AdminPointMode").value="none";renderPointMode();const old=state.activeConversation;await init();if(old)await openThread(old);notice("✓ Το μήνυμα στάλθηκε.");setTimeout(()=>notice(""),2500);}catch(err){notice(err.message,true);}}
  async function deleteConversation(){if(!state.activeConversation)return;if(!confirm("Να διαγραφεί ολόκληρη η συνομιλία και όλα τα μηνύματά της; Η ενέργεια δεν αναιρείται."))return;try{await rpc("delete_operational_conversation_v382",{p_conversation_id:state.activeConversation});state.activeConversation=null;state.activeThread=null;await init();openNew(false);notice("✓ Η συνομιλία διαγράφηκε.");}catch(e){notice(e.message,true);}}
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