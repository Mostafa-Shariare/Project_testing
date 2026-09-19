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
  ChevronUp,
  ChevronDown,
  Check,
  Star,
  Code,
  FileText,
  Lightbulb,
  Radio,
  BookOpen,
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

// ── Complete Pedagogical Activity Profiles (8 Specializations) ─────────────────
export const ACTIVITY_PROFILES = {
  socratic_question: {
    id: 'socratic_question',
    name: 'Socratic Dialogue',
    category: 'deep_reflection',
    description: '4-Stage Think → Compare → Reflect → Reassess pedagogical inquiry workflow.',
    estimatedTime: '~4-5 min',
    badge: 'Cognitive Lift',
    icon: Sparkles,
    iconClass: 'reflection',
    stages: [
      { num: 'Phase 1', name: 'Think (Individual)' },
      { num: 'Phase 2', name: 'Compare (Consensus)' },
      { num: 'Phase 3', name: 'Reflect (Discussion)' },
      { num: 'Phase 4', name: 'Reassess (Gain Delta)' },
    ],
    defaultPrompt: 'What is the primary factor determining the asymptotic time complexity of this recursive algorithm?',
    defaultOptions: [
      'Recursion tree branching factor and base-case depth',
      'Dynamic heap allocation size per stack frame',
      'Cache locality and hardware branch predictor',
      'Hash collision resolution strategy in symbol table',
    ],
    defaultCorrectIdx: 0,
  },
  quick_poll: {
    id: 'quick_poll',
    name: 'Quick In-Situ Poll',
    category: 'quick_engagement',
    description: 'Instant single or multi-choice pulse check to gauge class consensus.',
    estimatedTime: '~1-2 min',
    badge: 'Rapid Pulse',
    icon: BarChart2,
    iconClass: 'quick',
    stages: [
      { num: 'Step 1', name: 'Voting Open (Live Ingestion)' },
      { num: 'Step 2', name: 'Consensus Reached' },
    ],
    defaultPrompt: 'Quick consensus pulse: Which architectural trade-off best minimizes edge-to-cloud telemetry latency?',
    defaultOptions: [
      'Edge inference with lightweight metadata telemetry',
      'Centralized cloud video batching with polling',
      'Client-side state caching with IndexedDB',
      'Peer-to-peer distributed consensus streaming',
    ],
    defaultCorrectIdx: 0,
  },
  concept_check: {
    id: 'concept_check',
    name: 'Concept Diagnostic',
    category: 'quick_engagement',
    description: 'Targeted MCQ or True/False assessment with verified key explanation.',
    estimatedTime: '~2 min',
    badge: 'Formative',
    icon: CheckCircle2,
    iconClass: 'quick',
    stages: [
      { num: 'Step 1', name: 'Diagnostic Ingestion' },
      { num: 'Step 2', name: 'Misconceptions Isolated' },
      { num: 'Step 3', name: 'Solution Debrief' },
    ],
    defaultPrompt: 'In a self-balancing binary search tree (AVL/Red-Black), what is the worst-case search complexity?',
    defaultOptions: [
      'O(log N) — guaranteed height constraint',
      'O(N) — degenerated linear chain',
      'O(1) — constant index lookup',
      'O(N log N) — sorting overhead',
    ],
    defaultCorrectIdx: 0,
    defaultExplanation: 'A self-balancing BST maintains strict height bounding h ≤ 2 log₂(N + 1), mathematically guaranteeing search operations execute in O(log N) worst-case time.',
  },
  predict_reveal: {
    id: 'predict_reveal',
    name: 'Predict & Reveal',
    category: 'active_thinking',
    description: 'Students commit to hypothesis before observing execution outcome.',
    estimatedTime: '~3 min',
    badge: 'Hypothesis',
    icon: Eye,
    iconClass: 'thinking',
    stages: [
      { num: 'Step 1', name: 'Commit Hypothesis' },
      { num: 'Step 2', name: 'Execute & Reveal' },
      { num: 'Step 3', name: 'Surprise Calibrated' },
    ],
    defaultPrompt: 'What happens to CPU runtime when sorting an array before summing elements that pass a threshold (if arr[i] > 128)?',
    defaultOutcome: 'The sorted array runs ~3-5x faster than the unsorted array due to CPU branch prediction heuristics.',
    defaultTakeaway: 'Branch predictors cache pipeline branch history. Random unsorted data causes constant pipeline mispredictions (~15-20 cycle stall penalty each time).',
  },
  spot_mistake: {
    id: 'spot_mistake',
    name: 'Spot the Bug / Anomaly',
    category: 'active_thinking',
    description: 'Present deliberate syntax, algorithmic, or logical error for detection.',
    estimatedTime: '~3 min',
    badge: 'Debugging',
    icon: AlertTriangle,
    iconClass: 'thinking',
    stages: [
      { num: 'Step 1', name: 'Bug Hunt Active' },
      { num: 'Step 2', name: 'Flaw Isolated' },
      { num: 'Step 3', name: 'Refactoring Applied' },
    ],
    defaultPrompt: 'Spot the concurrency defect in this thread-safe counter implementation:',
    defaultCodeWithMistake: `class ThreadSafeCounter:\n    def __init__(self):\n        self.count = 0\n        self.lock = threading.Lock()\n\n    def increment(self):\n        # Defect: lock acquired but not released on exception\n        self.lock.acquire()\n        self.count += 1\n        # Missing: self.lock.release() or context manager!`,
    defaultHint: 'Inspect what happens if an interrupt or exception occurs between acquire() and release().',
    defaultCorrection: `class ThreadSafeCounter:\n    def __init__(self):\n        self.count = 0\n        self.lock = threading.Lock()\n\n    def increment(self):\n        with self.lock:  # Context manager guarantees safe release\n            self.count += 1`,
  },
  arrange_steps: {
    id: 'arrange_steps',
    name: 'Sequence Ordering',
    category: 'active_thinking',
    description: 'Students arrange shuffled procedural steps or code blocks in order.',
    estimatedTime: '~3 min',
    badge: 'Algorithmic',
    icon: ListOrdered,
    iconClass: 'thinking',
    stages: [
      { num: 'Step 1', name: 'Sequence Ordering Active' },
      { num: 'Step 2', name: 'Sequence Validated' },
    ],
    defaultPrompt: 'Arrange the core stages of the Visoria on-device telemetry pipeline into verified execution sequence:',
    defaultSteps: [
      'Webcam frame capture (local edge)',
      'MediaPipe face mesh & hand landmark extraction',
      '16-dimensional behavioral feature vector calculation',
      'XGBoost temporal smoothing classifier',
      'Classroom distraction cluster & intervention dispatch',
    ],
  },
  confidence_reflection: {
    id: 'confidence_reflection',
    name: 'Confidence Calibration',
    category: 'deep_reflection',
    description: 'Dual-axis inquiry pairing subjective self-confidence with objective competence.',
    estimatedTime: '~4 min',
    badge: 'Metacognitive',
    icon: TrendingUp,
    iconClass: 'reflection',
    stages: [
      { num: 'Step 1', name: 'Pre-Confidence Rating' },
      { num: 'Step 2', name: 'Answer Commitment' },
      { num: 'Step 3', name: 'Post-Confidence Shift' },
    ],
    defaultPrompt: 'Which algorithmic paradigm guarantees the global optimum when the greedy-choice property and optimal substructure are both satisfied?',
    defaultOptions: [
      'Greedy Algorithm',
      'Dynamic Programming with Memoization',
      'Branch and Bound Search',
      'Monte Carlo Approximation',
    ],
    defaultCorrectIdx: 0,
  },
  teach_back: {
    id: 'teach_back',
    name: 'Think-Pair-Share & Teach-Back',
    category: 'deep_reflection',
    description: 'Peer collaborative synthesis explaining principles in students’ own terminology.',
    estimatedTime: '~5 min',
    badge: 'Collaborative',
    icon: MessageCircle,
    iconClass: 'reflection',
    stages: [
      { num: 'Step 1', name: 'Individual Synthesis' },
      { num: 'Step 2', name: 'Peer Discussion' },
    ],
    defaultTopic: 'Asymptotic Complexity vs Wall-Clock Runtime',
    defaultPrompt: 'Explain why an O(N) algorithm might run slower than an O(N²) algorithm for small input sizes (N < 20). Imagine teaching a beginner classmate.',
  },
};

