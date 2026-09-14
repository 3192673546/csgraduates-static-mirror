// Floating Action Button Tool Set
(function() {
  'use strict';

  document.addEventListener('DOMContentLoaded', initFAB);

  function initFAB() {
    const fabContainer = document.getElementById('fab-container');
    const fabMain = document.getElementById('fab-main');
    const fabOptionEls = fabContainer ? fabContainer.querySelectorAll('.fab-option') : [];

    if (!fabContainer || !fabMain) return;

    let isDragging = false;
    let hasMoved = false;
    let touchStartTime = 0;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0;
    let yOffset = 0;
    let dragDistance = 0;
    const dragThreshold = 5;
    const tapTimeThreshold = 200;
    const viewportPadding = 8;
    const defaultOffset = 20;

    // Passive event listener detection
    let supportsPassive = false;
    try {
      const opts = Object.defineProperty({}, 'passive', { get() { supportsPassive = true; } });
      window.addEventListener('testPassive', null, opts);
      window.removeEventListener('testPassive', null, opts);
    } catch (e) {}

    // Viewport / size helpers
    function getViewportSize() {
      return {
        width:  window.innerWidth  || document.documentElement.clientWidth,
        height: window.innerHeight || document.documentElement.clientHeight
      };
    }

    function getContainerSize() {
      const rect = fabContainer.getBoundingClientRect();
      return {
        width:  rect.width  || fabContainer.offsetWidth  || 36,
        height: rect.height || fabContainer.offsetHeight || 36
      };
    }

    function clampPosition(x, y) {
      const vp   = getViewportSize();
      const size = getContainerSize();
      return {
        x: Math.max(viewportPadding, Math.min(x, vp.width  - size.width  - viewportPadding)),
        y: Math.max(viewportPadding, Math.min(y, vp.height - size.height - viewportPadding))
      };
    }

    function applyPosition(x, y, persist) {
      const pos = clampPosition(x, y);
      xOffset = pos.x;
      yOffset = pos.y;
      fabContainer.style.right  = 'auto';
      fabContainer.style.bottom = 'auto';
      fabContainer.style.left   = xOffset + 'px';
      fabContainer.style.top    = yOffset  + 'px';
      if (persist) {
        localStorage.setItem('fabPosition', JSON.stringify({ x: xOffset, y: yOffset }));
      }
    }

    function getSavedPosition() {
      const raw = localStorage.getItem('fabPosition');
      if (!raw) return null;
      try {
        const pos = JSON.parse(raw);
        if (Number.isFinite(pos.x) && Number.isFinite(pos.y)) return pos;
      } catch (e) {}
      localStorage.removeItem('fabPosition');
      return null;
    }

    // Initial position
    function setInitialPosition() {
      const vp   = getViewportSize();
      const size = getContainerSize();
      const saved = getSavedPosition();
      const pos = saved || {
        x: vp.width  - size.width  - defaultOffset,
        y: vp.height - size.height - defaultOffset
      };
      applyPosition(pos.x, pos.y, Boolean(saved));
    }

    setInitialPosition();

    // Drag
    function dragStart(e) {
      isDragging = false;
      hasMoved   = false;
      dragDistance = 0;
      touchStartTime = Date.now();

      const clientX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;

      initialX = clientX - xOffset;
      initialY = clientY - yOffset;

      fabContainer.classList.add('dragging');
      if (e.type === 'mousedown') e.preventDefault();
    }

    function drag(e) {
      if (!fabContainer.classList.contains('dragging')) return;

      const clientX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
      const clientY = e.type === 'touchmove' ? e.touches[0].clientY : e.clientY;

      currentX = clientX - initialX;
      currentY = clientY - initialY;

      dragDistance = Math.sqrt(
        Math.pow(currentX - xOffset, 2) + Math.pow(currentY - yOffset, 2)
      );

      if (dragDistance > dragThreshold) {
        if (!isDragging) {
          isDragging = true;
          hasMoved   = true;
          if (fabContainer.classList.contains('active')) {
            closeFAB();
          }
        }
        e.preventDefault();
        e.stopPropagation();
        applyPosition(currentX, currentY, false);
      }
    }

    function dragEnd(e) {
      const touchDuration = Date.now() - touchStartTime;
      fabContainer.classList.remove('dragging');

      if (hasMoved && isDragging) {
        e.preventDefault();
        e.stopPropagation();
        snapToEdge();
        setTimeout(() => { isDragging = false; hasMoved = false; }, 100);
      } else if (touchDuration < tapTimeThreshold && dragDistance < dragThreshold) {
        setTimeout(() => { isDragging = false; hasMoved = false; dragDistance = 0; }, 10);
      } else {
        isDragging = false;
        hasMoved   = false;
      }
    }

    function snapToEdge() {
      const rect  = fabContainer.getBoundingClientRect();
      const vp    = getViewportSize();
      const threshold = 50;

      let newX = xOffset;
      let newY = yOffset;

      if (rect.left < threshold)                     newX = defaultOffset;
      else if (rect.right > vp.width - threshold)    newX = vp.width - rect.width - defaultOffset;

      if (rect.top < threshold)                      newY = defaultOffset;
      else if (rect.bottom > vp.height - threshold)  newY = vp.height - rect.height - defaultOffset;

      fabContainer.style.transition = 'left 0.25s ease, top 0.25s ease';
      applyPosition(newX, newY, true);
      setTimeout(() => { fabContainer.style.transition = ''; }, 260);
    }

    // Menu placement
    function updateMenuPlacement() {
      const panel = fabContainer.querySelector('.fab-options');
      if (!panel) return;

      const rect = fabContainer.getBoundingClientRect();
      const vp   = getViewportSize();

      // Estimate the panel when it is still hidden.
      const panelH = panel.offsetHeight || (fabOptionEls.length * 31 + 12);
      const panelW = panel.offsetWidth  || 148;

      const spaceAbove = rect.top;
      const spaceBelow = vp.height - rect.bottom;
      const spaceRight = vp.width  - rect.left;
      const spaceLeft  = rect.right;

      const openDown  = spaceBelow >= panelH || spaceBelow > spaceAbove;
      const alignLeft = spaceLeft  < panelW  && spaceRight >= panelW;

      fabContainer.classList.toggle('fab-open-down',  openDown);
      fabContainer.classList.toggle('fab-align-left', alignLeft);
    }

    function keepInViewport() {
      if (isMinimized()) {
        snapMinimizedToEdge();
        return;
      }
      applyPosition(xOffset, yOffset, true);
      updateMenuPlacement();
    }

    window.addEventListener('resize',            keepInViewport);
    window.addEventListener('orientationchange', keepInViewport);

    // Toggle / open / close
    function openFAB() {
      updateMenuPlacement();
      fabContainer.classList.add('active');
    }

    function closeFAB() {
      fabContainer.classList.remove('active');
    }

    // Minimize / restore
    const LONG_PRESS_MS = 600;
    let longPressTimer = null;
    let longPressFired = false;

    function isMinimized() {
      return fabContainer.classList.contains('minimized');
    }

    function snapMinimizedToEdge() {
      const vp = getViewportSize();
      const rect = fabContainer.getBoundingClientRect();
      const nearLeft = rect.left + rect.width / 2 < vp.width / 2;
      xOffset = nearLeft ? 0 : vp.width - rect.width;
      yOffset = Math.max(viewportPadding, Math.min(yOffset, vp.height - rect.height - viewportPadding));
      fabContainer.style.left = xOffset + 'px';
      fabContainer.style.top = yOffset + 'px';
      fabContainer.classList.toggle('fab-align-left', nearLeft);
      localStorage.setItem('fabMinimizedEdge', nearLeft ? 'left' : 'right');
    }

    function minimizeFAB() {
      closeFAB();
      fabContainer.classList.add('minimized');
      localStorage.setItem('fabMinimized', 'true');
      snapMinimizedToEdge();

      const shownBefore = localStorage.getItem('fabMinimizeHintShown');
      notify('已最小化，点击小按钮恢复');
      if (!shownBefore) {
        localStorage.setItem('fabMinimizeHintShown', 'true');
      }
    }

    function restoreFAB() {
      fabContainer.classList.remove('minimized');
      localStorage.setItem('fabMinimized', 'false');
      applyPosition(xOffset, yOffset, true);
      updateMenuPlacement();
    }

    // Restore minimized state on load
    if (localStorage.getItem('fabMinimized') === 'true') {
      fabContainer.classList.add('minimized');
      const savedEdge = localStorage.getItem('fabMinimizedEdge');
      const vp = getViewportSize();
      const rect = fabContainer.getBoundingClientRect();
      xOffset = savedEdge === 'left' ? 0 : vp.width - rect.width;
      applyPosition(xOffset, yOffset, false);
      snapMinimizedToEdge();
    }

    function startLongPress(e) {
      if (isMinimized()) return;
      longPressFired = false;
      longPressTimer = setTimeout(() => {
        longPressFired = true;
        minimizeFAB();
      }, LONG_PRESS_MS);
    }

    function cancelLongPress() {
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    }

    fabMain.addEventListener('mousedown', function(e) { startLongPress(e); });
    fabMain.addEventListener('mouseup',   function() { cancelLongPress(); });
    fabMain.addEventListener('mouseleave',function() { cancelLongPress(); });
    fabMain.addEventListener('touchstart',function(e) { startLongPress(e); }, { passive: true });
    fabMain.addEventListener('touchend',  function() { cancelLongPress(); });
    fabMain.addEventListener('touchcancel', function() { cancelLongPress(); });

    function toggleFAB() {
      if (isDragging || hasMoved) return;
      if (isMinimized()) { restoreFAB(); return; }
      fabContainer.classList.contains('active') ? closeFAB() : openFAB();
    }

    // Click on main button
    fabMain.addEventListener('click', function(e) {
      if (longPressFired) {
        longPressFired = false;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (hasMoved || dragDistance >= dragThreshold) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      toggleFAB();
    }, true);

    // Click outside → close
    document.addEventListener('click', (e) => {
      if (!fabContainer.contains(e.target) && fabContainer.classList.contains('active')) {
        closeFAB();
      }
    });

    // Drag
    const evtOpts = supportsPassive ? { passive: false } : false;

    fabMain.addEventListener('touchstart',  dragStart, evtOpts);
    fabMain.addEventListener('touchmove',   drag,      evtOpts);
    fabMain.addEventListener('touchend',    dragEnd,   evtOpts);
    fabMain.addEventListener('touchcancel', dragEnd,   evtOpts);

    fabMain.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup',   dragEnd);

    fabMain.addEventListener('contextmenu', function(e) {
      if (isDragging || hasMoved) { e.preventDefault(); return false; }
    });

    // Tool actions
    function notify(message) {
      if (typeof window.showNotification === 'function') {
        window.showNotification(message);
        return;
      }

      const notice = document.createElement('div');
      notice.className = 'fab-notification';
      notice.textContent = message;
      document.body.appendChild(notice);
      requestAnimationFrame(() => notice.classList.add('show'));
      setTimeout(() => {
        notice.classList.remove('show');
        setTimeout(() => notice.remove(), 180);
      }, 1800);
    }

    function quizStorageKeysForCurrentPage() {
      const currentUrl = window.location.href.split('#')[0];
      const keys = [];

      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i);
        if (!key || !key.startsWith('quizChoices_')) continue;

        try {
          const savedUrl = atob(key.replace('quizChoices_', '')).split('#')[0];
          if (savedUrl === currentUrl) keys.push(key);
        } catch (e) {}
      }

      return keys;
    }

    function scrollTop() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function autoValidateChoice(input) {
      if (localStorage.getItem('validateSelection') !== 'true') return;

      const container = input.closest('.choice-container');
      if (!container) return;

      const choiceID = container.id.replace('quiz-', '');
      const answer = container.dataset.answer || '';
      const isMultiple = container.dataset.multiple === 'true';
      const toggleBtn = container.querySelector('.toggle-btn');
      const selectedValues = Array.from(container.querySelectorAll(`input[name="${choiceID}"]:checked`))
        .map(item => item.value)
        .sort();

      if (!selectedValues.length) return;
      if (isMultiple && selectedValues.length < answer.length) return;

      if (typeof window.checkAndToggleExplanation === 'function' && toggleBtn) {
        window.checkAndToggleExplanation(toggleBtn, choiceID, answer, isMultiple);
      }
    }

    function toggleValidateSelection() {
      const enabled = localStorage.getItem('validateSelection') !== 'true';
      localStorage.setItem('validateSelection', String(enabled));
      notify(enabled ? '已开启自动验证' : '已关闭自动验证');
    }

    document.addEventListener('change', event => {
      const target = event.target;
      if (target && (target.type === 'radio' || target.type === 'checkbox')) {
        autoValidateChoice(target);
      }
    });

    function applyNavbarPin() {
      document.body.classList.toggle('fab-navbar-pinned', localStorage.getItem('fabNavbarPinned') === 'true');
    }

    function togglePinNavbar() {
      const enabled = localStorage.getItem('fabNavbarPinned') !== 'true';
      localStorage.setItem('fabNavbarPinned', String(enabled));
      applyNavbarPin();
      notify(enabled ? '已固定导航栏' : '已取消固定导航栏');
    }

    function refreshChoices() {
      const keys = quizStorageKeysForCurrentPage();
      keys.forEach(key => localStorage.removeItem(key));
      document.querySelectorAll('.choice-container input').forEach(input => {
        input.checked = false;
        input.disabled = false;
      });
      document.querySelectorAll('.choice-correct, .choice-correct-missed, .choice-incorrect').forEach(el => {
        el.classList.remove('choice-correct', 'choice-correct-missed', 'choice-incorrect');
        el.style.cursor = '';
      });
      document.querySelectorAll('.feedback-area').forEach(el => {
        el.textContent = '';
        el.className = 'feedback-area';
        el.style.display = '';
      });
      document.querySelectorAll('.explanation').forEach(el => {
        el.style.display = 'none';
      });
      document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.textContent = '查看答案与解析';
      });
      notify(keys.length ? '已重置本页选项' : '本页没有已保存选项');
    }

    function showAnswers() {
      let count = 0;
      document.querySelectorAll('.choice-container').forEach(container => {
        const choiceID = container.id.replace('quiz-', '');
        const answer = container.dataset.answer || '';
        const isMultiple = container.dataset.multiple === 'true';
        const selectedValues = Array.from(container.querySelectorAll(`input[name="${choiceID}"]:checked`))
          .map(input => input.value)
          .sort();

        container.querySelectorAll(`input[name="${choiceID}"]`).forEach(input => {
          input.disabled = true;
          const label = input.closest('.choice-option, .choice-option-inline');
          if (!label) return;
          const isCorrect = isMultiple ? answer.includes(input.value) : input.value === answer;
          const isSelected = selectedValues.includes(input.value);
          label.classList.toggle('choice-correct', isCorrect && (!isMultiple || isSelected));
          label.classList.toggle('choice-correct-missed', isMultiple && isCorrect && !isSelected);
          label.classList.toggle('choice-incorrect', !isCorrect && isSelected);
          label.style.cursor = 'default';
        });

        const feedbackArea = document.getElementById('feedback-' + choiceID);
        if (feedbackArea) {
          feedbackArea.textContent = `正确答案是 ${isMultiple ? answer.split('').join(', ') : answer}`;
          feedbackArea.className = 'feedback-area correct';
          feedbackArea.style.display = 'block';
        }

        const explanation = document.getElementById('explanation-' + choiceID);
        if (explanation) {
          explanation.style.display = 'block';
          count += 1;
        }

        const toggleBtn = container.querySelector('.toggle-btn');
        if (toggleBtn) toggleBtn.textContent = '隐藏答案与解析';
      });
      notify(count ? `已显示 ${count} 个答案` : '本页没有可显示的答案');
    }

    function openFeedback() {
      window.location.href = '/user_feedback/send_feedback';
    }

    function openQuizCollection() {
      window.location.href = '/study_methods/quiz_collection/';
    }

const actions = {
      toggleValidateSelection,
      scrollTop,
      togglePinNavbar,
      refreshChoices,
      showAnswers,
      openFeedback,
      openQuizCollection
    };

    Object.keys(actions).forEach(name => { window[name] = actions[name]; });
    applyNavbarPin();

    // Option button clicks
    fabOptionEls.forEach(option => {
      option.addEventListener('click', function(e) {
        e.stopPropagation();
        const action = actions[this.dataset.action];
        if (action) action();
        else notify('这个工具暂不可用');
        setTimeout(closeFAB, 150);
      });
    });
  }
})();
