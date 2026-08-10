(() => {
  "use strict";

  const ds = window.DataService;
  const form = document.getElementById("operationRoomForm");
  if (!form || !ds?.client) return;

  const list = document.getElementById("operationRoomsList");
  const message = document.getElementById("operationRoomMessage");

  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  function crewIdentity(value) {
    const parts = String(value || "Όχημα").split(" · ");
    return { vehicle: parts.shift() || "Όχημα", members: parts.join(" · ") };
  }

  function ageState(lastSeen, sharing) {
    const seconds = Math.max(0, (Date.now() - new Date(lastSeen).getTime()) / 1000);
    if (!sharing || seconds > 300) return { cls: "offline", label: `Εκτός σύνδεσης · ${Math.round(seconds/60)}΄` };
    if (seconds > 120) return { cls: "stale", label: `Παλιό στίγμα · ${Math.round(seconds/60)}΄` };
    if (seconds > 30) return { cls: "delayed", label: `Καθυστέρηση · ${Math.round(seconds)}΄΄` };
    return { cls: "live", label: seconds < 10 ? "Live τώρα" : `Live πριν ${Math.round(seconds)}΄΄` };
  }

  async function loadRooms() {
    list.innerHTML = '<div class="admin-loading">Φόρτωση επιχειρήσεων…</div>';

    const { data: rooms, error } = await ds.client
      .from("operation_rooms")
      .select("id,name,code_hint,is_active,expires_at,created_at,closed_at")
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`;
      return;
    }

    const { data: crews, error: crewError } = await ds.client
      .from("crew_positions")
      .select("room_id,session_id,vehicle_name,crew_members_text,latitude,longitude,accuracy_m,is_sharing,last_seen_at")
      .order("last_seen_at", { ascending: false });

    if (crewError) console.warn(crewError);
    const crewRows = crews || [];
    const { data: supportRowsRaw, error: supportError } = await ds.client.from("support_requests_v35").select("id,room_id,full_name,phone,support_type,vehicle_info,latitude,longitude,accuracy_m,speed_mps,last_seen_at,status").eq("status","approved").order("last_seen_at",{ascending:false});
    if (supportError) console.warn(supportError);
    const supportRows = supportRowsRaw || [];

    list.innerHTML = (rooms || []).length
      ? rooms.map(room => {
          const roomCrews = crewRows.filter(row => row.room_id === room.id);
          const roomSupport = supportRows.filter(row => row.room_id === room.id);
          const activeCrewCount = roomCrews.filter(row => row.is_sharing && Date.now() - new Date(row.last_seen_at).getTime() < 5*60*1000).length;
          const activeSupportCount = roomSupport.filter(row => row.last_seen_at && Date.now() - new Date(row.last_seen_at).getTime() < 5*60*1000).length;
          const expiry = room.expires_at ? new Date(room.expires_at).toLocaleString("el-GR") : "Χωρίς αυτόματη λήξη";
          const vehicles = roomCrews.length ? `<div class="admin-vehicle-list">${roomCrews.map(row => {
            const identity=crewIdentity(row.vehicle_name), status=ageState(row.last_seen_at,row.is_sharing);
            const accuracy=Number.isFinite(Number(row.accuracy_m))?`±${Math.round(Number(row.accuracy_m))} m`:"—";
            const mapLink=row.latitude!=null&&row.longitude!=null?`https://www.google.com/maps?q=${row.latitude},${row.longitude}`:"";
            return `<article class="admin-vehicle-card ${status.cls}">
              <div class="admin-vehicle-icon">🚒</div>
              <div class="admin-vehicle-copy">
                <div class="admin-vehicle-title"><strong>${escapeHtml(identity.vehicle)}</strong><span>${escapeHtml(status.label)}</span></div>
                <div class="admin-vehicle-meta"><span>🎯 ${accuracy}</span><span>👥 ${escapeHtml(row.crew_members_text||identity.members||"Χωρίς δηλωμένο πλήρωμα")}</span></div>
              </div>
              ${mapLink?`<a class="vehicle-map-button" target="_blank" rel="noopener" href="${mapLink}">Χάρτης</a>`:""}
            </article>`;
          }).join("")}</div>` : '<p class="empty-operation">Δεν έχει συνδεθεί ακόμη όχημα.</p>';
          return `<article class="operation-room-card ${room.is_active ? "" : "inactive"}">
            <div class="operation-room-card-head">
              <div><div class="operation-title-row"><h3>${escapeHtml(room.name)}</h3><span class="publication-status ${room.is_active ? "published" : "hidden"}">${room.is_active ? "Ανοιχτή επιχείρηση" : "Κλειστή επιχείρηση"}</span></div><small>Κωδικός …${escapeHtml(room.code_hint)} · ${escapeHtml(expiry)}</small></div>
              <div class="operation-count ${(activeCrewCount+activeSupportCount)?"has-live":"no-live"}"><strong>${activeCrewCount+activeSupportCount}</strong><span>μονάδες μεταδίδουν</span></div>
            </div>
            ${vehicles}
            ${roomSupport.length ? `<div class="admin-support-live"><h4>Υποστήριξη</h4>${roomSupport.map(s=>{const live=s.last_seen_at&&Date.now()-new Date(s.last_seen_at).getTime()<120000;const speed=s.speed_mps!=null?`${Math.round(Number(s.speed_mps)*3.6)} km/h`:"—";return `<article class="admin-vehicle-card ${live?"live":"offline"}"><div class="admin-vehicle-icon">◆</div><div class="admin-vehicle-copy"><div class="admin-vehicle-title"><strong>${escapeHtml(s.full_name)}</strong><span>${live?"Live":"Χωρίς πρόσφατο GPS"}</span></div><div class="admin-vehicle-meta"><span>${escapeHtml(s.support_type)}</span><span>${escapeHtml(s.vehicle_info||"")}</span><span>${speed}</span></div></div></article>`;}).join("")}</div>` : ""}
            <div class="operation-footer">
              ${room.is_active
                ? `<button class="action-button danger-button" type="button" data-close-room="${room.id}">Κλείσιμο</button>`
                : `<button class="action-button primary" type="button" data-reopen-room="${room.id}">Επαναλειτουργία</button>`}
            </div>
          </article>`;
        }).join("")
      : '<p class="empty-table">Δεν υπάρχουν live επιχειρήσεις.</p>';

    list.querySelectorAll("[data-close-room]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Να κλείσει η επιχείρηση και να σταματήσουν όλα τα live στίγματα;")) return;
        const { error } = await ds.client.rpc("close_operation_room", { p_room_id: button.dataset.closeRoom });
        if (error) alert(error.message); else { window.AuditLog?.write("update","operation_room",button.dataset.closeRoom,"Κλείσιμο live επιχείρησης"); loadRooms(); }
      });
    });

    list.querySelectorAll("[data-reopen-room]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Να ενεργοποιηθεί ξανά αυτή η επιχείρηση με τον ίδιο κωδικό;")) return;
        const { error } = await ds.client.rpc("reopen_operation_room", {
          p_room_id: button.dataset.reopenRoom
        });
        if (error) {
          alert(error.message || "Η επαναλειτουργία απέτυχε.");
        } else {
          window.AuditLog?.write("update","operation_room",button.dataset.reopenRoom,"Επαναλειτουργία live επιχείρησης");
          loadRooms();
        }
      });
    });
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();

    const code = document.getElementById("operationRoomCode").value.trim().toUpperCase();
    const expiresValue = document.getElementById("operationRoomExpiry").value;

    setMessage("Δημιουργία…");

    const { error } = await ds.client.rpc("create_operation_room", {
      p_name: document.getElementById("operationRoomName").value.trim(),
      p_code: code,
      p_expires_at: expiresValue ? new Date(expiresValue).toISOString() : null
    });

    if (error) {
      setMessage(error.message.includes("NOT_ADMIN") ? "Απαιτείται λογαριασμός διαχειριστή." : error.message, true);
      return;
    }

    setMessage(`Η επιχείρηση δημιουργήθηκε. Δώσε στα πληρώματα τον κωδικό: ${code}`);
    window.AuditLog?.write("create","operation_room",null,`Δημιουργία live επιχείρησης «${document.getElementById("operationRoomName").value.trim()}»`);
    form.reset();
    loadRooms();
  });

  document.getElementById("refreshOperationRooms").addEventListener("click", loadRooms);
  document.querySelector('[data-view="operations"]')?.addEventListener("click", loadRooms);
  window.addEventListener("admin-dashboard-ready", event => {
    if (event.detail.profile?.role === "admin") loadRooms();
  });
})();
