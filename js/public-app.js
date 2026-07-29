(() => {
  "use strict";

  const config = window.APP_CONFIG;
  const dataService = window.DataService;

  // Hide the administration shortcut only on phones. Android tablets do not
  // normally include the "Mobile" token, so the shortcut remains visible there.
  const phoneUserAgent = /iPhone|iPod|Windows Phone|Android.*Mobile|BlackBerry|Opera Mini|IEMobile/i;
  if (phoneUserAgent.test(navigator.userAgent || "")) {
    const adminPanelLink = document.querySelector(".admin-panel-link");
    if (adminPanelLink) adminPanelLink.style.setProperty("display", "none", "important");
  }

  const map = L.map("map", {
    zoomControl: false,
    preferCanvas: true
  }).setView(config.initialCenter, config.initialZoom);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const iconMap = {
    hydrant: "icons/hydrant.svg",
    tank: "icons/tank.svg",
    water_source: "icons/water-source.svg"
  };

  const categoryLabels = {
    hydrant: "Κρουνός",
    tank: "Δεξαμενή",
    water_source: "Σημείο υδροληψίας"
  };

  const conditionLabels = {
    available: "Λειτουργικό",
    unknown: "Άγνωστη κατάσταση",
    unavailable: "Εκτός λειτουργίας"
  };

  const state = {
    points: [],
    markers: [],
    user: null,
    userMarker: null,
    accuracyCircle: null,
    radiusCircle: null,
    radiusKm: Number(config.defaultRadiusKm) || 4,
    nearby: false
  };

  const toastElement = document.getElementById("toast");
  const sheet = document.getElementById("bottomSheet");
  const sheetContent = document.getElementById("sheetContent");
  const locateButton = document.getElementById("locateButton");
  let toastTimer = null;

  document.getElementById("organisationName").textContent = config.organisation;

  function toast(message, type = "info") {
    window.clearTimeout(toastTimer);
    toastElement.textContent = message;
    toastElement.dataset.type = type;
    toastElement.classList.add("show");
    toastTimer = window.setTimeout(() => toastElement.classList.remove("show"), 3800);
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const earthRadiusKm = 6371;
    const toRadians = (value) => (value * Math.PI) / 180;
    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
  }

  function formatDistance(km) {
    if (km < 1) return `${Math.round(km * 1000)} m από εσένα`;
    return `${km.toFixed(km < 10 ? 1 : 0)} km από εσένα`;
  }

  function markerIcon(category) {
    return L.icon({
      iconUrl: iconMap[category] || iconMap.water_source,
      iconSize: [38, 46],
      iconAnchor: [19, 44],
      popupAnchor: [0, -42]
    });
  }

  function currentCategories() {
    return [...document.querySelectorAll(".filter-chip input:checked")].map(
      (input) => input.value
    );
  }

  function visiblePoints() {
    const query = document
      .getElementById("searchInput")
      .value.trim()
      .toLocaleLowerCase("el");
    const categories = currentCategories();

    return state.points
      .filter((point) => categories.includes(point.category))
      .filter((point) => {
        if (!query) return true;
        return `${point.name} ${point.notes}`
          .toLocaleLowerCase("el")
          .includes(query);
      })
      .filter((point) => {
        if (!state.nearby || !state.user) return true;
        return (
          distanceKm(
            state.user.lat,
            state.user.lng,
            point.latitude,
            point.longitude
          ) <= state.radiusKm
        );
      });
  }

  function render() {
    state.markers.forEach((marker) => map.removeLayer(marker));
    state.markers = [];

    const visible = visiblePoints();

    visible.forEach((point) => {
      const marker = L.marker([point.latitude, point.longitude], {
        icon: markerIcon(point.category),
        title: point.name,
        keyboard: true
      })
        .addTo(map)
        .on("click", () => openSheet(point));

      state.markers.push(marker);
    });

    document.getElementById("mapCounter").textContent =
      visible.length === 1 ? "1 σημείο" : `${visible.length} σημεία`;

    return state.markers;
  }

  function openSheet(point) {
    const distance = state.user
      ? formatDistance(
          distanceKm(
            state.user.lat,
            state.user.lng,
            point.latitude,
            point.longitude
          )
        )
      : "";

    const navigationUrl =
      `https://www.google.com/maps/dir/?api=1&destination=` +
      `${point.latitude},${point.longitude}`;

    sheetContent.innerHTML = `
      <div class="sheet-type">
        <img src="${iconMap[point.category]}" alt="">
        <span>${categoryLabels[point.category]}</span>
      </div>
      <h2>${escapeHtml(point.name)}</h2>
      <div class="status-line ${point.condition}">
        ${conditionLabels[point.condition]}
      </div>
      ${distance ? `<p class="distance">📍 ${distance}</p>` : ""}
      <div class="sheet-details">
        <div>
          <span>Τελευταίος έλεγχος</span>
          <strong>${escapeHtml(point.last_checked_at || "Δεν έχει καταχωριστεί")}</strong>
        </div>
        <div>
          <span>Παρατηρήσεις</span>
          <strong>${escapeHtml(point.notes || "Δεν υπάρχουν παρατηρήσεις")}</strong>
        </div>
      </div>
      <a class="navigate-button" target="_blank" rel="noopener noreferrer" href="${navigationUrl}">
        🧭 Έναρξη πλοήγησης
      </a>
    `;

    sheet.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    sheet.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
  }

  function removeRadiusCircle() {
    if (state.radiusCircle) {
      map.removeLayer(state.radiusCircle);
      state.radiusCircle = null;
    }
  }

  function redrawRadius() {
    removeRadiusCircle();

    if (!state.nearby || !state.user) return;

    state.radiusCircle = L.circle([state.user.lat, state.user.lng], {
      radius: state.radiusKm * 1000,
      weight: 2,
      dashArray: "8 8",
      fillOpacity: 0.05,
      interactive: false
    }).addTo(map);
  }

  function fitMarkers(markers, includeRadius = false) {
    const layers = [...markers];
    if (includeRadius && state.radiusCircle) layers.push(state.radiusCircle);

    if (!layers.length) {
      map.setView(config.initialCenter, config.initialZoom);
      return;
    }

    const bounds = L.featureGroup(layers).getBounds();
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [38, 38], maxZoom: 15 });
    }
  }

  function applyNearby() {
    redrawRadius();
    const markers = render();
    fitMarkers(markers, true);
    toast(
      `${markers.length} ${markers.length === 1 ? "σημείο" : "σημεία"} σε ακτίνα ${state.radiusKm} km`
    );
  }

  function updateLocateLabel() {
    locateButton.querySelector("span:last-child").textContent =
      `Η θέση μου · ${state.radiusKm} km`;
  }

  document.getElementById("sheetClose").addEventListener("click", closeSheet);
  map.on("click", closeSheet);

  document.querySelectorAll('input[name="radius"]').forEach((input) => {
    input.addEventListener("change", () => {
      state.radiusKm = Number(input.value);
      updateLocateLabel();
      if (state.nearby && state.user) applyNearby();
    });
  });

  document.querySelectorAll(".filter-chip input").forEach((input) => {
    input.addEventListener("change", () => {
      const markers = render();
      if (!markers.length) toast("Δεν υπάρχουν σημεία με τα επιλεγμένα φίλτρα.");
    });
  });

  document.getElementById("searchInput").addEventListener("input", render);

  document.getElementById("clearSearch").addEventListener("click", () => {
    document.getElementById("searchInput").value = "";
    render();
  });

  document.getElementById("showAllButton").addEventListener("click", () => {
    state.nearby = false;
    removeRadiusCircle();
    closeSheet();

    document.querySelectorAll(".filter-chip input").forEach((input) => {
      input.checked = true;
    });

    document.getElementById("searchInput").value = "";
    const markers = render();
    fitMarkers(markers);
    toast("Εμφανίζονται όλα τα σημεία.");
  });

  locateButton.addEventListener("click", () => {
    if (!navigator.geolocation) {
      toast("Η συσκευή δεν υποστηρίζει GPS.", "error");
      return;
    }

    locateButton.disabled = true;
    toast("Εντοπισμός θέσης…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.user = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        state.nearby = true;

        if (state.userMarker) map.removeLayer(state.userMarker);
        if (state.accuracyCircle) map.removeLayer(state.accuracyCircle);

        state.userMarker = L.circleMarker([state.user.lat, state.user.lng], {
          radius: 9,
          weight: 4,
          color: "#fff",
          fillColor: "#1565c0",
          fillOpacity: 1
        })
          .addTo(map)
          .bindTooltip("Η θέση μου");

        state.accuracyCircle = L.circle([state.user.lat, state.user.lng], {
          radius: state.user.accuracy,
          weight: 1,
          fillOpacity: 0.08,
          interactive: false
        }).addTo(map);

        applyNearby();
        locateButton.disabled = false;
      },
      (error) => {
        locateButton.disabled = false;
        const messages = {
          1: "Δεν δόθηκε άδεια πρόσβασης στη θέση.",
          2: "Η θέση της συσκευής δεν είναι διαθέσιμη.",
          3: "Η αναζήτηση θέσης καθυστέρησε υπερβολικά."
        };
        toast(messages[error.code] || "Δεν ήταν δυνατός ο εντοπισμός θέσης.", "error");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;"
      }[character];
    });
  }

  async function boot() {
    updateLocateLabel();

    const badge = document.getElementById("dataBadge");

    try {
      const result = await dataService.publicPoints();
      state.points = result.points;
      badge.textContent =
        result.source === "supabase" ? "Ζωντανά δεδομένα" : "Λειτουργία επίδειξης";
      badge.className = `connection-badge ${result.source}`;
      const markers = render();
      fitMarkers(markers);
    } catch (error) {
      console.error(error);
      badge.textContent = "Σφάλμα δεδομένων";
      badge.className = "connection-badge error";
      toast(error.message || "Δεν ήταν δυνατή η φόρτωση των σημείων.", "error");
    }
  }

  boot();
})();
