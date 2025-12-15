// app.js

/**
 * FormattedTimedelta와 유사한 기능을 하는 JavaScript 클래스
 */
class FormattedDuration {
    constructor(totalSeconds) {
        this.totalSeconds = Math.floor(totalSeconds);
    }

    toString() {
        if (isNaN(this.totalSeconds) || this.totalSeconds < 0) {
            return "00:00:00";
        }
        const hours = Math.floor(this.totalSeconds / 3600);
        const minutes = Math.floor((this.totalSeconds % 3600) / 60);
        const seconds = this.totalSeconds % 60;

        const pad = (num) => num.toString().padStart(2, '0');

        return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
}


document.addEventListener('DOMContentLoaded', () => {
    // 각 페이지에 맞는 초기화 함수 실행
    if (document.body.id === 'page-index') {
        initIndexPage();
    } else if (document.body.id === 'page-viewer') {
        initViewerPage();
    } else if (document.body.id === 'page-summary') {
        initSummaryPage();
    }
});

/**
 * index.html 페이지 초기화 로직
 */
async function initIndexPage() {
    const startForm = document.getElementById('start-form');
    if (!startForm) return;

    // 데이터 로드 후 최대 인덱스 설정
    try {
        const response = await fetch('vocab/data.json');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        
        // 전체 단어 데이터를 sessionStorage에 저장
        sessionStorage.setItem('wordData', JSON.stringify(data));

        const maxIndex = Object.keys(data).length;
        document.getElementById('start_index').max = maxIndex;
        document.getElementById('max-index-label').textContent = `(최대: ${maxIndex})`;

    } catch (error) {
        console.error('Failed to load word data:', error);
        alert('단어 데이터를 불러오는 데 실패했습니다.');
        return;
    }

    startForm.addEventListener('submit', (event) => {
        event.preventDefault();

        const wordData = JSON.parse(sessionStorage.getItem('wordData'));
        if (!wordData) {
            alert('단어 데이터가 로드되지 않았습니다. 페이지를 새로고침 해주세요.');
            return;
        }

        const formData = new FormData(startForm);
        let startIndex = parseInt(formData.get('start_index'), 10) - 1;
        const isShuffle = formData.get('is_shuffle') === 'on';

        const wordIndices = Object.keys(wordData).map(Number);

        if (isNaN(startIndex) || startIndex < 0 || startIndex >= wordIndices.length) {
            startIndex = 0;
        }

        if (isShuffle) {
            // Fisher-Yates shuffle
            let partToShuffle = wordIndices.slice(startIndex);
            for (let i = partToShuffle.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [partToShuffle[i], partToShuffle[j]] = [partToShuffle[j], partToShuffle[i]];
            }
            wordIndices.splice(startIndex, partToShuffle.length, ...partToShuffle);
        }

        // 세션 정보 저장
        sessionStorage.setItem('word_indices', JSON.stringify(wordIndices));
        sessionStorage.setItem('start_index', startIndex);
        sessionStorage.setItem('current_index', startIndex); // 학습 시작 위치
        sessionStorage.setItem('pass_rows', JSON.stringify([]));
        sessionStorage.setItem('start_time', Date.now() / 1000);
        sessionStorage.setItem('pause_total', 0);
        sessionStorage.setItem('last_index', -1);

        window.location.href = 'viewer.html';
    });
}

/**
 * viewer.html 페이지 초기화 로직
 */
function initViewerPage() {
    // 세션 정보 없으면 시작 페이지로
    const wordIndices = sessionStorage.getItem('word_indices');
    if (!wordIndices) {
        window.location.href = 'index.html';
        return;
    }

    // DOM 요소 가져오기
    const titlePane = document.getElementById('title-pane');
    const derivPane = document.getElementById('deriv-pane');
    const screen = document.querySelector('.screen');

    const progressElem = document.getElementById('progress-display');
    const timerElem = document.getElementById('timer-display');

    const nextBtn = document.getElementById('next-btn');
    const passBtn = document.getElementById('pass-btn');
    const endBtn = document.getElementById('end-btn');
    const pauseBtn = document.getElementById('pause-btn');

    let timerInterval;
    let isPaused = false;
    let pauseStartTime = 0;
    let totalPausedTime = 0;
    let isTimerVisible = true;
    
    // 상태 관리를 위한 변수 추가
    let currentState = 'INIT'; // 'INIT', 'SHOWING_EN', 'SHOWING_KO'
    let currentWord = null;
    let autoAdvanceTimer = null;
    const DELAY_EN_TO_KO = 3000; // 3초
    const DELAY_KO_TO_NEXT = 2000; // 2초

    // 타이머 시작
    function startTimer() {
        const startTime = parseFloat(sessionStorage.getItem('start_time'));
        timerInterval = setInterval(() => {
            if (!isPaused && isTimerVisible) {
                const elapsed = (Date.now() / 1000) - startTime - totalPausedTime;
                timerElem.textContent = new FormattedDuration(elapsed).toString();
            }
        }, 1000);
    }
    
    function setNextTimer() {
        if (isPaused) return; // 일시정지 중에는 타이머를 설정하지 않음
        const delay = currentState === 'SHOWING_EN' ? DELAY_EN_TO_KO : DELAY_KO_TO_NEXT;
        autoAdvanceTimer = setTimeout(advance, delay);
    }
    function showKorean() {
        if (currentState !== 'SHOWING_EN' || !currentWord) return;
        clearTimeout(autoAdvanceTimer);
        currentState = 'SHOWING_KO';

        // 한글 뜻을 위한 스타일로 변경
        titlePane.className = 'word-translation';
        titlePane.textContent = currentWord.ko;

        // deriv_ko의 타입에 따라 올바르게 처리합니다.
        if (Array.isArray(currentWord.deriv_ko)) {
            derivPane.textContent = currentWord.deriv_ko.join('\n');
        } else {
            // 문자열인 경우, 쉼표를 줄바꿈으로 변경합니다.
            derivPane.textContent = (currentWord.deriv_ko || '').replace(/, /g, '\n');
        }
    }

    function showNextWord() {
        clearTimeout(autoAdvanceTimer);
        currentWord = getNextWord();

        if (currentWord.finished) {
            endRun(totalPausedTime);
            return;
        }

        currentState = 'SHOWING_EN';
        // 영어 단어를 위한 스타일로 변경
        titlePane.className = 'word-title';
        titlePane.textContent = currentWord.en;

        // deriv_en의 타입에 따라 올바르게 처리합니다.
        if (Array.isArray(currentWord.deriv_en)) {
            derivPane.textContent = currentWord.deriv_en.join('\n');
        } else {
            // 문자열인 경우, 쉼표를 줄바꿈으로 변경합니다.
            derivPane.textContent = (currentWord.deriv_en || '').replace(/, /g, '\n');
        }
        progressElem.textContent = currentWord.progress;
    }

    function advance() {
        if (currentState === 'SHOWING_EN') {
            showKorean();
        } else {
            showNextWord();
        }
        setNextTimer();
    }

    // 이벤트 리스너 설정
    nextBtn.addEventListener('click', () => {
        // 일시정지 중에도 화면 전환은 허용하되, 타이머는 설정하지 않음
        showNextWord();
        if (!isPaused) {
            setNextTimer();
        }
    });
    
    timerElem.addEventListener('click', () => {
        isTimerVisible = !isTimerVisible;
        if (isTimerVisible) {
            // 타이머를 다시 표시할 때 현재 시간으로 즉시 업데이트
            const startTime = parseFloat(sessionStorage.getItem('start_time'));
            const elapsed = (Date.now() / 1000) - startTime - totalPausedTime;
            timerElem.textContent = new FormattedDuration(elapsed).toString();
        } else {
            timerElem.textContent = '⏲️';
        }
    });


    passBtn.addEventListener('click', handleContextualPass);

    endBtn.addEventListener('click', () => {
        clearTimeout(autoAdvanceTimer);
        clearInterval(timerInterval);
        endRun(totalPausedTime);
    });

    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        if (isPaused) {
            clearTimeout(autoAdvanceTimer);
            pauseStartTime = Date.now() / 1000;
            pauseBtn.textContent = 'Resume';
        } else {
            totalPausedTime += (Date.now() / 1000) - pauseStartTime;
            pauseBtn.textContent = 'Pause';
            // 현재 상태에 따라 타이머 재시작
            if (currentState === 'SHOWING_EN') {
                setNextTimer();
            }
        }
    });

    screen.addEventListener('click', handleContextualPass);

    // 키보드 이벤트 리스너 추가
    document.addEventListener('keydown', (event) => {
        // 다른 입력 필드에 포커스 되어 있을 때는 작동하지 않도록 함
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;

        if (event.key === 'ArrowRight') {
            handleContextualPass();
        }
    });

    function handleContextualPass() {
        passWord(); // 1. 아는 단어로 기록
        updateProgressUI(); // 2. 진행률 UI 업데이트
        // 3. 기존의 단계별 학습 진행
        if (currentState === 'SHOWING_EN') {
            showKorean();
        } else {
            showNextWord();
        }
        // 일시정지 상태가 아닐 때만 다음 타이머를 설정
        if (!isPaused) {
            setNextTimer();
        }
    }

    function updateProgressUI() {
        const progress = parseInt(sessionStorage.getItem('current_index'), 10) - parseInt(sessionStorage.getItem('start_index'), 10);
        const passRows = JSON.parse(sessionStorage.getItem('pass_rows'));
        const alreadyKnow = passRows.length;
        if (progressElem) {
            progressElem.textContent = `${progress} (${progress - alreadyKnow})`;
        }
    }
    // 초기 단어 표시 및 타이머 시작
    showNextWord();
    setNextTimer();
    startTimer();
}

