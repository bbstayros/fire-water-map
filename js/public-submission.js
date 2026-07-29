(() => {
  "use strict";
  const modal = document.getElementById("submissionModal");
  const form = document.getElementById("publicSubmissionForm");
  const message = document.getElementById("submissionMessage");
  const gpsStatus = document.getElementById("submissionGpsStatus");
  let capturedAt = null;

  function showModal() {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
  function hideModal() {
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }
  function setMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle("error", error);
  }
  document.getElementById("openSubmissionButton").addEventListener("click", showModal);
  document.getElementById("closeSubmissionButton").addEventListener("click", hideModal);
  modal.addEventListener("click", (event) => { if (event.target === modal) hideModal(); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !modal.classList.contains("hidden")) hideModal(); });

  document.getElementById("captureSubmissionGps").addEventListener("click", () => {
    if (!navigator.geolocation) {
      gpsStatus.textContent = "Η συσκευή δεν υποστηρίζει GPS.";
      gpsStatus.className = "gps-error";
      return;
    }
    gpsStatus.textContent = "Αναζήτηση ακριβούς θέσης…";
    gpsStatus.className = "";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        document.getElementById("submissionLatitude").value = latitude;
        document.getElementById("submissionLongitude").value = longitude;
        document.getElementById("submissionAccuracy").value = accuracy;
        capturedAt = new Date().toISOString();
        gpsStatus.textContent = `Η θέση καταγράφηκε με ακρίβεια περίπου ±${Math.round(accuracy)} m.`;
        gpsStatus.className = accuracy <= 100 ? "gps-ok" : "gps-warning";
      },
      (error) => {
        const errors = {1:"Δεν δόθηκε άδεια πρόσβασης στη θέση.",2:"Η θέση δεν είναι διαθέσιμη.",3:"Η λήψη θέσης καθυστέρησε υπερβολικά."};
        gpsStatus.textContent = errors[error.code] || "Δεν ήταν δυνατή η λήψη θέσης.";
        gpsStatus.className = "gps-error";
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const latitude = Number(document.getElementById("submissionLatitude").value);
    const longitude = Number(document.getElementById("submissionLongitude").value);
    const accuracy = Number(document.getElementById("submissionAccuracy").value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage("Πρέπει πρώτα να πατήσεις «Λήψη της θέσης μου». ", true);
      return;
    }
    if (!capturedAt || Date.now() - new Date(capturedAt).getTime() > 10 * 60 * 1000) {
      setMessage("Η θέση είναι παλιά. Κάνε ξανά λήψη GPS πριν την αποστολή.", true);
      return;
    }
    const button = document.getElementById("submitPublicPoint");
    button.disabled = true;
    setMessage("Αποστολή…");
    try {
      const { error } = await window.DataService.client.rpc("submit_public_water_point", {
        p_code: document.getElementById("submissionCode").value.trim().toUpperCase(),
        p_name: document.getElementById("submissionName").value.trim(),
        p_category: document.getElementById("submissionCategory").value,
        p_condition: document.getElementById("submissionCondition").value,
        p_notes: document.getElementById("submissionNotes").value.trim() || null,
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_m: accuracy,
        p_captured_at: capturedAt
      });
      if (error) throw error;
      form.reset(); capturedAt = null;
      gpsStatus.textContent = "Δεν έχει ληφθεί θέση."; gpsStatus.className = "";
      setMessage("Η καταχώρηση στάλθηκε επιτυχώς και περιμένει έλεγχο.");
      setTimeout(hideModal, 1600);
    } catch (error) {
      console.error(error);
      const text = String(error?.message || "");
      if (text.includes("INVALID_CODE")) setMessage("Ο κωδικός επαλήθευσης δεν είναι έγκυρος ή δεν είναι πλέον ενεργός.", true);
      else if (text.includes("GPS_ACCURACY")) setMessage("Η ακρίβεια GPS είναι πολύ χαμηλή. Μετακινήσου σε ανοικτό σημείο και δοκίμασε ξανά.", true);
      else setMessage("Η αποστολή απέτυχε. Δοκίμασε ξανά σε λίγο.", true);
    } finally { button.disabled = false; }
  });
})();
