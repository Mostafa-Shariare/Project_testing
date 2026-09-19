import { useState, useEffect } from 'react';
import {
  BarChart2,
  CheckCircle2,
  Eye,
  AlertTriangle,
  ListOrdered,
  TrendingUp,
  MessageCircle,
  Clock,
  ChevronUp,
  ChevronDown,
  Send,
  Sparkles,
  Star,
  Check,
  X,
  Radio,
  ShieldCheck,
  CheckCheck,
  HelpCircle,
} from 'lucide-react';
import { apiFetch } from '../../api';

export default function ActivityRenderer({
  sessionId,
  activityType,
  activityConfig,
  rollNumber,
  classCode,
  existingResponse,
  onComplete,
}) {
  const [submitting, setSubmitting] = useState(false);
  const [completed, setCompleted] = useState(!!existingResponse);
  const [responseData, setResponseData] = useState(existingResponse?.response_data || null);
  const [submittedAt, setSubmittedAt] = useState(existingResponse?.submitted_at || (existingResponse ? new Date().toISOString() : null));

  // Quick Poll state
  const [selectedOptions, setSelectedOptions] = useState([]);

  // Concept Check state
  const [selectedOption, setSelectedOption] = useState('');
  const [showResult, setShowResult] = useState(false);

  // Predict & Reveal state
  const [prediction, setPrediction] = useState('');
  const [predictionSubmitted, setPredictionSubmitted] = useState(false);
  const [surpriseLevel, setSurpriseLevel] = useState(3);

  // Spot the Mistake state
  const [identifiedMistake, setIdentifiedMistake] = useState('');
  const [mistakeExplanation, setMistakeExplanation] = useState('');

  // Arrange the Steps state
  const [arrangedSteps, setArrangedSteps] = useState([]);
  const [stepsInitialized, setStepsInitialized] = useState(false);

  // Confidence + Reflection state
  const [preConfidence, setPreConfidence] = useState(3);
  const [answer, setAnswer] = useState('');
  const [postConfidence, setPostConfidence] = useState(3);
  const [confidenceStage, setConfidenceStage] = useState('pre'); // 'pre' | 'answer' | 'post'

  // Teach-Back state
  const [explanationText, setExplanationText] = useState('');

  // Initialize shuffled steps for arrange_steps
  useEffect(() => {
    if (activityType === 'arrange_steps' && activityConfig?.steps && !stepsInitialized) {
      const shuffled = [...activityConfig.steps].sort(() => Math.random() - 0.5);
      setArrangedSteps(shuffled);
      setStepsInitialized(true);
    }
  }, [activityType, activityConfig, stepsInitialized]);

  const submitResponse = async (data) => {
    if (submitting) return;
    setSubmitting(true);
    try {
      const resp = await apiFetch(`/api/socratic/sessions/${sessionId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roll_number: rollNumber,
          class_code: classCode,
          response_data: data,
        }),
      });
      if (resp && (resp.status === 'ok' || resp.state === 'ACTIVITY_COMPLETED')) {
        setCompleted(true);
        setResponseData(data);
        setSubmittedAt(new Date().toISOString());
        if (onComplete) onComplete();
      }
    } catch (err) {
      alert(err.message || 'Failed to submit response');
    } finally {
      setSubmitting(false);
    }
  };

  const moveStep = (idx, direction) => {
    const newSteps = [...arrangedSteps];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= newSteps.length) return;
    [newSteps[idx], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[idx]];
    setArrangedSteps(newSteps);
  };

  // ── Completed State ──────────────────────────────────────────────────────────
  if (completed) {
    const formattedTime = submittedAt
      ? new Date(submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'Just now';

    const activityMeta = {
      quick_poll: { label: 'Quick Poll', icon: BarChart2, tagColor: 'var(--calm-violet)' },
      concept_check: { label: 'Concept Check', icon: CheckCircle2, tagColor: 'var(--calm-mint)' },
      predict_reveal: { label: 'Predict & Reveal', icon: Eye, tagColor: 'var(--calm-amber)' },
      spot_mistake: { label: 'Spot the Mistake', icon: AlertTriangle, tagColor: 'var(--calm-amber)' },
      arrange_steps: { label: 'Arrange the Steps', icon: ListOrdered, tagColor: 'var(--calm-violet)' },
      confidence_meter: { label: 'Confidence & Reflection', icon: TrendingUp, tagColor: 'var(--calm-mint)' },
      teach_back: { label: 'Teach-Back Dialogue', icon: MessageCircle, tagColor: 'var(--calm-violet)' },
    }[activityType] || { label: 'Interactive Activity', icon: Sparkles, tagColor: 'var(--calm-mint)' };

    const ActivityTypeIcon = activityMeta.icon;
    const promptText = activityConfig?.question_text || activityConfig?.title || activityConfig?.prompt;

    // Check correctness for Concept Check
    const isConceptCheck = activityType === 'concept_check';
    const isConceptCorrect = isConceptCheck && responseData?.selected_option && activityConfig?.correct_answer
      ? responseData.selected_option === activityConfig.correct_answer
      : null;

    // Check order for Arrange Steps
    const isArrangeSteps = activityType === 'arrange_steps';
    const isArrangeCorrect = isArrangeSteps && responseData?.submitted_order && activityConfig?.correct_order
      ? JSON.stringify(responseData.submitted_order) === JSON.stringify(activityConfig.correct_order)
      : null;

    return (
      <div className="activity-renderer activity-completed">
        <div className="activity-completed-card">
          {/* Top subtle ambient glow overlay */}
          <div className="activity-completed-glow-overlay" />

          {/* Hero Celebration Section */}
          <div className="activity-completed-hero">
            <div className="activity-completed-icon-wrapper">
              <div className="activity-completed-icon-halo" />
              <div className="activity-completed-icon-core">
                <CheckCircle2 size={36} className="activity-completed-check" />
              </div>
              <Sparkles size={18} className="activity-completed-sparkle" />
            </div>

            <div className="activity-completed-status-chip">
              <span className="activity-sync-pulse-dot" />
              <span className="activity-sync-text">Response Secured &bull; Synced with Instructor</span>
            </div>

            <h3 className="activity-thankyou-title">Thank You! Response Recorded</h3>
            <p className="activity-thankyou-subtitle">
              Your response has been securely logged and transmitted to your instructor's real-time discussion stream.
            </p>
          </div>

          {/* Submission Summary Receipt */}
          <div className="activity-summary-receipt">
            <div className="activity-receipt-header">
              <div className="activity-receipt-badge" style={{ color: activityMeta.tagColor }}>
                <ActivityTypeIcon size={14} />
                <span>{activityMeta.label}</span>
              </div>
              <div className="activity-receipt-meta">
                <span className="activity-receipt-tag">Class: <strong>{classCode || 'CS233'}</strong></span>
                <span className="activity-receipt-tag">Roll: <strong>{rollNumber || 'STUDENT'}</strong></span>
                <span className="activity-receipt-tag"><Clock size={12} /> {formattedTime}</span>
              </div>
            </div>

            {promptText && (
              <div className="activity-receipt-prompt">
                <span className="activity-receipt-label">Inquiry Prompt</span>
                <p className="activity-prompt-text">{promptText}</p>
              </div>
            )}

            {/* Answer Display */}
            <div className="activity-receipt-answer-box">
              <span className="activity-receipt-label">Your Submitted Response</span>

              {/* Quick Poll response */}
              {responseData?.selected_options && responseData.selected_options.length > 0 && (
                <div className="activity-receipt-options-list">
                  {responseData.selected_options.map((opt, idx) => (
                    <div key={idx} className="activity-receipt-option-chip">
                      <Check size={14} className="activity-chip-check" />
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Single selected option (Concept Check) */}
              {responseData?.selected_option && (
                <div className="activity-receipt-option-chip active">
                  <Check size={14} className="activity-chip-check" />
                  <span>{responseData.selected_option}</span>
                </div>
              )}

              {/* Prediction */}
              {responseData?.prediction && (
                <blockquote className="activity-receipt-text-quote">
                  "{responseData.prediction}"
                  {responseData.surprise_level && (
                    <div className="activity-receipt-submeta">
                      Surprise Rating: <strong>{responseData.surprise_level} / 5</strong>
                    </div>
                  )}
                </blockquote>
              )}

              {/* Spot the Mistake */}
              {(responseData?.identified_mistake || responseData?.mistake_explanation) && (
                <div className="activity-receipt-mistake-block">
                  {responseData.identified_mistake && (
                    <div className="activity-mistake-field">
                      <span className="activity-field-title">Identified Element:</span>
                      <p>{responseData.identified_mistake}</p>
                    </div>
                  )}
                  {responseData.mistake_explanation && (
                    <div className="activity-mistake-field">
                      <span className="activity-field-title">Reasoning / Explanation:</span>
                      <p>{responseData.mistake_explanation}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Arranged Steps */}
              {responseData?.submitted_order && responseData.submitted_order.length > 0 && (
                <div className="activity-receipt-steps-list">
                  {responseData.submitted_order.map((step, idx) => (
                    <div key={idx} className="activity-receipt-step-item">
                      <span className="activity-step-number">{idx + 1}</span>
                      <span className="activity-step-text">{step}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* General Answer or Explanation (Teach-Back, Confidence meter) */}
              {(responseData?.answer || responseData?.explanation) && (
                <blockquote className="activity-receipt-text-quote">
                  "{responseData.answer || responseData.explanation}"
                </blockquote>
              )}

              {/* Confidence ratings */}
              {(responseData?.pre_confidence || responseData?.post_confidence) && (
                <div className="activity-receipt-confidence">
                  {responseData.pre_confidence && (
                    <span className="activity-confidence-pill">
                      Initial Confidence: <strong>{responseData.pre_confidence}/5</strong>
                    </span>
                  )}
                  {responseData.post_confidence && (
                    <span className="activity-confidence-pill revised">
                      Revised Confidence: <strong>{responseData.post_confidence}/5</strong>
                    </span>
                  )}
                </div>
              )}

              {/* Fallback if responseData is empty */}
              {!responseData && (
                <div className="activity-receipt-recorded-notice">
                  <CheckCheck size={16} style={{ color: 'var(--calm-mint)' }} />
                  <span>Response captured and securely logged in session telemetry.</span>
                </div>
              )}
            </div>

            {/* Pedagogical Outcome / Key Takeaway */}
            {isConceptCheck && isConceptCorrect !== null && (
              <div className={`activity-result-badge ${isConceptCorrect ? 'correct' : 'incorrect'}`}>
                <div className="activity-result-title">
                  {isConceptCorrect ? (
                    <><Check size={18} /> Correct! Excellent deduction.</>
                  ) : (
                    <><HelpCircle size={18} /> Review: Intended answer was "{activityConfig?.correct_answer}"</>
                  )}
                </div>
                {activityConfig?.explanation && (
                  <div className="activity-result-explanation">
                    <strong>Pedagogical Note:</strong> {activityConfig.explanation}
                  </div>
                )}
              </div>
            )}

            {isArrangeSteps && isArrangeCorrect !== null && (
              <div className={`activity-result-badge ${isArrangeCorrect ? 'correct' : 'incorrect'}`}>
                <div className="activity-result-title">
                  {isArrangeCorrect ? (
                    <><Check size={18} /> Perfect Logical Sequence!</>
                  ) : (
                    <><HelpCircle size={18} /> Check the sequential order with your instructor.</>
                  )}
                </div>
              </div>
            )}

            {activityConfig?.reveal_text && (
              <div className="activity-takeaway-card">
                <div className="activity-takeaway-header">
                  <Sparkles size={15} style={{ color: 'var(--calm-amber)' }} />
                  <span>Instructor Reveal</span>
                </div>
                <p>{activityConfig.reveal_text}</p>
                {activityConfig.key_takeaway && (
                  <div className="activity-takeaway-footer">
                    <strong>Key Takeaway:</strong> {activityConfig.key_takeaway}
                  </div>
                )}
              </div>
            )}

            {activityConfig?.correction && (
              <div className="activity-takeaway-card">
                <div className="activity-takeaway-header">
                  <Sparkles size={15} style={{ color: 'var(--calm-amber)' }} />
                  <span>Instructor Correction & Solution</span>
                </div>
                <p>{activityConfig.correction}</p>
              </div>
            )}
          </div>

          {/* Synchrony & Classroom Status Grid */}
          <div className="activity-next-steps-grid">
            <div className="activity-next-step-card">
              <div className="activity-step-icon-box mint">
                <Radio size={16} />
              </div>
              <div className="activity-step-content">
                <h5>Live Class Stream</h5>
                <p>Anonymously compiled on the instructor's aggregate matrix.</p>
              </div>
            </div>

            <div className="activity-next-step-card">
              <div className="activity-step-icon-box violet">
                <ShieldCheck size={16} />
              </div>
              <div className="activity-step-content">
                <h5>100% On-Device CV</h5>
                <p>Local focus telemetry continues running quietly without video upload.</p>
              </div>
            </div>

            <div className="activity-next-step-card">
              <div className="activity-step-icon-box amber">
                <MessageCircle size={16} />
              </div>
              <div className="activity-step-content">
                <h5>Discussion Active</h5>
                <p>Follow along with the instructor as group findings are reviewed.</p>
              </div>
            </div>
          </div>

          {/* Footer Status Reassurance */}
          <div className="activity-completed-footer">
            <span className="activity-footer-lock">
              <CheckCheck size={14} /> Response finalized &bull; Session active
            </span>
            <span className="activity-footer-hint">
              You can keep this tab open or switch to Focus Insights anytime.
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Quick Poll ────────────────────────────────────────────────────────────────
  if (activityType === 'quick_poll') {
    const pollOptions = activityConfig?.options || [];
    const allowMultiple = activityConfig?.allow_multiple || false;
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <BarChart2 size={22} className="activity-icon quick-engagement" />
          <div className="activity-header-meta">
            <h3>Quick In-Situ Poll</h3>
            <span className="activity-subtext">{allowMultiple ? 'Select all that apply' : 'Select one choice'}</span>
          </div>
        </div>
        <div className="activity-question-text">{activityConfig?.question_text || 'Vote on the options below'}</div>
        <div className="activity-options-list">
          {pollOptions.map((opt, idx) => (
            <label
              key={idx}
              className={`activity-option-card ${selectedOptions.includes(opt) ? 'selected' : ''}`}
            >
              <input
                type={allowMultiple ? 'checkbox' : 'radio'}
                name="poll"
                value={opt}
                checked={selectedOptions.includes(opt)}
                onChange={() => {
                  if (allowMultiple) {
                    setSelectedOptions((prev) =>
                      prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt]
                    );
                  } else {
                    setSelectedOptions([opt]);
                  }
                }}
              />
              <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
              <span className="option-text">{opt}</span>
            </label>
          ))}
        </div>
        <div className="activity-action-row">
          <button
            type="button"
            className="btn btn-primary activity-submit-btn"
            disabled={selectedOptions.length === 0 || submitting}
            onClick={() => submitResponse({ selected_options: selectedOptions })}
          >
            <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Vote'}
          </button>
        </div>
      </div>
    );
  }

  // ── Concept Check ─────────────────────────────────────────────────────────────
  if (activityType === 'concept_check') {
    const isTrueFalse = activityConfig?.true_false_mode;
    const checkOptions = isTrueFalse ? ['True', 'False'] : (activityConfig?.options || []);
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <CheckCircle2 size={22} className="activity-icon quick-engagement" />
          <div className="activity-header-meta">
            <h3>Concept Diagnostic Check</h3>
            <span className="activity-subtext">{isTrueFalse ? 'True / False validation' : 'Multiple choice diagnosis'}</span>
          </div>
        </div>
        <div className="activity-question-text">{activityConfig?.question_text || 'Select the correct answer'}</div>

        {isTrueFalse ? (
          <div className="tf-options-grid">
            {['True', 'False'].map((opt) => (
              <button
                key={opt}
                type="button"
                className={`tf-option-btn ${selectedOption === opt ? 'selected' : ''}`}
                onClick={() => setSelectedOption(opt)}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <div className="activity-options-list">
            {checkOptions.map((opt, idx) => (
              <label
                key={idx}
                className={`activity-option-card ${selectedOption === opt ? 'selected' : ''}`}
              >
                <input
                  type="radio"
                  name="concept-check"
                  value={opt}
                  checked={selectedOption === opt}
                  onChange={() => setSelectedOption(opt)}
                />
                <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                <span className="option-text">{opt}</span>
              </label>
            ))}
          </div>
        )}

        <div className="activity-action-row">
          <button
            type="button"
            className="btn btn-primary activity-submit-btn"
            disabled={!selectedOption || submitting}
            onClick={() => submitResponse({ selected_option: selectedOption })}
          >
            <Send size={15} /> {submitting ? 'Checking...' : 'Submit Diagnostic Answer'}
          </button>
        </div>
      </div>
    );
  }

  // ── Predict & Reveal ──────────────────────────────────────────────────────────
  if (activityType === 'predict_reveal') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <Eye size={22} className="activity-icon active-thinking" />
          <div className="activity-header-meta">
            <h3>Predict & Reveal</h3>
            <span className="activity-subtext">Formulate a hypothesis, reveal the true outcome, and calibrate your surprise</span>
          </div>
        </div>

        {!predictionSubmitted ? (
          <div className="activity-phase-card">
            <div className="activity-question-label">
              <Sparkles size={14} className="activity-inline-icon" /> Phase 1: Formulate Your Prediction
            </div>
            <div className="activity-question-text">{activityConfig?.prompt_text || 'What do you predict will happen?'}</div>
            <textarea
              className="activity-textarea"
              rows={4}
              placeholder="State your prediction and theoretical justification..."
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
            />
            <div className="activity-action-row">
              <button
                type="button"
                className="btn btn-primary activity-submit-btn"
                disabled={!prediction.trim()}
                onClick={() => setPredictionSubmitted(true)}
              >
                <Eye size={15} /> Lock Prediction & Reveal Answer
              </button>
            </div>
          </div>
        ) : (
          <div className="activity-reveal-wrapper">
            <div className="activity-reveal-grid">
              {/* Prior Prediction Card */}
              <div className="activity-reveal-card your-prediction">
                <div className="activity-card-header">
                  <span className="activity-card-tag amber">Your Prior Prediction</span>
                  <span className="activity-lock-tag">Locked</span>
                </div>
                <blockquote className="activity-prediction-quote">
                  "{prediction}"
                </blockquote>
              </div>

              {/* Actual Outcome Card */}
              <div className="activity-reveal-card actual-answer">
                <div className="activity-card-header">
                  <span className="activity-card-tag mint">Verified Outcome / Concept Truth</span>
                </div>
                {activityConfig?.correct_answer && activityConfig.correct_answer !== 'See teacher explanation' && (
                  <div className="activity-truth-key">
                    <strong>Direct Answer:</strong> {activityConfig.correct_answer}
                  </div>
                )}
                {activityConfig?.explanation ? (
                  <div className="activity-explanation-box">
                    <div className="activity-explanation-header">
                      <Sparkles size={14} /> Teacher Explanation
                    </div>
                    <p className="activity-explanation-text">{activityConfig.explanation}</p>
                  </div>
                ) : (
                  <div className="activity-explanation-box">
                    <p className="activity-explanation-text">{activityConfig?.correct_answer || 'Review the instructor discussion for details.'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Cognitive Calibration: Surprise Scale */}
            <div className="activity-surprise-card">
              <div className="activity-surprise-header">
                <h4>How surprised were you by this outcome?</h4>
                <p>Cognitive calibration helps identify misconceptions and solidifies long-term retention.</p>
              </div>

              <div className="surprise-scale-grid">
                {[
                  { level: 1, label: 'Expected', desc: 'As predicted' },
                  { level: 2, label: 'Slight', desc: 'Minor twist' },
                  { level: 3, label: 'Moderate', desc: 'Somewhat surprised' },
                  { level: 4, label: 'Surprised', desc: 'Unexpected' },
                  { level: 5, label: 'Shocked', desc: 'Eye-opening!' },
                ].map(({ level, label, desc }) => (
                  <button
                    key={level}
                    type="button"
                    className={`surprise-scale-tile ${surpriseLevel === level ? 'active' : ''}`}
                    onClick={() => setSurpriseLevel(level)}
                  >
                    <div className="surprise-tile-stars">
                      {Array.from({ length: level }).map((_, i) => (
                        <Star key={i} size={13} className="surprise-star-icon" fill="currentColor" />
                      ))}
                    </div>
                    <span className="surprise-tile-level">{level}</span>
                    <span className="surprise-tile-label">{label}</span>
                    <span className="surprise-tile-desc">{desc}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="activity-action-row">
              <button
                type="button"
                className="btn btn-primary activity-submit-btn"
                disabled={submitting}
                onClick={() => submitResponse({ prediction, surprise_level: surpriseLevel })}
              >
                <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Response & Sync with Teacher'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Spot the Mistake ──────────────────────────────────────────────────────────
  if (activityType === 'spot_mistake') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <AlertTriangle size={22} className="activity-icon active-thinking" />
          <div className="activity-header-meta">
            <h3>Spot the Mistake</h3>
            <span className="activity-subtext">Isolate bugs, logical flaws, or conceptual fallacies</span>
          </div>
        </div>

        <div className="activity-content-block">
          <div className="activity-content-block-header">
            <span className="activity-card-tag amber">Artifact / Code Under Review</span>
          </div>
          <div className="activity-mistake-content">
            <pre><code>{activityConfig?.content_with_mistake || 'Content not provided'}</code></pre>
          </div>
          {activityConfig?.hint && (
            <div className="activity-hint">
              <Sparkles size={14} />
              <span><strong>Hint:</strong> {activityConfig.hint}</span>
            </div>
          )}
        </div>

        <div className="activity-inputs-group">
          <div className="activity-field">
            <label className="activity-label">1. What is the mistake or fallacy?</label>
            <textarea
              className="activity-textarea"
              rows={3}
              placeholder="Pinpoint the exact line, condition, or logic error..."
              value={identifiedMistake}
              onChange={(e) => setIdentifiedMistake(e.target.value)}
            />
          </div>

          <div className="activity-field">
            <label className="activity-label">2. How should it be corrected?</label>
            <textarea
              className="activity-textarea"
              rows={3}
              placeholder="Provide the corrected snippet or reasoning..."
              value={mistakeExplanation}
              onChange={(e) => setMistakeExplanation(e.target.value)}
            />
          </div>
        </div>

        <div className="activity-action-row">
          <button
            type="button"
            className="btn btn-primary activity-submit-btn"
            disabled={!identifiedMistake.trim() || submitting}
            onClick={() =>
              submitResponse({
                identified_mistake: identifiedMistake.trim(),
                explanation: mistakeExplanation.trim(),
              })
            }
          >
            <Send size={15} /> {submitting ? 'Submitting Analysis...' : 'Submit Bug Isolation'}
          </button>
        </div>
      </div>
    );
  }

  // ── Arrange the Steps ─────────────────────────────────────────────────────────
  if (activityType === 'arrange_steps') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <ListOrdered size={22} className="activity-icon active-thinking" />
          <div className="activity-header-meta">
            <h3>Arrange the Steps</h3>
            <span className="activity-subtext">Sequence the procedure, algorithm, or lifecycle correctly</span>
          </div>
        </div>

        <div className="activity-question-text">
          {activityConfig?.question_text || 'Put these steps into the correct chronological or logical order:'}
        </div>

        <div className="activity-steps-list">
          {arrangedSteps.map((step, idx) => (
            <div key={`${step}-${idx}`} className="activity-step-row">
              <span className="step-number">{idx + 1}</span>
              <span className="step-text">{step}</span>
              <div className="step-arrows">
                <button
                  type="button"
                  className="step-arrow-btn"
                  disabled={idx === 0}
                  title="Move step up"
                  onClick={() => moveStep(idx, -1)}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="step-arrow-btn"
                  disabled={idx === arrangedSteps.length - 1}
                  title="Move step down"
                  onClick={() => moveStep(idx, 1)}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="activity-action-row">
          <button
            type="button"
            className="btn btn-primary activity-submit-btn"
            disabled={arrangedSteps.length === 0 || submitting}
            onClick={() => submitResponse({ submitted_order: arrangedSteps })}
          >
            <Send size={15} /> {submitting ? 'Submitting...' : 'Lock Step Order'}
          </button>
        </div>
      </div>
    );
  }

  // ── Confidence + Reflection ───────────────────────────────────────────────────
  if (activityType === 'confidence_reflection') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <TrendingUp size={22} className="activity-icon deep-reflection" />
          <div className="activity-header-meta">
            <h3>Confidence + Reflection</h3>
            <span className="activity-subtext">Metacognitive calibration & self-assessed understanding</span>
          </div>
        </div>

        {/* Step tracker */}
        <div className="confidence-steps-tracker">
          <div className={`confidence-step-pill ${confidenceStage === 'pre' ? 'active' : 'done'}`}>
            1. Pre-Confidence
          </div>
          <div className="confidence-step-divider">→</div>
          <div className={`confidence-step-pill ${confidenceStage === 'answer' ? 'active' : confidenceStage === 'post' ? 'done' : ''}`}>
            2. Response
          </div>
          <div className="confidence-step-divider">→</div>
          <div className={`confidence-step-pill ${confidenceStage === 'post' ? 'active' : ''}`}>
            3. Post-Confidence
          </div>
        </div>

        {confidenceStage === 'pre' && (
          <div className="confidence-card">
            <div className="activity-question-text">Before answering, rate your baseline confidence:</div>
            {activityConfig?.question_text && (
              <div className="activity-question-sub">
                <strong>Topic / Inquiry:</strong> {activityConfig.question_text}
              </div>
            )}
            <div className="confidence-scale">
              {[
                { lvl: 1, lbl: 'Not Confident', sub: 'Guessing' },
                { lvl: 2, lbl: 'Slight', sub: 'Unsure' },
                { lvl: 3, lbl: 'Somewhat', sub: 'Fair idea' },
                { lvl: 4, lbl: 'Confident', sub: 'Solid' },
                { lvl: 5, lbl: 'Certain', sub: 'Can explain' },
              ].map(({ lvl, lbl, sub }) => (
                <button
                  key={lvl}
                  type="button"
                  className={`confidence-btn ${preConfidence === lvl ? 'active' : ''}`}
                  onClick={() => setPreConfidence(lvl)}
                >
                  <span className="conf-num">{lvl}</span>
                  <span className="conf-lbl">{lbl}</span>
                  <span className="conf-sub">{sub}</span>
                </button>
              ))}
            </div>
            <div className="activity-action-row">
              <button
                type="button"
                className="btn btn-primary activity-submit-btn"
                onClick={() => setConfidenceStage('answer')}
              >
                Continue to Question →
              </button>
            </div>
          </div>
        )}

        {confidenceStage === 'answer' && (
          <div className="confidence-card">
            <div className="activity-question-text">{activityConfig?.question_text || 'Solve the inquiry:'}</div>
            {activityConfig?.options?.length > 0 ? (
              <div className="activity-options-list">
                {activityConfig.options.map((opt, idx) => (
                  <label key={idx} className={`activity-option-card ${answer === opt ? 'selected' : ''}`}>
                    <input type="radio" name="conf-answer" value={opt} checked={answer === opt} onChange={() => setAnswer(opt)} />
                    <span className="option-letter">{String.fromCharCode(65 + idx)}</span>
                    <span className="option-text">{opt}</span>
                  </label>
                ))}
              </div>
            ) : (
              <textarea
                className="activity-textarea"
                rows={4}
                placeholder="Synthesize your detailed explanation or solution..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}
            <div className="activity-action-row">
              <button
                type="button"
                className="btn btn-primary activity-submit-btn"
                disabled={!answer.trim()}
                onClick={() => setConfidenceStage('post')}
              >
                Proceed to Self-Calibration →
              </button>
            </div>
          </div>
        )}

        {confidenceStage === 'post' && (
          <div className="confidence-card">
            <div className="activity-question-text">Now that you've tackled the problem, how confident are you?</div>
            <div className="confidence-scale">
              {[
                { lvl: 1, lbl: 'Not Confident', sub: 'Hesitant' },
                { lvl: 2, lbl: 'Slight', sub: 'Shaky' },
                { lvl: 3, lbl: 'Somewhat', sub: 'Moderate' },
                { lvl: 4, lbl: 'Confident', sub: 'Strong' },
                { lvl: 5, lbl: 'Certain', sub: '100% Solid' },
              ].map(({ lvl, lbl, sub }) => (
                <button
                  key={lvl}
                  type="button"
                  className={`confidence-btn ${postConfidence === lvl ? 'active' : ''}`}
                  onClick={() => setPostConfidence(lvl)}
                >
                  <span className="conf-num">{lvl}</span>
                  <span className="conf-lbl">{lbl}</span>
                  <span className="conf-sub">{sub}</span>
                </button>
              ))}
            </div>
            <div className="confidence-compare-box">
              <div className="compare-item">
                <span className="compare-label">Initial Baseline</span>
                <span className="compare-val">{preConfidence} / 5</span>
              </div>
              <div className="compare-arrow">→</div>
              <div className="compare-item">
                <span className="compare-label">Post-Analysis</span>
                <span className="compare-val">{postConfidence} / 5</span>
              </div>
              <div className={`compare-delta ${postConfidence >= preConfidence ? 'positive' : 'negative'}`}>
                {postConfidence >= preConfidence ? `+${postConfidence - preConfidence}` : `${postConfidence - preConfidence}`} Shift
              </div>
            </div>
            <div className="activity-action-row">
              <button
                type="button"
                className="btn btn-primary activity-submit-btn"
                disabled={submitting}
                onClick={() =>
                  submitResponse({
                    pre_confidence: preConfidence,
                    answer: answer,
                    post_confidence: postConfidence,
                  })
                }
              >
                <Send size={15} /> {submitting ? 'Submitting...' : 'Lock Metacognitive Assessment'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Teach-Back ────────────────────────────────────────────────────────────────
  if (activityType === 'teach_back') {
    const wordCount = explanationText.trim() ? explanationText.trim().split(/\s+/).length : 0;
    const isReady = wordCount >= 5;
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <MessageCircle size={22} className="activity-icon deep-reflection" />
          <div className="activity-header-meta">
            <h3>Teach-Back Dialogue</h3>
            <span className="activity-subtext">Feynman Technique: demonstrate mastery by teaching clearly</span>
          </div>
        </div>

        <div className="teach-back-prompt-card">
          <div className="teach-back-topic-badge">Target Concept</div>
          <h4 className="teach-back-topic-title">{activityConfig?.topic || 'Core Concept'}</h4>
          <div className="activity-question-text">
            Explain this in your own words as if explaining to a fellow student who missed class:
          </div>
          {activityConfig?.guiding_prompt && (
            <div className="activity-hint">
              <Sparkles size={14} />
              <span><strong>Guiding Focus:</strong> {activityConfig.guiding_prompt}</span>
            </div>
          )}
        </div>

        <div className="teach-back-editor-wrapper">
          <textarea
            className="activity-textarea large"
            rows={6}
            placeholder="Write your explanation here... Use analogies, key principles, and simple terms."
            value={explanationText}
            onChange={(e) => setExplanationText(e.target.value)}
          />
          <div className="teach-back-footer-row">
            <span className="teach-back-guidance">Minimum 5 words for pedagogical depth</span>
            <div className={`word-count-badge ${isReady ? 'ready' : ''}`}>
              {wordCount} word{wordCount !== 1 ? 's' : ''} {isReady ? '✓' : ''}
            </div>
          </div>
        </div>

        <div className="activity-action-row">
          <button
            type="button"
            className="btn btn-primary activity-submit-btn"
            disabled={!isReady || submitting}
            onClick={() =>
              submitResponse({
                explanation_text: explanationText.trim(),
                word_count: wordCount,
              })
            }
          >
            <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Teach-Back Dialogue'}
          </button>
        </div>
      </div>
    );
  }

  // Fallback
  return (
    <div className="activity-renderer">
      <div className="activity-header">
        <Sparkles size={22} />
        <h3>Activity</h3>
      </div>
      <p>Unknown activity type: {activityType}</p>
    </div>
  );
}
