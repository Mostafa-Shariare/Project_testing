// ── Visoria Electron Tracker — Renderer Process ────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const statusPill = document.getElementById('statusPill');
  const statusText = document.getElementById('statusText');
  const btnOpenStudentApp = document.getElementById('btnOpenStudentApp');

  // Socratic Banner
  const socraticBanner = document.getElementById('socraticBanner');
  const socraticTitle = document.getElementById('socraticTitle');
  const socraticDesc = document.getElementById('socraticDesc');
  const btnJoinSocratic = document.getElementById('btnJoinSocratic');

  // Camera & HUD
  const cameraFeed = document.getElementById('cameraFeed');
  const cameraPlaceholder = document.getElementById('cameraPlaceholder');
  const hudOverlayTag = document.getElementById('hudOverlayTag');
  const hudAlertChip = document.getElementById('hudAlertChip');
  const hudAlertText = document.getElementById('hudAlertText');
  const fpsReadout = document.getElementById('fpsReadout');

  const btnStartStop = document.getElementById('btnStartStop');
  const btnPauseCamera = document.getElementById('btnPauseCamera');
  const hudButtons = document.querySelectorAll('.hud-toggle-chip');

  // Telemetry Elements
  const attentionStateBadge = document.getElementById('attentionStateBadge');
  const attentionLabel = document.getElementById('attentionLabel');
  const attentionPct = document.getElementById('attentionPct');
  const gaugeFill = document.getElementById('gaugeFill');
  const probSmoothedVal = document.getElementById('probSmoothedVal');
  const probRawVal = document.getElementById('probRawVal');

  const metricGaze = document.getElementById('metricGaze');
  const metricBlinks = document.getElementById('metricBlinks');
  const metricPose = document.getElementById('metricPose');
  const metricPhone = document.getElementById('metricPhone');

  // Config Elements
  const inputName = document.getElementById('inputName');
  const inputRoll = document.getElementById('inputRoll');
  const inputClass = document.getElementById('inputClass');
  const inputJoinCode = document.getElementById('inputJoinCode');
  const inputServer = document.getElementById('inputServer');
  const btnSaveConfig = document.getElementById('btnSaveConfig');
  const saveStatusTag = document.getElementById('saveStatusTag');

  // Internal State
  let isTracking = false;
  let isCameraPaused = false;
  let activeSocraticSession = null;
  let lastFrameTime = performance.now();
  let frameCount = 0;
  let currentFps = 0;

  // Load Saved Configuration
  try {
    const cfg = await window.electronAPI.loadConfig();
    if (cfg) {
      inputName.value = cfg.student_name || 'Student';
      inputRoll.value = cfg.roll_number || 'ROLL001';
      inputClass.value = cfg.class_code || 'CS101';
      inputJoinCode.value = cfg.join_code || '';
      inputServer.value = cfg.server_url || 'http://localhost:8000';
    }
  } catch (err) {
    console.error('Failed to load initial configuration:', err);
  }

  // Helper to read current config from inputs
  function getCurrentConfig() {
    return {
      student_name: inputName.value.trim() || 'Student',
      roll_number: inputRoll.value.trim().toUpperCase() || 'ROLL001',
      class_code: inputClass.value.trim().toUpperCase() || 'CS101',
      join_code: inputJoinCode.value.trim().toUpperCase() || '',
      server_url: inputServer.value.trim() || 'http://localhost:8000',
    };
  }

  // Save Config Action
  btnSaveConfig.addEventListener('click', async () => {
    const cfg = getCurrentConfig();
    const res = await window.electronAPI.saveConfig(cfg);
    if (res && res.ok) {
      saveStatusTag.textContent = 'Settings saved!';
      saveStatusTag.style.color = 'var(--emerald)';
      setTimeout(() => { saveStatusTag.textContent = ''; }, 2000);
    } else {
      saveStatusTag.textContent = 'Save error';
      saveStatusTag.style.color = 'var(--rose)';
    }
  });

  // Open Student Web App button
  btnOpenStudentApp.addEventListener('click', () => {
    const cfg = getCurrentConfig();
    const targetUrl = `http://localhost:5173/?mode=student&class_code=${encodeURIComponent(cfg.class_code)}&roll=${encodeURIComponent(cfg.roll_number)}`;
    window.electronAPI.openStudentApp(targetUrl);
  });

  // HUD Toggles
  hudButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      const toggles = {};
      hudButtons.forEach((b) => {
        toggles[b.dataset.hud] = b.classList.contains('active');
      });
      window.electronAPI.updateHud(toggles);
    });
  });

  // Start / Stop Tracking
  btnStartStop.addEventListener('click', () => {
    if (isTracking) {
      window.electronAPI.stopTracking();
      setTrackingUIState(false);
    } else {
      const cfg = getCurrentConfig();
      window.electronAPI.saveConfig(cfg);
      window.electronAPI.startTracking(cfg);
      statusText.textContent = 'Verifying with server...';
    }
  });

  // Pause / Resume Camera (Privacy Mode)
  btnPauseCamera.addEventListener('click', () => {
    if (!isTracking) return;
    isCameraPaused = !isCameraPaused;
    window.electronAPI.togglePause(isCameraPaused);
    if (isCameraPaused) {
      btnPauseCamera.classList.add('active');
      btnPauseCamera.querySelector('span').textContent = 'Resume Camera';
      statusPill.classList.remove('live');
      statusPill.classList.add('paused');
      statusText.textContent = 'Camera Paused (Privacy)';
    } else {
      btnPauseCamera.classList.remove('active');
      btnPauseCamera.querySelector('span').textContent = 'Pause Camera';
      statusPill.classList.remove('paused');
      statusPill.classList.add('live');
      statusText.textContent = 'Live Session Active';
    }
  });

  // Join Socratic Session from Alert Banner
  btnJoinSocratic.addEventListener('click', () => {
    if (!activeSocraticSession) return;
    const cfg = getCurrentConfig();
    const sid = activeSocraticSession.session_id;
    const token = activeSocraticSession.join_token || '';
    const tokenParam = token ? `&join_token=${encodeURIComponent(token)}` : '';
    const targetUrl = `http://localhost:5173/?mode=student&session_id=${encodeURIComponent(sid)}${tokenParam}&class_code=${encodeURIComponent(cfg.class_code)}&roll=${encodeURIComponent(cfg.roll_number)}`;
    window.electronAPI.openStudentApp(targetUrl);
    socraticBanner.classList.remove('active');
  });

  function setTrackingUIState(tracking) {
    isTracking = tracking;
    const placeholderText = cameraPlaceholder.querySelector('span');
    if (tracking) {
      btnStartStop.classList.remove('btn-primary-emerald');
      btnStartStop.classList.add('btn-stop-rose');
      btnStartStop.querySelector('span').textContent = 'Stop Tracking';
      btnStartStop.querySelector('svg').innerHTML = '<rect x="6" y="6" width="12" height="12"></rect>';
      btnPauseCamera.disabled = false;
      statusPill.classList.add('live');
      statusText.textContent = 'Live Session Active';
      if (placeholderText) placeholderText.textContent = 'Connecting to camera hardware...';
    } else {
      btnStartStop.classList.remove('btn-stop-rose');
      btnStartStop.classList.add('btn-primary-emerald');
      btnStartStop.querySelector('span').textContent = 'Start Tracking';
      btnStartStop.querySelector('svg').innerHTML = '<polygon points="5 3 19 12 5 21 5 3"></polygon>';
      btnPauseCamera.disabled = true;
      btnPauseCamera.classList.remove('active');
      btnPauseCamera.querySelector('span').textContent = 'Pause Camera';
      isCameraPaused = false;
      statusPill.classList.remove('live', 'paused');
      statusText.textContent = 'Engine Standby';
      cameraPlaceholder.style.display = 'flex';
      if (placeholderText) placeholderText.textContent = 'Tracking paused or stopped. Click "Start Tracking" below.';
      cameraFeed.style.display = 'none';
      cameraFeed.src = '';
      hudOverlayTag.style.display = 'none';
      hudAlertChip.classList.remove('active');
      fpsReadout.textContent = '0 FPS';
    }
  }

  // Handle Engine Data from Python Bridge
  window.electronAPI.onEngineData((msg) => {
    if (!msg) return;

    if (msg.type === 'started') {
      setTrackingUIState(true);
    } else if (msg.type === 'stopped') {
      setTrackingUIState(false);
    } else if (msg.type === 'error') {
      setTrackingUIState(false);
      statusText.textContent = `Error: ${msg.message || 'Tracker error'}`;
      const placeholderText = cameraPlaceholder.querySelector('span');
      if (placeholderText) placeholderText.textContent = msg.message || 'Engine encountered an error.';
    } else if (msg.type === 'join_denied') {
      setTrackingUIState(false);
      statusText.textContent = `Join Failed: ${msg.error || 'Denied'}`;
      alert(`Join Denied by Server:\n${msg.error || 'Please verify Class Code and Join Code.'}`);
    } else if (msg.type === 'status') {
      statusText.textContent = msg.message || 'Connecting...';
    } else if (msg.type === 'frame') {
      // Render Frame
      if (msg.image) {
        cameraFeed.src = msg.image;
        cameraPlaceholder.style.display = 'none';
        cameraFeed.style.display = 'block';
        hudOverlayTag.style.display = 'inline-flex';
        if (!isTracking) setTrackingUIState(true);
      }

      // FPS Calculation
      frameCount++;
      const now = performance.now();
      if (now - lastFrameTime >= 1000) {
        currentFps = frameCount;
        frameCount = 0;
        lastFrameTime = now;
        fpsReadout.textContent = `${currentFps} FPS`;
      }

      // Telemetry Data Update
      const tel = msg.telemetry;
      if (tel) {
        // Attention Score & Gauge
        const probSmooth = tel.model_prob_smoothed || 0;
        const pct = Math.round(probSmooth * 100);
        attentionPct.textContent = `${pct}%`;
        gaugeFill.style.width = `${pct}%`;
        probSmoothedVal.textContent = probSmooth.toFixed(2);
        probRawVal.textContent = (tel.model_prob_raw || 0).toFixed(2);

        if (tel.is_paused) {
          attentionLabel.textContent = 'Camera Paused';
          attentionStateBadge.textContent = 'PRIVACY MODE';
          attentionStateBadge.style.color = 'var(--amber)';
        } else if (tel.alert === 'NO FACE DETECTED') {
          attentionLabel.textContent = 'No Face in View';
          attentionStateBadge.textContent = 'UNTRACKED';
          attentionStateBadge.style.color = 'var(--text-tertiary)';
        } else if (probSmooth >= 0.5) {
          attentionLabel.textContent = 'Attentive';
          attentionStateBadge.textContent = 'STABLE FOCUS';
          attentionStateBadge.style.color = 'var(--emerald)';
        } else {
          attentionLabel.textContent = 'Attention Shift';
          attentionStateBadge.textContent = 'ATTENTION SHIFT';
          attentionStateBadge.style.color = 'var(--amber)';
        }

        // HUD Alert Chip
        if (tel.alert && !tel.is_paused) {
          hudAlertChip.classList.add('active');
          hudAlertText.textContent = tel.alert;
        } else {
          hudAlertChip.classList.remove('active');
        }

        // Biometrics
        metricGaze.textContent = tel.gaze || 'Center';
        metricBlinks.textContent = `${tel.blinks_per_min || 0} BPM (${tel.blinks || 0})`;
        metricPose.textContent = `P: ${tel.pose_pitch}° · Y: ${tel.pose_yaw}° · R: ${tel.pose_roll}°`;
        
        if (tel.phone_detected) {
          metricPhone.textContent = 'Phone Detected';
          metricPhone.style.color = 'var(--rose)';
        } else {
          metricPhone.textContent = 'Clear';
          metricPhone.style.color = 'var(--emerald)';
        }

        if (tel.status) {
          statusText.textContent = tel.status;
        }
      }

      // Socratic Intervention Check
      if (msg.socratic && msg.socratic.active) {
        activeSocraticSession = msg.socratic;
        socraticBanner.classList.add('active');
        if (msg.socratic.question && msg.socratic.question.prompt) {
          socraticDesc.textContent = msg.socratic.question.prompt;
        }
      } else {
        activeSocraticSession = null;
        socraticBanner.classList.remove('active');
      }
    }
  });

  // Engine Error Listener
  window.electronAPI.onEngineError((err) => {
    console.warn('[Engine Error]', err);
  });
});
