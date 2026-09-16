import React, { useState } from 'react';
import { AlertTriangle, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import { apiFetch } from '../api';

export default function SocraticBanner({ classCode, onStart }) {
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    setLoading(true);
    try {
      const resp = await apiFetch('/api/socratic/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_code: classCode }),
      });
      if (resp && resp.session_id) {
        onStart(resp.session_id);
      }
    } catch (e) {
      console.error('Failed to start Socratic session', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        margin: '1.5rem 0 2rem 0',
        padding: '1.1rem 1.4rem',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, rgba(245, 158, 11, 0.12) 0%, rgba(30, 26, 20, 0.75) 50%, rgba(15, 17, 21, 0.95) 100%)',
        border: '1px solid rgba(245, 158, 11, 0.35)',
        boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.5), 0 0 20px -2px rgba(245, 158, 11, 0.15)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '1rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.18)',
            border: '1px solid rgba(245, 158, 11, 0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fbbf24',
            flexShrink: 0,
            boxShadow: '0 0 12px rgba(245, 158, 11, 0.2)',
          }}
        >
          <AlertTriangle size={20} />
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#fef3c7', letterSpacing: '0.01em' }}>
              Sustained Low Attention Detected
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                padding: '0.12rem 0.45rem',
                borderRadius: '4px',
                background: 'rgba(245, 158, 11, 0.22)',
                color: '#fbbf24',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                letterSpacing: '0.04em',
              }}
            >
              Action Recommended
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.82rem', color: '#9ca3af', lineHeight: 1.4 }}>
            Cohort focus has dropped below the target threshold for the configured duration. Consider launching an interactive pedagogical intervention.
          </p>
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={loading}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.6rem 1.15rem',
          borderRadius: '9px',
          background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
          color: '#0f1115',
          fontSize: '0.85rem',
          fontWeight: 700,
          border: 'none',
          cursor: loading ? 'not-allowed' : 'pointer',
          opacity: loading ? 0.75 : 1,
          boxShadow: '0 4px 14px rgba(245, 158, 11, 0.35)',
          transition: 'all 0.2s ease',
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => {
          if (!loading) e.currentTarget.style.transform = 'translateY(-1px)';
        }}
        onMouseLeave={(e) => {
          if (!loading) e.currentTarget.style.transform = 'none';
        }}
      >
        {loading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            <span>Starting Session…</span>
          </>
        ) : (
          <>
            <Sparkles size={16} />
            <span>Start Socratic Session</span>
            <ArrowRight size={15} />
          </>
        )}
      </button>
    </div>
  );
}
