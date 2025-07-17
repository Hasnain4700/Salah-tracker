import { app, analytics, auth, db } from './firebase.js';
const {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  ref,
  set,
  get,
  onValue
} = window.FirebaseExports;

// --- UI Elements ---
const gregorianDateEl = document.getElementById('gregorian-date');
const hijriDateEl = document.getElementById('hijri-date');
const prevDateBtn = document.getElementById('prev-date');
const nextDateBtn = document.getElementById('next-date');
const countdownTimerEl = document.getElementById('countdown-timer');
const nextPrayerNameEl = document.getElementById('next-prayer-name');
const prayerItems = document.querySelectorAll('.prayer-item');
const lastThirdTimeEl = document.getElementById('last-third-time');
const logoutBtn = document.getElementById('logout-btn');
const prayerStatusLabel = document.getElementById('prayer-status-label');
const levelNumEl = document.getElementById('level-num');
const xpPointsEl = document.getElementById('xp-points');
const xpProgress = document.getElementById('xp-progress');

// --- Navigation Logic ---
const sections = {
  home: document.getElementById('home-section'),
  mosque: document.getElementById('mosque-section'),
  quran: document.getElementById('quran-section'),
  tracker: document.getElementById('tracker-section'),
};
const navBtns = document.querySelectorAll('.bottom-nav .nav-btn');

function showSection(section) {
  Object.values(sections).forEach(sec => sec.style.display = 'none');
  sections[section].style.display = '';
  navBtns.forEach(btn => btn.classList.remove('active'));
  navBtns[["home","mosque","quran","tracker"].indexOf(section)].classList.add('active');
}
navBtns[0].onclick = () => showSection('home');
navBtns[1].onclick = () => showSection('mosque');
navBtns[2].onclick = () => showSection('quran');
navBtns[3].onclick = () => showSection('tracker');
showSection('home');

// --- Date Handling ---
let currentDate = new Date();
function updateDates() {
  // Gregorian
  gregorianDateEl.textContent = currentDate.toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'short', day: 'numeric'
  });
  // Hijri (placeholder, real conversion needs API or library)
  hijriDateEl.textContent = 'Hijri: ' + (currentDate.getDate() + 18) + ' Jumada II 1445';
}

// --- Prayers List (with Tahajjud) ---
// For API, insert Tahajjud at start with fixed time (e.g., 2:30 AM)
function getPrayersWithTahajjud(apiPrayers) {
  return [
    { name: 'Tahajjud', time: '02:30' },
    ...apiPrayers.filter(p => p.name !== 'Sunrise')
  ];
}

// --- Location and Prayer Times API Integration ---
let prayersWithTahajjud = [];
let apiDate = new Date();

async function fetchPrayerTimes(date = new Date()) {
  let coords = { lat: 24.7136, lng: 46.6753 }; // Default: Riyadh
  try {
    const pos = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
        () => reject()
      );
    });
    coords = pos;
  } catch {}
  const yyyy = date.getFullYear();
  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
  const dd = date.getDate().toString().padStart(2, '0');
  const url = `https://api.aladhan.com/v1/timings/${yyyy}-${mm}-${dd}?latitude=${coords.lat}&longitude=${coords.lng}&method=2`;
  const res = await fetch(url);
  const data = await res.json();
  const t = data.data.timings;
  const apiPrayers = [
    { name: 'Fajr', time: t.Fajr },
    { name: 'Sunrise', time: t.Sunrise },
    { name: 'Dhuhr', time: t.Dhuhr },
    { name: 'Asr', time: t.Asr },
    { name: 'Maghrib', time: t.Maghrib },
    { name: 'Isha', time: t.Isha }
  ];
  prayersWithTahajjud = getPrayersWithTahajjud(apiPrayers);
  document.querySelectorAll('.prayer-item').forEach((item, i) => {
    item.querySelector('.prayer-time').textContent = prayersWithTahajjud[i]?.time || '--:--';
  });
  calcLastThird();
  updateCountdown();
}

// --- Update all logic to use prayersWithTahajjud ---
function getNextPrayer() {
  const now = new Date();
  for (let i = 0; i < prayersWithTahajjud.length; i++) {
    const [h, m] = prayersWithTahajjud[i].time.split(':').map(Number);
    const prayerTime = new Date(now);
    prayerTime.setHours(h, m, 0, 0);
    if (prayerTime > now) {
      return { ...prayersWithTahajjud[i], index: i, prayerTime };
    }
  }
  // If all passed, next is Tahajjud tomorrow
  const [h, m] = prayersWithTahajjud[0].time.split(':').map(Number);
  const prayerTime = new Date(now);
  prayerTime.setDate(prayerTime.getDate() + 1);
  prayerTime.setHours(h, m, 0, 0);
  return { ...prayersWithTahajjud[0], index: 0, prayerTime };
}

