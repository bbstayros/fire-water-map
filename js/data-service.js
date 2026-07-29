(() => {
  "use strict";

  const config = window.APP_CONFIG || {};
  const key = String(config.supabaseAnonKey || "").trim();
  const configured = Boolean(
    window.supabase &&
    config.supabaseUrl &&
    key &&
    !key.includes("ΒΑΛΕ_ΕΔΩ")
  );

  const client = configured
    ? window.supabase.createClient(config.supabaseUrl, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null;

  function normalise(row) {
    return {
      id: row.id,
      name: String(row.name || "Χωρίς ονομασία"),
      category: row.category || "water_source",
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      condition: row.condition || "unknown",
      notes: row.notes || "",
      last_checked_at: row.last_checked_at || null,
      publication_status: row.publication_status || "published",
      created_at: row.created_at || null,
      updated_at: row.updated_at || null,
      created_by: row.created_by || null,
      updated_by: row.updated_by || null
    };
  }

  async function loadFallback() {
    const response = await fetch(config.fallbackGeoJson, { cache: "no-store" });

    if (!response.ok) {
      throw new Error("Δεν ήταν δυνατή η φόρτωση των δοκιμαστικών δεδομένων.");
    }

    const geojson = await response.json();

    if (!Array.isArray(geojson.features)) {
      throw new Error("Το αρχείο points.geojson δεν έχει σωστή μορφή.");
    }

    return geojson.features.map((feature) =>
      normalise({
        ...feature.properties,
        longitude: feature.geometry.coordinates[0],
        latitude: feature.geometry.coordinates[1]
      })
    );
  }

  async function publicPoints() {
    if (!client) {
      return { points: await loadFallback(), source: "demo" };
    }

    const { data, error } = await client
      .from("water_points")
      .select("*")
      .eq("publication_status", "published")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return {
      points: (data || []).map(normalise),
      source: "supabase"
    };
  }

  async function getSession() {
    requireClient();
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session || null;
  }

  async function signIn(email, password) {
    requireClient();
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }

  async function currentUserAndProfile() {
    requireClient();

    const {
      data: { user },
      error: userError
    } = await client.auth.getUser();

    if (userError) throw userError;
    if (!user) return { user: null, profile: null };

    const { data: profile, error: profileError } = await client
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", user.id)
      .single();

    if (profileError) throw profileError;

    return { user, profile };
  }

  async function allPoints() {
    requireClient();

    const { data, error } = await client
      .from("water_points")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) throw error;
    return (data || []).map(normalise);
  }

  async function savePoint(point) {
    requireClient();

    const {
      data: { user },
      error: userError
    } = await client.auth.getUser();

    if (userError) throw userError;
    if (!user) throw new Error("Η συνεδρία έληξε. Συνδέσου ξανά.");

    const latitude = Number(point.latitude);
    const longitude = Number(point.longitude);

    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error("Το γεωγραφικό πλάτος δεν είναι έγκυρο.");
    }

    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error("Το γεωγραφικό μήκος δεν είναι έγκυρο.");
    }

    const payload = {
      name: String(point.name || "").trim(),
      category: point.category,
      latitude,
      longitude,
      condition: point.condition,
      notes: String(point.notes || "").trim() || null,
      last_checked_at: point.last_checked_at || null,
      publication_status: point.publication_status,
      updated_by: user.id
    };

    if (payload.name.length < 2) {
      throw new Error("Η ονομασία πρέπει να έχει τουλάχιστον 2 χαρακτήρες.");
    }

    if (point.id) {
      const { data, error } = await client
        .from("water_points")
        .update(payload)
        .eq("id", point.id)
        .select()
        .single();

      if (error) throw error;
      return normalise(data);
    }

    payload.created_by = user.id;

    const { data, error } = await client
      .from("water_points")
      .insert(payload)
      .select()
      .single();

    if (error) throw error;
    return normalise(data);
  }

  async function deletePoint(id) {
    requireClient();
    const { error } = await client.from("water_points").delete().eq("id", id);
    if (error) throw error;
  }

  function onAuthStateChange(callback) {
    if (!client) return { unsubscribe() {} };
    const { data } = client.auth.onAuthStateChange(callback);
    return data.subscription;
  }

  function requireClient() {
    if (!client) {
      throw new Error("Δεν έχουν ρυθμιστεί σωστά τα στοιχεία Supabase στο js/config.js.");
    }
  }

  window.DataService = Object.freeze({
    configured,
    client,
    publicPoints,
    getSession,
    signIn,
    signOut,
    currentUserAndProfile,
    allPoints,
    savePoint,
    deletePoint,
    onAuthStateChange
  });
})();
