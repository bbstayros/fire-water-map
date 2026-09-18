(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const appMenu = $("appMenuModal");
  const operationModeModal = $("operationModeModal");
  const helpModal = $("helpOfflineModal");
  const operationToggle = $("operationToggleButton");
  const originalCrewButton = $("openCrewButton");
  const originalSubmissionButton = $("openSubmissionButton");
  const originalInstallButton = $("installAppButton");
  const crewCount = $("crewCountBadge");
  const notificationToggle = $("notificationToggleButton");
  const mobileMessagesButton = $("mobileMessagesButton");

  const modals = [appMenu, operationModeModal, helpModal].filter(Boolean);

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

  // Vehicle control:
  // LIVE -> opens the active crew/support status.
  // OFF  -> asks whether this is an operational crew or a support vehicle.
  operationToggle?.addEventListener("click", () => {
    if (localStorage.getItem("fwm-support-access-token")) {
      $("menuSupportButton")?.click();
      return;
    }
    if (sharingActive()) {
      originalCrewButton?.click();
      return;
    }
    openModal(operationModeModal);
  });

  $("closeOperationMode")?.addEventListener("click", () => closeModal(operationModeModal));
  operationModeModal?.addEventListener("click", event => {
    if (event.target === operationModeModal) closeModal(operationModeModal);
  });

  $("selectOperationalCrew")?.addEventListener("click", () => {
    closeModal(operationModeModal);
    const mode = window.FWMAccess?.get?.()?.mode || "public";
    if (!["crew", "admin"].includes(mode)) {
      $("menuCrewLoginButton")?.click();
      return;
    }
    originalCrewButton?.click();
  });

  $("selectSupportVehicle")?.addEventListener("click", () => {
    closeModal(operationModeModal);
    $("menuSupportButton")?.click();
  });

  function sharingActive() {
    return originalCrewButton?.classList.contains("sharing") || false;
  }

  function syncOperationState() {
    const active = sharingActive();
    operationToggle?.classList.toggle("is-on", active);
    operationToggle?.setAttribute("aria-pressed", String(active));

    const label = operationToggle?.querySelector(".state-label");
    const title = operationToggle?.querySelector(".toggle-copy strong");
    const supportActive = !!localStorage.getItem("fwm-support-access-token");
    const supportName = localStorage.getItem("fwm-support-name") || "Υποστήριξη";
    const crewName = localStorage.getItem("fwm-crew-name") || "";
    const live = supportActive || active;
    operationToggle?.classList.toggle("is-on", live);
    operationToggle?.setAttribute("aria-pressed", String(live));
    if (label && label.textContent !== (live ? "LIVE" : "OFF")) label.textContent = live ? "LIVE" : "OFF";
    if (title) {
      const supportType = localStorage.getItem("fwm-support-type") || "";
      const supportLabel = supportType && supportName && supportName !== "Υποστήριξη"
        ? `${supportType} · ${supportName}`
        : (supportName || supportType || "Υποστήριξη");
      const wanted = supportActive ? supportLabel : (active && crewName ? crewName : "Όχημα");
      const textNode = Array.from(title.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
      if (textNode && textNode.textContent.trim() !== wanted) textNode.textContent = wanted + " ";
    }

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


  function notificationSource() {
    // Normal crew messaging uses #v373AlarmEnable.
    // Guest Support / map alerts use .fwm-center-alert-enable.
    return $("v373AlarmEnable") || document.querySelector(".fwm-center-alert-enable");
  }

  function syncNotificationState() {
    const source = notificationSource();
    if (!notificationToggle) return;
    const on = !!source?.classList.contains("on");
    notificationToggle.classList.toggle("is-on", on);
    notificationToggle.setAttribute("aria-pressed", String(on));
    const label = notificationToggle.querySelector(".state-label");
    if (label && label.textContent !== (on ? "ON" : "OFF")) label.textContent = on ? "ON" : "OFF";
  }

  notificationToggle?.addEventListener("click", () => {
    const source = notificationSource();
    if (!source) {
      console.warn("Fire Water Map: notification controller not available");
      return;
    }
    source.click();
    setTimeout(syncNotificationState, 150);
    setTimeout(syncNotificationState, 800);
  });

  function syncMessageBadge() {
    const source = $("v37Unread");
    const badge = $("mobileMessagesBadge");
    if (!badge) return;
    const supportActive = !!localStorage.getItem("fwm-support-access-token");
    const n = supportActive
      ? Number(localStorage.getItem("fwm-support-unread-count") || 0)
      : Number(source?.textContent || 0);
    if (badge.textContent !== String(n)) badge.textContent = String(n);
    badge.classList.toggle("hidden", n <= 0);
  }

  mobileMessagesButton?.addEventListener("click", () => {
    if (localStorage.getItem("fwm-support-access-token")) $("supportMessageFabV381")?.click();
    else $("v37MsgFab")?.click();
  });

  $("menuOfflinePrepButton")?.addEventListener("click", () => {
    closeModal(appMenu);
    updateHelpConnection();
    openModal(helpModal);
  });

  const observer = new MutationObserver(() => {
    syncOperationState();
    syncInstallMenu();
    syncNotificationState();
    syncMessageBadge();
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

  const alarmSource = notificationSource();
  if (alarmSource) observer.observe(alarmSource, { attributes: true, attributeFilter: ["class"] });
  const unreadSource = $("v37Unread");
  if (unreadSource) observer.observe(unreadSource, { childList: true, subtree: true });

  window.addEventListener("fwm-support-unread-changed", syncMessageBadge);
  window.addEventListener("online", updateHelpConnection);
  window.addEventListener("offline", updateHelpConnection);
  window.addEventListener("appinstalled", syncInstallMenu);
  window.addEventListener("beforeinstallprompt", () =>
    setTimeout(syncInstallMenu, 0)
  );

  syncOperationState();
  syncNotificationState();
  syncMessageBadge();
  updateHelpConnection();
  syncInstallMenu();

  window.visualViewport?.addEventListener("resize", () => {
    document.documentElement.style.setProperty(
      "--visible-height",
      `${window.visualViewport.height}px`
    );
  });
})();