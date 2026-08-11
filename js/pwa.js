(() => {
  "use strict";

  /*
   * Fire Water Map v3.6.2
   * - forces SW refresh / cache rollover
   * - removes permanent labels over live unit markers
   * - repairs live vehicle icon / tank / details on clients that do not
   *   already have the operation directory in memory (notably Admin/PC)
   */

  const normalize = value => String(value || "").trim().toLocaleLowerCase("el");

  const iconType = vehicle => {
    const type = normalize(vehicle?.vehicle_type);
    if (/πεζο/.test(type)) return "foot-team";
    if (/αγροτικ|ημιφορτηγ|pickup|pick-up/.test(type)) return "pickup";
    if (/υδροφόρ|βυτιοφόρ|φορτηγ/.test(type)) return "tanker";
    if (/πυροσβεσ/.test(type)) return "fire-engine";
    if (/4x4|4×4|τετρακίνη|suv/.test(type)) return "4x4";
    if (/ιχ|επιβατικ/.test(type)) return "car";

    const text = normalize(`${vehicle?.display_name || ""} ${vehicle?.make || ""} ${vehicle?.model || ""}`);
    if (/πεζο|ομάδα|τμήμα/.test(text)) return "foot-team";
    if (/αγροτικ|ημιφορτηγ|pickup|pick-up|l200|navara|hilux|ranger/.test(text)) return "pickup";
    if (/υδροφόρ|βυτιοφόρ/.test(text)) return "tanker";
    if (/πυροσβεσ|fire/.test(text)) return "fire-engine";
    if (/4x4|4×4|τετρακίνη|suv/.test(text)) return "4x4";
    return "car";
  };

  const style = document.createElement("style");
  style.textContent = `.crew-map-label{display:none!important;}`;
  document.head.appendChild(style);

  let registryLoaded = false;
  let registryLoading = false;
  let vehicles = [];
  let members = [];
  const crewByVehicle = new Map();

  const vehicleByName = name => {
    const key = normalize(name);
    return vehicles.find(v => normalize(v.display_name) === key) || null;
  };

  async function loadRegistry() {
    if (registryLoaded || registryLoading) return;
    const ds = window.DataService;
    if (!ds?.client) return;

    registryLoading = true;
    try {
      const vehicleResult = await ds.client
        .from("vehicle_registry")
        .select("id,code,display_name,vehicle_type,water_capacity_l,make,model,year,plate_number,notes,is_active")
        .eq("is_active", true);

      if (!vehicleResult.error) vehicles = vehicleResult.data || [];

      const memberResult = await ds.client
        .from("member_registry")
        .select("id,full_name,callsign,member_role,is_active")
        .eq("is_active", true);

      if (!memberResult.error) members = memberResult.data || [];

      registryLoaded = vehicles.length > 0;
    } catch (error) {
      console.warn("v3.6.2 registry helper:", error);
    } finally {
      registryLoading = false;
    }
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>'"]/g, c => ({
      "&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"
    }[c]));
  }

  function fixMarkerIcons() {
    if (!vehicles.length) return;
    document.querySelectorAll(".crew-vehicle-marker[title]").forEach(marker => {
      const name = marker.getAttribute("title") || "";
      const vehicle = vehicleByName(name);
      if (!vehicle) return;
      const img = marker.querySelector("img.crew-vehicle-marker-icon, img.vehicle-type-icon");
      if (img) img.src = `icons/vehicles/${iconType(vehicle)}.svg`;
    });
  }

  function crewTokens(text) {
    return String(text || "")
      .split(/[·,]/)
      .map(x => x.trim())
      .filter(Boolean);
  }

  function matchedMembers(text) {
    const tokens = crewTokens(text).map(normalize);
    if (!tokens.length) return [];
    return members.filter(m =>
      tokens.some(t =>
        t === normalize(m.callsign) ||
        t === normalize(m.full_name) ||
        t.startsWith(normalize(m.callsign) + " ") ||
        t.includes(normalize(m.full_name))
      )
    );
  }

  function detailsGrid(vehicle) {
    const fields = [
      ["Κωδικός", vehicle.code],
      ["Τύπος", vehicle.vehicle_type],
      ["Μάρκα", vehicle.make],
      ["Μοντέλο", vehicle.model],
      ["Έτος", vehicle.year],
      ["Δεξαμενή", vehicle.water_capacity_l != null ? `${vehicle.water_capacity_l} L` : null],
      ["Πινακίδα", vehicle.plate_number],
      ["Παρατηρήσεις", vehicle.notes]
    ].filter(([,v]) => v !== null && v !== undefined && v !== "");

    return `<dl class="vehicle-details-grid">${fields.map(([l,v]) =>
      `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`
    ).join("")}</dl>`;
  }

  function memberCards(text) {
    const found = matchedMembers(text);
    if (found.length) {
      return found.map(m =>
        `<article class="crew-member-card">
          <strong>${esc(m.callsign || "Χωρίς διακριτικό")}</strong>
          <span>${esc(m.full_name)}</span>
          ${m.member_role ? `<small>${esc(m.member_role)}</small>` : ""}
        </article>`
      ).join("");
    }
    if (text) {
      return `<article class="crew-member-card">
        <span>${esc(text)}</span>
        <small>Δηλωμένο πλήρωμα</small>
      </article>`;
    }
    return `<p class="vehicle-empty-info">Δεν δηλώθηκαν μέλη πληρώματος.</p>`;
  }

  function fixSheet() {
    const content = document.getElementById("sheetContent");
    if (!content || !vehicles.length) return;

    const heading = content.querySelector(".vehicle-sheet-heading h2");
    if (!heading) return;

    const name = heading.textContent.trim();
    const vehicle = vehicleByName(name);
    if (!vehicle) return;

    const icon = content.querySelector(".vehicle-sheet-icon img");
    if (icon) icon.src = `icons/vehicles/${iconType(vehicle)}.svg`;

    // Quick popup: remember crew and repair tank value.
    const crewBlock = content.querySelector(".vehicle-crew-block strong");
    if (crewBlock) crewByVehicle.set(normalize(name), crewBlock.textContent.trim());

    content.querySelectorAll(".vehicle-info-card").forEach(card => {
      const label = card.querySelector("span")?.textContent.trim();
      if (label === "Δεξαμενή" && vehicle.water_capacity_l != null) {
        const strong = card.querySelector("strong");
        if (strong) strong.textContent = `${vehicle.water_capacity_l} L`;
      }
    });

    // Detailed information screen.
    const sections = [...content.querySelectorAll(".vehicle-detail-section")];
    const vehicleSection = sections.find(s => s.querySelector("h3")?.textContent.trim() === "Στοιχεία οχήματος");
    if (vehicleSection) {
      vehicleSection.innerHTML = `<h3>Στοιχεία οχήματος</h3>${detailsGrid(vehicle)}`;
    }

    const crewSection = sections.find(s => s.querySelector("h3")?.textContent.trim() === "Πλήρωμα");
    if (crewSection) {
      const crewText = crewByVehicle.get(normalize(name)) || "";
      crewSection.innerHTML = `<h3>Πλήρωμα</h3><div class="crew-member-list">${memberCards(crewText)}</div>`;
    }
  }

  let repairTimer = null;
  function scheduleRepair() {
    clearTimeout(repairTimer);
    repairTimer = setTimeout(async () => {
      await loadRegistry();
      fixMarkerIcons();
      fixSheet();
    }, 40);
  }

  const observer = new MutationObserver(scheduleRepair);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener("fwm-access-changed", () => {
    registryLoaded = false;
    scheduleRepair();
  });

  window.addEventListener("load", scheduleRepair);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      try {
        const registration = await navigator.serviceWorker.register("./service-worker.js");
        await registration.update();

        let reloading = false;
        navigator.serviceWorker.addEventListener("controllerchange", () => {
          if (reloading) return;
          reloading = true;
          window.location.reload();
        });
      } catch (error) {
        console.error(error);
      }
    });
  }

  const status = document.getElementById("offlineStatus");
  const installButton = document.getElementById("installAppButton");
  const helpModal = document.getElementById("installHelpModal");
  const helpText = document.getElementById("installHelpText");
  const closeHelp = document.getElementById("closeInstallHelp");
  const helpOk = document.getElementById("installHelpOk");
  let deferredPrompt = null;

  const isStandalone = () =>
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;

  const updateConnection = () => {
    if (!status) return;
    status.textContent = navigator.onLine ? "● Online" : "● Offline";
    status.classList.toggle("online", navigator.onLine);
    status.classList.toggle("offline", !navigator.onLine);
  };

  const updateInstallButton = () => {
    if (!installButton) return;
    installButton.classList.toggle("hidden", isStandalone());
  };

  const openHelp = () => {
    if (!helpModal || !helpText) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent || "");
    helpText.innerHTML = ios
      ? "Πάτησε το κουμπί <strong>Κοινή χρήση</strong> του Safari και μετά <strong>Προσθήκη στην οθόνη αφετηρίας</strong>."
      : "Άνοιξε το μενού του browser (<strong>⋮</strong>) και επίλεξε <strong>Εγκατάσταση εφαρμογής</strong> ή <strong>Προσθήκη στην αρχική οθόνη</strong>.";
    helpModal.classList.remove("hidden");
  };

  const closeInstallHelp = () => helpModal?.classList.add("hidden");

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredPrompt = event;
    updateInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    updateInstallButton();
  });

  installButton?.addEventListener("click", async () => {
    if (isStandalone()) {
      updateInstallButton();
      return;
    }
    if (!deferredPrompt) {
      openHelp();
      return;
    }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    updateInstallButton();
  });

  closeHelp?.addEventListener("click", closeInstallHelp);
  helpOk?.addEventListener("click", closeInstallHelp);
  helpModal?.addEventListener("click", event => {
    if (event.target === helpModal) closeInstallHelp();
  });

  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  updateConnection();
  updateInstallButton();
})();
