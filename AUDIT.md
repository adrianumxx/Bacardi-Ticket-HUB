# Audit completo — Bacardi Ticket Hub

Analisi del codice al 2026-07-03 (branch `claude/code-audit-improvements-frw4iq`). Solo mappatura: nessun file di codice è stato modificato.

Legenda priorità: 🔴 critico · 🟠 importante · 🟡 consigliato · 🔵 rifinitura

---

## 1. Sicurezza

### 🔴 1.1 Login senza alcuna credenziale
`src/lib/auth-options.ts` usa un CredentialsProvider che accetta **solo l'email**: chiunque conosca (o indovini) l'email di un utente abilitato entra come quell'utente. Non c'è password, magic link né OTP.
**Fix consigliato:** passare a magic link via email (NextAuth EmailProvider con Resend come transport, coerente con lo stack già presente) oppure aggiungere un OTP a 6 cifre inviato via Resend. È il fix più importante di tutta l'app.

### 🔴 1.2 Il blocco utente si auto-annulla
`ensureAllowedProfile` (`src/lib/auth-users.ts:31-43`) fa `$set: { status: "active" }` a ogni chiamata, e viene chiamata dal callback `jwt` **a ogni refresh del token** (`auth-options.ts:64-73`). Risultato: un utente messo `blocked` dall'admin viene riattivato automaticamente alla prima richiesta successiva, finché resta in `AllowedUser`. Il controllo `status !== "active"` in `authz.ts:14` non scatta mai.
**Fix:** in `ensureAllowedProfile` impostare `status: "active"` solo con `$setOnInsert`, e rifiutare il login se il profilo esistente è `blocked`.

### 🔴 1.3 Rate limiting in-memory inefficace in produzione
`src/lib/rate-limit.ts` usa una `Map` nel processo: su Vercel/serverless ogni istanza ha la sua mappa e si azzera a ogni cold start → i limiti su login e richieste account sono praticamente decorativi. In più la mappa non viene mai ripulita (memory leak lento) e `requestIp` si fida di `x-forwarded-for` (spoofabile se non si è dietro un proxy fidato).
**Fix:** rate limit persistente (collection Mongo con TTL index, o Upstash Redis) + pulizia bucket scaduti; usare l'header IP fornito dalla piattaforma.

### 🟠 1.4 Enumerazione email
- `POST /api/account-requests` risponde "This email already has access" → permette di scoprire quali email sono abilitate.
- Il messaggio d'errore del login ("not approved yet") conferma indirettamente lo stato dell'email.
**Fix:** risposta generica ("Se l'email è idonea riceverai istruzioni…") in entrambi i punti.

### 🟠 1.5 HTML injection nelle email
`emailHtml` (`src/lib/mail.ts:70-78`) interpola direttamente contenuti forniti dagli utenti (nome, company, reason della richiesta account; note delle richieste ticket) dentro l'HTML senza escaping. Un richiedente può iniettare markup/link di phishing nelle email che arrivano agli admin.
**Fix:** funzione `escapeHtml()` su tutti i valori dinamici prima dell'interpolazione.

### 🟠 1.6 Messaggi d'errore interni esposti al client
`errorResponse` (`src/lib/api.ts`) per gli errori 500 restituisce `error.message` grezzo (può contenere stringhe di connessione Mongo, dettagli interni).
**Fix:** loggare il dettaglio lato server e rispondere con un messaggio generico.

### 🟠 1.7 Nessun limite su file allegati in send-ticket
`POST /api/requests/[id]/send-ticket` accetta qualsiasi numero/tipo/dimensione di file, li carica interamente in memoria e li base64-encoda. Resend ha un limite (~40MB) e file enormi possono saturare la memoria della funzione.
**Fix:** validare numero massimo file, dimensione totale (es. 15MB) ed estensioni ammesse (pdf, png, jpg, zip…).

### 🟡 1.8 Email personale hardcoded nel client
`LoginScreen` ha `useState("amelillo@bacardi.com")` come default del campo email (`dashboard.tsx:~247`): è un'email reale spedita nel bundle a chiunque visiti la pagina, e combinata con 1.1 è un invito ad entrare come quell'account.
**Fix:** default stringa vuota.

