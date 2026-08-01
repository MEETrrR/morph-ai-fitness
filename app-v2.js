/**
 * Main Application Logic - UI management, Auth, Membership, and calculations.
 */

const API_BASE = 'http://localhost:8000/api';

// Safe localStorage helper
function safeGet(key, fallback = null) {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
}
function safeSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { console.warn('localStorage full:', e.message); }
}
function safeRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

// Game state - initialized early for all modules
var gameState = safeGet("game_state") || { points: 0, earnedBadges: [], _musclesTrained: [], guideViews: 0, invited: 0 };

// HTML sanitizer for safe innerHTML
function sanitizeHTML(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

document.addEventListener('DOMContentLoaded', () => {
  // --- STATE MANAGEMENT ---
  gameState = safeGet("game_state") || { points: 0, earnedBadges: [], _musclesTrained: [], guideViews: 0, invited: 0 };
  let profile = safeGet('ai_fitness_profile');
  let history = safeGet('ai_fitness_history') || [];
  let authToken = safeGet('ai_fitness_token', null);
  let currentUser = safeGet('ai_fitness_user', null);
  const TOTAL_STEPS = 9;
  let wizStep = 0;
  let wizData = { gender: 'male', age: 21, height: 175, weight: 70, targetWeight: 65, goal: 'fat_loss', deadline: null, illness: '无' };
  let currentOffset = {};

  // --- DOM ELEMENTS ---
  const onboardingView = document.getElementById('onboardingView');
  const mainAppView = document.getElementById('mainAppView');

  // Wizard elements (must be before initApp)
  const wizPanels = document.getElementById('wizPanels');
  const wizProgressFill = document.getElementById('wizProgressFill');
  const wizStepLabel = document.getElementById('wizStepLabel');
  const btnWizBack = document.getElementById('btnWizBack');
  const btnWizNext = document.getElementById('btnWizNext');
  const wizDots = document.getElementById('wizDots');
  const btnWizStart = document.getElementById('btnWizStart');
  const wizSummary = document.getElementById('wizSummary');
  const btnSkipDeadline = document.getElementById('btnSkipDeadline');
  const btnSkipIllness = document.getElementById('btnSkipIllness');
  const wizDeadline = document.getElementById('wizDeadline');
  const wizIllness = document.getElementById('wizIllness');

  const sidebarGoalTitle = document.getElementById('sidebarGoalTitle');
  const sidebarProfileDesc = document.getElementById('sidebarProfileDesc');
  const pillWeight = document.getElementById('pillWeight');
  const pillTarget = document.getElementById('pillTarget');
  const pillIllness = document.getElementById('pillIllness');
  const deadlineDays = document.getElementById('deadlineDays');
  const deadlineProgressFill = document.getElementById('deadlineProgressFill');
  const meterStartWeight = document.getElementById('meterStartWeight');
  const meterTargetWeight = document.getElementById('meterTargetWeight');

  const membershipCard = document.getElementById('membershipCard');
  const memberStatusLabel = document.getElementById('memberStatusLabel');
  const memberExpireText = document.getElementById('memberExpireText');
  const upgradeBtn = document.getElementById('upgradeBtn');

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanels = document.querySelectorAll('.tab-panel');

  const checkInForm = document.getElementById('checkInForm');
  const ciWeight = document.getElementById('ciWeight');
  const ciWeightCondition = document.getElementById('ciWeightCondition');
  const ciState = document.getElementById('ciState');
  const ciBreakfast = document.getElementById('ciBreakfast');
  const ciLunch = document.getElementById('ciLunch');
  const ciDinner = document.getElementById('ciDinner');
  const ciExercise = document.getElementById('ciExercise');
  const ciFeedback = document.getElementById('ciFeedback');
  const ciGoalFlag = document.getElementById('ciGoalFlag');

  const planContent = document.getElementById('planContent');

  const aiLoading = document.getElementById('aiLoading');
  const aiReportOutput = document.getElementById('aiReportOutput');
  const btnCopyReport = document.getElementById('btnCopyReport');

  const historyList = document.getElementById('historyList');

  const settingsModal = document.getElementById('settingsModal');
  const settingsBtn = document.getElementById('settingsBtn');
  const closeSettings = document.getElementById('closeSettings');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const resetAppBtn = document.getElementById('resetAppBtn');
  
  const setAge = document.getElementById('setAge');
  const setHeight = document.getElementById('setHeight');
  const setWeight = document.getElementById('setWeight');
  const setTargetWeight = document.getElementById('setTargetWeight');
  const setDeadline = document.getElementById('setDeadline');
  const setGoal = document.getElementById('setGoal');
  const setIllnesses = document.getElementById('setIllnesses');

  const setEmail = document.getElementById('setEmail');
  const setPassword = document.getElementById('setPassword');
  const loginBtn = document.getElementById('loginBtn');
  const registerBtn = document.getElementById('registerBtn');
  const authMsg = document.getElementById('authMsg');
  const authBlock = document.getElementById('authBlock');
  const memberBlock = document.getElementById('memberBlock');
  const memberPlanName = document.getElementById('memberPlanName');
  const memberPlanDesc = document.getElementById('memberPlanDesc');
  const upgradeBtnSettings = document.getElementById('upgradeBtnSettings');
  const logoutBtn = document.getElementById('logoutBtn');

  const historyModal = document.getElementById('historyModal');
  const closeHistoryModal = document.getElementById('closeHistoryModal');
  const historyModalTitle = document.getElementById('historyModalTitle');
  const hmWeight = document.getElementById('hmWeight');
  const hmState = document.getElementById('hmState');
  const hmLunch = document.getElementById('hmLunch');
  const hmDinner = document.getElementById('hmDinner');
  const hmExercise = document.getElementById('hmExercise');
  const hmFeedback = document.getElementById('hmFeedback');
  const hmFlag = document.getElementById('hmFlag');
  const hmAuditContent = document.getElementById('hmAuditContent');

  const upgradeModal = document.getElementById('upgradeModal');
  const closeUpgradeModal = document.getElementById('closeUpgradeModal');
  const startPaymentBtn = document.getElementById('startPaymentBtn');

  const themeToggle = document.getElementById('themeToggle');

  const segBtnActions = document.getElementById('segBtnActions');
  const segBtnHiit = document.getElementById('segBtnHiit');
  const segBtnVideos = document.getElementById('segBtnVideos');
  const subviewActions = document.getElementById('subviewActions');
  const subviewHiit = document.getElementById('subviewHiit');
  const subviewVideos = document.getElementById('subviewVideos');
  const actionsGrid = document.getElementById('actionsGrid');
  const actionsSubtabs = document.getElementById('actionsSubtabs');

  // --- INITIALIZATION ---
  initApp();

  function initApp() {
    var ls = document.getElementById('loadingScreen');
    document.documentElement.setAttribute('data-theme', safeGet('ai_fitness_theme') || 'light');
    updateMembershipUI();
    if (profile && onboardingView && mainAppView) {
      if (ls) { ls.style.display = 'none'; }
      // Remove the empty container and footer that push content down
      var ctn = document.querySelector('.container'); if (ctn && ctn.parentNode) ctn.parentNode.removeChild(ctn);
      var ftr = document.querySelector('footer'); if (ftr && ftr.parentNode) ftr.parentNode.removeChild(ftr);
      // Move mainApp to body top and center
      document.body.appendChild(mainAppView);
      document.body.style.cssText = 'margin:0;padding:0;';
      mainAppView.style.cssText = 'display:flex;flex-direction:column;gap:2rem;max-width:1100px;width:100%;margin:0 auto;padding:2.5rem 1.5rem;min-height:100vh;box-sizing:border-box;';
      setupSidebar();
      generateDynamicPlan();
      renderHistoryList();
      // Welcome guide
      if (!safeGet('guide_done')) { setTimeout(function() { startGuide(); }, 800); }
      var lastWeight = history.length > 0 ? history[0].weight : profile.weight;
      if (ciWeight) ciWeight.value = lastWeight;
      var deadlineStr = profile.deadlineDate ? ('在 ' + profile.deadlineDate + ' 前') : '';
      var goalName = profile.goal === 'fat_loss' ? '减脂' : '增肌';
      if (ciGoalFlag) ciGoalFlag.value = deadlineStr + '杀到 ' + profile.targetWeight + ' kg | 强化' + goalName + '目标';
    } else if (onboardingView && mainAppView) {
      if (ls) ls.style.display = 'none';
      onboardingView.style.display = '';
      mainAppView.style.display = 'none';
      updateWizard();
    }
  }

  // --- AUTH & MEMBERSHIP ---
  function updateMembershipUI() {
    if (!membershipCard || !memberStatusLabel || !memberExpireText) return;
    if (authToken && currentUser) {
      const now = Date.now();
      const expired = currentUser.membership_expires_at ? new Date(currentUser.membership_expires_at).getTime() : 0;
      if (expired > now) {
        memberStatusLabel.innerText = '👑 付费会员';
        const days = Math.ceil((expired - now) / 86400000);
        memberExpireText.innerText = `剩余 ${days} 天`;
        membershipCard.style.border = '1px solid rgba(255,149,0,0.4)';
      } else {
        memberStatusLabel.innerText = '免费试用';
        memberExpireText.innerText = currentUser.is_trial ? '试用已过期，请升级' : '请升级会员';
      }
    } else {
      memberStatusLabel.innerText = '未登录';
      memberExpireText.innerText = '登录后解锁AI功能';
    }
  }

  function updateSettingsAuthUI() {
    if (!authBlock || !memberBlock) return;
    if (authToken && currentUser) {
      authBlock.style.display = 'none';
      memberBlock.style.display = 'flex';
      const now = Date.now();
      const expired = currentUser.membership_expires_at ? new Date(currentUser.membership_expires_at).getTime() : 0;
      if (expired > now) {
        memberPlanName.innerText = '👑 付费会员';
        memberPlanDesc.innerText = `有效期至 ${new Date(expired).toLocaleDateString('zh-CN')}`;
      } else {
        memberPlanName.innerText = '免费试用';
        const trialEnd = currentUser.trial_ends_at ? new Date(currentUser.trial_ends_at).getTime() : 0;
        const remaining = Math.max(0, Math.ceil((trialEnd - now) / 86400000));
        memberPlanDesc.innerText = `剩余 ${remaining} 天试用期`;
      }
    } else {
      authBlock.style.display = 'flex';
      memberBlock.style.display = 'none';
    }
  }

  async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = { 'Content-Type': 'application/json' };
    if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
    const opts = { method, headers };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${endpoint}`, opts);
    if (res.status === 401) {
      localStorage.removeItem('ai_fitness_token');
      localStorage.removeItem('ai_fitness_user');
      authToken = null;
      currentUser = null;
      updateMembershipUI();
      updateSettingsAuthUI();
      throw new Error('登录已过期，请重新登录');
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || `请求失败: ${res.status}`);
    }
    return res.json();
  }

  loginBtn.addEventListener('click', async () => {
    const email = setEmail.value.trim();
    const password = setPassword.value.trim();
    if (!email || !password) { authMsg.innerText = '请填写邮箱和密码'; return; }
    authMsg.innerText = '登录中...';
    try {
      const data = await apiCall('/auth/login', 'POST', { email, password });
      authToken = data.access_token;
      currentUser = data.user;
      localStorage.setItem('ai_fitness_token', authToken);
      localStorage.setItem('ai_fitness_user', JSON.stringify(currentUser));
      authMsg.innerText = '';
      showToast('登录成功！', 'success');
      updateMembershipUI();
      updateSettingsAuthUI();
      syncHistoryFromCloud();
    } catch (e) { authMsg.innerText = e.message; }
  });

  registerBtn.addEventListener('click', async () => {
    const email = setEmail.value.trim();
    const password = setPassword.value.trim();
    if (!email || !password) { authMsg.innerText = '请填写邮箱和密码'; return; }
    if (password.length < 6) { authMsg.innerText = '密码至少6位'; return; }
    authMsg.innerText = '注册中...';
    try {
      const data = await apiCall('/auth/register', 'POST', { email, password });
      authToken = data.access_token;
      currentUser = data.user;
      localStorage.setItem('ai_fitness_token', authToken);
      localStorage.setItem('ai_fitness_user', JSON.stringify(currentUser));
      authMsg.innerText = '';
      showToast('注册成功！赠送3天免费试用', 'success');
      updateMembershipUI();
      updateSettingsAuthUI();
    } catch (e) { authMsg.innerText = e.message; }
  });

  logoutBtn.addEventListener('click', () => {
    safeRemove('ai_fitness_token');
    safeRemove('ai_fitness_user');
    authToken = null;
    currentUser = null;
    showToast('已退出登录', 'info');
    updateMembershipUI();
    updateSettingsAuthUI();
  });

  const forgotPwBtn = document.getElementById('forgotPwBtn');
  if (forgotPwBtn) forgotPwBtn.addEventListener('click', async () => {
    const email = setEmail.value.trim();
    if (!email) { authMsg.innerText = '请先输入邮箱'; return; }
    try {
      const data = await apiCall('/auth/reset-password', 'POST', { email, password: '' });
      alert('新密码: ' + data.new_password + '\n\n请复制保存，登录后可修改。');
      authMsg.innerText = '';
    } catch (e) { authMsg.innerText = e.message; }
  });

  const deleteAccountBtn = document.getElementById('deleteAccountBtn');
  if (deleteAccountBtn) deleteAccountBtn.addEventListener('click', async () => {
    if (!confirm('⚠️ 确定要永久删除你的账户和所有数据吗？此操作不可恢复！')) return;
    if (!confirm('再次确认：所有打卡记录和身体数据将被永久删除。')) return;
    try {
      await apiCall('/auth/delete-account', 'DELETE');
      safeRemove('ai_fitness_token'); safeRemove('ai_fitness_user');
      safeRemove('ai_fitness_profile'); safeRemove('ai_fitness_history');
      authToken = null; currentUser = null; profile = null;
      showToast('账户已删除', 'info');
      location.reload();
    } catch (e) { showToast(e.message, 'error'); }
  });

  async function syncHistoryFromCloud() {
    try {
      const data = await apiCall('/checkins');
      if (data.checkins && data.checkins.length > 0) {
        history = data.checkins;
        localStorage.setItem('ai_fitness_history', JSON.stringify(history));
        renderHistoryList();
        setupSidebar();
      }
    } catch (e) { console.log('同步历史失败(离线模式):', e.message); }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = `
      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
      </svg>
    `;
    if (type === 'success') {
      icon = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
        </svg>
      `;
    } else if (type === 'error') {
      icon = `
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
      `;
    }

    toast.innerHTML = `${icon}<span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease forwards';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // --- THEME TOGGLE ---
  themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('ai_fitness_theme', newTheme);
    showToast(`主题已切换为 ${newTheme === 'dark' ? '暗黑太空灰' : '高级质感银'}`, 'success');
  });

  // --- ONBOARDING WIZARD ---

  // Recover wizard progress from sessionStorage if crashed
  const savedWiz = (() => { try { const d = sessionStorage.getItem('wiz_step'); return d ? JSON.parse(d) : null; } catch(e) { return null; } })();
  if (savedWiz && !profile) { wizStep = savedWiz.step; wizData = savedWiz.data || wizData; }

  // Dots
  for (let i = 0; i < TOTAL_STEPS; i++) {
    const dot = document.createElement("div");
    dot.className = "wiz-dot";
    dot.dataset.dot = i;
    wizDots.appendChild(dot);
  }

  function makePicker(listEl, min, max, stepVal, def) {
    const ITEM_H = 48;
    listEl.innerHTML = "";
    for (let j = 0; j < 3; j++) listEl.appendChild(Object.assign(document.createElement("div"), { className: "picker-item" }));
    for (let v = min; v <= max; v += stepVal) {
      const d = document.createElement("div"); d.className = "picker-item"; d.dataset.v = v;
      d.textContent = Number.isInteger(v) ? v : v.toFixed(1);
      listEl.appendChild(d);
    }
    for (let j = 0; j < 3; j++) listEl.appendChild(Object.assign(document.createElement("div"), { className: "picker-item" }));

    const win = listEl.parentElement;
    const idx = Math.round((def - min) / stepVal);
    const offset = idx * ITEM_H;
    currentOffset[listEl] = offset;
    listEl.style.transform = "translateY(" + (-offset) + "px)";

    win.addEventListener("wheel", (e) => {
      e.preventDefault();
      const items = listEl.querySelectorAll(".picker-item[data-v]");
      if (items.length === 0) return;
      const dir = e.deltaY > 0 ? 1 : -1;
      let cur = currentOffset[listEl] || 0;
      cur = Math.max(0, Math.min((items.length - 1) * ITEM_H, cur + dir * ITEM_H));
      currentOffset[listEl] = cur;
      listEl.style.transform = "translateY(" + (-cur) + "px)";
      const midIdx = Math.round(cur / ITEM_H);
      listEl.querySelectorAll(".picker-item[data-v]").forEach((it, i) => { it.classList.toggle("selected", i === midIdx); });
    }, { passive: false });

    let touchY = 0;
    win.addEventListener("touchstart", e => { touchY = e.touches[0].clientY; }, { passive: false });
    win.addEventListener("touchmove", e => {
      e.preventDefault();
      const diff = touchY - e.touches[0].clientY;
      const items = listEl.querySelectorAll(".picker-item[data-v]");
      if (items.length === 0) return;
      let cur = currentOffset[listEl] || 0;
      cur = Math.max(0, Math.min((items.length - 1) * ITEM_H, cur + diff * 0.5));
      currentOffset[listEl] = cur;
      listEl.style.transform = "translateY(" + (-cur) + "px)";
      touchY = e.touches[0].clientY;
      const midIdx = Math.round(cur / ITEM_H);
      listEl.querySelectorAll(".picker-item[data-v]").forEach((it, i) => { it.classList.toggle("selected", i === midIdx); });
    }, { passive: false });

    const items = listEl.querySelectorAll(".picker-item[data-v]");
    if (items[idx]) items[idx].classList.add("selected");
  }

  function readPickerValue(listEl) {
    const sel = listEl.querySelector(".picker-item.selected");
    return sel ? parseFloat(sel.dataset.v) : null;
  }

  function updateWizard() {
    // Persist to sessionStorage for crash recovery
    const pct = Math.round((wizStep / (TOTAL_STEPS - 1)) * 100);
    wizProgressFill.style.width = pct + "%";
    wizStepLabel.innerText = (wizStep + 1) + "/" + TOTAL_STEPS;

    try { sessionStorage.setItem('wiz_step', JSON.stringify({ step: wizStep, data: wizData })); } catch(e) {}

    document.querySelectorAll(".wiz-dot").forEach((dot, i) => {
      dot.classList.remove("done", "current");
      if (i < wizStep) dot.classList.add("done");
      if (i === wizStep) dot.classList.add("current");
    });

    document.querySelectorAll(".wiz-panel").forEach((p, i) => {
      p.classList.toggle("active", i === wizStep);
    });

    btnWizBack.disabled = wizStep === 0;
    if (wizStep >= TOTAL_STEPS - 1) {
      btnWizNext.style.display = "none";
      btnWizBack.style.display = "none";
    } else {
      btnWizNext.style.display = "";
      btnWizBack.style.display = "";
    }

    if (wizStep === 1) makePicker(document.querySelector("#picker1 .scroll-picker-list"), 12, 80, 1, wizData.age);
    if (wizStep === 2) makePicker(document.querySelector("#picker2 .scroll-picker-list"), 140, 220, 1, wizData.height);
    if (wizStep === 3) makePicker(document.querySelector("#picker3 .scroll-picker-list"), 30, 200, 0.5, wizData.weight);
    if (wizStep === 4) makePicker(document.querySelector("#picker4 .scroll-picker-list"), 30, 200, 0.5, wizData.targetWeight);

    if (wizStep === 8) {
      const gText = wizData.gender === "male" ? "男" : "女";
      const goalText = wizData.goal === "fat_loss" ? "🔥 无情减脂" : "💪 硬核增肌";
      const dlText = wizData.deadline || "长期战役";
      wizSummary.textContent = '';
      const items = [
        ['性别', gText], ['年龄', wizData.age + ' 岁'], ['身高', wizData.height + ' cm'],
        ['当前体重', wizData.weight + ' kg'], ['目标体重', wizData.targetWeight + ' kg'],
        ['核心目标', goalText], ['期望截止', dlText], ['伤病情况', wizData.illness]
      ];
      items.forEach(([label, val]) => {
        const div = document.createElement('div'); div.innerHTML = '<span>' + label + '</span>　' + val; wizSummary.appendChild(div);
      });
    }
  }

  btnWizNext.addEventListener("click", () => {
    const l1 = document.querySelector("#picker1 .scroll-picker-list"); if (l1) { const v = readPickerValue(l1); if (v) wizData.age = v; }
    const l2 = document.querySelector("#picker2 .scroll-picker-list"); if (l2) { const v = readPickerValue(l2); if (v) wizData.height = v; }
    const l3 = document.querySelector("#picker3 .scroll-picker-list"); if (l3) { const v = readPickerValue(l3); if (v) wizData.weight = v; }
    const l4 = document.querySelector("#picker4 .scroll-picker-list"); if (l4) { const v = readPickerValue(l4); if (v) wizData.targetWeight = v; }
    if (wizStep >= TOTAL_STEPS - 1) return;
    wizStep++;
    updateWizard();
  });

  btnWizBack.addEventListener("click", () => {
    if (wizStep <= 0) return;
    wizStep--;
    updateWizard();
  });

  document.querySelectorAll(".gender-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".gender-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      wizData.gender = card.dataset.gender;
    });
  });

  document.querySelectorAll(".goal-card").forEach(card => {
    card.addEventListener("click", () => {
      document.querySelectorAll(".goal-card").forEach(c => c.classList.remove("active"));
      card.classList.add("active");
      wizData.goal = card.dataset.goal;
    });
  });

  if (wizDeadline) wizDeadline.addEventListener("change", () => { wizData.deadline = wizDeadline.value; });
  if (btnSkipDeadline) btnSkipDeadline.addEventListener("click", () => { wizData.deadline = null; wizDeadline.value = ""; wizStep++; updateWizard(); });
  if (wizIllness) wizIllness.addEventListener("input", () => { wizData.illness = wizIllness.value.trim() || "无"; });
  if (btnSkipIllness) btnSkipIllness.addEventListener("click", () => { wizData.illness = "无"; wizStep++; updateWizard(); });

  btnWizStart.addEventListener("click", () => {
    if (wizDeadline && wizDeadline.value) wizData.deadline = wizDeadline.value;
    if (wizIllness && wizIllness.value.trim()) wizData.illness = wizIllness.value.trim();
    profile = { gender: wizData.gender, age: wizData.age, height: wizData.height, weight: wizData.weight, targetWeight: wizData.targetWeight, deadlineDate: wizData.deadline || null, goal: wizData.goal, illnesses: wizData.illness };
    safeSet("ai_fitness_profile", profile);
    showToast("运动底座加载完成！教练指令激活。", "success");
    initApp();
  });

  updateWizard();

  // --- SIDEBAR SETUP & CALCULATION ---
  function setupSidebar() {
    if (!profile) return;
    
    const goalText = profile.goal === 'fat_loss' ? '无情减脂舱' : '硬核增肌舱';
    sidebarGoalTitle.innerText = goalText;
    
    const genderChinese = profile.gender === 'male' ? '男' : '女';
    sidebarProfileDesc.innerText = `${genderChinese} | ${profile.age}岁 | ${profile.height}cm`;
    
    pillWeight.innerText = `初始: ${profile.weight} kg`;
    pillTarget.innerText = `目标: ${profile.targetWeight} kg`;
    pillIllness.innerText = profile.illnesses !== '无' ? `伤情: ${profile.illnesses}` : '无损伤';

    // Calculate deadline days
    let daysRemaining = 0;
    if (profile.deadlineDate) {
      const today = new Date();
      const deadline = new Date(profile.deadlineDate);
      const timeDiff = deadline.getTime() - today.getTime();
      daysRemaining = Math.max(0, Math.ceil(timeDiff / (1000 * 3600 * 24)));
      deadlineDays.innerText = `${daysRemaining} 天`;
    } else {
      deadlineDays.innerText = '长期战役';
    }

    // Set weight meter range
    meterStartWeight.innerText = `${profile.weight} kg`;
    meterTargetWeight.innerText = `${profile.targetWeight} kg`;

    // Calculate weight progress bar
    const currentWeight = history.length > 0 ? parseFloat(history[0].weight) : parseFloat(profile.weight);
    const initialWeight = parseFloat(profile.weight);
    const targetWeight = parseFloat(profile.targetWeight);
    
    let progress = 0;
    if (profile.goal === 'fat_loss') {
      if (initialWeight > targetWeight) {
        progress = ((initialWeight - currentWeight) / (initialWeight - targetWeight)) * 100;
      }
    } else {
      // Muscle gain
      if (targetWeight > initialWeight) {
        progress = ((currentWeight - initialWeight) / (targetWeight - initialWeight)) * 100;
      }
    }
    
    progress = Math.max(0, Math.min(100, Math.round(progress)));
    deadlineProgressFill.style.width = `${progress}%`;
  }

  // --- DYNAMIC PLAN GENERATOR (基于用户最后打卡反馈实时生成) ---
  function generateDynamicPlan() {
    if (!profile) return;

    const isMale = profile.gender === 'male';
    let bmr = 10 * profile.weight + 6.25 * profile.height - 5 * profile.age;
    bmr += isMale ? 5 : -161;

    const latestCheckIn = history.length > 0 ? history[0].checkIn : null;
    const lastWeight = profile.weight;
    const currentWeight = history.length > 0 ? history[0].weight : profile.weight;
    
    let activityMultiplier = 1.375;
    if (latestCheckIn) {
      const ex = (latestCheckIn.tonightExercise || '').toLowerCase();
      const fb = (latestCheckIn.exerciseFeedback || '').toLowerCase();
      if (ex.includes('休息') || fb.includes('休息')) activityMultiplier = 1.2;
      else if (ex.includes('健身房') || ex.includes('抗阻') || ex.includes('力量')) activityMultiplier = 1.55;
      else if (ex.includes('球') || ex.includes('跑') || ex.includes('hiit')) activityMultiplier = 1.55;
    }

    const tdee = Math.round(bmr * activityMultiplier);
    const isFatLoss = profile.goal === 'fat_loss';

    let deficitSurplus = isFatLoss ? -450 : 350;
    if (latestCheckIn) {
      const fb = (latestCheckIn.exerciseFeedback || '').toLowerCase();
      if (fb.includes('累') || fb.includes('酸')) deficitSurplus = isFatLoss ? -250 : 200;
      else if (fb.includes('爆棚') || fb.includes('极佳')) deficitSurplus = isFatLoss ? -600 : 500;
    }

    const targetCalories = Math.round(tdee + deficitSurplus);
    const proteinTarget = isFatLoss ? Math.round(currentWeight * 2.2) : Math.round(currentWeight * 1.8);
    const carbTarget = isFatLoss ? Math.round(currentWeight * 1.6) : Math.round(currentWeight * 4.5);
    const fatTarget = Math.round((targetCalories - (proteinTarget * 4) - (carbTarget * 4)) / 9);

    let feedbackNote = '';
    if (latestCheckIn) {
      const fb = latestCheckIn.exerciseFeedback || '';
      if (fb.includes('酸')) feedbackNote = '⚠️ 检测到昨日肌肉酸痛，今日降低训练强度，增加拉伸和恢复。';
      else if (fb.includes('爆棚') || fb.includes('极佳')) feedbackNote = '🔥 昨日状态爆棚！今日趁热打铁，加大热量赤字，全力冲刺。';
      else if (fb.includes('沉沦') || fb.includes('断')) feedbackNote = '🔄 检测到训练中断，今日启动温和重置模式，逐步恢复节奏。';
      else feedbackNote = '📊 基于昨日反馈，维持标准计划，稳扎稳打。';
    } else {
      feedbackNote = '📊 暂无打卡数据，显示基准计划。完成首次打卡后将根据反馈动态调整。';
    }

    let dietSection = '';
    let exerciseSection = '';

    if (isFatLoss) {
      dietSection = `
        <div style="margin-bottom: 1.25rem;">
          <h4 style="color: var(--accent-color); margin-bottom: 0.5rem;">🔥 今日燃脂能量底座：${targetCalories} kcal</h4>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${feedbackNote}</p>
          <ul style="padding-left: 1.25rem; font-size: 0.9rem;">
            <li><strong>蛋白质 (高配)</strong>：约 ${proteinTarget}g / 天（鸡胸肉、牛里脊、鸡蛋、乳清蛋白）</li>
            <li><strong>碳水化合物 (控量)</strong>：约 ${carbTarget}g / 天（慢碳：燕麦、糙米、红薯）</li>
            <li><strong>脂肪 (优质)</strong>：约 ${fatTarget}g / 天（坚果、橄榄油、牛油果）</li>
            <li><strong>全天水耗</strong>：至少 3L 纯净水，加速钠代谢。</li>
          </ul>
        </div>
      `;
      exerciseSection = `
        <div>
          <h4 style="color: var(--accent-color); margin-bottom: 0.5rem;">🏀 今日训练任务</h4>
          <ul style="padding-left: 1.25rem; font-size: 0.9rem;">
            <li><strong>热身防护</strong>：动态拉伸 10 分钟，重点髋/膝/踝关节。</li>
            <li><strong>有氧冲刺</strong>：30-40 分钟稳态有氧 + 10 分钟 HIIT 收尾。</li>
            <li><strong>辅助力量</strong>：哑铃深蹲 4组*20次 + 俯卧撑 4组*15次，组休 45 秒。</li>
            <li><strong>腹肌雕琢</strong>：仰卧卷腹 4组*20次 + 平板支撑 3组*60秒。</li>
            <li><strong>睡眠死命令</strong>：23:30 前熄火卧床，燃脂黄金窗口。</li>
          </ul>
        </div>
      `;
    } else {
      dietSection = `
        <div style="margin-bottom: 1.25rem;">
          <h4 style="color: var(--accent-orange); margin-bottom: 0.5rem;">💪 今日增肌合成底座：${targetCalories} kcal</h4>
          <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 0.5rem;">${feedbackNote}</p>
          <ul style="padding-left: 1.25rem; font-size: 0.9rem;">
            <li><strong>蛋白质</strong>：约 ${proteinTarget}g / 天（足量蛋白维持正氮平衡）</li>
            <li><strong>碳水化合物 (超量)</strong>：约 ${carbTarget}g / 天（充足糖原储备）</li>
            <li><strong>脂肪</strong>：约 ${fatTarget}g / 天（维持激素水平）</li>
            <li><strong>全天水耗</strong>：至少 3.5L，保证肌肉合成代谢顺畅。</li>
          </ul>
        </div>
      `;
      exerciseSection = `
        <div>
          <h4 style="color: var(--accent-orange); margin-bottom: 0.5rem;">🏀 今日训练任务</h4>
          <ul style="padding-left: 1.25rem; font-size: 0.9rem;">
            <li><strong>关节保护</strong>：负重前充分热身 15 分钟，激活肩/髋/核心。</li>
            <li><strong>抗阻主导</strong>：深蹲 4组*10次 + 卧推 4组*10次 + 硬拉 4组*8次。</li>
            <li><strong>腹肌加练</strong>：悬垂提膝 4组*15次 + 交替单车 4组*20次。</li>
            <li><strong>超量恢复</strong>：23:30 前挺尸，生长激素修复肌纤维。</li>
          </ul>
        </div>
      `;
    }

    const planHTML = '<div style="display: flex; flex-direction: column; gap: 1rem;"><div style="border: 1px solid var(--panel-border); border-radius: 16px; padding: 1.25rem; background: rgba(255, 255, 255, 0.15);">' + dietSection + '</div><div style="border: 1px solid var(--panel-border); border-radius: 16px; padding: 1.25rem; background: rgba(255, 255, 255, 0.15);">' + exerciseSection + '</div></div>';
    if (planContent) planContent.innerHTML = planHTML;
    if (planContentInline) planContentInline.innerHTML = planHTML;
  }

  // --- TAB ROUTING ---
  tabBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      const activeTab = btn.dataset.tab;
      
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      tabPanels.forEach(panel => {
        panel.classList.remove('active');
        if (panel.id === `panel${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}`) {
          panel.classList.add('active');
        }
      });
    });
  });

  // --- SIMPLE MARKDOWN PARSER ---
  function parseMarkdown(text) {
    if (!text) return "";
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    // Blockquotes (e.g. > (text) )
    html = html.replace(/^\s*&gt;\s*(.*)$/gm, "<blockquote>$1</blockquote>");

    // Headers (e.g. ## Header)
    html = html.replace(/^\s*##\s*(.*)$/gm, "<h2>$1</h2>");

    // Unordered lists (e.g. * Item)
    html = html.replace(/^\s*[\*\-]\s*(.*)$/gm, "<ul><li>$1</li></ul>");
    
    // Clean up consecutive <ul> tags
    html = html.replace(/<\/ul>\s*<ul>/g, "");

    // Bold text (e.g. **Bold**)
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

    // Newlines to breaks (avoid duplicate spacing in lists)
    html = html.split('\n').map(line => {
      if (line.trim().startsWith('<h2>') || line.trim().startsWith('<blockquote>') || line.trim().startsWith('<ul>') || line.trim().startsWith('<li>') || line.trim() === '') {
        return line;
      }
      return line + '<br>';
    }).join('\n');

    return html;
  }

  // --- DAILY CHECK-IN SUBMIT ---
  checkInForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!profile) {
      showToast('未检测到基本身体底座，请先配置个人资料！', 'error');
      return;
    }

    const checkInData = {
      date: new Date().toLocaleDateString('zh-CN'),
      timestamp: Date.now(),
      currentWeight: parseFloat(ciWeight.value),
      weightCondition: ciWeightCondition.value,
      stateDescription: ciState.value.trim(),
      breakfast: ciBreakfast.value.trim() || '未吃/未填',
      lunch: ciLunch.value.trim(),
      dinner: ciDinner.value.trim(),
      tonightExercise: ciExercise.value.trim(),
      exerciseFeedback: ciFeedback.value.trim(),
      ultimateGoal: ciGoalFlag.value.trim()
    };

    // Save previous weight for AI calculations
    const lastWeight = history.length > 0 ? history[0].weight : profile.weight;

    // Switch to AI tab and show loader
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    const panelAudit = document.getElementById('panelAiAudit');
    if (panelAudit) panelAudit.classList.add('active');
    aiLoading.style.display = 'flex';
    aiReportOutput.style.display = 'none';

    try {
      let reportText = "";
      if (authToken && currentUser) {
        document.getElementById('loadingText').innerText = "教练正在调遣 AI 拆解生化逻辑...";
        reportText = await window.AiEngine.generateServerAudit(authToken, checkInData);
      } else {
        document.getElementById('loadingText').innerText = "未登录，教练启动本地规则审计...";
        await new Promise(resolve => setTimeout(resolve, 1200));
        reportText = window.AiEngine.generateLocalAudit(profile, checkInData, lastWeight);
      }

      // Format report output
      aiReportOutput.innerHTML = parseMarkdown(reportText) + '<hr style="margin:1.5rem 0;border-color:var(--panel-border);"><p style="font-size:0.7rem;color:var(--text-secondary);">⚠️ AI建议仅供参考，不构成医疗诊断。在开始任何饮食或运动计划前请咨询专业医师。</p>';
      aiLoading.style.display = 'none';
      aiReportOutput.style.display = 'block';

      // Save log in history
      const newHistoryItem = {
        id: Date.now(),
        date: checkInData.date,
        weight: checkInData.currentWeight,
        checkIn: checkInData,
        report: reportText
      };

      // Check if we already have a log for today (optional, but clean: we prepend new records)
      history.unshift(newHistoryItem);
      // Limit history items to 30 to prevent overflow
      if (history.length > 30) history.pop();
      
      localStorage.setItem('ai_fitness_history', JSON.stringify(history));
      
      showToast('今日数据打卡成功！生化审计账单已出炉。', 'success');
      
      // Refresh timeline & progress bar
      setupSidebar();
      renderHistoryList();
      updateStreakUI();
      renderWeightChart();

    } catch (err) {
      aiLoading.style.display = 'none';
      aiReportOutput.innerHTML = '<div style="padding:1.5rem;text-align:center;color:var(--accent-red);"><svg viewBox="0 0 24 24" width="48" height="48" fill="currentColor" style="margin-bottom:0.5rem;"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg><h3>AI 审计连接失败</h3><p style="margin-top:0.5rem;font-size:0.9rem;">'+sanitizeHTML(err.message||'网络连接超时')+'</p><p style="font-size:0.8rem;color:var(--text-secondary);margin-top:0.25rem;">请检查网络连接，或登录会员后使用AI审计功能。</p><button class="btn-primary" id="btnRetryAudit" style="max-width:200px;margin:0.75rem auto 0;">🔄 重新审计</button></div>';
      aiReportOutput.style.display = 'block';
      // Store checkin data for retry
      window._lastCheckinData = checkInData;
      window._lastCheckinWeight = lastWeight;
      document.getElementById('btnRetryAudit').addEventListener('click', () => {
        document.querySelector('[data-tab="checkin"]').click();
        checkInForm.dispatchEvent(new Event('submit'));
      });
    }
  });

  // --- HISTORY LIST RENDER ---
  function renderHistoryList() {
    historyList.innerHTML = '';
    if (history.length === 0) {
      historyList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/></svg>
          <h3>尚无历史打卡账单</h3>
          <p>提交打卡后，过往的数据与 AI 指令都将保存在这里供翻阅对齐。</p>
        </div>
      `;
      return;
    }

    history.forEach(item => {
      const card = document.createElement('div');
      card.className = 'history-card';
      
      const goalIcon = profile.goal === 'fat_loss' ? '🔥' : '💪';
      
      card.innerHTML = `
        <div class="history-left">
          <h4>📅 打卡日期: ${item.date}</h4>
          <p>体重: <strong>${item.weight} kg</strong> | ${item.checkIn.tonightExercise.substring(0, 25)}...</p>
        </div>
        <div class="history-right">
          <span style="font-size: 1.25rem;">${goalIcon}</span>
          <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.75rem;">查看指令</button>
        </div>
      `;

      card.addEventListener('click', () => {
        openHistoryDetail(item);
      });

      historyList.appendChild(card);
    });
  }

  // --- HISTORY DETAIL VIEW ---
  function openHistoryDetail(item) {
    historyModalTitle.innerText = `历史打卡账单 - ${item.date}`;
    hmWeight.innerText = item.checkIn.currentWeight;
    hmState.innerText = item.checkIn.stateDescription;
    hmLunch.innerText = item.checkIn.lunch;
    hmDinner.innerText = item.checkIn.dinner;
    hmExercise.innerText = item.checkIn.tonightExercise;
    hmFeedback.innerText = item.checkIn.exerciseFeedback;
    hmFlag.innerText = item.checkIn.ultimateGoal;
    
    hmAuditContent.innerHTML = parseMarkdown(item.report);
    historyModal.classList.add('active');
  }

  closeHistoryModal.addEventListener('click', () => {
    historyModal.classList.remove('active');
  });

  // --- SETTINGS PANEL ---
  settingsBtn.addEventListener('click', () => {
    if (!profile) return;
    updateSettingsAuthUI();
    setAge.value = profile.age || '';
    setHeight.value = profile.height || '';
    setWeight.value = profile.weight || '';
    setTargetWeight.value = profile.targetWeight || '';
    setDeadline.value = profile.deadlineDate || '';
    setGoal.value = profile.goal || 'fat_loss';
    setIllnesses.value = profile.illnesses || '无';
    settingsModal.classList.add('active');
  });

  closeSettings.addEventListener('click', () => {
    settingsModal.classList.remove('active');
  });

  window.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.remove('active');
    if (e.target === historyModal) historyModal.classList.remove('active');
    if (e.target === upgradeModal) upgradeModal.classList.remove('active');
  });

  saveSettingsBtn.addEventListener('click', () => {
    if (!profile) return;
    profile.age = parseInt(setAge.value);
    profile.height = parseInt(setHeight.value);
    profile.weight = parseFloat(setWeight.value);
    profile.targetWeight = parseFloat(setTargetWeight.value);
    profile.deadlineDate = setDeadline.value || null;
    profile.goal = setGoal.value;
    profile.illnesses = setIllnesses.value.trim() || '无';
    localStorage.setItem('ai_fitness_profile', JSON.stringify(profile));
    showToast('配置已更新！', 'success');
    settingsModal.classList.remove('active');
    initApp();
  });

  resetAppBtn.addEventListener('click', () => {
    if (confirm('⚠️ 确定要清空所有运动档案和历史打卡数据吗？此操作不可恢复！')) {
      localStorage.removeItem('ai_fitness_profile');
      localStorage.removeItem('ai_fitness_history');
      location.reload();
    }
  });

  // --- UPGRADE MODAL ---
  upgradeBtn.addEventListener('click', () => { upgradeModal.classList.add('active'); });
  upgradeBtnSettings.addEventListener('click', () => {
    settingsModal.classList.remove('active');
    upgradeModal.classList.add('active');
  });
  closeUpgradeModal.addEventListener('click', () => upgradeModal.classList.remove('active'));
  startPaymentBtn.addEventListener('click', async () => {
    if (!authToken) { showToast('请先登录后再升级', 'error'); return; }
    showToast('正在发起支付...', 'info');
    try {
      const data = await apiCall('/payment/create', 'POST', { plan: 'monthly' });
      if (data.qr_url) {
        showToast('请用微信扫码支付', 'success');
        window.open(data.qr_url, '_blank');
      } else {
        showToast('支付接口暂未配置，请联系客服', 'info');
      }
    } catch (e) { showToast(e.message, 'error'); }
  });

  const ACTION_LIBRARY = {
    chest: [
      { name: "哑铃平板卧推", target: "胸大肌中部/整体厚度", recommend: "4组 * 10-12次", tips: "挺胸沉肩，双脚踩实。哑铃垂直下落至胸口两侧，推起时大臂内收45度，顶峰收缩胸大肌。", video: "哑铃平板卧推 教学" },
      { name: "哑铃上斜卧推", target: "胸大肌上束(锁骨部)", recommend: "4组 * 10-12次", tips: "凳角30-45度，强化胸肌上缘。慢落至上胸口，向上聚拢推起，肘关节微屈保护肩袖。", video: "哑铃上斜卧推 教学" },
      { name: "双杠臂屈伸", target: "胸大肌下胸边缘/肱三头肌", recommend: "4组 * 最大次数", tips: "身体前倾，手肘向两侧张开。下落至上臂与地面平行，用胸肌下缘发力撑起。", video: "双杠臂屈伸 练胸 教学" },
      { name: "哑铃下斜卧推", target: "胸大肌下束", recommend: "4组 * 10-12次", tips: "凳角-15到-30度。哑铃下落至下胸位置，向上推起感受下胸发力。", video: "下斜哑铃卧推 下胸 教学" },
      { name: "哑铃飞鸟夹胸", target: "胸肌中缝/拉伸", recommend: "4组 * 12-15次", tips: "仰卧手肘微屈如抱大树，慢速展开至深度拉伸，用力夹回弧线聚拢。", video: "哑铃飞鸟 夹胸 教学" }
    ],
    back: [
      { name: "宽距引体向上", target: "背阔肌上部/大圆肌(宽度)", recommend: "4组 * 6-10次", tips: "握距宽于肩，悬挂充分伸展。背部发力拉起至下巴过杠，慢放4秒离心。", video: "引体向上 练背 教学" },
      { name: "哑铃单臂划船", target: "背阔肌下部/中背部厚度", recommend: "4组 * 12次/侧", tips: "单膝跪凳，背部挺直。手肘贴身向上拉至髋部，顶峰挤压1秒慢放。", video: "哑铃划船 单臂 教学" },
      { name: "哑铃耸肩", target: "斜方肌上束", recommend: "4组 * 15次", tips: "站立垂铃，垂直耸肩至最高点，顶峰1秒缓慢下放，勿旋转肩关节。", video: "哑铃耸肩 斜方肌 教学" },
      { name: "哑铃山羊挺身", target: "下背部/竖脊肌", recommend: "4组 * 15次", tips: "髋部卡垫边缘俯身90度，下背发力抬起上半身至齐平，控制离心。", video: "山羊挺身 下背 教学" },
      { name: "坐姿高位下拉", target: "背阔肌整体", recommend: "4组 * 12次", tips: "宽握横杆收肩胛骨，背肌发力拉至锁骨位置，顶峰收缩慢放感受拉伸。", video: "高位下拉 练背 教学" }
    ],
    shoulders: [
      { name: "哑铃坐姿推举", target: "三角肌前束/整体厚度", recommend: "4组 * 10-12次", tips: "背部挺直手肘微屈，慢落至肘略低于肩，上推时微旋向斜上方。", video: "哑铃推举 肩膀 教学" },
      { name: "哑铃侧平举", target: "三角肌中束(宽肩)", recommend: "4组 * 15次", tips: "身体微前倾，大臂带动小臂外展至肩同高。小指微上勾强化中束收缩，慢速下放。", video: "哑铃侧平举 中束 教学" },
      { name: "哑铃俯身侧平举", target: "三角肌后束", recommend: "4组 * 15次", tips: "俯身屈髋至躯干接近平行，保持手肘微屈向后方外展，避免斜方借力。", video: "俯身侧平举 后束 教学" },
      { name: "哑铃前平举", target: "三角肌前束(单侧)", recommend: "4组 * 12次", tips: "单手持铃置大腿前，直臂前举至肩同高，顶峰1秒慢放下。", video: "哑铃前平举 前束 教学" }
    ],
    arms: [
      { name: "牧师椅斜托弯举", target: "肱二头肌内侧短头(厚度)", recommend: "4组 * 12次", tips: "大臂贴板面，手托哑铃弯举。顶端收紧挤压二头肌，慢速下放保持张力。", video: "牧师椅弯举 二头肌 教学" },
      { name: "哑铃锤式弯举", target: "肱二头肌外侧长头/肱桡肌", recommend: "4组 * 12次", tips: "双手掌心相对如挥锤，手臂夹紧身体，顶峰收缩二头肌外侧。", video: "锤式弯举 二头 教学" },
      { name: "颈后哑铃臂屈伸", target: "肱三头肌长头(马蹄形)", recommend: "4组 * 12-15次", tips: "双手捧铃一端举过头顶，大臂贴耳固定，慢下至颈后三头推回。", video: "颈后臂屈伸 三头肌 教学" },
      { name: "窄距俯卧撑", target: "肱三头肌外侧头", recommend: "4组 * 最大次数", tips: "双手窄于肩宽，手肘贴身后侧。下落至胸口近地，三头肌发力撑起。", video: "窄距俯卧撑 三头 教学" },
      { name: "哑铃腕弯举", target: "前臂屈肌/握力", recommend: "3组 * 15次", tips: "前臂搁大腿手腕悬空，仅靠手腕屈伸，锻炼前臂抓握爆发力。", video: "腕弯举 前臂 教学" }
    ],
    legs: [
      { name: "哑铃杯状深蹲", target: "股四头肌/臀大肌", recommend: "4组 * 12-15次", tips: "捧哑铃贴胸，双脚略宽于肩。膝盖对齐脚尖，臀向后坐，胸挺直不弯腰。", video: "深蹲 哑铃 教学" },
      { name: "哑铃直腿硬拉", target: "腘绳肌(大腿后侧)", recommend: "4组 * 12次", tips: "双脚微屈髋部后推，上身挺直下弯至铃过膝，小腿垂直感受腘绳肌拉伸。", video: "直腿硬拉 大腿后侧 教学" },
      { name: "保加利亚单腿蹲", target: "单侧股四头肌/臀肌", recommend: "3组 * 12次/侧", tips: "后脚架凳，前脚前迈垂直下蹲至后膝近地，重心平衡前膝不内扣。", video: "保加利亚单腿蹲 教学" },
      { name: "站姿提踵", target: "小腿腓肠肌/比目鱼肌", recommend: "4组 * 20次", tips: "前脚掌踩台阶，脚跟下延拉伸，全力顶脚尖收缩小腿1秒。", video: "提踵 小腿 教学" },
      { name: "哑铃弓箭步", target: "股四头肌/臀肌/核心", recommend: "3组 * 12次/侧", tips: "双手持铃交替前迈，后膝轻触地面，前膝不超脚尖，爆发推回。", video: "弓箭步 哑铃 教学" }
    ],
    glutes: [
      { name: "哑铃臀推", target: "臀大肌下沿/饱满度", recommend: "4组 * 12-15次", tips: "上背贴凳缘，髋骨负重哑铃。臀部爆发推平至桥式，顶端拼命夹臀2秒。", video: "臀推 臀大肌 教学" },
      { name: "侧卧弹力带抬腿", target: "臀中肌(上臀部/侧面)", recommend: "4组 * 15次/侧", tips: "侧卧身体成一直线弹力带缠膝，上方脚尖向下斜后抬腿。", video: "弹力带侧抬腿 臀中肌 教学" },
      { name: "跪姿后踢腿", target: "臀大肌上部", recommend: "4组 * 15次/侧", tips: "四肢跪地核心收紧，单腿向后上方蹬出90度，挤压臀肌顶部。", video: "跪姿后踢腿 臀部 教学" }
    ],
    abs: [
      { name: "仰卧卷腹", target: "腹直肌上部(上腹)", recommend: "4组 * 20次", tips: "屈膝踩地下背贴地，腹肌收缩抬起肩胛骨离地，顶峰呼气挤压上腹。", video: "卷腹 上腹 教学" },
      { name: "仰卧举腿", target: "腹直肌下部(下腹)", recommend: "4组 * 15次", tips: "仰卧双腿伸直并拢，下腹发力抬腿至垂直于地面，控制慢放至近地不触地。", video: "仰卧举腿 下腹 教学" },
      { name: "仰卧交替单车", target: "腹外斜肌(侧腹/人鱼线)", recommend: "4组 * 20次", tips: "双脚悬空交替伸缩，手肘对碰对侧膝盖，转体感受腹外斜肌收缩。", video: "仰卧单车 侧腹 教学" },
      { name: "悬垂提膝", target: "腹直肌下部/核心", recommend: "4组 * 15次", tips: "双手悬挂单杠，腹肌发力提膝至胸前，顶峰收缩1秒缓慢回放不借力。", video: "悬垂提膝 腹肌 教学" },
      { name: "负重俄罗斯转体", target: "腹外斜肌/腹直肌", recommend: "4组 * 20次", tips: "坐姿屈膝脚跟触地持哑铃，核心收紧左右转体，哑铃触地两侧背挺直。", video: "俄罗斯转体 侧腹 教学" }
    ],
    core: [
      { name: "肘撑平板支撑", target: "核心深层稳定肌群", recommend: "4组 * 60秒", tips: "肘在肩正下方前臂平放，臀收紧身体呈直线，不塌腰不翘臀深呼吸。", video: "平板支撑 核心 教学" },
      { name: "侧平板支撑", target: "腹斜肌/腰方肌", recommend: "3组 * 45秒/侧", tips: "单肘撑地身体侧向成直线，髋不塌落，自由手可叉腰或举高。", video: "侧平板支撑 腰腹 教学" },
      { name: "死虫式", target: "深层核心/抗伸展", recommend: "4组 * 12次/侧", tips: "仰卧四肢朝天，对侧手脚缓慢伸展近地，核心绷紧下背贴地交替。", video: "死虫式 核心训练 教学" }
    ],
    cardio: [
      { name: "静态拉伸放松", target: "全身大肌群拉伸/恢复", recommend: "1次 * 10-15分钟", tips: "训后对胸/背/肩/腿/臀静态拉伸，每个部位保持30秒深呼吸降低皮质醇。", video: "训练后拉伸 放松 教学" },
      { name: "稳态有氧运动", target: "心肺/燃脂降体脂", recommend: "30-40分钟", tips: "慢跑/单车/椭圆机，心率维持60-70%最大心率区间，纯脂肪氧化供能。", video: "有氧运动 燃脂 跑步 教学" },
      { name: "波比跳(Burpees)", target: "全身复合/HIIT极限燃脂", recommend: "4组 * 10-15次", tips: "快速下蹲→双脚后跃平板→收回双腿→全力起跳头顶击掌，心率瞬间爆表。", video: "波比跳 动作要领 教学" },
      { name: "跳绳", target: "全身协调/心肺/小腿", recommend: "4组 * 3分钟", tips: "双脚并拢落地手腕发力转绳，轻快节奏组间休息60秒，高效燃脂。", video: "跳绳 教学 燃脂" }
    ]
  };
