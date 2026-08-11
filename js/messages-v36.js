(() => {
  "use strict";
  const ds=window.DataService;if(!ds?.client)return;
  const $=id=>document.getElementById(id),esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  let access={mode:"public"},timer=null,currentRows=[],pointAttachment=null;
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
          <div class="fwm-point-attachment"><span id="fwmPointAttachmentLabel">Χωρίς σημείο χάρτη</span><button id="fwmAttachLocation" type="button" class="action-button">📍 Η θέση μου</button><button id="fwmClearAttachment" type="button" class="action-button ghost hidden">× Αφαίρεση</button></div>
          <button class="action-button primary full" type="submit">Αποστολή</button>
        </form>
        <div class="fwm-message-toolbar"><strong>Συνομιλία</strong><button id="fwmMessagesRefresh" class="action-button" type="button">↻</button></div>
        <div id="fwmMessagesList" class="fwm-message-list"></div>
      </section></div>`);
    $("fwmMessagesButton").onclick=()=>open();$("fwmMessagesClose").onclick=close;$("fwmMessagesModal").onclick=e=>{if(e.target===$("fwmMessagesModal"))close();};$("fwmMessagesRefresh").onclick=load;
    $("fwmAttachLocation").onclick=attachLocation;$("fwmClearAttachment").onclick=()=>setAttachment(null);
    $("fwmMessageForm").onsubmit=send;
  }
  function visible(){const support=!!getSupport(),crew=["crew","admin"].includes(access.mode)&&!!getSession()&&!!getCode();return support||crew;}
  function renderVisibility(){const b=$("fwmMessagesButton");if(!b)return;b.classList.toggle("hidden",!visible());if(!visible())close();}
  function open(){if(!visible())return;$("fwmMessagesModal").classList.remove("hidden");document.body.classList.add("modal-open");load();clearInterval(timer);timer=setInterval(load,8000);}
  function close(){$("fwmMessagesModal")?.classList.add("hidden");document.body.classList.remove("modal-open");clearInterval(timer);timer=null;}
  function setNotice(t,error=false){const e=$("fwmMessageNotice");e.textContent=t||"";e.classList.toggle("error",error);}
  function setAttachment(a){pointAttachment=a;$("fwmPointAttachmentLabel").textContent=a?`📍 ${a.name}`:"Χωρίς σημείο χάρτη";$("fwmClearAttachment").classList.toggle("hidden",!a);}
  function attachLocation(){if(!navigator.geolocation){setNotice("Η συσκευή δεν υποστηρίζει GPS.",true);return;}setNotice("Λήψη θέσης…");navigator.geolocation.getCurrentPosition(p=>{setAttachment({name:"Τρέχουσα θέση αποστολέα",latitude:p.coords.latitude,longitude:p.coords.longitude});setNotice("");},e=>setNotice("Δεν ήταν δυνατή η λήψη θέσης.",true),{enableHighAccuracy:true,timeout:15000,maximumAge:5000});}
  function time(v){return new Date(v).toLocaleTimeString("el-GR",{hour:"2-digit",minute:"2-digit"});}
  function nav(m){return m.latitude!=null&&m.longitude!=null?`<a class="fwm-message-map" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${esc(m.point_name||"Πλοήγηση")}</a>`:"";}
  async function load(){if(!visible())return;try{let rows=[],targets={};if(getSupport()){
      rows=await rpc("list_messages_support_v36",{p_access_token:getSupport(),p_limit:100})||[];$("fwmMessagesContext").textContent="Υποστήριξη ↔ Κέντρο";$("fwmRecipientWrap").classList.add("hidden");
    }else{
      rows=await rpc("list_messages_crew_v36",{p_code:getCode(),p_session_id:getSession(),p_limit:100})||[];targets=await rpc("message_targets_crew_v36",{p_code:getCode(),p_session_id:getSession()})||{};$("fwmMessagesContext").textContent=`${localStorage.getItem("fwm-operation-name")||"Επιχείρηση"} · ${localStorage.getItem("fwm-crew-name")||"Πλήρωμα"}`;$("fwmRecipientWrap").classList.remove("hidden");
      const sel=$("fwmMessageRecipient"),old=sel.value;sel.innerHTML='<option value="center">Κέντρο</option><option value="all_crews">Όλα τα πληρώματα</option>'+((targets.crews||[]).map(x=>`<option value="crew:${x.session_id}">${esc(String(x.label||"Όχημα").split(" · ")[0])}</option>`).join(""));if([...sel.options].some(o=>o.value===old))sel.value=old;
    }currentRows=rows;render(rows);await markVisible(rows);updateBadge(rows);}catch(e){setNotice(e.message||"Τα μηνύματα δεν είναι διαθέσιμα. Έχει εκτελεστεί το SQL της v3.6;",true);}}
  function render(rows){const box=$("fwmMessagesList");box.innerHTML=rows.length?rows.map(m=>{const mine=!!m.is_mine;const urgent=m.priority==="urgent";return `<article class="fwm-message ${mine?'mine':'received'} ${urgent?'urgent':''}"><div class="fwm-message-head"><strong>${mine?'Εσύ':esc(m.sender_label||m.sender_type)}</strong><span>${urgent?'🚨 ':''}${time(m.created_at)}</span></div><p>${esc(m.body)}</p>${nav(m)}${urgent&&!mine&&!m.is_acknowledged?`<button class="action-button danger-button fwm-ack" data-ack="${m.id}" type="button">✓ Επιβεβαίωση λήψης</button>`:""}${urgent&&m.is_acknowledged?'<small class="fwm-ack-ok">✓ Επιβεβαιώθηκε</small>':''}</article>`;}).join(""):'<p class="empty-table">Δεν υπάρχουν ακόμη μηνύματα.</p>';box.querySelectorAll("[data-ack]").forEach(b=>b.onclick=()=>ack(b.dataset.ack));}
  async function markVisible(rows){for(const m of rows.filter(x=>!x.is_mine&&!x.is_read).slice(0,20)){try{if(getSupport())await rpc("mark_message_support_v36",{p_access_token:getSupport(),p_message_id:m.id,p_ack:false});else await rpc("mark_message_crew_v36",{p_message_id:m.id,p_session_id:getSession(),p_ack:false});}catch{}}}
  async function ack(id){try{if(getSupport())await rpc("mark_message_support_v36",{p_access_token:getSupport(),p_message_id:id,p_ack:true});else await rpc("mark_message_crew_v36",{p_message_id:id,p_session_id:getSession(),p_ack:true});await load();}catch(e){setNotice(e.message,true);}}
  function updateBadge(rows){const n=rows.filter(x=>!x.is_mine&&!x.is_read).length,b=$("fwmMessageBadge");b.textContent=n;b.classList.toggle("hidden",!n);}
  async function send(e){e.preventDefault();const body=$("fwmMessageBody").value.trim();if(!body)return;setNotice("Αποστολή…");try{if(getSupport())await rpc("send_message_support_v36",{p_access_token:getSupport(),p_body:body,p_priority:$("fwmMessagePriority").value});else{const v=$("fwmMessageRecipient").value;let type=v,sid=null;if(v.startsWith("crew:")){type="crew";sid=v.slice(5);}await rpc("send_message_crew_v36",{p_code:getCode(),p_session_id:getSession(),p_recipient_type:type,p_recipient_session_id:sid,p_priority:$("fwmMessagePriority").value,p_body:body,p_point_name:pointAttachment?.name||null,p_latitude:pointAttachment?.latitude??null,p_longitude:pointAttachment?.longitude??null});}$("fwmMessageBody").value="";setAttachment(null);setNotice("");await load();}catch(err){setNotice(err.message||"Η αποστολή απέτυχε.",true);}}
  async function refreshAccess(e){access=e?.detail||await ds.currentAccess();renderVisibility();}
  inject();window.addEventListener("fwm-access-changed",refreshAccess);refreshAccess();setInterval(()=>{if(visible()&&!$("fwmMessagesModal").classList.contains("hidden"))load();},15000);
})();