### 🟡 1.9 Race condition sul limite ticket per outlet
Il controllo `usedTicketsForOutlet` + `create` in `POST /api/requests` non è atomico: due richieste concorrenti sullo stesso outlet possono superare `maxTicketsPerOutlet`. Rischio basso (volumi piccoli) ma reale.
**Fix:** transazione Mongo o ricontrollo post-insert con rollback.

---

## 2. Bug funzionali

### 🟠 2.1 `validateStatusQuantities` rifiuta la parziale "legittima al 100%−1"… ok, ma il caso reale è un altro
In `PATCH /api/requests/[id]`, se l'admin approva parzialmente ma con quantità uguale al richiesto il sistema forza a scegliere "approved": corretto. Il problema è in `send-ticket` (`route.ts:88-97`): se lo stato è `pending` viene auto-approvato **senza** ricontrollare il limite per outlet (`usedTicketsForOutlet` non viene chiamato) → si può superare il tetto inviando ticket su una richiesta pending.
**Fix:** in send-ticket, rieseguire il check limite prima dell'auto-approve (o vietare l'invio su richieste pending — il controllo a riga 37 già blocca `pending`? No: blocca solo stati diversi da approved/partially_approved, quindi il ramo `status === "pending"` a riga 88 è **codice morto**). → Rimuovere il ramo morto o chiarire l'intento.

### 🟠 2.2 `deliverOptionalEmail` è codice morto
`src/lib/notifications.ts:74-83`: entrambi i rami dell'`if` fanno la stessa identica cosa. Da rimuovere o implementare la logica intesa (probabilmente: skip email se manca la API key — ma già gestito in `sendMail`).

### 🟡 2.3 Filtro data `dateTo` esclude il giorno stesso
In `/api/reports` e `/api/audit-logs`, `$lte: new Date(dateTo)` con una data "2026-07-03" equivale a mezzanotte → i record di quel giorno sono esclusi. UX confusa per chi filtra "fino a oggi".
**Fix:** aggiungere 1 giorno o impostare 23:59:59.999.

### 🟡 2.4 `lastLoginAt` aggiornato a ogni refresh JWT
Il callback `jwt` invoca `ensureAllowedProfile` a ogni richiesta → una write su Mongo per ogni pagina caricata e `lastLoginAt` che non rappresenta più il login. 
**Fix:** aggiornare `lastLoginAt` solo in `authorize`/`signIn`; nel callback `jwt` fare solo lettura (o cache con `trigger === "update"`).

### 🟡 2.5 Invio ticket: un'email per destinatario, allegati duplicati
`send-ticket` manda N email separate (una per destinatario) ciascuna con tutti gli allegati, e registra il dispatch con lo status di una sola delivery ("il primo sent, altrimenti il primo"): se 1 su 3 fallisce non c'è traccia. 
**Fix:** una singola email con più destinatari (o registrare lo status per destinatario nel dispatch).

### 🔵 2.6 Zod v4: `z.string().email()` è deprecato
`src/lib/schemas.ts` usa l'API deprecata; in Zod 4 la forma corretta è `z.email()`. Funziona ancora ma andrà migrato.

---

## 3. Setup, DX e affidabilità

### 🟠 3.1 Manca `.env.example`
Il README (step 1 del Setup) dice di copiare `.env.example`, ma il file **non esiste nel repo**. Chi clona il progetto si blocca subito.
**Fix:** aggiungere `.env.example` con `MONGODB_URI`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `SUPER_ADMIN_EMAILS`, `ADMIN_NOTIFY_EMAILS`, `RESEND_API_KEY`, `MAIL_FROM` commentati.

### 🟠 3.2 Nessuna CI
Non c'è `.github/workflows`: lint/test/build (`npm run check` esiste già!) non girano su push/PR.
**Fix:** workflow GitHub Actions minimale che esegue `npm ci && npm run check`.

