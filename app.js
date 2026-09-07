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
  referralCount: 0,
  apiBaseUrl: "https://core-api-server-qkny.onrender.com",

  // Upgrades
  upgrades: {
    autobot: { level: 0, cost: 1000 },
    multitap: { level: 1, cost: 500 },
    maxenergy: { level: 0, cost: 250 }
  }
};

// Anti-Bot Captcha Variables
let tapSessionCount = 0;
let isCaptchaActive = false;

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

// Level & Tier Progress DOM Elements
const tierTitleEl = document.getElementById('tierTitle');
const levelSubtitleEl = document.getElementById('levelSubtitle');
const levelProgressFillEl = document.getElementById('levelProgressFill');

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
  
  // Initial check for league header visibility
  toggleLeagueHeader('tab-tap');

  // Regenerate 1 energy every second
  setInterval(regenerateEnergy, 1000);

  // Passive Auto Bot Income
  setInterval(processAutoBotIncome, 5000);

  // Sync data to backend every 5 seconds
  setInterval(syncData, 5000);
});

// --- ANTI-BOT CAPTCHA ---
function triggerCaptcha(onSuccess) {
  isCaptchaActive = true;
  const num1 = Math.floor(Math.random() * 9) + 1;
  const num2 = Math.floor(Math.random() * 9) + 1;
  const answer = num1 + num2;

  const overlay = document.createElement('div');
  overlay.id = 'captcha-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.85); display: flex; align-items: center;
    justify-content: center; z-index: 10000; color: #fff; text-align: center;
  `;
  overlay.innerHTML = `
    <div style="background: #1e1e2d; padding: 25px; border-radius: 16px; width: 85%; max-width: 300px; box-shadow: 0 4px 15px rgba(0,0,0,0.5);">
      <h3 style="margin-top:0;">🤖 Verification</h3>
      <p style="font-size: 14px; color: #aaa;">Solve equation to verify you are human:</p>
      <h2 style="color: #f39c12; margin: 15px 0;">${num1} + ${num2} = ?</h2>
      <input type="number" id="captcha-input" style="width: 80%; padding: 10px; font-size: 18px; border-radius: 8px; border: 1px solid #444; background: #2a2a3c; color: white; text-align: center; outline: none;">
      <br>
      <button id="captcha-btn" style="margin-top: 15px; width: 85%; padding: 10px; background: #27ae60; color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">Submit</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('captcha-btn').onclick = () => {
    const inputVal = parseInt(document.getElementById('captcha-input').value);
    if (inputVal === answer) {
      document.body.removeChild(overlay);
      isCaptchaActive = false;
      tapSessionCount = 0;
      if (onSuccess) onSuccess();
    } else {
      alert('Incorrect answer. Try again!');
    }
  };
}

// --- TOGGLE LEAGUE HEADER VISIBILITY ---
function toggleLeagueHeader(activeTab) {
  const levelContainer = document.querySelector('.level-progress-container');
  if (!levelContainer) return;

  // Show only on main tap section, hide on all other tabs
  if (activeTab === 'tab-tap') {
    levelContainer.style.display = 'block';
  } else {
    levelContainer.style.display = 'none';
  }
}

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

      toggleLeagueHeader(targetTab);

      if (targetTab === 'tab-leaderboard') {
        loadLeaderboard();
      }
    });
  });
}

