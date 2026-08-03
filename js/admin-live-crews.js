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

  async function loadRooms() {
    list.innerHTML = "<p>Φόρτωση…</p>";

    const { data: rooms, error } = await ds.client
      .from("operation_rooms")
      .select("id,name,code_hint,is_active,expires_at,created_at,closed_at")
      .order("created_at", { ascending: false });

    if (error) {
      list.innerHTML = `<p class="form-message error">${escapeHtml(error.message)}</p>`;
      return;
    }

    const { data: crews } = await ds.client
      .from("crew_positions")
      .select("room_id,is_sharing,last_seen_at");

    const crewRows = crews || [];

    list.innerHTML = (rooms || []).length
      ? rooms.map(room => {
          const activeCrewCount = crewRows.filter(row =>
            row.room_id === room.id &&
            row.is_sharing &&
            Date.now() - new Date(row.last_seen_at).getTime() < 5 * 60 * 1000
          ).length;

          const expiry = room.expires_at
            ? new Date(room.expires_at).toLocaleString("el-GR")
            : "Χωρίς αυτόματη λήξη";

          return `
            <article class="operation-room-card ${room.is_active ? "" : "inactive"}">
              <div class="operation-room-card-head">
                <div>
                  <h3>${escapeHtml(room.name)}</h3>
                  <small>Κωδικός λήγει σε …${escapeHtml(room.code_hint)}</small>
                </div>
                <span class="publication-status ${room.is_active ? "published" : "hidden"}">
                  ${room.is_active ? "Ενεργή" : "Κλειστή"}
                </span>
              </div>
              <div class="operation-room-meta">
                <span>🚒 ${activeCrewCount} ενεργά πληρώματα</span>
                <span>🕒 ${escapeHtml(expiry)}</span>
              </div>
              ${room.is_active ? `<button class="action-button danger-button" type="button" data-close-room="${room.id}">Κλείσιμο επιχείρησης</button>` : ""}
            </article>`;
        }).join("")
      : '<p class="empty-table">Δεν υπάρχουν live επιχειρήσεις.</p>';

    list.querySelectorAll("[data-close-room]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Να κλείσει η επιχείρηση και να σταματήσουν όλα τα live στίγματα;")) return;
        const { error } = await ds.client.rpc("close_operation_room", {
          p_room_id: button.dataset.closeRoom
        });
        if (error) alert(error.message);
        else loadRooms();
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
    form.reset();
    loadRooms();
  });

  document.getElementById("refreshOperationRooms").addEventListener("click", loadRooms);
  document.querySelector('[data-view="operations"]')?.addEventListener("click", loadRooms);
  window.addEventListener("admin-dashboard-ready", event => {
    if (event.detail.profile?.role === "admin") loadRooms();
  });
})();
