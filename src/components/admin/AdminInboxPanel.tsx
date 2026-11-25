import React, { FC, useEffect, useState, useCallback } from 'react';
import { toast } from 'react-toastify';
import { apiRequest } from '../../lib/api';

interface MailSummary {
    id: string;
    subject: string;
    from: string;
    fromEmail: string;
    to: string;
    receivedAt: string;
    preview: string;
    isUnread: boolean;
    hasAttachment: boolean;
}

interface MailDetail {
    id: string;
    subject: string;
    from: string;
    fromEmail: string;
    to: string;
    receivedAt: string;
    textBody: string;
    htmlBody: string;
    messageId: string;
}

function formatMailDate(iso?: string): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export const AdminInboxPanel: FC = () => {
    const [folder, setFolder] = useState<'inbox' | 'sent'>('inbox');
    const [mailbox, setMailbox] = useState('sam@crevo.app');
    const [unreadCount, setUnreadCount] = useState(0);
    const [messages, setMessages] = useState<MailSummary[]>([]);
    const [loadingList, setLoadingList] = useState(true);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [selectedMsg, setSelectedMsg] = useState<MailDetail | null>(null);
    const [loadingMsg, setLoadingMsg] = useState(false);

    const [composeOpen, setComposeOpen] = useState(false);
    const [composeTo, setComposeTo] = useState('');
    const [composeSubject, setComposeSubject] = useState('');
    const [composeBody, setComposeBody] = useState('');
    const [composeReplyTo, setComposeReplyTo] = useState('');
    const [replyQuote, setReplyQuote] = useState<{ from: string; date: string; text: string } | null>(null);
    const [includeQuote, setIncludeQuote] = useState(false);
    const [sending, setSending] = useState(false);

    const loadMessages = useCallback(async (targetFolder: 'inbox' | 'sent' = folder) => {
        setLoadingList(true);
        try {
            const res = await apiRequest<{
                mailbox: string;
                unreadCount: number;
                messages: MailSummary[];
            }>(`/api/admin/mail/messages?folder=${targetFolder}&limit=35`);
            setMailbox(res.mailbox || 'sam@crevo.app');
            setUnreadCount(Number(res.unreadCount || 0));
            setMessages(res.messages || []);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load inbox');
        } finally {
            setLoadingList(false);
        }
    }, [folder]);

    useEffect(() => {
        loadMessages(folder);
    }, [folder, loadMessages]);

    const openMessage = async (id: string) => {
        setSelectedId(id);
        setLoadingMsg(true);
        try {
            const msg = await apiRequest<MailDetail>(`/api/admin/mail/messages/${encodeURIComponent(id)}`);
            setSelectedMsg(msg);
            setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, isUnread: false } : m)));
        } catch (err: any) {
            toast.error(err?.message || 'Could not open message');
        } finally {
            setLoadingMsg(false);
        }
    };

    const handleDelete = async (id: string) => {
        try {
            await apiRequest(`/api/admin/mail/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
            setMessages((prev) => prev.filter((m) => m.id !== id));
            if (selectedId === id) {
                setSelectedId(null);
                setSelectedMsg(null);
            }
            toast.success('Email deleted');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to delete email');
        }
    };

    const openReply = (msg: MailDetail) => {
        setComposeTo(msg.fromEmail || '');
        setComposeSubject(msg.subject.toLowerCase().startsWith('re:') ? msg.subject : `Re: ${msg.subject}`);
        setComposeBody('');
        setComposeReplyTo(msg.messageId || '');
        setReplyQuote({
            from: msg.from || msg.fromEmail || '',
            date: formatMailDate(msg.receivedAt),
            text: (msg.textBody || '').trim(),
        });
        setIncludeQuote(false);
        setComposeOpen(true);
    };

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        setSending(true);
        try {
            const finalBody =
                replyQuote && includeQuote && replyQuote.text
                    ? `${composeBody.trim()}\n\n--- On ${replyQuote.date}, ${replyQuote.from} wrote ---\n${replyQuote.text}`
                    : composeBody.trim();

            await apiRequest('/api/admin/mail/send', {
                method: 'POST',
                body: JSON.stringify({
                    to: composeTo,
                    subject: composeSubject,
                    body: finalBody,
                    inReplyTo: composeReplyTo || undefined,
                }),
            });
            toast.success(`Email sent from ${mailbox}!`);
            setComposeOpen(false);
            setComposeTo('');
            setComposeSubject('');
            setComposeBody('');
            setComposeReplyTo('');
            setReplyQuote(null);
            setIncludeQuote(false);
            if (folder === 'sent') loadMessages('sent');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to send email');
        } finally {
            setSending(false);
        }
    };

    return (
        <div style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: '16px', overflow: 'hidden' }}>
            {/* Mail Toolbar */}
            <div
                style={{
                    padding: '14px 18px',
                    borderBottom: '1px solid #e5e7eb',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    background: '#faf8ff',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800, fontSize: '14px', color: '#571c86', marginRight: '6px' }}>
                        📬 {mailbox}
                    </span>
                    <button
                        type="button"
                        onClick={() => {
                            setFolder('inbox');
                            setSelectedId(null);
                            setSelectedMsg(null);
                        }}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #d8ccf0',
                            background: folder === 'inbox' ? '#571c86' : '#ffffff',
                            color: folder === 'inbox' ? '#ffffff' : '#374151',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        Inbox {unreadCount > 0 ? `(${unreadCount})` : ''}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setFolder('sent');
                            setSelectedId(null);
                            setSelectedMsg(null);
                        }}
                        style={{
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #d8ccf0',
                            background: folder === 'sent' ? '#571c86' : '#ffffff',
                            color: folder === 'sent' ? '#ffffff' : '#374151',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        Sent
                    </button>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                        type="button"
                        onClick={() => loadMessages(folder)}
                        disabled={loadingList}
                        style={{
                            padding: '7px 12px',
                            borderRadius: '8px',
                            border: '1px solid #d8ccf0',
                            background: '#ffffff',
                            color: '#571c86',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        {loadingList ? 'Syncing...' : '↻ Sync'}
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            setComposeTo('');
                            setComposeSubject('');
                            setComposeBody('');
                            setComposeReplyTo('');
                            setReplyQuote(null);
                            setIncludeQuote(false);
                            setComposeOpen(true);
                        }}
                        style={{
                            padding: '7px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#571c86',
                            color: '#ffffff',
                            fontWeight: 700,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        + Compose Email
                    </button>
                </div>
            </div>

            {/* Split Pane: List + Reader */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', minHeight: '480px' }}>
                {/* Left List */}
                <div style={{ borderRight: '1px solid #e5e7eb', maxHeight: '600px', overflowY: 'auto' }}>
                    {loadingList && messages.length === 0 ? (
                        <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                            Loading {folder}...
                        </div>
                    ) : messages.length === 0 ? (
                        <div style={{ padding: '32px 16px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                            No emails in {folder} yet.
                        </div>
                    ) : (
                        messages.map((m) => {
                            const active = m.id === selectedId;
                            return (
                                <button
                                    key={m.id}
                                    type="button"
                                    onClick={() => openMessage(m.id)}
                                    style={{
                                        width: '100%',
                                        textAlign: 'left',
                                        padding: '12px 14px',
                                        border: 'none',
                                        borderBottom: '1px solid #f3f4f6',
                                        background: active ? '#f3e8ff' : m.isUnread ? '#faf8ff' : '#ffffff',
                                        cursor: 'pointer',
                                        display: 'block',
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px', marginBottom: '3px' }}>
                                        <span
                                            style={{
                                                fontSize: '13px',
                                                fontWeight: m.isUnread ? 800 : 600,
                                                color: '#111827',
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                            }}
                                        >
                                            {m.isUnread ? '● ' : ''}
                                            {folder === 'sent' ? `To: ${m.to || '(recipient)'}` : m.from || '(unknown)'}
                                        </span>
                                        <span style={{ fontSize: '11px', color: '#6b7280', whiteSpace: 'nowrap' }}>
                                            {formatMailDate(m.receivedAt)}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '13px',
                                            fontWeight: m.isUnread ? 700 : 500,
                                            color: '#1f2937',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {m.subject}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '12px',
                                            color: '#6b7280',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                            marginTop: '2px',
                                        }}
                                    >
                                        {m.preview}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>

                {/* Right Reader */}
                <div style={{ padding: '20px', maxHeight: '600px', overflowY: 'auto' }}>
                    {loadingMsg ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: '#6b7280' }}>Opening email...</div>
                    ) : selectedMsg ? (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800, color: '#111827' }}>
                                    {selectedMsg.subject}
                                </h3>
                                <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                    <button
                                        type="button"
                                        onClick={() => openReply(selectedMsg)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: 'none',
                                            background: '#571c86',
                                            color: '#ffffff',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        ↩ Reply
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleDelete(selectedMsg.id)}
                                        style={{
                                            padding: '6px 12px',
                                            borderRadius: '8px',
                                            border: '1px solid #fecaca',
                                            background: '#fef2f2',
                                            color: '#dc2626',
                                            fontWeight: 600,
                                            fontSize: '12px',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                            <div style={{ fontSize: '13px', color: '#4b5563', paddingBottom: '12px', borderBottom: '1px solid #e5e7eb', marginBottom: '16px' }}>
                                <div><strong>From:</strong> {selectedMsg.from}</div>
                                <div><strong>To:</strong> {selectedMsg.to}</div>
                                <div><strong>Date:</strong> {formatMailDate(selectedMsg.receivedAt)}</div>
                            </div>
                            {selectedMsg.htmlBody ? (
                                <iframe
                                    title="Email body"
                                    sandbox="allow-popups allow-popups-to-escape-sandbox"
                                    srcDoc={selectedMsg.htmlBody}
                                    style={{ width: '100%', minHeight: '360px', border: '1px solid #f3f4f6', borderRadius: '10px', background: '#ffffff' }}
                                />
                            ) : (
                                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'Inter, sans-serif', fontSize: '14px', lineHeight: 1.6, margin: 0, color: '#1f2937' }}>
                                    {selectedMsg.textBody || '(Empty message)'}
                                </pre>
                            )}
                        </div>
                    ) : (
                        <div style={{ padding: '4rem 1rem', textAlign: 'center', color: '#9ca3af' }}>
                            Select an email on the left to read it, or click <strong>+ Compose Email</strong> to send from <strong>{mailbox}</strong>.
                        </div>
                    )}
                </div>
            </div>

            {/* Compose / Reply Modal */}
            {composeOpen && (
                <div
                    onClick={() => setComposeOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(17, 17, 27, 0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '16px',
                        zIndex: 10000,
                    }}
                >
                    <form
                        onSubmit={handleSend}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#ffffff',
                            borderRadius: '16px',
                            maxWidth: '540px',
                            width: '100%',
                            padding: '24px',
                            boxShadow: '0 20px 50px rgba(0, 0, 0, 0.25)',
                        }}
                    >
                        <h3 style={{ margin: '0 0 14px', fontSize: '18px', fontWeight: 800 }}>
                            Send Email from {mailbox}
                        </h3>
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>To</label>
                        <input
                            type="email"
                            required
                            value={composeTo}
                            onChange={(e) => setComposeTo(e.target.value)}
                            placeholder="recipient@example.com"
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', marginBottom: '12px', fontSize: '14px' }}
                        />
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Subject</label>
                        <input
                            type="text"
                            required
                            value={composeSubject}
                            onChange={(e) => setComposeSubject(e.target.value)}
                            placeholder="Subject..."
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', marginBottom: '12px', fontSize: '14px' }}
                        />
                        <label style={{ display: 'block', fontSize: '13px', fontWeight: 600, marginBottom: '4px' }}>Message</label>
                        <textarea
                            required
                            autoFocus={Boolean(replyQuote)}
                            rows={7}
                            value={composeBody}
                            onChange={(e) => setComposeBody(e.target.value)}
                            placeholder={replyQuote ? 'Write your reply...' : 'Write your message...'}
                            style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid #d1d5db', marginBottom: replyQuote ? '10px' : '16px', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}
                        />
                        {replyQuote && replyQuote.text && (
                            <div style={{ marginBottom: '16px' }}>
                                <label
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        fontSize: '12px',
                                        color: '#4b5563',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={includeQuote}
                                        onChange={(e) => setIncludeQuote(e.target.checked)}
                                    />
                                    Include previous message below my reply
                                </label>
                                {includeQuote && (
                                    <div
                                        style={{
                                            marginTop: '8px',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            borderLeft: '3px solid #d8ccf0',
                                            background: '#f9fafb',
                                            fontSize: '12px',
                                            color: '#6b7280',
                                            maxHeight: '110px',
                                            overflowY: 'auto',
                                            whiteSpace: 'pre-wrap',
                                        }}
                                    >
                                        <div style={{ fontWeight: 600, marginBottom: '4px', color: '#4b5563' }}>
                                            On {replyQuote.date}, {replyQuote.from} wrote:
                                        </div>
                                        {replyQuote.text}
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button
                                type="button"
                                onClick={() => setComposeOpen(false)}
                                style={{ padding: '9px 14px', borderRadius: '10px', border: '1px solid #e5e7eb', background: '#ffffff', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={sending}
                                style={{ padding: '9px 18px', borderRadius: '10px', border: 'none', background: '#571c86', color: '#ffffff', cursor: 'pointer', fontWeight: 700 }}
                            >
                                {sending ? 'Sending...' : 'Send Email →'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
};
