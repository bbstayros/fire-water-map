window.APP_CONFIG = Object.freeze({
  appName: "Fire Water Map",
  organisation: "Σύλλογος Εθελοντών Πυροπροστασίας Δασών Λουτρακίου - Περαχώρας",
  initialCenter: [37.9386, 22.9322],
  initialZoom: 13,
  defaultRadiusKm: 4,
  fallbackGeoJson: "data/points.geojson",
  siteUrl: "https://bbstayros.github.io/fire-water-map",
  userManagementFunction: "admin-users",

  // Supabase browser credentials. Το publishable key επιτρέπεται να βρίσκεται
  // στο frontend, εφόσον το RLS και οι policies έχουν ρυθμιστεί σωστά.
  supabaseUrl: "https://qifhrgxcefrndsfqjudc.supabase.co",
  supabaseAnonKey: "sb_publishable_7MV8i6VIx1yV6pgLLVPnrQ_3K7FtWtq"
});