### 🟡 3.3 Indici Mongo mancanti per le query calde
- `TicketRequest`: nessun indice su `{ event, outlet, status }` (usato dall'aggregazione limite outlet a ogni creazione/update) né su `requestedBy`.
- `AuditLog`: nessun indice su `createdAt`/`actor` e nessun TTL → cresce all'infinito.
- `AppNotification`: manca indice composto `{ recipient, read, createdAt }`.
**Fix:** aggiungere `schema.index(...)` mirati; valutare TTL (es. 12 mesi) su AuditLog e notifiche lette.

### 🟡 3.4 Nessuna paginazione sulle liste
`/api/requests`, `/api/admin/users`, `/api/outlets`, `/api/events` restituiscono **tutto** senza limit. Con lo storico che cresce, payload e rendering degradano.
**Fix:** `limit`/`cursor` lato API + "load more" in UI (le notifiche hanno già `limit(80)`, buon modello).

### 🟡 3.5 Test sottili
Esistono solo 3 unit test (schemas, request-rules, mail) e 1 e2e. Zero copertura su: auth/blocco utenti (dove c'è il bug 1.2), route API, limite outlet con richieste concorrenti, send-ticket.
**Fix:** unit test su `ensureAllowedProfile` (caso blocked!) e integration test sulle route con mongodb-memory-server.

### 🔵 3.6 `serializeDoc` inutilizzato + doppia serializzazione in audit-logs
`serializeDoc` in `api.ts` non è mai usato; `/api/audit-logs` fa `JSON.parse(JSON.stringify(logs))` prima di ripassarlo a `NextResponse.json` (doppio lavoro inutile).

---

## 4. UX / utilizzo

### 🟠 4.1 `dashboard.tsx` monolitico da 2.402 righe
Login, shell, tutte le tab (richieste, eventi, outlet, utenti, notifiche, report, audit) vivono in un unico client component. Conseguenze pratiche: bundle unico caricato sempre (jsPDF a parte, che è già lazy — bene), stato che si perde tra tab, difficile manutenzione.
**Fix:** spezzare in componenti per tab sotto `src/components/`, idealmente con route segmenti (`/requests`, `/events`, …) così l'URL riflette dove sei, il refresh non ti riporta alla prima tab e si può condividere un link diretto.

### 🟠 4.2 Nessun aggiornamento automatico delle notifiche
La campanella si popola solo al fetch iniziale/manuale: un admin non vede le nuove richieste finché non ricarica.
**Fix minimo:** polling ogni 60s del solo `unreadCount`; meglio: SWR/React Query con `refetchInterval` per tutte le liste (elimina anche il pulsante refresh manuale come unico meccanismo).

### 🟡 4.3 Feedback errori di login fuorviante
Qualsiasi errore in `signIn` (incluso rate-limit o DB down) mostra "This email is not approved yet". L'utente legittimo con un problema tecnico riceve un messaggio sbagliato.
**Fix:** distinguere `CredentialsSignin` da errori generici.

### 🟡 4.4 Filtri report: date "fino a" escluse (vedi 2.3) e nessun default periodo
La tab report parte senza range date → carica tutto lo storico a ogni apertura. Default "ultimi 90 giorni" ridurrebbe carico e tempi.

### 🟡 4.5 Lingua e localizzazione
UI interamente in inglese con formato date `en-GB`, ma il team utilizzatore è italiano. Valutare: stringhe in italiano (o i18n leggero con dizionario statico) e `Intl` con locale `it-IT`.

### 🔵 4.6 Accessibilità
- I pulsanti tab/menu non hanno `aria-current`/`aria-expanded`.
- I badge di stato comunicano solo tramite colore + testo breve; ok, ma i form senza `aria-describedby` sugli errori.
- Focus ring: `focus:border-[#b8860b]` senza `outline` visibile per navigazione da tastiera.

### 🔵 4.7 Conferme per azioni distruttive/irreversibili
Merge outlet e blocco utente partono senza dialog di conferma (il merge archivia l'outlet sorgente e sposta tutte le richieste). Aggiungere un confirm esplicito con riepilogo.

---

## 5. Pulizia minore

| Dove | Cosa |
|---|---|
| `public/` | `next.svg`, `vercel.svg`, `globe.svg`, `window.svg`, `file.svg` sono residui del template — rimuovibili |
| `src/lib/models.ts:174-179` | l'hack `delete mongoose.models[name]` in dev è ok ma merita un commento; in prod è no-op |
| `package.json` | `test` e `test:unit` sono identici — tenerne uno |
| `README.md` | aggiornare lo step `.env.example` (vedi 3.1) e documentare `ADMIN_NOTIFY_EMAILS` |
| `dashboard.tsx` | `brand-logo.png?v=2` con `unoptimized`: il cache-busting manuale non serve se si usa `next/image` normalmente |

---

## Ordine di intervento suggerito

1. **1.1 autenticazione reale (magic link/OTP)** + 1.8 email hardcoded — insieme, è la falla d'accesso.
2. **1.2 fix del blocco utenti** — piccolo, critico, testabile subito.
3. **1.5 escaping HTML email** + **1.6 errori 500 generici** — fix da poche righe.
4. **3.1 `.env.example`** + **3.2 CI con `npm run check`** — sbloccano onboarding e qualità.
5. **1.3 rate limit persistente** + 1.4 enumerazione.
6. **2.1/2.2 codice morto e check limite in send-ticket** + 1.7 validazione allegati.
7. **4.1 split dashboard** + 4.2 polling notifiche + 3.4 paginazione (refactor più grosso, da fare per ultimo e a tappe).

Tutti i punti sono indipendenti tra loro salvo il gruppo 7; nessuno richiede migrazioni dati distruttive.

---

## Stato implementazione (aggiornato)

### ✅ Risolti in questo branch
- **1.2** Blocco utenti non più auto-annullato (`status` solo `$setOnInsert`, rifiuto login se `blocked`, env admin sempre ammessi).
- **1.3** Rate limiting persistente su MongoDB con TTL index e comportamento fail-open (`src/lib/rate-limit.ts`, model `RateLimit`).
- **1.4** Rimossa enumerazione email: risposta generica identica in tutti i casi su `POST /api/account-requests`.
- **1.5** Escaping HTML di tutti i contenuti dinamici nelle email (`escapeHtml` in `mail.ts`).
- **1.6** Gli errori 500 non espongono più il messaggio interno: log lato server + risposta generica.
- **1.7** Validazione allegati in `send-ticket`: max 10 file, max 15 MB totali, estensioni consentite.
- **1.8** Rimossa email personale hardcoded dal form di login (default vuoto).
- **2.1** Rimosso il ramo morto di auto-approve in `send-ticket`.
- **2.2** Rimossa `deliverOptionalEmail` (rami identici) → uso diretto di `deliverMail`.
- **2.3** Filtro `dateTo` ora inclusivo del giorno stesso (helper `endOfDay`) in report e audit-log.
- **2.4** `lastLoginAt` aggiornato solo al login effettivo (opzione `touchLogin`), non a ogni refresh JWT.
- **2.6** Migrazione a `z.email()` (API Zod v4).
- **3.1** Aggiunto `.env.example`.
- **3.2** Aggiunta CI GitHub Actions (`.github/workflows/ci.yml`) che esegue lint + unit test + build.
- **3.3** Aggiunti indici Mongo su `TicketRequest`, `AuditLog`, `AppNotification`, `AccountRequest`.
- **3.6** `serializeDoc` ora usato in audit-logs (rimossa doppia serializzazione manuale).
- **4.3** Messaggio di errore login distingue "email non approvata" da errore tecnico.
- **5** Rimossi gli SVG residui del template Next e aggiunti test unitari (`tests/unit/security.test.ts`).

Verifica: `npm run lint` pulito, `npm run test:unit` 15/15, `npm run build` OK.

### ⏳ Deferiti volutamente (rischio/ampiezza — richiedono una decisione o un intervento dedicato)
- **1.1 Autenticazione reale (magic link / OTP).** È la falla più importante ma la sostituzione va decisa con te: cambia l'esperienza di login per tutti gli utenti e richiede Resend con sender verificato. Implementarla "alla cieca" rischia di bloccare l'accesso se l'email non è configurata → contrario a "non rompere nulla". Da fare come intervento dedicato e concordato.
- **1.9 / 2.5** Atomicità limite outlet e invio email singola multi-destinatario (miglioramenti mirati, non bloccanti).
- **3.4 Paginazione** liste API + **4.1 split del `dashboard.tsx`** da 2.402 righe + **4.2 auto-refresh notifiche** + **4.5 i18n** + **4.6 a11y**: refactor ampi da fare a tappe, fuori dallo scope di un fix sicuro non-breaking.
