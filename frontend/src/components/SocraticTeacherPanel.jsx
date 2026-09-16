import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { HelpCircle, Send, CheckCircle2, PieChart, Users, XCircle, Sparkles, MessageSquare, TrendingUp } from 'lucide-react';
import SocraticAnalyticsView from './SocraticAnalyticsView';

const PRESET_PROMPTS = [
  "What is the primary assumption underlying this concept?",
  "Which step should be taken next to troubleshoot this error?",
  "How does changing this key parameter impact system performance?",
  "What alternative approach might resolve this constraint more efficiently?"
];

export default function SocraticTeacherPanel({ sessionId, onClose, classCode = '', question, setQuestion, answers = [], setAnswers }) {
  const [localQuestion, setLocalQuestion] = useState(question || '');
  const [questionType, setQuestionType] = useState('mcq');
  const [options, setOptions] = useState(['Option A', 'Option B', 'Option C', 'Option D']);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('create'); // 'create', 'analytics', or 'prepost'
  const [sessionAnswers, setSessionAnswers] = useState([]);

  useEffect(() => {
    if (sessionId) {
      apiFetch(`/api/socratic/session/${sessionId}/answers`)
        .then((res) => {
          if (res && res.answers) setSessionAnswers(res.answers);
        })
        .catch(() => {});
    }
  }, [sessionId, answers]);

  const handleOptionChange = (idx, val) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const publishQuestion = async () => {
    if (!localQuestion.trim()) return alert('Please enter question text.');
    setLoading(true);
    try {
      const resp = await apiFetch('/api/socratic/question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          question: localQuestion.trim(),
          question_type: questionType,
          options: questionType === 'mcq' ? options.filter(o => o.trim()) : []
        }),
      });
      if (resp && resp.question) {
        setQuestion(resp.question);
        setActiveTab('analytics');
      }
    } catch (e) {
      alert(e.message || 'Failed to publish question');
    } finally {
      setLoading(false);
    }
  };

  const endSession = async () => {
    if (!confirm('End this Socratic intervention session for the class?')) return;
    try {
      await apiFetch('/api/socratic/session/end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
      });
      onClose();
    } catch (e) {
      alert(e.message || 'Failed to end session');
    }
  };

  // Compute Learning Gain: Attempt 1 vs Attempt 2 option counts
  const attempt1Counts = {};
  const attempt2Counts = {};
  sessionAnswers.forEach((a) => {
    if (a.attempt_number === 1) {
      const opt = a.selected_option || a.answer_text;
      attempt1Counts[opt] = (attempt1Counts[opt] || 0) + 1;
    } else {
      const opt = a.selected_reflection_option || a.reflection_text;
      attempt2Counts[opt] = (attempt2Counts[opt] || 0) + 1;
    }
  });

  return (
    <div className="socratic-modal-backdrop" style={{
      position: 'fixed',
      top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 9999,
      backdropFilter: 'blur(4px)'
    }}>
      <div className="socratic-teacher-card" style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        width: '92%',
        maxWidth: '840px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        padding: '24px',
        border: '1px solid #E2E8F0',
      }}>
        {/* Header & Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <HelpCircle size={18} style={{ color: '#4F46E5' }} /> Socratic Intervention Control Panel
            </h2>
            <span style={{ fontSize: '0.78rem', color: '#64748B' }}>Teacher Control, Reflection Review & Pre/Post Impact Analytics</span>
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button
              type="button"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                fontWeight: '600',
                borderRadius: '6px',
                border: activeTab === 'create' ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                backgroundColor: activeTab === 'create' ? '#EEF2FF' : '#F8FAFC',
                color: activeTab === 'create' ? '#4338CA' : '#475569',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('create')}
            >
              Question Builder
            </button>
            <button
              type="button"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                fontWeight: '600',
                borderRadius: '6px',
                border: activeTab === 'analytics' ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                backgroundColor: activeTab === 'analytics' ? '#EEF2FF' : '#F8FAFC',
                color: activeTab === 'analytics' ? '#4338CA' : '#475569',
                cursor: 'pointer'
              }}
              onClick={() => setActiveTab('analytics')}
            >
              Session Review ({sessionAnswers.length})
            </button>
            <button
              type="button"
              style={{
                padding: '5px 12px',
                fontSize: '0.78rem',
                fontWeight: '600',
                borderRadius: '6px',
                border: activeTab === 'prepost' ? '2px solid #2563EB' : '1px solid #CBD5E1',
                backgroundColor: activeTab === 'prepost' ? '#EFF6FF' : '#F8FAFC',
                color: activeTab === 'prepost' ? '#1E40AF' : '#475569',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
              onClick={() => setActiveTab('prepost')}
            >
              <TrendingUp size={13} /> Pre / Post Impact
            </button>
          </div>
        </div>

        {/* TAB 1: QUESTION BUILDER */}
        {activeTab === 'create' && (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Preset Pedagogical Prompts:
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {PRESET_PROMPTS.map((prompt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      textAlign: 'left',
                      padding: '8px 12px',
                      borderRadius: '8px',
                      border: '1px solid #E2E8F0',
                      backgroundColor: '#F8FAFC',
                      fontSize: '0.82rem',
                      color: '#334155',
                      cursor: 'pointer'
                    }}
                    onClick={() => setLocalQuestion(prompt)}
                  >
                    💡 {prompt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>
                Socratic Question Text:
              </label>
              <textarea
                rows={3}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: '1px solid #CBD5E1',
                  fontSize: '0.88rem',
                  color: '#0F172A'
                }}
                placeholder="Enter lesson-related question text..."
                value={localQuestion}
                onChange={(e) => setLocalQuestion(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: '14px' }}>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '8px' }}>
                <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155' }}>Question Format:</label>
                <label style={{ fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}>
                  <input type="radio" name="qtype" value="mcq" checked={questionType === 'mcq'} onChange={() => setQuestionType('mcq')} /> Multiple Choice (MCQ)
                </label>
                <label style={{ fontSize: '0.8rem', color: '#475569', cursor: 'pointer' }}>
                  <input type="radio" name="qtype" value="short" checked={questionType === 'short'} onChange={() => setQuestionType('short')} /> Short Answer Text
                </label>
              </div>

              {questionType === 'mcq' && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {options.map((opt, idx) => (
                    <input
                      key={idx}
                      type="text"
                      style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.82rem' }}
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                    />
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
              <button type="button" onClick={endSession} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #FCA5A5', backgroundColor: '#FEE2E2', color: '#DC2626', fontWeight: '600', cursor: 'pointer' }}>
                End Session
              </button>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button type="button" onClick={onClose} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer' }}>Close Panel</button>
                <button type="button" onClick={publishQuestion} disabled={loading} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#FFFFFF', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Send size={14} /> {loading ? 'Publishing…' : 'Activate Live to Class'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: SESSION REVIEW & ANALYTICS */}
        {activeTab === 'analytics' && (
          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PieChart size={16} style={{ color: '#2563EB' }} /> Learning Gain Analysis (Attempt 1 vs Attempt 2)
            </h4>

            <div style={{ backgroundColor: '#F8FAFC', padding: '12px 14px', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '16px' }}>
              {options.map((opt) => {
                const c1 = attempt1Counts[opt] || 0;
                const c2 = attempt2Counts[opt] || 0;
                return (
                  <div key={opt} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '600', color: '#334155', marginBottom: '2px' }}>
                      <span>{opt}</span>
                      <span>Attempt 1: {c1} · Attempt 2: {c2}</span>
                    </div>
                    <div style={{ display: 'flex', gap: '4px', height: '8px' }}>
                      <div style={{ flex: 1, backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c1 * 20}%`, backgroundColor: '#93C5FD' }} />
                      </div>
                      <div style={{ flex: 1, backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${c2 * 20}%`, backgroundColor: '#10B981' }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={16} style={{ color: '#F59E0B' }} /> Anonymous Self-Reflections ({sessionAnswers.filter(a => a.reflection_text).length})
            </h4>

            <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {sessionAnswers.filter(a => a.reflection_text).length === 0 ? (
                <p style={{ fontSize: '0.8rem', color: '#94A3B8', textAlign: 'center', margin: '12px 0' }}>No reflection notes submitted yet.</p>
              ) : (
                sessionAnswers.filter(a => a.reflection_text).map((a, idx) => (
                  <div key={idx} style={{ backgroundColor: '#FFFFFF', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0', fontSize: '0.82rem', color: '#334155' }}>
                    <strong style={{ color: '#4F46E5' }}>Student {a.roll_number || 'Anonymous'}:</strong> "{a.reflection_text}"
                  </div>
                ))
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer' }}>Close Panel</button>
            </div>
          </div>
        )}

        {/* TAB 3: PRE / POST IMPACT ANALYTICS */}
        {activeTab === 'prepost' && (
          <div>
            <SocraticAnalyticsView sessionId={sessionId} classCode={classCode} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #F1F5F9' }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 18px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer' }}>Close Panel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

