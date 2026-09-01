(() => {
  "use strict";
  const ds=window.DataService,$=id=>document.getElementById(id);
  if(!ds?.client||!$("supportRequestsList"))return;
  let profile=null,rows=[],rooms=[],points=[],pollTimer=null,knownPending=null;
  const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  const statusLabel=s=>({pending:"Εκκρεμεί",approved:"Εγκεκριμένο",rejected:"Απορρίφθηκε",revoked:"Ανακλήθηκε",expired:"Έληξε"}[s]||s);

  window.addEventListener("admin-dashboard-ready",e=>{
    profile=e.detail.profile;
    if(profile?.role==="admin"){load();clearInterval(pollTimer);pollTimer=setInterval(()=>load(true),10000);}
  });
  document.querySelector('[data-view="operations"]')?.addEventListener("click",()=>profile?.role==="admin"&&load());
  document.querySelector('[data-vehicle-tab="support"]')?.addEventListener("click",()=>load());
  $("refreshSupportRequests")?.addEventListener("click",()=>load());
  $("supportAdminSearch")?.addEventListener("input",render);
  $("supportAdminFilter")?.addEventListener("change",render);
  $("supportSidebarButton")?.addEventListener("click",()=>{
    document.querySelector('[data-view="operations"]')?.click();
    document.querySelector('[data-vehicle-tab="support"]')?.click();
    document.querySelectorAll(".nav-item").forEach(n=>n.classList.remove("active"));
    $("supportSidebarButton")?.classList.add("active");
    if($("viewTitle"))$("viewTitle").textContent="Υποστήριξη";
    if($("viewSubtitle"))$("viewSubtitle").textContent="Αιτήματα προσωρινής επιχειρησιακής υποστήριξης και live GPS";
  });

  function setBadges(n){
    ["supportPendingBadge","supportSidebarBadge"].forEach(id=>{
      const b=$(id);if(!b)return;b.textContent=n;b.classList.toggle("hidden",!n);
    });
  }
  function beep(){
    try{
      const A=window.AudioContext||window.webkitAudioContext;if(!A)return;
      const c=new A(),o=c.createOscillator(),g=c.createGain();
      o.frequency.value=720;g.gain.setValueAtTime(.0001,c.currentTime);g.gain.exponentialRampToValueAtTime(.11,c.currentTime+.02);g.gain.exponentialRampToValueAtTime(.0001,c.currentTime+.32);
      o.connect(g).connect(c.destination);o.start();o.stop(c.currentTime+.34);o.onended=()=>c.close();
    }catch{}
  }
  function toast(r){
    let box=$("supportRequestToast");
    if(!box){box=document.createElement("button");box.id="supportRequestToast";box.type="button";box.className="support-request-toast";document.body.appendChild(box);}
    box.innerHTML=`<strong>🆘 Νέο αίτημα υποστήριξης</strong><span>${esc(r.full_name)} · ${esc(r.support_type)}${r.vehicle_info?` · ${esc(r.vehicle_info)}`:""}</span><small>Πάτησε για προβολή</small>`;
    box.classList.add("show");box.onclick=()=>{$("supportSidebarButton")?.click();box.classList.remove("show");};
    setTimeout(()=>box.classList.remove("show"),9000);beep();
    if("Notification" in window&&Notification.permission==="granted"){
      try{new Notification("🆘 Νέο αίτημα υποστήριξης",{body:`${r.full_name} · ${r.support_type}${r.vehicle_info?` · ${r.vehicle_info}`:""}`,tag:"fwm-support-request"});}catch{}
    }
  }

  async function load(silent=false){
    if(profile?.role!=="admin")return;
    const [rq,rr,pp]=await Promise.all([
      ds.client.from("support_requests_v35").select("*").order("created_at",{ascending:false}),
      ds.client.from("operation_rooms").select("id,name,is_active").eq("is_active",true).order("created_at",{ascending:false}),
      ds.client.from("water_points").select("id,name,latitude,longitude,publication_status").eq("publication_status","published").order("name")
    ]);
    if(rq.error){if(!silent)$("supportRequestsList").innerHTML=`<p class="form-message error">${esc(rq.error.message)}</p>`;return;}
    rows=rq.data||[];rooms=rr.data||[];points=pp.data||[];
    const pendingRows=rows.filter(x=>x.status==="pending"),ids=new Set(pendingRows.map(x=>String(x.id)));
    setBadges(pendingRows.length);
    if(knownPending!==null){
      const fresh=pendingRows.find(x=>!knownPending.has(String(x.id)));
      if(fresh)toast(fresh);
    }
    knownPending=ids;
    render();
  }

  function age(v){const s=Math.max(0,(Date.now()-new Date(v).getTime())/1000);return s<60?`πριν ${Math.round(s)}΄΄`:`πριν ${Math.round(s/60)}΄`;}
  function render(){
    const q=$("supportAdminSearch").value.trim().toLocaleLowerCase("el"),f=$("supportAdminFilter").value;
    const filtered=rows.filter(r=>(!f||r.status===f)&&(!q||`${r.full_name} ${r.phone} ${r.vehicle_info||""} ${r.support_type}`.toLocaleLowerCase("el").includes(q)));
    $("supportRequestsList").innerHTML=filtered.length?filtered.map(card).join(""):'<p class="empty-table">Δεν υπάρχουν αιτήματα.</p>';bind();
  }
  function card(r){
    const live=r.last_seen_at&&Date.now()-new Date(r.last_seen_at).getTime()<120000;
    const roomOpts=rooms.map(x=>`<option value="${x.id}" ${x.id===r.room_id?'selected':''}>${esc(x.name)}</option>`).join("");
    const pointOpts='<option value="">Χωρίς ανάθεση σημείου</option>'+points.map(x=>`<option value="${x.id}" ${x.id===r.assigned_point_id?'selected':''}>${esc(x.name)}</option>`).join("");
    const mapLink=r.latitude!=null&&r.longitude!=null?`https://www.google.com/maps?q=${r.latitude},${r.longitude}`:"";
    return `<article class="support-admin-card ${r.status}">
      <div class="support-admin-head">
        <div><h3>${r.status==="pending"?"🆘 ":"◆ "}${esc(r.full_name)}</h3><p><strong>${esc(r.support_type)}</strong>${r.vehicle_info?` · ${esc(r.vehicle_info)}`:""}</p><small>📞 ${esc(r.phone)} · ${age(r.created_at)}</small></div>
        <span class="publication-status ${r.status==='approved'?'published':r.status==='pending'?'pending':'hidden'}">${esc(statusLabel(r.status))}</span>
      </div>
      ${r.notes?`<p class="support-notes">${esc(r.notes)}</p>`:""}
      ${r.status==='pending'?`<div class="support-approval-row"><select data-support-room="${r.id}"><option value="">Επιλογή επιχείρησης…</option>${roomOpts}</select><button class="action-button primary" data-support-approve="${r.id}" type="button">✓ Έγκριση</button><button class="action-button" data-support-reject="${r.id}" type="button">✕ Απόρριψη</button></div>`:""}
      ${r.status==='approved'?`<div class="support-live-summary"><span class="${live?'crew-online':'crew-offline'}">● ${live?'Live GPS':'Χωρίς πρόσφατο GPS'}</span><span>${r.accuracy_m!=null?`GPS ±${Math.round(r.accuracy_m)} m`:"Αναμονή GPS"}</span><span>${r.speed_mps!=null?`${Math.round(r.speed_mps*3.6)} km/h`:""}</span>${mapLink?`<a target="_blank" rel="noopener" href="${mapLink}">📍 Προβολή θέσης</a>`:""}</div><div class="support-approval-row"><select data-support-point="${r.id}">${pointOpts}</select><input data-support-note="${r.id}" value="${esc(r.assignment_note||"")}" placeholder="Σημείωση προς υποστήριξη"><button class="action-button" data-support-assign="${r.id}" type="button">Ανάθεση</button><button class="action-button danger-button" data-support-revoke="${r.id}" type="button">Ανάκληση</button></div>`:""}
    </article>`;
  }
  function bind(){
    document.querySelectorAll("[data-support-approve]").forEach(b=>b.onclick=async()=>{
      const id=b.dataset.supportApprove,room=document.querySelector(`[data-support-room="${id}"]`)?.value;
      if(!room){alert("Επίλεξε πρώτα ενεργή επιχείρηση.");return;}
      const{error}=await ds.client.rpc("approve_support_request_v35",{p_request_id:id,p_room_id:room});
      if(error)alert(error.message);else{window.AuditLog?.write("approve","support_request",id,"Έγκριση προσωρινής υποστήριξης");load();}
    });
    document.querySelectorAll("[data-support-reject]").forEach(b=>b.onclick=async()=>{const{error}=await ds.client.rpc("reject_support_request_v35",{p_request_id:b.dataset.supportReject});if(error)alert(error.message);else load();});
    document.querySelectorAll("[data-support-revoke]").forEach(b=>b.onclick=async()=>{if(!confirm("Να ανακληθεί αμέσως η προσωρινή πρόσβαση;"))return;const{error}=await ds.client.rpc("revoke_support_access_v35",{p_request_id:b.dataset.supportRevoke});if(error)alert(error.message);else load();});
    document.querySelectorAll("[data-support-assign]").forEach(b=>b.onclick=async()=>{const id=b.dataset.supportAssign,point=document.querySelector(`[data-support-point="${id}"]`)?.value||null,note=document.querySelector(`[data-support-note="${id}"]`)?.value||null;const{error}=await ds.client.rpc("assign_support_point_v35",{p_request_id:id,p_point_id:point||null,p_note:note||null});if(error)alert(error.message);else load();});
  }
})();