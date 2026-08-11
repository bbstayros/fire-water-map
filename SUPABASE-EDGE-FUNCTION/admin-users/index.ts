import { createClient } from "npm:@supabase/supabase-js@2";

const APP_URL = "https://bbstayros.github.io/fire-water-map";
const SET_PASSWORD_URL = `${APP_URL}/set-password.html`;
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" }
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}").default;
    if (!secret) return json({ error: "Missing Supabase secret key" }, 500);

    const admin = createClient(url, secret, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    });

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "AUTH_REQUIRED" }, 401);

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return json({ error: "INVALID_SESSION" }, 401);

    const { data: caller, error: callerError } = await admin.from("profiles").select("role,is_active").eq("id", user.id).single();
    if (callerError) return json({ error: "PROFILE_LOOKUP_FAILED", details: callerError.message, code: callerError.code }, 500);
    if (!caller?.is_active || caller.role !== "admin") return json({ error: "NOT_ADMIN" }, 403);

    const body = await req.json();
    const action = body.action;
    const audit = async (a: string, id: string | null, d: string, m = {}) => admin.from("audit_logs").insert({
      actor_id: user.id,
      actor_email: user.email,
      action: a,
      entity_type: "user",
      entity_id: id,
      description: d,
      metadata: m
    });
    const activeAdminCount = async () => {
      const { count } = await admin.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
      return count || 0;
    };

    if (action === "list") {
      const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      if (error) throw error;
      const ids = data.users.map(u => u.id);
      const { data: profiles } = ids.length
        ? await admin.from("profiles").select("id,full_name,role,is_active").in("id", ids)
        : { data: [] };
      const map = new Map((profiles || []).map(p => [p.id, p]));
      return json({ users: data.users.map(u => {
        const p = map.get(u.id);
        return {
          id: u.id,
          email: u.email,
          full_name: p?.full_name || u.user_metadata?.full_name || "",
          role: p?.role || "viewer",
          is_active: p?.is_active !== false,
          created_at: u.created_at,
          last_sign_in_at: u.last_sign_in_at,
          email_confirmed_at: u.email_confirmed_at
        };
      }) });
    }

    if (action === "invite") {
      const email = String(body.email || "").trim().toLowerCase();
      const fullName = String(body.full_name || "").trim();
      const role = ["admin", "editor", "viewer"].includes(body.role) ? body.role : "viewer";
      // Do not trust a browser-provided arbitrary redirect. This app has one
      // canonical invite destination, which also must be allow-listed in Auth.
      const redirectTo = SET_PASSWORD_URL;
      const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: fullName },
        redirectTo
      });
      if (error) throw error;
      await admin.from("profiles").upsert({ id: data.user.id, full_name: fullName, role, is_active: true }, { onConflict: "id" });
      await audit("create", data.user.id, `Πρόσκληση χρήστη ${email}`, { role, redirect_to: redirectTo });
      return json({ ok: true });
    }

    if (action === "update") {
      const id = String(body.user_id);
      const { data: target } = await admin.from("profiles").select("role,is_active").eq("id", id).single();
      if (!target) throw new Error("USER_NOT_FOUND");
      const nextRole = body.role && ["admin", "editor", "viewer"].includes(body.role) ? body.role : target.role;
      const nextActive = typeof body.is_active === "boolean" ? body.is_active : target.is_active;
      if (target.role === "admin" && target.is_active && (nextRole !== "admin" || !nextActive) && (await activeAdminCount()) <= 1) throw new Error("LAST_ADMIN_PROTECTED");
      await admin.from("profiles").update({ role: nextRole, is_active: nextActive }).eq("id", id);
      const { error } = await admin.auth.admin.updateUserById(id, {
        ban_duration: nextActive ? "none" : "876000h",
        app_metadata: { role: nextRole }
      });
      if (error) throw error;
      await audit("update", id, `${nextActive ? "Ενημέρωση" : "Απενεργοποίηση"} χρήστη ${id}`, { role: nextRole, is_active: nextActive });
      return json({ ok: true });
    }

    if (action === "delete") {
      const id = String(body.user_id);
      if (id === user.id) throw new Error("CANNOT_DELETE_SELF");
      const { data: target } = await admin.from("profiles").select("role,is_active").eq("id", id).single();
      if (target?.role === "admin" && target?.is_active && (await activeAdminCount()) <= 1) throw new Error("LAST_ADMIN_PROTECTED");
      await audit("delete", id, `Οριστική διαγραφή χρήστη ${id}`);
      const { error } = await admin.auth.admin.deleteUser(id, false);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : String(error) }, 400);
  }
});
