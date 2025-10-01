document.addEventListener('DOMContentLoaded', () => {
    const state = {
        mode: 'en',
        paused: false,
        running: true,
        currentWordData: null,
        timeoutId: null,
        timerIntervalId: null,
        elapsedSeconds: 0,
        pauseStart: null,
        pauseTotal: 0,
    };

    const DURATION_EN = 3000;
    const DURATION_KO = 2000;

    // DOM Elements
    const counterEl = document.getElementById('counter');
    const stateEl = document.getElementById('state');
    const timerEl = document.getElementById('timer');
    const titleTextEl = document.getElementById('title-text');
    const derivTextEl = document.getElementById('deriv-text');
    const passBtn = document.getElementById('pass-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const endBtn = document.getElementById('end-btn');

    function formatTime(seconds) {
        return new Date(seconds * 1000).toISOString().substr(11, 8);
    }

    function updateTimer() {
        if (!state.paused) {
            state.elapsedSeconds++;
            timerEl.textContent = formatTime(state.elapsedSeconds);
        }
    }

    async function fetchNextWord() {
        try {
            const response = await fetch('/get_word');
            if (!response.ok) throw new Error('Failed to fetch word');
            const data = await response.json();

            return data; // 데이터를 반환하도록 변경
        } catch (error) {
            console.error(error);
            titleTextEl.textContent = "Error loading word.";
            return { finished: true }; // 오류 발생 시 종료 처리
        }
    }

    async function loadAndShowNextWord() {
        const data = await fetchNextWord();
        if (data.finished) {
            endRun();
            return;
        }
        state.currentWordData = data;
        counterEl.textContent = data.progress;
        showText();
    }

    function renderCurrentWord() {
        const data = state.currentWordData;
        if (!data) return;

        if (state.mode === 'en') {
            stateEl.textContent = '[ EN ]';
            titleTextEl.textContent = data.title_en;
            derivTextEl.textContent = data.deriv_en.join('\n');
        } else { // 'ko' mode
            stateEl.textContent = '[ KO ]';
            titleTextEl.textContent = data.title_ko;
            derivTextEl.textContent = data.deriv_ko.join('\n');
        }
    }

    function showText() {
        if (state.paused || !state.running) return;

        clearTimeout(state.timeoutId);
        let duration;

        renderCurrentWord();

        if (state.mode === 'en') {
            duration = DURATION_EN;
            state.mode = 'ko';
            state.timeoutId = setTimeout(showText, duration);
        } else { // 'ko' mode
            duration = DURATION_KO;
            state.mode = 'en';
            state.timeoutId = setTimeout(loadAndShowNextWord, duration);
        }
    }

    async function passImmediate(event) {
        if (!state.currentWordData || !state.running) return;

        clearTimeout(state.timeoutId);
        await fetch('/pass_word', { method: 'POST' });

        if (state.paused) {
            // 일시정지 상태에서는 타이머 없이 화면만 수동으로 전환
            // state.mode는 '다음' 상태를 가리킵니다. 'ko'는 EN이 표시된 상태, 'en'은 KO가 표시된 상태를 의미합니다.
            if (state.mode === 'ko') { // 현재 EN 화면에서 Pass를 누른 경우 -> KO 화면으로 전환
                // state.mode = 'ko'; // 이 줄은 renderCurrentWord 내부 로직과 중복되므로 제거 가능
                renderCurrentWord();
                // KO 화면을 표시했으므로, 다음 Pass를 위해 mode를 'en'으로 설정합니다.
                state.mode = 'en';
            } else { // 현재 KO 화면에서 Pass를 누른 경우 -> 다음 단어의 EN 화면으로 전환
                // state.mode = 'en';
                const data = await fetchNextWord();
                if (data.finished) {
                    endRun();
                    return;
                }
                // 가져온 데이터로 상태와 화면을 직접 갱신
                state.currentWordData = data;
                counterEl.textContent = data.progress;
                // 다음 단어의 EN 모드로 상태를 명확히 설정
                // state.mode = 'en';
                renderCurrentWord();
                state.mode = 'ko';
            }
        } else {
            // 실행 중일 때는 기존 로직대로 즉시 다음 단계로 진행
            if (state.mode === 'ko') {
                showText(); // 즉시 한국어 뜻을 보여줌
            } else { // 'en' 모드는 한국어 뜻이 표시된 상태
                loadAndShowNextWord(); // 즉시 다음 단어를 가져와서 보여줌
            }
        }
    }

    function togglePause() {
        state.paused = !state.paused;
        if (state.paused) {
            pauseBtn.textContent = 'Resume';
            clearTimeout(state.timeoutId);
            state.pauseStart = Date.now();
        } else {
            pauseBtn.textContent = 'Pause';
            if (state.pauseStart) {
                state.pauseTotal += (Date.now() - state.pauseStart) / 1000;
            }
            showText();
        }
    }

    async function endRun() {
        if (!state.running) return;
        state.running = false;
        clearTimeout(state.timeoutId);
        clearInterval(state.timerIntervalId);

        let finalPauseTotal = state.pauseTotal;
        if (state.paused && state.pauseStart) {
            finalPauseTotal += (Date.now() - state.pauseStart) / 1000;
        }

        try {
            await fetch('/end_run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pause_total: finalPauseTotal })
            });
            window.location.href = '/summary';
        } catch (error) {
            console.error('Failed to end run:', error);
        }
    }

    // Event Listeners
    passBtn.addEventListener('click', passImmediate);
    pauseBtn.addEventListener('click', togglePause);
    endBtn.addEventListener('click', endRun);

    // --- 화면 높이 최적화 (모바일 브라우저 UI 문제 해결) ---
    function setScreenHeight() {
        // 실제 내부 창 높이를 CSS 변수로 설정
        document.documentElement.style.setProperty('--vh', `${window.innerHeight * 0.01}px`);
    }

    // 창 크기가 변경될 때마다 높이 재계산
    window.addEventListener('resize', setScreenHeight);

    // Initial load
    function start() {
        setScreenHeight(); // 초기 로드 시 높이 설정
        state.timerIntervalId = setInterval(updateTimer, 1000);
        loadAndShowNextWord();
    }

    start();
});