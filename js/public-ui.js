(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const operationHub = $("operationHubModal");
  const filtersModal = $("filterOptionsModal");
  const visibleOperationButton = $("openOperationHub");
  const originalOperationButton = $("operationButton");
  const originalCrewButton = $("openCrewButton");
  const originalCrewListButton = $("crewListButton");
  const crewCount = $("crewCountBadge");
  const visibleCrewBadge = $("operationCrewBadge");

  function openModal(modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }

  function closeModal(modal) {
    modal.classList.add("hidden");
    if (operationHub.classList.contains("hidden") && filtersModal.classList.contains("hidden")) {
      document.body.classList.remove("modal-open");
    }
  }

  $("openFilterOptions").addEventListener("click", () => openModal(filtersModal));
  $("closeFilterOptions").addEventListener("click", () => closeModal(filtersModal));
  filtersModal.addEventListener("click", event => {
    if (event.target === filtersModal) closeModal(filtersModal);
  });

  $("showAllProxy").addEventListener("click", () => {
    $("showAllButton").click();
    closeModal(filtersModal);
  });

  visibleOperationButton.addEventListener("click", () => openModal(operationHub));
  $("closeOperationHub").addEventListener("click", () => closeModal(operationHub));
  operationHub.addEventListener("click", event => {
    if (event.target === operationHub) closeModal(operationHub);
  });

  $("operationModeProxy").addEventListener("click", () => {
    originalOperationButton.click();
    syncOperationState();
    closeModal(operationHub);
  });

  $("startCrewProxy").addEventListener("click", () => {
    originalCrewButton.click();
    closeModal(operationHub);
  });

  $("crewListProxy").addEventListener("click", () => {
    originalCrewListButton.click();
    closeModal(operationHub);
  });

  function syncOperationState() {
    const active = originalOperationButton.classList.contains("active");
    visibleOperationButton.classList.toggle("active", active);
    $("operationModeProxy").classList.toggle("active", active);
    $("operationModeProxy").querySelector("strong").textContent =
      active ? "Έξοδος από επιχειρησιακή προβολή" : "Επιχειρησιακή προβολή";
  }

  const observer = new MutationObserver(() => {
    const count = Number(crewCount.textContent || 0);
    visibleCrewBadge.textContent = count;
    visibleCrewBadge.classList.toggle("hidden", count <= 0);
    visibleOperationButton.classList.toggle("sharing", originalCrewButton.classList.contains("sharing"));
  });

  observer.observe(crewCount, { childList: true, subtree: true, attributes: true });
  observer.observe(originalCrewButton, { attributes: true, attributeFilter: ["class"] });
  observer.observe(originalOperationButton, { attributes: true, attributeFilter: ["class"] });

  syncOperationState();

  // Keep the map usable when the mobile keyboard changes the viewport.
  window.visualViewport?.addEventListener("resize", () => {
    document.documentElement.style.setProperty("--visible-height", `${window.visualViewport.height}px`);
  });
})();