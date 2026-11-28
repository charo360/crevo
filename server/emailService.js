/**
 * Centralized Crevo AI Transactional & Admin Notification Email Service (Resend HTTPS API)
 */

const SITE_URL = () => (process.env.FRONTEND_URL || 'https://crevo.app').replace(/\/$/, '');
const FROM_EMAIL = () => process.env.EMAIL_FROM || 'Crevo AI <noreply@crevo.app>';
const ADMIN_EMAIL = () =>
    (process.env.ADMIN_EMAILS || 'sarcharo@gmail.com')
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean)[0] || 'sarcharo@gmail.com';

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMoney(cents) {
    return `$${((Number(cents) || 0) / 100).toFixed(2)}`;
}

function wrapEmailHtml({ title, preheader, bodyHtml, ctaLabel, ctaUrl }) {
    const ctaBlock =
        ctaLabel && ctaUrl
            ? `<p style="margin: 26px 0;">
                 <a href="${escapeHtml(ctaUrl)}" style="display:inline-block;padding:13px 26px;background:linear-gradient(135deg,#571c86,#7e22ce);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:700;font-size:15px;">
                   ${escapeHtml(ctaLabel)}
                 </a>
               </p>`
            : '';

    return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8" /></head>
<body style="margin:0;padding:0;background:#f8f6fc;font-family:Inter,Arial,sans-serif;color:#111827;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader || title)}</div>
  <div style="max-width:560px;margin:28px auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 8px 28px rgba(87,28,134,0.08);">
    <div style="background:linear-gradient(135deg,#4c1d95,#7e22ce);padding:22px 28px;color:#ffffff;">
      <div style="font-size:20px;font-weight:800;letter-spacing:-0.01em;">Crevo AI</div>
      <div style="font-size:12px;opacity:0.85;margin-top:2px;">AI YouTube Thumbnails &amp; Viral Short Clip Studio</div>
    </div>
    <div style="padding:28px;">
      <h2 style="margin:0 0 14px;font-size:22px;color:#111827;">${escapeHtml(title)}</h2>
      <div style="font-size:15px;line-height:1.65;color:#374151;">${bodyHtml}</div>
      ${ctaBlock}
      <hr style="border:none;border-top:1px solid #f3f4f6;margin:24px 0 16px;" />
      <p style="margin:0;font-size:12px;color:#9ca3af;">
        Sent by Crevo AI • <a href="${SITE_URL()}" style="color:#571c86;text-decoration:none;">crevo.app</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}

export async function sendEmail({ to, subject, html }) {
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
        console.warn(`[Email] RESEND_API_KEY not set — skipped "${subject}" to ${to}`);
        return { sent: false, reason: 'no_provider' };
    }

    try {
        const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${resendKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: FROM_EMAIL(),
                to: Array.isArray(to) ? to : [to],
                subject,
                html,
            }),
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            console.error(`Resend email error (${subject}):`, res.status, text);
            return { sent: false, reason: 'provider_error', status: res.status };
        }
        return { sent: true };
    } catch (err) {
        console.error(`Resend fetch error (${subject}):`, err?.message || err);
        return { sent: false, reason: 'network_error' };
    }
}

export function sendWelcomeEmail(toEmail) {
    return sendEmail({
        to: toEmail,
        subject: 'Welcome to Crevo AI — Your 6 Free Credits Are Ready!',
        html: wrapEmailHtml({
            title: 'Welcome to Crevo AI! 🎉',
            preheader: 'Your 6 free starter credits are waiting — create realistic Daily Posts, Retouch photos, or design YouTube thumbnails.',
            bodyHtml: `
                <p>Thanks for joining <strong>Crevo AI</strong>! We&rsquo;ve added <strong>6 free starter credits</strong> to your account so you can try everything right away.</p>
                <p>Here is what creators love trying first:</p>
                <ul style="padding-left:20px;margin:12px 0;">
                    <li><strong>📅 Daily Social Posts &amp; 🪄 Retouch My Photo:</strong> Turn any phone photo into a pro-photographer shot or create fresh Instagram, Facebook &amp; LinkedIn posts with realistic captions</li>
                    <li><strong>⭐ Named Characters (3 Photos Each):</strong> Save your face once so AI locks 100% of your real face &amp; body — and switch outfits in 1 tap</li>
                    <li><strong>🎯 YouTube Thumbnails &amp; CTR Improver:</strong> Upgrade existing thumbnails or design fresh concepts from scratch</li>
                    <li><strong>🎬 1080p Viral Shorts &amp; Clips:</strong> Paste any YouTube link or upload a video for auto-captioned vertical clips</li>
                </ul>
            `,
            ctaLabel: 'Use Your 6 Free Credits →',
            ctaUrl: `${SITE_URL()}/dashboard`,
        }),
    });
}

