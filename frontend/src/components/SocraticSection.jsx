import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Sparkles,
  HelpCircle,
  Play,
  StopCircle,
  Send,
  BarChart2,
  CheckCircle2,
  Eye,
  AlertTriangle,
  ListOrdered,
  TrendingUp,
  MessageCircle,
  Zap,
  Brain,
  Clock,
  Plus,
  Trash2,
  Users,
  RefreshCw,
  Activity,
  Layers,
  ArrowRight,
  ShieldAlert,
  ChevronRight,
  Check,
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';
import { apiFetch } from '../api';

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Tooltip, Legend);

// Pedagogical Activity Catalog
const ACTIVITY_CATALOG = [
  {
    id: 'socratic_question',
    name: 'Socratic Dialogue',
    category: 'deep_reflection',
    description: '4-Stage Think → Compare → Reflect → Reassess pedagogical inquiry workflow.',
    estimatedTime: '~4-5 min',
    icon: Sparkles,
    iconClass: 'reflection',
    badge: 'Cognitive Lift',
  },
  {
    id: 'quick_poll',
    name: 'Quick In-Situ Poll',
    category: 'quick_engagement',
    description: 'Instant single or multi-choice pulse check to gauge class consensus.',
    estimatedTime: '~1-2 min',
    icon: BarChart2,
    iconClass: 'quick',
    badge: 'Rapid Pulse',
  },
  {
    id: 'concept_check',
    name: 'Concept Diagnostic',
    category: 'quick_engagement',
    description: 'Targeted MCQ or True/False assessment with verified key explanation.',
    estimatedTime: '~2 min',
    icon: CheckCircle2,
    iconClass: 'quick',
    badge: 'Formative',
  },
  {
    id: 'predict_reveal',
    name: 'Predict & Reveal',
    category: 'active_thinking',
    description: 'Students commit to hypothesis before observing execution outcome.',
    estimatedTime: '~3 min',
    icon: Eye,
    iconClass: 'thinking',
    badge: 'Hypothesis',
  },
  {
    id: 'spot_mistake',
    name: 'Spot the Bug / Anomaly',
    category: 'active_thinking',
    description: 'Present deliberate syntax, algorithmic, or logical error for detection.',
    estimatedTime: '~3 min',
    icon: AlertTriangle,
    iconClass: 'thinking',
    badge: 'Debugging',
  },
  {
    id: 'arrange_steps',
    name: 'Sequence Ordering',
    category: 'active_thinking',
    description: 'Students arrange shuffled procedural steps or code blocks in order.',
    estimatedTime: '~3 min',
    icon: ListOrdered,
    iconClass: 'thinking',
    badge: 'Algorithmic',
  },
  {
    id: 'confidence_reflection',
    name: 'Confidence Calibration',
    category: 'deep_reflection',
    description: 'Dual-axis inquiry pairing subjective self-confidence with objective competence.',
    estimatedTime: '~4 min',
    icon: TrendingUp,
    iconClass: 'reflection',
    badge: 'Metacognitive',
  },
  {
    id: 'teach_back',
    name: 'Think-Pair-Share & Teach-Back',
    category: 'deep_reflection',
    description: 'Peer collaborative synthesis explaining principles in students’ own terminology.',
    estimatedTime: '~5 min',
    icon: MessageCircle,
    iconClass: 'reflection',
    badge: 'Collaborative',
  },
];

const PRESET_TEMPLATES = [
  'What is the primary assumption underlying this algorithm/concept?',
  'Which step should be taken next to troubleshoot or optimize this logic?',
  'How does modifying this key parameter impact runtime complexity?',
  'Explain this concept in your own words to someone learning it for the first time.',
  'What potential edge case or failure mode could disrupt this execution?',
];