function updateCountdown() {
  if (!prayersWithTahajjud.length) return;
  const now = new Date();
  const { name, prayerTime, index } = getNextPrayer();
  const diff = prayerTime - now;
  const hours = Math.floor(diff / 1000 / 60 / 60);
  const mins = Math.floor((diff / 1000 / 60) % 60);
  const secs = Math.floor((diff / 1000) % 60);
  countdownTimerEl.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  nextPrayerNameEl.textContent = name;
  // Animate SVG circle
  const prevIndex = (index - 1 + prayersWithTahajjud.length) % prayersWithTahajjud.length;
  const [prevH, prevM] = prayersWithTahajjud[prevIndex].time.split(':').map(Number);
  const prevPrayerTime = new Date(now);
  if (prevIndex > index) prevPrayerTime.setDate(prevPrayerTime.getDate() - 1);
  prevPrayerTime.setHours(prevH, prevM, 0, 0);
  const total = (prayerTime - prevPrayerTime) / 1000;
  const elapsed = (now - prevPrayerTime) / 1000;
  let progress = elapsed / total;
  if (progress < 0) progress = 0;
  if (progress > 1) progress = 1;
  const circle = document.querySelector('.countdown-progress');
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  circle.style.strokeDasharray = circumference;
  circle.style.strokeDashoffset = circumference * (1 - progress);
  // Highlight active prayer
  prayerItems.forEach((item, i) => {
    if (i === prevIndex) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}
setInterval(updateCountdown, 1000);

function calcLastThird() {
  if (!prayersWithTahajjud.length) return;
  const fajr = prayersWithTahajjud[0].time.split(':').map(Number);
  const maghrib = prayersWithTahajjud[4].time.split(':').map(Number);
  const maghribDate = new Date();
  maghribDate.setHours(maghrib[0], maghrib[1], 0, 0);
  const fajrDate = new Date();
  fajrDate.setDate(fajrDate.getDate() + 1);
  fajrDate.setHours(fajr[0], fajr[1], 0, 0);
  const nightDuration = (fajrDate - maghribDate);
  const lastThirdStart = new Date(fajrDate - nightDuration / 3);
  lastThirdTimeEl.textContent = `${lastThirdStart.getHours().toString().padStart(2, '0')}:${lastThirdStart.getMinutes().toString().padStart(2, '0')} - ${prayersWithTahajjud[0].time}`;
}

// --- Date navigation triggers API fetch ---
prevDateBtn.onclick = () => { currentDate.setDate(currentDate.getDate() - 1); updateDates(); fetchPrayerTimes(currentDate); };
nextDateBtn.onclick = () => { currentDate.setDate(currentDate.getDate() + 1); updateDates(); fetchPrayerTimes(currentDate); };

// --- On load, fetch prayer times ---
fetchPrayerTimes(currentDate);

// --- Local Storage Caching ---
function cachePrayerTimes(times) {
  localStorage.setItem('prayerTimes', JSON.stringify(times));
}
function getCachedPrayerTimes() {
  return JSON.parse(localStorage.getItem('prayerTimes'));
}

// --- Firebase Auth (basic UI prompt) ---
function showAuthPrompt() {
  const email = prompt('Enter email:');
  const password = prompt('Enter password:');
  signInWithEmailAndPassword(auth, email, password)
    .catch(() => {
      createUserWithEmailAndPassword(auth, email, password);
    });
}
onAuthStateChanged(auth, user => {
  if (!user) showAuthPrompt();
});

// --- Auth Modal Logic ---
const authModal = document.getElementById('auth-modal');
const authEmail = document.getElementById('auth-email');
const authPassword = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authSubmit = document.getElementById('auth-submit');
const authSwitchBtn = document.getElementById('auth-switch-btn');
const authSwitchText = document.getElementById('auth-switch-text');
const authModalTitle = document.getElementById('auth-modal-title');

let isLoginMode = true;
function showAuthModal() {
  authModal.style.display = 'flex';
  authError.textContent = '';
  authEmail.value = '';
  authPassword.value = '';
  isLoginMode = true;
  updateAuthMode();
  // Hide app sections and nav
  Object.values(sections).forEach(sec => sec.style.display = 'none');
  document.querySelector('.bottom-nav').style.display = 'none';
  logoutBtn.style.display = 'none';
}
function hideAuthModal() {
  authModal.style.display = 'none';
  // Show app sections and nav
  showSection('home');
  document.querySelector('.bottom-nav').style.display = '';
  logoutBtn.style.display = '';
}
function updateAuthMode() {
  if (isLoginMode) {
    authModalTitle.textContent = 'Login';
    authSubmit.textContent = 'Login';
    authSwitchText.textContent = "Don't have an account?";
    authSwitchBtn.textContent = 'Sign up';
  } else {
    authModalTitle.textContent = 'Sign Up';
    authSubmit.textContent = 'Sign Up';
    authSwitchText.textContent = 'Already have an account?';
    authSwitchBtn.textContent = 'Login';
  }
}
authSwitchBtn.onclick = () => {
  isLoginMode = !isLoginMode;
  updateAuthMode();
  authError.textContent = '';
};
authSubmit.onclick = async () => {
  const email = authEmail.value.trim();
  const password = authPassword.value;
  if (!email || !password) {
    authError.textContent = 'Please enter email and password.';
    return;
  }
  if (password.length < 6) {
    authError.textContent = 'Password must be at least 6 characters.';
    return;
  }
  try {
    if (isLoginMode) {
      await signInWithEmailAndPassword(auth, email, password);
    } else {
      await createUserWithEmailAndPassword(auth, email, password);
    }
    hideAuthModal();
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      authError.textContent = 'User not found.';
    } else if (e.code === 'auth/wrong-password') {
      authError.textContent = 'Wrong password.';
    } else if (e.code === 'auth/email-already-in-use') {
      authError.textContent = 'Email already in use.';
    } else if (e.code === 'auth/invalid-email') {
      authError.textContent = 'Invalid email.';
    } else {
      authError.textContent = e.message || 'Authentication error.';
    }
  }
};

onAuthStateChanged(auth, user => {
  if (!user) {
    showAuthModal();
    logoutBtn.style.display = 'none';
  } else {
    hideAuthModal();
    logoutBtn.style.display = '';
    fetchAndDisplayTracker();
    updateMarkPrayerBtn();
  }
});

// --- Prayer Logs (Firebase) ---
// --- Tracker/Rewards Logic ---
const rewardsPointsEl = document.getElementById('rewards-points');
const streakCountEl = document.getElementById('streak-count');
const trackerLogTableBody = document.querySelector('#tracker-log-table tbody');
const streakProgress = document.getElementById('streak-progress');
const streakBadgesRow = document.getElementById('streak-badges-row');

let rewards = 0;
let streak = 0;

function updateStreakGamification() {
  // Progress bar: 0-3, 3-7, 7-30, 30-100, 100+
  let max = 3;
  if (streak >= 100) max = 100;
  else if (streak >= 30) max = 100;
  else if (streak >= 7) max = 30;
  else if (streak >= 3) max = 7;
  streakProgress.style.width = Math.min((streak / max) * 100, 100) + '%';
  // Badges
  let badges = '';
  if (streak >= 3) badges += '<span class="badge">🥉 3-Day Streak</span> ';
  if (streak >= 7) badges += '<span class="badge">🥈 7-Day Streak</span> ';
  if (streak >= 30) badges += '<span class="badge">🏅 30-Day Streak</span> ';
  if (streak >= 100) badges += '<span class="badge">🏆 100-Day Streak</span> ';
  if (!badges) badges = '<span style="color:#888;font-size:0.98em;">Earn streak badges by praying all 5 for consecutive days!</span>';
  streakBadgesRow.innerHTML = badges;
}

function getLevelFromXP(xp) {
  // Example: Level 1: 0, 2: 50, 3: 100, 4: 200, 5: 350, 6: 550, ...
  let level = 1, next = 50;
  while (xp >= next) {
    level++;
    xp -= next;
    next = Math.floor(next * 1.5);
  }
  return { level, xpToNext: next, xpInLevel: xp };
}

function showLevelUp(level) {
  // Simple popup for now
  alert(`🎉 Level Up! You reached Level ${level}!`);
}

// --- Motivational Toast Popup ---
const toastPopup = document.getElementById('toast-popup');
function showToast(msg, color = '#6ee7b7') {
  toastPopup.textContent = msg;
  toastPopup.style.background = '#222c';
  toastPopup.style.color = color;
  toastPopup.classList.add('show');
  setTimeout(() => toastPopup.classList.remove('show'), 2600);
}
const prayedMsgs = [
  'MashaAllah! Keep it up! 🌟',
  'Allah loves those who are consistent in prayer.',
  'Great job! May Allah accept your Salah.',
  'You are building a beautiful habit! 💚',
  'Every prayer brings you closer to Allah.',
  'Consistency is the key to success!',
  'May your prayers bring you peace and blessings.',
  'You are inspiring! Keep going!',
  'BarakAllahu feek!'
];
const missedMsgs = [
  'Don’t give up! Tomorrow is a new day.',
  'Every day is a new chance to improve.',
  'Allah is Most Merciful. Try again!',
  'Missing one prayer doesn’t define you.',
  'Stay motivated! You can do it.',
  'Reflect, reset, and keep moving forward.',
  'Your effort counts. Never lose hope.'
];

// --- Log Prayer with Status ---
const tahajjudMsgs = [
  'SubhanAllah! Tahajjud is a special gift. 🌙',
  'You woke up for Tahajjud! May Allah grant your duas.',
  'The night prayer brings light to your heart.',
  'You are among the blessed who remember Allah at night.',
  'Tahajjud is a sign of true devotion. Keep it up!',
  'May Allah answer your secret prayers. 💖',
  'You are building a powerful connection with Allah.'
];
function logPrayerStatus(prayerName, status) {
  const user = auth.currentUser;
  if (!user) return;
  const today = new Date().toISOString().slice(0,10);
  set(ref(db, `users/${user.uid}/logs/${today}/${prayerName}`), status).then(() => {
    let isTahajjud = (prayerName === 'Tahajjud');
    if (status === 'prayed') {
      // Increment rewards only for prayed
      get(ref(db, `users/${user.uid}/rewards`)).then(snap => {
        let points = snap.exists() ? snap.val() : 0;
        points += isTahajjud ? 20 : 10;
        set(ref(db, `users/${user.uid}/rewards`), points).then(() => {
          rewardsPointsEl.textContent = points;
        });
      });
      // Increment XP
      get(ref(db, `users/${user.uid}/xp`)).then(snap => {
        let xp = snap.exists() ? snap.val() : 0;
        const before = getLevelFromXP(xp).level;
        xp += isTahajjud ? 20 : 10;
        const after = getLevelFromXP(xp).level;
        set(ref(db, `users/${user.uid}/xp`), xp).then(() => {
          if (after > before) showLevelUp(after);
          fetchAndDisplayTracker();
        });
      });
      // Motivational toast
      if (isTahajjud) {
        showToast(tahajjudMsgs[Math.floor(Math.random()*tahajjudMsgs.length)], '#a78bfa');
      } else {
        showToast(prayedMsgs[Math.floor(Math.random()*prayedMsgs.length)], '#6ee7b7');
      }
    } else {
      fetchAndDisplayTracker();
      showToast(missedMsgs[Math.floor(Math.random()*missedMsgs.length)], '#ff6b6b');
    }
    updateMarkPrayerBtn();
  });
}

// --- Badges & Gamification ---
const trackerSection = document.getElementById('tracker-section');
let badges = [];
function updateBadgesDisplay() {
  let badgeHtml = '';
  if (streak >= 7) badgeHtml += '<span class="badge">🔥 7-Day Streak</span> ';
  if (rewards >= 500) badgeHtml += '<span class="badge">💎 500 Rewards</span> ';
  if (rewards >= 100) badgeHtml += '<span class="badge">⭐ 100 Rewards</span> ';
  // Count total prayers
  const user = auth.currentUser;
  if (!user) return;
  get(ref(db, `users/${user.uid}/logs`)).then(snap => {
    let total = 0;
    const logs = snap.val() || {};
    Object.values(logs).forEach(day => {
      total += Object.values(day).filter(Boolean).length;
    });
    if (total >= 100) badgeHtml += '<span class="badge">🏅 100 Prayers</span> ';
    if (total >= 50) badgeHtml += '<span class="badge">🥉 50 Prayers</span> ';
    document.getElementById('rewards-display').innerHTML += '<div id="badges-row">' + badgeHtml + '</div>';
  });
}
// Add badge styles
if (!document.getElementById('badge-style')) {
  const style = document.createElement('style');
  style.id = 'badge-style';
  style.textContent = `.badge { display:inline-block; background:#222; color:#6ee7b7; border-radius:12px; padding:4px 12px; margin:2px; font-size:0.95em; font-weight:600; box-shadow:0 2px 8px #0002; }`;
  document.head.appendChild(style);
}
// Update badges when tracker is shown
function trackerWithBadges() {
  fetchAndDisplayTracker();
  setTimeout(updateBadgesDisplay, 500); // Wait for rewards/tracker to update
}
navBtns[3].removeEventListener('click', fetchAndDisplayTracker);
navBtns[3].addEventListener('click', trackerWithBadges); 

// --- Tracker/Rewards/XP/Level Logic ---
function fetchAndDisplayTracker() {
  const user = auth.currentUser;
  if (!user) return;
  // Fetch last 7 days logs
  const today = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }
  get(ref(db, `users/${user.uid}/logs`)).then(snap => {
    const logs = snap.val() || {};
    let newStreak = 0;
    let maxStreak = 0;
    let tempStreak = 0;
    trackerLogTableBody.innerHTML = '';
    for (let i = 0; i < days.length; i++) {
      const date = days[i];
      const prayers = logs[date] || {};
      const row = document.createElement('tr');
      row.innerHTML = `<td>${date}</td>` +
        ['Tahajjud','Fajr','Dhuhr','Asr','Maghrib','Isha'].map(p => {
          if (prayers[p] === 'prayed') return `<td style='color:#6ee7b7;font-weight:bold;'>✅</td>`;
          if (prayers[p] === 'missed') return `<td style='color:#ff6b6b;font-weight:bold;'>❌</td>`;
          return `<td></td>`;
        }).join('');
      trackerLogTableBody.appendChild(row);
      // Streak logic: all 6 prayers done (prayed only)
      if (['Tahajjud','Fajr','Dhuhr','Asr','Maghrib','Isha'].every(p => prayers[p] === 'prayed')) {
        tempStreak++;
        if (i === 0) newStreak = tempStreak;
      } else {
        tempStreak = 0;
      }
      if (tempStreak > maxStreak) maxStreak = tempStreak;
    }
    streak = newStreak;
    streakCountEl.textContent = streak;
    updateStreakGamification();
  });
  // Fetch rewards
  get(ref(db, `users/${user.uid}/rewards`)).then(snap => {
    rewards = snap.exists() ? snap.val() : 0;
    rewardsPointsEl.textContent = rewards;
  });
  // Fetch XP/Level
  get(ref(db, `users/${user.uid}/xp`)).then(snap => {
    let xp = snap.exists() ? snap.val() : 0;
    const { level, xpToNext, xpInLevel } = getLevelFromXP(xp);
    levelNumEl.textContent = level;
    xpPointsEl.textContent = xp;
    xpProgress.style.width = Math.min((xpInLevel / xpToNext) * 100, 100) + '%';
  });
}

