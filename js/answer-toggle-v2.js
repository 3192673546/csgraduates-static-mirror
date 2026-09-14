(function () {
  'use strict'

  function isVisible(el) {
    return !!el && window.getComputedStyle(el).display !== 'none'
  }

  function setButtonState(button, expanded) {
    if (!button) return
    button.style.display = ''
    button.textContent = expanded ? '隐藏答案与解析' : '查看答案与解析'
    button.setAttribute('aria-expanded', expanded ? 'true' : 'false')
  }

  function installChoiceToggle() {
    var original = window.checkAndToggleExplanation
    if (typeof original !== 'function' || original.__answerToggleV2) return

    function patched(button, choiceId, answer, isMultiple) {
      var explanation = document.getElementById('explanation-' + choiceId)

      // After the answer has been revealed once, this button only controls
      // collapse/reopen. Grading remains exactly as the original site handled it.
      if (explanation && explanation.dataset.answerRevealed === 'true') {
        var show = !isVisible(explanation)
        explanation.style.display = show ? 'block' : 'none'
        setButtonState(button, show)
        return
      }

      // First click: keep the original selection validation, grading,
      // feedback, localStorage and disabled-option behavior.
      original(button, choiceId, answer, isMultiple)

      explanation = document.getElementById('explanation-' + choiceId)
      if (isVisible(explanation)) {
        explanation.dataset.answerRevealed = 'true'
        setButtonState(button, true)
      }
    }

    patched.__answerToggleV2 = true
    patched.__original = original
    window.checkAndToggleExplanation = patched
  }

  function restoreVerifiedButtons() {
    document.querySelectorAll('.choice-container').forEach(function (container) {
      var choiceId = (container.id || '').replace(/^quiz-/, '')
      if (!choiceId) return

      var explanation = document.getElementById('explanation-' + choiceId)
      if (!isVisible(explanation)) return

      explanation.dataset.answerRevealed = 'true'
      setButtonState(container.querySelector('.quiz-actions .toggle-btn'), true)
    })
  }

  installChoiceToggle()

  // The bundled quiz script restores previously verified answers on
  // DOMContentLoaded and hides their buttons. Run immediately after those
  // listeners complete so restored questions also remain collapsible.
  document.addEventListener('DOMContentLoaded', function () {
    installChoiceToggle()
    window.setTimeout(restoreVerifiedButtons, 0)
  })
})()
