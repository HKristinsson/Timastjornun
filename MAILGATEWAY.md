# Reir póstgátt (mail gateway) — hönnun og uppsetning

Innri skilaboða-/póstkerfi fyrir **hóp 2** (vettvangsstarfsmenn) sem nota appið í stað
Microsoft 365 pósthólfs. **Hópur 1** (venjulegir M365-notendur) er ósnertur.

## Beiningarregla (kjarninn)

```
Póstur berst á nafn@reir.is
        │
        ▼
┌─ Er nafn@reir.is í group2_recipients (virkur)? ─┐
│ JÁ                                              │ NEI
▼                                                 ▼
Vistast í innhólf appsins             ┌─ Er netfangið til í Microsoft 365? ─┐
(inbound_emails, sýnilegt             │ JÁ                                  │ NEI
 notandanum í /mail)                  ▼                                     ▼
                                      Afhent í M365 pósthólf      Póstveitan bouncar
                                      (hópur 1)                   (venjuleg NDR-villa
                                                                   til sendanda)
```

## ⚠️ Mikilvægt um MX-færslur

**MX-færslur beina ÖLLU léninu, ekki einstökum netföngum.** Til að skipta pósti eftir
móttakanda þarf eina af þessum leiðum í framleiðslu:

| Leið | Hvernig | Kostir/gallar |
|---|---|---|
| **A. Póstgátt með recipient-routing (t.d. Mailgun)** | MX fyrir reir.is → Mailgun. Mailgun Routes: hóps-2 netföng → webhook í appið; allt annað → `forward()` á M365 (t.d. reir-is.mail.protection.outlook.com). Óþekkt netföng → bounce hjá Mailgun. | Full stjórn; en ALLUR póstur fer gegnum Mailgun (SPF/DKIM þarf að uppfæra; áhætta ef gáttin dettur út) |
| **B. Microsoft 365 sem fyrsta stopp + connector** | MX óbreytt á M365. Í Exchange: mail flow rule / connector sem áframsendir hóps-2 netföng (mail contacts með external address á undirlén, t.d. `nafn@app.reir.is`) → Mailgun-undirlén → webhook. | MX ósnert (öruggast); M365 sér um bounce; krefst Exchange-stillinga |
| **C. Undirlén fyrir prófun (MÆLT MEÐ FYRST)** | `app.reir.is` (eða Mailgun sandbox) → Mailgun → webhook. **Engin breyting á reir.is.** | Áhættulaust; fullkomið fyrir MVP-prófun |

> **MVP notar leið C** — við snertum EKKI MX-færslur reir.is fyrr en gáttin er fullprófuð.

## DNS-breytingar (þegar farið er í framleiðslu, leið A)
Skrifað hér til seinni tíma — **EKKI gera núna**:
1. `MX reir.is → mxa.mailgun.org, mxb.mailgun.org` (fjarlægja M365 MX)
2. `TXT reir.is` SPF: bæta `include:mailgun.org` við
3. DKIM-lyklar frá Mailgun (`smtp._domainkey…`)
4. Í Mailgun: Receiving Routes í forgangsröð:
   - `match_recipient(<hóps-2 netföng>)` → `store(notify="https://<appið>/api/mail/inbound")`
   - catch-all → `forward("reir-is.mail.protection.outlook.com")` (MS accepted domain sem *Internal Relay*)
5. Í M365: setja reir.is sem **Internal Relay** accepted domain svo óþekkt netföng þar bounca rétt.

Fyrir **leið C (prófun)** þarf aðeins: MX + TXT á `app.reir.is` → Mailgun, ekkert annað.

## Uppsetning MVP-prófunar (eitt hóps-2 netfang)
1. **Supabase:** keyra `supabase/migrations/0011_mail.sql` (töflur + RLS + föll).
2. **Seed:** `SETUP_DATABASE_URL=... node scripts/seed-mail.mjs`
   → býr til `worker.test@reir.is` (lykilorð `Verktak2026!`), skráir sem hóps-2
   móttakanda og setur inn **eitt sýnisskeyti merkt PRÓFUNARGÖGN**.
3. **Prófa UI án Mailgun:** innskrá sem `worker.test@reir.is` → `/mail` → lesa
   sýnisskeytið → svara (svar vistast sem `mock_sent` í Sent).
4. **Prófa inbound með Mailgun (valfrjálst):**
   - Stofna ókeypis Mailgun-aðgang → nota sandbox-lén eða `app.reir.is`.
   - Setja `SUPABASE_SERVICE_ROLE_KEY`, `MAILGUN_WEBHOOK_SIGNING_KEY` í env (Vercel).
   - Mailgun Route: `match_recipient("worker.test@reir.is")` →
     `store(notify="https://timastjornun-37o7.vercel.app/api/mail/inbound")`.
   - Senda póst á routed netfangið → birtist í innhólfi.

## Öryggi
- **RLS:** starfsmaður sér AÐEINS eigin póst; admin sér allt í sínu fyrirtæki;
  innsetning aðeins með service role (webhook).
- **Webhook-undirskrift:** HMAC-SHA256 staðfest (`MAILGUN_WEBHOOK_SIGNING_KEY`) —
  óundirrituð köll fá 401.
- **HTML hreinsað** (sanitize-html) VIÐ MÓTTÖKU áður en það er vistað — ekkert
  script/iframe/event-handler kemst í gagnagrunninn.
- **Engir lyklar í kliént:** service role og Mailgun-lyklar eru aðeins í
  server-umhverfi (Vercel env).

## Útsending (staða)
MVP vistar send skeyti sem `mock_sent` (sýnileg í Sent). Fyrir raunverulega útsendingu:
bæta Mailgun send-API kalli í `app.mail_send`-flæðið (edge function/route handler með
`MAILGUN_API_KEY`) og uppfæra `status`/`provider_message_id`. SPF/DKIM þarf að vera
rétt sett á sendanda-léninu.

## Eftir fyrir framleiðslu
- [ ] Velja beiningarleið (A eða B) og framkvæma DNS/Exchange-breytingar
- [ ] Tengja raunverulega útsendingu (Mailgun send API)
- [ ] Viðhengi: vista í Supabase Storage (email_attachments taflan er tilbúin)
- [ ] Fleiri hóps-2 notendur (admin-skjárinn styður það nú þegar)
- [ ] Push-tilkynningar við nýjan póst (þegar native appið kemur)
- [ ] Tenging við Tímaverk-appið (sama Supabase, sama auth — þjónustulagið
  `web/lib/mail/` flyst beint í Expo-appið)
