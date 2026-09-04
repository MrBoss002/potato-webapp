// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

// Global App State
const state = {
  user: tg?.initDataUnsafe?.user || { id: 12345678, first_name: "Player", username: "Guest" },
  refBy: tg?.initDataUnsafe?.start_param || null,
  balance: 0,
  energy: 1000,
  maxEnergy: 1000,
  pendingTaps: 0,
  completedTasks: [],
  apiBaseUrl: "https://core-api-server-qkny.onrender.com" // Update after Render deployment
};

// DOM Elements
const balanceEl = document.getElementById('balance');
const energyEl = document.getElementById('energy');
const energyFillEl = document.getElementById('energyFill');
const usernameEl = document.getElementById('username');
const tapButton = document.getElementById('tapButton');
const tasksListEl = document.getElementById('tasksList');
const inviteBtn = document.getElementById('inviteBtn');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  if (usernameEl && state.user.first_name) {
    usernameEl.textContent = state.user.first_name;
  }
  
  setupNavigation();
  setupTapMechanics();
  loadTasks();
  initUser();
  
  // Auto-regenerate energy (1 point per second)
  setInterval(regenerateEnergy, 1000);

  // Periodically sync taps to backend every 5 seconds
  setInterval(syncData, 5000);
});

// --- NAVIGATION CONTROLLER ---
function setupNavigation() {
  const navBtns = document.querySelectorAll('.nav-btn');
  const tabContents = document.querySelectorAll('.tab-content');

  navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      navBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const activeContent = document.getElementById(targetTab);
      if (activeContent) activeContent.classList.add('active');
    });
  });
}

// --- TAP MECHANICS & PHYSICS ---
function setupTapMechanics() {
  if (!tapButton) return;

  tapButton.addEventListener('pointerdown', (e) => {
    if (state.energy <= 0) return;

    // Deduct energy & add balance locally
    state.energy -= 1;
    state.balance += 1;
    state.pendingTaps += 1;

    updateUI();
    showFloatingScore(e.clientX, e.clientY, "+1");

    // Haptic Feedback for Telegram
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  });
}

function regenerateEnergy() {
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.energy + 1, state.maxEnergy);
    updateUI();
  }
}

function showFloatingScore(x, y, text) {
  const scoreEl = document.createElement('div');
  scoreEl.className = 'click-score';
  scoreEl.textContent = text;
  scoreEl.style.left = `${x - 15}px`;
  scoreEl.style.top = `${y - 30}px`;

  document.body.appendChild(scoreEl);

  setTimeout(() => scoreEl.remove(), 800);
}

function updateUI() {
  if (balanceEl) balanceEl.textContent = state.balance.toLocaleString();
  if (energyEl) energyEl.textContent = state.energy;
  if (energyFillEl) {
    const percentage = (state.energy / state.maxEnergy) * 100;
    energyFillEl.style.width = `${percentage}%`;
  }
}

// --- DYNAMIC TASK SYSTEM ---
async function loadTasks() {
  if (!tasksListEl) return;

  try {
    const response = await fetch('tasks.json');
    const tasks = await response.json();

    tasksListEl.innerHTML = '';

    tasks.forEach(task => {
      const isCompleted = state.completedTasks.includes(task.id);
      
      const card = document.createElement('div');
      card.className = 'task-card';
      card.innerHTML = `
        <div class="task-icon">${task.icon || '🎯'}</div>
        <div class="task-info">
          <div class="task-title">${task.title}</div>
          <div class="task-desc">${task.description}</div>
          <div class="task-reward">+${task.reward.toLocaleString()} 🥔</div>
        </div>
        <button class="task-btn ${isCompleted ? 'completed' : ''}" id="btn-task-${task.id}">
          ${isCompleted ? 'DONE ✓' : (task.btnText || 'GO')}
        </button>
      `;

      tasksListEl.appendChild(card);

      const actionBtn = card.querySelector(`#btn-task-${task.id}`);
      if (!isCompleted) {
        actionBtn.addEventListener('click', () => handleTaskClick(task, actionBtn));
      }
    });
  } catch (err) {
    console.error('Error loading tasks:', err);
    tasksListEl.innerHTML = '<div class="subtitle">Failed to load tasks.</div>';
  }
}

function handleTaskClick(task, btn) {
  if (btn.classList.contains('completed')) return;

  if (btn.textContent.trim() === 'CLAIM') {
    // Claim task reward
    state.balance += task.reward;
    state.completedTasks.push(task.id);
    btn.textContent = 'DONE ✓';
    btn.classList.add('completed');
    updateUI();

    // Sync task claim to backend server
    syncTaskClaim(task.id);
  } else {
    // Redirect user to task URL
    if (tg?.openTelegramLink && task.link.includes('t.me')) {
      tg.openTelegramLink(task.link);
    } else {
      window.open(task.link, '_blank');
    }

    // Change button state to CLAIM
    btn.textContent = 'CLAIM';
    btn.style.background = '#fef08a';
  }
}

// --- BACKEND API INTERACTIONS ---
async function initUser() {
  try {
    const res = await fetch(`${state.apiBaseUrl}/api/potato/user`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: state.user, refBy: state.refBy })
    });

    if (res.ok) {
      const data = await res.json();
      state.balance = data.balance || 0;
      state.completedTasks = data.completedTasks || [];
      updateUI();
      loadTasks(); // Refresh task status after backend response
    }
  } catch (err) {
    console.warn('Backend server offline or connecting locally:', err);
  }
}

async function syncData() {
  if (state.pendingTaps <= 0) return;

  const tapsToSend = state.pendingTaps;
  state.pendingTaps = 0;

  try {
    await fetch(`${state.apiBaseUrl}/api/potato/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: state.user.id, taps: tapsToSend })
    });
  } catch (err) {
    // If request fails, add back unsynced taps
    state.pendingTaps += tapsToSend;
    console.warn('Tap sync failed, retrying on next tick:', err);
  }
}

async function syncTaskClaim(taskId) {
  try {
    await fetch(`${state.apiBaseUrl}/api/potato/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramId: state.user.id, claimedTaskId: taskId })
    });
  } catch (err) {
    console.error('Task sync failed:', err);
  }
}

// --- SHARE REFERRAL LINK ---
if (inviteBtn) {
  inviteBtn.addEventListener('click', () => {
    const botUsername = "PotatoTapBot"; // Replace with your actual bot username in Step 3
    const shareUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=${state.user.id}&text=Join%20me%20on%20Potato%20Tap%20and%20earn%20free%20rewards!`;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  });
}