// --- TAP MECHANICS ---
function setupTapMechanics() {
  if (!tapButton) return;

  tapButton.addEventListener('pointerdown', (e) => {
    if (isCaptchaActive) return;

    if (state.energy < state.tapPower) return;

    // Trigger Anti-Bot Captcha every 100 taps
    tapSessionCount++;
    if (tapSessionCount >= 100) {
      triggerCaptcha();
      return;
    }

    state.energy -= state.tapPower;
    state.balance += state.tapPower;
    state.totalTapsCount += 1;
    state.pendingTaps += state.tapPower;

    updateUI();
    showFloatingScore(e.clientX, e.clientY, `+${state.tapPower}`);

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

// --- TIER / LEVEL SYSTEM ---
function getTierInfo(balance) {
  const tiers = [
    { name: "Bronze", min: 0, max: 10000, level: 1 },
    { name: "Silver", min: 10000, max: 100000, level: 2 },
    { name: "Gold", min: 100000, max: 1000000, level: 3 },
    { name: "Platinum", min: 1000000, max: 10000000, level: 4 },
    { name: "Diamond", min: 10000000, max: Infinity, level: 5 }
  ];

  for (let i = 0; i < tiers.length; i++) {
    if (balance < tiers[i].max) {
      return tiers[i];
    }
  }
  return tiers[tiers.length - 1];
}

function updateLevelProgress() {
  const tier = getTierInfo(state.balance);

  if (tierTitleEl) tierTitleEl.textContent = tier.name;
  if (levelSubtitleEl) levelSubtitleEl.textContent = `Level ${tier.level}/5`;

  if (levelProgressFillEl) {
    if (tier.max === Infinity) {
      levelProgressFillEl.style.width = '100%';
    } else {
      const currentLevelProgress = state.balance - tier.min;
      const currentLevelGoal = tier.max - tier.min;
      const progressPercent = Math.min(100, Math.max(0, (currentLevelProgress / currentLevelGoal) * 100));
      levelProgressFillEl.style.width = `${progressPercent}%`;
    }
  }
}

function updateUI() {
  if (balanceEl) balanceEl.textContent = state.balance.toLocaleString();
  if (energyEl) energyEl.textContent = state.energy;
  if (maxEnergyEl) maxEnergyEl.textContent = state.maxEnergy;
  if (energyFillEl) {
    const percentage = (state.energy / state.maxEnergy) * 100;
    energyFillEl.style.width = `${percentage}%`;
  }

  updateLevelProgress();

  const badgeAutobot = document.getElementById('badge-autobot');
  const badgeMultitap = document.getElementById('badge-multitap');
  const badgeMaxenergy = document.getElementById('badge-maxenergy');

  if (badgeAutobot) badgeAutobot.textContent = `Lvl ${state.upgrades.autobot.level}`;
  if (badgeMultitap) badgeMultitap.textContent = `Lvl ${state.upgrades.multitap.level}`;
  if (badgeMaxenergy) badgeMaxenergy.textContent = `Lvl ${state.upgrades.maxenergy.level}`;

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
        syncData(true);
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
        syncData(true);
      }
    });
  }

  if (btnMaxenergy) {
    btnMaxenergy.addEventListener('click', () => {
      const up = state.upgrades.maxenergy;
      if (state.balance >= up.cost) {
        state.balance -= up.cost;
        up.level += 1;
        state.maxEnergy += 500;
        state.energy += 500;
        up.cost *= 2;
        updateUI();
        syncData(true);
      }
    });
  }
}

// --- TASK SYSTEM WITH CHANNEL FORCE-SUB ---
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

async function handleTaskClick(task, btn) {
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
  } else if (!btn.disabled && !btn.textContent.includes('CHECKING')) {
    if (tg?.openTelegramLink && task.link.includes('t.me')) {
      tg.openTelegramLink(task.link);
    } else {
      window.open(task.link, '_blank');
    }

    // Force Sub Verification if task is channel join
    if (task.channelUsername) {
      btn.disabled = true;
      btn.textContent = 'CHECKING...';

      setTimeout(async () => {
        try {
          const res = await fetch(`${state.apiBaseUrl}/api/potato/check-fsub`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ telegramId: state.user.id, channelUsername: task.channelUsername })
          });
          const data = await res.json();

          if (data.joined) {
            btn.disabled = false;
            btn.textContent = 'CLAIM';
            btn.style.background = '#2dd4bf';
          } else {
            btn.disabled = false;
            btn.textContent = 'JOIN FIRST';
            alert('Please join the channel first to claim your reward!');
          }
        } catch (e) {
          btn.disabled = false;
          btn.textContent = 'CLAIM';
        }
      }, 3000);

    } else {
      // Standard timer for regular tasks
      let timeLeft = 10;
      btn.disabled = true;
      btn.textContent = `WAIT (${timeLeft}s)`;

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
}

