(() => {
  const config = window.APP_CONFIG;
  const map = L.map("map", {
    zoomControl: true
  }).setView(config.initialCenter, config.initialZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const pointLayer = L.featureGroup().addTo(map);
  const statusMessage = document.getElementById("statusMessage");
  let statusTimer = null;

  function showStatus(message) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.style.display = "block";

    statusTimer = window.setTimeout(() => {
      statusMessage.style.display = "none";
    }, 4200);
  }

  async function loadPoints() {
    try {
      const response = await fetch(config.pointsUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const geojson = await response.json();

      L.geoJSON(geojson, {
        pointToLayer(feature, latlng) {
          return L.marker(latlng, {
            icon: window.WaterPoints.createIcon(feature.properties.category)
          });
        },
        onEachFeature(feature, layer) {
          layer.bindPopup(window.WaterPoints.popupHtml(feature));
          pointLayer.addLayer(layer);
        }
      });

      if (pointLayer.getLayers().length > 0) {
        map.fitBounds(pointLayer.getBounds(), {
          padding: [45, 45],
          maxZoom: 15
        });
      }
    } catch (error) {
      console.error(error);
      showStatus("Δεν ήταν δυνατή η φόρτωση των σημείων.");
    }
  }

  document.getElementById("locationButton").addEventListener("click", () => {
    window.UserLocation.locate(map, showStatus);
  });

  document.getElementById("fitPointsButton").addEventListener("click", () => {
    if (pointLayer.getLayers().length === 0) {
      showStatus("Δεν υπάρχουν διαθέσιμα σημεία.");
      return;
    }

    map.fitBounds(pointLayer.getBounds(), {
      padding: [45, 45],
      maxZoom: 15
    });
  });

  loadPoints();
})();