export function sendOnboardingDay2Email(toEmail, remainingCredits = 0) {
    const creditLine =
        remainingCredits > 0
            ? `<p>You still have <strong>${remainingCredits} free credit${remainingCredits === 1 ? '' : 's'}</strong> waiting in your account — enough to create your first real-camera Daily Post or retouch a photo right now.</p>`
            : `<p>Ready to get even better, 100% real-looking results on every post and thumbnail?</p>`;
    return sendEmail({
        to: toEmail,
        subject: 'Quick tip: Save 3 photos once for 100% real-face posts ⭐',
        html: wrapEmailHtml({
            title: 'Make AI Look 100% Like You',
            preheader: 'Save 3 quick angles in My Face & Brand Kit so Crevo nails your exact face & body every time.',
            bodyHtml: `
                ${creditLine}
                <p>The fastest way to make every Daily Post and YouTube thumbnail look like a real photographer shot it is to set up your <strong>Named Character</strong> once:</p>
                <ol style="padding-left:20px;margin:12px 0;">
                    <li>Open <strong>My Face &amp; Brand Kit</strong></li>
                    <li>Upload 3 clear photos of yourself (front face, smile/angle, and upper body)</li>
                    <li>Add 1 sentence about your niche so AI suggests tailored daily post ideas &amp; human captions</li>
                </ol>
                <p>From there, you can generate fresh social posts in any outfit or retouch your own phone photos in 15 seconds.</p>
            `,
            ctaLabel: 'Set Up My Face & Brand Kit →',
            ctaUrl: `${SITE_URL()}/dashboard/brand-kit`,
        }),
    });
}

export function sendOnboardingDay5Email(toEmail, remainingCredits = 0) {
    return sendEmail({
        to: toEmail,
        subject: 'Keep creating every day — $9 pack (never expires) or Pro 🚀',
        html: wrapEmailHtml({
            title: 'Ready to Post Every Day Without Hiring a Designer?',
            preheader: 'Unlock 35 never-expiring credits for $9 or 200 monthly credits with Crevo Pro.',
            bodyHtml: `
                <p>Creators use <strong>Crevo AI</strong> every day to publish real-camera Instagram &amp; Facebook posts, retouch phone photos, design high-CTR YouTube thumbnails, and clip 1080p viral Shorts — all in one studio.</p>
                ${remainingCredits > 0 ? `<p>You currently have <strong>${remainingCredits} credit${remainingCredits === 1 ? '' : 's'}</strong> left.</p>` : ''}
                <p>Whenever you&rsquo;re ready for more credits, pick the plan that fits your pace:</p>
                <ul style="padding-left:20px;margin:12px 0;">
                    <li><strong>Pay As You Go — $9 one-time:</strong> 35 credits that <strong>never expire</strong> (no subscription)</li>
                    <li><strong>Pro Plan — $29/month:</strong> 200 credits/month for active daily creators</li>
                </ul>
                <p style="font-size:13px;color:#6b7280;">Bonus: Share your personal referral link in the Affiliates tab to earn <strong>30% recurring commission</strong> for 12 months on every creator you invite.</p>
            `,
            ctaLabel: 'View Plans & Top Up Credits →',
            ctaUrl: `${SITE_URL()}/pricing`,
        }),
    });
}

export function sendAdminNewSignupAlert(userEmail, signupIp) {
    return sendEmail({
        to: ADMIN_EMAIL(),
        subject: `🆕 New Crevo AI Signup: ${userEmail}`,
        html: wrapEmailHtml({
            title: 'New User Signed Up',
            preheader: `${userEmail} just created a Crevo AI account.`,
            bodyHtml: `
                <p><strong>Email:</strong> ${escapeHtml(userEmail)}</p>
                <p><strong>Signup IP:</strong> <code>${escapeHtml(signupIp || 'unknown')}</code></p>
                <p><strong>Time:</strong> ${new Date().toUTCString()}</p>
            `,
            ctaLabel: 'Open Admin Dashboard →',
            ctaUrl: `${SITE_URL()}/admin`,
        }),
    });
}

