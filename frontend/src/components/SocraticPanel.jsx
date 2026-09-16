import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { CheckCircle2, HelpCircle, ArrowRight, RotateCcw, PieChart, Sparkles, Send } from 'lucide-react';

export default function SocraticPanel({ sessionId, question, questionId, onClose, rollNumber = 'STUDENT', classCode = '' }) {
  const [stage, setStage] = useState(1); // 1: Think, 2: Compare, 3: Reflect, 4: Reassess
  const [selectedOption, setSelectedOption] = useState('');
  const [answerText, setAnswerText] = useState('');
  const [initialConfidence, setInitialConfidence] = useState('Confident');
  
  const [peerSummary, setPeerSummary] = useState(null);
  
  const [reflectionText, setReflectionText] = useState('');
  const [revisedOption, setRevisedOption] = useState('');
  const [finalConfidence, setFinalConfidence] = useState('Confident');
  
  const [loading, setLoading] = useState(false);
  const [submittedAttempt1, setSubmittedAttempt1] = useState(null);
  const [submittedAttempt2, setSubmittedAttempt2] = useState(null);

  // Local storage key for reconnection state recovery
  const storageKey = `socratic_state_${questionId || 'current'}_${rollNumber}`;

  // Restore state on mount from localStorage or backend
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.stage) setStage(parsed.stage);
        if (parsed.selectedOption) setSelectedOption(parsed.selectedOption);
        if (parsed.answerText) setAnswerText(parsed.answerText);
        if (parsed.initialConfidence) setInitialConfidence(parsed.initialConfidence);
        if (parsed.reflectionText) setReflectionText(parsed.reflectionText);
        if (parsed.revisedOption) setRevisedOption(parsed.revisedOption);
      }
    } catch (e) {
      /* ignore storage error */
    }

    // Also sync with backend for current question state if questionId is provided
    if (questionId) {
      apiFetch(`/api/socratic/student-state?question_id=${questionId}&roll_number=${encodeURIComponent(rollNumber)}&class_code=${encodeURIComponent(classCode)}`)
        .then((res) => {
          if (res && res.stage) {
            setStage(res.stage);
            if (res.attempt1) setSubmittedAttempt1(res.attempt1);
            if (res.attempt2) setSubmittedAttempt2(res.attempt2);
          }
        })
        .catch(() => {});
    }
  }, [questionId, rollNumber, classCode, storageKey]);

  // Persist local state changes
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify({
        stage,
        selectedOption,
        answerText,
        initialConfidence,
        reflectionText,
        revisedOption,
        finalConfidence
      }));
    } catch (e) {}
  }, [stage, selectedOption, answerText, initialConfidence, reflectionText, revisedOption, finalConfidence, storageKey]);

  // Fetch anonymous peer summary when entering Stage 2
  useEffect(() => {
    if (stage === 2 && questionId) {
      apiFetch(`/api/socratic/peer-summary?question_id=${questionId}`)
        .then((data) => {
          if (data && data.percentages) setPeerSummary(data.percentages);
        })
        .catch(() => {});
    }
  }, [stage, questionId]);

  const handleStage1Submit = async (e) => {
    e.preventDefault();
    const val = selectedOption || answerText.trim();
    if (!val) return alert('Please choose an answer or type a response.');
    
    setLoading(true);
    try {
      const resp = await apiFetch('/api/socratic/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          question_id: questionId,
          answer_text: answerText.trim(),
          selected_option: selectedOption,
          confidence_level: initialConfidence,
          roll_number: rollNumber,
          class_code: classCode,
        }),
      });
      setSubmittedAttempt1({ selected_option: selectedOption, answer_text: answerText, confidence: initialConfidence });
      setStage(2); // Progress to Compare
    } catch (err) {
      alert(err.message || 'Failed to submit Attempt 1');
    } finally {
      setLoading(false);
    }
  };

  const handleStage3Proceed = (e) => {
    e.preventDefault();
    if (!reflectionText.trim()) return alert('Please enter your self-reflection thoughts before proceeding to Reassess.');
    setStage(4);
  };

  const handleStage4Submit = async (e) => {
    e.preventDefault();
    const finalVal = revisedOption || selectedOption || answerText.trim();
    if (!finalVal) return alert('Please select your final revised choice.');

    setLoading(true);
    try {
      await apiFetch('/api/socratic/reflection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question_id: questionId,
          roll_number: rollNumber,
          class_code: classCode,
          reflection_text: reflectionText.trim(),
          selected_option: revisedOption || selectedOption,
          confidence_level: finalConfidence,
        }),
      });
      setSubmittedAttempt2({ reflection_text: reflectionText, selected_option: revisedOption || selectedOption, confidence: finalConfidence });
      // Reset local storage on complete submission
      localStorage.removeItem(storageKey);
      setStage(4); // Keep on stage 4 completed view
    } catch (err) {
      alert(err.message || 'Failed to submit final reflection');
    } finally {
      setLoading(false);
    }
  };

  const optionsList = typeof question === 'object' && question.options ? question.options : ['Option A', 'Option B', 'Option C', 'Option D'];
  const questionTitle = typeof question === 'object' ? question.text : (question || 'Socratic Question');

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
      <div className="socratic-modal-card" style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '16px',
        width: '90%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        padding: '24px',
        border: '1px solid #E2E8F0',
      }}>
        {/* Stepper Progress Bar */}
        <div className="socratic-stepper-bar" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderBottom: '1px solid #F1F5F9', paddingBottom: '12px' }}>
          {[
            { num: 1, name: '1. Think' },
            { num: 2, name: '2. Compare' },
            { num: 3, name: '3. Reflect' },
            { num: 4, name: '4. Reassess' },
          ].map((s) => (
            <div key={s.num} style={{
              fontSize: '0.78rem',
              fontWeight: stage === s.num ? '700' : '500',
              color: stage === s.num ? '#4F46E5' : (stage > s.num ? '#10B981' : '#94A3B8'),
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              {stage > s.num ? <CheckCircle2 size={13} style={{ color: '#10B981' }} /> : <span>{s.name}</span>}
            </div>
          ))}
        </div>

        {/* Question Header */}
        <div className="socratic-question-box" style={{ backgroundColor: '#F4F8FC', padding: '14px 16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #E2E8F0' }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563EB', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Socratic Prompt
          </span>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#0F172A', margin: '4px 0 0 0', lineHeight: 1.4 }}>
            {questionTitle}
          </h3>
        </div>

        {/* STAGE 1: THINK */}
        {stage === 1 && (
          <form onSubmit={handleStage1Submit}>
            <p style={{ fontSize: '0.85rem', color: '#475569', marginBottom: '12px' }}>
              Formulate your initial independent thought before viewing peer responses.
            </p>
            
            <div style={{ marginBottom: '16px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>Select Answer Choice (Attempt 1):</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {optionsList.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    style={{
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: selectedOption === opt ? '2px solid #4F46E5' : '1px solid #CBD5E1',
                      backgroundColor: selectedOption === opt ? '#EEF2FF' : '#FFFFFF',
                      color: selectedOption === opt ? '#4338CA' : '#1E293B',
                      fontWeight: selectedOption === opt ? '600' : '400',
                      textAlign: 'left',
                      fontSize: '0.85rem',
                      cursor: 'pointer'
                    }}
                    onClick={() => setSelectedOption(opt)}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>Initial Confidence Level:</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {['Very Confident', 'Confident', 'Unsure'].map((level) => (
                  <button
                    key={level}
                    type="button"
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      fontSize: '0.78rem',
                      borderRadius: '6px',
                      border: initialConfidence === level ? '2px solid #4F46E5' : '1px solid #E2E8F0',
                      backgroundColor: initialConfidence === level ? '#EEF2FF' : '#F8FAFC',
                      color: initialConfidence === level ? '#4338CA' : '#475569',
                      fontWeight: initialConfidence === level ? '600' : '400',
                      cursor: 'pointer'
                    }}
                    onClick={() => setInitialConfidence(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={onClose} style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={loading} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#FFFFFF', fontWeight: '600', cursor: 'pointer' }}>
                {loading ? 'Submitting…' : 'Submit Attempt 1'}
              </button>
            </div>
          </form>
        )}

        {/* STAGE 2: COMPARE */}
        {stage === 2 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: '600', fontSize: '0.85rem', marginBottom: '12px' }}>
              <CheckCircle2 size={16} /> Attempt 1 Submitted ({submittedAttempt1?.selected_option || selectedOption})
            </div>
            
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <PieChart size={16} style={{ color: '#2563EB' }} /> Anonymous Peer Class Choice Distribution
            </h4>
            <p style={{ fontSize: '0.8rem', color: '#64748B', marginBottom: '16px' }}>
              Review how peers analyzed this prompt. All response statistics are 100% anonymous.
            </p>

            <div style={{ backgroundColor: '#F8FAFC', padding: '14px', borderRadius: '10px', border: '1px solid #E2E8F0', marginBottom: '20px' }}>
              {peerSummary ? (
                Object.entries(peerSummary).map(([opt, pct]) => (
                  <div key={opt} style={{ marginBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: '500', color: '#334155', marginBottom: '3px' }}>
                      <span>{opt}</span>
                      <span>{pct}%</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: '#E2E8F0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: '#4F46E5', borderRadius: '4px', transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: '0.8rem', color: '#94A3B8', margin: 0, textAlign: 'center' }}>Loading anonymous peer responses…</p>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setStage(3)} style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#FFFFFF', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Proceed to Self-Reflection <ArrowRight size={14} />
              </button>
            </div>
          </div>
        )}

        {/* STAGE 3: REFLECT */}
        {stage === 3 && (
          <form onSubmit={handleStage3Proceed}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={16} style={{ color: '#F59E0B' }} /> Stage 3: Self-Reflection
            </h4>
            <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '14px' }}>
              Reflect on the peer distribution and explain what influenced your reasoning or why your choice shifted.
            </p>

            <textarea
              required
              rows={4}
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                border: '1px solid #CBD5E1',
                fontSize: '0.88rem',
                color: '#1E293B',
                marginBottom: '16px',
                resize: 'vertical'
              }}
              placeholder="Type your reflection notes here (required before advancing)..."
              value={reflectionText}
              onChange={(e) => setReflectionText(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <button type="button" onClick={() => setStage(2)} style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid #CBD5E1', backgroundColor: '#FFFFFF', color: '#475569', cursor: 'pointer' }}>Back to Compare</button>
              <button type="submit" style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#FFFFFF', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Unlock Reassess Stage <ArrowRight size={14} />
              </button>
            </div>
          </form>
        )}

        {/* STAGE 4: REASSESS */}
        {stage === 4 && (
          <div>
            {!submittedAttempt2 ? (
              <form onSubmit={handleStage4Submit}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 700, color: '#1E293B', marginBottom: '6px' }}>
                  Stage 4: Final Reassessment (Attempt 2)
                </h4>
                <p style={{ fontSize: '0.82rem', color: '#64748B', marginBottom: '14px' }}>
                  Confirm or revise your final choice after reflection.
                </p>

                <div style={{ marginBottom: '16px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '8px' }}>Revised Choice:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    {optionsList.map((opt, idx) => (
                      <button
                        key={idx}
                        type="button"
                        style={{
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: (revisedOption || selectedOption) === opt ? '2px solid #10B981' : '1px solid #CBD5E1',
                          backgroundColor: (revisedOption || selectedOption) === opt ? '#ECFDF5' : '#FFFFFF',
                          color: (revisedOption || selectedOption) === opt ? '#047857' : '#1E293B',
                          fontWeight: (revisedOption || selectedOption) === opt ? '600' : '400',
                          textAlign: 'left',
                          fontSize: '0.85rem',
                          cursor: 'pointer'
                        }}
                        onClick={() => setRevisedOption(opt)}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: '20px' }}>
                  <label style={{ fontSize: '0.8rem', fontWeight: 600, color: '#334155', display: 'block', marginBottom: '6px' }}>Final Confidence Level:</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {['Very Confident', 'Confident', 'Unsure'].map((level) => (
                      <button
                        key={level}
                        type="button"
                        style={{
                          flex: 1,
                          padding: '6px 10px',
                          fontSize: '0.78rem',
                          borderRadius: '6px',
                          border: finalConfidence === level ? '2px solid #10B981' : '1px solid #E2E8F0',
                          backgroundColor: finalConfidence === level ? '#ECFDF5' : '#F8FAFC',
                          color: finalConfidence === level ? '#047857' : '#475569',
                          fontWeight: finalConfidence === level ? '600' : '400',
                          cursor: 'pointer'
                        }}
                        onClick={() => setFinalConfidence(level)}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  <button type="submit" disabled={loading} style={{ padding: '8px 20px', borderRadius: '8px', border: 'none', backgroundColor: '#10B981', color: '#FFFFFF', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Send size={14} /> {loading ? 'Submitting…' : 'Complete Socratic Stepper'}
                  </button>
                </div>
              </form>
            ) : (
              <div style={{ textAlign: 'center', padding: '20px 10px' }}>
                <CheckCircle2 size={48} style={{ color: '#10B981', margin: '0 auto 12px auto' }} />
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0F172A', margin: '0 0 6px 0' }}>
                  Socratic Intervention Completed!
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#64748B', maxWidth: '380px', margin: '0 auto 20px auto' }}>
                  Thank you for engaging in self-reflection. Your initial choice, reflection notes, and revised reassessment have been logged.
                </p>
                <button type="button" onClick={onClose} style={{ padding: '8px 24px', borderRadius: '8px', border: 'none', backgroundColor: '#4F46E5', color: '#FFFFFF', fontWeight: '600', cursor: 'pointer' }}>
                  Return to Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
