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
    return (
      <div className="activity-renderer activity-completed">
        <div className="activity-completed-card">
          <div className="activity-completed-icon">
            <CheckCircle2 size={48} />
          </div>
          <h3>Response Submitted</h3>
          <p>Thank you for participating in this activity. Your response has been recorded.</p>
          {activityType === 'concept_check' && responseData && (
            <div className={`activity-result-badge ${responseData.selected_option === activityConfig?.correct_answer ? 'correct' : 'incorrect'}`}>
              {responseData.selected_option === activityConfig?.correct_answer ? (
                <><Check size={16} /> Correct!</>
              ) : (
                <><X size={16} /> The correct answer was: {activityConfig?.correct_answer}</>
              )}
            </div>
          )}
          {activityType === 'arrange_steps' && responseData && (
            <div className={`activity-result-badge ${JSON.stringify(responseData.submitted_order) === JSON.stringify(activityConfig?.correct_order) ? 'correct' : 'incorrect'}`}>
              {JSON.stringify(responseData.submitted_order) === JSON.stringify(activityConfig?.correct_order) ? (
                <><Check size={16} /> Perfect order!</>
              ) : (
                <><X size={16} /> Check the correct sequence with your teacher</>
              )}
            </div>
          )}
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
          <h3>Quick Poll</h3>
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
        <button
          type="button"
          className="btn btn-primary activity-submit-btn"
          disabled={selectedOptions.length === 0 || submitting}
          onClick={() => submitResponse({ selected_options: selectedOptions })}
        >
          <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Vote'}
        </button>
      </div>
    );
  }

  // ── Concept Check ─────────────────────────────────────────────────────────────
  if (activityType === 'concept_check') {
    const checkOptions = activityConfig?.true_false_mode ? ['True', 'False'] : (activityConfig?.options || []);
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <CheckCircle2 size={22} className="activity-icon quick-engagement" />
          <h3>Concept Check</h3>
        </div>
        <div className="activity-question-text">{activityConfig?.question_text || 'Select the correct answer'}</div>
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
        <button
          type="button"
          className="btn btn-primary activity-submit-btn"
          disabled={!selectedOption || submitting}
          onClick={() => submitResponse({ selected_option: selectedOption })}
        >
          <Send size={15} /> {submitting ? 'Checking...' : 'Submit Answer'}
        </button>
      </div>
    );
  }

  // ── Predict & Reveal ──────────────────────────────────────────────────────────
  if (activityType === 'predict_reveal') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <Eye size={22} className="activity-icon active-thinking" />
          <h3>Predict & Reveal</h3>
        </div>

        {!predictionSubmitted ? (
          <>
            <div className="activity-question-text">{activityConfig?.prompt_text || 'What do you predict?'}</div>
            <textarea
              className="activity-textarea"
              rows={3}
              placeholder="Type your prediction here..."
              value={prediction}
              onChange={(e) => setPrediction(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-primary activity-submit-btn"
              disabled={!prediction.trim()}
              onClick={() => setPredictionSubmitted(true)}
            >
              <Eye size={15} /> Submit Prediction & Reveal Answer
            </button>
          </>
        ) : (
          <>
            <div className="activity-reveal-section">
              <div className="activity-your-prediction">
                <h4>Your Prediction</h4>
                <p>{prediction}</p>
              </div>
              <div className="activity-correct-answer">
                <h4>Actual Answer</h4>
                <p>{activityConfig?.correct_answer || 'See teacher explanation'}</p>
                {activityConfig?.explanation && (
                  <div className="activity-explanation">
                    <Sparkles size={14} /> {activityConfig.explanation}
                  </div>
                )}
              </div>
            </div>
            <div className="activity-surprise-section">
              <h4>How surprised were you?</h4>
              <div className="surprise-scale">
                {[1, 2, 3, 4, 5].map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`surprise-btn ${surpriseLevel === level ? 'active' : ''}`}
                    onClick={() => setSurpriseLevel(level)}
                  >
                    <Star size={18} fill={surpriseLevel >= level ? 'currentColor' : 'none'} />
                    <span>{level === 1 ? 'Expected' : level === 3 ? 'Moderate' : level === 5 ? 'Very!' : ''}</span>
                  </button>
                ))}
              </div>
            </div>
            <button
              type="button"
              className="btn btn-primary activity-submit-btn"
              disabled={submitting}
              onClick={() => submitResponse({ prediction, surprise_level: surpriseLevel })}
            >
              <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Response'}
            </button>
          </>
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
          <h3>Spot the Mistake</h3>
        </div>
        <div className="activity-content-block">
          <h4>Review this content and find the mistake:</h4>
          <div className="activity-mistake-content">
            {activityConfig?.content_with_mistake || 'Content not provided'}
          </div>
          {activityConfig?.hint && (
            <div className="activity-hint">
              <Sparkles size={13} /> Hint: {activityConfig.hint}
            </div>
          )}
        </div>
        <label className="activity-label">What is the mistake?</label>
        <textarea
          className="activity-textarea"
          rows={2}
          placeholder="Describe the mistake you found..."
          value={identifiedMistake}
          onChange={(e) => setIdentifiedMistake(e.target.value)}
        />
        <label className="activity-label mt-2">How should it be corrected?</label>
        <textarea
          className="activity-textarea"
          rows={2}
          placeholder="Explain the correction..."
          value={mistakeExplanation}
          onChange={(e) => setMistakeExplanation(e.target.value)}
        />
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
          <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Answer'}
        </button>
      </div>
    );
  }

  // ── Arrange the Steps ─────────────────────────────────────────────────────────
  if (activityType === 'arrange_steps') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <ListOrdered size={22} className="activity-icon active-thinking" />
          <h3>Arrange the Steps</h3>
        </div>
        <div className="activity-question-text">Put these steps in the correct order:</div>
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
                  onClick={() => moveStep(idx, -1)}
                >
                  <ChevronUp size={16} />
                </button>
                <button
                  type="button"
                  className="step-arrow-btn"
                  disabled={idx === arrangedSteps.length - 1}
                  onClick={() => moveStep(idx, 1)}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-primary activity-submit-btn"
          disabled={arrangedSteps.length === 0 || submitting}
          onClick={() => submitResponse({ submitted_order: arrangedSteps })}
        >
          <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Order'}
        </button>
      </div>
    );
  }

  // ── Confidence + Reflection ───────────────────────────────────────────────────
  if (activityType === 'confidence_reflection') {
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <TrendingUp size={22} className="activity-icon deep-reflection" />
          <h3>Confidence + Reflection</h3>
        </div>

        {confidenceStage === 'pre' && (
          <>
            <div className="activity-question-text">Before answering, how confident are you about this topic?</div>
            <div className="activity-question-sub">{activityConfig?.question_text}</div>
            <div className="confidence-scale">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`confidence-btn ${preConfidence === level ? 'active' : ''}`}
                  onClick={() => setPreConfidence(level)}
                >
                  {level}
                  <span>{level === 1 ? 'Not at all' : level === 3 ? 'Somewhat' : level === 5 ? 'Very' : ''}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary activity-submit-btn"
              onClick={() => setConfidenceStage('answer')}
            >
              Next → Answer the Question
            </button>
          </>
        )}

        {confidenceStage === 'answer' && (
          <>
            <div className="activity-question-text">{activityConfig?.question_text}</div>
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
                rows={3}
                placeholder="Type your answer..."
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
              />
            )}
            <button
              type="button"
              className="btn btn-primary activity-submit-btn"
              disabled={!answer.trim()}
              onClick={() => setConfidenceStage('post')}
            >
              Next → Re-Rate Confidence
            </button>
          </>
        )}

        {confidenceStage === 'post' && (
          <>
            <div className="activity-question-text">After answering, how confident are you now?</div>
            <div className="confidence-scale">
              {[1, 2, 3, 4, 5].map((level) => (
                <button
                  key={level}
                  type="button"
                  className={`confidence-btn ${postConfidence === level ? 'active' : ''}`}
                  onClick={() => setPostConfidence(level)}
                >
                  {level}
                  <span>{level === 1 ? 'Not at all' : level === 3 ? 'Somewhat' : level === 5 ? 'Very' : ''}</span>
                </button>
              ))}
            </div>
            <div className="confidence-compare">
              <span>Before: <strong>{preConfidence}/5</strong></span>
              <span>→</span>
              <span>After: <strong>{postConfidence}/5</strong></span>
            </div>
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
              <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Response'}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Teach-Back ────────────────────────────────────────────────────────────────
  if (activityType === 'teach_back') {
    const wordCount = explanationText.trim() ? explanationText.trim().split(/\s+/).length : 0;
    return (
      <div className="activity-renderer">
        <div className="activity-header">
          <MessageCircle size={22} className="activity-icon deep-reflection" />
          <h3>Teach-Back</h3>
        </div>
        <div className="activity-question-text">
          Explain <strong>{activityConfig?.topic || 'this concept'}</strong> in your own words
        </div>
        {activityConfig?.guiding_prompt && (
          <div className="activity-hint">
            <Sparkles size={13} /> {activityConfig.guiding_prompt}
          </div>
        )}
        <textarea
          className="activity-textarea large"
          rows={5}
          placeholder="Write your explanation here... Imagine you're teaching this to a classmate."
          value={explanationText}
          onChange={(e) => setExplanationText(e.target.value)}
        />
        <div className="word-count-badge">
          {wordCount} word{wordCount !== 1 ? 's' : ''}
        </div>
        <button
          type="button"
          className="btn btn-primary activity-submit-btn"
          disabled={wordCount < 5 || submitting}
          onClick={() =>
            submitResponse({
              explanation_text: explanationText.trim(),
              word_count: wordCount,
            })
          }
        >
          <Send size={15} /> {submitting ? 'Submitting...' : 'Submit Explanation'}
        </button>
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
