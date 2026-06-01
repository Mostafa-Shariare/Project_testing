// ==========================================================================
// Attention Monitor - Teacher Dashboard Logic
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const wsStatusDot = document.getElementById('ws-status-dot');
    const wsStatusText = document.getElementById('ws-status-text');
    const resetBtn = document.getElementById('reset-btn');
    const studentGrid = document.getElementById('student-grid');
    const emptyGridMsg = document.getElementById('empty-grid-msg');
    
    const kpiTotalStudents = document.getElementById('kpi-total-students');
    const kpiAvgAttention = document.getElementById('kpi-avg-attention');
    const kpiAttentionBar = document.getElementById('kpi-attention-bar');
    const kpiAttentiveRatio = document.getElementById('kpi-attentive-ratio');
    const kpiActiveAlerts = document.getElementById('kpi-active-alerts');
    
    const studentSearch = document.getElementById('student-search');
    const alertsFeed = document.getElementById('alerts-feed');
    const emptyAlertsMsg = document.getElementById('empty-alerts-msg');
    const alertsCountBadge = document.getElementById('alerts-count-badge');

    // State Variables
    let socket = null;
    let studentData = {};
    let searchFilter = "";
    let alertHistory = []; // Track recent alerts to prevent duplication in feed
    
    // Class-wide Attention Trend Chart
    const ctx = document.getElementById('class-chart').getContext('2d');
    const maxDataPoints = 30;
    const chartLabels = Array(maxDataPoints).fill('');
    const chartData = Array(maxDataPoints).fill(null);

    const classChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Class Avg Attention (%)',
                data: chartData,
                borderColor: '#5aa0f0',
                borderWidth: 2,
                pointRadius: 0,
                tension: 0.3,
                fill: true,
                backgroundColor: 'rgba(90, 160, 240, 0.1)'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { display: false },
                y: {
                    min: 0,
                    max: 100,
                    grid: { color: 'rgba(255, 255, 255, 0.05)' },
                    ticks: { color: '#7a7c8e', font: { family: 'monospace' } }
                }
            }
        }
    });

    // WebSocket Management & Reconnection
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/teacher`;
        
        wsStatusText.textContent = 'Connecting...';
        wsStatusDot.className = 'status-dot disconnected';

        socket = new WebSocket(wsUrl);

        socket.onopen = () => {
            wsStatusText.textContent = 'Live Connected';
            wsStatusDot.className = 'status-dot connected';
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            updateDashboard(data.students);
        };

        socket.onclose = () => {
            wsStatusText.textContent = 'Disconnected';
            wsStatusDot.className = 'status-dot disconnected';
            // Reconnect after 3 seconds
            setTimeout(connectWebSocket, 3000);
        };

        socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
            socket.close();
        };
    }

    // Reset Session API Request
    resetBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to reset the current session? This will clear all student history.')) {
            try {
                const response = await fetch('/api/session/reset');
                if (response.ok) {
                    studentData = {};
                    updateDashboard([]);
                    // Reset Chart
                    classChart.data.datasets[0].data.fill(null);
                    classChart.update();
                    // Clear Alerts Feed
                    alertsFeed.innerHTML = '';
                    alertsFeed.appendChild(emptyAlertsMsg);
                    emptyAlertsMsg.style.display = 'flex';
                    alertsCountBadge.textContent = '0';
                    alertHistory = [];
                }
            } catch (err) {
                console.error('Error resetting session:', err);
            }
        }
    });

    // Search Filtering
    studentSearch.addEventListener('input', (e) => {
        searchFilter = e.target.value.toLowerCase().trim();
        renderStudentCards();
    });

    // Update Dashboard Logic
    function updateDashboard(studentsList) {
        // Map list to dictionary of active and offline students
        const currentNames = new Set(studentsList.map(s => s.name));
        
        // Remove students that were deleted
        Object.keys(studentData).forEach(name => {
            if (!currentNames.has(name)) {
                delete studentData[name];
            }
        });

        // Update active students data
        studentsList.forEach(student => {
            studentData[student.name] = student;
        });

        // Compute Class-Wide KPIs
        const activeStudentsList = Object.values(studentData).filter(s => s.status === 'active');
        const totalCount = activeStudentsList.length;
        
        let avgScore = 0;
        let attentiveCount = 0;
        let activeAlertsCount = 0;

        if (totalCount > 0) {
            const sumScore = activeStudentsList.reduce((acc, curr) => acc + curr.attention, 0);
            avgScore = Math.round(sumScore / totalCount);
            
            attentiveCount = activeStudentsList.filter(s => s.model_pred_stable === 1).length;
            
            // Alerts are non-empty strings that aren't informational/session enders
            activeAlertsCount = activeStudentsList.filter(s => s.alert && s.alert !== '').length;
        }

        const attentiveRatio = totalCount > 0 ? Math.round((attentiveCount / totalCount) * 100) : 0;

        // Update KPI Texts
        kpiTotalStudents.textContent = totalCount;
        kpiAvgAttention.textContent = `${avgScore}%`;
        kpiAttentionBar.style.width = `${avgScore}%`;
        kpiAttentiveRatio.textContent = `${attentiveRatio}%`;
        kpiActiveAlerts.textContent = activeAlertsCount;

        // Color code KPIs based on average score
        const kpiCardAttention = document.getElementById('kpi-card-attention');
        if (avgScore >= 70) {
            kpiCardAttention.style.borderColor = 'rgba(72, 200, 122, 0.3)';
            kpiAttentionBar.style.backgroundColor = 'var(--color-success)';
        } else if (avgScore >= 40) {
            kpiCardAttention.style.borderColor = 'rgba(240, 165, 32, 0.3)';
            kpiAttentionBar.style.backgroundColor = 'var(--color-warning)';
        } else {
            kpiCardAttention.style.borderColor = 'rgba(224, 64, 64, 0.3)';
            kpiAttentionBar.style.backgroundColor = 'var(--color-danger)';
        }

        // Update Class Chart
        updateChart(totalCount > 0 ? avgScore : null);

        // Process active alerts for the live feed
        processAlertsFeed(activeStudentsList);

        // Render Cards
        renderStudentCards();
    }

    // Process & Add alerts to the sidebar feed
    function processAlertsFeed(activeStudents) {
        let updatedFeed = false;
        
        activeStudents.forEach(student => {
            const alertText = student.alert;
            if (alertText && alertText !== '') {
                // Generate a key for this alert instance to avoid repeats within 10 seconds
                const alertKey = `${student.name}:${alertText}`;
                const now = Date.now();
                
                const existingAlertIndex = alertHistory.findIndex(a => a.key === alertKey);
                
                if (existingAlertIndex === -1 || (now - alertHistory[existingAlertIndex].time > 12000)) {
                    // Update timestamp if it exists, or insert new
                    if (existingAlertIndex !== -1) {
                        alertHistory.splice(existingAlertIndex, 1);
                    }
                    
                    alertHistory.push({ key: alertKey, time: now });
                    addFeedItem(student.name, alertText);
                    updatedFeed = true;
                }
            }
        });

        // Limit alert history size
        if (alertHistory.length > 50) {
            alertHistory.shift();
        }
    }

    function addFeedItem(studentName, alertType) {
        // Hide empty message
        emptyAlertsMsg.style.display = 'none';

        const feedItem = document.createElement('div');
        feedItem.className = 'feed-item';
        
        // Pick icon
        let iconClass = 'fa-solid fa-triangle-exclamation';
        if (alertType.includes('PHONE')) iconClass = 'fa-solid fa-mobile-screen-button';
        if (alertType.includes('EYES')) iconClass = 'fa-solid fa-eye-slash';
        if (alertType.includes('FACE')) iconClass = 'fa-solid fa-user-slash';
        
        const timeString = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        feedItem.innerHTML = `
            <div class="feed-item-icon"><i class="${iconClass}"></i></div>
            <div class="feed-item-info">
                <div class="feed-item-title">${studentName}</div>
                <div style="color: var(--color-danger); font-size: 11px; font-weight: 500;">${alertType}</div>
            </div>
            <div class="feed-item-time">${timeString}</div>
        `;

        // Highlight student card when clicked
        feedItem.addEventListener('click', () => {
            const card = document.querySelector(`[data-student-name="${studentName}"]`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.style.transform = 'scale(1.05)';
                card.style.borderColor = 'var(--color-primary)';
                setTimeout(() => {
                    card.style.transform = '';
                    card.style.borderColor = '';
                }, 2000);
            }
        });

        // Prepend to feed
        alertsFeed.insertBefore(feedItem, alertsFeed.firstChild);

        // Keep last 15 alerts in feed UI
        const items = alertsFeed.getElementsByClassName('feed-item');
        if (items.length > 15) {
            alertsFeed.removeChild(items[items.length - 1]);
        }

        alertsCountBadge.textContent = items.length;
    }

    // Chart Rolling Window Update
    function updateChart(newVal) {
        classChart.data.datasets[0].data.shift();
        classChart.data.datasets[0].data.push(newVal);
        classChart.update();
    }

    // Render Student Cards
    function renderStudentCards() {
        const studentsArray = Object.values(studentData);
        
        // Filter students based on search string
        const filteredStudents = studentsArray.filter(student => {
            return student.name.toLowerCase().includes(searchFilter);
        });

        // Toggle Grid Visibility
        if (studentsArray.length === 0) {
            emptyGridMsg.style.display = 'flex';
            // Clean grid
            Array.from(studentGrid.children).forEach(child => {
                if (child !== emptyGridMsg) studentGrid.removeChild(child);
            });
            return;
        } else {
            emptyGridMsg.style.display = 'none';
        }

        // Sync grid items
        const existingCards = {};
        Array.from(studentGrid.children).forEach(child => {
            if (child.dataset.studentName) {
                existingCards[child.dataset.studentName] = child;
            }
        });

        // Create or Update Card Elements
        filteredStudents.forEach(student => {
            const name = student.name;
            let card = existingCards[name];

            if (!card) {
                card = document.createElement('div');
                card.className = 'student-card';
                card.dataset.studentName = name;
                studentGrid.appendChild(card);
            }

            // Remove from tracking of cards to delete
            delete existingCards[name];

            // Render Card details
            updateCardUI(card, student);
        });

        // Delete cards that are no longer in the filtered set
        Object.values(existingCards).forEach(card => {
            studentGrid.removeChild(card);
        });
    }

    // Individual Student Card Renderer
    function updateCardUI(cardElement, student) {
        const isOffline = student.status === 'offline';
        const attentionScore = student.attention;
        const stableLabel = student.model_pred_stable;
        const alert = student.alert || "";

        // Determine attention class
        let attentionClass = 'attn-high';
        let circleClass = 'good';
        if (isOffline) {
            circleClass = 'offline';
            attentionClass = 'offline';
        } else if (attentionScore < 40) {
            attentionClass = 'attn-low';
            circleClass = 'bad';
        } else if (attentionScore < 70) {
            attentionClass = 'attn-medium';
            circleClass = 'warn';
        }

        // Apply classes to card
        cardElement.className = `student-card ${attentionClass} ${isOffline ? 'offline' : ''}`;

        // Pitch/Yaw labels
        const pitchText = student.pose_pitch ? student.pose_pitch.toFixed(1) : '0.0';
        const yawText = student.pose_yaw ? student.pose_yaw.toFixed(1) : '0.0';
        
        // Alert banner layout
        const hasAlert = alert !== "" && alert !== "LEFT SESSION" && alert !== "DISCONNECTED";
        const alertBannerClass = hasAlert ? 'card-alert-banner has-alert' : 'card-alert-banner no-alert';
        const alertBannerContent = hasAlert 
            ? `<i class="fa-solid fa-triangle-exclamation"></i> ${alert}` 
            : `<i class="fa-solid fa-check-circle"></i> Monitoring Active`;

        const badgeClass = isOffline 
            ? 'student-badge offline' 
            : (stableLabel === 1 ? 'student-badge attentive' : 'student-badge distracted');
        const badgeText = isOffline ? 'Offline' : (stableLabel === 1 ? 'Attentive' : 'Distracted');

        cardElement.innerHTML = `
            <div class="card-top">
                <div class="student-identity">
                    <div class="student-name" title="${student.name}">${student.name}</div>
                    <div class="student-class">Class Code: ${student.class_code}</div>
                </div>
                <div class="${badgeClass}">${badgeText}</div>
            </div>
            
            <div class="card-metrics-block">
                <div class="score-circle ${circleClass}" style="--pct: ${isOffline ? '0%' : attentionScore + '%'}">
                    <span class="score-text">${isOffline ? '—' : attentionScore + '%'}</span>
                </div>
                <div class="quick-details">
                    <div class="detail-line">
                        <span>Gaze:</span>
                        <span style="color: ${student.gaze === 'Center' ? 'var(--color-success)' : 'var(--color-warning)'}">${student.gaze}</span>
                    </div>
                    <div class="detail-line">
                        <span>Blink rate:</span>
                        <span>${student.blinks_per_min.toFixed(1)}/min</span>
                    </div>
                    <div class="detail-line">
                        <span>Phone:</span>
                        <span style="color: ${student.phone_detected ? 'var(--color-danger)' : 'var(--text-muted)'}">
                            ${student.phone_detected ? 'Detected' : 'No'}
                        </span>
                    </div>
                    <div class="detail-line">
                        <span>Hands:</span>
                        <span>${student.hands_count}</span>
                    </div>
                </div>
            </div>
            
            <div class="detail-line" style="font-size: 11px; margin-top: 4px; padding-bottom: 6px;">
                <span>Head Pose:</span>
                <span>P: ${pitchText}° &nbsp; Y: ${yawText}°</span>
            </div>

            <div class="${alertBannerClass}">
                ${alertBannerContent}
            </div>
        `;
    }

    // Run Websocket connection
    connectWebSocket();
});
