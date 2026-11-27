# Crevo AI — Big-Company Brand Upgrade Checklist

Saved for review when ready to upgrade `https://crevo.app` to full Series-A / top-tier SaaS presentation.

## 1. Real Before & After Examples (DONE!)
- **Where:** `src/components/landing/BeforeAfterShowcase.tsx`
- **Status:** Live interactive drag-to-compare Before/After slider (Tech Review + Podcast Studio) + real Crevo 9:16 vertical Shorts covers in `public/showcase/`.

## 2. 20–30 Second Product Demo Video
- **Where:** Right below the Hero CTA on the homepage
- **What to record:** Paste a YouTube link → 1080p viral clips appear → click **Make Cover Thumbnail** → finished thumbnail appears.

## 3. Creator Social Proof / Comparison (DONE — Ready for Real Quotes Later)
- **Where:** `src/components/landing/Testimonials.tsx`
- **Status:** Replaced placeholder Unsplash portraits with a live **"Crevo AI vs. OpusClip + Canva"** comparison section. Swap in 3–5 real creator quotes later once early users share feedback.

## 4. Two Quick External Updates (2 Minutes)
- **Stripe Dashboard → Products:** Update the `$9` Pay As You Go product (`price_1UfkBAELJu3kIHjxxWOcwsh0`) title/description from `"50 credits"` to **`"35 credits"`** so the Stripe Checkout screen matches the site.
- **Official Social Links:** Once Crevo's official YouTube, TikTok, Instagram, or X accounts are ready, add their URLs to `src/components/landing/Footer.tsx`.