/**
 * 다음 단어 정보를 가져와 화면에 표시하는 함수 (기존 /get_word)
 */
function getNextWord() {
    const wordData = JSON.parse(sessionStorage.getItem('wordData'));
    const wordIndices = JSON.parse(sessionStorage.getItem('word_indices'));
    let currentIndex = parseInt(sessionStorage.getItem('current_index'), 10);
    const startIndex = parseInt(sessionStorage.getItem('start_index'), 10);
    const passRows = JSON.parse(sessionStorage.getItem('pass_rows'));

    if (currentIndex >= wordIndices.length) {
        // 학습 완료
        return { finished: true };
    }

    const actualIndex = wordIndices[currentIndex];
    const row = wordData[actualIndex];
    sessionStorage.setItem('last_index', actualIndex);

    // 다음 인덱스 준비
    sessionStorage.setItem('current_index', currentIndex + 1);

    const progress = currentIndex - startIndex + 1;
    const alreadyKnow = passRows.length;

    return {
        en: row.en,
        ko: row.ko,
        deriv_en: row.deriv_en,
        deriv_ko: row.deriv_ko,
        progress: `${progress} (${progress - alreadyKnow})`,
        finished: false
    };
}

/**
 * '아는 단어' 처리 함수 (기존 /pass_word)
 */