export function sendPasswordResetEmail(toEmail, resetUrl) {
    return sendEmail({
        to: toEmail,
        subject: 'Reset your Crevo AI password',
        html: wrapEmailHtml({
            title: 'Reset your password',
            preheader: 'Click the button inside to set a new Crevo AI password (valid for 1 hour).',
            bodyHtml: `
                <p>We received a request to reset the password for <strong>${escapeHtml(toEmail)}</strong>.</p>
                <p>Click the button below to choose a new password. This link expires in <strong>1 hour</strong>.</p>
                <p style="font-size:13px;color:#6b7280;">If you didn't request this, you can safely ignore this email.</p>
            `,
            ctaLabel: 'Reset Password',
            ctaUrl: resetUrl,
        }),
    });
}

export function sendPasswordChangedEmail(toEmail) {
    return sendEmail({
        to: toEmail,
        subject: 'Your Crevo AI password was updated',
        html: wrapEmailHtml({
            title: 'Password updated successfully',
            preheader: 'Your Crevo AI account password was just changed.',
            bodyHtml: `
                <p>This is a quick security confirmation that the password for <strong>${escapeHtml(toEmail)}</strong> was just changed.</p>
                <p style="font-size:13px;color:#6b7280;">If you did not make this change, please reset your password immediately.</p>
            `,
            ctaLabel: 'Sign In to Crevo →',
            ctaUrl: `${SITE_URL()}/login`,
        }),
    });
}

export function sendPaymentReceiptEmail({ toEmail, packName, amountCents, credits, isSubscription, isRenewal }) {
    const label = isRenewal
        ? `Monthly Subscription Renewed — ${packName}`
        : isSubscription
          ? `Subscription Activated — ${packName}`
          : `Payment Receipt — ${packName}`;

    return sendEmail({
        to: toEmail,
        subject: `${label} | Crevo AI`,
        html: wrapEmailHtml({
            title: isRenewal ? 'Your monthly credits are here! ⚡' : 'Thank you for your purchase! 🎉',
            preheader: `+${credits} credits have been added to your Crevo AI account.`,
            bodyHtml: `
                <p>Your payment of <strong>${formatMoney(amountCents)}</strong> was successful.</p>
                <div style="background:#f5eeff;border:1px solid #d8ccf0;border-radius:12px;padding:16px;margin:16px 0;">
                    <p style="margin:0 0 6px;"><strong>Plan:</strong> ${escapeHtml(packName)}</p>
                    <p style="margin:0 0 6px;"><strong>Billing:</strong> ${isSubscription ? 'Monthly Subscription' : 'Pay As You Go (One-Time)'}</p>
                    <p style="margin:0 0 6px;"><strong>Amount Paid:</strong> ${formatMoney(amountCents)}</p>
                    <p style="margin:0;"><strong>Credits Added:</strong> <span style="color:#571c86;font-weight:800;">+${credits} credits</span></p>
                </div>
            `,
            ctaLabel: 'Start Creating in Studio →',
            ctaUrl: `${SITE_URL()}/dashboard`,
        }),
    });
}

export function sendAdminNewSaleAlert({ customerEmail, packName, amountCents, credits, isSubscription, isRenewal }) {
    const tag = isRenewal ? '🔄 Renewal' : isSubscription ? '💎 New Subscription' : '💰 New Sale';
    return sendEmail({
        to: ADMIN_EMAIL(),
        subject: `${tag}: ${formatMoney(amountCents)} from ${customerEmail}`,
        html: wrapEmailHtml({
            title: `${tag} — ${formatMoney(amountCents)}`,
            preheader: `${customerEmail} paid ${formatMoney(amountCents)} for ${packName}.`,
            bodyHtml: `
                <p><strong>Customer:</strong> ${escapeHtml(customerEmail)}</p>
                <p><strong>Plan:</strong> ${escapeHtml(packName)} (${isSubscription ? 'Subscription' : 'Pay As You Go'})</p>
                <p><strong>Amount:</strong> <strong>${formatMoney(amountCents)}</strong></p>
                <p><strong>Credits Granted:</strong> +${credits}</p>
            `,
            ctaLabel: 'View Revenue in Admin →',
            ctaUrl: `${SITE_URL()}/admin`,
        }),
    });
}

export function sendSubscriptionCancelledEmail(toEmail, packName) {
    return sendEmail({
        to: toEmail,
        subject: 'Your Crevo AI subscription has been cancelled',
        html: wrapEmailHtml({
            title: 'Subscription Cancelled',
            preheader: 'Your Crevo AI subscription will not renew.',
            bodyHtml: `
                <p>Your <strong>${escapeHtml(packName || 'Crevo AI')}</strong> subscription has been cancelled and you will not be billed again.</p>
                <p>Any remaining credits in your account stay available for you to use anytime — and you can always top up with our $9 Pay As You Go pack or resubscribe whenever you're ready.</p>
            `,
            ctaLabel: 'View Your Credits →',
            ctaUrl: `${SITE_URL()}/dashboard/credits`,
        }),
    });
}

