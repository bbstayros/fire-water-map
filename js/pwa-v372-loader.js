(() => {
  "use strict";
  if(!document.querySelector('script[src*="map-message-alerts-v372.js"]')){
    const s=document.createElement("script");
    s.src="js/map-message-alerts-v372.js";
    s.defer=true;
    document.head.appendChild(s);
  }
})();