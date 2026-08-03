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
    deviceId: getDeviceId(),
    sharing: false,
    watchId: null,
    position: null,
    lastSentAt: 0,
    pollTimer: null,
    sendTimer: null,
    wakeLock: null,
    markers: new Map(),
    crews: []
  };

  ui.code.value = state.code;
  ui.name.value = state.vehicleName;

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

  async function startSharing(event) {
    event.preventDefault();

    const code = ui.code.value.trim().toUpperCase();
    const vehicleName = ui.name.value.trim();

    message("Έλεγχος κωδικού και έναρξη…");

    try {
      const rows = await rpc("join_crew", {
        p_code: code,
        p_vehicle_name: vehicleName,
        p_device_id: state.deviceId
      });

      const result = Array.isArray(rows) ? rows[0] : rows;
      if (!result?.session_id) throw new Error("Δεν δημιουργήθηκε συνεδρία πληρώματος.");

      state.code = code;
      state.vehicleName = vehicleName;
      state.roomName = result.room_name;
      state.sessionId = result.session_id;
      state.sharing = true;

      localStorage.setItem("fwm-operation-code", state.code);
      localStorage.setItem("fwm-operation-name", state.roomName);
      localStorage.setItem("fwm-crew-name", state.vehicleName);
      localStorage.setItem("fwm-crew-session", state.sessionId);

      ui.activePanel.classList.remove("hidden");
      ui.activeName.textContent = `${state.vehicleName} · ${state.roomName}`;
      ui.open.classList.add("sharing");
      ui.open.querySelector("span:last-child").textContent = "Κοινοποίηση ενεργή";
      message("");

      startGpsWatch();
      await requestWakeLock();
      startTimers();
      openCrewList();
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
      openCrewList();
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

  async function pollCrews() {
    if (!state.code || !navigator.onLine) return;

    try {
      const rows = await rpc("list_operation_crews", { p_code: state.code });
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
      const accuracy = Number.isFinite(Number(row.accuracy_m))
        ? `±${Math.round(Number(row.accuracy_m))} m`
        : "—";
      const distance = distanceFromMe(row);
      return `
        <article class="crew-list-item ${cls}">
          <div>
            <h3>${escapeHtml(row.vehicle_name)}</h3>
            <div class="crew-list-meta">
              <span>● ${crewStatus(row)}</span>
              <span>🎯 ${accuracy}</span>
              ${distance ? `<span>📍 ${distance}</span>` : ""}
            </div>
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
    return `<div class="crew-marker ${cls}" title="${escapeHtml(row.vehicle_name)}">🚒</div>`;
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

      marker.bindTooltip(escapeHtml(row.vehicle_name), {
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

    const html = `
      <div class="sheet-type"><span style="font-size:28px">🚒</span><span>Live πλήρωμα</span></div>
      <h2>${escapeHtml(row.vehicle_name)}</h2>
      <div class="status-line ${crewClass(row) === "live" ? "available" : "unknown"}">${crewStatus(row)}</div>
      ${distance ? `<p class="distance">📍 ${distance}</p>` : ""}
      <div class="sheet-details">
        <div><span>Ακρίβεια GPS</span><strong>±${Math.round(Number(row.accuracy_m || 0))} m</strong></div>
        <div><span>Τελευταία ενημέρωση</span><strong>${new Date(row.last_seen_at).toLocaleTimeString("el-GR")}</strong></div>
      </div>
      <button class="navigate-button" type="button" data-inline-nav="${row.session_id}">🧭 Πλοήγηση προς το όχημα</button>
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
      ui.activeName.textContent = `${state.vehicleName} · ${state.roomName}`;
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
