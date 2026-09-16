import { useState, useEffect, useCallback } from 'react';
import '../styles/calm-focus.css';
import { apiFetch } from '../api';

import StudentSidebar from './student/StudentSidebar';
import StudentHeader from './student/StudentHeader';
import LearningProgress from './student/LearningProgress';
import ActiveSessionCard from './student/ActiveSessionCard';
import CourseCardsGrid from './student/CourseCardsGrid';
import FocusInsightsCard from './student/FocusInsightsCard';
import NotificationsPanel from './student/NotificationsPanel';
import StudentProfileModal from './student/StudentProfileModal';

export default function StudentApp({ initialClassCode = 'CS101', initialRollNumber = 'STUDENT-01', urlSessionId, urlJoinToken, onToggleTeacherMode }) {
  const [activeTab, setActiveTab] = useState(urlSessionId ? 'socratic' : 'overview');
  const [classCode, setClassCode] = useState(initialClassCode);
  const [rollNumber, setRollNumber] = useState(initialRollNumber);

  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Active Session & Socratic State
  const [activeSession, setActiveSession] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [submittedAnswers, setSubmittedAnswers] = useState({});
  const [studentSessionState, setStudentSessionState] = useState('ACTIVE');

  // Notification State
  const [notification, setNotification] = useState(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);

  // Join a specific session (from URL deep link or active check)
  const joinSessionById = useCallback(async (sid, token) => {
    try {
      const resp = await apiFetch(`/api/socratic/sessions/${sid}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          join_token: token || urlJoinToken,
          roll_number: rollNumber.trim() || 'STUDENT-01',
          class_code: classCode
        })
      });

      if (resp && resp.session_id) {
        setActiveSession({
          session_id: resp.session_id,
          class_code: resp.class_code,
          status: resp.status,
          activity_type: resp.activity_type || 'socratic_question',
          activity_config: resp.activity_config || {},
          activity_response: resp.activity_response || null,
        });
        setStudentSessionState(resp.state || 'ACTIVE');

        if (resp.question) {
          setCurrentQuestion(resp.question);
          setQuestions([resp.question]);
          if (resp.attempt1) {
            setSubmittedAnswers((prev) => ({
              ...prev,
              [resp.question.id]: {
                answer_text: resp.attempt1.answer_text,
                selected_option: resp.attempt1.selected_option,
                confidence_level: resp.attempt1.confidence_level,
                selected_reflection_option: resp.attempt2?.selected_reflection_option,
                reflection_text: resp.attempt2?.reflection_text,
                submitted_at: 'Restored'
              }
            }));
          }
        }
      }
    } catch (err) {
      console.error('Error joining Socratic session:', err);
    }
  }, [classCode, rollNumber, urlJoinToken]);

  // Handle deep link landing
  useEffect(() => {
    if (urlSessionId) {
      joinSessionById(urlSessionId, urlJoinToken);
    }
  }, [urlSessionId, urlJoinToken, joinSessionById]);

  // Poll Active Socratic Session from backend API if no deep link session is set
  const checkActiveSession = useCallback(async () => {
    if (urlSessionId || !classCode) return;
    try {
      const data = await apiFetch(`/api/socratic/session/active?class_code=${encodeURIComponent(classCode)}`);
      if (data && data.session) {
        const isNewSession = !activeSession || activeSession.session_id !== data.session.session_id;
        setActiveSession(data.session);
        setQuestions(data.questions || []);

        const latestQ = data.questions && data.questions.length > 0 ? data.questions[data.questions.length - 1] : null;
        if (!currentQuestion && latestQ) {
          setCurrentQuestion(latestQ);
        }

        if (isNewSession) {
          const isCustomActivity = data.session.activity_type && data.session.activity_type !== 'socratic_question';
          setNotification({
            type: 'session_started',
            title: isCustomActivity ? 'Class Activity Active!' : 'Socratic Session Active!',
            message: `Your teacher started an activity for ${classCode.toUpperCase()}.`,
          });
        }
      } else if (!urlSessionId) {
        setActiveSession(null);
        setQuestions([]);
        setCurrentQuestion(null);
        setNotification(null);
      }
    } catch (err) {
      console.error('Error checking Socratic session:', err);
    }
  }, [classCode, activeSession, currentQuestion, urlSessionId]);

  useEffect(() => {
    checkActiveSession();
    const interval = setInterval(checkActiveSession, 4000);
    return () => clearInterval(interval);
  }, [checkActiveSession]);

  // Stage 1: Think Answer
  const handleSubmitAnswer = async ({ questionId, answer, selectedOption, confidence }) => {
    if (!activeSession) return;
    const resp = await apiFetch(`/api/socratic/sessions/${activeSession.session_id}/think`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roll_number: rollNumber.trim() || 'STUDENT-01',
        answer_text: answer,
        selected_option: selectedOption,
        confidence_level: confidence || 'Confident'
      }),
    });

    if (resp && resp.status === 'ok') {
      setStudentSessionState(resp.state || 'THINK_SUBMITTED');
      setSubmittedAnswers((prev) => ({
        ...prev,
        [questionId]: {
          answer_id: resp.answer_id,
          answer_text: answer,
          selected_option: selectedOption,
          confidence_level: confidence || 'Confident',
          submitted_at: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      }));
    }
  };

  // Stage 2: Compare Distribution
  const handleFetchCompare = async () => {
    if (!activeSession) return null;
    const resp = await apiFetch(`/api/socratic/sessions/${activeSession.session_id}/compare?roll_number=${encodeURIComponent(rollNumber)}`);
    if (resp && resp.state) {
      setStudentSessionState(resp.state);
    }
    return resp;
  };

  // Stage 3: Reflect & Stage 4: Reassess
  const handleSubmitReflection = async ({ questionId, reflectionText, selectedOption, confidence }) => {
    if (!activeSession) return;

    // Submit Reflect Stage
    await apiFetch(`/api/socratic/sessions/${activeSession.session_id}/reflect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roll_number: rollNumber.trim() || 'STUDENT-01',
        reflection_text: reflectionText,
        selected_option: selectedOption,
        confidence_level: confidence || 'Confident'
      }),
    });

    // Submit Reassess Stage
    const reassessResp = await apiFetch(`/api/socratic/sessions/${activeSession.session_id}/reassess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roll_number: rollNumber.trim() || 'STUDENT-01',
        answer_text: reflectionText || selectedOption,
        selected_option: selectedOption,
        confidence_level: confidence || 'Confident'
      }),
    });

    // Mark Complete
    await apiFetch(`/api/socratic/sessions/${activeSession.session_id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roll_number: rollNumber.trim() || 'STUDENT-01'
      })
    });

    setStudentSessionState('COMPLETED');
    setSubmittedAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        reflection_text: reflectionText,
        selected_reflection_option: selectedOption,
        revised_confidence: confidence,
        completed: true
      },
    }));
  };


  const handleSelectTab = (tabId) => {
    if (tabId === 'profile') {
      setIsProfileModalOpen(true);
    } else {
      setActiveTab(tabId);
    }
  };

  return (
    <div className="calm-dashboard-shell">
      {/* Calm Focus Sidebar */}
      <StudentSidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        rollNumber={rollNumber}
        onOpenProfile={() => setIsProfileModalOpen(true)}
        unreadCount={notification ? 1 : 0}
        isMobileOpen={isMobileOpen}
        onCloseMobile={() => setIsMobileOpen(false)}
      />

      {/* Main Content Area */}
      <div className="calm-main-area">
        {/* Header */}
        <StudentHeader
          rollNumber={rollNumber}
          classCode={classCode}
          onChangeClassCode={setClassCode}
          unreadCount={notification ? 1 : 0}
          onOpenNotifications={() => setActiveTab('notifications')}
          onOpenProfile={() => setIsProfileModalOpen(true)}
          onToggleTeacherMode={onToggleTeacherMode}
          onToggleMobileMenu={() => setIsMobileOpen((prev) => !prev)}
        />

        {/* Dashboard Views Container */}
        <main className="calm-content-container">
          {activeTab === 'overview' && (
            <>
              {/* Learning Progress Cards */}
              <LearningProgress />

              {/* Live Session Teaser or Active Session Workspace */}
              <ActiveSessionCard
                activeSession={activeSession}
                questions={questions}
                currentQuestion={currentQuestion}
                onSelectQuestion={setCurrentQuestion}
                submittedAnswers={submittedAnswers}
                onSubmitAnswer={handleSubmitAnswer}
                onFetchCompare={handleFetchCompare}
                onSubmitReflection={handleSubmitReflection}
                studentSessionState={studentSessionState}
                rollNumber={rollNumber}
                classCode={classCode}
                activityType={activeSession?.activity_type}
                activityConfig={activeSession?.activity_config}
                activityResponse={activeSession?.activity_response}
              />

              {/* Main Grid: Enrolled Courses & Focus Insights */}
              <div className="calm-dashboard-layout">
                <CourseCardsGrid
                  onSelectCourse={(code) => setClassCode(code)}
                  onLaunchSession={(code) => {
                    setClassCode(code);
                    setActiveTab('session');
                  }}
                />
                <FocusInsightsCard />
              </div>
            </>
          )}

          {(activeTab === 'session' || activeTab === 'socratic') && (
            <ActiveSessionCard
              activeSession={activeSession}
              questions={questions}
              currentQuestion={currentQuestion}
              onSelectQuestion={setCurrentQuestion}
              submittedAnswers={submittedAnswers}
              onSubmitAnswer={handleSubmitAnswer}
              onFetchCompare={handleFetchCompare}
              onSubmitReflection={handleSubmitReflection}
              studentSessionState={studentSessionState}
              rollNumber={rollNumber}
              classCode={classCode}
              activityType={activeSession?.activity_type}
              activityConfig={activeSession?.activity_config}
              activityResponse={activeSession?.activity_response}
            />
          )}


          {activeTab === 'courses' && (
            <CourseCardsGrid
              onSelectCourse={(code) => setClassCode(code)}
              onLaunchSession={(code) => {
                setClassCode(code);
                setActiveTab('session');
              }}
            />
          )}

          {activeTab === 'insights' && (
            <FocusInsightsCard />
          )}

          {activeTab === 'notifications' && (
            <NotificationsPanel
              onJoinSession={(code) => {
                setClassCode(code);
                setActiveTab('session');
              }}
            />
          )}
        </main>
      </div>

      {/* Student Profile Modal */}
      <StudentProfileModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
        rollNumber={rollNumber}
        setRollNumber={setRollNumber}
        classCode={classCode}
        setClassCode={setClassCode}
      />
    </div>
  );
}
