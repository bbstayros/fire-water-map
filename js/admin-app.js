(() => {
  "use strict";

  const config = window.APP_CONFIG;
  const dataService = window.DataService;

  const labels = {
    hydrant: "Κρουνός",
    tank: "Δεξαμενή",
    water_source: "Υδροληψία"
  };

  const conditions = {
    available: "Λειτουργικό",
    unknown: "Άγνωστη",
    unavailable: "Εκτός λειτουργίας"
  };

  const publications = {
    pending: "Εκκρεμές",
    published: "Δημοσιευμένο",
    hidden: "Κρυφό"
  };

  const state = {
    points: [],
    map: null,
    marker: null,
    editingId: null,
    user: null,
    profile: null
  };

  const loginView = document.getElementById("loginView");
  const dashboard = document.getElementById("dashboardView");
  const sidebar = document.querySelector(".sidebar");

  function message(id, text, error = false) {
    const element = document.getElementById(id);
    element.textContent = text;
    element.classList.toggle("error", error);
  }

  function showLogin() {
    dashboard.classList.add("hidden");
    loginView.classList.remove("hidden");
    sidebar.classList.remove("mobile-open");
  }

  async function showDashboard() {
    const { user, profile } = await dataService.currentUserAndProfile();

    if (!user || !profile || !profile.is_active) {
      throw new Error("Ο λογαριασμός δεν είναι ενεργός.");
    }

    if (!["editor", "admin"].includes(profile.role)) {
      throw new Error("Ο λογαριασμός δεν έχει δικαίωμα διαχείρισης.");
    }

    state.user = user;
    state.profile = profile;

    document.getElementById("signedInUser").textContent =
      profile.full_name || user.email;
    document.getElementById("signedInRole").textContent =
      profile.role === "admin" ? "Διαχειριστής" : "Συντάκτης";

    loginView.classList.add("hidden");
    dashboard.classList.remove("hidden");

    await loadPoints();
    setView("overview");
  }

  document.getElementById("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    if (!dataService.configured) {
      message(
        "loginMessage",
        "Δεν έχουν ρυθμιστεί σωστά τα στοιχεία Supabase στο js/config.js.",
        true
      );
      return;
    }

    message("loginMessage", "Σύνδεση…");

    try {
      await dataService.signIn(
        document.getElementById("loginEmail").value.trim(),
        document.getElementById("loginPassword").value
      );
      message("loginMessage", "");
      await showDashboard();
    } catch (error) {
      console.error(error);
      message("loginMessage", readableAuthError(error), true);
    }
  });

  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await dataService.signOut();
    } catch (error) {
      console.error(error);
    } finally {
      state.points = [];
      state.user = null;
      state.profile = null;
      showLogin();
    }
  });

  document.getElementById("mobileMenu").addEventListener("click", () => {
    sidebar.classList.toggle("mobile-open");
  });

  async function loadPoints() {
    try {
      state.points = await dataService.allPoints();
      renderAll();
    } catch (error) {
      console.error(error);
      alert(error.message || "Δεν ήταν δυνατή η φόρτωση των σημείων.");
    }
  }

  function renderAll() {
    renderStats();
    renderTable();
    renderRecent();
  }

  function renderStats() {
    document.getElementById("statTotal").textContent = state.points.length;
    document.getElementById("statHydrants").textContent = state.points.filter(
      (point) => point.category === "hydrant"
    ).length;
    document.getElementById("statTanks").textContent = state.points.filter(
      (point) => point.category === "tank"
    ).length;
    document.getElementById("statSources").textContent = state.points.filter(
      (point) => point.category === "water_source"
    ).length;

    const summary = {
      available: 0,
      unknown: 0,
      unavailable: 0
    };

    state.points.forEach((point) => {
      if (summary[point.condition] !== undefined) summary[point.condition] += 1;
    });

    document.getElementById("conditionSummary").innerHTML = Object.entries(summary)
      .map(
        ([key, value]) => `
          <div>
            <span>${conditions[key]}</span>
            <strong>${value}</strong>
          </div>
        `
      )
      .join("");
  }

  function renderRecent() {
    const recent = state.points.slice(0, 6);
    const container = document.getElementById("recentPoints");

    container.innerHTML = recent.length
      ? recent
          .map(
            (point) => `
              <button type="button" data-recent-edit="${point.id}">
                <span>
                  <strong>${escapeHtml(point.name)}</strong>
                  <small>${labels[point.category]} · ${publications[point.publication_status]}</small>
                </span>
                <b>›</b>
              </button>
            `
          )
          .join("")
      : "<p>Δεν υπάρχουν σημεία.</p>";

    container.querySelectorAll("[data-recent-edit]").forEach((button) => {
      button.addEventListener("click", () => editPoint(button.dataset.recentEdit));
    });
  }

  function filteredPoints() {
    const query = document
      .getElementById("adminSearch")
      .value.trim()
      .toLocaleLowerCase("el");
    const category = document.getElementById("adminCategory").value;
    const publication = document.getElementById("adminPublication").value;

    return state.points.filter((point) => {
      const haystack = `${point.name} ${point.notes}`.toLocaleLowerCase("el");
      return (
        (!query || haystack.includes(query)) &&
        (!category || point.category === category) &&
        (!publication || point.publication_status === publication)
      );
    });
  }

  function renderTable() {
    const body = document.getElementById("pointsTableBody");
    const rows = filteredPoints();

    body.innerHTML = rows.length
      ? rows
          .map(
            (point) => `
              <tr>
                <td>
                  <strong>${escapeHtml(point.name)}</strong>
                  <small>${point.latitude.toFixed(5)}, ${point.longitude.toFixed(5)}</small>
                </td>
                <td>${labels[point.category]}</td>
                <td><span class="table-status ${point.condition}">${conditions[point.condition]}</span></td>
                <td><span class="publication-status ${point.publication_status}">${publications[point.publication_status]}</span></td>
                <td class="row-actions">
                  <button type="button" data-edit="${point.id}" title="Επεξεργασία" aria-label="Επεξεργασία">✏️</button>
                  ${
                    state.profile?.role === "admin"
                      ? `<button type="button" data-delete="${point.id}" title="Διαγραφή" aria-label="Διαγραφή">🗑️</button>`
                      : ""
                  }
                </td>
              </tr>
            `
          )
          .join("")
      : '<tr><td colspan="5" class="empty-table">Δεν βρέθηκαν σημεία.</td></tr>';

    body.querySelectorAll("[data-edit]").forEach((button) => {
      button.addEventListener("click", () => editPoint(button.dataset.edit));
    });

    body.querySelectorAll("[data-delete]").forEach((button) => {
      button.addEventListener("click", () => removePoint(button.dataset.delete));
    });
  }

  document.getElementById("adminSearch").addEventListener("input", renderTable);
  document.getElementById("adminCategory").addEventListener("change", renderTable);
  document.getElementById("adminPublication").addEventListener("change", renderTable);

  const viewMeta = {
    overview: ["Επισκόπηση", "Συνολική εικόνα των σημείων νερού"],
    points: ["Σημεία", "Αναζήτηση και διαχείριση"],
    editor: ["Νέο σημείο", "Καταχώρηση ή επεξεργασία"]
  };

  function setView(name) {
    document.querySelectorAll(".dashboard-section").forEach((section) => {
      section.classList.add("hidden");
    });

    document.getElementById(`${name}View`).classList.remove("hidden");

    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === name);
    });

    document.getElementById("viewTitle").textContent = viewMeta[name][0];
    document.getElementById("viewSubtitle").textContent = viewMeta[name][1];
    sidebar.classList.remove("mobile-open");

    if (name === "editor") {
      ensureMap();
      window.setTimeout(() => state.map.invalidateSize(), 100);
    }
  }

  document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.view === "editor") resetForm();
      setView(button.dataset.view);
    });
  });

  document.getElementById("newPointButton").addEventListener("click", () => {
    resetForm();
    setView("editor");
  });

  function ensureMap() {
    if (state.map) return;

    state.map = L.map("adminMap").setView(config.initialCenter, config.initialZoom);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(state.map);

    state.map.on("click", (event) => {
      setCoordinates(event.latlng.lat, event.latlng.lng, false);
    });
  }

  function setCoordinates(latitude, longitude, zoom = true) {
    const lat = Number(latitude);
    const lng = Number(longitude);

    document.getElementById("pointLatitude").value = lat.toFixed(7);
    document.getElementById("pointLongitude").value = lng.toFixed(7);

    if (state.marker) {
      state.marker.setLatLng([lat, lng]);
    } else {
      state.marker = L.marker([lat, lng], { draggable: true }).addTo(state.map);
      state.marker.on("dragend", () => {
        const position = state.marker.getLatLng();
        setCoordinates(position.lat, position.lng, false);
      });
    }

    if (zoom) state.map.setView([lat, lng], 17);
  }

  function resetForm() {
    state.editingId = null;
    document.getElementById("pointForm").reset();
    document.getElementById("pointId").value = "";
    document.getElementById("pointCondition").value = "unknown";
    document.getElementById("pointPublication").value = "pending";
    document.getElementById("formTitle").textContent = "Νέο σημείο";
    message("formMessage", "");

    ensureMap();

    if (state.marker) {
      state.map.removeLayer(state.marker);
      state.marker = null;
    }

    state.map.setView(config.initialCenter, config.initialZoom);
  }

  function editPoint(id) {
    const point = state.points.find((item) => item.id === id);
    if (!point) return;

    state.editingId = id;
    ensureMap();
    setView("editor");

    document.getElementById("formTitle").textContent = "Επεξεργασία σημείου";
    document.getElementById("pointId").value = point.id;
    document.getElementById("pointName").value = point.name;
    document.getElementById("pointCategory").value = point.category;
    document.getElementById("pointCondition").value = point.condition;
    document.getElementById("pointPublication").value = point.publication_status;
    document.getElementById("pointLastChecked").value = point.last_checked_at || "";
    document.getElementById("pointNotes").value = point.notes || "";
    setCoordinates(point.latitude, point.longitude);
  }

  document.getElementById("pointForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const point = {
      id: document.getElementById("pointId").value || null,
      name: document.getElementById("pointName").value,
      category: document.getElementById("pointCategory").value,
      condition: document.getElementById("pointCondition").value,
      publication_status: document.getElementById("pointPublication").value,
      last_checked_at: document.getElementById("pointLastChecked").value || null,
      latitude: document.getElementById("pointLatitude").value,
      longitude: document.getElementById("pointLongitude").value,
      notes: document.getElementById("pointNotes").value
    };

    message("formMessage", "Αποθήκευση…");

    try {
      await dataService.savePoint(point);
      message("formMessage", "Το σημείο αποθηκεύτηκε επιτυχώς.");
      await loadPoints();
      window.setTimeout(() => {
        setView("points");
        resetForm();
      }, 500);
    } catch (error) {
      console.error(error);
      message("formMessage", error.message || "Η αποθήκευση απέτυχε.", true);
    }
  });

  document.getElementById("cancelEditButton").addEventListener("click", () => {
    resetForm();
    setView("points");
  });

  document.getElementById("useGpsButton").addEventListener("click", () => {
    if (!navigator.geolocation) {
      message("formMessage", "Η συσκευή δεν υποστηρίζει GPS.", true);
      return;
    }

    message("formMessage", "Εντοπισμός θέσης…");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        ensureMap();
        setCoordinates(position.coords.latitude, position.coords.longitude);
        message("formMessage", "Η θέση καταχωρίστηκε.");
      },
      (error) => {
        const messages = {
          1: "Δεν δόθηκε άδεια πρόσβασης στη θέση.",
          2: "Η θέση της συσκευής δεν είναι διαθέσιμη.",
          3: "Η αναζήτηση θέσης καθυστέρησε υπερβολικά."
        };
        message(
          "formMessage",
          messages[error.code] || "Δεν ήταν δυνατός ο εντοπισμός.",
          true
        );
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 5000
      }
    );
  });

  async function removePoint(id) {
    const point = state.points.find((item) => item.id === id);
    if (!point) return;

    if (state.profile?.role !== "admin") {
      alert("Μόνο ο διαχειριστής μπορεί να διαγράψει σημεία.");
      return;
    }

    const confirmed = window.confirm(
      `Να διαγραφεί οριστικά το σημείο «${point.name}»;`
    );

    if (!confirmed) return;

    try {
      await dataService.deletePoint(id);
      await loadPoints();
    } catch (error) {
      console.error(error);
      alert(error.message || "Η διαγραφή απέτυχε.");
    }
  }

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

  function readableAuthError(error) {
    const messageText = String(error?.message || "");
    if (messageText.toLowerCase().includes("invalid login credentials")) {
      return "Λάθος email ή κωδικός.";
    }
    return messageText || "Η σύνδεση απέτυχε.";
  }

  async function boot() {
    if (!dataService.configured) {
      message(
        "loginMessage",
        "Δεν έχουν ρυθμιστεί σωστά τα στοιχεία Supabase στο js/config.js.",
        true
      );
      return;
    }

    try {
      const session = await dataService.getSession();
      if (session) await showDashboard();
    } catch (error) {
      console.error(error);
      try {
        await dataService.signOut();
      } catch (_) {
        // Δεν χρειάζεται άλλη ενέργεια.
      }
      showLogin();
      message("loginMessage", error.message || "Η συνεδρία δεν είναι έγκυρη.", true);
    }
  }

  dataService.onAuthStateChange((_event, session) => {
    if (!session && !dashboard.classList.contains("hidden")) showLogin();
  });

  boot();
})();