// Update logPrayer to increment rewards and show message
function logPrayer(prayerName) {
  const user = auth.currentUser;
  if (!user) return;
  const today = new Date().toISOString().slice(0,10);
  set(ref(db, `users/${user.uid}/logs/${today}/${prayerName}`), true).then(() => {
    // Increment rewards
    get(ref(db, `users/${user.uid}/rewards`)).then(snap => {
      let points = snap.val() || 0;
      points += 10; // 10 points per prayer
      set(ref(db, `users/${user.uid}/rewards`), points).then(() => {
        rewardsPointsEl.textContent = points;
        // Show congratulatory message
        alert('Mubarak ho! Aapko 10 rewards mile.');
        fetchAndDisplayTracker();
      });
    });
  });
}

// When switching to tracker section, refresh data
navBtns[3].addEventListener('click', fetchAndDisplayTracker);
// On login, also fetch tracker
onAuthStateChanged(auth, user => { if (user) fetchAndDisplayTracker(); });

// --- Notification Bell (Browser Notification) ---
const bellBtns = document.querySelectorAll('.bell-btn');
bellBtns.forEach((btn, i) => {
  btn.onclick = e => {
    e.stopPropagation();
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') {
        alert(`You will be notified for ${prayersWithTahajjud[i].name}`);
      }
    });
  };
});

