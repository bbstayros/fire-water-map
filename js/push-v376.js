(() => {
  "use strict";
  const ds=window.DataService, cfg=window.APP_CONFIG||{};
  if(!ds?.client) return;

  const b64ToU8=s=>{
    const pad="=".repeat((4-s.length%4)%4),raw=atob((s+pad).replace(/-/g,"+").replace(/_/g,"/"));
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  };

  async function identityArgs(){
    const access=await ds.currentAccess();
    if(access.mode==="admin") return {p_session_id:null,p_device_id:null};
    return {
      p_session_id:localStorage.getItem("fwm-crew-session")||null,
      p_device_id:localStorage.getItem("fwm-device-id")||null
    };
  }

  async function syncSubscription(){
    if(!("serviceWorker" in navigator)||!("PushManager" in window)||!("Notification" in window)) return {ok:false,reason:"unsupported"};
    if(Notification.permission!=="granted") return {ok:false,reason:"permission"};
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub){
      sub=await reg.pushManager.subscribe({
        userVisibleOnly:true,
        applicationServerKey:b64ToU8(cfg.vapidPublicKey)
      });
    }
    const j=sub.toJSON(),ids=await identityArgs();
    const {error}=await ds.client.rpc("register_push_subscription_v376",{
      p_endpoint:j.endpoint,
      p_p256dh:j.keys?.p256dh||"",
      p_auth:j.keys?.auth||"",
      p_user_agent:navigator.userAgent,
      ...ids
    });
    if(error) throw error;
    localStorage.setItem("fwm-push-enabled","1");
    return {ok:true,subscription:sub};
  }

  async function enable(){
    if(!("Notification" in window)) return {ok:false,reason:"unsupported"};
    let p=Notification.permission;
    if(p==="default") p=await Notification.requestPermission();
    if(p!=="granted") return {ok:false,reason:"denied"};
    return syncSubscription();
  }

  async function disable(){
    try{
      const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
      if(sub){
        await ds.client.rpc("remove_push_subscription_v376",{p_endpoint:sub.endpoint});
        await sub.unsubscribe();
      }
    }finally{localStorage.removeItem("fwm-push-enabled");}
  }

  window.addEventListener("load",()=>{if(localStorage.getItem("fwm-push-enabled")==="1"&&Notification.permission==="granted")syncSubscription().catch(console.warn);});
  window.addEventListener("fwm-access-changed",()=>{if(localStorage.getItem("fwm-push-enabled")==="1")syncSubscription().catch(console.warn);});
  window.FwmPush={enable,disable,sync:syncSubscription};
})();