function renderActions(group) {
    if (!actionsGrid) return;
    const actions = ACTION_LIBRARY[group] || [];
    actionsGrid.innerHTML = actions.map(act => {
      const biliUrl = "https://search.bilibili.com/all?keyword=" + encodeURIComponent(act.video || act.name + " 教学");
      return '<div class="action-card"><a href="' + biliUrl + '" target="_blank" class="action-video-thumb"><div class="action-video-overlay"><svg viewBox="0 0 24 24" width="28" height="28" fill="white"><path d="M8 5v14l11-7z"/></svg></div><span class="action-muscle-tag">' + act.target.split("/")[0] + '</span></a><div class="action-header"><span class="action-title">' + act.name + '</span><span class="action-tag">' + act.target + '</span></div><div class="action-meta">💪 推荐配比: <strong>' + act.recommend + '</strong></div><div class="action-tips">📝 ' + act.tips + '</div><a href="' + biliUrl + '" target="_blank" class="action-watch-btn">▶ 查看教学视频</a></div>';
    }).join("");
  }

  // Initial render chest group
  renderActions('chest');

  // Segment Buttons Click
  const segBtns = [segBtnActions, segBtnHiit, segBtnVideos];
  const subviews = [subviewActions, subviewHiit, subviewVideos];

  segBtns.forEach((btn, index) => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      segBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      subviews.forEach((v, idx) => {
        if (v) v.style.display = idx === index ? 'block' : 'none';
      });
    });
  });

  // Action Subtabs click
  if (actionsSubtabs) {
    const subtabButtons = actionsSubtabs.querySelectorAll('.subtab-btn');
    subtabButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        subtabButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderActions(btn.dataset.group);
        // Track muscle group for achievements
        var g = btn.dataset.group;
        if (!gameState._musclesTrained) gameState._musclesTrained = [];
        if (gameState._musclesTrained.indexOf(g) < 0) { gameState._musclesTrained.push(g); safeSet("game_state", gameState); }
        gameState.guideViews = (gameState.guideViews || 0) + 1; safeSet("game_state", gameState);
        checkBadges();
      });
    });
  }

  // --- DAILY TIPS LOGIC ---
  const DAILY_TIPS = [
    { title: "【避坑】减肥 vs 减脂的本质区别", content: "减肥是体重的数字下降，掉的可能是宝贵的肌肉和皮下废水，导致皮肤松弛；而减脂是精准砍掉纯脂肪、保留/增加肌肉，从而让身材视觉上极其紧致、线条分明。不要做体重秤的奴隶，多量腰围，多照镜子！" },
    { title: "【安全】如何避免膝关节在下蹲时报废？", content: "无论是深蹲还是保加利亚单腿蹲，膝盖的运动方向必须始终与脚尖方向保持一致，千万不要内扣！下蹲时臀部先向后坐（屈髋），而不是膝盖先向前顶。如果关节有任何刺痛，立刻停下，不要硬撑！" },
    { title: "【生化】为什么熬夜是燃脂和合成肌肉的头号杀手？", content: "熬夜会让皮质醇（压力激素）水平暴涨，导致身体开启“保命囤脂”模式并疯狂分解肌肉。深睡眠状态是生长激素分泌的高峰期，也是受损肌纤维超量恢复的黄金窗口。强制锁定 11:30 挺尸死线！" },
    { title: "【防受伤】大重量硬拉/深蹲时，核心如何“上锁”？", content: "使用瓦萨瓦呼吸法：起跑前吸气至腹部八分满，憋住气，收紧核心，腹肌像被揍一拳一样向外顶。这会形成强大的腹内压，像天然腰带一样保护你的腰椎不被压垮。推起完成回到顶点后才能呼气。" },
    { title: "【重视点】为什么宁可降低重量，也绝不妥协动作幅度？", content: "动作幅度和发力路径（全程张力）比盲目加重重要十倍！半程动作只会刺激到局部肌腱，且极易导致关节代偿受伤。用能控制的重量做全程拉伸与收缩，肌肉才能野蛮生长。" },
    { title: "【防护】肩关节在推胸时拉伤？检查手肘夹角！", content: "哑铃推胸或俯卧撑时，大臂与躯干不要呈 90 度直角，这会将巨大的剪切力施加给脆弱的肩袖肌群。将双肘微微内收，与躯干呈 45-60 度夹角，大臂垂直向下，用胸大肌牢牢接住重量。" },
    { title: "【科普】运动后肌肉酸痛（DOMS），还能继续练吗？", content: "延迟性肌肉酸痛是肌纤维微型撕裂和无菌性炎症导致的，并非乳酸堆积。如果酸痛剧烈，建议对目标部位实施休息，换其他肌群训练。如果轻微发胀，可以通过小重量低强度的运动（如慢跑、拉伸）来加速血液循环以恢复。" },
    { title: "【饮食】隐形钠离子——你皮下浮水的元凶！", content: "吃了麻辣香锅、火锅等重盐食物，体内的钠离子会锁死水分，导致你第二天体重飙升 1-2kg。这不是长胖，是皮下水肿！对冲方案：多喝白水（3.5L+），补充高钾食物（香蕉、叶菜），利用渗透压把废水排出去。" },
    { title: "【安全】腕关节承重时的“中立位”守则", content: "在做卧推、推举或手撑地动作时，手腕绝对不能过度向后折叠。这会将负荷直接压在腕骨 and 韧带上。手掌心和前臂骨骼必须呈一条直线，让手掌根部承受重量，避免手腕慢性损伤。" },
    { title: "【生化】减脂期千万不要断碳水！", content: "碳水是脂肪燃烧的“引火柴”（脂肪在体内彻底氧化需要糖代谢中间产物的参与）。长期零碳水不仅会导致掉肌肉、精神恍惚，还会锁死甲状腺素分泌，让基础代谢率断崖式下跌。吃优质慢碳（红薯/燕麦），让燃脂火焰持续燃烧！" }
  ];

  let currentTipIndex = new Date().getDate() % DAILY_TIPS.length;
  const tipTitle = document.getElementById('tipTitle');
  const tipContent = document.getElementById('tipContent');
  const nextTipBtn = document.getElementById('nextTipBtn');

  function displayTip(index) {
    if (!tipTitle || !tipContent) return;
    const tip = DAILY_TIPS[index];
    tipTitle.innerText = `💡 教练每日贴士 | ${tip.title}`;
    tipContent.innerText = tip.content;
  }

  // Initial render of daily tip
  displayTip(currentTipIndex);

  // Next tip click handler
  if (nextTipBtn) {
    nextTipBtn.addEventListener('click', () => {
      currentTipIndex = (currentTipIndex + 1) % DAILY_TIPS.length;
      displayTip(currentTipIndex);
    });
  }

  // ============ FEATURE 1: WEIGHT TREND CHART ============
  let weightChart = null;
  // Chart.js fallback
  function renderWeightChart() {
    if (window._chartFallback || typeof Chart === 'undefined') {
      const canvas = document.getElementById('weightChart');
      const chartEmpty = document.getElementById('chartEmpty');
      if (canvas) canvas.style.display = 'none';
      if (chartEmpty) { chartEmpty.style.display = ''; chartEmpty.innerHTML = '📈 图表组件加载中...<br><small>请检查网络后刷新</small>'; }
      return;
    }
    const canvas = document.getElementById('weightChart');
    const chartEmpty = document.getElementById('chartEmpty');
    const weightChange = document.getElementById('weightChange');
    if (!canvas) return;
    if (!history || history.length === 0) {
      if (weightChart) { weightChart.destroy(); weightChart = null; }
      canvas.style.display = 'none';
      if (chartEmpty) chartEmpty.style.display = '';
      if (weightChange) weightChange.textContent = '-- kg';
      return;
    }
    canvas.style.display = '';
    if (chartEmpty) chartEmpty.style.display = 'none';
    const labels = [], data = [];
    const sorted = [...history].reverse();
    sorted.forEach(h => {
      labels.push(h.date || '');
      data.push(h.weight);
    });
    // Weight change
    if (weightChange && profile) {
      const initial = profile.weight;
      const latest = history[0].weight;
      const diff = (latest - initial).toFixed(1);
      const arrow = diff > 0 ? '▲' : diff < 0 ? '▼' : '→';
      weightChange.textContent = `${arrow} ${Math.abs(diff)} kg`;
      weightChange.style.color = diff < 0 ? 'var(--accent-green)' : diff > 0 ? 'var(--accent-red)' : 'var(--text-secondary)';
    }
    if (weightChart) weightChart.destroy();
    weightChart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: '体重 (kg)',
          data: data,
          borderColor: '#0a84ff',
          backgroundColor: 'rgba(10,132,255,0.1)',
          fill: true, tension: 0.3,
          pointRadius: 4, pointBackgroundColor: '#0a84ff'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: '#8e8e93', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#8e8e93', font: { size: 9 } }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }

  // ============ FEATURE 2: WELCOME CARD ============
  function startGuide() {
    if (safeGet('guide_done')) return;
    var overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.6);z-index:2000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = '<div style="background:#1c1c1e;border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:2rem;max-width:380px;width:90%;text-align:center;color:#fff;"><h2 style="margin:0 0 0.5rem;">🏋️ 欢迎来到 Morph.AI</h2><p style="color:#999;font-size:0.8rem;margin-bottom:1rem;">AI驱动 · 每日重塑</p><div style="text-align:left;font-size:0.85rem;line-height:2;"><div>📝 <b>每日打卡</b> — 记录体重饮食运动</div><div>🍽️ <b>饮食AI</b> — 拍照识别热量分析</div><div>🏆 <b>成就殿堂</b> — 积分解锁徽章等级</div><div>🏋️ <b>动作库</b> — 44动作+视频教学</div><div>📊 <b>历史记录</b> — 追踪体重趋势曲线</div><div>👥 <b>社区</b> — 分享心得互相鼓励</div><div>👤 <b>我的</b> — 运动数据邀请好友</div></div><button id="_gdBtn" style="background:linear-gradient(135deg,#0a84ff,#30d158);border:none;color:#fff;padding:0.7rem 2rem;border-radius:12px;font-size:0.9rem;font-weight:700;cursor:pointer;margin-top:1.2rem;">知道了，开始使用</button></div>';
    document.body.appendChild(overlay);
    document.getElementById('_gdBtn').onclick = function() { overlay.remove(); safeSet('guide_done', true); };
  }

  // ============ FEATURE 3: AI GUEST BLOCK ============
  const aiGuestUpgradeBtn = document.getElementById('aiGuestUpgradeBtn');
  const aiGuestMsg = document.getElementById('aiGuestMsg');
  function updateGuestUI() {
    if (!aiGuestUpgradeBtn || !aiGuestMsg) return;
    if (!authToken) {
      aiGuestUpgradeBtn.style.display = '';
      aiGuestMsg.textContent = '未登录状态下仅可使用本地规则审计。注册即送3天免费试用，解锁AI深度生化分析。';
    } else {
      aiGuestUpgradeBtn.style.display = 'none';
      aiGuestMsg.textContent = '请先在【今日数据打卡】中提交你的体重、饮食与运动反馈，教练才能对你实施生化格式化审计。';
    }
  }
  if (aiGuestUpgradeBtn) {
    aiGuestUpgradeBtn.addEventListener('click', () => {
      settingsBtn.click();
      updateSettingsAuthUI();
    });
  }

  // ============ FEATURE 4: PUSH NOTIFICATIONS ============
  const pushToggleBtn = document.getElementById('pushToggleBtn');
  async function subscribePush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      showToast('你的浏览器不支持推送通知', 'error');
      return;
    }
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { showToast('请允许通知权限', 'error'); return; }
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        const vapidPublic = 'BEl62iXVY2MqKmFjx7GMdFTOI2KoHW4sNTrr2YDp7_BpVwFqIaa0MNJ3COqxd3FbaYxVJ0iQZqHqODkBVMGRFbc';
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(vapidPublic)
        });
      }
      if (authToken) {
        await apiCall('/push/subscribe', 'POST', { subscription: sub });
      }
      localStorage.setItem('push_subscribed', '1');
      showToast('每日提醒已开启！', 'success');
    } catch (e) {
      showToast('推送订阅失败: ' + e.message, 'error');
    }
  }
  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }
  if (pushToggleBtn) {
    pushToggleBtn.addEventListener('click', () => {
      if (localStorage.getItem('push_subscribed')) {
        showToast('每日提醒已开启', 'info');
      } else {
        subscribePush();
      }
    });
  }

  // ============ FEATURE 5: BOTTOM TAB BAR ============
  document.querySelectorAll('.btab').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.btab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sidebarBtn = document.querySelector(`.tab-btn[data-tab="${tab}"]`);
      if (sidebarBtn) sidebarBtn.click();
    });
  });
  // Sync bottom tabs with sidebar tab clicks
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      document.querySelectorAll('.btab').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
      });
    });
  });
  gameState = safeGet("game_state") || { points: 0, earnedBadges: [], _musclesTrained: [], guideViews: 0, invited: 0 };

  // ============ TONE SWITCH ============
  const toneHardcore = document.getElementById('toneHardcore');
  const toneGentle = document.getElementById('toneGentle');
  let coachTone = safeGet('coach_tone') || 'hardcore';
  if (toneHardcore && toneGentle) {
    if (coachTone === 'gentle') { toneHardcore.classList.remove('active'); toneGentle.classList.add('active'); toneGentle.style.color = 'var(--text-primary)'; toneGentle.style.fontWeight = '700'; }
    toneHardcore.addEventListener('click', () => {
      coachTone = 'hardcore';
      safeSet('coach_tone', 'hardcore');
      toneHardcore.classList.add('active'); toneHardcore.style.color = 'var(--text-primary)'; toneHardcore.style.fontWeight = '700';
      toneGentle.classList.remove('active'); toneGentle.style.color = 'var(--text-secondary)'; toneGentle.style.fontWeight = '400';
      showToast('教练语气切换为 🔥 硬核模式', 'success');
    });
    toneGentle.addEventListener('click', () => {
      coachTone = 'gentle';
      safeSet('coach_tone', 'gentle');
      toneGentle.classList.add('active'); toneGentle.style.color = 'var(--text-primary)'; toneGentle.style.fontWeight = '700';
      toneHardcore.classList.remove('active'); toneHardcore.style.color = 'var(--text-secondary)'; toneHardcore.style.fontWeight = '400';
      showToast('教练语气切换为 🌱 温和模式', 'success');
    });
  }
  // Expose tone for ai.js
  window.getCoachTone = () => coachTone;

  // ============ SHARE POSTER ============
  const shareBtn = document.getElementById('shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      const canvas = document.getElementById('shareCanvas');
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      const w = 600, h = 800;
      ctx.fillStyle = '#0f0f11';
      ctx.fillRect(0, 0, w, h);
      // Gradient accent
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, 'rgba(10,132,255,0.15)');
      g.addColorStop(1, 'rgba(255,149,0,0.1)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      // Title
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 48px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('Morph.AI', w/2, 200);
      ctx.font = '20px sans-serif'; ctx.fillStyle = '#8e8e93';
      ctx.fillText('AI驱动 · 每日重塑', w/2, 240);
      // Stats
      const s = calcStreak();
      ctx.font = 'bold 72px sans-serif'; ctx.fillStyle = '#ff9f0a';
      ctx.fillText(`${s.current} 天`, w/2, 360);
      ctx.font = '24px sans-serif'; ctx.fillStyle = '#8e8e93';
      ctx.fillText('连续打卡', w/2, 395);
      // Weight change
      const initialW = profile ? profile.weight : 0;
      const latestW = history.length > 0 ? history[0].weight : initialW;
      const diff = (latestW - initialW).toFixed(1);
      const arrow = diff < 0 ? '↓' : diff > 0 ? '↑' : '→';
      ctx.font = 'bold 40px sans-serif';
      ctx.fillStyle = diff < 0 ? '#30d158' : '#ff9f0a';
      ctx.fillText(`${arrow} ${Math.abs(diff)} kg`, w/2, 480);
      ctx.font = '20px sans-serif'; ctx.fillStyle = '#8e8e93';
      ctx.fillText('体重变化', w/2, 510);
      // URL
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#8e8e93';
      ctx.fillText('扫码下载 · morph.fit', w/2, h - 80);
      // Divider
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(60, h-120); ctx.lineTo(w-60, h-120); ctx.stroke();

      // Trigger download/share
      canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'morph-ai-streak.png'; a.click();
        URL.revokeObjectURL(url);
        showToast('海报已保存到下载目录，发朋友圈吧！', 'success');
      });
    });
  }

  // Fix settings date label
  const setDeadlineLabel = document.querySelector('label[for="setDeadline"]');
  if (setDeadlineLabel) setDeadlineLabel.textContent = '期望截止日期';

  // Global unhandled rejection handler
  window.addEventListener('unhandledrejection', function(event) {
    console.warn('Unhandled rejection:', event.reason);
    if (event.reason && event.reason.message) {
      showToast('操作失败: ' + event.reason.message, 'error');
    }
  });

  // Clear wizard session on profile save
  if (profile) { try { sessionStorage.removeItem('wiz_step'); } catch(e) {} }




  // ===== GAME SYSTEM + PROFILE + COMMUNITY + DIET + LOGIN + SCENARIO =====
  var safeGet3 = function(k,f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : (f !== undefined ? f : null); } catch(e) { return f; } };
  var safeSet3 = function(k,v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch(e) {} };
  var serverUrl = "http://localhost:8000";
  gameState = safeGet3("game_state") || { points: 0, earnedBadges: [], _musclesTrained: [], guideViews: 0, invited: 0 };
  var LEVELS = [{name:"健身小白",min:0,ico:"🌱"},{name:"入门学徒",min:100,ico:"🌿"},{name:"进阶勇士",min:300,ico:"⚔️"},{name:"铁血战士",min:800,ico:"🛡️"},{name:"变形金刚",min:2000,ico:"🔮"},{name:"终极猎手",min:5000,ico:"👑"},{name:"传奇战神",min:12000,ico:"💎"}];
  var BADGES = [{id:"streak3",cat:"🔥 连签",name:"初出茅庐",ico:"🔥",cond:"streak3",desc:"连续3天"},{id:"streak7",cat:"🔥 连签",name:"钢铁意志",ico:"💎",cond:"streak7",desc:"连续7天"},{id:"streak30",cat:"🔥 连签",name:"不死战神",ico:"👑",cond:"streak30",desc:"连续30天"},{id:"weight5",cat:"⚖️ 体重",name:"小有成就",ico:"🎯",cond:"weight5",desc:"变化5kg"},{id:"weight10",cat:"⚖️ 体重",name:"十斤大关",ico:"🏆",cond:"weight10",desc:"变化10kg"},{id:"checkin10",cat:"📝 打卡",name:"十全十美",ico:"✅",cond:"checkin10",desc:"10次打卡"},{id:"checkin50",cat:"📝 打卡",name:"风雨无阻",ico:"🌧️",cond:"checkin50",desc:"50次打卡"},{id:"guide5",cat:"🏋️ 运动",name:"全面开火",ico:"🏀",cond:"guide5",desc:"练过5部位"},{id:"invite1",cat:"🤝 社交",name:"第一个邀请",ico:"📨",cond:"invite1",desc:"邀请1人"},{id:"invite5",cat:"🤝 社交",name:"传播大使",ico:"📢",cond:"invite5",desc:"邀请5人"}];

  function addPoints(n) { gameState.points += n; safeSet3("game_state", gameState); updateLevelUI(); checkBadges(); }
  function getLevel() { var lv = LEVELS[0]; for (var i = LEVELS.length-1; i >= 0; i--) { if (gameState.points >= LEVELS[i].min) { lv = LEVELS[i]; break; } } var idx = LEVELS.indexOf(lv); var nextMin = idx < LEVELS.length-1 ? LEVELS[idx+1].min : lv.min; var prog = nextMin > lv.min ? Math.round((gameState.points - lv.min) / (nextMin - lv.min) * 100) : 100; return {name:lv.name,ico:lv.ico,level:idx+1,prog:prog}; }
  function updateLevelUI() { var lv = getLevel(); var badge = document.getElementById("levelBadge"); var name = document.getElementById("levelName"); var pts = document.getElementById("levelPoints"); var fill = document.getElementById("levelProgressFill"); if (badge) badge.textContent = lv.level; if (name) name.textContent = lv.ico + " " + lv.name; if (pts) pts.textContent = gameState.points + " XP"; if (fill) fill.style.width = lv.prog + "%"; }
  function checkBadges() { var s = calcStreak(); var wc = profile ? Math.abs((history.length>0?history[0].weight:profile.weight) - profile.weight) : 0; var checks = history.length; var muscles = (gameState._musclesTrained||[]).length; var views = gameState.guideViews||0; var inv = gameState.invited||0; var conds = {streak3:s.current>=3,streak7:s.current>=7,streak30:s.current>=30,weight5:wc>=5,weight10:wc>=10,checkin10:checks>=10,checkin50:checks>=50,guide5:muscles>=5,invite1:inv>=1,invite5:inv>=5}; BADGES.forEach(function(b) { if (conds[b.cond] && gameState.earnedBadges.indexOf(b.id) < 0) { gameState.earnedBadges.push(b.id); safeSet3("game_state", gameState); } }); }

  function renderAchievements() {
    var badgeSections = document.getElementById("badgeSections"); if (!badgeSections) return;
    var s = calcStreak(); var wc = profile ? Math.abs((history.length>0?history[0].weight:profile.weight) - profile.weight) : 0;
    var checks = history.length; var muscles = (gameState._musclesTrained||[]).length; var views = gameState.guideViews||0; var inv = gameState.invited||0;
    var prog = {streak3:s.current,streak7:s.current,streak30:s.current,weight5:wc,weight10:wc,checkin10:checks,checkin50:checks,guide5:muscles,invite1:inv,invite5:inv};
    var maxes = {streak3:3,streak7:7,streak30:30,weight5:5,weight10:10,checkin10:10,checkin50:50,guide5:5,invite1:1,invite5:5};
    var cats = {}; BADGES.forEach(function(b) { if (!cats[b.cat]) cats[b.cat] = []; cats[b.cat].push(b); });
    badgeSections.innerHTML = "";
    Object.keys(cats).forEach(function(cat) {
      var sec = document.createElement("div"); sec.innerHTML = '<h4 style="font-size:0.85rem;font-weight:700;margin:1rem 0 0.5rem;">' + cat + '</h4>';
      var grid = document.createElement("div"); grid.className = "badge-grid";
      cats[cat].forEach(function(b) {
        var earned = gameState.earnedBadges.indexOf(b.id) >= 0;
        var p = earned ? 100 : Math.min(99, Math.round((prog[b.cond]||0) / (maxes[b.cond]||1) * 100));
        var div = document.createElement("div"); div.className = "badge-item " + (earned ? "earned" : "locked");
        div.innerHTML = '<span>' + b.ico + '</span><strong>' + b.name + '</strong><small>' + (earned ? "✅" : p + "%") + '</small>' + (earned ? "" : '<div class="badge-bar"><div class="badge-bar-fill" style="width:' + p + '%"></div></div>');
        grid.appendChild(div);
      });
      sec.appendChild(grid); badgeSections.appendChild(sec);
    });
    var tp = document.getElementById("achTotalPoints"); var bc = document.getElementById("achBadgeCount");
    if (tp) tp.textContent = gameState.points; if (bc) bc.textContent = gameState.earnedBadges.length + "/" + BADGES.length;
    var preview = document.getElementById("achPreviewBadges");
    if (preview) { preview.innerHTML = ""; BADGES.slice(0,6).forEach(function(b) { var e = gameState.earnedBadges.indexOf(b.id) >= 0; preview.innerHTML += '<div class="badge-item ' + (e ? "earned" : "locked") + '"><span style="font-size:1.1rem;">' + b.ico + '</span></div>'; }); }
  }

  function calcStreak() {
    if (!history || !history.length) return { current: 0, best: 0 };
    var dates = history.map(function(h) { return h.date; }).filter(function(d) { return d; });
    var cur = 1, best = safeGet3("streak_best") || 0;
    for (var i = 1; i < dates.length; i++) { var diff = Math.round((new Date(dates[i-1]) - new Date(dates[i])) / 86400000); if (diff === 1) cur++; else break; }
    best = Math.max(best, cur); safeSet3("streak_best", best);
    return { current: cur, best: best };
  }
  function updateStreakUI() { var sc = document.getElementById("streakCount"); var sb = document.getElementById("streakBest"); if (!sc || !sb) return; var s = calcStreak(); sc.textContent = s.current + " 天"; sb.textContent = "最长记录: " + s.best + " 天"; }

  // PROFILE
  window._loadProfile = async function() {
    var pc = document.getElementById("profileContent"); if (!pc) return;
    if (!authToken) { pc.innerHTML = '<div class="empty-state"><h3>请先登录</h3><p>登录后查看个人资料</p><button class="btn-primary" onclick="window._openLogin()">前往登录</button></div>'; return; }
    try { myProfile = await apiCall("/user/profile"); renderProfile(); loadMyPosts2(); updateNotifBadge2(); } catch(e) {}
  };
  var myProfile = null;
  function renderProfile() {
    if (!myProfile || !profileContent) return;
    var lv = getLevel(); var avatarUrl = myProfile.avatar_path ? serverUrl + "/api/uploads/" + myProfile.avatar_path : "";
    var avHTML = avatarUrl ? '<img src="' + avatarUrl + '" style="width:70px;height:70px;border-radius:50%;object-fit:cover;border:3px solid var(--accent-color);">' : '<div style="width:70px;height:70px;border-radius:50%;background:var(--accent-glow);display:flex;align-items:center;justify-content:center;font-size:2rem;">👤</div>';
    var memHTML = myProfile.membership_expires_at ? '<span style="color:var(--accent-orange);">👑 会员至 ' + myProfile.membership_expires_at.slice(0,10) + '</span>' : (myProfile.is_trial ? '<span style="color:var(--accent-green);">🎁 免费试用中</span>' : '<span>未开通会员</span>');
    profileContent.innerHTML = '<div style="text-align:center;margin-bottom:1.5rem;"><label style="cursor:pointer;">' + avHTML + '<input type="file" id="avatarInput" accept="image/*" style="display:none;"></label><h3>' + (myProfile.nickname||"用户"+myProfile.user_id) + '</h3><p style="font-size:0.8rem;color:var(--text-secondary);">' + lv.ico + ' Lv.' + lv.level + ' ' + lv.name + '</p><p style="font-size:0.75rem;">' + memHTML + '</p></div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.5rem;margin-bottom:1rem;"><div class="profile-stat-box"><strong>' + (myProfile.checkins_count||0) + '</strong><small>打卡</small></div><div class="profile-stat-box"><strong>' + calcStreak().current + '</strong><small>连续</small></div><div class="profile-stat-box"><strong>' + ((gameState._musclesTrained||[]).length) + '</strong><small>部位</small></div></div><div class="badge-grid" id="profileBadges2"></div><div style="margin-top:1rem;"><h4>📝 我的帖子</h4><div id="myPosts2"></div></div>';
    var ai = document.getElementById("avatarInput"); if (ai) ai.addEventListener("change", async function(e) { var f = e.target.files[0]; if (!f) return; var fd = new FormData(); fd.append("avatar", f); try { await fetch(API_BASE + "/user/avatar", { method:"POST", headers:{"Authorization":"Bearer "+authToken}, body:fd }); showToast("头像已更新!","success"); window._loadProfile(); } catch(e){ showToast("上传失败","error"); } });
    var bg = document.getElementById("profileBadges2"); if (bg) BADGES.forEach(function(b) { var e = gameState.earnedBadges.indexOf(b.id) >= 0; bg.innerHTML += '<div class="badge-item ' + (e?"earned":"locked") + '"><span>' + b.ico + '</span><strong>' + b.name + '</strong></div>'; });
  }
  async function loadMyPosts2() { if (!authToken) return; try { var d = await apiCall("/community/posts?sort=new&page=1"); var mp = d.posts.filter(function(p) { return myProfile && p.user_id === myProfile.user_id; }).slice(0,3); var c = document.getElementById("myPosts2"); if (c) c.innerHTML = mp.map(function(p) { return '<div class="community-post" onclick="window._openPost(' + p.id + ')"><span class="cp-cat">' + p.category + '</span><div class="cp-title">' + (p.title||"").replace(/</g,"&lt;") + '</div></div>'; }).join("") || '<p style="color:var(--text-secondary);font-size:0.8rem;">暂无帖子</p>'; } catch(e) {} }

  // COMMUNITY
  var currentCat = ""; var currentSort = "new"; var currentPage = 1;
  var createPostModal = document.getElementById("createPostModal"); var postDetailModal = document.getElementById("postDetailModal");
  async function loadCommunityPosts() {
    var cp = document.getElementById("communityPosts"); var cl = document.getElementById("communityLoading"); if (!cp) return; if (cl) cl.style.display = "block";
    try { var d = await apiCall("/community/posts?category=" + currentCat + "&sort=" + currentSort + "&page=" + currentPage); cp.innerHTML = d.posts.map(function(p) { var im = p.image_path ? '<img src="' + serverUrl + '/api/uploads/' + p.image_path + '" class="cp-image" loading="lazy">' : ""; return '<div class="community-post" onclick="window._openPost(' + p.id + ')"><span class="cp-cat">' + p.category + '</span><div class="cp-title">' + (p.title||"").replace(/</g,"&lt;") + '</div><div class="cp-meta"><span>' + (p.email||"") + '</span><span>❤ ' + (p.likes_count||0) + '</span><span>💬 ' + (p.comments_count||0) + '</span></div>' + im + '</div>'; }).join(""); } catch(e) { if (cp) cp.innerHTML = '<p style="text-align:center;color:var(--text-secondary);">加载失败</p>'; }
    if (cl) cl.style.display = "none";
  }
  window._openPost = async function(id) { if (!postDetailModal) return; postDetailModal.classList.add("active"); document.getElementById("postDetailContent").innerHTML = '<div style="text-align:center;padding:2rem;"><div class="spinner"></div></div>'; try { var p = await apiCall("/community/posts/" + id); var im = p.image_path ? '<img src="' + serverUrl + '/api/uploads/' + p.image_path + '" class="community-detail-image">' : ""; var comments = (p.comments||[]).map(function(c) { return '<div class="comment-item"><span class="cm-user">' + (c.email||"") + '</span> ' + (c.content||"").replace(/</g,"&lt;") + '</div>'; }).join(""); document.getElementById("postDetailContent").innerHTML = '<span class="cp-cat">' + p.category + '</span><h3>' + (p.title||"").replace(/</g,"&lt;") + '</h3><div class="cp-meta">' + (p.email||"") + '</div>' + im + '<p style="margin:0.75rem 0;">' + (p.content||"").replace(/</g,"&lt;") + '</p><div style="display:flex;gap:0.5rem;margin-bottom:1rem;"><button class="btn-secondary btn-sm" onclick="window._likePost(' + p.id + ')">❤ ' + (p.likes_count||0) + '</button><button class="btn-secondary btn-sm" onclick="window._reportPost(' + p.id + ')">🚩 举报</button></div><h4>评论</h4><div>' + (comments || '<p style="color:var(--text-secondary);">暂无评论</p>') + '</div><div class="comment-input-row"><input type="text" id="commentInput" class="premium-input" placeholder="写评论..."><button class="btn-primary btn-sm" onclick="window._addComment(' + p.id + ')" style="width:auto;">发送</button></div>'; } catch(e) { document.getElementById("postDetailContent").innerHTML = '<p>加载失败</p>'; } };
  window._likePost = async function(id) { try { await apiCall("/community/posts/" + id + "/like", "POST"); showToast("已点赞","info"); loadCommunityPosts(); } catch(e) { showToast(e.message,"error"); } };
  window._reportPost = async function(id) { try { await apiCall("/community/posts/" + id + "/report", "POST"); showToast("举报已提交","success"); } catch(e) { showToast(e.message,"error"); } };
  window._addComment = async function(id) { var input = document.getElementById("commentInput"); if (!input || !input.value.trim()) return; if (!authToken) { showToast("请先登录后再评论","error"); return; } try { var fd = new FormData(); fd.append("content", input.value); var res = await fetch(API_BASE + "/community/posts/" + id + "/comments", { method:"POST", headers:{"Authorization":"Bearer "+authToken}, body:fd }); if (!res.ok) throw new Error("发送失败"); input.value = ""; showToast("评论成功","success"); window._openPost(id); } catch(e) { showToast(e.message,"error"); } };
  var btnCP = document.getElementById("btnCreatePost"); if (btnCP) btnCP.addEventListener("click", function() { if (createPostModal) createPostModal.classList.add("active"); });
  var btnCC = document.getElementById("closeCreatePost"); if (btnCC) btnCC.addEventListener("click", function() { if (createPostModal) createPostModal.classList.remove("active"); });
  var btnCD = document.getElementById("closePostDetail"); if (btnCD) btnCD.addEventListener("click", function() { if (postDetailModal) postDetailModal.classList.remove("active"); });
  document.querySelectorAll(".ccat").forEach(function(b) { b.addEventListener("click", function() { document.querySelectorAll(".ccat").forEach(function(x) { x.classList.remove("active"); }); b.classList.add("active"); currentCat = b.dataset.cat; currentPage = 1; loadCommunityPosts(); }); });
  document.querySelectorAll(".csort").forEach(function(b) { b.addEventListener("click", function() { document.querySelectorAll(".csort").forEach(function(x) { x.classList.remove("active"); }); b.classList.add("active"); currentSort = b.dataset.sort; currentPage = 1; loadCommunityPosts(); }); });
  var btnSP = document.getElementById("btnSubmitPost"); if (btnSP) btnSP.addEventListener("click", async function() { var msg = document.getElementById("postMsg"); if (!authToken) { msg.innerText = "请先登录后再发帖"; return; } var fd = new FormData(); fd.append("title", document.getElementById("postTitle").value.trim()); fd.append("content", document.getElementById("postContent").value.trim()); fd.append("category", document.getElementById("postCategory").value); var img = document.getElementById("postImage").files[0]; if (img) fd.append("image", img); msg.innerText = "发布中..."; try { var res = await fetch(API_BASE + "/community/posts", { method:"POST", headers:{"Authorization":"Bearer "+authToken}, body:fd }); if (!res.ok) { var er = await res.json().catch(function(){ return {}; }); throw new Error(er.detail || "发布失败"); } createPostModal.classList.remove("active"); document.getElementById("postTitle").value = ""; document.getElementById("postContent").value = ""; document.getElementById("postImage").value = ""; msg.innerText = ""; showToast("发布成功！","success"); loadCommunityPosts(); } catch(e) { msg.innerText = e.message; } });

  // DIET AI
  var dietMessages = document.getElementById("dietMessages"); var dietInput = document.getElementById("dietInput"); var dietSendBtn = document.getElementById("dietSendBtn"); var dietPhotoInput = document.getElementById("dietPhotoInput"); var dietTypingEl = document.getElementById("dietTyping");
  function addDietMsg(text, type) { if (!dietMessages) return; var d = document.createElement("div"); d.className = "diet-msg " + type; d.textContent = text; dietMessages.appendChild(d); dietMessages.scrollTop = dietMessages.scrollHeight; }
  async function sendDietText() { if (!authToken) { showToast("请先登录","error"); return; } var t = dietInput ? dietInput.value.trim() : ""; if (!t) return; dietInput.value = ""; addDietMsg(t, "user"); if (dietTypingEl) dietTypingEl.style.display = "block"; try { var fd = new FormData(); fd.append("content", t); var res = await fetch(API_BASE + "/food/text", { method:"POST", headers:{"Authorization":"Bearer "+authToken}, body:fd }); if (!res.ok) throw new Error("失败"); var d = await res.json(); addDietMsg(d.reply, "ai"); var dtc = document.getElementById("dietTotalCal"); if (dtc) dtc.textContent = d.calories; await loadDietStats(); } catch(e) { addDietMsg("❌ " + e.message, "ai"); } if (dietTypingEl) dietTypingEl.style.display = "none"; }
  if (dietSendBtn) dietSendBtn.addEventListener("click", sendDietText);
  if (dietInput) dietInput.addEventListener("keydown", function(e) { if (e.key === "Enter") sendDietText(); });
  if (dietPhotoInput) dietPhotoInput.addEventListener("change", async function() { var f = dietPhotoInput.files[0]; if (!f || !authToken) return; addDietMsg("📸 识别中...", "user"); if (dietTypingEl) dietTypingEl.style.display = "block"; try { var fd = new FormData(); fd.append("image", f); var res = await fetch(API_BASE + "/food/photo", { method:"POST", headers:{"Authorization":"Bearer "+authToken}, body:fd }); if (!res.ok) throw new Error("失败"); var d = await res.json(); addDietMsg(d.reply, "ai"); var dtc = document.getElementById("dietTotalCal"); if (dtc) dtc.textContent = d.calories; await loadDietStats(); } catch(e) { addDietMsg("❌ " + e.message, "ai"); } if (dietTypingEl) dietTypingEl.style.display = "none"; dietPhotoInput.value = ""; });
  async function loadDietStats() { if (!authToken) return; try { var d = await apiCall("/food/today"); var dtc = document.getElementById("dietTotalCal"); var dc = document.getElementById("dietCount"); if (dtc) dtc.textContent = d.total_calories||0; if (dc) dc.textContent = d.count||0; } catch(e) {} }
  async function loadDietLogs() { if (!authToken || !dietMessages) return; await loadDietStats(); try { var d = await apiCall("/food/today"); if (d.logs.length > 0 && dietMessages.children.length <= 1) { dietMessages.innerHTML = '<div class="diet-msg ai">👋 我是你的AI营养师！今天已记录了 ' + d.count + ' 次饮食</div>'; d.logs.reverse().forEach(function(l) { addDietMsg(l.content || "📸 拍照识别", "user"); addDietMsg(l.ai_response, "ai"); }); } } catch(e) {} }

  // LOGIN MODAL
  window._openLogin = function() { var m = document.getElementById("loginModal"); if (m) m.classList.add("active"); };
  var headerLoginBtn = document.getElementById("headerLoginBtn"); if (headerLoginBtn) headerLoginBtn.addEventListener("click", function() { window._openLogin(); });
  var closeLogin = document.getElementById("closeLoginModal"); if (closeLogin) closeLogin.addEventListener("click", function() { document.getElementById("loginModal").classList.remove("active"); });
  var btnLS = document.getElementById("loginSubmitBtn"); if (btnLS) btnLS.addEventListener("click", async function() { var email = document.getElementById("loginEmail").value.trim(); var pw = document.getElementById("loginPassword").value.trim(); var msg = document.getElementById("loginMsg"); if (!email || !pw) { msg.innerText = "请填写邮箱和密码"; return; } msg.innerText = "登录中..."; try { var d = await apiCall("/auth/login", "POST", { email:email, password:pw }); authToken = d.access_token; currentUser = d.user; safeSet3("ai_fitness_token", authToken); safeSet3("ai_fitness_user", currentUser); msg.innerText = ""; document.getElementById("loginModal").classList.remove("active"); showToast("登录成功！","success"); updateMembershipUI(); updateSettingsAuthUI(); setTimeout(function() { window._loadProfile(); }, 300); } catch(e) { msg.innerText = e.message; } });
  var btnLR = document.getElementById("loginRegisterBtn"); if (btnLR) btnLR.addEventListener("click", async function() { var email = document.getElementById("loginEmail").value.trim(); var pw = document.getElementById("loginPassword").value.trim(); var msg = document.getElementById("loginMsg"); if (!email || !pw || pw.length < 6) { msg.innerText = "请填写邮箱和密码(至少6位)"; return; } msg.innerText = "注册中..."; try { var d = await apiCall("/auth/register", "POST", { email:email, password:pw }); authToken = d.access_token; currentUser = d.user; safeSet3("ai_fitness_token", authToken); safeSet3("ai_fitness_user", currentUser); msg.innerText = ""; document.getElementById("loginModal").classList.remove("active"); showToast("注册成功！赠送3天免费试用","success"); updateMembershipUI(); updateSettingsAuthUI(); } catch(e) { msg.innerText = e.message; } });
  var btnLF = document.getElementById("loginForgotBtn"); if (btnLF) btnLF.addEventListener("click", async function() { var email = document.getElementById("loginEmail").value.trim(); var msg = document.getElementById("loginMsg"); if (!email) { msg.innerText = "请先输入邮箱"; return; } try { var d = await apiCall("/auth/reset-password", "POST", { email:email, password:"" }); msg.innerText = "新密码: " + d.new_password; } catch(e) { msg.innerText = e.message; } });

  // SCENARIO
  var scenarioView = document.getElementById("scenarioView"); var selectedScene = "home_student";
  document.querySelectorAll(".scenario-card").forEach(function(c) { c.addEventListener("click", function() { document.querySelectorAll(".scenario-card").forEach(function(x) { x.classList.remove("active"); }); c.classList.add("active"); selectedScene = c.dataset.scene; }); });
  var btnCS = document.getElementById("btnConfirmScenario"); if (btnCS) btnCS.addEventListener("click", function() { safeSet3("user_scene", selectedScene); safeSet3("scene_shown", true); scenarioView.style.display = "none"; mainAppView.style.display = "flex"; });
  var btnSS = document.getElementById("btnSkipScenario"); if (btnSS) btnSS.addEventListener("click", function() { safeSet3("user_scene", null); safeSet3("scene_shown", true); scenarioView.style.display = "none"; mainAppView.style.display = "flex"; });

  // TAB CLICK HOOKS
  var td = document.querySelector('[data-tab="diet"]'); if (td) td.addEventListener("click", function() { loadDietLogs(); });
  var tc = document.querySelector('[data-tab="community"]'); if (tc) tc.addEventListener("click", function() { loadCommunityPosts(); });
  var ta = document.querySelector('[data-tab="achievements"]'); if (ta) ta.addEventListener("click", function() { renderAchievements(); updateLevelUI(); });
  var tp = document.querySelector('[data-tab="profile"]'); if (tp) tp.addEventListener("click", function() { window._loadProfile(); });
  var ava = document.getElementById("achViewAll"); if (ava) ava.addEventListener("click", function() { var ta2 = document.querySelector('[data-tab="achievements"]'); if (ta2) ta2.click(); });

  // BOTTOM TABS SYNC
  document.querySelectorAll(".btab").forEach(function(btn) { btn.addEventListener("click", function() { document.querySelectorAll(".btab").forEach(function(b) { b.classList.remove("active"); }); btn.classList.add("active"); var sb = document.querySelector('.tab-btn[data-tab="' + btn.dataset.tab + '"]'); if (sb) sb.click(); }); });
  document.querySelectorAll(".tab-btn").forEach(function(btn) { btn.addEventListener("click", function() { document.querySelectorAll(".btab").forEach(function(b) { b.classList.toggle("active", b.dataset.tab === btn.dataset.tab); }); }); });

  // NOTIFICATIONS
  function updateNotifBadge2() { if (!authToken) return; var nb = document.getElementById("notifBadge"); if (!nb) return; apiCall("/notifications/unread-count").then(function(d) { if (d.count > 0) { nb.style.display = ""; nb.textContent = d.count; } else nb.style.display = "none"; }).catch(function() {}); }
  var btnRA = document.getElementById("btnReadAll"); if (btnRA) btnRA.addEventListener("click", async function() { try { await apiCall("/notifications/read-all", "POST"); updateNotifBadge2(); } catch(e) {} });

  // INVITE
  async function loadInviteCode() { if (!authToken) return; try { var d = await apiCall("/referral/code"); var ic = document.getElementById("inviteCodeDisplay"); if (ic) ic.value = d.code; var s = await apiCall("/referral/stats"); gameState.invited = s.invited||0; safeSet3("game_state", gameState); var aic = document.getElementById("achInviteCount"); var air = document.getElementById("achInviteReward"); if (aic) aic.innerHTML = (s.invited||0) + '<br><small>已邀请</small>'; if (air) air.innerHTML = (s.rewarded||0) + '月<br><small>奖励</small>'; } catch(e) {} }
  var bci = document.getElementById("btnCopyInvite"); if (bci) bci.addEventListener("click", function() { var ic = document.getElementById("inviteCodeDisplay"); if (ic && ic.value) { navigator.clipboard.writeText(ic.value).then(function() { showToast("已复制!","success"); }); } else { showToast("请先登录","error"); } });

  // CHECKIN HOOK: award points + check badges + refresh all
  if (checkInForm) checkInForm.addEventListener("submit", function() { setTimeout(function() { addPoints(10); checkBadges(); safeSet("game_state", gameState); renderAchievements(); updateStreakUI(); updateLevelUI(); updateNotifBadge2(); }, 1000); });

  // INIT OVERRIDE
  var origInitApp3 = initApp;
  initApp = function() {
    origInitApp3();
    setTimeout(function() {
      updateLevelUI(); renderAchievements(); updateStreakUI();
      if (authToken) { loadInviteCode(); updateNotifBadge2(); }
      if (profile && !safeGet3("scene_shown") && !safeGet3("user_scene") && scenarioView && document.body.contains(scenarioView)) {
        setTimeout(function() { if (scenarioView) { scenarioView.style.display = ""; mainAppView.style.display = "none"; safeSet3("scene_shown", true); } }, 400);
      }
    }, 200);
  };
});