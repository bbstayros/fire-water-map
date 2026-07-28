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

  const categoryGroups = {
    hydrant: L.layerGroup().addTo(map),
    tank: L.layerGroup().addTo(map),
    water_source: L.layerGroup().addTo(map)
  };

  const allMarkers = [];
  const statusMessage = document.getElementById("statusMessage");
  const visiblePointsCount = document.getElementById("visiblePointsCount");

  const filterInputs = {
    hydrant: document.getElementById("filterHydrants"),
    tank: document.getElementById("filterTanks"),
    water_source: document.getElementById("filterWaterSources")
  };

  let statusTimer = null;
  let userPosition = null;
  let nearbyMode = false;

  function showStatus(message) {
    window.clearTimeout(statusTimer);
    statusMessage.textContent = message;
    statusMessage.style.display = "block";

    statusTimer = window.setTimeout(() => {
      statusMessage.style.display = "none";
    }, 4500);
  }

  function distanceKm(lat1, lng1, lat2, lng2) {
    const earthRadiusKm = 6371;
    const toRadians = (degrees) => degrees * Math.PI / 180;

    const dLat = toRadians(lat2 - lat1);
    const dLng = toRadians(lng2 - lng1);

    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRadians(lat1)) *
        Math.cos(toRadians(lat2)) *
        Math.sin(dLng / 2) ** 2;

    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
  }

  function categoryIsEnabled(category) {
    return Boolean(filterInputs[category]?.checked);
  }

  function markerPassesRadius(markerItem) {
    if (!nearbyMode || !userPosition) {
      return true;
    }

    return distanceKm(
      userPosition.latitude,
      userPosition.longitude,
      markerItem.latitude,
      markerItem.longitude
    ) <= config.nearbyRadiusKm;
  }

  function updateVisibleLayers() {
    Object.values(categoryGroups).forEach((group) => group.clearLayers());

    let visibleCount = 0;
    const visibleMarkers = [];

    allMarkers.forEach((item) => {
      if (!categoryIsEnabled(item.category)) {
        return;
      }

      if (!markerPassesRadius(item)) {
        return;
      }

      categoryGroups[item.category].addLayer(item.marker);
      visibleMarkers.push(item.marker);
      visibleCount += 1;
    });

    visiblePointsCount.textContent = `Ορατά σημεία: ${visibleCount}`;
    return visibleMarkers;
  }

  function fitToMarkers(markers, fallbackCenter = null) {
    if (markers.length > 0) {
      const group = L.featureGroup(markers);
      map.fitBounds(group.getBounds(), {
        padding: [45, 45],
        maxZoom: 15
      });
      return;
    }

    if (fallbackCenter) {
      map.setView(fallbackCenter, 13);
    }
  }

  async function loadPoints() {
    try {
      const response = await fetch(config.pointsUrl, { cache: "no-store" });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const geojson = await response.json();

      geojson.features.forEach((feature) => {
        const [longitude, latitude] = feature.geometry.coordinates;
        const category = feature.properties.category;

        const marker = L.marker([latitude, longitude], {
          icon: window.WaterPoints.createIcon(category)
        });

        marker.bindPopup(window.WaterPoints.popupHtml(feature));

        allMarkers.push({
          marker,
          category,
          latitude,
          longitude
        });
      });

      const visibleMarkers = updateVisibleLayers();
      fitToMarkers(visibleMarkers, config.initialCenter);
    } catch (error) {
      console.error(error);
      showStatus("Δεν ήταν δυνατή η φόρτωση των σημείων.");
    }
  }

  Object.entries(filterInputs).forEach(([category, input]) => {
    input.addEventListener("change", () => {
      const visibleMarkers = updateVisibleLayers();

      if (visibleMarkers.length === 0) {
        showStatus("Δεν υπάρχουν ορατά σημεία με τα επιλεγμένα φίλτρα.");
      }
    });
  });

  document.getElementById("locationButton").addEventListener("click", () => {
    window.UserLocation.locate(map, showStatus, {
      onSuccess(position) {
        userPosition = position;
        nearbyMode = true;

        const visibleMarkers = updateVisibleLayers();

        if (visibleMarkers.length === 0) {
          showStatus(
            `Δεν βρέθηκαν ενεργοποιημένα σημεία σε ακτίνα ${config.nearbyRadiusKm} km.`
          );
          return;
        }

        fitToMarkers(visibleMarkers);
        showStatus(
          `Εμφανίζονται ${visibleMarkers.length} σημεία σε ακτίνα ${config.nearbyRadiusKm} km.`
        );
      }
    });
  });

  document.getElementById("fitPointsButton").addEventListener("click", () => {
    nearbyMode = false;

    Object.values(filterInputs).forEach((input) => {
      input.checked = true;
    });

    const visibleMarkers = updateVisibleLayers();
    fitToMarkers(visibleMarkers, config.initialCenter);

    showStatus("Ενεργοποιήθηκαν και εμφανίζονται όλα τα σημεία.");
  });

  loadPoints();
})();
