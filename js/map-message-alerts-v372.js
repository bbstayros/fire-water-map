(() => {
  "use strict";
  const ds=window.DataService;
  if(!ds?.client) return;

  let access={mode:"public"};
  let seen=new Map();
  let audioArmed=false;
  let audioCtx=null;

  const style=document.createElement("style");
  style.textContent=`
    .fwm-msg-toast-stack{position:fixed;right:18px;top:86px;z-index:5000;display:grid;gap:10px;width:min(360px,calc(100vw - 36px))}
    .fwm-msg-toast{background:#fff;border-radius:16px;padding:13px 14px;box-shadow:0 12px 34px #0004;border-left:5px solid #1f8f55;cursor:pointer}
    .fwm-msg-toast.urgent{border-left-color:#b42318;background:#fff5f3}
    .fwm-msg-toast strong{display:block;margin-bottom:4px}
    .fwm-msg-toast small{color:#68747d}
    @media(max-width:720px){.fwm-msg-toast-stack{top:82px;right:12px;width:calc(100vw - 24px)}}
  `;
  document.head.appendChild(style);

  const stack=document.createElement("div");
  stack.className="fwm-msg-toast-stack";
  document.body.appendChild(stack);

  function armAudio(){
    audioArmed=true;
    try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)(); audioCtx.resume?.();}catch{}
  }
  window.addEventListener("pointerdown",armAudio,{once:true});
  window.addEventListener("keydown",armAudio,{once:true});

  function urgentTone(){
    if(!audioArmed) return;
    try{
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      const now=audioCtx.currentTime;
      [0,0.22,0.44].forEach((d,i)=>{
        const o=audioCtx.createOscillator(),g=audioCtx.createGain();
        o.type="square";o.frequency.value=i===1?880:660;
        g.gain.setValueAtTime(0.0001,now+d);
        g.gain.exponentialRampToValueAtTime(0.12,now+d+0.015);
        g.gain.exponentialRampToValueAtTime(0.0001,now+d+0.16);
        o.connect(g);g.connect(audioCtx.destination);o.start(now+d);o.stop(now+d+0.18);
      });
    }catch{}
  }

  function toast(thread){
    const div=document.createElement("div");
    div.className="fwm-msg-toast "+(thread.last_priority==="urgent"?"urgent":"");
    const pair=`${thread.endpoint_a_label} ↔ ${thread.endpoint_b_label}`;
    div.innerHTML=`<strong>${thread.last_priority==="urgent"?"🚨 ΕΠΕΙΓΟΝ · ":"💬 "}${pair}</strong><div>${String(thread.last_message||"").replace(/[&<>]/g,"")}</div><small>Πάτησε για άνοιγμα Μηνυμάτων</small>`;
    div.onclick=()=>{location.href="admin.html#messages";};
    stack.prepend(div);
    setTimeout(()=>div.remove(),9000);
    if(thread.last_priority==="urgent") urgentTone();
  }

  async function poll(){
    if(access.mode!=="admin") return;
    try{
      const {data,error}=await ds.client.rpc("center_threads_v37",{});
      if(error) throw error;
      for(const t of (data||[])){
        const stamp=String(t.last_message_at||"");
        const prev=seen.get(t.conversation_id);
        if(prev && prev!==stamp && Number(t.unread_count||0)>0) toast(t);
        seen.set(t.conversation_id,stamp);
      }
    }catch(e){console.warn("message map alert",e);}
  }

  async function refresh(e){
    access=e?.detail||await ds.currentAccess();
    if(access.mode==="admin"){
      try{
        const {data}=await ds.client.rpc("center_threads_v37",{});
        seen=new Map((data||[]).map(t=>[t.conversation_id,String(t.last_message_at||"")]));
      }catch{}
      poll();
    }
  }
  window.addEventListener("fwm-access-changed",refresh);
  refresh();
  setInterval(poll,5000);
})();