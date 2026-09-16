import { useState, useEffect } from 'react';
import {
  X,
  BarChart2,
  CheckCircle2,
  Eye,
  AlertTriangle,
  ListOrdered,
  HelpCircle,
  TrendingUp,
  MessageCircle,
  Zap,
  Brain,
  Sparkles,
  Clock,
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Play,
  Send,
} from 'lucide-react';

const ICON_MAP = {
  'bar-chart-2': BarChart2,
  'check-circle': CheckCircle2,
  'eye': Eye,
  'alert-triangle': AlertTriangle,
  'list-ordered': ListOrdered,
  'help-circle': HelpCircle,
  'trending-up': TrendingUp,
  'message-circle': MessageCircle,
};

const CATEGORY_META = {
  quick_engagement: {
    label: 'Quick Engagement',
    icon: Zap,
    color: '#2563EB',
    bg: '#EFF6FF',
    description: 'Fast activities to re-engage attention (~1-2 min)',
  },
  active_thinking: {
    label: 'Active Thinking',
    icon: Brain,
    color: '#D97706',
    bg: '#FFFBEB',
    description: 'Activities that require analysis and reasoning (~3 min)',
  },
  deep_reflection: {
    label: 'Deep Reflection',
    icon: Sparkles,
    color: '#7C3AED',
    bg: '#F5F3FF',
    description: 'Metacognitive and deep-learning workflows (~4-5 min)',
  },
};

const ACTIVITY_DEFINITIONS = [
  {
    id: 'quick_poll',
    name: 'Quick Poll',
    category: 'quick_engagement',
    description: 'Quick single or multiple-choice vote to gauge understanding.',
    estimatedTime: '~1 min',
    icon: 'bar-chart-2',
  },
  {
    id: 'concept_check',
    name: 'Concept Check',
    category: 'quick_engagement',
    description: 'MCQ or True/False question with a correct answer.',
    estimatedTime: '~2 min',
    icon: 'check-circle',
  },
  {
    id: 'predict_reveal',
    name: 'Predict & Reveal',
    category: 'active_thinking',
    description: 'Students predict an outcome, then see the correct answer.',
    estimatedTime: '~3 min',
    icon: 'eye',
  },
  {
    id: 'spot_mistake',
    name: 'Spot the Mistake',
    category: 'active_thinking',
    description: 'Students identify an error in presented content.',
    estimatedTime: '~3 min',
    icon: 'alert-triangle',
  },
  {
    id: 'arrange_steps',
    name: 'Arrange the Steps',
    category: 'active_thinking',
    description: 'Students arrange items in the correct sequence.',
    estimatedTime: '~3 min',
    icon: 'list-ordered',
  },
  {
    id: 'socratic_question',
    name: 'Socratic Question',
    category: 'deep_reflection',
    description: 'Full Think → Compare → Reflect → Reassess workflow.',
    estimatedTime: '~5 min',
    icon: 'help-circle',
  },
  {
    id: 'confidence_reflection',
    name: 'Confidence + Reflection',
    category: 'deep_reflection',
    description: 'Rate confidence before and after answering.',
    estimatedTime: '~4 min',
    icon: 'trending-up',
  },
  {
    id: 'teach_back',
    name: 'Teach-Back',
    category: 'deep_reflection',
    description: 'Explain a concept in your own words.',
    estimatedTime: '~5 min',
    icon: 'message-circle',
  },
];