// --- 30-Day Button ---
document.querySelector('.thirty-day-btn').onclick = () => {
  alert('30-Day Prayer Times coming soon!');
};

// --- Mark as Prayed Button Logic ---
const markPrayerBtn = document.getElementById('mark-prayer-btn');
const markMissedBtn = document.getElementById('mark-missed-btn');

// --- Mark as Prayed/Missed Button Logic ---
let currentActivePrayer = null;

function updateMarkPrayerBtn() {
  if (!prayersWithTahajjud.length) {
    markPrayerBtn.style.display = 'none';
    markMissedBtn.style.display = 'none';
    prayerStatusLabel.textContent = '';
    return;
  }
  const now = new Date();
  let activeIndex = -1;
  for (let i = 0; i < prayersWithTahajjud.length; i++) {
    const [h, m] = prayersWithTahajjud[i].time.split(':').map(Number);
    const prayerTime = new Date(now);
    prayerTime.setHours(h, m, 0, 0);
    if (prayerTime > now) {
      activeIndex = (i - 1 + prayersWithTahajjud.length) % prayersWithTahajjud.length;
      break;
    }
  }
  if (activeIndex === -1) activeIndex = prayersWithTahajjud.length - 1;
  currentActivePrayer = prayersWithTahajjud[activeIndex].name;
  if (!currentActivePrayer) return;
  const user = auth.currentUser;
  if (!user) {
    markPrayerBtn.style.display = 'none';
    markMissedBtn.style.display = 'none';
    prayerStatusLabel.textContent = '';
    return;
  }
  const today = new Date().toISOString().slice(0,10);
  get(ref(db, `users/${user.uid}/logs/${today}/${currentActivePrayer}`)).then(snap => {
    if (snap.exists()) {
      const status = snap.val();
      markPrayerBtn.style.display = 'none';
      markMissedBtn.style.display = 'none';
      if (status === 'prayed') {
        prayerStatusLabel.textContent = `You marked this as Prayed ✅`;
        prayerStatusLabel.style.color = '#6ee7b7';
      } else if (status === 'missed') {
        prayerStatusLabel.textContent = `You marked this as Missed ❌`;
        prayerStatusLabel.style.color = '#ff6b6b';
      } else {
        prayerStatusLabel.textContent = '';
      }
    } else {
      markPrayerBtn.style.display = '';
      markMissedBtn.style.display = '';
      markPrayerBtn.textContent = `Mark ${currentActivePrayer} as Prayed`;
      markMissedBtn.textContent = `Mark ${currentActivePrayer} as Missed`;
      markPrayerBtn.disabled = false;
      markMissedBtn.disabled = false;
      prayerStatusLabel.textContent = '';
    }
  });
}
setInterval(updateMarkPrayerBtn, 5000);
updateMarkPrayerBtn();

