(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const modals = [$("appMenuModal"), $("crewHubModal"), $("helpOfflineModal")].filter(Boolean);
  const originalOperationButton = $("operationButton");
  const originalCrewButton = $("openCrewButton");
  const originalCrewListButton = $("crewListButton");
  const originalSubmissionButton = $("openSubmissionButton");
  const originalInstallButton = $("installAppButton");
  const operationToggle = $("operationToggleButton");
  const crewCount = $("crewCountBadge");

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
  bindModal("openCrewHub", "crewHubModal", "closeCrewHub");

  $("menuSubmissionButton")?.addEventListener("click", () => {
    closeModal($("appMenuModal"));
    originalSubmissionButton?.click();
  });

  $("menuInstallButton")?.addEventListener("click", () => {
    closeModal($("appMenuModal"));
    originalInstallButton?.click();
  });

  $("menuHelpButton")?.addEventListener("click", () => {
    closeModal($("appMenuModal"));
    updateHelpConnection();
    openModal($("helpOfflineModal"));
  });

  $("closeHelpOffline")?.addEventListener("click", () => closeModal($("helpOfflineModal")));
  $("helpOfflineModal")?.addEventListener("click", event => {
    if (event.target === $("helpOfflineModal")) closeModal($("helpOfflineModal"));
  });

  $("crewDeclareProxy")?.addEventListener("click", () => {
    closeModal($("crewHubModal"));
    originalCrewButton?.click();
  });

  $("crewViewProxy")?.addEventListener("click", () => {
    closeModal($("crewHubModal"));
    originalCrewListButton?.click();
  });

  operationToggle?.addEventListener("click", () => {
    originalOperationButton?.click();
    syncOperationState();
  });

  function syncOperationState() {
    const active = originalOperationButton?.classList.contains("active") || false;
    operationToggle?.classList.toggle("is-on", active);
    operationToggle?.setAttribute("aria-pressed", String(active));
    const label = operationToggle?.querySelector(".state-label");
    if (label) label.textContent = active ? "ON" : "OFF";
  }

  function updateCrewBadges() {
    const count = Number(crewCount?.textContent || 0);
    [$("dockCrewBadge"), $("crewHubBadge")].forEach(badge => {
      if (!badge) return;
      badge.textContent = count;
      badge.classList.toggle("hidden", count <= 0);
    });
    $("openCrewHub")?.classList.toggle("has-live-crews", count > 0);
  }

  function syncInstallMenu() {
    const menuButton = $("menuInstallButton");
    if (!menuButton || !originalInstallButton) return;
    const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    const mobile = /android|iphone|ipad|ipod/i.test(navigator.userAgent || "");
    const shouldShow = mobile && !standalone && !originalInstallButton.classList.contains("hidden");
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
    updateCrewBadges();
    syncInstallMenu();
    $("openCrewHub")?.classList.toggle("is-sharing", originalCrewButton?.classList.contains("sharing") || false);
  });

  if (crewCount) observer.observe(crewCount, { childList: true, subtree: true, attributes: true });
  if (originalCrewButton) observer.observe(originalCrewButton, { attributes: true, attributeFilter: ["class"] });
  if (originalInstallButton) observer.observe(originalInstallButton, { attributes: true, attributeFilter: ["class"] });
  if (originalOperationButton) observer.observe(originalOperationButton, { attributes: true, attributeFilter: ["class"] });

  window.addEventListener("online", updateHelpConnection);
  window.addEventListener("offline", updateHelpConnection);
  window.addEventListener("appinstalled", syncInstallMenu);
  window.addEventListener("beforeinstallprompt", () => setTimeout(syncInstallMenu, 0));

  syncOperationState();
  updateCrewBadges();
  updateHelpConnection();
  syncInstallMenu();

  window.visualViewport?.addEventListener("resize", () => {
    document.documentElement.style.setProperty("--visible-height", `${window.visualViewport.height}px`);
  });
})();