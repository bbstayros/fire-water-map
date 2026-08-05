(() => {
  "use strict";

  const ds = window.DataService;
  const mapElement = document.getElementById("map");
  if (!ds?.client || !mapElement) return;

  const ui = {
    open: document.getElementById("openCrewButton"),
    list: document.getElementById("crewListButton"),
    count: document.getElementById("crewCountBadge"),
    modal: document.getElementById("crewModal"),
    close: document.getElementById("closeCrewModal"),
    form: document.getElementById("crewStartForm"),
    code: document.getElementById("crewOperationCode"),
    name: document.getElementById("crewVehicleName"),
    members: document.getElementById("crewMembers"),
    memberSearch: document.getElementById("crewMemberSearch"),
    manualMembers: document.getElementById("crewManualMembers"),
    vehicleSuggestions: document.getElementById("vehicleSuggestions"),
    memberSuggestions: document.getElementById("memberSuggestions"),
    selectedMembers: document.getElementById("selectedCrewMembers"),
    selectedVehicleMeta: document.getElementById("selectedVehicleMeta"),
    keepAwake: document.getElementById("crewKeepScreenOn"),
    startMessage: document.getElementById("crewStartMessage"),
    activePanel: document.getElementById("crewActivePanel"),
    activeName: document.getElementById("activeCrewName"),
    activeStatus: document.getElementById("activeCrewStatus"),
    activeAccuracy: document.getElementById("activeCrewAccuracy"),
    activeLastSent: document.getElementById("activeCrewLastSent"),
    activeConnection: document.getElementById("activeCrewConnection"),
    stop: document.getElementById("stopCrewSharing"),
    watchOnly: document.getElementById("watchCrewOnly"),
    listModal: document.getElementById("crewListModal"),
    closeList: document.getElementById("closeCrewListModal"),
    roomLabel: document.getElementById("crewRoomLabel"),
    crewList: document.getElementById("crewList"),
    refresh: document.getElementById("refreshCrewList")
  };

  const state = {
    code: localStorage.getItem("fwm-operation-code") || "",
    roomName: localStorage.getItem("fwm-operation-name") || "",
    sessionId: localStorage.getItem("fwm-crew-session") || "",
    vehicleName: localStorage.getItem("fwm-crew-name") || "",
    crewMembers: localStorage.getItem("fwm-crew-members") || "",
    deviceId: getDeviceId(),
    sharing: false,
    watchId: null,
    position: null,
    lastSentAt: 0,
    pollTimer: null,
    sendTimer: null,
    wakeLock: null,
    markers: new Map(),
    crews: [],
    directory: { vehicles: [], members: [] },
    selectedVehicleId: null,
    selectedMemberIds: [],
    selectedMemberNames: []
  };

  ui.code.value = state.code;
  ui.name.value = state.vehicleName;
  if (ui.members) ui.members.value = state.crewMembers;
  try {
    const lastIds=JSON.parse(localStorage.getItem("fwm-last-member-ids")||"[]");
    const lastNames=JSON.parse(localStorage.getItem("fwm-last-member-names")||"[]");
    if(lastNames.length){document.getElementById("recentCrewChoice")?.classList.remove("hidden");document.getElementById("recentCrewLabel").textContent=lastNames.join(", ");document.getElementById("reuseRecentCrew").onclick=()=>{state.selectedMemberIds=[...lastIds];state.selectedMemberNames=[...lastNames];renderSelectedMembers();document.getElementById("recentCrewChoice").classList.add("hidden");};}
  } catch {}

  function getDeviceId() {
    let value = localStorage.getItem("fwm-device-id");
    if (!value) {
      value = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
      localStorage.setItem("fwm-device-id", value);
    }
    return value;
  }

  function openModal(modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    modal.classList.add("hidden");
    if (ui.modal.classList.contains("hidden") && ui.listModal.classList.contains("hidden")) {
      document.body.classList.remove("modal-open");
    }
  }

  function message(text, error = false) {
    ui.startMessage.textContent = text;
    ui.startMessage.classList.toggle("error", error);
  }

  function readableError(error) {
    const text = String(error?.message || error || "");
    if (text.includes("INVALID_OPERATION_CODE")) return "Ο κωδικός επιχείρησης δεν είναι έγκυρος ή έχει λήξει.";
    if (text.includes("VEHICLE_NAME_IN_USE")) return "Αυτό το όνομα χρησιμοποιείται ήδη από άλλο ενεργό πλήρωμα.";
    if (text.includes("INVALID_CREW_SESSION")) return "Η συνεδρία πληρώματος έληξε. Κάνε νέα έναρξη.";
    if (text.includes("Failed to fetch") || text.includes("NetworkError")) return "Δεν υπάρχει σύνδεση για αποστολή live στίγματος.";
    return text || "Η ενέργεια απέτυχε.";
  }

  async function rpc(name, params) {
    const { data, error } = await ds.client.rpc(name, params);
    if (error) throw error;
    return data;
  }

  async function requestWakeLock() {
    if (!ui.keepAwake.checked || !("wakeLock" in navigator)) return;
    try {
      state.wakeLock = await navigator.wakeLock.request("screen");
    } catch (error) {
      console.warn("Wake lock unavailable", error);
    }
  }

  async function releaseWakeLock() {
    try { await state.wakeLock?.release(); } catch {}
    state.wakeLock = null;
  }

  function startGpsWatch() {
    if (!navigator.geolocation) throw new Error("Η συσκευή δεν υποστηρίζει GPS.");

    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);

    state.watchId = navigator.geolocation.watchPosition(
      position => {
        state.position = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: Number.isFinite(position.coords.speed) ? position.coords.speed : null,
          heading: Number.isFinite(position.coords.heading) ? position.coords.heading : null
        };

        ui.activeAccuracy.textContent = `±${Math.round(state.position.accuracy)} m`;
        ui.activeStatus.textContent =
          state.position.accuracy > 100
            ? "Χαμηλή ακρίβεια GPS"
            : "Το GPS ενημερώνεται";

        const movedEnough = !state.lastPositionSent ||
          distanceMeters(state.lastPositionSent, state.position) >= 30;

        if (movedEnough || Date.now() - state.lastSentAt >= 10000) {
          sendCurrentPosition();
        }
      },
      error => {
        const messages = {
          1: "Δεν δόθηκε άδεια GPS.",
          2: "Η θέση δεν είναι διαθέσιμη.",
          3: "Το GPS καθυστέρησε."
        };
        ui.activeStatus.textContent = messages[error.code] || "Σφάλμα GPS.";
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 3000 }
    );
  }

  function distanceMeters(a, b) {
    const R = 6371000;
    const rad = value => value * Math.PI / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLng = rad(b.longitude - a.longitude);
    const q = Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) *
      Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(q));
  }

  async function sendCurrentPosition() {
    if (!state.sharing || !state.position || !navigator.onLine) {
      ui.activeConnection.textContent = navigator.onLine ? "Αναμονή GPS" : "Χωρίς σύνδεση";
      return;
    }

    if (state.sending) return;
    state.sending = true;

    try {
      await rpc("update_crew_position", {
        p_code: state.code,
        p_session_id: state.sessionId,
        p_latitude: state.position.latitude,
        p_longitude: state.position.longitude,
        p_accuracy_m: state.position.accuracy,
        p_speed_mps: state.position.speed,
        p_heading_deg: state.position.heading
      });

      state.lastSentAt = Date.now();
      state.lastPositionSent = { ...state.position };
      ui.activeLastSent.textContent = "τώρα";
      ui.activeConnection.textContent = "Online";
      ui.activeConnection.className = "crew-online";
      pollCrews();
    } catch (error) {
      console.warn(error);
      ui.activeConnection.textContent = navigator.onLine ? "Αποτυχία αποστολής" : "Χωρίς σύνδεση";
      if (String(error?.message || "").includes("INVALID_CREW_SESSION")) {
        await stopSharing(false);
        message("Η συνεδρία έληξε. Κάνε νέα έναρξη.", true);
      }
    } finally {
      state.sending = false;
    }
  }

  async function loadDirectory() {
    const code=ui.code.value.trim().toUpperCase();
    if(code.length<4)return;
    try{const rows=await rpc("list_operation_directory",{p_code:code});const result=Array.isArray(rows)?rows[0]:rows;state.directory={vehicles:result?.vehicles||[],members:result?.members||[]};renderVehicleSuggestions();renderMemberSuggestions();}catch(error){console.warn("Directory unavailable",error);}
  }
  function renderVehicleSuggestions(){if(!ui.vehicleSuggestions)return;const q=ui.name.value.trim().toLocaleLowerCase("el");const rows=state.directory.vehicles.filter(v=>!q||`${v.display_name} ${v.code} ${v.make||""} ${v.model||""}`.toLocaleLowerCase("el").includes(q)).slice(0,8);ui.vehicleSuggestions.innerHTML=rows.map(v=>`<button type="button" data-vehicle-id="${v.id}"><strong>${escapeHtml(v.display_name)}</strong><small>${escapeHtml([v.make,v.model,v.water_capacity_l?`${v.water_capacity_l} L`:""].filter(Boolean).join(" · "))}</small></button>`).join("");ui.vehicleSuggestions.classList.toggle("hidden",!rows.length);ui.vehicleSuggestions.querySelectorAll("[data-vehicle-id]").forEach(b=>b.onclick=()=>{const v=state.directory.vehicles.find(x=>x.id===b.dataset.vehicleId);state.selectedVehicleId=v.id;ui.name.value=v.display_name;ui.selectedVehicleMeta.textContent=[v.make,v.model,v.water_capacity_l?`${v.water_capacity_l} L`:""].filter(Boolean).join(" · ")||"Καταχωρημένο όχημα";ui.vehicleSuggestions.classList.add("hidden");localStorage.setItem("fwm-last-vehicle-id",v.id);});}
  function renderMemberSuggestions(){if(!ui.memberSuggestions)return;const q=ui.memberSearch.value.trim().toLocaleLowerCase("el");const rows=state.directory.members.filter(m=>!state.selectedMemberIds.includes(m.id)&&(!q||`${m.full_name} ${m.callsign||""}`.toLocaleLowerCase("el").includes(q))).slice(0,8);ui.memberSuggestions.innerHTML=rows.map(m=>`<button type="button" data-member-id="${m.id}"><strong>${escapeHtml(m.callsign||m.full_name)}</strong><small>${escapeHtml(m.full_name)}</small></button>`).join("");ui.memberSuggestions.classList.toggle("hidden",!rows.length);ui.memberSuggestions.querySelectorAll("[data-member-id]").forEach(b=>b.onclick=()=>{const m=state.directory.members.find(x=>x.id===b.dataset.memberId);state.selectedMemberIds.push(m.id);state.selectedMemberNames.push(m.callsign||m.full_name);ui.memberSearch.value="";ui.memberSuggestions.classList.add("hidden");renderSelectedMembers();});}
  function renderSelectedMembers(){ui.selectedMembers.innerHTML=state.selectedMemberNames.map((name,i)=>`<span>${escapeHtml(name)}<button type="button" data-remove-member="${i}">×</button></span>`).join("");ui.selectedMembers.querySelectorAll("[data-remove-member]").forEach(b=>b.onclick=()=>{const i=Number(b.dataset.removeMember);state.selectedMemberIds.splice(i,1);state.selectedMemberNames.splice(i,1);renderSelectedMembers();});ui.members.value=state.selectedMemberNames.join(", ");}
  ui.code?.addEventListener("change",loadDirectory);ui.code?.addEventListener("blur",loadDirectory);ui.name?.addEventListener("input",()=>{state.selectedVehicleId=null;renderVehicleSuggestions();});ui.name?.addEventListener("focus",()=>{loadDirectory();renderVehicleSuggestions();});ui.memberSearch?.addEventListener("input",renderMemberSuggestions);ui.memberSearch?.addEventListener("focus",()=>{loadDirectory();renderMemberSuggestions();});
  async function startSharing(event) {
    event.preventDefault();

    const code = ui.code.value.trim().toUpperCase();
    const vehicleName = ui.name.value.trim();
    const manualMembers = ui.manualMembers?.value.trim() || "";
    const allMemberNames=[...state.selectedMemberNames,...manualMembers.split(",").map(x=>x.trim()).filter(Boolean)];
    const crewMembers = allMemberNames.join(", ");
    const sharedName = crewMembers ? `${vehicleName} · ${crewMembers}` : vehicleName;

    message("Έλεγχος κωδικού και έναρξη…");

    try {
      const rows = await rpc("join_crew_v2", {
        p_code: code, p_vehicle_id: state.selectedVehicleId, p_vehicle_name: vehicleName,
        p_member_ids: state.selectedMemberIds, p_crew_members: crewMembers, p_device_id: state.deviceId
      });

      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result?.session_id) throw new Error("Δεν δημιουργήθηκε συνεδρία πληρώματος.");

      state.code = code;
      state.vehicleName = vehicleName;
      state.crewMembers = crewMembers;
      state.roomName = result.room_name;
      state.sessionId = result.session_id;
      state.sharing = true;

      localStorage.setItem("fwm-operation-code", state.code);
      localStorage.setItem("fwm-operation-name", state.roomName);
      localStorage.setItem("fwm-crew-name", state.vehicleName);
      localStorage.setItem("fwm-crew-members", state.crewMembers);
      localStorage.setItem("fwm-last-member-ids",JSON.stringify(state.selectedMemberIds));
      localStorage.setItem("fwm-last-member-names",JSON.stringify(state.selectedMemberNames));
      localStorage.setItem("fwm-crew-session", state.sessionId);

      ui.activePanel.classList.remove("hidden");
      ui.activeName.textContent = `${state.vehicleName}${state.crewMembers ? ` · ${state.crewMembers}` : ""} · ${state.roomName}`;
      ui.open.classList.add("sharing");
      ui.open.querySelector("span:last-child").textContent = "Κοινοποίηση ενεργή";
      message("");

      startGpsWatch();
      await requestWakeLock();
      startTimers();
      pollCrews();
    } catch (error) {
      console.error(error);
      message(readableError(error), true);
    }
  }

  async function watchOnly() {
    const code = ui.code.value.trim().toUpperCase();
    if (code.length < 4) {
      message("Γράψε πρώτα τον κωδικό επιχείρησης.", true);
      return;
    }

    try {
      const rows = await rpc("watch_operation", { p_code: code });
      const result = Array.isArray(rows) ? rows[0] : rows;
      state.code = code;
      state.roomName = result.room_name;
      localStorage.setItem("fwm-operation-code", state.code);
      localStorage.setItem("fwm-operation-name", state.roomName);
      message("");
      closeModal(ui.modal);
      startTimers();
      pollCrews();
    } catch (error) {
      message(readableError(error), true);
    }
  }

  async function stopSharing(notifyServer = true) {
    if (notifyServer && state.sessionId && navigator.onLine) {
      try {
        await rpc("stop_crew", {
          p_code: state.code,
          p_session_id: state.sessionId
        });
      } catch (error) {
        console.warn(error);
      }
    }

    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    state.sharing = false;
    state.sessionId = "";
    localStorage.removeItem("fwm-crew-session");
    clearInterval(state.sendTimer);
    state.sendTimer = null;
    await releaseWakeLock();

    ui.activePanel.classList.add("hidden");
    ui.open.classList.remove("sharing");
    ui.open.querySelector("span:last-child").textContent = "Έναρξη πληρώματος";
  }

  function startTimers() {
    clearInterval(state.pollTimer);
    state.pollTimer = setInterval(pollCrews, 10000);

    clearInterval(state.sendTimer);
    state.sendTimer = setInterval(() => {
      if (state.sharing) sendCurrentPosition();
    }, 10000);

    pollCrews();
  }

  function crewAge(row) {
    return Math.max(0, (Date.now() - new Date(row.last_seen_at).getTime()) / 1000);
  }

  function crewClass(row) {
    const age = crewAge(row);
    if (!row.is_sharing || age > 300) return "offline";
    if (age > 120) return "stale";
    if (age > 30) return "delayed";
    return "live";
  }

  function crewStatus(row) {
    const age = crewAge(row);
    if (!row.is_sharing || age > 300) return `Εκτός σύνδεσης · ${timeAgo(age)}`;
    if (age > 120) return `Παλιό στίγμα · ${timeAgo(age)}`;
    if (age > 30) return `Καθυστέρηση · ${timeAgo(age)}`;
    return `Ζωντανό · ${timeAgo(age)}`;
  }

  function timeAgo(seconds) {
    if (seconds < 10) return "τώρα";
    if (seconds < 60) return `πριν από ${Math.round(seconds)} δευτ.`;
    return `πριν από ${Math.round(seconds / 60)} λεπτά`;
  }

  function crewIdentity(row) {
    const raw = String(row?.vehicle_name || "").trim();
    const parts = raw.split(" · ");
    return {
      vehicle: parts.shift() || "Όχημα",
      members: String(row?.crew_members_text || parts.join(" · ")).trim()
    };
  }

  function liveLine(row) {
    const age = crewAge(row);
    if (!row.is_sharing || age > 300) return `Τελευταίο στίγμα ${timeAgo(age)}`;
    if (age > 30) return `Ενημέρωση ${timeAgo(age)}`;
    return `Live ${timeAgo(age)}`;
  }

  async function pollCrews() {
    if (!state.code || !navigator.onLine) return;

    try {
      let rows; try { rows = await rpc("list_operation_crews_v2", { p_code: state.code }); } catch { rows = await rpc("list_operation_crews", { p_code: state.code }); }
      state.crews = rows || [];
      renderCrewList();
      renderCrewMarkers();

      const visibleCount = state.crews.filter(row => crewAge(row) <= 300 && row.is_sharing).length;
      ui.count.textContent = visibleCount;
      ui.count.classList.toggle("hidden", visibleCount === 0);
    } catch (error) {
      console.warn(error);
    }
  }

  function renderCrewList() {
    ui.roomLabel.textContent = state.roomName || "Επιχείρηση";
    if (!state.crews.length) {
      ui.crewList.innerHTML = '<p class="empty-table">Δεν υπάρχουν ακόμη πληρώματα με στίγμα.</p>';
      return;
    }

    ui.crewList.innerHTML = state.crews.map(row => {
      const cls = crewClass(row);
      const identity = crewIdentity(row);
      const accuracy = Number.isFinite(Number(row.accuracy_m))
        ? `±${Math.round(Number(row.accuracy_m))} m`
        : "—";
      const distance = distanceFromMe(row);
      return `
        <article class="crew-list-item ${cls}">
          <div>
            <h3>🚒 ${escapeHtml(identity.vehicle)}</h3>
            <div class="crew-list-meta">
              <span>● ${escapeHtml(liveLine(row))}</span>
              <span>🎯 ${accuracy}</span>
              ${distance ? `<span>📍 ${distance}</span>` : ""}
            </div>
            ${identity.members ? `<p class="crew-members-line"><strong>Πλήρωμα:</strong> ${escapeHtml(identity.members)}</p>` : ""}
          </div>
          <div class="crew-list-actions">
            <button class="action-button" type="button" data-show-crew="${row.session_id}">Στον χάρτη</button>
            <button class="action-button primary" type="button" data-nav-crew="${row.session_id}">Πλοήγηση</button>
          </div>
        </article>`;
    }).join("");

    ui.crewList.querySelectorAll("[data-show-crew]").forEach(button => {
      button.addEventListener("click", () => showCrewOnMap(button.dataset.showCrew));
    });

    ui.crewList.querySelectorAll("[data-nav-crew]").forEach(button => {
      button.addEventListener("click", () => navigateToCrew(button.dataset.navCrew));
    });
  }

  function distanceFromMe(row) {
    if (!state.position || row.latitude == null || row.longitude == null) return "";
    const meters = distanceMeters(
      state.position,
      { latitude: Number(row.latitude), longitude: Number(row.longitude) }
    );
    return meters < 1000 ? `${Math.round(meters)} m από εμένα` : `${(meters / 1000).toFixed(1)} km από εμένα`;
  }

  function getLeafletMap() {
    for (const key in mapElement) {
      if (key.startsWith("_leaflet")) break;
    }
    return window.__fireWaterMap || null;
  }

  function markerHtml(row) {
    const cls = crewClass(row);
    const identity = crewIdentity(row);
    return `<div class="crew-marker ${cls}" title="${escapeHtml(identity.vehicle)}">🚒</div>`;
  }

  function renderCrewMarkers() {
    const map = window.FireWaterMap?.map;
    if (!map) return;

    const activeIds = new Set();

    state.crews.forEach(row => {
      if (row.latitude == null || row.longitude == null) return;
      activeIds.add(row.session_id);

      const latlng = [Number(row.latitude), Number(row.longitude)];
      const icon = L.divIcon({
        html: markerHtml(row),
        className: "",
        iconSize: [42, 42],
        iconAnchor: [21, 21]
      });

      let marker = state.markers.get(row.session_id);
      if (!marker) {
        marker = L.marker(latlng, { icon, zIndexOffset: 1000 }).addTo(map);
        state.markers.set(row.session_id, marker);
      } else {
        marker.setLatLng(latlng);
        marker.setIcon(icon);
      }

      const identity = crewIdentity(row);
      marker.bindTooltip(escapeHtml(identity.vehicle), {
        permanent: true,
        direction: "top",
        offset: [0, -20],
        className: "crew-map-label"
      });

      marker.off("click").on("click", () => {
        openCrewCard(row);
      });
    });

    for (const [id, marker] of state.markers) {
      if (!activeIds.has(id)) {
        map.removeLayer(marker);
        state.markers.delete(id);
      }
    }
  }

  function openCrewCard(row) {
    const distance = distanceFromMe(row);
    const map = window.FireWaterMap?.map;
    if (!map) return;

    const identity = crewIdentity(row);
    const accuracy = Number.isFinite(Number(row.accuracy_m))
      ? `±${Math.round(Number(row.accuracy_m))} m`
      : "—";

    const html = `
      <div class="vehicle-sheet-heading">
        <span class="vehicle-sheet-icon">🚒</span>
        <div>
          <small>Όχημα επιχείρησης</small>
          <h2>${escapeHtml(identity.vehicle)}</h2>
        </div>
      </div>

      <div class="vehicle-live-line ${crewClass(row)}">
        <span class="vehicle-live-dot"></span>
        <strong>${escapeHtml(liveLine(row))}</strong>
      </div>

      ${distance ? `<p class="distance">📍 ${distance}</p>` : ""}

      <div class="vehicle-info-card">
        <span>Ακρίβεια GPS</span>
        <strong>${accuracy}</strong>
      </div>

      <div class="vehicle-crew-block">
        <span>Πλήρωμα:</span>
        <strong>${identity.members ? escapeHtml(identity.members) : "Δεν δηλώθηκαν ονόματα"}</strong>
      </div>

      <button class="navigate-button" type="button" data-inline-nav="${row.session_id}">
        🧭 Πλοήγηση προς το όχημα
      </button>
    `;

    const sheet = document.getElementById("bottomSheet");
    const content = document.getElementById("sheetContent");
    content.innerHTML = html;
    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    content.querySelector("[data-inline-nav]")?.addEventListener("click", () => navigateToCrew(row.session_id));
  }

  function showCrewOnMap(sessionId) {
    const row = state.crews.find(item => item.session_id === sessionId);
    const map = window.FireWaterMap?.map;
    if (!row || !map || row.latitude == null) return;

    closeModal(ui.listModal);
    map.setView([Number(row.latitude), Number(row.longitude)], 16);
    openCrewCard(row);
  }

  function navigateToCrew(sessionId) {
    const row = state.crews.find(item => item.session_id === sessionId);
    if (!row || row.latitude == null || row.longitude == null) return;

    const lat = Number(row.latitude);
    const lng = Number(row.longitude);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const url = isIOS
      ? `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d`
      : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

    window.location.href = url;
  }

  function openCrewList() {
    closeModal(ui.modal);
    openModal(ui.listModal);
    pollCrews();
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, char => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    }[char]));
  }

  ui.open.addEventListener("click", () => {
    openModal(ui.modal);
    if (state.sharing) {
      ui.activePanel.classList.remove("hidden");
      ui.activeName.textContent = `${state.vehicleName}${state.crewMembers ? ` · ${state.crewMembers}` : ""} · ${state.roomName}`;
    }
  });
  ui.list.addEventListener("click", () => {
    if (!state.code) {
      openModal(ui.modal);
      message("Γράψε τον κωδικό επιχείρησης για να δεις τα πληρώματα.");
      return;
    }
    openCrewList();
  });
  ui.close.addEventListener("click", () => closeModal(ui.modal));
  ui.closeList.addEventListener("click", () => closeModal(ui.listModal));
  ui.modal.addEventListener("click", event => { if (event.target === ui.modal) closeModal(ui.modal); });
  ui.listModal.addEventListener("click", event => { if (event.target === ui.listModal) closeModal(ui.listModal); });
  ui.form.addEventListener("submit", startSharing);
  ui.watchOnly.addEventListener("click", watchOnly);
  ui.stop.addEventListener("click", () => stopSharing(true));
  ui.refresh.addEventListener("click", pollCrews);

  window.addEventListener("online", () => {
    ui.activeConnection.textContent = "Online";
    if (state.sharing) sendCurrentPosition();
    pollCrews();
  });

  window.addEventListener("offline", () => {
    ui.activeConnection.textContent = "Χωρίς σύνδεση";
  });

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState === "visible" && state.sharing) {
      await requestWakeLock();
      sendCurrentPosition();
    }
  });

  window.addEventListener("beforeunload", () => {
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
  });

  if (state.code) {
    startTimers();
  }
})();
