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
        subject: 'Welcome to Crevo AI — Your Creator Studio is Ready!',
        html: wrapEmailHtml({
            title: 'Welcome to Crevo AI! 🎉',
            preheader: 'Create high-CTR thumbnails and viral Shorts in seconds.',
            bodyHtml: `
                <p>Thanks for joining <strong>Crevo AI</strong>! Your creative studio is ready to use.</p>
                <p>Here is what you can create right away:</p>
                <ul style="padding-left:20px;margin:12px 0;">
                    <li><strong>Improve YouTube Thumbnails</strong> with AI CTR scoring &amp; viral hook titles</li>
                    <li><strong>Repurpose Long Videos (up to 5GB)</strong> into 9:16 Shorts, TikToks &amp; Reels with AI captions</li>
                    <li><strong>AI Smart Image Resizer</strong> that extends backgrounds without cropping</li>
                    <li><strong>7-Day Cloud Library</strong> automatically saving your recent work</li>
                </ul>
            `,
            ctaLabel: 'Open Crevo Studio →',
            ctaUrl: `${SITE_URL()}/dashboard`,
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
