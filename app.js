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
  completedTasks: JSON.parse(localStorage.getItem('completedTasks') || '[]'),
  referrals: [],
  apiBaseUrl: "https://core-api-server-qkny.onrender.com",

  // Level Tracking & Double Cost Scaling
  upgrades: {
    autobot: { level: 0, cost: 1000 },
    multitap: { level: 1, cost: 500 },
    maxenergy: { level: 0, cost: 250 }
  }
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
const friendsListEl = document.getElementById('friendsList');
const referralCountEl = document.getElementById('referral-count');
const leaderboardListEl = document.getElementById('leaderboardList');

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
  loadLeaderboard();
  
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

      // Fetch fresh leaderboard data when entering Leaderboard tab
      if (targetTab === 'tab-leaderboard') {
        loadLeaderboard();
      }
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

  // Update Star Sticker Badges Text
  const badgeAutobot = document.getElementById('badge-autobot');
  const badgeMultitap = document.getElementById('badge-multitap');
  const badgeMaxenergy = document.getElementById('badge-maxenergy');

  if (badgeAutobot) badgeAutobot.textContent = `Lvl ${state.upgrades.autobot.level}`;
  if (badgeMultitap) badgeMultitap.textContent = `Lvl ${state.upgrades.multitap.level}`;
  if (badgeMaxenergy) badgeMaxenergy.textContent = `Lvl ${state.upgrades.maxenergy.level}`;

  // Update Upgrade Buttons Cost Text
  if (btnAutobot) btnAutobot.textContent = `🥔 ${state.upgrades.autobot.cost.toLocaleString()}`;
  if (btnMultitap) btnMultitap.textContent = `🥔 ${state.upgrades.multitap.cost.toLocaleString()}`;
  if (btnMaxenergy) btnMaxenergy.textContent = `🥔 ${state.upgrades.maxenergy.cost.toLocaleString()}`;
}

// --- UPGRADE SYSTEM LOGIC ---
function setupUpgrades() {
  if (btnAutobot) {
    btnAutobot.addEventListener('click', () => {
      const up = state.upgrades.autobot;
      if (state.balance >= up.cost) {
        state.balance -= up.cost;
        up.level += 1;
        state.autoBotIncome += 100;
        up.cost *= 2;
        updateUI();
      }
    });
  }

  if (btnMultitap) {
    btnMultitap.addEventListener('click', () => {
      const up = state.upgrades.multitap;
      if (state.balance >= up.cost) {
        state.balance -= up.cost;
        up.level += 1;
        state.tapPower += 2;
        up.cost *= 2;
        updateUI();
      }
    });
  }

  if (btnMaxenergy) {
    btnMaxenergy.addEventListener('click', () => {
      const up = state.upgrades.maxenergy;
      if (state.balance >= up.cost) {
        state.balance -= up.cost;
        up.level += 1;
        state.maxEnergy += 15;
        state.energy += 15;
        up.cost *= 2;
        updateUI();
      }
    });
  }
}

// --- TASK SYSTEM WITH 35-SECOND TIMER ---
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
    localStorage.setItem('completedTasks', JSON.stringify(state.completedTasks));

    btn.textContent = 'DONE ✓';
    btn.classList.add('completed');
    btn.style.background = '#cbd5e1';
    updateUI();
    syncTaskClaim(task.id);
  } else if (!btn.disabled && !btn.textContent.includes('WAIT')) {
    // Open target link
    if (tg?.openTelegramLink && task.link.includes('t.me')) {
      tg.openTelegramLink(task.link);
    } else {
      window.open(task.link, '_blank');
    }

    // Start 35-second countdown timer
    let timeLeft = 35;
    btn.disabled = true;
    btn.textContent = `WAIT (${timeLeft}s)`;
    btn.style.background = '#fde047';

    const timer = setInterval(() => {
      timeLeft -= 1;
      if (timeLeft > 0) {
        btn.textContent = `WAIT (${timeLeft}s)`;
      } else {
        clearInterval(timer);
        btn.disabled = false;
        btn.textContent = 'CLAIM';
        btn.style.background = '#2dd4bf';
      }
    }, 1000);
  }
}

// --- RENDER FRIENDS REFERRAL LIST ---
function renderReferrals() {
  if (referralCountEl) {
    referralCountEl.textContent = state.referrals.length;
  }

  if (!friendsListEl) return;

  if (state.referrals.length === 0) {
    friendsListEl.innerHTML = `<div class="empty-state">No friends invited yet. Share your link!</div>`;
    return;
  }

  friendsListEl.innerHTML = state.referrals.map(friend => `
    <div class="friend-item">
      <div class="friend-name">👤 ${friend.first_name || friend.username || 'User'}</div>
      <div class="friend-reward">+5,000 🥔</div>
    </div>
  `).join('');
}

// --- FETCH & RENDER WEEKLY LEADERBOARD ---
async function loadLeaderboard() {
  if (!leaderboardListEl) return;

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/potato/leaderboard?telegramId=${state.user.id}`);
    if (!res.ok) throw new Error('Failed to fetch leaderboard');

    const data = await res.json();
    const top10 = data.top10 || [];
    const userRank = data.userRank || {};

    // Render Top 10 Rankings
    if (top10.length === 0) {
      leaderboardListEl.innerHTML = `<div class="empty-state">No competitors yet this week!</div>`;
    } else {
      leaderboardListEl.innerHTML = top10.map((player, index) => {
        const rankNum = index + 1;
        let rankBadge = `#${rankNum}`;
        let rankClass = `rank-${rankNum}`;

        if (rankNum === 1) rankBadge = '🥇';
        if (rankNum === 2) rankBadge = '🥈';
        if (rankNum === 3) rankBadge = '🥉';

        return `
          <div class="leader-card ${rankClass}">
            <div class="leader-info">
              <span class="leader-rank">${rankBadge}</span>
              <span class="leader-name">${player.first_name || player.username || 'Tapper'}</span>
            </div>
            <div class="leader-stats">
              <span class="leader-refs">👥 ${player.weeklyReferrals || 0} Ref</span>
              <span class="leader-balance">${(player.balance || 0).toLocaleString()} 🥔</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // Update Sticky Current User Rank Footer
    const myRankEl = document.getElementById('myRank');
    const myRankNameEl = document.getElementById('myRankName');
    const myRankStatsEl = document.getElementById('myRankStats');

    if (myRankEl) myRankEl.textContent = userRank.rank ? `#${userRank.rank}` : '#--';
    if (myRankNameEl) myRankNameEl.textContent = `${state.user.first_name} (You)`;
    if (myRankStatsEl) {
      myRankStatsEl.textContent = `${userRank.weeklyReferrals || 0} Referrals • ${(state.balance || 0).toLocaleString()} 🥔`;
    }
  } catch (err) {
    console.warn('Leaderboard connection error:', err);
    if (leaderboardListEl) {
      leaderboardListEl.innerHTML = `<div class="empty-state">Leaderboard temporarily unavailable.</div>`;
    }
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
      state.completedTasks = Array.from(new Set([...state.completedTasks, ...(data.completedTasks || [])]));
      state.referrals = data.referrals || [];
      localStorage.setItem('completedTasks', JSON.stringify(state.completedTasks));

      updateUI();
      renderReferrals();
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
