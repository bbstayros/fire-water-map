(() => {
  const config = window.APP_CONFIG;
  const map = L.map("adminMap").setView(config.initialCenter, config.initialZoom);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(map);

  const latitudeInput = document.getElementById("latitude");
  const longitudeInput = document.getElementById("longitude");
  const previewBox = document.getElementById("previewBox");
  let selectionMarker = null;

  function setCoordinates(latitude, longitude, zoom = true) {
    latitudeInput.value = Number(latitude).toFixed(7);
    longitudeInput.value = Number(longitude).toFixed(7);

    if (selectionMarker) {
      selectionMarker.setLatLng([latitude, longitude]);
    } else {
      selectionMarker = L.marker([latitude, longitude], {
        draggable: true
      }).addTo(map);

      selectionMarker.on("dragend", () => {
        const position = selectionMarker.getLatLng();
        setCoordinates(position.lat, position.lng, false);
      });
    }

    if (zoom) {
      map.setView([latitude, longitude], 17);
    }
  }

  map.on("click", (event) => {
    setCoordinates(event.latlng.lat, event.latlng.lng, false);
  });

  document.getElementById("adminGpsButton").addEventListener("click", () => {
    if (!navigator.geolocation) {
      window.alert("Η συσκευή δεν υποστηρίζει εντοπισμό θέσης.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates(
          position.coords.latitude,
          position.coords.longitude,
          true
        );
      },
      () => {
        window.alert("Δεν ήταν δυνατός ο εντοπισμός της θέσης.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  });

  document.getElementById("pointForm").addEventListener("submit", (event) => {
    event.preventDefault();

    const data = {
      name: document.getElementById("name").value.trim(),
      category: document.getElementById("category").value,
      latitude: Number(latitudeInput.value),
      longitude: Number(longitudeInput.value),
      condition: document.getElementById("condition").value,
      notes: document.getElementById("notes").value.trim(),
      last_checked_at: document.getElementById("lastChecked").value || null,
      publication_status: "pending"
    };

    previewBox.hidden = false;
    previewBox.innerHTML = `
      <strong>Προεπισκόπηση εκκρεμούς καταχώρησης</strong><br>
      Ονομασία: ${escapeHtml(data.name)}<br>
      Κατηγορία: ${escapeHtml(data.category)}<br>
      Συντεταγμένες: ${data.latitude.toFixed(7)}, ${data.longitude.toFixed(7)}<br>
      Κατάσταση: ${escapeHtml(data.condition)}<br>
      Κατάσταση δημοσίευσης: pending<br><br>
      <em>Στο επόμενο βήμα θα συνδέσουμε τη φόρμα με το ασφαλές backend και
      θα προσθέσουμε έγκριση με κωδικό.</em>
    `;
  });

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }
})();