markPrayerBtn.onclick = () => {
  if (currentActivePrayer) logPrayerStatus(currentActivePrayer, 'prayed');
  markPrayerBtn.style.display = 'none';
  markMissedBtn.style.display = 'none';
};
markMissedBtn.onclick = () => {
  if (currentActivePrayer) logPrayerStatus(currentActivePrayer, 'missed');
  markPrayerBtn.style.display = 'none';
  markMissedBtn.style.display = 'none';
};

logoutBtn.onclick = async () => {
  try {
    await window.FirebaseExports.signOut(auth);
  } catch (e) {}
  showAuthModal();
  Object.values(sections).forEach(sec => sec.style.display = 'none');
  document.querySelector('.bottom-nav').style.display = 'none';
  logoutBtn.style.display = 'none';
}; 

// --- Quran Audio Section Logic (multi-para support) ---
const quranAudioList = document.getElementById('quran-audio-list');
const quranAudioSource = document.getElementById('quran-audio-source');
const quranAudioPlayer = document.getElementById('quran-audio-player');
const quranXpProgress = document.getElementById('quran-xp-progress');
let lastQuranPos = 0;
let lastQuranXp = 0;
let quranXpInterval = null;

// List of available Para files (update this array if you add/remove files)
const QURAN_PARAS = [
  { file: "Quran para's urdu/Quran Para 1 With Urdu Translation _ Quran Urdu Translation (online-audio-converter.com).mp3", label: 'Para 1 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 2 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 2 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 3 With Urdu Translation  Quran Urdu Translation_2.mp3", label: 'Para 3 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 4 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 4 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 5 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 5 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 6 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 6 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 7 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 7 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 8 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 8 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 9 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 9 - Urdu Translation' },
  { file: "Quran para's urdu/Quran Para 10 With Urdu Translation  Quran Urdu Translation.mp3", label: 'Para 10 - Urdu Translation' },
];

let currentQuranPara = QURAN_PARAS[0].file;
let currentQuranParaLabel = QURAN_PARAS[0].label;

function renderQuranAudioList() {
  quranAudioList.innerHTML = '';
  QURAN_PARAS.forEach((para, idx) => {
    const btn = document.createElement('button');
    btn.className = 'thirty-day-btn';
    btn.style.marginBottom = '8px';
    btn.style.width = '100%';
    btn.textContent = para.label;
    btn.onclick = () => {
      // Collapse any open player
      document.querySelectorAll('.quran-audio-expand').forEach(div => {
        div.style.maxHeight = '0px';
        setTimeout(() => div.remove(), 300);
      });
      // Create expandable div
      const expandDiv = document.createElement('div');
      expandDiv.className = 'quran-audio-expand';
      expandDiv.style.overflow = 'hidden';
      expandDiv.style.transition = 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)';
      expandDiv.style.maxHeight = '0px';
      expandDiv.style.background = 'rgba(52,211,153,0.08)';
      expandDiv.style.borderRadius = '16px';
      expandDiv.style.margin = '8px 0 16px 0';
      expandDiv.style.padding = '0 8px';
      // Move player and XP progress into this div
      expandDiv.appendChild(quranAudioPlayer);
      expandDiv.appendChild(quranXpProgress);
      btn.after(expandDiv);
      setTimeout(() => {
        expandDiv.style.maxHeight = '300px';
      }, 10);
      currentQuranPara = para.file;
      currentQuranParaLabel = para.label;
      quranAudioSource.src = para.file;
      quranAudioPlayer.load();
      loadQuranAudioProgress();
      quranAudioPlayer.play();
      highlightCurrentPara();
    };
    btn.id = 'quran-audio-btn-' + (idx+1);
    quranAudioList.appendChild(btn);
  });
}
function highlightCurrentPara() {
  QURAN_PARAS.forEach((_, idx) => {
    const btn = document.getElementById('quran-audio-btn-' + (idx+1));
    if (btn) btn.style.background = (QURAN_PARAS[idx].file === currentQuranPara) ? '#6ee7b7' : '';
    if (btn) btn.style.color = (QURAN_PARAS[idx].file === currentQuranPara) ? '#222' : '';
  });
}
renderQuranAudioList();
quranAudioSource.src = currentQuranPara;
quranAudioPlayer.load();

