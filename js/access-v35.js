(() => {
  "use strict";
  const ds=window.DataService,$=id=>document.getElementById(id);
  if(!ds?.client)return;
  let access={mode:"public",user:null,profile:null};
  const modal=$("crewLoginModal"),menu=$("menuCrewLoginButton"),badge=$("accessBadge"),adminLink=document.querySelector(".admin-panel-link");
  const esc=v=>String(v??"").replace(/[&<>'"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
  function open(){modal?.classList.remove("hidden");document.body.classList.add("modal-open");}
  function close(){modal?.classList.add("hidden");document.body.classList.remove("modal-open");}
  function render(){
    if(!badge||!menu)return;
    badge.className=`access-badge ${access.mode}`;
    if(access.mode==="admin"){badge.textContent="Κέντρο · Admin";menu.innerHTML='<span>👤</span><div><strong>Κέντρο συνδεδεμένο</strong><small>Πλήρης επιχειρησιακή πρόσβαση</small></div>';adminLink?.classList.remove("hidden");}
    else if(access.mode==="crew"){badge.textContent="Πλήρωμα · Editor";menu.innerHTML=`<span>👤</span><div><strong>${esc(access.profile?.full_name||access.user?.email||"Πλήρωμα")}</strong><small>Πλήρωμα συνδεδεμένο · πάτησε για αποσύνδεση</small></div>`;adminLink?.classList.add("hidden");}
    else {badge.textContent="Δημόσια πρόσβαση";menu.innerHTML='<span>👤</span><div><strong>Σύνδεση πληρώματος</strong><small>Πρόσβαση σε επιχειρησιακά και κρυφά σημεία</small></div>';adminLink?.classList.add("hidden");}
    document.body.dataset.accessMode=access.mode;
    window.dispatchEvent(new CustomEvent("fwm-access-changed",{detail:access}));
  }
  async function refresh(){access=await ds.currentAccess();render();return access;}
  menu?.addEventListener("click",async()=>{if(access.mode==="crew"){if(confirm("Να αποσυνδεθεί το πλήρωμα;")){await ds.signOut();await refresh();}return;}if(access.mode==="admin"){window.location.href="admin.html";return;}open();});
  $("closeCrewLogin")?.addEventListener("click",close);modal?.addEventListener("click",e=>{if(e.target===modal)close();});
  $("crewLoginForm")?.addEventListener("submit",async e=>{e.preventDefault();const m=$("crewLoginMessage");m.textContent="Σύνδεση…";m.classList.remove("error");try{await ds.signIn($("crewLoginEmail").value.trim(),$("crewLoginPassword").value);const a=await refresh();if(a.mode==="public"){await ds.signOut();await refresh();throw new Error("Ο λογαριασμός δεν έχει ενεργό ρόλο Πληρώματος ή Κέντρου.");}m.textContent="";close();}catch(err){m.textContent=err.message||"Η σύνδεση απέτυχε.";m.classList.add("error");}});
  ds.onAuthStateChange(()=>setTimeout(refresh,0));
  refresh();
  window.FWMAccess={get:()=>access,refresh};
})();