function passWord() {
    const lastActualIndex = parseInt(sessionStorage.getItem('last_index'), 10);
    if (lastActualIndex !== -1) {
        let passList = JSON.parse(sessionStorage.getItem('pass_rows'));
        if (!passList.includes(lastActualIndex)) {
            passList.push(lastActualIndex);
            sessionStorage.setItem('pass_rows', JSON.stringify(passList));
        }
    }
}

/**
 * 학습 종료 처리 함수 (기존 /end_run)
 * @param {number} pauseTotal - 총 일시정지 시간 (초)
 */
function endRun(pauseTotal) {
    const startTime = parseFloat(sessionStorage.getItem('start_time'));
    sessionStorage.setItem('pause_total', pauseTotal);
    sessionStorage.setItem('total_elapsed', (Date.now() / 1000) - startTime);
    window.location.href = 'summary.html';
}

/**
 * summary.html 페이지 초기화 로직
 */
function initSummaryPage() {
    if (!sessionStorage.getItem('total_elapsed')) {
        window.location.href = 'index.html';
        return;
    }

    const totalElapsed = parseFloat(sessionStorage.getItem('total_elapsed'));
    const pauseTotal = parseFloat(sessionStorage.getItem('pause_total'));
    const passRows = JSON.parse(sessionStorage.getItem('pass_rows'));
    const startIndex = parseInt(sessionStorage.getItem('start_index'), 10);
    const currentIndex = parseInt(sessionStorage.getItem('current_index'), 10);

    const totalTime = new FormattedDuration(totalElapsed - pauseTotal);
    const pauseTime = new FormattedDuration(pauseTotal);
    const passedCount = passRows.length;
    const totalStudied = currentIndex - startIndex;
    const finalProgressStr = `${totalStudied} (${totalStudied - passedCount})`;

    document.getElementById('total-time').textContent = totalTime.toString();
    document.getElementById('pause-time').textContent = pauseTime.toString();
    document.getElementById('passed-count').textContent = passedCount;
    document.getElementById('start-idx').textContent = startIndex + 1;
    document.getElementById('total-studied').textContent = totalStudied;
    document.getElementById('final-progress').textContent = finalProgressStr;

    // 세션 정리 (선택 사항)
    // document.getElementById('restart-button').addEventListener('click', () => {
    //     sessionStorage.clear();
    //     window.location.href = 'index.html';
    // });
}