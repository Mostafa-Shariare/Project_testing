import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '../api';

export function useStudentActions(classCode) {
  const [actions, setActions] = useState({});

  const load = useCallback(async () => {
    if (!classCode) return;
    try {
      const rows = await apiFetch(
        `/api/classes/${encodeURIComponent(classCode)}/student-actions`,
      );
      const map = {};
      rows.forEach((r) => {
        map[r.roll_number] = r;
      });
      setActions(map);
    } catch {
      setActions({});
    }
  }, [classCode]);

  useEffect(() => {
    load();
  }, [load]);

  const runAction = useCallback(
    async (rollNumber, action, note = '') => {
      const data = await apiFetch(
        `/api/classes/${encodeURIComponent(classCode)}/students/${encodeURIComponent(rollNumber)}/actions`,
        {
          method: 'POST',
          body: JSON.stringify({ action, note }),
        },
      );
      setActions((prev) => ({
        ...prev,
        [rollNumber]: {
          roll_number: rollNumber,
          excused: data.excused,
          suppress_alerts: data.suppress_alerts,
          action_log: data.action_log,
        },
      }));
      return data;
    },
    [classCode],
  );

  const getState = useCallback(
    (roll) => actions[roll] || { excused: false, suppress_alerts: false, action_log: [] },
    [actions],
  );

  return { actions, getState, runAction, reload: load };
}
