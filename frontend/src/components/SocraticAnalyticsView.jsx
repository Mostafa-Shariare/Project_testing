import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import {
  TrendingUp,
  BarChart3,
  CheckCircle2,
  HelpCircle,
  Clock,
  ArrowUpRight,
  ShieldAlert,
  Sparkles,
  RefreshCw,
  UserCheck,
  Zap,
} from 'lucide-react';

export default function SocraticAnalyticsView({ sessionId, classCode }) {
  const [activeTab, setActiveTab] = useState('session'); // 'session' | 'aggregate'
  const [sessionData, setSessionData] = useState(null);
  const [aggregateData, setAggregateData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchAnalytics = async () => {
    setLoading(true);
    setError('');
    try {
      if (sessionId) {
        const sRes = await apiFetch(`/api/socratic/analytics/session/${sessionId}`);
        setSessionData(sRes);
      }
      if (classCode) {
        const aRes = await apiFetch(`/api/socratic/analytics/aggregate?class_code=${encodeURIComponent(classCode)}`);
        setAggregateData(aRes);
      }
    } catch (err) {
      setError(err.message || 'Failed to load intervention analytics');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [sessionId, classCode]);

  const summary = sessionData?.summary || {};
  const comparisons = sessionData?.student_comparisons || [];
  const aggSummaries = aggregateData?.session_summaries || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', fontFamily: 'Inter, sans-serif' }}>
      {/* Top Header & View Toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600, color: '#172B4D', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={22} color="#2563EB" />
            Pre / Post Intervention Analytics
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#64748B' }}>
            Observational metrics evaluating attention states and learning gain indicators before and after Socratic prompts.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', background: '#F1F5F9', padding: '4px', borderRadius: '10px' }}>
          <button
            onClick={() => setActiveTab('session')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'session' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'session' ? '#2563EB' : '#64748B',
              boxShadow: activeTab === 'session' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Session Outcome
          </button>
          <button
            onClick={() => setActiveTab('aggregate')}
            style={{
              padding: '6px 14px',
              borderRadius: '8px',
              border: 'none',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              background: activeTab === 'aggregate' ? '#FFFFFF' : 'transparent',
              color: activeTab === 'aggregate' ? '#2563EB' : '#64748B',
              boxShadow: activeTab === 'aggregate' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 0.15s ease',
            }}
          >
            Cross-Session Trends
          </button>
          <button
            onClick={fetchAnalytics}
            title="Refresh Analytics"
            style={{
              padding: '6px 10px',
              borderRadius: '8px',
              border: '1px solid #CBD5E1',
              background: '#FFFFFF',
              cursor: 'pointer',
              color: '#475569',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin-icon' : ''} />
          </button>
        </div>
      </div>

      {/* Non-Causal Observational Disclaimer Banner */}
      <div
        style={{
          background: '#F0F9FF',
          borderLeft: '4px solid #0284C7',
          borderRadius: '8px',
          padding: '12px 16px',
          display: 'flex',
          gap: '12px',
          alignItems: 'flex-start',
        }}
      >
        <ShieldAlert size={20} color="#0284C7" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '0.82rem', color: '#0C4A6E', lineHeight: '1.45' }}>
          <strong>Observational Analytics Note:</strong> Metrics reflect observed changes in student telemetry and self-reported confidence between pre- and post-intervention windows. These statistics represent observational trends and post-intervention improvements rather than direct causal evidence.
        </div>
      </div>

      {loading && (
        <div style={{ padding: '30px', textAlign: 'center', color: '#64748B', fontSize: '0.9rem' }}>
          Loading intervention analytics data...
        </div>
      )}

      {error && (
        <div style={{ padding: '12px', background: '#FEE2E2', color: '#991B1B', borderRadius: '8px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {!loading && activeTab === 'session' && (
        <>
          {!sessionId || !sessionData ? (
            <div style={{ padding: '30px', textAlign: 'center', background: '#F8FAFC', borderRadius: '12px', color: '#64748B' }}>
              No active or selected Socratic session analytics found for this view.
            </div>
          ) : (
            <>
              {/* Summary Metric Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Observed Attention Change
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: summary.avg_observed_attention_change >= 0 ? '#10B981' : '#EF4444', margin: '6px 0 2px' }}>
                    {summary.avg_observed_attention_change >= 0 ? `+${summary.avg_observed_attention_change}%` : `${summary.avg_observed_attention_change}%`}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    Pre- vs. Post-Intervention Mean
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Confidence Shift Score
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: summary.avg_confidence_shift >= 0 ? '#2563EB' : '#F59E0B', margin: '6px 0 2px' }}>
                    {summary.avg_confidence_shift >= 0 ? `+${summary.avg_confidence_shift}` : summary.avg_confidence_shift}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    Scale: Unsure(1) $\rightarrow$ Very Confident(3)
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Answer Revision Rate
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8B5CF6', margin: '6px 0 2px' }}>
                    {summary.answer_change_rate}%
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    Shifted Choice post-peer comparison
                  </div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
                  <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Completion Rate
                  </div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#059669', margin: '6px 0 2px' }}>
                    {summary.intervention_completion_rate}%
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#64748B' }}>
                    {summary.total_completed} / {summary.total_participating} Completed Stage 4
                  </div>
                </div>
              </div>

              {/* Student Level Pre/Post Comparison Table */}
              <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
                  <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1E293B' }}>
                    Student Pre- & Post-Intervention Telemetry & Answer Comparison
                  </h4>
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                        <th style={{ padding: '10px 14px' }}>Student Roll</th>
                        <th style={{ padding: '10px 14px' }}>Pre Focus</th>
                        <th style={{ padding: '10px 14px' }}>Post Focus</th>
                        <th style={{ padding: '10px 14px' }}>Observed Change</th>
                        <th style={{ padding: '10px 14px' }}>Initial Choice</th>
                        <th style={{ padding: '10px 14px' }}>Revised Choice</th>
                        <th style={{ padding: '10px 14px' }}>Confidence Shift</th>
                        <th style={{ padding: '10px 14px' }}>Reflection</th>
                        <th style={{ padding: '10px 14px' }}>Learning Gain Indicator</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparisons.length === 0 ? (
                        <tr>
                          <td colSpan="9" style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
                            No student response comparisons available yet.
                          </td>
                        </tr>
                      ) : (
                        comparisons.map((c, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B' }}>{c.roll_number}</td>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>{c.attention_pre}%</td>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>{c.attention_post}%</td>
                            <td style={{ padding: '10px 14px', fontWeight: 600, color: c.observed_attention_change >= 0 ? '#059669' : '#DC2626' }}>
                              {c.observed_attention_change >= 0 ? `+${c.observed_attention_change}%` : `${c.observed_attention_change}%`}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#334155' }}>{c.initial_answer || '—'}</td>
                            <td style={{ padding: '10px 14px', color: c.answer_changed ? '#7C3AED' : '#334155', fontWeight: c.answer_changed ? 600 : 400 }}>
                              {c.revised_answer || '—'}
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              <span style={{
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 600,
                                background: c.confidence_shift > 0 ? '#DCFCE7' : c.confidence_shift < 0 ? '#FEE2E2' : '#F1F5F9',
                                color: c.confidence_shift > 0 ? '#166534' : c.confidence_shift < 0 ? '#991B1B' : '#475569',
                              }}>
                                {c.confidence_shift > 0 ? `+${c.confidence_shift} (${c.revised_confidence})` : c.confidence_shift < 0 ? `${c.confidence_shift} (${c.revised_confidence})` : `0 (${c.initial_confidence})`}
                              </span>
                            </td>
                            <td style={{ padding: '10px 14px' }}>
                              {c.reflection_completed ? (
                                <span style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <CheckCircle2 size={14} /> Submitted
                                </span>
                              ) : (
                                <span style={{ color: '#94A3B8' }}>Pending</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 14px', color: '#475569' }}>
                              <span style={{ fontSize: '0.78rem', background: '#F8FAFC', padding: '3px 8px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                {c.learning_gain_indicator}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {!loading && activeTab === 'aggregate' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Longitudinal Aggregate Overview */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Total Intervention Sessions
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#1E293B', margin: '6px 0 2px' }}>
                {aggregateData?.total_sessions || 0}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Historical Class Record</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Avg Observed Focus Change
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: (aggregateData?.average_observed_attention_change || 0) >= 0 ? '#10B981' : '#EF4444', margin: '6px 0 2px' }}>
                {(aggregateData?.average_observed_attention_change || 0) >= 0 ? `+${aggregateData?.average_observed_attention_change}%` : `${aggregateData?.average_observed_attention_change}%`}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Across All Sessions</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Overall Completion Rate
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#2563EB', margin: '6px 0 2px' }}>
                {aggregateData?.overall_completion_rate || 0}%
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Stage 4 Reassess Finish</div>
            </div>

            <div style={{ background: '#FFFFFF', padding: '16px', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                Avg Confidence Shift
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#8B5CF6', margin: '6px 0 2px' }}>
                {(aggregateData?.average_confidence_shift || 0) >= 0 ? `+${aggregateData?.average_confidence_shift}` : aggregateData?.average_confidence_shift}
              </div>
              <div style={{ fontSize: '0.78rem', color: '#64748B' }}>Post-Intervention Gain</div>
            </div>
          </div>

          {/* Historical Session List */}
          <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #F1F5F9', background: '#F8FAFC' }}>
              <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: '#1E293B' }}>
                Historical Socratic Intervention Sessions Summary
              </h4>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: '#F8FAFC', color: '#475569', borderBottom: '1px solid #E2E8F0' }}>
                    <th style={{ padding: '10px 14px' }}>Question Prompt</th>
                    <th style={{ padding: '10px 14px' }}>Date</th>
                    <th style={{ padding: '10px 14px' }}>Completed Students</th>
                    <th style={{ padding: '10px 14px' }}>Completion Rate</th>
                    <th style={{ padding: '10px 14px' }}>Avg Observed Focus Change</th>
                    <th style={{ padding: '10px 14px' }}>Avg Confidence Shift</th>
                    <th style={{ padding: '10px 14px' }}>Answer Change Rate</th>
                  </tr>
                </thead>
                <tbody>
                  {aggSummaries.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ padding: '20px', textAlign: 'center', color: '#94A3B8' }}>
                        No historical Socratic intervention records found for this class.
                      </td>
                    </tr>
                  ) : (
                    aggSummaries.map((s, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: '#1E293B' }}>{s.question_text || 'Socratic Question'}</td>
                        <td style={{ padding: '10px 14px', color: '#64748B' }}>{s.created_at ? new Date(s.created_at).toLocaleDateString() : 'Recent'}</td>
                        <td style={{ padding: '10px 14px', color: '#334155' }}>{s.completed_students}</td>
                        <td style={{ padding: '10px 14px', color: '#059669', fontWeight: 600 }}>{s.completion_rate}%</td>
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: s.avg_observed_attention_change >= 0 ? '#10B981' : '#EF4444' }}>
                          {s.avg_observed_attention_change >= 0 ? `+${s.avg_observed_attention_change}%` : `${s.avg_observed_attention_change}%`}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: 600 }}>
                          {s.avg_confidence_shift >= 0 ? `+${s.avg_confidence_shift}` : s.avg_confidence_shift}
                        </td>
                        <td style={{ padding: '10px 14px', color: '#8B5CF6' }}>{s.answer_change_rate}%</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
