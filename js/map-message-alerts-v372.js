(() => {
  "use strict";
  const ds=window.DataService;
  if(!ds?.client) return;

  let access={mode:"public"},seen=new Map(),audioCtx=null,audioArmed=false;
  let alarmTimer=null,vibrationTimer=null,alarmActive=false,alarmThread=null;

  const style=document.createElement("style");
  style.textContent=`
    .fwm-msg-toast-stack{position:fixed;right:18px;top:132px;z-index:5000;display:grid;gap:10px;width:min(380px,calc(100vw - 36px))}
    .fwm-msg-toast{background:#fff;border-radius:16px;padding:13px 14px;box-shadow:0 12px 34px #0004;border-left:5px solid #1f8f55;cursor:pointer}
    .fwm-msg-toast.urgent{border-left-color:#b42318;background:#fff5f3}
    .fwm-msg-toast strong{display:block;margin-bottom:4px}
    .fwm-msg-toast small{color:#68747d}
    .fwm-center-alert-enable{position:fixed;right:18px;top:82px;z-index:5001;border:1px solid #d8dfe3;border-radius:999px;padding:8px 12px;background:#fff;font-weight:800;box-shadow:0 5px 18px #0002}
    .fwm-center-alert-enable.on{background:#e8f6ee;color:#137743;border-color:#b9dfc8}
    .fwm-center-urgent-banner{position:fixed;left:50%;top:18px;transform:translateX(-50%);z-index:6600;border:0;border-radius:18px;padding:13px 18px;background:#b42318;color:#fff;box-shadow:0 12px 35px #0005;display:flex;gap:12px;align-items:center;animation:centerPulse .72s infinite alternate}
    .fwm-center-urgent-banner.hidden{display:none!important}
    @keyframes centerPulse{from{filter:brightness(.9)}to{filter:brightness(1.3)}}
    html.fwm-center-urgent body::after{content:"";position:fixed;inset:0;z-index:6500;pointer-events:none;border:10px solid #ef2929;box-shadow:inset 0 0 55px #ef292980;animation:centerFlash .6s infinite alternate}
    @keyframes centerFlash{from{opacity:.15}to{opacity:.9}}
    @media(max-width:720px){.fwm-msg-toast-stack{top:126px;right:12px;width:calc(100vw - 24px)}.fwm-center-alert-enable{right:12px;top:78px}}
  `;
  document.head.appendChild(style);

  const stack=document.createElement("div");
  stack.className="fwm-msg-toast-stack";
  document.body.appendChild(stack);

  const enable=document.createElement("button");
  enable.type="button";
  enable.className="fwm-center-alert-enable";
  enable.textContent="🔕 Ειδοποιήσεις OFF";
  enable.onclick=()=>arm(true);
  document.body.appendChild(enable);

  const banner=document.createElement("button");
  banner.type="button";
  banner.className="fwm-center-urgent-banner hidden";
  banner.innerHTML="<strong>🚨 ΕΠΕΙΓΟΝ ΜΗΝΥΜΑ</strong><span>Πάτησε για άνοιγμα</span>";
  banner.onclick=()=>openMessages();
  document.body.appendChild(banner);

  async function arm(requestPermission=false){
    try{
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      if(audioCtx.state==="suspended") await audioCtx.resume();
      audioArmed=audioCtx.state==="running";
    }catch{audioArmed=false;}

    if(requestPermission && "Notification" in window && Notification.permission==="default"){
      try{await Notification.requestPermission();}catch{}
    }

    enable.textContent=audioArmed?"🔔 Ειδοποιήσεις ON":"🔕 Ειδοποιήσεις OFF";
    enable.classList.toggle("on",audioArmed);
  }

  window.addEventListener("pointerdown",()=>arm(false),{once:true});
  window.addEventListener("keydown",()=>arm(false),{once:true});

  function siren(){
    if(!audioArmed)return;
    try{
      audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();
      const now=audioCtx.currentTime;
      const osc=audioCtx.createOscillator(),gain=audioCtx.createGain();
      osc.type="sawtooth";
      osc.frequency.setValueAtTime(560,now);
      osc.frequency.linearRampToValueAtTime(980,now+.72);
      osc.frequency.linearRampToValueAtTime(560,now+1.44);
      gain.gain.setValueAtTime(.0001,now);
      gain.gain.exponentialRampToValueAtTime(.16,now+.04);
      gain.gain.setValueAtTime(.16,now+1.38);
      gain.gain.exponentialRampToValueAtTime(.0001,now+1.55);
      osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+1.55);
    }catch{}
  }

  function vibrate(){
    try{navigator.vibrate?.([600,220,600,220,1100]);}catch{}
  }

  function systemNotification(t){
    if(!("Notification" in window)||Notification.permission!=="granted")return;
    try{
      const n=new Notification("🚨 Επείγον επιχειρησιακό μήνυμα",{
        body:t.last_message||"Άνοιξε την εφαρμογή για προβολή.",
        icon:"icons/app-icon-192.png",
        tag:"fwm-center-urgent",
        renotify:true,
        requireInteraction:true
      });
      n.onclick=()=>{window.focus();openMessages();n.close();};
    }catch{}
  }

  function startAlarm(t){
    alarmThread=t;
    if(alarmActive)return;
    alarmActive=true;
    document.documentElement.classList.add("fwm-center-urgent");
    banner.classList.remove("hidden");
    siren();vibrate();
    alarmTimer=setInterval(siren,1800);
    vibrationTimer=setInterval(vibrate,3100);
    systemNotification(t);
  }

  function stopAlarm(){
    alarmActive=false;
    clearInterval(alarmTimer);clearInterval(vibrationTimer);
    alarmTimer=vibrationTimer=null;
    try{navigator.vibrate?.(0);}catch{}
    document.documentElement.classList.remove("fwm-center-urgent");
    banner.classList.add("hidden");
  }

  function openMessages(){
    stopAlarm();
    location.href="admin.html#messages";
  }

  function toast(thread){
    const div=document.createElement("div");
    div.className="fwm-msg-toast "+(thread.last_priority==="urgent"?"urgent":"");
    const pair=`${thread.endpoint_a_label} ↔ ${thread.endpoint_b_label}`;
    div.innerHTML=`<strong>${thread.last_priority==="urgent"?"🚨 ΕΠΕΙΓΟΝ · ":"💬 "}${pair}</strong><div>${String(thread.last_message||"").replace(/[&<>]/g,"")}</div><small>Πάτησε για άνοιγμα Μηνυμάτων</small>`;
    div.onclick=openMessages;
    stack.prepend(div);
    setTimeout(()=>div.remove(),10000);
    if(thread.last_priority==="urgent") startAlarm(thread);
  }

  async function poll(){
    if(access.mode!=="admin")return;
    try{
      const {data,error}=await ds.client.rpc("center_threads_v37",{});
      if(error)throw error;
      const rows=data||[];
      for(const t of rows){
        const stamp=String(t.last_message_at||"");
        const prev=seen.get(t.conversation_id);
        if(prev && prev!==stamp && Number(t.unread_count||0)>0)toast(t);
        seen.set(t.conversation_id,stamp);
      }
      const hasUrgentUnread=rows.some(t=>Number(t.unread_count||0)>0&&t.last_priority==="urgent");
      if(!hasUrgentUnread)stopAlarm();
    }catch(e){console.warn("message map alert",e);}
  }

  async function refresh(e){
    access=e?.detail||await ds.currentAccess();
    enable.style.display=access.mode==="admin"?"":"none";
    if(access.mode==="admin"){
      try{
        const {data}=await ds.client.rpc("center_threads_v37",{});
        seen=new Map((data||[]).map(t=>[t.conversation_id,String(t.last_message_at||"")]));
      }catch{}
      poll();
    }else stopAlarm();
  }

  window.addEventListener("fwm-access-changed",refresh);
  refresh();
  setInterval(poll,4000);
})();