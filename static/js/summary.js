document.addEventListener('DOMContentLoaded', () => {
    const timerBtn = document.getElementById('timer-btn');
    const timerTextEl = document.getElementById('timer-text');
    let timerHidden = false;
    if (timerBtn && timerTextEl) {
        timerBtn.addEventListener('click', () => {
            timerHidden = !timerHidden;
            if (timerHidden) {
                timerTextEl.textContent = '⏲️';
                    timerTextEl.style.fontSize = '20px';
            } else {
                // timerTextEl.textContent = timerBtn.dataset.time || timerTextEl.dataset.time || timerTextEl.textContent;
                timerTextEl.textContent = (timerBtn.dataset.time || timerTextEl.dataset.time || timerTextEl.textContent).replace(/^(\d):/, '0$1:');
                    timerTextEl.style.fontSize = '';
            }
        });
        // 최초 진입 시 실제 시간값을 data-time에 저장
        if (!timerBtn.dataset.time) {
            timerBtn.dataset.time = timerTextEl.textContent;
            timerTextEl.dataset.time = timerTextEl.textContent;
        }
        // 최초 진입 시에도 스타일 적용
    }
});
