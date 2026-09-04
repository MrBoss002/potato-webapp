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
  energy: 50,
  maxEnergy: 50,
  tapPower: 1,
  autoBotIncome: 0,
  totalTapsCount: 0,
  unlockedBadges: [],
  pendingTaps: 0,
  completedTasks: [],
  apiBaseUrl: "https://core-api-server-qkny.onrender.com"
};

// DOM Elements
const balanceEl = document.getElementById('balance');
const energyEl = document.getElementById('energy');
const maxEnergyEl = document.getElementById('maxEnergy');
const energyFillEl = document.getElementById('energyFill');
const usernameEl = document.getElementById('username');
const tapButton = document.getElementById('tapButton');
const tasksListEl = document.getElementById('tasksList');
const inviteBtn = document.getElementById('inviteBtn');

// Upgrade Buttons
const btnAutobot = document.getElementById('btn-autobot');
const btnMultitap = document.getElementById('btn-multitap');
const btnMaxenergy = document.getElementById('btn-maxenergy');

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  if (usernameEl && state.user.first_name) {
    usernameEl.textContent = state.user.first_name;
  }
  
  setupNavigation();
  setupTapMechanics();
  setupUpgrades();
  loadTasks();
  initUser();
  
  // Auto-regenerate 1 energy every 1.5 seconds
  setInterval(regenerateEnergy, 1500);

  // Passive Auto Bot Income (Every 1 hour, divided into 5-second tick credits)
  setInterval(processAutoBotIncome, 5000);

  // Sync taps to backend every 5 seconds
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

// --- TAP MECHANICS & BADGE UNLOCKS ---
function setupTapMechanics() {
  if (!tapButton) return;

  tapButton.addEventListener('pointerdown', (e) => {
    if (state.energy <= 0) return;

    // Deduct energy & add score using current tap power
    state.energy -= 1;
    state.balance += state.tapPower;
    state.totalTapsCount += 1;
    state.pendingTaps += 1;

    updateUI();
    checkBadgeUnlocks();
    showFloatingScore(e.clientX, e.clientY, `+${state.tapPower}`);

    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  });
}

function checkBadgeUnlocks() {
  const badges = [
    { id: 'bronze', count: 15, emoji: '🥉', elementId: 'badge-bronze' },
    { id: 'silver', count: 100, emoji: '🥈', elementId: 'badge-silver' },
    { id: 'gold', count: 500, emoji: '🥇', elementId: 'badge-gold' },
    { id: 'diamond', count: 1500, emoji: '💎', elementId: 'badge-diamond' }
  ];

  badges.forEach(badge => {
    if (state.totalTapsCount >= badge.count && !state.unlockedBadges.includes(badge.id)) {
      state.unlockedBadges.push(badge.id);
      const slot = document.getElementById(badge.elementId);
      if (slot) {
        slot.textContent = badge.emoji;
        slot.classList.add('unlocked');
      }
    }
  });
}

function regenerateEnergy() {
  if (state.energy < state.maxEnergy) {
    state.energy = Math.min(state.energy + 1, state.maxEnergy);
    updateUI();
  }
}

function processAutoBotIncome() {
  if (state.autoBotIncome > 0) {
    // Share 100/hr over 5-second intervals
    const tickIncome = Math.max(1, Math.floor((state.autoBotIncome / 3600) * 5));
    state.balance += tickIncome;
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
  if (maxEnergyEl) maxEnergyEl.textContent = state.maxEnergy;
  if (energyFillEl) {
    const percentage = (state.energy / state.maxEnergy) * 100;
    energyFillEl.style.width = `${percentage}%`;
  }
}

// --- UPGRADE SYSTEM LOGIC ---
function setupUpgrades() {
  if (btnAutobot) {
    btnAutobot.addEventListener('click', () => {
      if (state.balance >= 1000) {
        state.balance -= 1000;
        state.autoBotIncome += 100;
        btnAutobot.textContent = 'OWNED ✓';
        btnAutobot.disabled = true;
        btnAutobot.style.background = '#cbd5e1';
        updateUI();
      }
    });
  }

  if (btnMultitap) {
    btnMultitap.addEventListener('click', () => {
      if (state.balance >= 500) {
        state.balance -= 500;
        state.tapPower += 2;
        btnMultitap.textContent = 'LVL 2 ✓';
        btnMultitap.disabled = true;
        btnMultitap.style.background = '#cbd5e1';
        updateUI();
      }
    });
  }

  if (btnMaxenergy) {
    btnMaxenergy.addEventListener('click', () => {
      if (state.balance >= 250) {
        state.balance -= 250;
        state.maxEnergy += 15;
        state.energy += 15;
        btnMaxenergy.textContent = '+15 ADDED ✓';
        btnMaxenergy.disabled = true;
        btnMaxenergy.style.background = '#cbd5e1';
        updateUI();
      }
    });
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
  }
}

function handleTaskClick(task, btn) {
  if (btn.classList.contains('completed')) return;

  if (btn.textContent.trim() === 'CLAIM') {
    state.balance += task.reward;
    state.completedTasks.push(task.id);
    btn.textContent = 'DONE ✓';
    btn.classList.add('completed');
    updateUI();
    syncTaskClaim(task.id);
  } else {
    if (tg?.openTelegramLink && task.link.includes('t.me')) {
      tg.openTelegramLink(task.link);
    } else {
      window.open(task.link, '_blank');
    }
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
    state.pendingTaps += tapsToSend;
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
    const botUsername = "PotatoTapBot";
    const shareUrl = `https://t.me/share/url?url=https://t.me/${botUsername}?start=${state.user.id}&text=Join%20me%20on%20Potato%20Tap%20and%20earn%20free%20rewards!`;
    
    if (tg?.openTelegramLink) {
      tg.openTelegramLink(shareUrl);
    } else {
      window.open(shareUrl, '_blank');
    }
  });
}