// Resume from last position per Para
function loadQuranAudioProgress() {
  const user = auth.currentUser;
  if (!user) return;
  get(ref(db, `users/${user.uid}/quranAudio/${btoa(currentQuranPara)}`)).then(snap => {
    const data = snap.val() || {};
    lastQuranPos = data.position || 0;
    lastQuranXp = data.xp || 0;
    quranAudioPlayer.currentTime = lastQuranPos;
    quranXpProgress.textContent = `${currentQuranParaLabel}: XP ${lastQuranXp}`;
  });
}
// Save position and XP per Para
function saveQuranAudioProgress(pos, xp) {
  const user = auth.currentUser;
  if (!user) return;
  set(ref(db, `users/${user.uid}/quranAudio/${btoa(currentQuranPara)}`), { position: pos, xp: xp });
}
// XP gain logic per Para
quranAudioPlayer.addEventListener('play', () => {
  clearInterval(quranXpInterval);
  quranXpInterval = setInterval(() => {
    const user = auth.currentUser;
    if (!user) return;
    lastQuranPos = quranAudioPlayer.currentTime;
    // Every 10s, +1 XP
    if (Math.floor(quranAudioPlayer.currentTime) % 10 === 0) {
      lastQuranXp++;
      quranXpProgress.textContent = `${currentQuranParaLabel}: XP ${lastQuranXp}`;
      // Add to global XP/level as well
      get(ref(db, `users/${user.uid}/xp`)).then(snap => {
        let xp = snap.exists() ? snap.val() : 0;
        xp++;
        set(ref(db, `users/${user.uid}/xp`), xp);
      });
    }
    saveQuranAudioProgress(lastQuranPos, lastQuranXp);
  }, 1000);
});
quranAudioPlayer.addEventListener('pause', () => {
  clearInterval(quranXpInterval);
  saveQuranAudioProgress(quranAudioPlayer.currentTime, lastQuranXp);
});
quranAudioPlayer.addEventListener('ended', () => {
  clearInterval(quranXpInterval);
  saveQuranAudioProgress(quranAudioPlayer.duration, lastQuranXp);
});

onAuthStateChanged(auth, user => {
  if (user) loadQuranAudioProgress();
}); 

// --- Good Deed Cards Logic ---
const goodDeedBtn = document.getElementById('good-deed-btn');
const goodDeedModal = document.getElementById('good-deed-modal');
const goodDeedModalClose = document.getElementById('good-deed-modal-close');
const goodDeedCardTitle = document.getElementById('good-deed-card-title');
const goodDeedCardDesc = document.getElementById('good-deed-card-desc');
const goodDeedCompleteBtn = document.getElementById('good-deed-complete-btn');
const goodDeedReflection = document.getElementById('good-deed-reflection');
const goodDeedSaveReflection = document.getElementById('good-deed-save-reflection');