export function sendAdminSubscriptionCancelledAlert(customerEmail, packName) {
    return sendEmail({
        to: ADMIN_EMAIL(),
        subject: `⚠️ Subscription Cancelled: ${customerEmail}`,
        html: wrapEmailHtml({
            title: 'Subscription Cancelled',
            preheader: `${customerEmail} cancelled ${packName || 'their subscription'}.`,
            bodyHtml: `
                <p><strong>Customer:</strong> ${escapeHtml(customerEmail)}</p>
                <p><strong>Plan:</strong> ${escapeHtml(packName || 'Subscription')}</p>
                <p><strong>Time:</strong> ${new Date().toUTCString()}</p>
            `,
            ctaLabel: 'Open Admin Dashboard →',
            ctaUrl: `${SITE_URL()}/admin`,
        }),
    });
}

export function sendBonusCreditsEmail(toEmail, amount, note, newBalance) {
    return sendEmail({
        to: toEmail,
        subject: `🎁 You received +${amount} credits on Crevo AI!`,
        html: wrapEmailHtml({
            title: `+${amount} Bonus Credits Added!`,
            preheader: `Your new Crevo AI balance is ${newBalance} credits.`,
            bodyHtml: `
                <p>Good news! <strong>+${amount} credits</strong> have been added to your Crevo AI account.</p>
                <p><strong>Note:</strong> ${escapeHtml(note || 'Admin bonus credits')}</p>
                <p><strong>Current Balance:</strong> <strong style="color:#571c86;">${newBalance} credits</strong></p>
            `,
            ctaLabel: 'Use Credits in Studio →',
            ctaUrl: `${SITE_URL()}/dashboard`,
        }),
    });
}

export function sendNewsletterWelcomeEmail(toEmail) {
    return sendEmail({
        to: toEmail,
        subject: 'You’re subscribed to Crevo AI Creator Updates!',
        html: wrapEmailHtml({
            title: 'Thanks for subscribing! 🚀',
            preheader: 'Creator tips, high-CTR thumbnail strategies, and new Crevo AI tools.',
            bodyHtml: `
                <p>You're on the list! We'll share high-CTR thumbnail tips, viral Shorts strategies, and new Crevo AI feature drops.</p>
                <p>In the meantime, try our free creator tools anytime — no login needed:</p>
                <ul style="padding-left:20px;margin:12px 0;">
                    <li><a href="${SITE_URL()}/tools/youtube-transcript" style="color:#571c86;">Free YouTube Transcript &amp; Thumbnail Downloader</a></li>
                    <li><a href="${SITE_URL()}/tools/image-resizer" style="color:#571c86;">Free AI Smart Image Resizer</a></li>
                </ul>
            `,
            ctaLabel: 'Explore Crevo AI →',
            ctaUrl: SITE_URL(),
        }),
    });
}

export function sendClipsReadyEmail({ toEmail, fullName, originalTitle, clips = [] }) {
    const count = clips.length;
    const greeting = fullName ? `Hi ${escapeHtml(fullName)},` : 'Hi there,';
    const clipListHtml = clips
        .slice(0, 6)
        .map(
            (c, i) =>
                `<li style="margin-bottom:8px;"><strong>${i + 1}. ${escapeHtml(c.hook_title || c.title || `Viral Clip ${i + 1}`)}</strong>` +
                `${c.virality_score ? ` <span style="color:#571c86;font-weight:700;">(🔥 ${c.virality_score}/100)</span>` : ''}` +
                `${c.duration ? ` · ${Math.round(c.duration)}s` : ''}</li>`
        )
        .join('');

    return sendEmail({
        to: toEmail,
        subject: `🎬 Your ${count} Viral Clip${count === 1 ? '' : 's'} Are Ready — Crevo AI`,
        html: wrapEmailHtml({
            title: `Your ${count} Viral Clip${count === 1 ? '' : 's'} Are Ready! 🎬`,
            preheader: `All ${count} Full HD 1080p clips from "${originalTitle || 'your video'}" are ready to watch and download.`,
            bodyHtml: `
                <p>${greeting}</p>
                <p>Your Full HD 1080p clips${originalTitle ? ` from <strong>${escapeHtml(originalTitle)}</strong>` : ''} finished processing and are saved safely in your <strong>My Library</strong>:</p>
                ${clipListHtml ? `<ul style="padding-left:20px;margin:14px 0;">${clipListHtml}</ul>` : ''}
                <p style="font-size:13px;color:#6b7280;">Clips stay in your cloud library for 7 days — download them anytime or send any clip straight to Thumbnail Studio.</p>
            `,
            ctaLabel: 'Watch & Download My Clips →',
            ctaUrl: `${SITE_URL()}/library`,
        }),
    });
}

