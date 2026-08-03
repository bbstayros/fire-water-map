(() => {
  "use strict";
  const dashboard = document.getElementById("dashboardView");
  const sidebar = document.getElementById("adminSidebar");
  const collapse = document.getElementById("collapseSidebar");
  const mobileMenu = document.getElementById("mobileMenu");
  const backdrop = document.getElementById("sidebarBackdrop");

  function setCollapsed(value) {
    dashboard?.classList.toggle("sidebar-collapsed", value);
    localStorage.setItem("fwm-admin-sidebar-collapsed", value ? "1" : "0");
    if (collapse) collapse.textContent = value ? "›" : "‹";
  }

  setCollapsed(localStorage.getItem("fwm-admin-sidebar-collapsed") === "1");
  collapse?.addEventListener("click", () => setCollapsed(!dashboard.classList.contains("sidebar-collapsed")));

  function closeMobile() {
    sidebar?.classList.remove("mobile-open");
    backdrop?.classList.add("hidden");
    document.body.classList.remove("admin-menu-open");
  }
  mobileMenu?.addEventListener("click", () => {
    sidebar?.classList.toggle("mobile-open");
    const open = sidebar?.classList.contains("mobile-open");
    backdrop?.classList.toggle("hidden", !open);
    document.body.classList.toggle("admin-menu-open", !!open);
  });
  backdrop?.addEventListener("click", closeMobile);
  document.querySelectorAll(".nav-item[data-view]").forEach(button => button.addEventListener("click", closeMobile));

  // Make destructive actions clearer without changing their behavior.
  document.addEventListener("click", event => {
    const button = event.target.closest("[data-disable-code], [data-close-room]");
    if (button) button.classList.add("working-action");
  });
})();
