/**
 * Mailbux JMAP Mail Service (RFC 8620/8621 over HTTPS port 443)
 * Powers the owner-only sam@crevo.app Inbox inside /admin.
 */

const SESSION_URL = 'https://my.mailbux.com/jmap/session';

let cachedSession = null;
let cachedSessionAt = 0;

function getAuthHeader() {
    const user = process.env.MAILBUX_USER || 'sam@crevo.app';
    const pass = process.env.MAILBUX_APP_PASSWORD || '';
    if (!pass) {
        throw new Error('MAILBUX_APP_PASSWORD is not configured on the server.');
    }
    const encoded = Buffer.from(`${user}:${pass}`, 'utf8').toString('base64');
    return { user, header: `Basic ${encoded}` };
}

async function getSession(forceRefresh = false) {
    const now = Date.now();
    if (!forceRefresh && cachedSession && now - cachedSessionAt < 10 * 60 * 1000) {
        return cachedSession;
    }
    const { user, header } = getAuthHeader();
    const res = await fetch(SESSION_URL, {
        headers: { Authorization: header, Accept: 'application/json' },
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Mailbux JMAP auth failed (${res.status}): ${text.slice(0, 160)}`);
    }
    const data = await res.json();
    const accountId = data?.primaryAccounts?.['urn:ietf:params:jmap:mail'];
    if (!data?.apiUrl || !accountId) {
        throw new Error('Mailbux JMAP session did not return apiUrl/accountId.');
    }
    cachedSession = {
        apiUrl: data.apiUrl,
        accountId,
        username: data.username || user,
        authHeader: header,
    };
    cachedSessionAt = now;
    return cachedSession;
}

async function jmapCall(methodCalls, using = ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail']) {
    const session = await getSession();
    const res = await fetch(session.apiUrl, {
        method: 'POST',
        headers: {
            Authorization: session.authHeader,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ using, methodCalls }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Mailbux JMAP request failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const json = await res.json();
    return { session, responses: json.methodResponses || [] };
}

function formatAddresses(list) {
    if (!Array.isArray(list)) return '';
    return list
        .map((a) => (a?.name ? `${a.name} <${a.email}>` : a?.email || ''))
        .filter(Boolean)
        .join(', ');
}

export async function listMailMessages(folder = 'inbox', limit = 30) {
    const session = await getSession();
    const { responses: mbResponses } = await jmapCall([
        ['Mailbox/get', { accountId: session.accountId }, 'mb'],
    ]);
    const mailboxes = mbResponses.find((r) => r[0] === 'Mailbox/get')?.[1]?.list || [];

    const desiredRole = folder === 'sent' ? 'sent' : folder === 'trash' ? 'trash' : 'inbox';
    const targetBox =
        mailboxes.find((m) => String(m.role || '').toLowerCase() === desiredRole) ||
        mailboxes.find((m) => String(m.name || '').toLowerCase() === desiredRole) ||
        mailboxes[0];

    if (!targetBox) {
        return { mailbox: session.username, folder: desiredRole, unreadCount: 0, messages: [] };
    }

    const { responses } = await jmapCall([
        [
            'Email/query',
            {
                accountId: session.accountId,
                filter: { inMailbox: targetBox.id },
                sort: [{ property: 'receivedAt', isAscending: false }],
                limit: Math.min(50, Math.max(1, Number(limit) || 30)),
            },
            'q',
        ],
        [
            'Email/get',
            {
                accountId: session.accountId,
                '#ids': { resultOf: 'q', name: 'Email/query', path: '/ids' },
                properties: ['id', 'subject', 'from', 'to', 'receivedAt', 'preview', 'keywords', 'hasAttachment'],
            },
            'g',
        ],
    ]);

    const list = responses.find((r) => r[0] === 'Email/get')?.[1]?.list || [];
    const inboxBox = mailboxes.find((m) => String(m.role || '').toLowerCase() === 'inbox');

    return {
        mailbox: session.username,
        folder: desiredRole,
        unreadCount: Number(inboxBox?.unreadEmails || 0),
        messages: list.map((m) => ({
            id: m.id,
            subject: m.subject || '(No subject)',
            from: formatAddresses(m.from),
            fromEmail: m.from?.[0]?.email || '',
            to: formatAddresses(m.to),
            receivedAt: m.receivedAt,
            preview: m.preview || '',
            isUnread: !m.keywords?.['$seen'],
            hasAttachment: Boolean(m.hasAttachment),
        })),
    };
}

export async function getMailMessage(emailId) {
    const session = await getSession();
    const { responses } = await jmapCall([
        [
            'Email/get',
            {
                accountId: session.accountId,
                ids: [emailId],
                properties: [
                    'id',
                    'subject',
                    'from',
                    'to',
                    'cc',
                    'replyTo',
                    'receivedAt',
                    'keywords',
                    'textBody',
                    'htmlBody',
                    'bodyValues',
                    'messageId',
                ],
                fetchTextBodyValues: true,
                fetchHTMLBodyValues: true,
                maxBodyValueBytes: 256 * 1024,
            },
            'g',
        ],
        [
            'Email/set',
            {
                accountId: session.accountId,
                update: {
                    [emailId]: { 'keywords/$seen': true },
                },
            },
            's',
        ],
    ]);

    const item = responses.find((r) => r[0] === 'Email/get')?.[1]?.list?.[0];
    if (!item) return null;

    const bodyValues = item.bodyValues || {};
    const textPartId = item.textBody?.[0]?.partId;
    const htmlPartId = item.htmlBody?.[0]?.partId;
    const textContent = textPartId ? bodyValues[textPartId]?.value || '' : '';
    const htmlContent = htmlPartId ? bodyValues[htmlPartId]?.value || '' : '';

    return {
        id: item.id,
        subject: item.subject || '(No subject)',
        from: formatAddresses(item.from),
        fromEmail: item.replyTo?.[0]?.email || item.from?.[0]?.email || '',
        to: formatAddresses(item.to),
        receivedAt: item.receivedAt,
        textBody: textContent,
        htmlBody: htmlContent,
        messageId: item.messageId?.[0] || '',
    };
}

export async function deleteMailMessage(emailId) {
    const session = await getSession();
    await jmapCall([
        [
            'Email/set',
            {
                accountId: session.accountId,
                destroy: [emailId],
            },
            'd',
        ],
    ]);
    return { ok: true };
}

export async function sendMailMessage({ to, subject, body, inReplyTo }) {
    const session = await getSession();
    const toList = String(to || '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.includes('@'));
    if (toList.length === 0) {
        throw new Error('Please enter a valid recipient email address.');
    }

    // Try JMAP submission first (saves cleanly in Mailbux Sent folder)
    try {
        const { responses: initRes } = await jmapCall(
            [
                ['Mailbox/get', { accountId: session.accountId }, 'mb'],
                ['Identity/get', { accountId: session.accountId }, 'id'],
            ],
            ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
        );

        const mailboxes = initRes.find((r) => r[0] === 'Mailbox/get')?.[1]?.list || [];
        const identities = initRes.find((r) => r[0] === 'Identity/get')?.[1]?.list || [];
        const draftsBox =
            mailboxes.find((m) => String(m.role || '').toLowerCase() === 'drafts') ||
            mailboxes.find((m) => String(m.role || '').toLowerCase() === 'sent') ||
            mailboxes[0];
        const sentBox = mailboxes.find((m) => String(m.role || '').toLowerCase() === 'sent') || draftsBox;
        const identity =
            identities.find((i) => String(i.email || '').toLowerCase() === session.username.toLowerCase()) ||
            identities[0];

        if (draftsBox && identity) {
            const createEmail = {
                mailboxIds: { [draftsBox.id]: true },
                keywords: { $seen: true, $draft: true },
                from: [{ name: 'Sam — Crevo AI', email: identity.email }],
                to: toList.map((email) => ({ email })),
                subject: String(subject || '(No subject)'),
                ...(inReplyTo ? { inReplyTo: [inReplyTo] } : {}),
                bodyValues: {
                    body: { value: String(body || ''), isEncodingProblem: false, isTruncated: false },
                },
                textBody: [{ partId: 'body', type: 'text/plain' }],
            };

            const { responses: sendRes } = await jmapCall(
                [
                    ['Email/set', { accountId: session.accountId, create: { draft1: createEmail } }, 'c1'],
                    [
                        'EmailSubmission/set',
                        {
                            accountId: session.accountId,
                            create: {
                                sub1: {
                                    identityId: identity.id,
                                    emailId: '#draft1',
                                    envelope: {
                                        mailFrom: { email: identity.email },
                                        rcptTo: toList.map((email) => ({ email })),
                                    },
                                },
                            },
                            onSuccessUpdateEmail: {
                                '#sub1': {
                                    [`mailboxIds/${draftsBox.id}`]: null,
                                    [`mailboxIds/${sentBox.id}`]: true,
                                    'keywords/$draft': null,
                                },
                            },
                        },
                        'c2',
                    ],
                ],
                ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission']
            );

            const subResult = sendRes.find((r) => r[0] === 'EmailSubmission/set')?.[1];
            if (subResult?.created?.sub1) {
                return { ok: true, via: 'mailbux-jmap' };
            }
        }
    } catch (jmapErr) {
        console.warn('Mailbux JMAP send failed, falling back to Resend:', jmapErr?.message || jmapErr);
    }

    // Fallback: send from sam@crevo.app via verified Resend API
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
        throw new Error('Could not send email via Mailbux JMAP and RESEND_API_KEY is not set.');
    }
    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            from: `Sam — Crevo AI <${session.username}>`,
            reply_to: session.username,
            to: toList,
            subject: String(subject || '(No subject)'),
            text: String(body || ''),
        }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Failed to send email (${res.status}): ${text.slice(0, 160)}`);
    }
    return { ok: true, via: 'resend' };
}