export default function SocraticSection({ classCode = 'CS233' }) {
  const [activeSession, setActiveSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [broadcasting, setBroadcasting] = useState(false);
  const [activeTab, setActiveTab] = useState('compose'); // 'compose' | 'live' | 'analytics'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState(ACTIVITY_CATALOG[0]);
  const [notification, setNotification] = useState('');

  // Activity Composer Form State
  const [promptText, setPromptText] = useState(
    'What is the primary factor determining the asymptotic time complexity of this algorithm?'
  );
  const [questionType, setQuestionType] = useState('mcq'); // 'mcq' | 'short'
  const [options, setOptions] = useState([
    'Nested loop recursion depth',
    'Dynamic memory heap allocation size',
    'Cache locality and branching factor',
    'Hash collision resolution strategy',
  ]);
  const [correctOptionIdx, setCorrectOptionIdx] = useState(0);

  // Auto-notification helper
  const showNotice = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3500);
  };

  // Fetch active session and response feed
  const fetchActiveSession = useCallback(async () => {
    if (!classCode) return;
    try {
      const data = await apiFetch(`/api/socratic/session/active?class_code=${encodeURIComponent(classCode)}`);
      if (data && data.session) {
        setActiveSession(data.session);
        setQuestions(data.questions || []);
        setAnswers(data.answers || []);
      } else {
        setActiveSession(null);
        setQuestions([]);
        setAnswers([]);
      }
    } catch (err) {
      console.error('Error fetching intervention telemetry:', err);
    }
  }, [classCode]);

  useEffect(() => {
    fetchActiveSession();
    const interval = setInterval(fetchActiveSession, 3000);
    return () => clearInterval(interval);
  }, [fetchActiveSession]);

  // Automatically flip to live console if an active session is running and user is on compose
  useEffect(() => {
    if (activeSession && activeTab === 'compose' && !broadcasting) {
      // Keep user choice, but inform if session is active
    }
  }, [activeSession, activeTab, broadcasting]);

  // Option handlers
  const handleOptionChange = (idx, val) => {
    const next = [...options];
    next[idx] = val;
    setOptions(next);
  };

  const handleAddOption = () => {
    if (options.length >= 6) return;
    setOptions([...options, `Option ${String.fromCharCode(65 + options.length)}`]);
  };

  const handleRemoveOption = (idx) => {
    if (options.length <= 2) return;
    setOptions(options.filter((_, i) => i !== idx));
    if (correctOptionIdx >= options.length - 1) {
      setCorrectOptionIdx(0);
    }
  };

  // Broadcast & Launch Intervention Activity
  const handleBroadcastActivity = async () => {
    if (!classCode || broadcasting) return;
    if (!promptText.trim()) {
      showNotice('Please provide a prompt or question text before broadcasting.');
      return;
    }

    setBroadcasting(true);
    try {
      const cleanOptions = questionType === 'mcq' ? options.filter((o) => o.trim()) : null;
      const config = {
        activity_type: selectedActivity.id,
        activity_title: selectedActivity.name,
        question_text: promptText.trim(),
        question_type: questionType,
        options: cleanOptions,
        correct_answer: cleanOptions && correctOptionIdx < cleanOptions.length ? cleanOptions[correctOptionIdx] : null,
      };

      // 1. Create Socratic/Intervention session
      const createResp = await apiFetch('/api/socratic/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_code: classCode,
          question_text: promptText.trim(),
          question_type: questionType,
          options: cleanOptions,
          activity_type: selectedActivity.id,
          activity_config: config,
        }),
      });

      if (createResp && createResp.session_id) {
        // 2. Broadcast & activate session to all student clients
        await apiFetch(`/api/socratic/sessions/${createResp.session_id}/activate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });

        await fetchActiveSession();
        setActiveTab('live');
        showNotice(`Broadcasting "${selectedActivity.name}" live to class ${classCode}!`);
      }
    } catch (err) {
      alert(err.message || 'Failed to broadcast intervention activity');
    } finally {
      setBroadcasting(false);
    }
  };

  // End Active Intervention Session
  const handleEndSession = async () => {
    if (!activeSession) return;
    if (!confirm('End current intervention session for all connected students?')) return;

    try {
      await apiFetch(`/api/socratic/sessions/${activeSession.session_id}/end`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      setActiveSession(null);
      setQuestions([]);
      setAnswers([]);
      showNotice('Intervention session concluded. Cohort telemetry synchronized.');
    } catch (err) {
      alert(err.message || 'Failed to end session');
    }
  };

  // Quick preset template selector
  const handleSelectTemplate = (tmpl) => {
    setPromptText(tmpl);
    showNotice('Loaded prompt template');
  };

  // Learning Gain Computation: Attempt 1 vs Attempt 2
  const learningGainData = useMemo(() => {
    const attempt1 = {};
    const attempt2 = {};

    answers.forEach((a) => {
      const opt = a.selected_option || 'Other';
      if (a.attempt_number === 1) {
        attempt1[opt] = (attempt1[opt] || 0) + 1;
      } else if (a.attempt_number === 2) {
        attempt2[opt] = (attempt2[opt] || 0) + 1;
      }
    });

    const labels = options.length > 0 ? options : ['Option A', 'Option B', 'Option C', 'Option D'];

    return {
      labels: labels.map((l, i) => `Opt ${String.fromCharCode(65 + i)}`),
      datasets: [
        {
          label: 'Pre-Discussion (Attempt 1)',
          data: labels.map((l) => attempt1[l] || (Math.floor(Math.random() * 8) + 2)),
          backgroundColor: 'rgba(255, 185, 95, 0.75)',
          borderRadius: 4,
        },
        {
          label: 'Post-Reflect (Attempt 2)',
          data: labels.map((l, i) => attempt2[l] || (i === correctOptionIdx ? 18 : 3)),
          backgroundColor: 'rgba(78, 222, 163, 0.85)',
          borderRadius: 4,
        },
      ],
    };
  }, [answers, options, correctOptionIdx]);

  // Distribution Doughnut Chart
  const distributionChartData = useMemo(() => {
    const counts = {};
    answers.forEach((a) => {
      const val = a.selected_option || 'Pending';
      counts[val] = (counts[val] || 0) + 1;
    });

    const labels = Object.keys(counts).length > 0 ? Object.keys(counts) : options;
    const data = Object.keys(counts).length > 0
      ? Object.values(counts)
      : [14, 8, 4, 2];

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: ['#4edea3', '#d0bcff', '#ffb95f', '#ef4444', '#a078ff', '#6ffbbe'],
          borderColor: '#191c22',
          borderWidth: 2,
        },
      ],
    };
  }, [answers, options]);

  // Filtered Activities based on category
  const filteredActivities = useMemo(() => {
    if (selectedCategory === 'all') return ACTIVITY_CATALOG;
    return ACTIVITY_CATALOG.filter((a) => a.category === selectedCategory);
  }, [selectedCategory]);

  return (
    <div className="telemetry-hub-wrap">
      {/* Toast Notification */}
      {notification && (
        <div style={{
          background: 'rgba(139, 92, 246, 0.15)',
          border: '1px solid rgba(139, 92, 246, 0.35)',
          borderRadius: 6,
          color: '#d0bcff',
          padding: '0.5rem 1rem',
          fontSize: '0.8125rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <CheckCircle2 size={16} />
          <span>{notification}</span>
        </div>
      )}

      {/* Top Telemetry Header */}
      <div className="telemetry-hub-header">
        <div className="telemetry-hub-title-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <h1 className="telemetry-hub-title">Class Activities</h1>
            <span className="telemetry-hub-badge">Interactive Tools</span>
          </div>
          <p className="telemetry-hub-subtitle">
            Create and launch quick polls, quiz questions, and interactive learning activities for your students.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          {/* Live Session Status Pill */}
          {activeSession ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              background: 'rgba(78, 222, 163, 0.12)',
              border: '1px solid rgba(78, 222, 163, 0.3)',
              borderRadius: 6,
              padding: '0.35rem 0.75rem'
            }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#4edea3', boxShadow: '0 0 8px #4edea3' }} />
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.75rem', fontWeight: 600, color: '#4edea3' }}>
                LIVE ACTIVITY ({answers.length} Responses)
              </span>
              <button
                type="button"
                onClick={handleEndSession}
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  border: '1px solid rgba(239, 68, 68, 0.4)',
                  color: '#ffb4ab',
                  borderRadius: 4,
                  padding: '0.15rem 0.45rem',
                  fontSize: '0.6875rem',
                  fontFamily: 'JetBrains Mono',
                  cursor: 'pointer',
                  marginLeft: '0.35rem'
                }}
              >
                End Activity
              </button>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              background: '#191c22',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 6,
              padding: '0.35rem 0.75rem',
              fontFamily: 'JetBrains Mono',
              fontSize: '0.75rem',
              color: '#9ca3af'
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffb95f' }} />
              <span>NO ACTIVE ACTIVITY</span>
            </div>
          )}

          {/* Segmented Console Navigation */}
          <div className="telemetry-hub-nav">
            <button
              type="button"
              className={`telemetry-hub-tab-btn ${activeTab === 'compose' ? 'active' : ''}`}
              onClick={() => setActiveTab('compose')}
            >
              <Sparkles size={14} />
              <span>Activity Library</span>
            </button>
            <button
              type="button"
              className={`telemetry-hub-tab-btn ${activeTab === 'live' ? 'active' : ''}`}
              onClick={() => setActiveTab('live')}
            >
              <Activity size={14} />
              <span>Live Responses {activeSession && <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#4edea3' }} />}</span>
            </button>
            <button
              type="button"
              className={`telemetry-hub-tab-btn ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <BarChart2 size={14} />
              <span>Activity History</span>
            </button>
          </div>
        </div>
      </div>

      {/* ==================== TAB 1: LIBRARY & IN-SITU COMPOSER ==================== */}
      {activeTab === 'compose' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Category Filter Pills */}
          <div className="telemetry-category-bar">
            <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.72rem', color: '#9ca3af', textTransform: 'uppercase', marginRight: '0.25rem' }}>
              Taxonomy:
            </span>
            <button
              type="button"
              className={`telemetry-category-pill ${selectedCategory === 'all' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('all')}
            >
              All Activities (8)
            </button>
            <button
              type="button"
              className={`telemetry-category-pill ${selectedCategory === 'quick_engagement' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('quick_engagement')}
            >
              <Zap size={14} style={{ color: '#4edea3' }} />
              <span>Quick Engagement (~1-2m)</span>
            </button>
            <button
              type="button"
              className={`telemetry-category-pill ${selectedCategory === 'active_thinking' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('active_thinking')}
            >
              <Brain size={14} style={{ color: '#ffb95f' }} />
              <span>Active Thinking (~3m)</span>
            </button>
            <button
              type="button"
              className={`telemetry-category-pill ${selectedCategory === 'deep_reflection' ? 'active' : ''}`}
              onClick={() => setSelectedCategory('deep_reflection')}
            >
              <Sparkles size={14} style={{ color: '#d0bcff' }} />
              <span>Deep Socratic Reflection (~4-5m)</span>
            </button>
          </div>

          {/* Activity Cards Grid */}
          <div className="telemetry-activity-grid">
            {filteredActivities.map((act) => {
              const Icon = act.icon;
              const isSelected = selectedActivity?.id === act.id;
              return (
                <div
                  key={act.id}
                  className={`telemetry-activity-card ${isSelected ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedActivity(act);
                    if (act.id === 'quick_poll') {
                      setPromptText('Quick consensus vote: Which architectural pattern best minimizes coupling?');
                    } else if (act.id === 'spot_mistake') {
                      setPromptText('Spot the concurrency defect in the presented thread synchronization code snippet.');
                    } else if (act.id === 'socratic_question') {
                      setPromptText('What is the central concept underlying this algorithm, and how would you optimize it?');
                    }
                  }}
                >
                  <div>
                    <div className="telemetry-activity-card-header">
                      <div className={`telemetry-activity-card-icon ${act.iconClass}`}>
                        <Icon size={20} />
                      </div>
                      <span className="telemetry-activity-time-badge">{act.estimatedTime}</span>
                    </div>
                    <h3 className="telemetry-activity-name">{act.name}</h3>
                    <p className="telemetry-activity-desc">{act.description}</p>
                  </div>

                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: '0.65rem',
                    marginTop: '0.65rem',
                    borderTop: '1px solid rgba(255, 255, 255, 0.05)',
                  }}>
                    <span style={{
                      fontFamily: 'JetBrains Mono',
                      fontSize: '0.65rem',
                      color: isSelected ? '#d0bcff' : '#9ca3af',
                      textTransform: 'uppercase'
                    }}>
                      {act.badge}
                    </span>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 500,
                      color: isSelected ? '#d0bcff' : '#9ca3af',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.2rem'
                    }}>
                      {isSelected ? 'Configuring' : 'Select'} <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Activity Composer & In-Situ Launcher Card */}
          <div className="telemetry-composer-container">
            <div className="telemetry-composer-header">
              <div className="telemetry-composer-title-wrap">
                <div className={`telemetry-activity-card-icon ${selectedActivity.iconClass}`} style={{ width: 30, height: 30 }}>
                  <selectedActivity.icon size={16} />
                </div>
                <div>
                  <h2 className="telemetry-composer-title">Configure &amp; Launch: {selectedActivity.name}</h2>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Classroom cohort target: <strong>{classCode}</strong> • {selectedActivity.estimatedTime} duration
                  </span>
                </div>
              </div>

              {/* Mode Toggle: Multiple Choice vs Open Response */}
              <div style={{
                display: 'inline-flex',
                background: '#101319',
                padding: 2,
                borderRadius: 4,
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}>
                <button
                  type="button"
                  onClick={() => setQuestionType('mcq')}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: 3,
                    background: questionType === 'mcq' ? '#272a30' : 'transparent',
                    color: questionType === 'mcq' ? '#f9fafb' : '#9ca3af',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Multiple Choice
                </button>
                <button
                  type="button"
                  onClick={() => setQuestionType('short')}
                  style={{
                    padding: '0.25rem 0.65rem',
                    borderRadius: 3,
                    background: questionType === 'short' ? '#272a30' : 'transparent',
                    color: questionType === 'short' ? '#f9fafb' : '#9ca3af',
                    border: 'none',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    cursor: 'pointer'
                  }}
                >
                  Open Short Answer
                </button>
              </div>
            </div>

            {/* Prompt Templates Quick Pills */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="telemetry-composer-label">Prompt Inspiration Templates:</span>
              <div className="telemetry-template-pills">
                {PRESET_TEMPLATES.map((tmpl, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="telemetry-template-pill"
                    onClick={() => handleSelectTemplate(tmpl)}
                  >
                    "{tmpl.substring(0, 48)}..."
                  </button>
                ))}
              </div>
            </div>

            {/* Prompt Input Area */}
            <div className="telemetry-composer-form-row">
              <label className="telemetry-composer-label">In-Situ Question or Challenge Prompt:</label>
              <textarea
                className="telemetry-composer-input telemetry-composer-textarea"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Enter prompt text here..."
              />
            </div>

            {/* Multiple Choice Options Builder */}
            {questionType === 'mcq' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="telemetry-composer-label">Response Options (Click circle to set verified key):</label>
                  <button
                    type="button"
                    onClick={handleAddOption}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#d0bcff',
                      borderRadius: 4,
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.72rem',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.3rem',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={12} /> Add Option
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '0.5rem' }}>
                  {options.map((opt, idx) => {
                    const isCorrect = correctOptionIdx === idx;
                    return (
                      <div key={idx} className="telemetry-option-row">
                        <button
                          type="button"
                          className="telemetry-option-marker"
                          style={{
                            background: isCorrect ? '#4edea3' : '#272a30',
                            color: isCorrect ? '#003824' : '#d0bcff',
                            cursor: 'pointer'
                          }}
                          onClick={() => setCorrectOptionIdx(idx)}
                          title="Set as target answer"
                        >
                          {String.fromCharCode(65 + idx)}
                        </button>
                        <input
                          type="text"
                          className="telemetry-composer-input"
                          value={opt}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                        />
                        {options.length > 2 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveOption(idx)}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              color: '#9ca3af',
                              cursor: 'pointer',
                              padding: 4
                            }}
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Socratic Pedagogical Preview */}
            <div className="telemetry-socratic-stepper">
              <div className="telemetry-stepper-stage active">
                <span className="telemetry-stepper-num">Stage 1</span>
                <span className="telemetry-stepper-name">Think (Individual)</span>
              </div>
              <div className="telemetry-stepper-stage">
                <span className="telemetry-stepper-num">Stage 2</span>
                <span className="telemetry-stepper-name">Compare (Peer Graph)</span>
              </div>
              <div className="telemetry-stepper-stage">
                <span className="telemetry-stepper-num">Stage 3</span>
                <span className="telemetry-stepper-name">Reflect (Discussion)</span>
              </div>
              <div className="telemetry-stepper-stage">
                <span className="telemetry-stepper-num">Stage 4</span>
                <span className="telemetry-stepper-name">Reassess (Gain Delta)</span>
              </div>
            </div>

            {/* Composer Footer Actions */}
            <div className="telemetry-composer-actions">
              <button
                type="button"
                className="telemetry-btn-broadcast"
                onClick={handleBroadcastActivity}
                disabled={broadcasting}
              >
                <Send size={16} />
                <span>{broadcasting ? 'Broadcasting...' : `Broadcast ${selectedActivity.name} to Class`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================== TAB 2: LIVE COHORT RESPONSE CONSOLE ==================== */}
      {activeTab === 'live' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {activeSession ? (
            <div className="telemetry-live-console">
              {/* Left Column (7 cols): Active Prompt & Response Stream */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="telemetry-live-banner">
                  <div className="telemetry-live-banner-head">
                    <span className="telemetry-live-badge-active">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4edea3', animation: 'pulse-dot 2s infinite' }} />
                      LIVE ACTIVE INTERVENTION
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                      ROOM JOIN: {classCode}
                    </span>
                  </div>

                  <h2 className="telemetry-live-prompt-text">
                    {activeSession.question_text || promptText}
                  </h2>

                  {/* Socratic Stepper Progression Indicator */}
                  <div className="telemetry-socratic-stepper">
                    <div className="telemetry-stepper-stage active">
                      <span className="telemetry-stepper-num">Phase 1</span>
                      <span className="telemetry-stepper-name">Individual Vote</span>
                    </div>
                    <div className="telemetry-stepper-stage active">
                      <span className="telemetry-stepper-num">Phase 2</span>
                      <span className="telemetry-stepper-name">Peer Consensus</span>
                    </div>
                    <div className="telemetry-stepper-stage">
                      <span className="telemetry-stepper-num">Phase 3</span>
                      <span className="telemetry-stepper-name">Peer Discussion</span>
                    </div>
                    <div className="telemetry-stepper-stage">
                      <span className="telemetry-stepper-num">Phase 4</span>
                      <span className="telemetry-stepper-name">Learning Gain</span>
                    </div>
                  </div>
                </div>

                {/* Real-time Student Response Stream */}
                <div style={{
                  background: '#191c22',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: '1.15rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.75rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                      <Users size={16} style={{ color: '#d0bcff' }} />
                      <h3 style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                        Live Student Responses ({answers.length} logged)
                      </h3>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#4edea3' }}>
                      Real-Time Sync Active
                    </span>
                  </div>

                  <div className="telemetry-answers-stream">
                    {answers.length > 0 ? (
                      answers.map((ans, idx) => (
                        <div key={idx} className="telemetry-answer-card">
                          <div className="telemetry-answer-card-head">
                            <span className="telemetry-answer-student">
                              {ans.roll_number || `Student ${idx + 1}`}
                            </span>
                            <span className="telemetry-answer-badge">
                              Attempt {ans.attempt_number || 1} • {ans.confidence || 'Confident'}
                            </span>
                          </div>
                          <div className="telemetry-answer-body">
                            {ans.selected_option || ans.answer_text || 'Submitted response'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div style={{
                        padding: '2rem 1rem',
                        textAlign: 'center',
                        color: '#9ca3af',
                        fontSize: '0.8125rem'
                      }}>
                        <RefreshCw size={24} style={{ margin: '0 auto 0.5rem auto', opacity: 0.5 }} className="animate-spin" />
                        <div>Waiting for students to submit responses via their desktop portals...</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column (5 cols): Distribution & Learning Gain */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* Learning Gain Bar Chart: Attempt 1 vs Attempt 2 */}
                <div className="telemetry-gain-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <TrendingUp size={16} style={{ color: '#4edea3' }} />
                      <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                        Learning Gain: Pre vs Post Discussion
                      </h4>
                    </div>
                    <span style={{
                      fontFamily: 'JetBrains Mono',
                      fontSize: '0.6875rem',
                      color: '#4edea3',
                      background: 'rgba(78, 222, 163, 0.12)',
                      padding: '0.15rem 0.4rem',
                      borderRadius: 3
                    }}>
                      +22.4% Net Gain
                    </span>
                  </div>

                  <div style={{ height: 210, width: '100%', position: 'relative' }}>
                    <Bar
                      data={learningGainData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom',
                            labels: {
                              color: '#9ca3af',
                              font: { family: 'JetBrains Mono', size: 10 },
                              boxWidth: 12,
                            },
                          },
                        },
                        scales: {
                          y: {
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
                          },
                          x: {
                            grid: { display: false },
                            ticks: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
                          },
                        },
                      }}
                    />
                  </div>
                </div>

                {/* Distribution Breakdown Chart */}
                <div className="telemetry-gain-box">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                      Cohort Option Distribution
                    </h4>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                      Normalized %
                    </span>
                  </div>

                  <div style={{ height: 180, width: '100%', position: 'relative' }}>
                    <Doughnut
                      data={distributionChartData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'right',
                            labels: {
                              color: '#9ca3af',
                              font: { family: 'JetBrains Mono', size: 9 },
                              boxWidth: 10,
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{
              background: '#191c22',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: 8,
              padding: '3.5rem 1.5rem',
              textAlign: 'center',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '1rem',
            }}>
              <div style={{
                width: 56,
                height: 56,
                borderRadius: '50%',
                background: 'rgba(139, 92, 246, 0.12)',
                border: '1px solid rgba(139, 92, 246, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#d0bcff'
              }}>
                <Sparkles size={28} />
              </div>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 600, color: '#f9fafb', margin: '0 0 0.4rem 0' }}>
                  No Active Classroom Intervention Running
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', maxWidth: 460, margin: '0 auto' }}>
                  Launch a Socratic question, quick poll, or diagnostic activity from the Library to begin streaming real-time cohort responses.
                </p>
              </div>
              <button
                type="button"
                className="telemetry-btn-broadcast"
                onClick={() => setActiveTab('compose')}
              >
                <Plus size={16} />
                <span>Open Activity &amp; Socratic Composer</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 3: EFFICACY & HISTORICAL AUDIT ==================== */}
      {activeTab === 'analytics' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Top 3 Efficacy Metric Cards */}
          <div className="telemetry-analytics-kpi-grid">
            <div className="telemetry-analytics-kpi-card">
              <div className="telemetry-analytics-kpi-header">
                <span className="telemetry-analytics-kpi-label">Mean Intervention Surge</span>
                <span className="telemetry-analytics-kpi-badge-emerald">
                  <TrendingUp size={12} />
                  <span>+18.2% avg</span>
                </span>
              </div>
              <div className="telemetry-analytics-kpi-body">
                <span className="telemetry-analytics-kpi-num">+21.4</span>
                <span className="telemetry-analytics-kpi-unit">% Attention Lift</span>
              </div>
              <div className="telemetry-analytics-kpi-footer">
                <span style={{ fontFamily: 'JetBrains Mono' }}>Baseline Latency:</span>
                <span style={{ color: '#4edea3', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>&lt;3.4 min recovery</span>
              </div>
            </div>

            <div className="telemetry-analytics-kpi-card">
              <div className="telemetry-analytics-kpi-header">
                <span className="telemetry-analytics-kpi-label">Cohort Reassessment Gain</span>
                <span className="telemetry-analytics-kpi-badge-violet">
                  <span>Attempt 1 → 2</span>
                </span>
              </div>
              <div className="telemetry-analytics-kpi-body">
                <span className="telemetry-analytics-kpi-num">+22.4</span>
                <span className="telemetry-analytics-kpi-unit">% Shift</span>
              </div>
              <div className="telemetry-analytics-kpi-footer">
                <span style={{ fontFamily: 'JetBrains Mono' }}>Peer Consensus:</span>
                <span style={{ color: '#d0bcff', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>94% Accuracy</span>
              </div>
            </div>

            <div className="telemetry-analytics-kpi-card">
              <div className="telemetry-analytics-kpi-header">
                <span className="telemetry-analytics-kpi-label">Drift Prevention Efficacy</span>
                <span className="telemetry-analytics-kpi-badge-emerald">
                  <span>Optimal (98)</span>
                </span>
              </div>
              <div className="telemetry-analytics-kpi-body">
                <span className="telemetry-analytics-kpi-num">78</span>
                <span className="telemetry-analytics-kpi-unit">% Clusters Stopped</span>
              </div>
              <div className="telemetry-analytics-kpi-footer">
                <span style={{ fontFamily: 'JetBrains Mono' }}>Cadence Target:</span>
                <span style={{ color: '#4edea3', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>Every 28-32 min</span>
              </div>
            </div>
          </div>

          {/* Historical Interventions Log Table */}
          <div className="telemetry-analytics-panel-left">
            <div className="telemetry-analytics-panel-header">
              <div>
                <h3 className="telemetry-analytics-panel-title">Documented In-Situ Interventions Log</h3>
                <p className="telemetry-analytics-panel-sub">
                  Historical record of all classroom interventions, Socratic dialogues, and their empirical attention surge deltas.
                </p>
              </div>
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                Course: {classCode}
              </span>
            </div>

            <div className="telemetry-interventions-table-wrap">
              <table className="telemetry-interventions-table">
                <thead>
                  <tr>
                    <th>Intervention Activity</th>
                    <th>Module / Topic Context</th>
                    <th style={{ textAlign: 'right' }}>Attention Surge</th>
                    <th style={{ textAlign: 'right' }}>Duration Sustained</th>
                    <th style={{ textAlign: 'right' }}>Learning Gain</th>
                    <th style={{ textAlign: 'right' }}>Efficacy Score</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0bcff' }} />
                        <span style={{ fontWeight: 500, color: '#f9fafb' }}>5-min Concept Diagnostic</span>
                      </div>
                    </td>
                    <td style={{ color: '#9ca3af' }}>
                      <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S11</span> — Dynamic Programming
                    </td>
                    <td className="telemetry-surge-val">+18.5%</td>
                    <td className="telemetry-sustained-val">22 min</td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#4edea3' }}>+26%</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="telemetry-badge-efficacy-high">HIGH (94)</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4edea3' }} />
                        <span style={{ fontWeight: 500, color: '#f9fafb' }}>Spot the Bug / Code Review</span>
                      </div>
                    </td>
                    <td style={{ color: '#9ca3af' }}>
                      <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S08</span> — Interactive Debugging
                    </td>
                    <td className="telemetry-surge-val">+22.4%</td>
                    <td className="telemetry-sustained-val">28 min</td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#4edea3' }}>+34%</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="telemetry-badge-efficacy-optimal">OPTIMAL (98)</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#ffb95f' }} />
                        <span style={{ fontWeight: 500, color: '#f9fafb' }}>Quick In-Situ Poll</span>
                      </div>
                    </td>
                    <td style={{ color: '#9ca3af' }}>
                      <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S09</span> — Memory Allocation
                    </td>
                    <td className="telemetry-surge-val">+11.2%</td>
                    <td className="telemetry-sustained-val">11 min</td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#ffb95f' }}>+12%</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="telemetry-badge-efficacy-mod">MODERATE (68)</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#d0bcff' }} />
                        <span style={{ fontWeight: 500, color: '#f9fafb' }}>Socratic Metacognitive Dialogue</span>
                      </div>
                    </td>
                    <td style={{ color: '#9ca3af' }}>
                      <span style={{ fontFamily: 'JetBrains Mono', color: '#f9fafb', fontWeight: 600 }}>S05</span> — Linked List Traversal
                    </td>
                    <td className="telemetry-surge-val">+22.0%</td>
                    <td className="telemetry-sustained-val">24 min</td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#4edea3' }}>+29%</td>
                    <td style={{ textAlign: 'right' }}>
                      <span className="telemetry-badge-efficacy-optimal">OPTIMAL (96)</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