export function sendAffiliateCommissionEmail({ toEmail, planName, saleAmountCents, commissionCents }) {
    const earned = formatMoney(commissionCents);
    const sale = formatMoney(saleAmountCents);
    return sendEmail({
        to: toEmail,
        subject: `🎉 You earned ${earned} commission on Crevo AI!`,
        html: wrapEmailHtml({
            title: `You Earned ${earned}! 🎉`,
            preheader: `One of your Crevo AI referrals just purchased ${planName}.`,
            bodyHtml: `
                <p>Awesome news! Someone you referred to <strong>Crevo AI</strong> just made a payment.</p>
                <div style="background:#faf7ff;border:1px solid #e4dcf2;border-radius:12px;padding:16px;margin:16px 0;">
                    <div style="font-size:13px;color:#6b7280;">Plan Purchased</div>
                    <div style="font-size:16px;font-weight:800;color:#111827;margin-bottom:8px;">${escapeHtml(planName)} (${sale})</div>
                    <div style="font-size:13px;color:#6b7280;">Your 30% Commission</div>
                    <div style="font-size:24px;font-weight:900;color:#571c86;">+${earned}</div>
                </div>
                <p style="font-size:13px;color:#6b7280;">Commissions clear after a 14-day refund hold and are paid out monthly once your balance reaches $25. Make sure your PayPal or Wise payout email is saved in your Affiliate Dashboard.</p>
            `,
            ctaLabel: 'Open Affiliate Dashboard →',
            ctaUrl: `${SITE_URL()}/affiliates`,
        }),
    });
}

export async function sendOpenRouterLowBalanceAlert({
    remainingUsd,
    totalCreditsUsd,
    totalUsageUsd,
    dailyUsageUsd,
    thresholdUsd = 2,
}) {
    const remaining = `$${Number(remainingUsd || 0).toFixed(2)}`;
    const totalCredits = `$${Number(totalCreditsUsd || 0).toFixed(2)}`;
    const totalUsage = `$${Number(totalUsageUsd || 0).toFixed(2)}`;
    const dailyUsage = `$${Number(dailyUsageUsd || 0).toFixed(2)}`;
    const threshold = `$${Number(thresholdUsd || 2).toFixed(2)}`;

    const recipients = Array.from(
        new Set([ADMIN_EMAIL(), 'sarcharo@gmail.com'].filter(Boolean).map((e) => e.trim().toLowerCase()))
    );

    const html = wrapEmailHtml({
        title: `⚠️ Low OpenRouter Balance: ${remaining}`,
        preheader: `Crevo AI OpenRouter balance dropped below ${threshold}. Add credits soon so AI generations keep running.`,
        bodyHtml: `
            <p>Your <strong>OpenRouter API balance</strong> powering <strong>Crevo AI</strong> has dropped below your <strong>${threshold}</strong> alert threshold.</p>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:16px;margin:16px 0;">
                <div style="font-size:13px;color:#991b1b;font-weight:700;">Remaining OpenRouter Balance</div>
                <div style="font-size:28px;font-weight:900;color:#dc2626;margin:4px 0 10px;">${remaining}</div>
                <div style="font-size:13px;color:#4b5563;line-height:1.6;">
                    Today's Crevo AI spend: <strong>${dailyUsage}</strong><br />
                    Total credits purchased: <strong>${totalCredits}</strong> · Total used: <strong>${totalUsage}</strong>
                </div>
            </div>
            <p style="font-size:13px;color:#6b7280;">Top up your OpenRouter account so Thumbnail Studio, Smart Resize, and Viral Clips never pause for your users.</p>
        `,
        ctaLabel: 'Add OpenRouter Credits →',
        ctaUrl: 'https://openrouter.ai/settings/credits',
    });

    const results = [];
    for (const to of recipients) {
        results.push(
            await sendEmail({
                to,
                subject: `⚠️ Crevo AI Alert: OpenRouter balance is ${remaining} (below ${threshold})`,
                html,
            })
        );
    }
    return results;
}