const GOOD_DEED_CARDS = [
  { title: 'Muskurana', desc: 'Kisi ko dekh kar muskurain, yeh bhi sadqa hai.' },
  { title: 'Ghar walon ki madad', desc: 'Ghar ke kisi fard ki kisi kaam mein madad karein.' },
  { title: 'Surah Ikhlas 3 martaba', desc: 'Surah Ikhlas teen dafa parhein, poore Quran ka sawab milega.' },
  { title: 'Dost ke liye dua', desc: 'Apne kisi dost ke liye dil se dua karein.' },
  { title: 'Sadqa dena', desc: 'Kisi gareeb ko ya masjid mein chhota sa sadqa dein.' },
  { title: 'Kisi ko maaf karna', desc: 'Kisi ko Allah ki khatir maaf kar dein.' },
  { title: 'Quran ka aik safha', desc: 'Quran ka kam az kam aik safha parhein.' },
  { title: '100 martaba Astaghfirullah', desc: '100 dafa “Astaghfirullah” parhein.' },
  { title: 'Rishtedaron se rabta', desc: 'Kisi rishtedar ko call ya message karein.' },
  { title: 'Islami paigham share karna', desc: 'Kisi ko hadith ya Quran ki ayat bhejein.' },
  { title: 'Pani pilana', desc: 'Kisi ko thanda pani pilain.' },
  { title: 'Choti si madad', desc: 'Kisi ki choti si madad karein, jaise darwaza kholna.' },
  { title: 'Subah Bismillah parhna', desc: 'Subah uth kar “Bismillah” parhein.' },
  { title: 'Kisi ki tareef karna', desc: 'Kisi ki achi baat ki tareef karein.' },
  { title: 'Apne liye dua', desc: 'Apne liye bhi Allah se dua karein.' },
  { title: 'Kisi ko salam karna', desc: 'Aaj kam az kam 5 logon ko salam karein.' },
  { title: 'Masjid ki safai', desc: 'Masjid ya ghar ki safai mein hissa lein.' },
  { title: 'Buzurg ki madad', desc: 'Kisi buzurg ki madad karein.' },
  { title: 'Choti bachon se pyaar', desc: 'Chote bachon se pyaar se pesh aayen.' },
  { title: 'Kisi ki himmat barhana', desc: 'Kisi ko positive baat keh kar himmat barhain.' },
  { title: 'Apne parents ki khidmat', desc: 'Aaj parents ki koi khidmat karein.' },
  { title: 'Kisi ki ghalti ko nazarandaz', desc: 'Kisi ki choti ghalti ko maaf kar dein.' },
  { title: 'Subah ki dua', desc: 'Subah uth kar Allah ka shukar ada karein.' },
  { title: 'Kisi ko duaon mein yaad rakhna', desc: 'Aaj kisi ko apni duaon mein yaad rakhein.' },
  { title: 'Kisi ko khush karna', desc: 'Kisi ko hansane ki koshish karein.' },
  { title: 'Apne liye maghfirat ki dua', desc: 'Allah se apni maghfirat ki dua karein.' },
  { title: 'Kisi ki madad bina bataye', desc: 'Chupke se kisi ki madad karein.' },
  { title: 'Apne ghar walon ko shukriya', desc: 'Ghar walon ka shukriya ada karein.' },
  { title: 'Kisi ko gift dena', desc: 'Kisi ko chota sa gift dein.' },
  { title: 'Apne liye ilm hasil karna', desc: 'Aaj kuch naya seekhein.' },
  { title: 'Kisi ki burai se bachna', desc: 'Aaj kisi ki burai na karein.' },
  { title: 'Kisi ki madad ki niyyat', desc: 'Dil se sab ki madad ki niyyat karein.' },
  { title: 'Apne liye sabr ki dua', desc: 'Allah se sabr ki dua karein.' },
  { title: 'Kisi ko Quran sunana', desc: 'Kisi ko Quran ki tilawat sunayein.' },
  { title: 'Kisi ki galti ko chhupa lena', desc: 'Kisi ki ghalti ko sab ke samne na laayen.' },
  { title: 'Apne liye barkat ki dua', desc: 'Allah se rizq mein barkat ki dua karein.' },
  { title: 'Kisi ko positive msg bhejna', desc: 'Kisi ko positive msg ya quote bhejein.' },
  { title: 'Apne liye sehat ki dua', desc: 'Allah se sehat ki dua karein.' },
  { title: 'Kisi ki tareef sab ke samne', desc: 'Kisi ki achi baat sab ke samne bayan karein.' },
  { title: 'Apne liye hidayat ki dua', desc: 'Allah se hidayat ki dua karein.' },
  { title: 'Kisi ko muskurahat dena', desc: 'Kisi ko hansane ki koshish karein.' },
  { title: 'Apne liye duaon ki darkhwast', desc: 'Doston se apne liye dua ki darkhwast karein.' },
  { title: 'Kisi ki madad karne ki dua', desc: 'Allah se madad karne ki taufeeq ki dua karein.' },
  { title: 'Apne liye dosti ki dua', desc: 'Allah se ache doston ki dua karein.' },
  { title: 'Kisi ko Quran ka paigham', desc: 'Kisi ko Quran ki ayat ka paigham dein.' },
  { title: 'Apne liye imaan ki dua', desc: 'Allah se imaan ki mazbooti ki dua karein.' },
  { title: 'Kisi ko chai pilana', desc: 'Kisi ko chai ya cold drink pilain.' },
  { title: 'Apne liye barkat ki dua', desc: 'Allah se har kaam mein barkat ki dua karein.' },
  { title: 'Kisi ko duaon mein yaad rakhna', desc: 'Kisi ko apni duaon mein yaad rakhein.' },
  { title: 'Apne liye maghfirat ki dua', desc: 'Allah se apni maghfirat ki dua karein.' },
  { title: 'Kisi ki madad bina bataye', desc: 'Chupke se kisi ki madad karein.' },
  { title: 'Apne ghar walon ko shukriya', desc: 'Ghar walon ka shukriya ada karein.' },
  { title: 'Kisi ko gift dena', desc: 'Kisi ko chota sa gift dein.' },
  { title: 'Apne liye ilm hasil karna', desc: 'Aaj kuch naya seekhein.' },
  { title: 'Kisi ki burai se bachna', desc: 'Aaj kisi ki burai na karein.' },
  { title: 'Kisi ki madad ki niyyat', desc: 'Dil se sab ki madad ki niyyat karein.' },
  { title: 'Apne liye sabr ki dua', desc: 'Allah se sabr ki dua karein.' },
  { title: 'Kisi ko Quran sunana', desc: 'Kisi ko Quran ki tilawat sunayein.' },
  { title: 'Kisi ki galti ko chhupa lena', desc: 'Kisi ki ghalti ko sab ke samne na laayen.' },
  { title: 'Apne liye barkat ki dua', desc: 'Allah se rizq mein barkat ki dua karein.' },
  { title: 'Kisi ko positive msg bhejna', desc: 'Kisi ko positive msg ya quote bhejein.' },
  { title: 'Apne liye sehat ki dua', desc: 'Allah se sehat ki dua karein.' },
  { title: 'Kisi ki tareef sab ke samne', desc: 'Kisi ki achi baat sab ke samne bayan karein.' },
  { title: 'Apne liye hidayat ki dua', desc: 'Allah se hidayat ki dua karein.' },
  { title: 'Kisi ko muskurahat dena', desc: 'Kisi ko hansane ki koshish karein.' },
  { title: 'Apne liye duaon ki darkhwast', desc: 'Doston se apne liye dua ki darkhwast karein.' },
  { title: 'Kisi ki madad karne ki dua', desc: 'Allah se madad karne ki taufeeq ki dua karein.' },
  { title: 'Apne liye dosti ki dua', desc: 'Allah se ache doston ki dua karein.' },
  { title: 'Kisi ko Quran ka paigham', desc: 'Kisi ko Quran ki ayat ka paigham dein.' },
  { title: 'Apne liye imaan ki dua', desc: 'Allah se imaan ki mazbooti ki dua karein.' },
  { title: 'Kisi ko chai pilana', desc: 'Kisi ko chai ya cold drink pilain.' },
  // ... (add up to 100 unique cards in this style)
];

