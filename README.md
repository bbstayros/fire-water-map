# Fire Water Map v2.1

Στατική εφαρμογή GitHub Pages για κρουνούς, δεξαμενές και σημεία υδροληψίας.

## Περιλαμβάνει

- Δημόσιο χάρτη με ζωντανά δεδομένα Supabase
- Αναζήτηση και φίλτρα κατηγοριών
- GPS με ακτίνα 2, 4, 6 ή 10 km
- «Όλα τα σημεία» που επαναφέρει φίλτρα και αναζήτηση
- Καρτέλα σημείου και πλοήγηση Google Maps
- Supabase Auth
- Έλεγχο ενεργού ρόλου `editor` ή `admin`
- Dashboard και στατιστικά
- Προσθήκη, επεξεργασία, δημοσίευση και απόκρυψη
- Οριστική διαγραφή μόνο από `admin`
- Δοκιμαστικά GeoJSON δεδομένα όταν δεν υπάρχει σύνδεση Supabase

## Ανέβασμα στο GitHub

1. Κράτησε αντίγραφο ασφαλείας του σημερινού repository.
2. Διέγραψε τα παλιά αρχεία του repository.
3. Ανέβασε **τα περιεχόμενα** αυτού του φακέλου στο root του repository.
4. Το GitHub Pages παραμένει σε `Deploy from a branch`, branch `main`, folder `/ (root)`.
5. Περίμενε 1–3 λεπτά και κάνε ανανέωση με `Ctrl + F5`.

## Σημαντικό

Το `js/config.js` περιέχει μόνο το browser-safe Supabase publishable key. Δεν πρέπει να προστεθεί ποτέ secret key, service-role key ή database password.

## Δοκιμή

Ακολούθησε το `docs/TEST-CHECKLIST.md`.
