(() => {
  "use strict";
  if ("serviceWorker" in navigator) window.addEventListener("load",()=>navigator.serviceWorker.register("./service-worker.js").catch(console.error));
  const status=document.getElementById("offlineStatus");
  const update=()=>{if(!status)return;status.textContent=navigator.onLine?"● Online":"● Offline";status.classList.toggle("online",navigator.onLine);status.classList.toggle("offline",!navigator.onLine);};
  addEventListener("online",update);addEventListener("offline",update);update();
})();
