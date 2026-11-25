import React, { FC, useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
    fetchLibrary,
    deleteLibraryItem,
    getAuthedLibraryFileUrl,
    LibraryItem,
} from '../services/libraryService';

function formatBytes(bytes: number): string {
    if (!bytes) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const LibraryPage: FC = () => {
    const [items, setItems] = useState<LibraryItem[]>([]);
    const [retentionDays, setRetentionDays] = useState(7);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'thumbnail' | 'resize' | 'clip'>('all');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetchLibrary();
            setItems(res.items || []);
            if (res.retention_days) setRetentionDays(res.retention_days);
        } catch (err: any) {
            toast.error(err?.message || 'Failed to load your library');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const handleDelete = async (id: string) => {
        try {
            await deleteLibraryItem(id);
            setItems((prev) => prev.filter((item) => item.id !== id));
            toast.success('Deleted from library');
        } catch (err: any) {
            toast.error(err?.message || 'Failed to delete item');
        }
    };

    const filtered = items.filter((item) => (filter === 'all' ? true : item.type === filter));

    return (
        <div style={{ minHeight: '100vh', background: '#f8f6fc', color: '#111827', fontFamily: 'Inter, sans-serif' }}>
            <header
                style={{
                    background: '#ffffff',
                    borderBottom: '1px solid #e5e7eb',
                    padding: '14px 24px',
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '12px',
                    position: 'sticky',
                    top: 0,
                    zIndex: 40,
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span
                        style={{
                            padding: '5px 10px',
                            borderRadius: '8px',
                            background: 'linear-gradient(135deg, #571c86, #7e22ce)',
                            color: '#ffffff',
                            fontWeight: 800,
                            fontSize: '13px',
                        }}
                    >
                        MY LIBRARY
                    </span>
                    <h1 style={{ fontSize: '18px', fontWeight: 800, margin: 0 }}>Recent Work ({retentionDays}-Day Storage)</h1>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        type="button"
                        onClick={load}
                        disabled={loading}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '10px',
                            border: '1px solid #d8ccf0',
                            background: '#ffffff',
                            color: '#571c86',
                            fontWeight: 600,
                            fontSize: '13px',
                            cursor: 'pointer',
                        }}
                    >
                        {loading ? 'Loading...' : '↻ Refresh'}
                    </button>
                    <Link
                        to="/dashboard"
                        style={{
                            padding: '8px 16px',
                            borderRadius: '10px',
                            background: '#571c86',
                            color: '#ffffff',
                            fontWeight: 600,
                            fontSize: '13px',
                            textDecoration: 'none',
                        }}
                    >
                        ← Back to Studio
                    </Link>
                </div>
            </header>

            <main style={{ maxWidth: '1220px', margin: '0 auto', padding: '24px' }}>
                {/* Auto-expiry notice */}
                <div
                    style={{
                        background: '#f5eeff',
                        border: '1px solid #d8ccf0',
                        borderRadius: '14px',
                        padding: '14px 18px',
                        marginBottom: '20px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '10px',
                        fontSize: '14px',
                        color: '#3b0764',
                    }}
                >
                    <span>
                        ⏳ <strong>Temporary Cloud Storage:</strong> Your generated thumbnails, resized images, and viral clips are automatically saved here for <strong>{retentionDays} days</strong>, then permanently deleted. Download anything you want to keep!
                    </span>
                </div>

                {/* Filter Tabs */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '20px' }}>
                    {[
                        { id: 'all', label: `All (${items.length})` },
                        { id: 'thumbnail', label: `Thumbnails (${items.filter((i) => i.type === 'thumbnail').length})` },
                        { id: 'resize', label: `Resized (${items.filter((i) => i.type === 'resize').length})` },
                        { id: 'clip', label: `Viral Clips (${items.filter((i) => i.type === 'clip').length})` },
                    ].map((t) => {
                        const active = filter === t.id;
                        return (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setFilter(t.id as any)}
                                style={{
                                    padding: '8px 15px',
                                    borderRadius: '10px',
                                    border: active ? 'none' : '1px solid #e5e7eb',
                                    background: active ? '#571c86' : '#ffffff',
                                    color: active ? '#ffffff' : '#374151',
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    cursor: 'pointer',
                                }}
                            >
                                {t.label}
                            </button>
                        );
                    })}
                </div>

                {loading && items.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '4rem', color: '#6b7280' }}>Loading your saved work...</div>
                ) : filtered.length === 0 ? (
                    <div
                        style={{
                            background: '#ffffff',
                            border: '1px solid #e5e7eb',
                            borderRadius: '16px',
                            padding: '3.5rem 1.5rem',
                            textAlign: 'center',
                        }}
                    >
                        <div style={{ fontSize: '36px', marginBottom: '10px' }}>🗂️</div>
                        <h2 style={{ margin: '0 0 8px', fontSize: '20px', fontWeight: 800 }}>No saved items yet</h2>
                        <p style={{ margin: '0 0 20px', color: '#6b7280', fontSize: '14px' }}>
                            Generate a YouTube thumbnail, smart resize an image, or create viral clips in Crevo Studio — they'll appear here automatically for {retentionDays} days.
                        </p>
                        <Link
                            to="/dashboard"
                            style={{
                                display: 'inline-block',
                                padding: '11px 20px',
                                borderRadius: '10px',
                                background: '#571c86',
                                color: '#ffffff',
                                fontWeight: 700,
                                textDecoration: 'none',
                            }}
                        >
                            Open Crevo Studio →
                        </Link>
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
                            gap: '18px',
                        }}
                    >
                        {filtered.map((item) => {
                            const mediaUrl = getAuthedLibraryFileUrl(item.file_url);
                            const isVideo = item.type === 'clip' || item.mime_type.startsWith('video/');
                            return (
                                <div
                                    key={item.id}
                                    style={{
                                        background: '#ffffff',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '14px',
                                        overflow: 'hidden',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        boxShadow: '0 4px 14px rgba(87, 28, 134, 0.05)',
                                    }}
                                >
                                    <div
                                        style={{
                                            position: 'relative',
                                            background: '#0f0f17',
                                            height: isVideo ? '320px' : '185px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        {isVideo ? (
                                            <video
                                                src={mediaUrl}
                                                controls
                                                preload="metadata"
                                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            />
                                        ) : (
                                            <img
                                                src={mediaUrl}
                                                alt={item.title}
                                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            />
                                        )}
                                        <span
                                            style={{
                                                position: 'absolute',
                                                top: '8px',
                                                right: '8px',
                                                padding: '3px 9px',
                                                borderRadius: '999px',
                                                background: item.days_left <= 2 ? 'rgba(220, 38, 38, 0.9)' : 'rgba(17, 17, 27, 0.78)',
                                                color: '#ffffff',
                                                fontSize: '11px',
                                                fontWeight: 700,
                                            }}
                                        >
                                            {item.days_left}d left
                                        </span>
                                    </div>
                                    <div style={{ padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                        <div style={{ fontSize: '14px', fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {item.title}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                            {item.type.toUpperCase()}
                                            {item.aspect_ratio ? ` • ${item.aspect_ratio}` : ''}
                                            {item.file_size ? ` • ${formatBytes(item.file_size)}` : ''}
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '6px' }}>
                                            <a
                                                href={mediaUrl}
                                                download={`${item.title.replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 40)}.${isVideo ? 'mp4' : 'png'}`}
                                                style={{
                                                    flex: 1,
                                                    textAlign: 'center',
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    background: '#571c86',
                                                    color: '#ffffff',
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    textDecoration: 'none',
                                                }}
                                            >
                                                Download
                                            </a>
                                            <button
                                                type="button"
                                                onClick={() => handleDelete(item.id)}
                                                style={{
                                                    padding: '8px 12px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #fecaca',
                                                    background: '#fef2f2',
                                                    color: '#dc2626',
                                                    fontWeight: 600,
                                                    fontSize: '13px',
                                                    cursor: 'pointer',
                                                }}
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </main>
        </div>
    );
};
