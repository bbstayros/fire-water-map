(() => {
  "use strict";
  const ds=window.DataService,$=id=>document.getElementById(id);if(!ds?.client)return;
  const modal=$("supportRequestModal"),statusModal=$("supportStatusModal");
  let watchId=null,pollTimer=null,sending=false;
  let requestId=localStorage.getItem("fwm-support-request-id")||"";
  let requestToken=localStorage.getItem("fwm-support-request-token")||"";
  let accessToken=localStorage.getItem("fwm-support-access-token")||"";
  let approved=false;
  const rpc=async(n,p)=>{const{data,error}=await ds.client.rpc(n,p);if(error)throw error;return Array.isArray(data)?(data[0]||null):data;};
  function open(el){el?.classList.remove("hidden");document.body.classList.add("modal-open");}
  function close(el){el?.classList.add("hidden");document.body.classList.remove("modal-open");}
  function panel(name){$("supportRequestForm")?.classList.toggle("hidden",name!=="form");$("supportWaitingPanel")?.classList.toggle("hidden",name!=="waiting");$("supportApprovedPanel")?.classList.toggle("hidden",name!=="approved");}
  function clearLocal(){removeSupportMessaging();requestId=requestToken=accessToken="";["fwm-support-request-id","fwm-support-request-token","fwm-support-access-token"].forEach(k=>localStorage.removeItem(k));approved=false;stopGps();$("supportActiveBar")?.classList.add("hidden");panel("form");}
  async function status(){if(!requestId||!requestToken)return null;try{const s=await rpc("support_request_status_v35",{p_request_id:requestId,p_request_token:requestToken});if(!s)return null;if(s.status==="approved"&&s.access_token){accessToken=s.access_token;approved=true;localStorage.setItem("fwm-support-access-token",accessToken);panel("approved");$("supportWaitingText").textContent=`Εγκρίθηκε για ${s.room_name||"ενεργή επιχείρηση"}.`;if(localStorage.getItem("fwm-support-gps-active")==="1")activate();}else if(s.status==="rejected"||s.status==="revoked"||s.status==="expired"){clearLocal();alert(s.status==="rejected"?"Το αίτημα υποστήριξης απορρίφθηκε.":"Η προσωρινή πρόσβαση έληξε ή ανακλήθηκε.");}else{panel("waiting");}return s;}catch(e){console.warn(e);return null;}}
  $("menuSupportButton")?.addEventListener("click",async()=>{if(accessToken){open(statusModal);return;}open(modal);if(requestId){panel("waiting");await status();}else panel("form");});
  $("closeSupportRequest")?.addEventListener("click",()=>close(modal));$("closeSupportStatus")?.addEventListener("click",()=>close(statusModal));$("openSupportStatus")?.addEventListener("click",()=>open(statusModal));
  $("supportRequestForm")?.addEventListener("submit",async e=>{e.preventDefault();const m=$("supportRequestMessage");m.textContent="Αποστολή…";m.classList.remove("error");try{const r=await rpc("submit_support_request_v35",{p_full_name:$("supportName").value.trim(),p_phone:$("supportPhone").value.trim(),p_support_type:$("supportType").value,p_vehicle_info:$("supportVehicle").value.trim()||null,p_notes:$("supportNotes").value.trim()||null});requestId=r.request_id;requestToken=r.request_token;localStorage.setItem("fwm-support-request-id",requestId);localStorage.setItem("fwm-support-request-token",requestToken);panel("waiting");startPolling();}catch(err){m.textContent=err.message||"Η αποστολή απέτυχε.";m.classList.add("error");}});
  $("cancelSupportRequest")?.addEventListener("click",async()=>{if(!confirm("Να ακυρωθεί το αίτημα;"))return;try{await rpc("cancel_support_request_v35",{p_request_id:requestId,p_request_token:requestToken});}catch{}clearLocal();close(modal);});
  $("activateSupportAccess")?.addEventListener("click",()=>{localStorage.setItem("fwm-support-gps-active","1");activate();close(modal);open(statusModal);});
  function startPolling(){clearInterval(pollTimer);pollTimer=setInterval(status,8000);status();}
  function activate(){if(!accessToken)return;$("supportActiveBar")?.classList.remove("hidden");$("supportActiveLabel").textContent="Live GPS προς το Κέντρο";startGps();startPolling();loadAssignment();ensureSupportMessaging();}
  function startGps(){if(watchId!==null||!navigator.geolocation)return;$("supportGpsState").textContent="Αναζήτηση…";watchId=navigator.geolocation.watchPosition(pos=>{const a=Math.round(pos.coords.accuracy||0);$("supportAccuracy").textContent=`±${a} m`;$("supportGpsState").textContent=a>100?"Χαμηλή ακρίβεια":"Live";send(pos);},()=>{$("supportGpsState").textContent="Σφάλμα GPS";},{enableHighAccuracy:true,maximumAge:3000,timeout:20000});}
  function stopGps(){if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;localStorage.removeItem("fwm-support-gps-active");}
  async function send(pos){if(sending||!navigator.onLine||!accessToken)return;sending=true;try{await rpc("update_support_position_v35",{p_access_token:accessToken,p_latitude:pos.coords.latitude,p_longitude:pos.coords.longitude,p_accuracy_m:pos.coords.accuracy,p_speed_mps:Number.isFinite(pos.coords.speed)?pos.coords.speed:null,p_heading_deg:Number.isFinite(pos.coords.heading)?pos.coords.heading:null});$("supportLastSent").textContent="τώρα";loadAssignment();}catch(e){if(String(e.message).includes("SUPPORT_ACCESS_INVALID")){clearLocal();alert("Η προσωρινή πρόσβαση έληξε ή ανακλήθηκε.");}}finally{sending=false;}}
  async function loadAssignment(){if(!accessToken)return;try{const a=await rpc("support_assignment_v35",{p_access_token:accessToken});const box=$("supportAssignment");if(a?.point_id){box.classList.remove("hidden");box.innerHTML=`<strong>📍 Προορισμός από το Κέντρο</strong><p>${escapeHtml(a.point_name||"Σημείο")}</p>${a.note?`<small>${escapeHtml(a.note)}</small>`:""}<a class="navigate-button" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${a.latitude},${a.longitude}">🧭 Πλοήγηση</a>`;}else box.classList.add("hidden");}catch(e){console.warn(e);}}
  function escapeHtml(v){return String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));}

  // v3.8.1 — Support <-> Center messaging
  let supportMsgTimer=null;
  function ensureSupportMessaging(){
    if(!approved||!accessToken)return;
    let fab=$("supportMessageFabV381"),drawer=$("supportMessagingV381");
    if(!fab){
      fab=document.createElement("button");fab.id="supportMessageFabV381";fab.type="button";fab.className="support-message-fab";fab.textContent="💬 Κέντρο";document.body.appendChild(fab);
      drawer=document.createElement("section");drawer.id="supportMessagingV381";drawer.className="support-message-drawer hidden";
      drawer.innerHTML=`<div class="support-message-head"><strong>💬 Επικοινωνία με Κέντρο</strong><button type="button" data-close>×</button></div><div class="support-message-list" data-list><p>Δεν υπάρχουν μηνύματα ακόμα.</p></div><form data-form><textarea data-body rows="3" maxlength="1000" placeholder="Γράψε μήνυμα προς το Κέντρο…" required></textarea><button type="submit">Αποστολή</button></form>`;document.body.appendChild(drawer);
      fab.onclick=()=>{drawer.classList.remove("hidden");loadSupportMessages();};drawer.querySelector("[data-close]").onclick=()=>drawer.classList.add("hidden");drawer.querySelector("[data-form]").onsubmit=sendSupportMessage;
    }
    if(!supportMsgTimer)supportMsgTimer=setInterval(loadSupportMessages,5000);
    loadSupportMessages();
  }
  function removeSupportMessaging(){clearInterval(supportMsgTimer);supportMsgTimer=null;$("supportMessageFabV381")?.remove();$("supportMessagingV381")?.remove();}
  async function loadSupportMessages(){
    const drawer=$("supportMessagingV381");if(!drawer||!accessToken)return;
    try{const rows=await rpc("support_messages_v381",{p_access_token:accessToken,p_limit:200})||[];const list=drawer.querySelector("[data-list]");list.innerHTML=rows.length?rows.map(m=>`<div class="support-msg ${m.sender_type==="support"?"mine":"theirs"}"><strong>${escapeHtml(m.sender_label||"")}</strong><span>${escapeHtml(m.body||"")}</span>${m.latitude!=null&&m.longitude!=null?`<a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${m.latitude},${m.longitude}">📍 ${escapeHtml(m.point_name||"Πλοήγηση")}</a>`:""}<small>${new Date(m.created_at).toLocaleString("el-GR")}</small></div>`).join(""):"<p>Δεν υπάρχουν μηνύματα ακόμα.</p>";list.scrollTop=list.scrollHeight;}catch(e){console.warn("support messages",e);}
  }
  async function sendSupportMessage(e){e.preventDefault();const drawer=$("supportMessagingV381"),ta=drawer?.querySelector("[data-body]");if(!ta?.value.trim()||!accessToken)return;try{await rpc("send_support_center_message_v381",{p_access_token:accessToken,p_body:ta.value.trim(),p_priority:"normal"});ta.value="";loadSupportMessages();}catch(err){alert(err.message||"Η αποστολή απέτυχε.");}}
  if(requestId)startPolling();if(accessToken){approved=true;activate();}
})();