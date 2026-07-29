# Fire Water Map v2 Preview

Πλήρης νέα διεπαφή για δημόσιο χάρτη και διαχειριστικό.

## Άμεση επίδειξη

Ανέβασε όλα τα αρχεία στο GitHub Pages. Χωρίς Supabase στοιχεία ο δημόσιος χάρτης λειτουργεί σε **λειτουργία επίδειξης** με τα δεδομένα του `data/points.geojson`.

## Σύνδεση με Supabase

1. Supabase → Project Settings → API.
2. Αντέγραψε το **Project URL** και το **anon/public key**.
3. Άνοιξε `js/config.js` και συμπλήρωσε:

```js
supabaseUrl: "https://....supabase.co",
supabaseAnonKey: "...."
```

Το anon key είναι σχεδιασμένο για χρήση στον browser. Μην βάλεις service_role key.

## Πρώτος admin

1. Δημιούργησε χρήστη στο Authentication → Users.
2. Άνοιξε `supabase/03_make_existing_user_admin.sql`.
3. Βάλε το email σου και τρέξε το script μία φορά.
4. Άνοιξε `admin.html` και συνδέσου.
