import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const cors = { "content-type": "application/json" };
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;
const WEBHOOK_SECRET = Deno.env.get("PUSH_WEBHOOK_SECRET")!;

webpush.setVapidDetails("mailto:bbstayros@gmail.com", VAPID_PUBLIC, VAPID_PRIVATE);
const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession:false } });

Deno.serve(async (req) => {
  if(req.method!=="POST") return new Response("Method not allowed",{status:405});
  if(req.headers.get("x-fwm-push-secret")!==WEBHOOK_SECRET) return new Response("Unauthorized",{status:401});

  try {
    const payload=await req.json();
    const m=payload.record ?? payload;
    if(!m?.id || !m?.recipient_type || !m?.recipient_id) return new Response(JSON.stringify({ok:true,skipped:"invalid payload"}),{headers:cors});

    const {data:subs,error}=await admin.from("push_subscriptions_v376")
      .select("id,push_endpoint,p256dh,auth_key")
      .eq("endpoint_type",m.recipient_type)
      .eq("endpoint_id",String(m.recipient_id))
      .eq("is_active",true);
    if(error) throw error;

    const urgent=m.priority==="urgent";
    const body=String(m.body||"Νέο επιχειρησιακό μήνυμα");
    const target=m.recipient_type==="center" ? "admin.html#messages" : "index.html?openMessages=1";
    const notification=JSON.stringify({
      title: urgent ? "🚨 ΕΠΕΙΓΟΝ · Fire Water Map" : "💬 Νέο επιχειρησιακό μήνυμα",
      body: `${m.sender_label||"Fire Water Map"}: ${body}`,
      url: target,
      tag: urgent ? `fwm-urgent-${m.conversation_id}` : `fwm-message-${m.conversation_id}`,
      urgent,
      conversationId:m.conversation_id,
      messageId:m.id
    });

    let sent=0,removed=0;
    for(const s of subs||[]) {
      try {
        await webpush.sendNotification({
          endpoint:s.push_endpoint,
          keys:{p256dh:s.p256dh,auth:s.auth_key}
        },notification,{TTL:urgent?300:3600,urgency:urgent?"high":"normal"});
        sent++;
      } catch(e) {
        const status=Number(e?.statusCode||0);
        if(status===404||status===410) {
          await admin.from("push_subscriptions_v376").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",s.id);
          removed++;
        } else console.error("push send",status,e?.message||e);
      }
    }
    return new Response(JSON.stringify({ok:true,sent,removed}),{headers:cors});
  } catch(e) {
    console.error(e);
    return new Response(JSON.stringify({error:String(e?.message||e)}),{status:500,headers:cors});
  }
});
