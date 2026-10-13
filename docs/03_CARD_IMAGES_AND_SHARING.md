# 03 — Card Images, Credentials Export & WhatsApp Sharing

> Use for: generating the PNG card for each player, bulk export, the credentials sheet, and the WhatsApp sharing flow in the admin UI.
> Prerequisites: `00_OVERVIEW.md`, `01_DATA_AND_CARD_GENERATION.md`, and the backend from `02_BACKEND_API_REALTIME.md`.

## 1. The honest constraint about WhatsApp (read before designing)

- A `https://wa.me/<number>?text=<message>` link opens a chat with a **pre-filled text** only. It **cannot attach an image**.
- Sending images and messages automatically to 110 people requires the WhatsApp Business Cloud API (templates, approval, cost). That is **out of scope**.
- Therefore the in-scope flow is semi-manual and optimised for speed:
  1. **Mobile Web Share (best):** if the admin uses the app on a phone, use `navigator.share({ files: [pngFile], text })` (Web Share API Level 2). The system share sheet opens; the admin picks WhatsApp and the contact. Feature-detect with `navigator.canShare({files})` and fall back gracefully.
  2. **Desktop/any browser fallback:** per-player row with two buttons:
     - **Download card PNG** (named `047_Rahul.png`)
     - **Open WhatsApp chat** (`wa.me` link with the pre-filled credentials message). The admin then drags the downloaded PNG into the chat.
  3. **Bulk:** "Download all cards (ZIP)" containing 110 PNGs named `<serial>_<name>.png`, plus `credentials.csv`. Useful for printing, or for sending from a laptop with WhatsApp Web.
- Each row has "sent" checkboxes (`cardImageSentAt`, `credentialsSentAt`) so the admin can track who has been messaged, with a "Not yet sent" filter and a progress counter ("63/110 sent").

## 2. Card image spec

### 2.1 Canvas
- **1080 × 1350 px** (4:5 portrait, looks good in a WhatsApp preview), PNG, sRGB.
- Output must be fully **deterministic**: same card → byte-identical or visually identical PNG.

