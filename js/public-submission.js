(() => {
  "use strict";
  const modal = document.getElementById("submissionModal");
  const form = document.getElementById("publicSubmissionForm");
  const message = document.getElementById("submissionMessage");
  const gpsStatus = document.getElementById("submissionGpsStatus");
  let capturedAt = null;

  function showModal() {
    const access = window.FWMAccess?.get?.() || { mode: "public" };
    const code = document.getElementById("submissionCode");
    if (code) { code.required = access.mode === "public"; code.closest("label")?.classList.toggle("hidden", access.mode !== "public"); }
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

  async function sendPayload(payload) {
    if (!window.DataService.client) throw new Error("OFFLINE");
    const access = window.FWMAccess?.get?.() || { mode: "public" };
    if (["crew","admin"].includes(access.mode)) {
      return window.DataService.submitOperationalPoint({
        name: payload.p_name, category: payload.p_category, condition: payload.p_condition, notes: payload.p_notes,
        latitude: payload.p_latitude, longitude: payload.p_longitude, accuracy_m: payload.p_accuracy_m, captured_at: payload.p_captured_at
      });
    }
    const { error } = await window.DataService.client.rpc("submit_public_water_point", payload);
    if (error) throw error;
  }

  async function syncQueue() {
    try {
      const count = await window.OfflineStore.syncSubmissions(sendPayload);
      if (count) setMessage(`Συγχρονίστηκαν ${count} αποθηκευμένες καταχωρήσεις.`);
    } catch (error) {
      console.warn("Queue sync failed", error);
    }
  }

  window.addEventListener("online", syncQueue);
  syncQueue();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const latitude = Number(document.getElementById("submissionLatitude").value);
    const longitude = Number(document.getElementById("submissionLongitude").value);
    const accuracy = Number(document.getElementById("submissionAccuracy").value);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      setMessage("Πρέπει πρώτα να πατήσεις «Λήψη της θέσης μου».", true);
      return;
    }
    if (!capturedAt || Date.now() - new Date(capturedAt).getTime() > 10 * 60 * 1000) {
      setMessage("Η θέση είναι παλιά. Κάνε ξανά λήψη GPS πριν την αποστολή.", true);
      return;
    }
    const payload = {
      p_code: document.getElementById("submissionCode").value.trim().toUpperCase(),
      p_name: document.getElementById("submissionName").value.trim(),
      p_category: document.getElementById("submissionCategory").value,
      p_condition: document.getElementById("submissionCondition").value,
      p_notes: document.getElementById("submissionNotes").value.trim() || null,
      p_latitude: latitude,
      p_longitude: longitude,
      p_accuracy_m: accuracy,
      p_captured_at: capturedAt
    };
    const button = document.getElementById("submitPublicPoint");
    button.disabled = true;
    setMessage(navigator.onLine ? "Αποστολή…" : "Αποθήκευση στη συσκευή…");
    try {
      if (!navigator.onLine) {
        await window.OfflineStore.queueSubmission(payload);
        setMessage("Η καταχώρηση αποθηκεύτηκε offline και θα σταλεί όταν επανέλθει η σύνδεση.");
      } else {
        await sendPayload(payload);
        setMessage("Η καταχώρηση στάλθηκε επιτυχώς και περιμένει έλεγχο.");
      }
      form.reset(); capturedAt = null;
      gpsStatus.textContent = "Δεν έχει ληφθεί θέση."; gpsStatus.className = "";
      setTimeout(hideModal, 1800);
    } catch (error) {
      console.error(error);
      const text = String(error?.message || "");
      if (!navigator.onLine || text.includes("Failed to fetch") || text.includes("NetworkError")) {
        await window.OfflineStore.queueSubmission(payload);
        setMessage("Δεν υπήρχε σύνδεση. Η καταχώρηση αποθηκεύτηκε και θα συγχρονιστεί αργότερα.");
        form.reset(); capturedAt = null;
      } else if (text.includes("INVALID_CODE")) setMessage("Ο κωδικός επαλήθευσης δεν είναι έγκυρος ή δεν είναι πλέον ενεργός.", true);
      else if (text.includes("GPS_ACCURACY")) setMessage("Η ακρίβεια GPS είναι πολύ χαμηλή. Μετακινήσου σε ανοικτό σημείο και δοκίμασε ξανά.", true);
      else setMessage("Η αποστολή απέτυχε. Δοκίμασε ξανά σε λίγο.", true);
    } finally { button.disabled = false; }
  });
})();