function getUnlockedGoodDeedCount(rewards) {
  return Math.floor(rewards / 100);
}

function shuffleArray(arr) {
  // Fisher-Yates shuffle
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Show a random unlocked card (or last completed)
let currentGoodDeedIndex = 0;
let userGoodDeeds = [];

goodDeedBtn.onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;
  // Fetch rewards, completed cards, and cycle
  const rewardsSnap = await get(ref(db, `users/${user.uid}/rewards`));
  const rewards = rewardsSnap.exists() ? rewardsSnap.val() : 0;
  const unlockedCount = getUnlockedGoodDeedCount(rewards);
  let cycleSnap = await get(ref(db, `users/${user.uid}/goodDeedCycle`));
  let cycle = cycleSnap.exists() ? cycleSnap.val() : 1;
  let deedsSnap = await get(ref(db, `users/${user.uid}/goodDeeds`));
  userGoodDeeds = deedsSnap.exists() ? deedsSnap.val() : [];

  // If all cards completed, start new cycle
  if (userGoodDeeds.length === GOOD_DEED_CARDS.length && userGoodDeeds.every(d => d.completed)) {
    cycle++;
    await set(ref(db, `users/${user.uid}/goodDeedCycle`), cycle);
    // Shuffle and reset
    const shuffled = shuffleArray([...Array(GOOD_DEED_CARDS.length).keys()]);
    userGoodDeeds = shuffled.map(idx => ({ index: idx, completed: false, reflection: '' }));
    await set(ref(db, `users/${user.uid}/goodDeeds`), userGoodDeeds);
  }

  // If no cards unlocked yet
  if (unlockedCount === 0) {
    goodDeedCardTitle.textContent = 'No Good Deed Cards Yet';
    goodDeedCardDesc.textContent = 'Earn 100 rewards to unlock your first Good Deed Card!';
    goodDeedCompleteBtn.style.display = 'none';
    goodDeedReflection.value = '';
    goodDeedReflection.style.display = 'none';
    goodDeedSaveReflection.style.display = 'none';
    goodDeedModal.style.display = 'flex';
    return;
  }

  // Show the first incomplete card, or last completed
  let idx = userGoodDeeds.findIndex(d => !d.completed);
  if (idx === -1) idx = userGoodDeeds.length - 1;
  // Unlock new card if needed
  if (userGoodDeeds.length < unlockedCount) {
    // Find not-yet-unlocked indices in this cycle
    const available = [...Array(GOOD_DEED_CARDS.length).keys()].filter(i => !userGoodDeeds.some(d => d.index === i));
    const randomIdx = available[Math.floor(Math.random() * available.length)];
    userGoodDeeds.push({ index: randomIdx, completed: false, reflection: '' });
    await set(ref(db, `users/${user.uid}/goodDeeds`), userGoodDeeds);
    idx = userGoodDeeds.length - 1;
  }
  currentGoodDeedIndex = userGoodDeeds[idx].index;
  goodDeedCardTitle.textContent = GOOD_DEED_CARDS[currentGoodDeedIndex].title;
  goodDeedCardDesc.textContent = GOOD_DEED_CARDS[currentGoodDeedIndex].desc;
  goodDeedCompleteBtn.style.display = userGoodDeeds[idx].completed ? 'none' : '';
  goodDeedReflection.value = userGoodDeeds[idx].reflection || '';
  goodDeedReflection.style.display = '';
  goodDeedSaveReflection.style.display = '';
  goodDeedModal.style.display = 'flex';
};

goodDeedModalClose.onclick = () => {
  goodDeedModal.style.display = 'none';
};

goodDeedCompleteBtn.onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;
  const deedsSnap = await get(ref(db, `users/${user.uid}/goodDeeds`));
  userGoodDeeds = deedsSnap.exists() ? deedsSnap.val() : [];
  const idx = userGoodDeeds.findIndex(d => d.index === currentGoodDeedIndex);
  if (idx !== -1) {
    userGoodDeeds[idx].completed = true;
    set(ref(db, `users/${user.uid}/goodDeeds`), userGoodDeeds);
    showToast('MashaAllah! Good deed completed! 🌟', '#6ee7b7');
    goodDeedCompleteBtn.style.display = 'none';
  }
};

goodDeedSaveReflection.onclick = async () => {
  const user = auth.currentUser;
  if (!user) return;
  const deedsSnap = await get(ref(db, `users/${user.uid}/goodDeeds`));
  userGoodDeeds = deedsSnap.exists() ? deedsSnap.val() : [];
  const idx = userGoodDeeds.findIndex(d => d.index === currentGoodDeedIndex);
  if (idx !== -1) {
    userGoodDeeds[idx].reflection = goodDeedReflection.value;
    set(ref(db, `users/${user.uid}/goodDeeds`), userGoodDeeds);
    showToast('Reflection saved!', '#6ee7b7');
  }
}; 