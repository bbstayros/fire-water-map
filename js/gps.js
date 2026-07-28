window.UserLocation = (() => {
  let userMarker = null;
  let accuracyCircle = null;

  function locate(map, showStatus, options = {}) {
    if (!navigator.geolocation) {
      showStatus("Η συσκευή δεν υποστηρίζει εντοπισμό θέσης.");
      return;
    }

    showStatus("Αναζήτηση της θέσης σου...");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        const accuracy = position.coords.accuracy;

        if (userMarker) {
          map.removeLayer(userMarker);
        }

        if (accuracyCircle) {
          map.removeLayer(accuracyCircle);
        }

        userMarker = L.marker([latitude, longitude])
          .addTo(map)
          .bindPopup(
            `<strong>Η θέση μου</strong><br>Ακρίβεια περίπου ${Math.round(accuracy)} μέτρα`
          );

        accuracyCircle = L.circle([latitude, longitude], {
          radius: accuracy,
          weight: 2,
          fillOpacity: 0.12
        }).addTo(map);

        map.setView([latitude, longitude], 16);
        userMarker.openPopup();
        showStatus("Η θέση σου εντοπίστηκε.");

        if (typeof options.onSuccess === "function") {
          options.onSuccess({ latitude, longitude, accuracy });
        }
      },
      (error) => {
        const messages = {
          1: "Δεν δόθηκε άδεια πρόσβασης στη θέση.",
          2: "Η θέση της συσκευής δεν είναι διαθέσιμη.",
          3: "Η αναζήτηση θέσης καθυστέρησε υπερβολικά."
        };

        showStatus(messages[error.code] || "Δεν ήταν δυνατός ο εντοπισμός της θέσης.");
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  return { locate };
})();
