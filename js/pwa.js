(() => {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./service-worker.js").catch(console.error);
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

  window.addEventListener("beforeinstallprompt", (event) => {
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
  helpModal?.addEventListener("click", (event) => {
    if (event.target === helpModal) closeInstallHelp();
  });

  window.addEventListener("online", updateConnection);
  window.addEventListener("offline", updateConnection);
  updateConnection();
  updateInstallButton();
})();
