(() => {
  const cfg = window.APP_CONFIG;
  const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const client = configured ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;

  function normalise(row) {
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      condition: row.condition || "unknown",
      notes: row.notes || "",
      last_checked_at: row.last_checked_at || null,
      publication_status: row.publication_status || "published",
      created_at: row.created_at || null,
      updated_at: row.updated_at || null
    };
  }

  async function loadFallback() {
    const response = await fetch(cfg.fallbackGeoJson, { cache: "no-store" });
    if (!response.ok) throw new Error("Αποτυχία φόρτωσης τοπικών δεδομένων");
    const geo = await response.json();
    return geo.features.map((feature) => normalise({
      ...feature.properties,
      longitude: feature.geometry.coordinates[0],
      latitude: feature.geometry.coordinates[1]
    }));
  }

  async function publicPoints() {
    if (!client) return { points: await loadFallback(), source: "demo" };
    const { data, error } = await client.from("water_points").select("*").eq("publication_status", "published").order("name");
    if (error) throw error;
    return { points: (data || []).map(normalise), source: "supabase" };
  }

  async function allPoints() {
    if (!client) throw new Error("Δεν έχουν συμπληρωθεί τα στοιχεία Supabase στο js/config.js");
    const { data, error } = await client.from("water_points").select("*").order("updated_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(normalise);
  }

  async function savePoint(point) {
    if (!client) throw new Error("Δεν έχει συνδεθεί το Supabase");
    const { data: authData } = await client.auth.getUser();
    const uid = authData?.user?.id;
    if (!uid) throw new Error("Η συνεδρία έληξε. Συνδέσου ξανά.");

    const payload = {
      name: point.name.trim(), category: point.category,
      latitude: Number(point.latitude), longitude: Number(point.longitude),
      condition: point.condition, notes: point.notes?.trim() || null,
      last_checked_at: point.last_checked_at || null,
      publication_status: point.publication_status
    };

    if (point.id) {
      payload.updated_by = uid;
      const { data, error } = await client.from("water_points").update(payload).eq("id", point.id).select().single();
      if (error) throw error;
      return normalise(data);
    }

    payload.created_by = uid;
    payload.updated_by = uid;
    const { data, error } = await client.from("water_points").insert(payload).select().single();
    if (error) throw error;
    return normalise(data);
  }

  async function deletePoint(id) {
    if (!client) throw new Error("Δεν έχει συνδεθεί το Supabase");
    const { error } = await client.from("water_points").delete().eq("id", id);
    if (error) throw error;
  }

  window.DataService = { configured, client, publicPoints, allPoints, savePoint, deletePoint };
})();
