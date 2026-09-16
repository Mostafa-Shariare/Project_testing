// frontend/src/utils/notification_service.js

/**
 * Handles incoming Socratic WebSocket events and updates LiveMonitor state.
 * @param {string} event - Event name (e.g., 'socratic_start').
 * @param {object} payload - Full message payload from server.
 * @param {object} callbacks - State setters from LiveMonitor.
 */
export function handleSocraticEvent(event, payload, callbacks) {
  const {
    setSocraticSessionId,
    setShowTeacherPanel,
    setShowStudentPanel,
    setQuestion,
    setAnswers,
  } = callbacks;

  switch (event) {
    case 'socratic_start':
      if (payload.session_id) {
        setSocraticSessionId(payload.session_id);
        setShowStudentPanel(true);
      }
      break;
    case 'socratic_question':
      setQuestion(payload.question || '');
      setAnswers([]);
      setShowStudentPanel(true);
      break;
    case 'socratic_answer':
      setAnswers((prev) => [...prev, payload.answer]);
      break;
    case 'socratic_reflection':
      setAnswers((prev) => [...prev, `Reflection: ${payload.reflection}`]);
      break;
    default:
      // ignore unknown events
      break;
  }
}