export default function ActivitySelector({ isOpen, onClose, onLaunchActivity, classCode }) {
  const [selectedCategory, setSelectedCategory] = useState('quick_engagement');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [launching, setLaunching] = useState(false);

  // Config form state
  const [questionText, setQuestionText] = useState('');
  const [options, setOptions] = useState(['Option A', 'Option B', 'Option C', 'Option D']);
  const [correctAnswer, setCorrectAnswer] = useState('');
  const [allowMultiple, setAllowMultiple] = useState(false);
  const [trueFalseMode, setTrueFalseMode] = useState(false);
  const [promptText, setPromptText] = useState('');
  const [explanation, setExplanation] = useState('');
  const [contentWithMistake, setContentWithMistake] = useState('');
  const [correctVersion, setCorrectVersion] = useState('');
  const [hint, setHint] = useState('');
  const [steps, setSteps] = useState(['Step 1', 'Step 2', 'Step 3']);
  const [topic, setTopic] = useState('');
  const [guidingPrompt, setGuidingPrompt] = useState('');

  // Reset form when activity changes
  useEffect(() => {
    if (selectedActivity) {
      setQuestionText('');
      setOptions(['Option A', 'Option B', 'Option C', 'Option D']);
      setCorrectAnswer('');
      setAllowMultiple(false);
      setTrueFalseMode(false);
      setPromptText('');
      setExplanation('');
      setContentWithMistake('');
      setCorrectVersion('');
      setHint('');
      setSteps(['Step 1', 'Step 2', 'Step 3']);
      setTopic('');
      setGuidingPrompt('');
    }
  }, [selectedActivity]);

  if (!isOpen) return null;

  const filteredActivities = ACTIVITY_DEFINITIONS.filter(
    (a) => a.category === selectedCategory
  );

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
  };

  const handleStepChange = (idx, val) => {
    const next = [...steps];
    next[idx] = val;
    setSteps(next);
  };

  const handleAddStep = () => {
    if (steps.length >= 8) return;
    setSteps([...steps, `Step ${steps.length + 1}`]);
  };

  const handleRemoveStep = (idx) => {
    if (steps.length <= 2) return;
    setSteps(steps.filter((_, i) => i !== idx));
  };

  const moveStep = (idx, direction) => {
    const newSteps = [...steps];
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= newSteps.length) return;
    [newSteps[idx], newSteps[targetIdx]] = [newSteps[targetIdx], newSteps[idx]];
    setSteps(newSteps);
  };

  const buildActivityConfig = () => {
    if (!selectedActivity) return null;
    const id = selectedActivity.id;

    switch (id) {
      case 'quick_poll':
        return {
          question_text: questionText.trim(),
          options: options.filter((o) => o.trim()),
          allow_multiple: allowMultiple,
        };
      case 'concept_check':
        if (trueFalseMode) {
          return {
            question_text: questionText.trim(),
            options: ['True', 'False'],
            correct_answer: correctAnswer,
            true_false_mode: true,
          };
        }
        return {
          question_text: questionText.trim(),
          options: options.filter((o) => o.trim()),
          correct_answer: correctAnswer,
          true_false_mode: false,
        };
      case 'predict_reveal':
        return {
          prompt_text: promptText.trim(),
          correct_answer: correctAnswer.trim(),
          explanation: explanation.trim(),
        };
      case 'spot_mistake':
        return {
          content_with_mistake: contentWithMistake.trim(),
          correct_version: correctVersion.trim(),
          hint: hint.trim(),
        };
      case 'arrange_steps':
        return {
          steps: steps.filter((s) => s.trim()),
          correct_order: steps.filter((s) => s.trim()),
        };
      case 'socratic_question':
        return {
          question_text: questionText.trim(),
          question_type: 'mcq',
          options: options.filter((o) => o.trim()),
        };
      case 'confidence_reflection':
        return {
          question_text: questionText.trim(),
          options: options.filter((o) => o.trim()),
        };
      case 'teach_back':
        return {
          topic: topic.trim(),
          guiding_prompt: guidingPrompt.trim(),
        };
      default:
        return {};
    }
  };

  const isConfigValid = () => {
    if (!selectedActivity) return false;
    const id = selectedActivity.id;
    switch (id) {
      case 'quick_poll':
        return questionText.trim() && options.filter((o) => o.trim()).length >= 2;
      case 'concept_check':
        if (trueFalseMode) return questionText.trim() && correctAnswer;
        return questionText.trim() && options.filter((o) => o.trim()).length >= 2 && correctAnswer;
      case 'predict_reveal':
        return promptText.trim() && correctAnswer.trim();
      case 'spot_mistake':
        return contentWithMistake.trim() && correctVersion.trim();
      case 'arrange_steps':
        return steps.filter((s) => s.trim()).length >= 2;
      case 'socratic_question':
        return questionText.trim();
      case 'confidence_reflection':
        return questionText.trim();
      case 'teach_back':
        return topic.trim();
      default:
        return false;
    }
  };

  const handleLaunch = async () => {
    if (!selectedActivity || !isConfigValid() || launching) return;
    setLaunching(true);
    try {
      const config = buildActivityConfig();
      await onLaunchActivity(selectedActivity.id, config);
      onClose();
    } catch (err) {
      alert(err.message || 'Failed to launch activity');
    } finally {
      setLaunching(false);
    }
  };

  const renderConfigForm = () => {
    if (!selectedActivity) return null;
    const id = selectedActivity.id;
    const catMeta = CATEGORY_META[selectedActivity.category];

    return (
      <div className="activity-config-form">
        <div className="activity-config-header" style={{ borderLeftColor: catMeta.color }}>
          <div className="activity-config-title-row">
            {(() => {
              const Icon = ICON_MAP[selectedActivity.icon] || HelpCircle;
              return <Icon size={20} style={{ color: catMeta.color }} />;
            })()}
            <h3>{selectedActivity.name}</h3>
            <span className="activity-time-badge" style={{ background: catMeta.bg, color: catMeta.color }}>
              <Clock size={12} /> {selectedActivity.estimatedTime}
            </span>
          </div>
          <p className="activity-config-desc">{selectedActivity.description}</p>
        </div>

        <div className="activity-config-body">
          {/* Quick Poll */}
          {id === 'quick_poll' && (
            <>
              <label className="config-label">Poll Question</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="e.g., Which topic would you like to review?"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
              <div className="config-checkbox-row">
                <label>
                  <input type="checkbox" checked={allowMultiple} onChange={(e) => setAllowMultiple(e.target.checked)} />
                  Allow multiple selections
                </label>
              </div>
              <label className="config-label mt-2">Poll Options</label>
              {renderOptionsEditor()}
            </>
          )}

          {/* Concept Check */}
          {id === 'concept_check' && (
            <>
              <label className="config-label">Question</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="e.g., Which data structure uses FIFO ordering?"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
              <div className="config-checkbox-row">
                <label>
                  <input type="checkbox" checked={trueFalseMode} onChange={(e) => setTrueFalseMode(e.target.checked)} />
                  True / False mode
                </label>
              </div>
              {trueFalseMode ? (
                <div className="config-tf-row">
                  <label className="config-label">Correct Answer</label>
                  <div className="config-radio-group">
                    <label className={`config-radio-opt ${correctAnswer === 'True' ? 'selected' : ''}`}>
                      <input type="radio" name="tf" value="True" checked={correctAnswer === 'True'} onChange={(e) => setCorrectAnswer(e.target.value)} />
                      True
                    </label>
                    <label className={`config-radio-opt ${correctAnswer === 'False' ? 'selected' : ''}`}>
                      <input type="radio" name="tf" value="False" checked={correctAnswer === 'False'} onChange={(e) => setCorrectAnswer(e.target.value)} />
                      False
                    </label>
                  </div>
                </div>
              ) : (
                <>
                  <label className="config-label mt-2">Options (mark correct)</label>
                  {renderOptionsEditorWithCorrect()}
                </>
              )}
            </>
          )}

          {/* Predict & Reveal */}
          {id === 'predict_reveal' && (
            <>
              <label className="config-label">Prediction Prompt</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="e.g., What do you think will happen when we double the input size?"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <label className="config-label mt-2">Correct Answer / Outcome</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="The actual outcome or correct answer..."
                value={correctAnswer}
                onChange={(e) => setCorrectAnswer(e.target.value)}
              />
              <label className="config-label mt-2">Explanation (optional)</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="Why this is the correct outcome..."
                value={explanation}
                onChange={(e) => setExplanation(e.target.value)}
              />
            </>
          )}

          {/* Spot the Mistake */}
          {id === 'spot_mistake' && (
            <>
              <label className="config-label">Content with Mistake</label>
              <textarea
                className="config-textarea"
                rows={3}
                placeholder="Paste the content that contains a deliberate mistake..."
                value={contentWithMistake}
                onChange={(e) => setContentWithMistake(e.target.value)}
              />
              <label className="config-label mt-2">Correct Version</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="The corrected version of the content..."
                value={correctVersion}
                onChange={(e) => setCorrectVersion(e.target.value)}
              />
              <label className="config-label mt-2">Hint (optional)</label>
              <input
                className="config-input"
                type="text"
                placeholder="e.g., Look at line 3..."
                value={hint}
                onChange={(e) => setHint(e.target.value)}
              />
            </>
          )}

          {/* Arrange the Steps */}
          {id === 'arrange_steps' && (
            <>
              <label className="config-label">Steps (in correct order)</label>
              <p className="config-hint">Enter steps in the correct sequence. Students will see them shuffled.</p>
              {renderStepsEditor()}
            </>
          )}

          {/* Socratic Question */}
          {id === 'socratic_question' && (
            <>
              <label className="config-label">Socratic Question</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="e.g., What is the primary factor driving this algorithm's complexity?"
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
              <label className="config-label mt-2">MCQ Options</label>
              {renderOptionsEditor()}
            </>
          )}

          {/* Confidence + Reflection */}
          {id === 'confidence_reflection' && (
            <>
              <label className="config-label">Question</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="e.g., Explain the difference between a stack and a queue..."
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value)}
              />
              <label className="config-label mt-2">Answer Options (optional MCQ)</label>
              {renderOptionsEditor()}
            </>
          )}

          {/* Teach-Back */}
          {id === 'teach_back' && (
            <>
              <label className="config-label">Topic / Concept</label>
              <input
                className="config-input"
                type="text"
                placeholder="e.g., Binary Search Tree Insertion"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
              />
              <label className="config-label mt-2">Guiding Prompt (optional)</label>
              <textarea
                className="config-textarea"
                rows={2}
                placeholder="e.g., Explain as if teaching a first-year student..."
                value={guidingPrompt}
                onChange={(e) => setGuidingPrompt(e.target.value)}
              />
            </>
          )}
        </div>

        <div className="activity-config-footer">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setSelectedActivity(null)}
          >
            ← Back to Activities
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleLaunch}
            disabled={!isConfigValid() || launching}
          >
            <Play size={15} /> {launching ? 'Launching...' : 'Launch Activity'}
          </button>
        </div>
      </div>
    );
  };

  const renderOptionsEditor = () => (
    <div className="config-options-list">
      {options.map((opt, idx) => (
        <div key={idx} className="config-option-row">
          <span className="config-opt-letter">{String.fromCharCode(65 + idx)}</span>
          <input
            type="text"
            className="config-input"
            value={opt}
            onChange={(e) => handleOptionChange(idx, e.target.value)}
            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
          />
          {options.length > 2 && (
            <button type="button" className="config-opt-remove" onClick={() => handleRemoveOption(idx)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {options.length < 6 && (
        <button type="button" className="btn btn-ghost btn-xs mt-1" onClick={handleAddOption}>
          <Plus size={13} /> Add Option
        </button>
      )}
    </div>
  );

  const renderOptionsEditorWithCorrect = () => (
    <div className="config-options-list">
      {options.map((opt, idx) => (
        <div key={idx} className="config-option-row">
          <label className={`config-correct-radio ${correctAnswer === opt ? 'is-correct' : ''}`}>
            <input
              type="radio"
              name="correct"
              checked={correctAnswer === opt}
              onChange={() => setCorrectAnswer(opt)}
            />
            <CheckCircle2 size={15} />
          </label>
          <input
            type="text"
            className="config-input"
            value={opt}
            onChange={(e) => {
              if (correctAnswer === opt) setCorrectAnswer(e.target.value);
              handleOptionChange(idx, e.target.value);
            }}
            placeholder={`Option ${String.fromCharCode(65 + idx)}`}
          />
          {options.length > 2 && (
            <button type="button" className="config-opt-remove" onClick={() => handleRemoveOption(idx)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {options.length < 6 && (
        <button type="button" className="btn btn-ghost btn-xs mt-1" onClick={handleAddOption}>
          <Plus size={13} /> Add Option
        </button>
      )}
    </div>
  );

  const renderStepsEditor = () => (
    <div className="config-steps-list">
      {steps.map((step, idx) => (
        <div key={idx} className="config-step-row">
          <span className="config-step-num">{idx + 1}</span>
          <input
            type="text"
            className="config-input"
            value={step}
            onChange={(e) => handleStepChange(idx, e.target.value)}
            placeholder={`Step ${idx + 1}`}
          />
          <div className="config-step-arrows">
            <button type="button" disabled={idx === 0} onClick={() => moveStep(idx, -1)} className="config-arrow-btn">
              <ChevronUp size={14} />
            </button>
            <button type="button" disabled={idx === steps.length - 1} onClick={() => moveStep(idx, 1)} className="config-arrow-btn">
              <ChevronDown size={14} />
            </button>
          </div>
          {steps.length > 2 && (
            <button type="button" className="config-opt-remove" onClick={() => handleRemoveStep(idx)}>
              <Trash2 size={13} />
            </button>
          )}
        </div>
      ))}
      {steps.length < 8 && (
        <button type="button" className="btn btn-ghost btn-xs mt-1" onClick={handleAddStep}>
          <Plus size={13} /> Add Step
        </button>
      )}
    </div>
  );

  return (
    <div className="activity-selector-backdrop" onClick={onClose}>
      <div className="activity-selector-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="activity-modal-header">
          <div className="activity-modal-title-row">
            <Sparkles size={22} className="activity-modal-icon" />
            <div>
              <h2>Intervention Activity Library</h2>
              <p>Choose a pedagogical activity for class <strong>{classCode}</strong></p>
            </div>
          </div>
          <button type="button" className="activity-modal-close" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {selectedActivity ? (
          renderConfigForm()
        ) : (
          <>
            {/* Category Tabs */}
            <div className="activity-category-tabs">
              {Object.entries(CATEGORY_META).map(([key, meta]) => {
                const CatIcon = meta.icon;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`activity-category-tab ${selectedCategory === key ? 'active' : ''}`}
                    onClick={() => setSelectedCategory(key)}
                    style={selectedCategory === key ? { borderBottomColor: meta.color, color: meta.color } : {}}
                  >
                    <CatIcon size={16} />
                    <span>{meta.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Category Description */}
            <div className="activity-category-desc" style={{ background: CATEGORY_META[selectedCategory].bg }}>
              <p style={{ color: CATEGORY_META[selectedCategory].color }}>
                {CATEGORY_META[selectedCategory].description}
              </p>
            </div>

            {/* Activity Cards Grid */}
            <div className="activity-cards-grid">
              {filteredActivities.map((activity) => {
                const Icon = ICON_MAP[activity.icon] || HelpCircle;
                const catMeta = CATEGORY_META[activity.category];
                return (
                  <button
                    key={activity.id}
                    type="button"
                    className="activity-card"
                    onClick={() => setSelectedActivity(activity)}
                  >
                    <div className="activity-card-icon" style={{ background: catMeta.bg, color: catMeta.color }}>
                      <Icon size={24} />
                    </div>
                    <div className="activity-card-body">
                      <h4>{activity.name}</h4>
                      <p>{activity.description}</p>
                    </div>
                    <div className="activity-card-footer">
                      <span className="activity-time-badge" style={{ background: catMeta.bg, color: catMeta.color }}>
                        <Clock size={11} /> {activity.estimatedTime}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
