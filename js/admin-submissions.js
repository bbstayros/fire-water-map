(() => {
  "use strict";
  const ds = window.DataService;
  let profile = null;
  let submissions = [];
  let codes = [];
  let codeFilter = "active";
  let codeSearch = "";
  const revealedCodes = new Map(Object.entries(JSON.parse(sessionStorage.getItem("fwm-new-codes") || "{}")));
  const labels = {hydrant:"Κρουνός",tank:"Δεξαμενή",water_source:"Υδροληψία"};
  const conditions = {available:"Λειτουργικό",unknown:"Άγνωστη",unavailable:"Εκτός λειτουργίας"};
  const esc = (v) => String(v ?? "").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));

  window.addEventListener("admin-dashboard-ready", async (event) => {
    profile = event.detail.profile;
    await loadSubmissions();
    if (profile.role === "admin") await loadCodes();
  });
  document.querySelector('[data-view="submissions"]').addEventListener("click", loadSubmissions);
  document.querySelector('[data-view="codes"]').addEventListener("click", () => profile?.role === "admin" && loadCodes());
  document.getElementById("refreshSubmissionsButton").addEventListener("click", loadSubmissions);
  document.getElementById("refreshCodesButton").addEventListener("click", loadCodes);
  document.getElementById("submissionSearch").addEventListener("input", renderSubmissions);
  document.getElementById("submissionStatusFilter").addEventListener("change", renderSubmissions);
  document.getElementById("codeSearch")?.addEventListener("input", event => { codeSearch = event.target.value.trim().toLocaleLowerCase("el"); renderCodes(); });
  document.getElementById("copyNewCode")?.addEventListener("click", async () => { const value=document.getElementById("newCodeValue").textContent; if(value){ await navigator.clipboard.writeText(value); document.getElementById("copyNewCode").textContent="Αντιγράφηκε"; setTimeout(()=>document.getElementById("copyNewCode").textContent="Αντιγραφή",1400); } });

  async function loadSubmissions() {
    try {
      const { data, error } = await ds.client.from("public_water_submissions").select("*").order("created_at", {ascending:false});
      if (error) throw error;
      submissions = data || [];
      const pending = submissions.filter(x=>x.status === "pending").length;
      const badge = document.getElementById("pendingSubmissionBadge");
      badge.textContent = pending; badge.classList.toggle("hidden", pending === 0);
      renderSubmissions();
    } catch (e) { console.error(e); document.getElementById("submissionAdminList").innerHTML = `<p class="form-message error">${esc(e.message)}</p>`; }
  }
  function renderSubmissions() {
    const q = document.getElementById("submissionSearch").value.trim().toLocaleLowerCase("el");
    const status = document.getElementById("submissionStatusFilter").value;
    const rows = submissions.filter(x=>(!status||x.status===status)&&(!q||`${x.name} ${x.notes||""} ${x.code_label||""}`.toLocaleLowerCase("el").includes(q)));
    document.getElementById("submissionAdminList").innerHTML = rows.length ? rows.map(x=>`
      <article class="submission-card ${x.status}">
        <div class="submission-card-head"><div><span class="submission-kind">${labels[x.category]||x.category}</span><h3>${esc(x.name)}</h3></div><span class="submission-state ${x.status}">${statusLabel(x.status)}</span></div>
        <div class="submission-meta"><span>📍 ${Number(x.latitude).toFixed(6)}, ${Number(x.longitude).toFixed(6)}</span><span>🎯 ±${Math.round(x.accuracy_m||0)} m</span><span>🕒 ${new Date(x.created_at).toLocaleString("el-GR")}</span><span>🔑 ${esc(x.code_label||"—")}</span></div>
        <p>${esc(x.notes||"Δεν υπάρχουν παρατηρήσεις.")}</p>
        <div class="submission-actions">
          <a class="action-button" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${x.latitude},${x.longitude}">Χάρτης</a>
          ${x.status === "pending" ? `<button class="action-button" data-approve-pending="${x.id}">Έγκριση ως εκκρεμές</button><button class="action-button primary" data-approve-publish="${x.id}">Έγκριση & δημοσίευση</button><button class="action-button danger-button" data-reject="${x.id}">Απόρριψη</button>` : ""}
        </div>
      </article>`).join("") : '<p class="empty-table">Δεν υπάρχουν υποβολές με αυτά τα φίλτρα.</p>';
    document.querySelectorAll("[data-approve-pending]").forEach(b=>b.onclick=()=>approve(b.dataset.approvePending,"pending"));
    document.querySelectorAll("[data-approve-publish]").forEach(b=>b.onclick=()=>approve(b.dataset.approvePublish,"published"));
    document.querySelectorAll("[data-reject]").forEach(b=>b.onclick=()=>reject(b.dataset.reject));
  }
  async function approve(id, publication) {
    const s = submissions.find(x=>x.id===id); if(!s)return;
    if(!confirm(`Να εγκριθεί η υποβολή «${s.name}»;`))return;
    try {
      await ds.savePoint({name:s.name,category:s.category,condition:s.condition,publication_status:publication,last_checked_at:new Date().toISOString().slice(0,10),latitude:s.latitude,longitude:s.longitude,notes:s.notes||`Υποβολή κινητού · ακρίβεια ±${Math.round(s.accuracy_m||0)} m`});
      const {error}=await ds.client.from("public_water_submissions").update({status:"approved",reviewed_at:new Date().toISOString(),reviewed_by:(await ds.client.auth.getUser()).data.user.id}).eq("id",id); if(error)throw error;
      window.AuditLog?.write("approve","submission",id,`Έγκριση υποβολής «${s.name}»`,{publication});
      await loadSubmissions();
    } catch(e){alert(e.message||"Η έγκριση απέτυχε.");}
  }
  async function reject(id) {
    const reason=prompt("Προαιρετικός λόγος απόρριψης:",""); if(reason===null)return;
    const {data:{user}}=await ds.client.auth.getUser();
    const {error}=await ds.client.from("public_water_submissions").update({status:"rejected",review_notes:reason||null,reviewed_at:new Date().toISOString(),reviewed_by:user.id}).eq("id",id);
    if(error)alert(error.message); else { window.AuditLog?.write("update","submission",id,"Απόρριψη δημόσιας υποβολής",{reason}); loadSubmissions(); }
  }
  function statusLabel(s){return {pending:"Εκκρεμής",approved:"Εγκεκριμένη",rejected:"Απορριφθείσα"}[s]||s;}

  document.getElementById("verificationCodeForm").addEventListener("submit", async (event)=>{
    event.preventDefault(); const out=document.getElementById("verificationCodeMessage"); out.textContent="Δημιουργία…";out.classList.remove("error");
    try {
      const plainCode=document.getElementById("newVerificationCode").value.trim().toUpperCase();
      const label=document.getElementById("newVerificationLabel").value.trim();
      const {data,error}=await ds.client.rpc("create_verification_code_v2",{p_code:plainCode,p_label:label,p_max_uses:Number(document.getElementById("newVerificationMaxUses").value)||null,p_expires_at:document.getElementById("newVerificationExpiry").value||null});
      if(error)throw error;
      const codeId=Array.isArray(data)?data[0]?.id:data?.id||data;
      if(codeId){revealedCodes.set(String(codeId),plainCode);sessionStorage.setItem("fwm-new-codes",JSON.stringify(Object.fromEntries(revealedCodes)));}
      document.getElementById("newCodeValue").textContent=plainCode;document.getElementById("newCodeReveal").classList.remove("hidden");
      event.target.reset(); out.textContent="Ο κωδικός δημιουργήθηκε. Αντέγραψέ τον τώρα — δεν αποθηκεύεται αναστρέψιμα."; window.AuditLog?.write("create","verification_code",codeId||null,`Δημιουργία κωδικού καταχώρησης «${label}»`); await loadCodes();
    } catch(e){out.textContent=e.message||"Η δημιουργία απέτυχε.";out.classList.add("error");}
  });
  async function loadCodes(){
    if(profile?.role!=="admin")return;
    const {data,error}=await ds.client.rpc("list_verification_codes");
    if(error){document.getElementById("verificationCodesList").innerHTML=`<p class="form-message error">${esc(error.message)}</p>`;return;}
    codes=data||[]; renderCodes();
  }
  function renderCodes(){
    const visible=codes.filter(c=>(codeFilter==="all"||(codeFilter==="active"?c.is_active:!c.is_active))&&(!codeSearch||`${c.label||""} ${c.code_hint||""}`.toLocaleLowerCase("el").includes(codeSearch)));
    document.getElementById("verificationCodesList").innerHTML=visible.length?visible.map(c=>{
      const usageLimit=c.max_uses?`${c.use_count} / ${c.max_uses}`:`${c.use_count}`;
      const usagePercent=c.max_uses?Math.min(100,Math.round((c.use_count/c.max_uses)*100)):Math.min(100,c.use_count*5);
      const expiry=c.expires_at?new Date(c.expires_at).toLocaleDateString("el-GR"):"Χωρίς λήξη";
      return `<article class="code-card ${c.is_active?'':'inactive'}">
        <div class="code-card-main">
          <div class="code-card-title"><strong>${esc(c.label)}</strong><span class="publication-status ${c.is_active?'published':'hidden'}">${c.is_active?'Ενεργός':'Ανενεργός'}</span></div><div class="code-secret-row"><code>${revealedCodes.has(String(c.id))?esc(revealedCodes.get(String(c.id))):`••••••${esc(c.code_hint||"")}`}</code>${revealedCodes.has(String(c.id))?`<button class="icon-copy-button" data-copy-code="${c.id}" type="button">Αντιγραφή</button>`:`<small>Για ασφάλεια εμφανίζονται μόνο οι τελευταίοι χαρακτήρες</small>`}</div>
          <div class="code-card-meta"><span>🔢 ${usageLimit} χρήσεις</span><span>📅 ${expiry}</span></div>
          <div class="usage-track"><i style="width:${usagePercent}%"></i></div>
        </div>
        ${c.is_active?`<button class="action-button danger-button compact-danger" data-disable-code="${c.id}">Απενεργοποίηση</button>`:''}
      </article>`;
    }).join(""):'<p class="empty-table">Δεν υπάρχουν κωδικοί σε αυτή την κατηγορία.</p>';
    document.querySelectorAll("[data-copy-code]").forEach(b=>b.onclick=async()=>{await navigator.clipboard.writeText(revealedCodes.get(String(b.dataset.copyCode)));b.textContent="Αντιγράφηκε";setTimeout(()=>b.textContent="Αντιγραφή",1200);});
    document.querySelectorAll("[data-disable-code]").forEach(b=>b.onclick=async()=>{if(!confirm("Να απενεργοποιηθεί ο κωδικός;"))return;const{error}=await ds.client.rpc("deactivate_verification_code",{p_id:b.dataset.disableCode});if(error)alert(error.message);else{window.AuditLog?.write("update","verification_code",b.dataset.disableCode,"Απενεργοποίηση κωδικού καταχώρησης");loadCodes();}});
  }
  document.querySelectorAll("[data-code-filter]").forEach(button=>button.addEventListener("click",()=>{
    codeFilter=button.dataset.codeFilter;
    document.querySelectorAll("[data-code-filter]").forEach(x=>x.classList.toggle("active",x===button));
    renderCodes();
  }));
})();