const ACTIVITY_CATALOG = [
  ACTIVITY_PROFILES.socratic_question,
  ACTIVITY_PROFILES.quick_poll,
  ACTIVITY_PROFILES.concept_check,
  ACTIVITY_PROFILES.predict_reveal,
  ACTIVITY_PROFILES.spot_mistake,
  ACTIVITY_PROFILES.arrange_steps,
  ACTIVITY_PROFILES.confidence_reflection,
  ACTIVITY_PROFILES.teach_back,
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
  const [broadcasting, setBroadcasting] = useState(false);
  const [activeTab, setActiveTab] = useState('compose'); // 'compose' | 'live' | 'analytics'
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState(ACTIVITY_CATALOG[0]);
  const [notification, setNotification] = useState('');

  // ── Activity Composer Specialized Fields ───────────────────────────────────────
  const [promptText, setPromptText] = useState(ACTIVITY_PROFILES.socratic_question.defaultPrompt);
  const [questionType, setQuestionType] = useState('mcq'); // 'mcq' | 'short'
  const [options, setOptions] = useState([...ACTIVITY_PROFILES.socratic_question.defaultOptions]);
  const [correctOptionIdx, setCorrectOptionIdx] = useState(0);

  // Specialized activity configs
  const [explanationNote, setExplanationNote] = useState('');
  const [trueFalseMode, setTrueFalseMode] = useState(false);
  const [revealText, setRevealText] = useState('');
  const [keyTakeaway, setKeyTakeaway] = useState('');
  const [contentWithMistake, setContentWithMistake] = useState('');
  const [mistakeHint, setMistakeHint] = useState('');
  const [mistakeCorrection, setMistakeCorrection] = useState('');
  const [arrangedSteps, setArrangedSteps] = useState([]);
  const [teachBackTopic, setTeachBackTopic] = useState('');
  const [teachBackPrompt, setTeachBackPrompt] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);

  // Auto-notification helper
  const showNotice = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(''), 3500);
  };

  // Switch activity selection & load specialized defaults
  const handleSelectActivity = (act) => {
    setSelectedActivity(act);
    const prof = ACTIVITY_PROFILES[act.id] || ACTIVITY_PROFILES.socratic_question;
    setPromptText(prof.defaultPrompt || '');

    if (prof.defaultOptions) {
      setOptions([...prof.defaultOptions]);
      setCorrectOptionIdx(prof.defaultCorrectIdx || 0);
    }
    if (prof.defaultExplanation) setExplanationNote(prof.defaultExplanation);
    if (prof.defaultOutcome) setRevealText(prof.defaultOutcome);
    if (prof.defaultTakeaway) setKeyTakeaway(prof.defaultTakeaway);
    if (prof.defaultCodeWithMistake) setContentWithMistake(prof.defaultCodeWithMistake);
    if (prof.defaultHint) setMistakeHint(prof.defaultHint);
    if (prof.defaultCorrection) setMistakeCorrection(prof.defaultCorrection);
    if (prof.defaultSteps) setArrangedSteps([...prof.defaultSteps]);
    if (prof.defaultTopic) setTeachBackTopic(prof.defaultTopic);
    if (prof.defaultPrompt && act.id === 'teach_back') setTeachBackPrompt(prof.defaultPrompt);
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

  // Option handlers for MCQ / Polls
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

  // Step handlers for Arrange Steps
  const handleStepChange = (idx, val) => {
    const next = [...arrangedSteps];
    next[idx] = val;
    setArrangedSteps(next);
  };

  const handleMoveStep = (idx, dir) => {
    const targetIdx = idx + dir;
    if (targetIdx < 0 || targetIdx >= arrangedSteps.length) return;
    const next = [...arrangedSteps];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    setArrangedSteps(next);
  };

  const handleAddStep = () => {
    setArrangedSteps([...arrangedSteps, `Step ${arrangedSteps.length + 1}`]);
  };

  const handleRemoveStep = (idx) => {
    if (arrangedSteps.length <= 2) return;
    setArrangedSteps(arrangedSteps.filter((_, i) => i !== idx));
  };

  // Broadcast & Launch Intervention Activity
  const handleBroadcastActivity = async () => {
    if (!classCode || broadcasting) return;
    if (!promptText.trim() && selectedActivity.id !== 'teach_back') {
      showNotice('Please provide a prompt or question text before broadcasting.');
      return;
    }

    setBroadcasting(true);
    try {
      const isMCQType = ['socratic_question', 'quick_poll', 'concept_check', 'confidence_reflection'].includes(selectedActivity.id);
      const cleanOptions = isMCQType
        ? (trueFalseMode ? ['True', 'False'] : options.filter((o) => o.trim()))
        : null;

      const config = {
        activity_type: selectedActivity.id,
        activity_title: selectedActivity.name,
        question_text: promptText.trim(),
        question_type: questionType,
        options: cleanOptions,
        correct_answer: cleanOptions && correctOptionIdx < cleanOptions.length ? cleanOptions[correctOptionIdx] : null,
        explanation: explanationNote.trim(),
        reveal_text: revealText.trim(),
        key_takeaway: keyTakeaway.trim(),
        content_with_mistake: contentWithMistake.trim(),
        hint: mistakeHint.trim(),
        correction: mistakeCorrection.trim(),
        steps: arrangedSteps.filter((s) => s.trim()),
        correct_order: arrangedSteps.filter((s) => s.trim()),
        topic: teachBackTopic.trim(),
        guiding_prompt: teachBackPrompt.trim() || promptText.trim(),
        allow_multiple: allowMultiple,
        true_false_mode: trueFalseMode,
      };

      // 1. Create Socratic/Intervention session
      const createResp = await apiFetch('/api/socratic/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          class_code: classCode,
          question_text: promptText.trim() || teachBackTopic.trim(),
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

  // Resolve active options for current session
  const activeOptions = useMemo(() => {
    if (activeSession?.activity_config?.options && Array.isArray(activeSession.activity_config.options) && activeSession.activity_config.options.length > 0) {
      return activeSession.activity_config.options;
    }
    if (questions && questions[0]?.options && Array.isArray(questions[0].options) && questions[0].options.length > 0) {
      return questions[0].options;
    }
    return options;
  }, [activeSession, questions, options]);

  // Robust option index matching helper
  const matchOptionIndex = useCallback((rawVal, opts) => {
    if (!rawVal || !opts || opts.length === 0) return -1;
    const clean = String(rawVal).trim().toLowerCase();

    // 1. Direct text match
    for (let i = 0; i < opts.length; i++) {
      if (clean === String(opts[i]).trim().toLowerCase()) return i;
    }

    // 2. Letter match: "a", "b", "c", "d" or "opt a", "option a"
    for (let i = 0; i < opts.length; i++) {
      const letter = String.fromCharCode(65 + i).toLowerCase();
      if (clean === letter || clean === `opt ${letter}` || clean === `option ${letter}`) {
        return i;
      }
    }

    // 3. Index match: "0", "1", "2"
    const parsed = parseInt(clean, 10);
    if (!isNaN(parsed) && parsed >= 0 && parsed < opts.length) {
      return parsed;
    }

    // 4. Substring match
    for (let i = 0; i < opts.length; i++) {
      const optStr = String(opts[i]).trim().toLowerCase();
      if (optStr.includes(clean) && clean.length >= 3) return i;
    }

    return -1;
  }, []);

  // ── Active Activity Profile Resolution ─────────────────────────────────────────
  const currentActType = activeSession?.activity_type || activeSession?.activity_config?.activity_type || 'socratic_question';
  const currentProfile = ACTIVITY_PROFILES[currentActType] || ACTIVITY_PROFILES.socratic_question;

  // ── Dynamic Specialized Metric Computations ────────────────────────────────────

  // 1. Quick Poll Metrics
  const quickPollMetrics = useMemo(() => {
    const opts = activeOptions || [];
    const counts = new Array(opts.length).fill(0);
    let total = 0;

    answers.forEach((a) => {
      const list = Array.isArray(a.selected_options) && a.selected_options.length > 0
        ? a.selected_options
        : (a.selected_option ? [a.selected_option] : (a.answer_text ? [a.answer_text] : []));
      list.forEach((val) => {
        const idx = matchOptionIndex(val, opts);
        if (idx !== -1) {
          counts[idx]++;
          total++;
        }
      });
    });

    let maxIdx = 0;
    for (let i = 1; i < counts.length; i++) {
      if (counts[i] > counts[maxIdx]) maxIdx = i;
    }
    const leadingPct = total > 0 ? Math.round((counts[maxIdx] / total) * 100) : 0;
    const leadingLabel = opts.length > 0 && total > 0
      ? `Leading: Opt ${String.fromCharCode(65 + maxIdx)} (${leadingPct}%)`
      : 'Awaiting Votes';

    return {
      counts,
      total,
      leadingLabel,
      chartData: {
        labels: opts.map((_, i) => `Opt ${String.fromCharCode(65 + i)}`),
        datasets: [
          {
            label: 'Student Votes',
            data: counts,
            backgroundColor: 'rgba(78, 222, 163, 0.85)',
            borderRadius: 4,
          },
        ],
      },
    };
  }, [answers, activeOptions, matchOptionIndex]);

  // 2. Concept Check Metrics
  const conceptCheckMetrics = useMemo(() => {
    const targetAnswer = activeSession?.activity_config?.correct_answer || activeOptions[0] || '';
    const opts = activeOptions || [];
    let correctCount = 0;
    let distractorCount = 0;
    const countsPerOpt = new Array(opts.length).fill(0);

    answers.forEach((a) => {
      const choice = (a.selected_option || a.answer_text || '').trim();
      if (!choice) return;
      const idx = matchOptionIndex(choice, opts);
      if (idx !== -1) countsPerOpt[idx]++;

      const targetIdx = matchOptionIndex(targetAnswer, opts);
      if (idx !== -1 && idx === targetIdx) {
        correctCount++;
      } else {
        distractorCount++;
      }
    });

    const total = correctCount + distractorCount;
    const accuracyPct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    return {
      accuracyPct,
      correctCount,
      distractorCount,
      targetAnswer,
      explanation: activeSession?.activity_config?.explanation || '',
      chartData: {
        labels: opts.map((opt, i) => {
          const isTarget = matchOptionIndex(opt, [targetAnswer]) !== -1;
          return `Opt ${String.fromCharCode(65 + i)}${isTarget ? ' (Key ✓)' : ''}`;
        }),
        datasets: [
          {
            label: 'Student Selections',
            data: countsPerOpt,
            backgroundColor: opts.map((opt) => {
              const isTarget = matchOptionIndex(opt, [targetAnswer]) !== -1;
              return isTarget ? 'rgba(78, 222, 163, 0.85)' : 'rgba(255, 185, 95, 0.75)';
            }),
            borderRadius: 4,
          },
        ],
      },
    };
  }, [answers, activeOptions, activeSession, matchOptionIndex]);

  // 3. Predict & Reveal Metrics
  const predictRevealMetrics = useMemo(() => {
    const surpriseLevels = [0, 0, 0, 0, 0];
    let sum = 0;
    let count = 0;

    answers.forEach((a) => {
      const rd = a.response_data || {};
      const lvl = Number(rd.surprise_level || 0);
      if (lvl >= 1 && lvl <= 5) {
        surpriseLevels[lvl - 1]++;
        sum += lvl;
        count++;
      }
    });

    const avgSurprise = count > 0 ? (sum / count).toFixed(1) : '3.0';

    return {
      avgSurprise,
      count,
      chartData: {
        labels: ['1: Expected', '2: Mild', '3: Moderate', '4: High', '5: Shocked!'],
        datasets: [
          {
            label: 'Surprise Ratings',
            data: surpriseLevels,
            backgroundColor: [
              'rgba(78, 222, 163, 0.75)',
              'rgba(56, 189, 248, 0.75)',
              'rgba(208, 188, 255, 0.75)',
              'rgba(255, 185, 95, 0.75)',
              'rgba(244, 63, 94, 0.75)',
            ],
            borderRadius: 4,
          },
        ],
      },
      revealText: activeSession?.activity_config?.reveal_text || activeSession?.activity_config?.correct_answer || '',
      keyTakeaway: activeSession?.activity_config?.key_takeaway || activeSession?.activity_config?.explanation || '',
    };
  }, [answers, activeSession]);

  // 4. Spot the Mistake Metrics
  const spotMistakeMetrics = useMemo(() => {
    return {
      totalBugs: answers.length,
      contentWithMistake: activeSession?.activity_config?.content_with_mistake || '',
      correction: activeSession?.activity_config?.correction || '',
      hint: activeSession?.activity_config?.hint || '',
    };
  }, [answers, activeSession]);

  // 5. Arrange the Steps Metrics
  const arrangeStepsMetrics = useMemo(() => {
    const targetOrder = activeSession?.activity_config?.correct_order || activeSession?.activity_config?.steps || [];
    let perfectCount = 0;
    let total = 0;

    answers.forEach((a) => {
      const rd = a.response_data || {};
      const order = rd.submitted_order;
      if (Array.isArray(order) && order.length > 0) {
        total++;
        if (JSON.stringify(order) === JSON.stringify(targetOrder)) {
          perfectCount++;
        }
      }
    });

    const perfectPct = total > 0 ? Math.round((perfectCount / total) * 100) : 0;

    return {
      perfectPct,
      perfectCount,
      total,
      targetOrder,
      chartData: {
        labels: ['Perfect Sequence', 'Needs Review'],
        datasets: [
          {
            label: 'Order Verification',
            data: [perfectCount, Math.max(0, total - perfectCount)],
            backgroundColor: ['rgba(78, 222, 163, 0.85)', 'rgba(255, 185, 95, 0.75)'],
            borderRadius: 4,
          },
        ],
      },
    };
  }, [answers, activeSession]);

  // 6. Confidence Calibration Metrics
  const confidenceMetrics = useMemo(() => {
    let preSum = 0;
    let postSum = 0;
    let preCount = 0;
    let postCount = 0;

    answers.forEach((a) => {
      const rd = a.response_data || {};
      if (rd.pre_confidence) {
        preSum += Number(rd.pre_confidence);
        preCount++;
      }
      if (rd.post_confidence) {
        postSum += Number(rd.post_confidence);
        postCount++;
      }
    });

    const avgPre = preCount > 0 ? (preSum / preCount).toFixed(1) : '3.0';
    const avgPost = postCount > 0 ? (postSum / postCount).toFixed(1) : avgPre;
    const shift = (parseFloat(avgPost) - parseFloat(avgPre)).toFixed(1);

    return {
      avgPre,
      avgPost,
      shift: (shift >= 0 ? '+' : '') + shift,
      chartData: {
        labels: ['Initial Confidence (Pre)', 'Revised Confidence (Post)'],
        datasets: [
          {
            label: 'Cohort Mean (1-5 scale)',
            data: [parseFloat(avgPre), parseFloat(avgPost)],
            backgroundColor: ['rgba(255, 185, 95, 0.75)', 'rgba(78, 222, 163, 0.85)'],
            borderRadius: 4,
          },
        ],
      },
    };
  }, [answers]);

  // 7. Teach-Back Metrics
  const teachBackMetrics = useMemo(() => {
    let concise = 0;
    let moderate = 0;
    let indepth = 0;
    let wordSum = 0;
    let total = 0;

    answers.forEach((a) => {
      const rd = a.response_data || {};
      const text = rd.explanation_text || a.answer_text || '';
      const wc = rd.word_count || (text.trim() ? text.trim().split(/\s+/).length : 0);
      if (wc > 0) {
        total++;
        wordSum += wc;
        if (wc < 20) concise++;
        else if (wc <= 50) moderate++;
        else indepth++;
      }
    });

    const avgWords = total > 0 ? Math.round(wordSum / total) : 0;

    return {
      avgWords,
      total,
      topic: activeSession?.activity_config?.topic || 'Assigned Concept',
      guidingPrompt: activeSession?.activity_config?.guiding_prompt || '',
      chartData: {
        labels: ['Concise (<20w)', 'Moderate (20-50w)', 'In-Depth (50+w)'],
        datasets: [
          {
            label: 'Explanation Depth',
            data: [concise, moderate, indepth],
            backgroundColor: ['rgba(255, 185, 95, 0.75)', 'rgba(56, 189, 248, 0.75)', 'rgba(78, 222, 163, 0.85)'],
            borderRadius: 4,
          },
        ],
      },
    };
  }, [answers, activeSession]);

  // 8. Socratic Dialogue Learning Gain Metrics
  const learningGainData = useMemo(() => {
    const hasPredefinedOpts = activeOptions && activeOptions.length > 0;

    if (hasPredefinedOpts) {
      const att1 = new Array(activeOptions.length).fill(0);
      const att2 = new Array(activeOptions.length).fill(0);
      let unmappedAtt1 = 0;
      let unmappedAtt2 = 0;

      answers.forEach((a) => {
        const optList = Array.isArray(a.selected_options) && a.selected_options.length > 0
          ? a.selected_options
          : [a.selected_option || a.answer_text || ''];

        optList.forEach((val1) => {
          if (!val1) return;
          if (a.attempt_number === 1 || !a.attempt_number) {
            const idx = matchOptionIndex(val1, activeOptions);
            if (idx !== -1) att1[idx] += 1;
            else unmappedAtt1 += 1;
          }
        });

        const val2 = a.selected_reflection_option || a.reflection_text;
        if (a.attempt_number === 2 && val2) {
          const idx = matchOptionIndex(val2, activeOptions);
          if (idx !== -1) att2[idx] += 1;
          else unmappedAtt2 += 1;
        }
      });

      const labels = activeOptions.map((_, i) => `Opt ${String.fromCharCode(65 + i)}`);
      const data1 = [...att1];
      const data2 = [...att2];

      if (unmappedAtt1 > 0 || unmappedAtt2 > 0) {
        labels.push('Other / Custom');
        data1.push(unmappedAtt1);
        data2.push(unmappedAtt2);
      }

      return {
        labels,
        datasets: [
          {
            label: 'Pre-Discussion (Attempt 1)',
            data: data1,
            backgroundColor: 'rgba(255, 185, 95, 0.75)',
            borderRadius: 4,
          },
          {
            label: 'Post-Reflect (Attempt 2)',
            data: data2,
            backgroundColor: 'rgba(78, 222, 163, 0.85)',
            borderRadius: 4,
          },
        ],
      };
    } else {
      const uniqueMap = {};
      answers.forEach((a) => {
        const val = (a.selected_option || a.answer_text || a.reflection_text || '').trim();
        if (val) uniqueMap[val.toLowerCase()] = val;
      });

      const uniqueList = Object.values(uniqueMap);
      const labels = uniqueList.length > 0 ? uniqueList.slice(0, 6) : ['Awaiting Input'];
      const data1 = new Array(labels.length).fill(0);
      const data2 = new Array(labels.length).fill(0);

      answers.forEach((a) => {
        const val1 = (a.selected_option || a.answer_text || '').trim().toLowerCase();
        const val2 = (a.selected_reflection_option || a.reflection_text || a.selected_option || a.answer_text || '').trim().toLowerCase();

        if (a.attempt_number === 1) {
          const idx = labels.findIndex((l) => l.toLowerCase() === val1);
          if (idx !== -1) data1[idx] += 1;
        } else if (a.attempt_number === 2) {
          const idx = labels.findIndex((l) => l.toLowerCase() === val2);
          if (idx !== -1) data2[idx] += 1;
        }
      });

      return {
        labels,
        datasets: [
          {
            label: 'Pre-Discussion (Attempt 1)',
            data: data1,
            backgroundColor: 'rgba(255, 185, 95, 0.75)',
            borderRadius: 4,
          },
          {
            label: 'Post-Reflect (Attempt 2)',
            data: data2,
            backgroundColor: 'rgba(78, 222, 163, 0.85)',
            borderRadius: 4,
          },
        ],
      };
    }
  }, [answers, activeOptions, matchOptionIndex]);

  // Distribution Doughnut Chart: shared across multiple activities
  const distributionChartData = useMemo(() => {
    if (answers.length === 0) {
      return {
        labels: ['No responses yet'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['rgba(255, 255, 255, 0.08)'],
            borderColor: '#191c22',
            borderWidth: 2,
          },
        ],
        isEmpty: true,
      };
    }

    const counts = {};
    answers.forEach((a) => {
      const optList = Array.isArray(a.selected_options) && a.selected_options.length > 0
        ? a.selected_options
        : [a.selected_option || a.selected_reflection_option || a.answer_text || a.reflection_text];

      optList.forEach((val) => {
        if (!val) return;
        const cleanVal = String(val).trim();
        const matchedIdx = matchOptionIndex(cleanVal, activeOptions);
        const label = matchedIdx !== -1
          ? `Opt ${String.fromCharCode(65 + matchedIdx)}`
          : (cleanVal.length > 20 ? cleanVal.slice(0, 18) + '...' : cleanVal);
        counts[label] = (counts[label] || 0) + 1;
      });
    });

    const labels = Object.keys(counts);
    const data = Object.values(counts);

    if (labels.length === 0) {
      return {
        labels: ['No responses yet'],
        datasets: [
          {
            data: [1],
            backgroundColor: ['rgba(255, 255, 255, 0.08)'],
            borderColor: '#191c22',
            borderWidth: 2,
          },
        ],
        isEmpty: true,
      };
    }

    return {
      labels,
      datasets: [
        {
          data,
          backgroundColor: ['#4edea3', '#d0bcff', '#ffb95f', '#ef4444', '#38bdf8', '#f43f5e', '#a855f7'],
          borderColor: '#191c22',
          borderWidth: 2,
        },
      ],
      isEmpty: false,
    };
  }, [answers, activeOptions, matchOptionIndex]);

  // Socratic Net Learning Gain
  const netGainSummary = useMemo(() => {
    let att1Total = 0;
    let att2Total = 0;
    let att1Correct = 0;
    let att2Correct = 0;

    const targetAnswer = activeSession?.activity_config?.correct_answer;
    const targetIdx = targetAnswer
      ? matchOptionIndex(targetAnswer, activeOptions)
      : (correctOptionIdx < activeOptions.length ? correctOptionIdx : 0);

    answers.forEach((a) => {
      const optList = Array.isArray(a.selected_options) && a.selected_options.length > 0
        ? a.selected_options
        : [a.selected_option || a.answer_text];

      optList.forEach((val1) => {
        if (val1 && (a.attempt_number === 1 || !a.attempt_number)) {
          att1Total++;
          const m = matchOptionIndex(val1, activeOptions);
          if (m !== -1 && m === targetIdx) att1Correct++;
        }
      });

      const val2 = a.selected_reflection_option || a.reflection_text;
      if (a.attempt_number === 2 && val2) {
        att2Total++;
        const m = matchOptionIndex(val2, activeOptions);
        if (m !== -1 && m === targetIdx) att2Correct++;
      }
    });

    if (att1Total === 0 && att2Total === 0) {
      return { text: '0 Responses', isPositive: true };
    }

    if (att2Total === 0) {
      return { text: `${att1Total} Pre-Vote${att1Total > 1 ? 's' : ''} (Awaiting Reassessment)`, isPositive: true };
    }

    const pct1 = att1Total > 0 ? (att1Correct / att1Total) * 100 : 0;
    const pct2 = att2Total > 0 ? (att2Correct / att2Total) * 100 : 0;
    const diff = pct2 - pct1;
    const sign = diff >= 0 ? '+' : '';

    return {
      text: `${sign}${diff.toFixed(1)}% Net Gain`,
      isPositive: diff >= 0,
    };
  }, [answers, activeOptions, correctOptionIdx, activeSession, matchOptionIndex]);

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
            Create and launch quick polls, diagnostic quizzes, bug hunts, step sequencing, and Socratic dialogues for your class.
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
                LIVE: {currentProfile.name.toUpperCase()} ({answers.length} Logged)
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
              <span>Live Console {activeSession && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4edea3' }} />}</span>
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
              <span>Deep Reflection (~4-5m)</span>
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
                  onClick={() => handleSelectActivity(act)}
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

          {/* Activity Composer Card */}
          <div className="telemetry-composer-container">
            <div className="telemetry-composer-header">
              <div className="telemetry-composer-title-wrap">
                <div className={`telemetry-activity-card-icon ${selectedActivity.iconClass}`} style={{ width: 30, height: 30 }}>
                  <selectedActivity.icon size={16} />
                </div>
                <div>
                  <h2 className="telemetry-composer-title">Configure &amp; Launch: {selectedActivity.name}</h2>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Target Class: <strong>{classCode}</strong> • {selectedActivity.estimatedTime} duration • {selectedActivity.badge}
                  </span>
                </div>
              </div>

              {/* Mode Toggle for activities supporting MCQ vs open short */}
              {['socratic_question'].includes(selectedActivity.id) && (
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
              )}
            </div>

            {/* Prompt Inspiration Templates */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="telemetry-composer-label">Inspiration Templates:</span>
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

            {/* ── Dynamic Specialized Form Fields per Activity Type ─────────────── */}

            {/* A. Generic Prompt Area (For most activities except teach-back which has topic) */}
            <div className="telemetry-composer-form-row">
              <label className="telemetry-composer-label">
                {selectedActivity.id === 'spot_mistake' ? 'Challenge Prompt:' :
                 selectedActivity.id === 'predict_reveal' ? 'Hypothesis Prediction Prompt:' :
                 selectedActivity.id === 'arrange_steps' ? 'Sequence Task Prompt:' :
                 selectedActivity.id === 'teach_back' ? 'Challenge Context Prompt:' :
                 'In-Situ Question or Prompt:'}
              </label>
              <textarea
                className="telemetry-composer-input telemetry-composer-textarea"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Enter inquiry prompt here..."
                rows={selectedActivity.id === 'spot_mistake' ? 2 : 3}
              />
            </div>

            {/* B. Quick Poll Options & Multiple Choice */}
            {selectedActivity.id === 'quick_poll' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="telemetry-composer-label">Poll Options (Live Ingestion Choices):</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.75rem', color: '#9ca3af', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={allowMultiple}
                        onChange={(e) => setAllowMultiple(e.target.checked)}
                      />
                      Allow Multiple Selections
                    </label>
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.5rem' }}>
                  {options.map((opt, idx) => (
                    <div key={idx} className="telemetry-option-row">
                      <span className="telemetry-option-marker" style={{ background: '#272a30', color: '#d0bcff' }}>
                        {String.fromCharCode(65 + idx)}
                      </span>
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
                          style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* C. Concept Check with Verified Solution */}
            {selectedActivity.id === 'concept_check' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="telemetry-composer-label">
                    {trueFalseMode ? 'Binary True/False Diagnostic:' : 'Assessment Options (Click circle to set verified correct answer):'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setTrueFalseMode(!trueFalseMode);
                      if (!trueFalseMode) {
                        setOptions(['True', 'False']);
                        setCorrectOptionIdx(0);
                      } else {
                        setOptions([...ACTIVITY_PROFILES.concept_check.defaultOptions]);
                      }
                    }}
                    style={{
                      background: 'transparent',
                      border: '1px solid rgba(255, 255, 255, 0.1)',
                      color: '#d0bcff',
                      borderRadius: 4,
                      padding: '0.2rem 0.5rem',
                      fontSize: '0.72rem',
                      cursor: 'pointer'
                    }}
                  >
                    {trueFalseMode ? 'Switch to Multiple Choice' : 'Switch to True/False'}
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.5rem' }}>
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
                          title="Click to set as verified correct answer"
                        >
                          {isCorrect ? '✓' : String.fromCharCode(65 + idx)}
                        </button>
                        <input
                          type="text"
                          className="telemetry-composer-input"
                          value={opt}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Pedagogical Explanation Note */}
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">
                    Verified Solution &amp; Pedagogical Debrief (Revealed to students after submission):
                  </label>
                  <textarea
                    className="telemetry-composer-input telemetry-composer-textarea"
                    value={explanationNote}
                    onChange={(e) => setExplanationNote(e.target.value)}
                    placeholder="Explain why the verified option is correct and resolve common misconceptions..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* D. Predict & Reveal Specialized Fields */}
            {selectedActivity.id === 'predict_reveal' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Actual Outcome / Execution Result to Reveal:</label>
                  <textarea
                    className="telemetry-composer-input telemetry-composer-textarea"
                    value={revealText}
                    onChange={(e) => setRevealText(e.target.value)}
                    placeholder="Describe the real outcome observed during execution..."
                    rows={2}
                  />
                </div>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Key Pedagogical Takeaway (Why it happened):</label>
                  <textarea
                    className="telemetry-composer-input telemetry-composer-textarea"
                    value={keyTakeaway}
                    onChange={(e) => setKeyTakeaway(e.target.value)}
                    placeholder="Summarize the core architectural / algorithmic takeaway..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* E. Spot the Mistake Specialized Fields */}
            {selectedActivity.id === 'spot_mistake' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Code Snippet or Content with Deliberate Bug:</label>
                  <textarea
                    className="telemetry-composer-input telemetry-composer-textarea"
                    style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem' }}
                    value={contentWithMistake}
                    onChange={(e) => setContentWithMistake(e.target.value)}
                    placeholder="Enter code snippet with intentional flaw..."
                    rows={5}
                  />
                </div>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Optional Hint for Students:</label>
                  <input
                    type="text"
                    className="telemetry-composer-input"
                    value={mistakeHint}
                    onChange={(e) => setMistakeHint(e.target.value)}
                    placeholder="e.g. Inspect exception safety during resource acquisition..."
                  />
                </div>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Verified Bug Correction &amp; Solution (Debrief):</label>
                  <textarea
                    className="telemetry-composer-input telemetry-composer-textarea"
                    style={{ fontFamily: 'JetBrains Mono', fontSize: '0.8125rem' }}
                    value={mistakeCorrection}
                    onChange={(e) => setMistakeCorrection(e.target.value)}
                    placeholder="Enter the refactored, correct code..."
                    rows={4}
                  />
                </div>
              </div>
            )}

            {/* F. Arrange the Steps Specialized Fields */}
            {selectedActivity.id === 'arrange_steps' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div>
                    <label className="telemetry-composer-label">Target Sequence (Steps in verified correct order):</label>
                    <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                      Steps will be automatically shuffled on student screens.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddStep}
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
                    <Plus size={12} /> Add Step
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
                  {arrangedSteps.map((step, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{
                        width: 24,
                        height: 24,
                        borderRadius: '50%',
                        background: 'rgba(78, 222, 163, 0.15)',
                        color: '#4edea3',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontFamily: 'JetBrains Mono',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        flexShrink: 0
                      }}>
                        {idx + 1}
                      </span>
                      <input
                        type="text"
                        className="telemetry-composer-input"
                        value={step}
                        onChange={(e) => handleStepChange(idx, e.target.value)}
                      />
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveStep(idx, -1)}
                        style={{ background: 'transparent', border: 'none', color: idx === 0 ? '#4b5563' : '#9ca3af', cursor: 'pointer', padding: 3 }}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        type="button"
                        disabled={idx === arrangedSteps.length - 1}
                        onClick={() => handleMoveStep(idx, 1)}
                        style={{ background: 'transparent', border: 'none', color: idx === arrangedSteps.length - 1 ? '#4b5563' : '#9ca3af', cursor: 'pointer', padding: 3 }}
                      >
                        <ChevronDown size={16} />
                      </button>
                      {arrangedSteps.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveStep(idx)}
                          style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 3 }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* G. Confidence Calibration Options */}
            {selectedActivity.id === 'confidence_reflection' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <label className="telemetry-composer-label">Target Response Options (Click circle to set target key):</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.5rem' }}>
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
                        >
                          {String.fromCharCode(65 + idx)}
                        </button>
                        <input
                          type="text"
                          className="telemetry-composer-input"
                          value={opt}
                          onChange={(e) => handleOptionChange(idx, e.target.value)}
                        />
                      </div>
                    );
                  })}
                </div>
                <span style={{ fontSize: '0.72rem', color: '#9ca3af' }}>
                  Students rate their confidence on a 1-5 scale before answering, then re-rate their confidence post-commitment.
                </span>
              </div>
            )}

            {/* H. Teach-Back Topic & Rubric */}
            {selectedActivity.id === 'teach_back' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Target Concept Topic to Synthesize:</label>
                  <input
                    type="text"
                    className="telemetry-composer-input"
                    value={teachBackTopic}
                    onChange={(e) => setTeachBackTopic(e.target.value)}
                    placeholder="e.g. Asymptotic Complexity vs Wall-Clock Runtime..."
                  />
                </div>
                <div className="telemetry-composer-form-row">
                  <label className="telemetry-composer-label">Guiding Pedagogical Rubric / Prompt:</label>
                  <textarea
                    className="telemetry-composer-input telemetry-composer-textarea"
                    value={teachBackPrompt}
                    onChange={(e) => setTeachBackPrompt(e.target.value)}
                    placeholder="Instructions for how students should explain the topic..."
                    rows={2}
                  />
                </div>
              </div>
            )}

            {/* I. Standard Socratic Options */}
            {selectedActivity.id === 'socratic_question' && questionType === 'mcq' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="telemetry-composer-label">Response Options (Click circle to set target answer):</label>
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

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.5rem' }}>
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
                            style={{ background: 'transparent', border: 'none', color: '#9ca3af', cursor: 'pointer', padding: 4 }}
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

            {/* Dynamic Pedagogical Workflow Stages Preview for Selected Activity */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
              <span className="telemetry-composer-label">Pedagogical Workflow Progression:</span>
              <div
                className="telemetry-socratic-stepper"
                style={{ gridTemplateColumns: `repeat(${selectedActivity.stages.length}, 1fr)` }}
              >
                {selectedActivity.stages.map((stg, sIdx) => (
                  <div key={sIdx} className={`telemetry-stepper-stage ${sIdx === 0 ? 'active' : ''}`}>
                    <span className="telemetry-stepper-num">{stg.num}</span>
                    <span className="telemetry-stepper-name">{stg.name}</span>
                  </div>
                ))}
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
              {/* Left Column (7 cols): Active Prompt & Live Stream */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="telemetry-live-banner">
                  <div className="telemetry-live-banner-head">
                    <span className="telemetry-live-badge-active">
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#4edea3', animation: 'pulse-dot 2s infinite' }} />
                      LIVE ACTIVE: {currentProfile.name.toUpperCase()}
                    </span>
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                      ROOM: {classCode} • {currentProfile.badge}
                    </span>
                  </div>

                  <h2 className="telemetry-live-prompt-text">
                    {activeSession.question_text || activeSession.activity_config?.question_text || activeSession.activity_config?.prompt_text || activeSession.activity_config?.topic || promptText}
                  </h2>

                  {/* Specialized Pedagogical Stepper Progression for Active Activity */}
                  <div
                    className="telemetry-socratic-stepper"
                    style={{ gridTemplateColumns: `repeat(${currentProfile.stages.length}, 1fr)` }}
                  >
                    {currentProfile.stages.map((stg, sIdx) => {
                      const isStageActive = answers.length === 0
                        ? sIdx === 0
                        : (sIdx <= 1 || (sIdx === currentProfile.stages.length - 1 && answers.length >= 2));
                      return (
                        <div key={sIdx} className={`telemetry-stepper-stage ${isStageActive ? 'active' : ''}`}>
                          <span className="telemetry-stepper-num">{stg.num}</span>
                          <span className="telemetry-stepper-name">{stg.name}</span>
                        </div>
                      );
                    })}
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
                      answers.map((ans, idx) => {
                        const rd = ans.response_data || {};

                        // Activity-specific badge resolution
                        let badgeText = `Attempt ${ans.attempt_number || 1}`;
                        let badgeColor = '#4edea3';
                        let badgeBg = 'rgba(78, 222, 163, 0.12)';

                        if (currentActType === 'concept_check') {
                          const target = activeSession?.activity_config?.correct_answer;
                          const isCorrect = target && ans.selected_option && ans.selected_option.trim().toLowerCase() === target.trim().toLowerCase();
                          badgeText = isCorrect ? 'Correct ✓' : 'Distractor ✗';
                          badgeColor = isCorrect ? '#4edea3' : '#ffb4ab';
                          badgeBg = isCorrect ? 'rgba(78, 222, 163, 0.12)' : 'rgba(255, 180, 171, 0.12)';
                        } else if (currentActType === 'predict_reveal') {
                          badgeText = `Surprise: ${rd.surprise_level || 3}/5 ⭐`;
                          badgeColor = '#ffb95f';
                          badgeBg = 'rgba(255, 185, 95, 0.12)';
                        } else if (currentActType === 'spot_mistake') {
                          badgeText = 'Bug Isolated';
                          badgeColor = '#d0bcff';
                          badgeBg = 'rgba(208, 188, 255, 0.12)';
                        } else if (currentActType === 'arrange_steps') {
                          const target = activeSession?.activity_config?.correct_order || [];
                          const isMatch = rd.submitted_order && JSON.stringify(rd.submitted_order) === JSON.stringify(target);
                          badgeText = isMatch ? 'Perfect Sequence ✓' : 'Order Logged';
                          badgeColor = isMatch ? '#4edea3' : '#d0bcff';
                          badgeBg = isMatch ? 'rgba(78, 222, 163, 0.12)' : 'rgba(208, 188, 255, 0.12)';
                        } else if (currentActType === 'confidence_reflection') {
                          badgeText = rd.pre_confidence ? `Pre: ${rd.pre_confidence}/5 → Post: ${rd.post_confidence || rd.pre_confidence}/5` : 'Confidence Logged';
                          badgeColor = '#38bdf8';
                          badgeBg = 'rgba(56, 189, 248, 0.12)';
                        } else if (currentActType === 'teach_back') {
                          const wc = rd.word_count || (ans.answer_text ? ans.answer_text.trim().split(/\s+/).length : 0);
                          badgeText = `${wc} Words Synthesized`;
                          badgeColor = '#d0bcff';
                          badgeBg = 'rgba(208, 188, 255, 0.12)';
                        } else if (currentActType === 'quick_poll') {
                          badgeText = 'Vote Secured';
                          badgeColor = '#4edea3';
                          badgeBg = 'rgba(78, 222, 163, 0.12)';
                        }

                        return (
                          <div key={idx} className="telemetry-answer-card">
                            <div className="telemetry-answer-card-head">
                              <span className="telemetry-answer-student">
                                {ans.roll_number || `Student ${idx + 1}`}
                              </span>
                              <span
                                className="telemetry-answer-badge"
                                style={{ color: badgeColor, background: badgeBg }}
                              >
                                {badgeText}
                              </span>
                            </div>

                            {/* Specialized Response Body */}
                            <div className="telemetry-answer-body">
                              {currentActType === 'spot_mistake' ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                  <div><strong>Mistake:</strong> {rd.identified_mistake || ans.answer_text || 'Submitted'}</div>
                                  {rd.explanation && (
                                    <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
                                      <strong>Proposed Correction:</strong> {rd.explanation}
                                    </div>
                                  )}
                                </div>
                              ) : currentActType === 'predict_reveal' ? (
                                <div>
                                  <strong>Hypothesis:</strong> "{rd.prediction || ans.answer_text || ans.selected_option || 'Hypothesis submitted'}"
                                </div>
                              ) : currentActType === 'arrange_steps' ? (
                                <div>
                                  <strong>Sequence:</strong> {Array.isArray(rd.submitted_order) ? rd.submitted_order.join(' → ') : (ans.selected_option || ans.answer_text)}
                                </div>
                              ) : currentActType === 'teach_back' ? (
                                <div>"{rd.explanation_text || ans.answer_text}"</div>
                              ) : (
                                <div>{ans.selected_option || (Array.isArray(ans.selected_options) ? ans.selected_options.join(', ') : ans.answer_text) || 'Submitted response'}</div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div style={{
                        padding: '2.5rem 1rem',
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

              {/* Right Column (5 cols): Activity-Specialized Live Visualizations */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                {/* ═══════════ CASE 1: QUICK POLL ═══════════ */}
                {currentActType === 'quick_poll' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <BarChart2 size={16} style={{ color: '#4edea3' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Live Consensus Distribution
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
                          {quickPollMetrics.leadingLabel}
                        </span>
                      </div>
                      <div style={{ height: 210, width: '100%', position: 'relative' }}>
                        <Bar
                          data={quickPollMetrics.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { precision: 0, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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

                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Cohort Option Share
                        </h4>
                        <span style={{ fontFamily: 'JetBrains Mono', fontSize: '0.6875rem', color: '#9ca3af' }}>
                          {quickPollMetrics.total} Votes Logged
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
                                labels: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 10 },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 2: CONCEPT DIAGNOSTIC ═══════════ */}
                {currentActType === 'concept_check' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <CheckCircle2 size={16} style={{ color: '#4edea3' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Cohort Diagnostic Accuracy
                          </h4>
                        </div>
                        <span style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: '0.6875rem',
                          color: conceptCheckMetrics.accuracyPct >= 60 ? '#4edea3' : '#ffb95f',
                          background: conceptCheckMetrics.accuracyPct >= 60 ? 'rgba(78, 222, 163, 0.12)' : 'rgba(255, 185, 95, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 3
                        }}>
                          {conceptCheckMetrics.accuracyPct}% Class Accuracy
                        </span>
                      </div>
                      <div style={{ height: 210, width: '100%', position: 'relative' }}>
                        <Bar
                          data={conceptCheckMetrics.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { precision: 0, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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

                    <div className="telemetry-gain-box" style={{ background: 'rgba(16, 20, 26, 0.95)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Lightbulb size={16} style={{ color: '#4edea3' }} />
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Verified Solution &amp; Pedagogical Note
                        </h4>
                      </div>
                      <div style={{
                        background: 'rgba(78, 222, 163, 0.08)',
                        border: '1px solid rgba(78, 222, 163, 0.25)',
                        borderRadius: 6,
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.8125rem',
                        color: '#dfe2eb'
                      }}>
                        <div style={{ color: '#4edea3', fontWeight: 600, marginBottom: '0.25rem' }}>
                          Key: {conceptCheckMetrics.targetAnswer || 'Option A'}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#cbc3d7', lineHeight: 1.4 }}>
                          {conceptCheckMetrics.explanation || 'Self-balancing binary trees enforce height bounds to preserve logarithmic search complexity.'}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 3: PREDICT & REVEAL ═══════════ */}
                {currentActType === 'predict_reveal' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Eye size={16} style={{ color: '#ffb95f' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Surprise Calibration Scale
                          </h4>
                        </div>
                        <span style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: '0.6875rem',
                          color: '#ffb95f',
                          background: 'rgba(255, 185, 95, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 3
                        }}>
                          Avg: {predictRevealMetrics.avgSurprise}/5 ⭐
                        </span>
                      </div>
                      <div style={{ height: 210, width: '100%', position: 'relative' }}>
                        <Bar
                          data={predictRevealMetrics.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { precision: 0, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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

                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Sparkles size={16} style={{ color: '#ffb95f' }} />
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Instructor Reveal &amp; Key Takeaway
                        </h4>
                      </div>
                      <div style={{
                        background: 'rgba(255, 185, 95, 0.08)',
                        border: '1px solid rgba(255, 185, 95, 0.25)',
                        borderRadius: 6,
                        padding: '0.65rem 0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.45rem',
                        fontSize: '0.8125rem'
                      }}>
                        <div>
                          <strong style={{ color: '#ffb95f' }}>Execution Outcome:</strong>
                          <p style={{ margin: '0.2rem 0 0 0', color: '#dfe2eb' }}>
                            {predictRevealMetrics.revealText || 'Execution produces a 3-5x acceleration when data is presorted.'}
                          </p>
                        </div>
                        {predictRevealMetrics.keyTakeaway && (
                          <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '0.4rem' }}>
                            <strong style={{ color: '#d0bcff' }}>Key Takeaway:</strong>
                            <p style={{ margin: '0.2rem 0 0 0', color: '#cbc3d7', fontSize: '0.78rem' }}>
                              {predictRevealMetrics.keyTakeaway}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 4: SPOT THE MISTAKE ═══════════ */}
                {currentActType === 'spot_mistake' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <AlertTriangle size={16} style={{ color: '#ffb4ab' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Bug Detection &amp; Isolation
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
                          {spotMistakeMetrics.totalBugs} Submissions Logged
                        </span>
                      </div>
                      <div style={{ fontSize: '0.8125rem', color: '#9ca3af', lineHeight: 1.45 }}>
                        Students are actively hunting for concurrency, algorithmic, and syntactic defects. Real-time submissions appear in the Left Live Stream.
                      </div>
                    </div>

                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <Code size={16} style={{ color: '#4edea3' }} />
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Verified Bug Fix &amp; Refactoring
                        </h4>
                      </div>
                      <div style={{
                        background: '#101319',
                        border: '1px solid rgba(255, 255, 255, 0.08)',
                        borderRadius: 6,
                        padding: '0.75rem',
                        fontFamily: 'JetBrains Mono',
                        fontSize: '0.75rem',
                        color: '#4edea3',
                        whiteSpace: 'pre-wrap',
                        maxHeight: 180,
                        overflowY: 'auto'
                      }}>
                        {spotMistakeMetrics.correction || '# Verified correction:\nwith self.lock:\n    self.count += 1'}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 5: ARRANGE THE STEPS ═══════════ */}
                {currentActType === 'arrange_steps' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <ListOrdered size={16} style={{ color: '#4edea3' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Sequence Ordering Precision
                          </h4>
                        </div>
                        <span style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: '0.6875rem',
                          color: arrangeStepsMetrics.perfectPct >= 50 ? '#4edea3' : '#ffb95f',
                          background: arrangeStepsMetrics.perfectPct >= 50 ? 'rgba(78, 222, 163, 0.12)' : 'rgba(255, 185, 95, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 3
                        }}>
                          {arrangeStepsMetrics.perfectPct}% Perfect Order
                        </span>
                      </div>
                      <div style={{ height: 210, width: '100%', position: 'relative' }}>
                        <Bar
                          data={arrangeStepsMetrics.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { precision: 0, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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

                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <CheckCircle2 size={16} style={{ color: '#4edea3' }} />
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Target Sequence Reference
                        </h4>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        {(arrangeStepsMetrics.targetOrder || []).map((step, sIdx) => (
                          <div key={sIdx} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
                            <span style={{
                              width: 20,
                              height: 20,
                              borderRadius: '50%',
                              background: 'rgba(78, 222, 163, 0.15)',
                              color: '#4edea3',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'JetBrains Mono',
                              fontSize: '0.6875rem',
                              fontWeight: 600
                            }}>
                              {sIdx + 1}
                            </span>
                            <span style={{ color: '#dfe2eb' }}>{step}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 6: CONFIDENCE CALIBRATION ═══════════ */}
                {currentActType === 'confidence_reflection' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <TrendingUp size={16} style={{ color: '#38bdf8' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Metacognitive Calibration Shift
                          </h4>
                        </div>
                        <span style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: '0.6875rem',
                          color: '#38bdf8',
                          background: 'rgba(56, 189, 248, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 3
                        }}>
                          Shift: {confidenceMetrics.shift} pts
                        </span>
                      </div>
                      <div style={{ height: 210, width: '100%', position: 'relative' }}>
                        <Bar
                          data={confidenceMetrics.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: {
                                beginAtZero: true,
                                max: 5,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { precision: 1, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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

                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Answer Choice Distribution
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
                                labels: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 10 },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 7: TEACH-BACK ═══════════ */}
                {currentActType === 'teach_back' && (
                  <>
                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                          <MessageCircle size={16} style={{ color: '#d0bcff' }} />
                          <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                            Explanation Depth Metrics
                          </h4>
                        </div>
                        <span style={{
                          fontFamily: 'JetBrains Mono',
                          fontSize: '0.6875rem',
                          color: '#d0bcff',
                          background: 'rgba(208, 188, 255, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 3
                        }}>
                          Avg {teachBackMetrics.avgWords} Words / Student
                        </span>
                      </div>
                      <div style={{ height: 210, width: '100%', position: 'relative' }}>
                        <Bar
                          data={teachBackMetrics.chartData}
                          options={{
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: { legend: { display: false } },
                            scales: {
                              y: {
                                beginAtZero: true,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { precision: 0, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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

                    <div className="telemetry-gain-box">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <BookOpen size={16} style={{ color: '#d0bcff' }} />
                        <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: '#f9fafb', margin: 0 }}>
                          Focus Concept &amp; Guiding Rubric
                        </h4>
                      </div>
                      <div style={{
                        background: 'rgba(208, 188, 255, 0.08)',
                        border: '1px solid rgba(208, 188, 255, 0.25)',
                        borderRadius: 6,
                        padding: '0.65rem 0.85rem',
                        fontSize: '0.8125rem'
                      }}>
                        <div style={{ color: '#d0bcff', fontWeight: 600, marginBottom: '0.2rem' }}>
                          Topic: {teachBackMetrics.topic}
                        </div>
                        {teachBackMetrics.guidingPrompt && (
                          <div style={{ color: '#cbc3d7', fontSize: '0.78rem' }}>
                            {teachBackMetrics.guidingPrompt}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ═══════════ CASE 8: SOCRATIC DIALOGUE ═══════════ */}
                {currentActType === 'socratic_question' && (
                  <>
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
                          color: netGainSummary.isPositive ? '#4edea3' : '#ffb95f',
                          background: netGainSummary.isPositive ? 'rgba(78, 222, 163, 0.12)' : 'rgba(255, 185, 95, 0.12)',
                          padding: '0.15rem 0.4rem',
                          borderRadius: 3
                        }}>
                          {netGainSummary.text}
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
                                labels: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 10 }, boxWidth: 12 },
                              },
                            },
                            scales: {
                              y: {
                                beginAtZero: true,
                                suggestedMax: 2,
                                grid: { color: 'rgba(255, 255, 255, 0.05)' },
                                ticks: { stepSize: 1, precision: 0, color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 } },
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
                                labels: { color: '#9ca3af', font: { family: 'JetBrains Mono', size: 9 }, boxWidth: 10 },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                  </>
                )}

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
                  No Active Classroom Activity Running
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', maxWidth: 460, margin: '0 auto' }}>
                  Select an activity from the Library to configure and broadcast live to your connected students.
                </p>
              </div>
              <button
                type="button"
                className="telemetry-btn-broadcast"
                onClick={() => setActiveTab('compose')}
              >
                <Plus size={16} />
                <span>Open Activity Library</span>
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
                        <span style={{ fontWeight: 500, color: '#f9fafb' }}>Concept Diagnostic</span>
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
                        <span style={{ fontWeight: 500, color: '#f9fafb' }}>Socratic Dialogue</span>
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
