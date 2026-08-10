(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const appMenu = $("appMenuModal");
  const helpModal = $("helpOfflineModal");
  const operationToggle = $("operationToggleButton");
  const originalCrewButton = $("openCrewButton");
  const originalSubmissionButton = $("openSubmissionButton");
  const originalInstallButton = $("installAppButton");
  const crewCount = $("crewCountBadge");

  const modals = [appMenu, helpModal].filter(Boolean);

  function openModal(modal) {
    if (!modal) return;
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    modal?.classList.add("hidden");
    if (modals.every(item => item.classList.contains("hidden"))) {
      document.body.classList.remove("modal-open");
    }
  }

  function bindModal(openId, modalId, closeId) {
    const modal = $(modalId);
    $(openId)?.addEventListener("click", () => openModal(modal));
    $(closeId)?.addEventListener("click", () => closeModal(modal));
    modal?.addEventListener("click", event => {
      if (event.target === modal) closeModal(modal);
    });
  }

  bindModal("openAppMenu", "appMenuModal", "closeAppMenu");

  $("menuSubmissionButton")?.addEventListener("click", () => {
    closeModal(appMenu);
    originalSubmissionButton?.click();
  });

  $("menuInstallButton")?.addEventListener("click", () => {
    closeModal(appMenu);
    originalInstallButton?.click();
  });

  $("menuHelpButton")?.addEventListener("click", () => {
    closeModal(appMenu);
    updateHelpConnection();
    openModal(helpModal);
  });

  $("closeHelpOffline")?.addEventListener("click", () => closeModal(helpModal));
  helpModal?.addEventListener("click", event => {
    if (event.target === helpModal) closeModal(helpModal);
  });

  // One simple vehicle button:
  // OFF -> opens declaration form
  // ON  -> opens the active crew panel, where sharing can be stopped.
  operationToggle?.addEventListener("click", () => {
    const mode = window.FWMAccess?.get?.()?.mode || "public";
    if (!["crew","admin"].includes(mode)) {
      $("menuCrewLoginButton")?.click();
      return;
    }
    originalCrewButton?.click();
  });

  function sharingActive() {
    return originalCrewButton?.classList.contains("sharing") || false;
  }

  function syncOperationState() {
    const active = sharingActive();
    operationToggle?.classList.toggle("is-on", active);
    operationToggle?.setAttribute("aria-pressed", String(active));

    const label = operationToggle?.querySelector(".state-label");
    if (label) label.textContent = active ? "ON" : "OFF";

    const count = Number(crewCount?.textContent || 0);
    const badge = $("operationCrewBadge");
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle("hidden", count <= 0);
    }
  }

  function syncInstallMenu() {
    const menuButton = $("menuInstallButton");
    if (!menuButton || !originalInstallButton) return;

    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      navigator.standalone === true;
    const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
    const shouldShow =
      mobile &&
      !standalone &&
      !originalInstallButton.classList.contains("hidden");

    menuButton.classList.toggle("hidden", !shouldShow);
  }

  function updateHelpConnection() {
    const el = $("helpConnectionState");
    if (!el) return;
    el.innerHTML = navigator.onLine
      ? '<span class="help-online">● Online</span> — υπάρχει σύνδεση δεδομένων.'
      : '<span class="help-offline">● Offline</span> — χρησιμοποιούνται αποθηκευμένα δεδομένα.';
  }

  const observer = new MutationObserver(() => {
    syncOperationState();
    syncInstallMenu();
  });

  if (crewCount) {
    observer.observe(crewCount, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }

  if (originalCrewButton) {
    observer.observe(originalCrewButton, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  if (originalInstallButton) {
    observer.observe(originalInstallButton, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  window.addEventListener("online", updateHelpConnection);
  window.addEventListener("offline", updateHelpConnection);
  window.addEventListener("appinstalled", syncInstallMenu);
  window.addEventListener("beforeinstallprompt", () =>
    setTimeout(syncInstallMenu, 0)
  );

  syncOperationState();
  updateHelpConnection();
  syncInstallMenu();

  window.visualViewport?.addEventListener("resize", () => {
    document.documentElement.style.setProperty(
      "--visible-height",
      `${window.visualViewport.height}px`
    );
  });
})();