window.WaterPoints = (() => {
  const iconDefinitions = {
    hydrant: {
      label: "Κρουνός",
      iconUrl: "icons/hydrant.svg"
    },
    tank: {
      label: "Δεξαμενή",
      iconUrl: "icons/tank.svg"
    },
    water_source: {
      label: "Σημείο υδροληψίας",
      iconUrl: "icons/water-source.svg"
    }
  };

  function createIcon(category) {
    const definition = iconDefinitions[category] || iconDefinitions.water_source;

    return L.icon({
      iconUrl: definition.iconUrl,
      iconSize: [34, 44],
      iconAnchor: [17, 43],
      popupAnchor: [0, -39]
    });
  }

  function categoryLabel(category) {
    return (iconDefinitions[category] || iconDefinitions.water_source).label;
  }

  function conditionLabel(condition) {
    const labels = {
      available: "Διαθέσιμο / λειτουργικό",
      unknown: "Άγνωστη κατάσταση",
      unavailable: "Μη διαθέσιμο / εκτός λειτουργίας"
    };

    return labels[condition] || "Δεν έχει δηλωθεί";
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function popupHtml(feature) {
    const properties = feature.properties || {};
    const [longitude, latitude] = feature.geometry.coordinates;
    const navigationUrl =
      `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}`;

    return `
      <div class="popup-content">
        <h3>${escapeHtml(properties.name || "Χωρίς ονομασία")}</h3>
        <p><strong>Τύπος:</strong> ${escapeHtml(categoryLabel(properties.category))}</p>
        <p><strong>Κατάσταση:</strong> ${escapeHtml(conditionLabel(properties.condition))}</p>
        <p><strong>Παρατηρήσεις:</strong> ${escapeHtml(properties.notes || "—")}</p>
        <p><strong>Τελευταίος έλεγχος:</strong> ${escapeHtml(properties.last_checked_at || "—")}</p>
        <p class="popup-coordinates">
          ${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}
        </p>
        <a class="navigation-link"
           href="${navigationUrl}"
           target="_blank"
           rel="noopener noreferrer">
          🧭 Πλοήγηση
        </a>
      </div>
    `;
  }

  return {
    createIcon,
    popupHtml
  };
})();