### 2.2 Layout (top to bottom)
1. **Header band:** game name (e.g. "ONAM LOTTO 2026"), small tagline "Numbers 1–110".
2. **Player block:** big `CARD #047` (serial, zero-padded), player name below it (truncate with ellipsis at ~22 chars, shrink font before truncating).
3. **Grid:** 4×4 square cells with rounded corners, equal gaps. Each cell holds one number, centered, large bold tabular-figure font so 1-, 2- and 3-digit numbers look consistent.
4. **Footer:** `Verify: ABC123` (the card's `verifyCode`), a line "Numbers will be marked live in the app" plus the **web app URL** and the player's **Login ID** (never the PIN — PINs go in the text message only).
5. Optional QR code in the footer pointing to the web app URL (library `qrcode`). Keep it small and low-contrast-safe.

### 2.2.1 Visual style
Clean, high contrast, readable on a small phone screen and when printed in grayscale. Use a single accent colour. Palette and typeface are configurable constants at the top of the renderer file. Do not use thin fonts; do not use low-contrast pastel text on pastel backgrounds.

### 2.3 Marked variant (`?marked=1`)
Same layout, but cells whose number is in the drawn set get a filled accent background, bold white number and a check ring or diagonal strike (must be visible in grayscale: do not rely on colour alone). A progress line in the footer: `11 / 16 marked`. The unmarked variant is what is sent on WhatsApp; the marked variant is available from the player page ("Download my current card") and from the admin player-detail page.

## 3. Rendering technology

Recommended: **`@napi-rs/canvas`** (prebuilt binaries, no system libs, fast) and register a **bundled** font file (e.g. Inter or DM Sans / Poppins TTF in `server/assets/fonts/`, under an open licence). Do not depend on system fonts: servers and Docker images often have none, which causes blank or fallback text.

Alternative: build an SVG string and rasterise with `sharp`. Only choose it if the font is registered with fontconfig inside the Docker image. If you choose this, document how.

Structure:
```
server/src/services/cardImage/
  theme.ts        // colours, fonts, sizes — all constants
  renderCard.ts   // (cardData, options) => Buffer(PNG)
  renderZip.ts    // streams a ZIP of all cards (archiver)
```
`renderCard` is a pure function of its input. Cache rendered **unmarked** PNGs on disk or in memory keyed by `verifyCode + themeVersion` (they never change after lock). Do not cache the marked variant, or key it by `lastActiveSeq`.

## 4. Endpoints (extend file 02)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/admin/players/:id/card.png` | admin | `?marked=0|1`, `Content-Disposition: attachment; filename="047_Rahul.png"` when `?download=1` |
| GET | `/me/card/image` | player | own card only, `?marked=0|1` |
| GET | `/admin/export/cards.zip` | admin | streamed ZIP (do not buffer 110 images in memory at once; render and append sequentially). Only allowed once status ≥ `ready` |
| GET | `/admin/export/credentials.csv` | admin | `serial,name,phone,loginId,pin,whatsappLink` — **only available immediately after (re)generation** while the one-time PINs are held; see §5 |
| GET | `/admin/export/credentials.print` | admin | printable HTML page, one slip per player (cut-out slips), same one-time rule |

File names: sanitise the player's name (strip `/ \ : * ? " < > |`, collapse spaces, ASCII fallback if the name has only non-Latin characters, e.g. Malayalam names → use the serial only; but the **rendered image** must still draw the real name, so choose a font that supports the needed scripts or fall back to a second bundled font; if the font lacks a glyph the renderer must not draw empty boxes: fall back to showing the serial and loginId only).

## 5. Credentials and the one-time PIN reveal

- PINs are hashed in the DB (file 01 §3). Therefore plain PINs only exist in the HTTP response of `credentials/generate` or `reset-pin`.
- The admin UI must: display them in a table immediately, offer **Copy all**, **Download CSV**, **Print slips**, and show a blocking warning before the admin leaves the screen: "PINs can't be shown again. Download/copy them now."
- To make this practical, the server may hold the just-generated plain PINs **in memory only** (not DB, not logs) for **15 minutes** keyed by gameId, so the export endpoints can read them. After expiry, the exports return `410 PINS_NO_LONGER_AVAILABLE` and the admin must use "Reset PIN" per player.
- The WhatsApp text message template (editable by the admin in a settings box, with placeholders):

```
Hi {{name}}! 🎟️ Your {{gameName}} card is #{{serial}}.
Live card: {{appUrl}}
Login ID: {{loginId}}
PIN: {{pin}}
Your card image is attached. Numbers are marked live in the app.
```
`whatsappLink = https://wa.me/{{phoneDigits}}?text={{encodeURIComponent(message)}}`. If a player has no phone, disable the button and show "No phone saved".
- Remind the admin: a PIN in a WhatsApp message is as private as that chat. Do not auto-fill PINs into the card image.

## 6. Admin UI for this file ("Distribution" page)

A table of all players with columns: serial, name, phone, **[Card PNG ⬇]**, **[Share card]** (Web Share, shown only if supported), **[WhatsApp text]**, `Card sent ☐`, `Credentials sent ☐`, **[Reset PIN]**.
Top bar: **Download all cards (ZIP)**, **Credentials CSV**, **Print slips**, progress bars for "cards sent" and "credentials sent", filter `All | Not sent | Sent`, search.
Show a thumbnail preview of the card on row click (modal).

## 7. Acceptance for this file
1. The 110 PNGs are produced in under 30 seconds total and each is visibly correct at 1080×1350.
2. The grid numbers in the PNG equal `Card.grid` exactly (write a test that decodes numbers from the render pipeline's input, and manually spot-check 5 images).
3. A name of 30+ characters and a name with Malayalam script both render without broken boxes or overflow.
4. The marked variant shows exactly `card ∩ drawn` as marked, with a grayscale-visible marking.
5. A player token cannot download another player's image (403).
6. The ZIP has 110 files with unique, safe names.
7. After the 15-minute window the CSV export returns 410, and no plain PIN is in any database document or log line.
