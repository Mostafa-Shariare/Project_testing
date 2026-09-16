import { useState, useEffect } from 'react';
import {
  Camera,
  Eye,
  Cpu,
  Activity,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  PieChart,
  Send,
  CheckCircle2,
  Clock,
  MessageSquare,
  Zap,
  PauseCircle,
  PlayCircle,
  Lock,
  BarChart2
} from 'lucide-react';
import ActivityRenderer from './ActivityRenderer';

export default function ActiveSessionCard({
  activeSession,
  questions,
  currentQuestion,
  onSelectQuestion,
  submittedAnswers,
  onSubmitAnswer,
  onFetchCompare,
  onSubmitReflection,
  studentSessionState,
  rollNumber,
  classCode,
  activityType,
  activityConfig,
  activityResponse,
}) {
  const [selectedOption, setSelectedOption] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [initialConfidence, setInitialConfidence] = useState('High');
  const [selectedReflectionOption, setSelectedReflectionOption] = useState('');
  const [reflectionText, setReflectionText] = useState('');
  const [revisedConfidence, setRevisedConfidence] = useState('High');
  const [submitting, setSubmitting] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [isMonitoringPaused, setIsMonitoringPaused] = useState(false);

  const [peerCompareData, setPeerCompareData] = useState(null);

  const currentSubmission = currentQuestion ? submittedAnswers[currentQuestion.id] : null;

  useEffect(() => {
    if (currentSubmission && onFetchCompare) {
      onFetchCompare().then((res) => {
        if (res && res.percentages) {
          setPeerCompareData(res.percentages);
        }
      }).catch(() => {});
    }
  }, [currentSubmission, onFetchCompare]);



  // ── Non-Socratic Activity Routing ──────────────────────────────────────────
  // If the session uses any activity type other than socratic_question,
  // delegate to the ActivityRenderer component instead of the Socratic workflow.
  const effectiveActivityType = activityType || 'socratic_question';
  if (effectiveActivityType !== 'socratic_question') {
    return (
      <div className="calm-session-card calm-fade-in">
        <ActivityRenderer
          sessionId={activeSession?.session_id}
          activityType={effectiveActivityType}
          activityConfig={activityConfig || {}}
          rollNumber={rollNumber}
          classCode={classCode}
          existingResponse={activityResponse}
          onComplete={() => {
            setSuccessMessage('Activity completed successfully!');
            setTimeout(() => setSuccessMessage(''), 4000);
          }}
        />
      </div>
    );
  }

  // Determine current active stage in the Socratic 4-Stage Workflow:
  // 1: Think | 2: Compare | 3: Reflect | 4: Reassess (Complete)
  let activeStage = 1;
  if (currentSubmission) {
    if (currentSubmission.selected_reflection_option || currentSubmission.reflection_text) {
      activeStage = 4;
    } else {
      activeStage = 3; // Student is comparing peer responses and completing self-reflection
    }
  }

  const handleAnswerSubmit = async (e) => {
    e.preventDefault();
    if (!currentQuestion || submitting) return;

    const isMcq = currentQuestion.question_type === 'mcq';
    const val = isMcq ? selectedOption : answerText.trim();
    if (!val) {
      alert(isMcq ? 'Please select an option first.' : 'Please enter your answer.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitAnswer({
        questionId: currentQuestion.id,
        answer: val,
        selectedOption: isMcq ? selectedOption : null,
        confidence: initialConfidence
      });
      setSuccessMessage('Stage 1 (Think) Answer & Confidence Submitted!');
      setTimeout(() => setSuccessMessage(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to submit answer');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReflectionSubmit = async (e) => {
    e.preventDefault();
    if (!currentQuestion || submitting) return;

    const isMcq = currentQuestion.question_type === 'mcq';
    const val = isMcq ? selectedReflectionOption : reflectionText.trim();
    if (!val) {
      alert(isMcq ? 'Please select your revised option.' : 'Please enter your self-reflection.');
      return;
    }

    setSubmitting(true);
    try {
      await onSubmitReflection({
        questionId: currentQuestion.id,
        reflectionText: isMcq ? '' : reflectionText.trim(),
        selectedOption: isMcq ? selectedReflectionOption : null,
        confidence: revisedConfidence
      });
      setSuccessMessage('Stage 3 & 4 (Reflect → Reassess) Completed!');
      setTimeout(() => setSuccessMessage(''), 3500);
    } catch (err) {
      alert(err.message || 'Failed to submit reflection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="calm-session-card calm-fade-in">

      {/* Clean Privacy Indicator & On-Device Telemetry */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.75rem 1.15rem', background: 'var(--calm-surface-elevated)', borderRadius: 'var(--calm-radius-md)', border: '1px solid var(--calm-border)', marginBottom: '1.25rem', color: 'var(--calm-text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', fontSize: '0.82rem', fontWeight: 600 }}>
          <div style={{ width: 26, height: 26, borderRadius: 'var(--calm-radius-sm)', background: 'var(--calm-mint-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--calm-mint)' }}>
            <Lock size={14} />
          </div>
          <span style={{ letterSpacing: '-0.01em', color: 'var(--calm-text-primary)' }}>On-Device Focus Telemetry</span>
          <span style={{ fontSize: '0.68rem', background: 'var(--calm-mint-light)', color: 'var(--calm-mint)', border: '1px solid var(--calm-mint-border)', padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 700, fontFamily: 'var(--calm-font-mono)' }}>
            100% LOCAL CV
          </span>
        </div>
        <button
          type="button"
          onClick={() => setIsMonitoringPaused(!isMonitoringPaused)}
          style={{ fontSize: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'var(--calm-surface)', border: '1px solid var(--calm-border)', color: 'var(--calm-text-primary)', padding: '0.35rem 0.75rem', borderRadius: 'var(--calm-radius-sm)', cursor: 'pointer', fontWeight: 500, transition: 'var(--calm-ease)' }}
        >
          {isMonitoringPaused ? <PlayCircle size={13} style={{ color: 'var(--calm-mint)' }} /> : <PauseCircle size={13} style={{ color: 'var(--calm-amber)' }} />}
          {isMonitoringPaused ? 'Resume Focus Camera' : 'Pause Focus Camera'}
        </button>
      </div>

      {!activeSession ? (
        <div style={{ padding: '3rem 2rem', textAlign: 'center', background: 'var(--calm-surface-elevated)', border: '1px solid var(--calm-border)', borderRadius: 'var(--calm-radius-lg)', boxShadow: 'var(--calm-shadow-card)' }}>
          <div style={{ width: 48, height: 48, borderRadius: 'var(--calm-radius-md)', background: 'var(--calm-surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem auto', color: 'var(--calm-violet)' }}>
            <Zap size={24} />
          </div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--calm-text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
            No Active Pedagogical Session
          </h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--calm-text-secondary)', margin: '0.4rem 0 0 0', maxWidth: '480px', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
            You are currently in self-paced learning mode for class <strong style={{ fontFamily: 'var(--calm-font-mono)', color: 'var(--calm-text-primary)' }}>{classCode}</strong>. When your teacher initiates an interactive Socratic inquiry, it will appear here.
          </p>
        </div>
      ) : (
        <div>
          {/* Socratic 4-Stage Stepper Header */}
          <div style={{ background: 'var(--calm-surface-elevated)', border: '1px solid var(--calm-border)', borderRadius: 'var(--calm-radius-md)', padding: '1rem 1.25rem', marginBottom: '1.25rem', boxShadow: 'var(--calm-shadow-card)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
              <span style={{ fontSize: '0.84rem', fontWeight: 600, color: 'var(--calm-text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                <Sparkles size={15} style={{ color: 'var(--calm-violet)' }} /> Socratic Learning Workflow
              </span>
              <span style={{ fontSize: '0.72rem', fontWeight: 700, fontFamily: 'var(--calm-font-mono)', color: activeStage === 4 ? 'var(--calm-mint)' : 'var(--calm-violet)', background: activeStage === 4 ? 'var(--calm-mint-light)' : 'var(--calm-violet-light)', padding: '0.2rem 0.6rem', borderRadius: 4, border: '1px solid ' + (activeStage === 4 ? 'var(--calm-mint-border)' : 'var(--calm-violet-border)') }}>
                {activeStage === 4 ? '✓ COMPLETED' : `STAGE ${activeStage} OF 4`}
              </span>
            </div>

            <div className="calm-socratic-stepper">
              {['1. Think', '2. Compare', '3. Reflect', '4. Reassess'].map((stgLabel, i) => {
                const num = i + 1;
                const isCurrent = activeStage === num;
                const isDone = activeStage > num;
                return (
                  <div
                    key={stgLabel}
                    className={`calm-socratic-step ${isCurrent ? 'active' : isDone ? 'completed' : ''}`}
                  >
                    {isDone ? '✓ ' : ''}{stgLabel}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="calm-dashboard-layout" style={{ gridTemplateColumns: '1.9fr 1.1fr', gap: '1.25rem' }}>
            {/* Main Question Panel */}
            <div>
              <div className="calm-card-header" style={{ marginBottom: '0.85rem' }}>
                <div className="calm-card-title-group">
                  <div className="calm-card-icon icon-blue">
                    {currentQuestion?.question_type === 'mcq' ? <PieChart size={17} /> : <HelpCircle size={17} />}
                  </div>
                  <div>
                    <h3 className="calm-card-title" style={{ fontSize: '0.98rem' }}>Socratic Question Prompt</h3>
                    <span className="calm-card-subtitle">
                      Type: {currentQuestion?.question_type === 'mcq' ? 'Multiple Choice' : 'Reflective Free Response'}
                    </span>
                  </div>
                </div>
                <span className="calm-focus-pill" style={{ fontSize: '0.72rem', padding: '0.2rem 0.65rem' }}>
                  <span className="calm-pulse-dot" /> Live Session
                </span>
              </div>

              {currentQuestion ? (
                <div className="calm-inquiry-box">
                  <div className="calm-inquiry-meta">
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--calm-violet)' }} />
                    Inquiry Prompt
                  </div>
                  <p className="calm-inquiry-text">
                    {currentQuestion.text}
                  </p>
                </div>
              ) : (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--calm-text-secondary)' }}>
                  <Clock size={28} style={{ margin: '0 auto 0.5rem auto' }} />
                  <p>Waiting for teacher to publish an inquiry question...</p>
                </div>
              )}

              {successMessage && (
                <div style={{ background: 'var(--calm-mint-light)', border: '1px solid var(--calm-mint-border)', color: 'var(--calm-mint)', padding: '0.75rem 1rem', borderRadius: 'var(--calm-radius-md)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem', fontWeight: 600, marginBottom: '1rem' }}>
                  <CheckCircle2 size={16} /> {successMessage}
                </div>
              )}

              {/* Answer Form (Stage 1: Think) */}
              {currentQuestion && (
                <div>
                  {!currentSubmission ? (
                    <form onSubmit={handleAnswerSubmit} style={{ background: 'var(--calm-surface-elevated)', border: '1px solid var(--calm-border)', padding: '1.25rem', borderRadius: 'var(--calm-radius-md)', boxShadow: 'var(--calm-shadow-card)' }}>
                      <div style={{ fontSize: '0.86rem', fontWeight: 600, color: 'var(--calm-text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 'var(--calm-radius-sm)', background: 'var(--calm-surface)', color: 'var(--calm-violet)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontFamily: 'var(--calm-font-mono)' }}>1</span>
                        Stage 1: Formulate Your Initial Thoughts
                      </div>

                      {currentQuestion.question_type === 'mcq' ? (
                        <div>
                          <label className="calm-form-label">Select Your Initial Option Choice:</label>
                          <div className="calm-mcq-grid">
                            {(currentQuestion.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt, idx) => (
                              <div
                                key={idx}
                                className={`calm-mcq-option ${selectedOption === opt ? 'selected' : ''}`}
                                onClick={() => setSelectedOption(opt)}
                              >
                                <div className="calm-option-badge">{String.fromCharCode(65 + idx)}</div>
                                <span style={{ fontSize: '0.88rem', fontWeight: 500, color: 'var(--calm-text-primary)' }}>{opt}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <div>
                          <label className="calm-form-label">Your Initial Thoughtful Response:</label>
                          <textarea
                            className="calm-textarea"
                            rows={4}
                            placeholder="Type your initial perspective and reasoning here..."
                            value={answerText}
                            onChange={(e) => setAnswerText(e.target.value)}
                          />
                        </div>
                      )}

                      <div style={{ marginTop: '1rem', borderTop: '1px solid var(--calm-border)', paddingTop: '0.85rem' }}>
                        <label className="calm-form-label" style={{ marginBottom: '0.35rem' }}>Initial Confidence Assessment:</label>
                        <div className="calm-confidence-row">
                          {['Low', 'Moderate', 'High', 'Certain'].map((level) => (
                            <button
                              key={level}
                              type="button"
                              className={`calm-confidence-btn ${initialConfidence === level ? 'selected' : ''}`}
                              onClick={() => setInitialConfidence(level)}
                            >
                              {level}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        className="calm-btn calm-btn-primary"
                        style={{ marginTop: '1.25rem', width: '100%', justifyContent: 'center' }}
                        disabled={submitting}
                      >
                        <Send size={15} /> {submitting ? 'Submitting Initial Thoughts...' : 'Submit Initial Response (Stage 1)'}
                      </button>
                    </form>
                  ) : (
                    /* Submitted View + Stage 2 (Compare) & Stage 3/4 (Reflect & Reassess) */
                    <div style={{ background: 'var(--calm-surface-elevated)', border: '1px solid var(--calm-border)', padding: '1.25rem', borderRadius: 'var(--calm-radius-md)', boxShadow: 'var(--calm-shadow-card)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--calm-mint)', fontWeight: 600, fontSize: '0.82rem', marginBottom: '0.85rem', background: 'var(--calm-mint-light)', padding: '0.6rem 0.85rem', borderRadius: 'var(--calm-radius-sm)', border: '1px solid var(--calm-mint-border)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <CheckCircle2 size={15} /> Stage 1 Response Recorded ({currentSubmission.submitted_at})
                        </span>
                        <span style={{ fontSize: '0.72rem', color: 'var(--calm-text-primary)', background: 'var(--calm-surface)', padding: '0.15rem 0.5rem', borderRadius: 4, fontWeight: 600, fontFamily: 'var(--calm-font-mono)', border: '1px solid var(--calm-border)' }}>
                          CONFIDENCE: {initialConfidence}
                        </span>
                      </div>

                      <div style={{ background: 'var(--calm-surface)', padding: '0.85rem 1rem', borderRadius: 'var(--calm-radius-sm)', fontSize: '0.86rem', color: 'var(--calm-text-primary)', marginBottom: '1.25rem', border: '1px solid var(--calm-border)' }}>
                        <strong style={{ color: 'var(--calm-text-secondary)', display: 'block', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.25rem' }}>Your Initial Choice:</strong>
                        {currentSubmission.selected_option || currentSubmission.answer_text}
                      </div>

                      {/* Stage 2: Anonymous Peer Response Distribution */}
                      <div className="calm-peer-perspective-box">
                        <div className="calm-peer-perspective-header">
                          <span className="calm-peer-perspective-title">
                            <BarChart2 size={16} style={{ color: 'var(--calm-violet)' }} /> Stage 2: Anonymous Class Perspectives
                          </span>
                          <span style={{ fontSize: '0.7rem', color: 'var(--calm-text-tertiary)', fontFamily: 'var(--calm-font-mono)' }}>
                            100% ANONYMOUS
                          </span>
                        </div>
                        <p className="calm-peer-perspective-sub">
                          Aggregate peer distribution across options. Reviewing diverse perspectives encourages deeper cognitive reflection:
                        </p>
                        <div className="calm-peer-distribution-list">
                          {peerCompareData ? (
                            Object.entries(peerCompareData).map(([optionKey, pct]) => (
                              <div key={optionKey} className="calm-peer-dist-row">
                                <span className="calm-peer-dist-label">{optionKey}</span>
                                <div className="calm-peer-dist-track">
                                  <div className="calm-peer-dist-fill" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="calm-peer-dist-pct">{pct}%</span>
                              </div>
                            ))
                          ) : (
                            [
                              { label: 'Option A', pct: 55 },
                              { label: 'Option B', pct: 30 },
                              { label: 'Option C', pct: 15 }
                            ].map((item) => (
                              <div key={item.label} className="calm-peer-dist-row">
                                <span className="calm-peer-dist-label">{item.label}</span>
                                <div className="calm-peer-dist-track">
                                  <div className="calm-peer-dist-fill" style={{ width: `${item.pct}%` }} />
                                </div>
                                <span className="calm-peer-dist-pct">{item.pct}%</span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Stage 3 & 4 Form: Self-Reflection & Revised Reassessment */}
                      <div style={{ borderTop: '1px solid var(--calm-border)', paddingTop: '1rem' }}>
                        <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--calm-text-primary)', display: 'flex', alignItems: 'center', gap: '0.45rem', margin: '0 0 0.75rem 0' }}>
                          <Sparkles size={15} style={{ color: 'var(--calm-violet)' }} /> Stage 3 & 4: Reflection & Revised Choice
                        </h4>

                        {currentSubmission.selected_reflection_option || currentSubmission.reflection_text ? (
                          <div className="calm-socratic-complete-card">
                            <div className="calm-complete-status-badge">
                              ✓ STAGE 4 REASSESSMENT COMPLETE
                            </div>
                            <p style={{ fontSize: '0.84rem', color: 'var(--calm-text-secondary)', margin: '0 0 0.85rem 0', lineHeight: 1.5 }}>
                              You have thoughtfully engaged with the peer perspectives and completed the Socratic inquiry loop.
                            </p>
                            <div style={{ background: 'var(--calm-surface)', padding: '0.85rem 1rem', borderRadius: 'var(--calm-radius-sm)', border: '1px solid var(--calm-border)', marginBottom: '0.75rem' }}>
                              <span style={{ fontSize: '0.74rem', textTransform: 'uppercase', color: 'var(--calm-text-secondary)', display: 'block', fontWeight: 600, marginBottom: '0.2rem' }}>Final Revised Response:</span>
                              <span style={{ fontSize: '0.9rem', color: 'var(--calm-text-primary)', fontWeight: 500 }}>
                                {currentSubmission.selected_reflection_option || currentSubmission.reflection_text}
                              </span>
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--calm-mint)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                              <CheckCircle2 size={14} /> Ready to resume self-paced learning.
                            </div>
                          </div>
                        ) : (
                          <form onSubmit={handleReflectionSubmit}>
                            <p style={{ fontSize: '0.8rem', color: 'var(--calm-text-secondary)', margin: '0 0 0.85rem 0' }}>
                              Having observed your peers' perspectives, reconsider your reasoning. Select your final revised answer or confirm your initial position:
                            </p>

                            {currentQuestion.question_type === 'mcq' ? (
                              <div>
                                <label className="calm-form-label">Select Your Revised Choice:</label>
                                <div className="calm-mcq-grid">
                                  {(currentQuestion.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt, idx) => (
                                    <div
                                      key={idx}
                                      className={`calm-mcq-option ${selectedReflectionOption === opt ? 'selected' : ''}`}
                                      onClick={() => setSelectedReflectionOption(opt)}
                                    >
                                      <div className="calm-option-badge">{String.fromCharCode(65 + idx)}</div>
                                      <span style={{ fontSize: '0.88rem', color: 'var(--calm-text-primary)', fontWeight: 500 }}>{opt}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <label className="calm-form-label">Self-Reflection & Explanation of Reasoning:</label>
                                <textarea
                                  className="calm-textarea"
                                  rows={3}
                                  placeholder="How did peer perspectives influence or reinforce your understanding? Explain your revised thoughts..."
                                  value={reflectionText}
                                  onChange={(e) => setReflectionText(e.target.value)}
                                />
                              </div>
                            )}

                            <div style={{ marginTop: '0.85rem' }}>
                              <label className="calm-form-label" style={{ marginBottom: '0.35rem' }}>Revised Confidence Level:</label>
                              <div className="calm-confidence-row">
                                {['Low', 'Moderate', 'High', 'Certain'].map((level) => (
                                  <button
                                    key={level}
                                    type="button"
                                    className={`calm-confidence-btn ${revisedConfidence === level ? 'selected' : ''}`}
                                    onClick={() => setRevisedConfidence(level)}
                                  >
                                    {level}
                                  </button>
                                ))}
                              </div>
                            </div>

                            <button
                              type="submit"
                              className="calm-btn calm-btn-primary"
                              style={{ marginTop: '1.15rem', width: '100%', justifyContent: 'center' }}
                              disabled={submitting}
                            >
                              <Send size={14} /> {submitting ? 'Submitting Final Reassessment...' : 'Submit Stage 4 Final Reassessment'}
                            </button>
                          </form>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Side Questions List Rail */}
            <div style={{ borderLeft: '1px solid var(--calm-border)', paddingLeft: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', marginBottom: '0.85rem' }}>
                <MessageSquare size={16} style={{ color: 'var(--calm-text-primary)' }} />
                <h4 style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--calm-text-primary)', margin: 0, letterSpacing: '-0.01em' }}>
                  Inquiry Queue ({questions.length})
                </h4>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {questions.length === 0 ? (
                  <div style={{ fontSize: '0.8rem', color: 'var(--calm-text-secondary)', padding: '0.5rem 0' }}>
                    No additional inquiries.
                  </div>
                ) : (
                  questions.map((q, idx) => {
                    const isCurrent = currentQuestion?.id === q.id;
                    const isAnswered = !!submittedAnswers[q.id];
                    return (
                      <div
                        key={q.id}
                        onClick={() => onSelectQuestion(q)}
                        className={`calm-qrail-item ${isCurrent ? 'active' : ''}`}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: isCurrent ? 'var(--calm-violet)' : 'var(--calm-text-secondary)', fontFamily: 'var(--calm-font-mono)' }}>
                            PROMPT {idx + 1}
                          </span>
                          {isAnswered && (
                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--calm-mint)', display: 'flex', alignItems: 'center', gap: '0.25rem', fontFamily: 'var(--calm-font-mono)' }}>
                              <CheckCircle2 size={11} /> DONE
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: isCurrent ? 'var(--calm-text-primary)' : 'var(--calm-text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: 1.4 }}>
                          {q.text}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
