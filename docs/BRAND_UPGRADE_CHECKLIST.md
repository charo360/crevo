# Crevo AI — Big-Company Brand Upgrade Checklist

Saved for review when ready to upgrade `https://crevo.app` to full Series-A / top-tier SaaS presentation.

## 1. Real Before & After Examples (Biggest Conversion Upgrade)
- **Where:** `src/components/landing/BeforeAfterShowcase.tsx`
- **What to provide:**
  - **3–4 real image pairs:** original raw video frame or old thumbnail → finished Crevo AI thumbnail
  - **1 sample 1080p vertical clip** generated in Crevo (with burned-in captions)
- **What we'll build:** Interactive Before/After comparison sliders + a muted auto-playing vertical clip preview directly on the homepage.

## 2. 20–30 Second Product Demo Video
- **Where:** Right below the Hero CTA on the homepage
- **What to record:** Paste a YouTube link → 1080p viral clips appear → click **Make Cover Thumbnail** → finished thumbnail appears.

## 3. Real Creator Testimonials
- **Where:** `src/components/landing/Testimonials.tsx`
- **What to provide:** 3–5 real quotes from early Crevo creators (name, channel/role, and optional avatar/channel handle) to replace the current Unsplash placeholder portraits.

## 4. Two Quick External Updates (2 Minutes)
- **Stripe Dashboard → Products:** Update the `$9` Pay As You Go product (`price_1UfkBAELJu3kIHjxxWOcwsh0`) title/description from `"50 credits"` to **`"35 credits"`** so the Stripe Checkout screen matches the site.
- **Official Social Links:** Once Crevo's official YouTube, TikTok, Instagram, or X accounts are ready, add their URLs to `src/components/landing/Footer.tsx`.