// --- RENDER FRIENDS REFERRAL LIST ---
function renderReferrals() {
  if (referralCountEl) {
    referralCountEl.textContent = state.referralCount || state.referrals.length || 0;
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

// --- FETCH LEADERBOARD ---
async function loadLeaderboard() {
  if (!leaderboardListEl) return;

  try {
    const res = await fetch(`${state.apiBaseUrl}/api/potato/leaderboard?telegramId=${state.user.id}`);
    if (!res.ok) throw new Error('Failed to fetch leaderboard');

    const data = await res.json();
    const top10 = data.top10 || [];
    
    // Ensure top 10 is strictly sorted by balance
    top10.sort((a, b) => (b.balance || 0) - (a.balance || 0));

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

        const playerTier = getTierInfo(player.balance || 0);

        return `
          <div class="leader-card ${rankClass}">
            <div class="leader-info">
              <span class="leader-rank">${rankBadge}</span>
              <span class="leader-name">${player.first_name || player.username || 'Tapper'} <small style="opacity:0.75; font-size: 11px;">(${playerTier.name})</small></span>
            </div>
            <div class="leader-stats">
              <span class="leader-refs">👥 ${player.weeklyReferrals || 0} Ref</span>
              <span class="leader-balance">${(player.balance || 0).toLocaleString()} 🥔</span>
            </div>
          </div>
        `;
      }).join('');
    }

    // Determine correct user rank dynamically
    let calculatedRank = top10.findIndex(p => String(p.telegramId) === String(state.user.id)) + 1;
    if (calculatedRank === 0 && data.userRank?.rank) {
      calculatedRank = data.userRank.rank;
    }

    const myRankEl = document.getElementById('myRank');
    const myRankNameEl = document.getElementById('myRankName');
    const myRankStatsEl = document.getElementById('myRankStats');

    const myTier = getTierInfo(state.balance);

    if (myRankEl) myRankEl.textContent = calculatedRank > 0 ? `#${calculatedRank}` : '#--';
    if (myRankNameEl) myRankNameEl.innerHTML = `${state.user.first_name} <small style="opacity:0.8;">(${myTier.name})</small>`;
    if (myRankStatsEl) {
      myRankStatsEl.textContent = `${state.referralCount || 0} Referrals • ${(state.balance || 0).toLocaleString()} 🥔`;
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
      state.balance = data.balance !== undefined ? data.balance : 0;
      state.energy = data.energy !== undefined ? data.energy : 50;
      state.maxEnergy = data.maxEnergy || 50;
      state.tapPower = data.tapPower || 1;
      state.autoBotIncome = data.autoBotIncome || 0;
      
      if (data.upgrades) {
        state.upgrades = data.upgrades;
      }

      state.completedTasks = Array.from(new Set([...state.completedTasks, ...(data.completedTasks || [])]));
      state.referrals = data.referrals || [];
      state.referralCount = data.referralCount || state.referrals.length;

      localStorage.setItem('completedTasks', JSON.stringify(state.completedTasks));

      updateUI();
      renderReferrals();
    }
  } catch (err) {
    console.warn('Backend server offline or connecting locally:', err);
  }
}

async function syncData(forceSync = false) {
  if (state.pendingTaps <= 0 && !forceSync) return;

  const tapsToSend = state.pendingTaps;
  state.pendingTaps = 0;

  try {
    await fetch(`${state.apiBaseUrl}/api/potato/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        telegramId: state.user.id, 
        taps: tapsToSend,
        balance: state.balance,
        energy: state.energy,
        maxEnergy: state.maxEnergy,
        upgrades: state.upgrades,
        tapPower: state.tapPower,
        autoBotIncome: state.autoBotIncome
      })
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
