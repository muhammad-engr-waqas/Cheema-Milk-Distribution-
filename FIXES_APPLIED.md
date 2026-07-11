# Cheema Milk Distribution — Fixes Applied (July 2026)

## 🆕 Round 2 Fixes (ye is dafa ke fix hain — pehle wale niche maujood hain)

### 🔴🔴 Bug A (SABSE BADA — abhi bhi bacha hua tha) — Add ki hui entry kuch second baad khud 0/0 ho jati thi
**Files:** `MilkTransactionContext.tsx`, `AdvanceContext.tsx`, `DispatchContext.tsx`,
`AccountContext.tsx`, `VehicleContext.tsx`, `LabContext.tsx`
**Masla:** Har context har 15 second mein background mein backend se poora
fresh data laata aur local state ko *pura overwrite* kar deta tha ("backend
= source of truth"). Lekin jab user koi entry add karta, us waqt backend
save khud chal raha hota (Vercel cold-start ki wajah se 5-7 second lag sakta
hai). Agar is 5-7 second ki window mein 15-second wala background poll chal
jata, to usay abhi tak purana data milta (jisme nayi entry shamil nahi thi),
aur woh purana data local state par wapas overwrite ho jata — result: abhi
add ki hui entry screen se ghayab ho jati ya 0/0 dikhne lagti, chahe backend
mein woh theek se save ho bhi chuki ho. Yehi wo "add karne ke kuch second
baad data 0 0 ho jata hai" wala masla tha.
**Fix:** Har context mein ek `pendingSavesRef` counter add kiya — jab tak
koi save backend ko ja raha hai, background poll us cycle ko skip kar deta
hai (overwrite nahi karta). Save poora hone ke turant baad (500ms delay se)
khud ek fresh sync trigger hoti hai taake final/authoritative data mil jaye.

### 🔴 Bug B — Login screen khulte hi Network tab "No token provided" se bhar jata tha
**Files:** Same 7 contexts jaise upar (`MilkTransactionContext`, `AdvanceContext`,
`DispatchContext`, `AccountContext`, `VehicleContext`, `LabContext`, `UserContext`)
**Masla:** `App.tsx` mein saare data providers (Milk, Advance, Dispatch,
Account, Vehicle, Lab, User) **hamesha mounted rehte hain** — chahe user
Login screen par ho ya logout ho chuka ho. Har provider apna
`syncFromBackend()` turant call karta, aur har 15 second baad dobara — bina
ye check kiye ke koi login token maujood hai bhi ya nahi. Isi wajah se Login
screen par hi Network tab mein baar baar `{"success": false, "message": "No
token provided. Please login."}` (401) errors bharte rehte the — jo aapne
dekha.
**Fix:** Har context ke `syncFromBackend()` mein ab pehle check hota hai ke
login token maujood hai ya nahi (`getToken()`); agar nahi to request bheji
hi nahi jati — chup chaap ruk jata hai, koi error bhi nahi aata.

### 🟠 Bug C — Purchase Ledger / Sale Ledger (accountant panel) doosre
device/browser ki entries nahi dikhati thi
**Files:** `PurchaseLedger.tsx`, `SaleLedger.tsx`
**Masla:** Ye dono screens sirf ek dafa (page load par) backend se data
laati thin, aur jaan-boojh kar koi periodic refresh nahi tha (kyunki
"save-ke-turant-baad refresh" race condition create karta — jo pehle hi ek
comment mein likha tha). Lekin iska side-effect ye tha ke agar doosre
laptop/browser se koi entry add ho, to is screen par woh tab tak nahi
dikhti jab tak page manually reload na ho.
**Fix:** Har 25 second mein ek safe background refresh add kiya gaya — ye
SIRF tab chalta hai jab (a) koi save is waqt in-flight na ho, aur (b) entry
modal khula na ho (taake user ka active data-entry disturb na ho). Isse
purani race condition wapas nahi aati, lekin doosre device ka data ab ~25
second ke andar khud-ba-khud dikhne lag jayega.

---

Ye file batati hai ke kya masla tha, kahan tha, aur kya fix kiya gaya.

## 🔴🔴 Bug #0 (SABSE BADA ROOT CAUSE) — Data ek browser mein queue mein phans kar hamesha ke liye reh jata tha, DB mein kabhi jata hi nahi tha
**File:** `Frontend/src/services/offlineSync.ts`
**Masla:** Jab bhi koi save request fail hoti (chahe waqti wajah se — jaise
serverless cold-start timeout, transient 401, ya koi bhi glitch), data
`dairy_sync_queue` naam ki localStorage key mein "baad mein retry karne ke
liye" daal diya jata tha. Lekin retry SIRF tab hota tha jab browser ka
`online` event fire ho (matlab internet disconnect ho kar wapas connect ho).
Agar device ka internet chalta rahe (jo zyada tar case hota hai — sirf
backend/server side fail hua ho), to ye event kabhi fire hi nahi hota, aur
queued data **hamesha ke liye usi browser ke localStorage mein phansa reh
jata — kabhi database mein nahi jata**. Isi wajah se:
- Doosre browser/laptop mein wo data bilkul nahi dikhta tha (kyunki DB mein
  tha hi nahi, sirf ek browser ke local queue mein tha).
- 3 retries ke baad (`MAX_RETRIES`), data permanently discard bhi ho jata
  tha — hamesha ke liye kho jata tha.

**Fix:**
1. Ab har 20 second mein background mein queue check hoti hai aur retry hoti
   hai — chahe koi online/offline transition hui ho ya na ho.
2. Tab dobara visible hone (app khulne) par bhi turant retry hoti hai.
3. Sirf GENUINE permanent errors (invalid data, duplicate) discard hoti hain
   — network/timeout/server errors ab 20 attempts tak retry hoti rehti hain,
   3 ke baad discard nahi hotin.

**Ye sabse zyada probable wajah hai us specific symptom ki jo aapne bataya:
"kuch data database mein nahi jata, aur browser change karu to show nahi
hota."**


**File:** `Backend/src/controllers/milkRecord.controller.js` (`getMilkRecords`)
**Masla:** Query mein sirf `milkLiter: { $gt: 0 }` wali entries return hoti thin.
Agar koi entry advance-only ho, ya rate baad mein set hone wala ho (isliye
`totalAmount` abhi 0 ho), to woh entry **database mein save ho jati thi lekin
kabhi bhi frontend ko wapas nahi milti thi** — isi liye "kuch data DB mein
chala jata hai, kuch show nahi hota" wala masla ho raha tha.
**Fix:** Filter ko broaden kiya — ab entry show hogi agar `milkLiter`,
`totalAmount`, `advanceAmount`, ya `paymentReceived` mein se koi bhi `> 0` ho.

## 🔴 Bug #2 — Purchase/Sale Ledger screens pe entries ghayab
**File:** `Backend/src/controllers/ledger.controller.js` (`getPurchaseLedger`,
`getSaleLedger`)
**Masla:** Same tarah ka filter — sirf `totalAmount/advanceAmount/paymentReceived
/discountAmount` check hota tha, `milkLiter` (quantity) ko ignore kiya jata
tha. Quantity-only entries (rate abhi apply nahi hui) list se hide ho jati thin.
**Fix:** `milkLiter > 0` ko bhi valid condition mein add kiya.

## 🔴 Bug #3 (CRITICAL — Data Loss) — MilkSale bulk-save ek driver ka data
doosre driver ka mita sakta tha
**File:** `Backend/src/controllers/ledger.controller.js` (`bulkCreateSaleLedger`)
**Masla:** Ye function jab bhi call hoti, **us poori date ke SAARE sale
entries delete kar deti thi** — chahe woh kisi doosre driver/route ke hi
kyun na hon — phir sirf jo naya batch bheja gaya woh insert karti thi. Matlab
agar do drivers same din sale submit karte, to jo baad mein submit karta,
uski wajah se pehle wale driver ka sara data database se permanently delete
ho jata tha. Yehi wo bug hai jiski wajah se "kuch der baad data 0 0 ho jata
hai" ho raha tha.
**Fix:** Ab deletion sirf usi `driverId` (ya specific `_id` list) tak scoped
hai — kisi aur driver/route ka data touch nahi hota.

## 🟠 Improvement #4 — 5–7 second delay (serverless cold start)
**File:** `Backend/src/config/db.js`
**Masla:** Vercel serverless function har "cold start" pe naya container
banata hai, jisme MongoDB Atlas se dobara connect hona padta hai — isi wajah
se 5–7 second ka delay aata tha, aur agar connection fail ho to request bina
kisi clear error ke hang ho jati thi.
**Fix:** Connection ko zyada reliably cache kiya (`global` object pe), aur
strict timeouts (`serverSelectionTimeoutMS`, `socketTimeoutMS`,
`bufferCommands:false`) add kiye taake DB unreachable hone par request turant
aur clear error ke saath fail ho, hang na ho.
**⚠️ Ye poora fix nahi hai — cold start Vercel serverless ki inherent
limitation hai.** Agar consistently fast response chahiye, **Render.com ya
Railway.app** jaisi platform pe backend deploy karna better hoga (persistent
server, no cold start), Vercel serverless functions ke bajaye.

## 🟠 Improvement #5 — Auto-logout false positive ("No token provided" error)
**File:** `Frontend/src/contexts/AuthContext.tsx`
**Masla:** Page load pe ek saath kai contexts (Advance, Vehicle, Dispatch,
etc.) apni-apni API request bhejte hain. Agar unme se koi 2 transient wajah
se (cold start / network glitch) 401 return karein, to poora app turant
logout kar deta tha — jiski wajah se localStorage se token/user hat jata,
aur uske baad ki har request "No token provided" dikhati thi (jo aapne
Network tab mein dekha).
**Fix:** Threshold ko 2 se badha kar 3 kiya, aur window ko 2.5s se 4s kiya —
taake page-load ka normal burst false logout na kare, lekin genuinely
invalid/expired token pe abhi bhi turant logout ho.

## 🟢 Improvement #6 — Clearer error agar JWT_SECRET set na ho
**File:** `Backend/src/middleware/auth.middleware.js`
Agar Vercel environment variables mein `JWT_SECRET` set karna bhool jayein,
ab clear error milega ("Server misconfiguration: JWT_SECRET is not set")
bajaye confusing "No token provided" ke.

---

## ✅ Deployment Checklist (Vercel pe zaroor check karein)

Backend Vercel project → **Settings → Environment Variables** mein ye zaroor
set hone chahiye (Production environment ke liye):

| Variable | Example |
|---|---|
| `MONGO_URI` | `mongodb+srv://user:pass@cluster.mongodb.net/dbname` |
| `JWT_SECRET` | Koi bhi lamba random string (kabhi na badlein warna sab purane tokens invalid ho jayenge) |
| `JWT_EXPIRE` | `7d` |
| `FRONTEND_URL` | `https://your-frontend.vercel.app` |
| `NODE_ENV` | `production` |

Frontend Vercel project → **Settings → Environment Variables**:

| Variable | Example |
|---|---|
| `VITE_API_URL` | `https://your-backend.vercel.app/api` |

**Zaroori:** `.env` file sirf local development ke liye hoti hai — Vercel
deploy production build ke liye ye values **Vercel dashboard mein manually
set** karni parti hain, warna production mein `VITE_API_URL` empty/localhost
reh jata hai aur sab requests fail hoti hain.

Har naya deployment karne se pehle in dono projects mein environment
variables verify kar lein.
