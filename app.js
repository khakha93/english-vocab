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

    const effControls = document.getElementById('eff-controls');
    const toeicControls = document.getElementById('toeic-controls');

    // 모드 전환 이벤트 리스너
    const modeRadios = startForm.querySelectorAll('input[name="mode"]');
    if (effControls && toeicControls) {
        modeRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'EFF') {
                    effControls.style.display = 'block';
                    toeicControls.style.display = 'none';
                } else {
                    effControls.style.display = 'none';
                    toeicControls.style.display = 'block';
                }
            });
        });
    }

    startForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const formData = new FormData(startForm);
        const mode = formData.get('mode');
        const isShuffle = formData.get('is_shuffle') === 'on';
        
        let wordData = [];
        let wordIndices = [];
        let startIndex = 0;

        if (mode === 'EFF') {
            const rawData = JSON.parse(sessionStorage.getItem('effWordData'));
            if (!rawData) {
                alert('단어 데이터가 로드되지 않았습니다. 페이지를 새로고침 해주세요.');
                return;
            }
            // EFF 데이터는 객체 형태이므로 배열처럼 접근하기 위해 키 매핑
            // 기존 로직 유지를 위해 wordData에 전체 객체를 저장하고 인덱스로 접근
            sessionStorage.setItem('wordData', JSON.stringify(rawData));
            
            startIndex = parseInt(formData.get('start_index'), 10) - 1;
            wordIndices = Object.keys(rawData).map(Number);

            if (isNaN(startIndex) || startIndex < 0 || startIndex >= wordIndices.length) {
                startIndex = 0;
            }
        } else if (mode === 'TOEIC') {
            try {
                const response = await fetch('vocab/vocabulary.csv');
                if (!response.ok) throw new Error('Failed to load vocabulary.csv');
                const text = await response.text();
                const allToeicData = parseCSV(text);

                const startDay = parseInt(formData.get('start_day'), 10);
                const endDay = parseInt(formData.get('end_day'), 10);

                sessionStorage.setItem('start_day', startDay);
                sessionStorage.setItem('end_day', endDay);

                // Day 필터링
                const filteredData = allToeicData.filter(item => item.day >= startDay && item.day <= endDay);
                
                if (filteredData.length === 0) {
                    alert('해당 범위에 단어가 없습니다.');
                    return;
                }

                // TOEIC 데이터는 배열 형태. 인덱스는 0부터 시작.
                // wordData에 필터링된 배열을 저장.
                // viewer에서는 인덱스로 접근하므로, wordIndices는 0 ~ length-1
                sessionStorage.setItem('wordData', JSON.stringify(filteredData));
                wordIndices = filteredData.map((_, index) => index);
                startIndex = 0; // TOEIC 모드는 항상 처음부터 시작 (필터링된 범위 내에서)

            } catch (error) {
                console.error(error);
                alert('TOEIC 데이터를 불러오는 데 실패했습니다.');
                return;
            }
        }

        if (isShuffle) {
            // Fisher-Yates shuffle
            // EFF 모드일 때는 startIndex 이후만 섞었으나, TOEIC은 전체(필터된 범위)를 섞음
            let partToShuffle = mode === 'EFF' ? wordIndices.slice(startIndex) : wordIndices;
            
            for (let i = partToShuffle.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [partToShuffle[i], partToShuffle[j]] = [partToShuffle[j], partToShuffle[i]];
            }
            
            if (mode === 'EFF') {
                wordIndices.splice(startIndex, partToShuffle.length, ...partToShuffle);
            } else {
                wordIndices = partToShuffle;
            }
        }

        // 세션 정보 저장
        sessionStorage.setItem('mode', mode);
        sessionStorage.setItem('word_indices', JSON.stringify(wordIndices));
        sessionStorage.setItem('start_index', startIndex);
        sessionStorage.setItem('current_index', startIndex); // 학습 시작 위치
        sessionStorage.setItem('pass_rows', JSON.stringify([]));
        sessionStorage.setItem('start_time', Date.now() / 1000);
        sessionStorage.setItem('pause_total', 0);
        sessionStorage.setItem('last_index', -1);

        window.location.href = 'viewer.html';
    });

    // 데이터 로드 후 최대 인덱스 설정 (이벤트 리스너 등록 후에 실행)
    if (document.getElementById('start_index')) {
        try {
            const response = await fetch('vocab/data.json');
            if (!response.ok) throw new Error('Network response was not ok');
            const data = await response.json();
            
            // 전체 단어 데이터를 sessionStorage에 저장 (EFF용)
            sessionStorage.setItem('effWordData', JSON.stringify(data));

            const maxIndex = Object.keys(data).length;
            document.getElementById('start_index').max = maxIndex;
            document.getElementById('max-index-label').textContent = `(최대: ${maxIndex})`;

        } catch (error) {
            console.error('Failed to load word data:', error);
            // EFF 모드가 아닐 수도 있으므로 여기서 return 하지 않음
            // alert('단어 데이터를 불러오는 데 실패했습니다.'); 
        }
    }

    // TOEIC 모드용 Day Grid 초기화
    try {
        const response = await fetch('vocab/vocabulary.csv');
        if (response.ok) {
            const text = await response.text();
            const data = parseCSV(text);
            const maxDay = data.reduce((max, item) => Math.max(max, item.day), 0);
            initDayGrid(maxDay);
        }
    } catch (error) {
        console.error('Failed to load vocabulary.csv for grid:', error);
    }
}

function initDayGrid(maxDay) {
    const gridContainer = document.getElementById('day-grid');
    const startInput = document.getElementById('start_day');
    const endInput = document.getElementById('end_day');
    const rangeDisplay = document.getElementById('range-display');
    
    if (!gridContainer) return;

    let rangeStart = 1;
    let rangeEnd = 1;
    let clickStep = 0; // 0: 선택 완료(새 시작 대기), 1: 시작점 선택됨(끝점 대기)

    function updateUI() {
        startInput.value = rangeStart;
        endInput.value = rangeEnd;
        rangeDisplay.textContent = `${rangeStart} ~ ${rangeEnd}`;

        const buttons = gridContainer.querySelectorAll('.day-btn');
        buttons.forEach(btn => {
            const day = parseInt(btn.dataset.day, 10);
            btn.className = 'day-btn'; // reset
            if (day === rangeStart || day === rangeEnd) {
                btn.classList.add('selected');
            } else if (day > rangeStart && day < rangeEnd) {
                btn.classList.add('in-range');
            }
        });
    }

    for (let i = 1; i <= maxDay; i++) {
        const btn = document.createElement('button');
        btn.type = 'button'; // 폼 제출 방지
        btn.className = 'day-btn';
        btn.textContent = i;
        btn.dataset.day = i;
        
        btn.addEventListener('click', () => {
            if (clickStep === 0) {
                rangeStart = i;
                rangeEnd = i;
                clickStep = 1;
            } else {
                if (i < rangeStart) {
                    rangeStart = i;
                    rangeEnd = i;
                    // clickStep remains 1 (still waiting for end, or treating this as new start)
                } else {
                    rangeEnd = i;
                    clickStep = 0;
                }
            }
            updateUI();
        });

        gridContainer.appendChild(btn);
    }
    
    // 초기 UI 업데이트
    updateUI();
}

function parseCSV(text) {
    const data = [];
    let currentRow = [];
    let currentVal = '';
    let inQuote = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];

        if (char === '"') {
            inQuote = !inQuote;
        }

        if (char === ',' && !inQuote) {
            currentRow.push(currentVal);
            currentVal = '';
        } else if ((char === '\n' || char === '\r') && !inQuote) {
            currentRow.push(currentVal);
            if (currentRow.length >= 4) {
                data.push(currentRow);
            }
            currentRow = [];
            currentVal = '';
            // \r\n 처리: 다음 문자가 \n이면 건너뜀 (단, for문에서 i가 증가하므로 여기서 처리 필요 없음, 
            // 하지만 char가 \r일 때 위 조건에 걸려 처리되었으므로, 다음 \n은 빈 줄로 처리될 수 있음. 
            // 간단하게 \r, \n 모두 행 구분자로 처리하고 빈 줄은 무시하는 로직이 안전함)
        } else {
            currentVal += char;
        }
    }
    // 마지막 줄 처리
    if (currentVal || currentRow.length > 0) {
        currentRow.push(currentVal);
        if (currentRow.length >= 4) data.push(currentRow);
    }

    // 헤더 제외 (첫 번째 행의 day가 숫자가 아니면 헤더로 간주)
    const startIndex = (data.length > 0 && isNaN(parseInt(data[0][0]))) ? 1 : 0;

    return data.slice(startIndex).map(parts => ({
        day: parseInt(parts[0].trim(), 10),
        idx: parts[1].trim(),
        en: parts[2].replace(/^"|"$/g, '').trim(),
        ko: parts[3].replace(/^"|"$/g, '').trim()
    }));
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

    const mode = sessionStorage.getItem('mode') || 'EFF';
    if (mode === 'TOEIC') {
        document.body.classList.add('mode-toeic');
    }

    // Wake Lock (화면 꺼짐 방지)
    let wakeLock = null;
    const requestWakeLock = async () => {
        try {
            if ('wakeLock' in navigator) {
                wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (err) {
            console.error('Wake Lock failed:', err);
        }
    };

    const releaseWakeLock = async () => {
        if (wakeLock !== null) {
            try {
                await wakeLock.release();
                wakeLock = null;
            } catch (err) {
                console.error('Wake Lock release failed:', err);
            }
        }
    };

    requestWakeLock();

    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible' && !isPaused) {
            await requestWakeLock();
        }
    });

    // DOM 요소 가져오기
    const titlePane = document.getElementById('title-pane');
    const derivPane = document.getElementById('deriv-pane');
    const screen = document.querySelector('.screen');

    const progressElem = document.getElementById('progress-display');
    const dayElem = document.getElementById('day-display');
    const timerElem = document.getElementById('timer-display');

    const nextBtn = document.getElementById('next-btn');
    const passBtn = document.getElementById('pass-btn');
    const endBtn = document.getElementById('end-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const speakBtn = document.getElementById('speak-btn');
    const speakToggleBtn = document.getElementById('speak-toggle-btn');

    let timerInterval;
    let isPaused = false;
    let pauseStartTime = 0;
    let totalPausedTime = 0;
    let isTimerVisible = true;
    
    let isAutoSpeakOn = false;
    // 상태 관리를 위한 변수 추가
    let currentState = 'INIT'; // 'INIT', 'SHOWING_EN', 'SHOWING_KO'
    let currentWord = null;
    let autoAdvanceTimer = null;
    const DELAY_EN_TO_KO = 3000; // 3초
    const DELAY_KO_TO_NEXT = 2000; // 2초

    if (mode !== 'TOEIC' && dayElem) {
        dayElem.style.display = 'none';
    }

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
    
    /**
     * 주어진 텍스트를 영어로 발음하는 함수
     * @param {string} text 발음할 텍스트
     */
    function speak(text) {
        window.speechSynthesis.cancel(); // 이전 발음 취소
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
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

        if (mode === 'TOEIC') {
            // TOEIC 모드: title에 영어 유지, deriv에 한글 뜻 표시
            titlePane.className = 'word-title'; // 영어 스타일 유지
            if (currentWord.en.split(' ').some(w => w.length >= 10)) {
                titlePane.classList.add('long-word');
            }
            titlePane.textContent = currentWord.en;
            
            derivPane.className = 'word-translation'; // 한글 스타일 적용
            derivPane.innerHTML = currentWord.ko.replace(/\n/g, '<br>');
        } else {
            // EFF 모드 (기존 동작): title에 한글 뜻, deriv에 파생어 한글
            titlePane.className = 'word-translation';
            titlePane.textContent = currentWord.ko;
            titlePane.style.fontSize = ''; // 한글 표시 때는 폰트 크기 초기화

            // deriv_ko의 타입에 따라 올바르게 처리합니다.
            if (Array.isArray(currentWord.deriv_ko)) {
                derivPane.textContent = currentWord.deriv_ko.join('\n');
            } else {
                // 문자열인 경우, 쉼표를 줄바꿈으로 변경합니다.
                derivPane.textContent = (currentWord.deriv_ko || '').replace(/, /g, '\n');
            }
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
        if (currentWord.en.split(' ').some(w => w.length >= 10)) {
            titlePane.classList.add('long-word');
        }
        titlePane.textContent = currentWord.en;

        if (mode === 'TOEIC') {
            // TOEIC 모드: deriv 부분 비움 (또는 필요시 day 정보 등 표시 가능)
            derivPane.textContent = '';
            if (dayElem) dayElem.textContent = `Day ${currentWord.day}`;
        } else {
            // EFF 모드 (기존 동작): deriv에 파생어 영어
            // deriv_en의 타입에 따라 올바르게 처리합니다.
            if (Array.isArray(currentWord.deriv_en)) {
                derivPane.textContent = currentWord.deriv_en.join('\n');
            } else {
                // 문자열인 경우, 쉼표를 줄바꿈으로 변경합니다.
                derivPane.textContent = (currentWord.deriv_en || '').replace(/, /g, '\n');
            }
        }

        if (isAutoSpeakOn) {
            speak(currentWord.en);
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

    speakToggleBtn.addEventListener('click', () => {
        isAutoSpeakOn = !isAutoSpeakOn;
        speakToggleBtn.textContent = isAutoSpeakOn ? '🔊' : '🔇';
    });

    speakBtn.addEventListener('click', () => {
        if (currentWord && currentWord.en) {
            speak(currentWord.en);
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
            pauseBtn.textContent = '▶️';
            releaseWakeLock();
        } else {
            totalPausedTime += (Date.now() / 1000) - pauseStartTime;
            pauseBtn.textContent = '⏸️';
            // 현재 상태에 따라 타이머 재시작
            setNextTimer();
            requestWakeLock();
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
        day: row.day,
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
    // const finalProgressStr = `${totalStudied} (${totalStudied - passedCount})`;

    document.getElementById('total-time').textContent = totalTime.toString();
    document.getElementById('pause-time').textContent = pauseTime.toString();
    document.getElementById('passed-count').textContent = passedCount;
    // document.getElementById('start-idx').textContent = startIndex + 1;
    document.getElementById('total-studied').textContent = totalStudied;
    // document.getElementById('final-progress').textContent = finalProgressStr;

    const mode = sessionStorage.getItem('mode');
    if (mode === 'TOEIC') {
        const startDay = sessionStorage.getItem('start_day');
        const endDay = sessionStorage.getItem('end_day');
        const dayRangeDisplay = document.getElementById('day-range-display');
        if (startDay && endDay && dayRangeDisplay) {
            dayRangeDisplay.style.display = 'block';
            document.getElementById('day-range-val').textContent = `${startDay} ~ ${endDay}`;
        }
    }

    // 미암기 단어 목록 생성 (아코디언 형태)
    const wordData = JSON.parse(sessionStorage.getItem('wordData'));
    const wordIndices = JSON.parse(sessionStorage.getItem('word_indices'));
    
    const missedWords = [];
    const missedIndices = [];
    // 학습한 범위(startIndex ~ currentIndex) 내에서 pass하지 않은 단어 필터링
    for (let i = startIndex; i < currentIndex; i++) {
        const actualIndex = wordIndices[i];
        if (!passRows.includes(actualIndex)) {
            missedWords.push(wordData[actualIndex]);
            missedIndices.push(actualIndex);
        }
    }

    if (missedWords.length > 0) {
        // 오답 재학습 버튼 추가
        const controls = document.querySelector('.controls');
        if (controls) {
            const container = document.createElement('div');
            container.className = 'review-controls';

            const reviewBtn = document.createElement('button');
            reviewBtn.textContent = '오답 재학습';
            reviewBtn.className = 'review-btn';
            
            const label = document.createElement('label');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = false; // 기본값: 셔플 끄기
            
            label.appendChild(checkbox);
            label.appendChild(document.createTextNode('Shuffle'));

            reviewBtn.onclick = () => {
                let indicesToUse = [...missedIndices]; // 원본 보존을 위해 복사
                if (checkbox.checked) {
                    // 셔플 (Fisher-Yates)
                    for (let i = indicesToUse.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [indicesToUse[i], indicesToUse[j]] = [indicesToUse[j], indicesToUse[i]];
                    }
                }

                // 세션 데이터 덮어쓰기 및 초기화
                sessionStorage.setItem('word_indices', JSON.stringify(indicesToUse));
                sessionStorage.setItem('start_index', 0);
                sessionStorage.setItem('current_index', 0);
                sessionStorage.setItem('pass_rows', JSON.stringify([]));
                sessionStorage.setItem('start_time', Date.now() / 1000);
                sessionStorage.setItem('pause_total', 0);
                sessionStorage.setItem('last_index', -1);
                sessionStorage.removeItem('total_elapsed');

                window.location.href = 'viewer.html';
            };
            
            container.appendChild(reviewBtn);
            container.appendChild(label);
            controls.insertBefore(container, controls.firstChild);
        }

        const container = document.querySelector('.summary-content');
        if (container) {
            const details = document.createElement('details');
            details.className = 'review-section';
            
            const summary = document.createElement('summary');
            summary.textContent = `복습이 필요한 단어 (${missedWords.length}개)`;
            details.appendChild(summary);
            
            const list = document.createElement('div');
            list.className = 'review-list';
            
            missedWords.forEach(word => {
                const item = document.createElement('div');
                item.className = 'review-item';
                item.innerHTML = `<span class="en">${word.en}</span><span class="ko">${word.ko}</span>`;
                list.appendChild(item);
            });
            
            details.appendChild(list);
            container.appendChild(details);
        }
    }

    // 세션 정리 (선택 사항)
    // document.getElementById('restart-button').addEventListener('click', () => {
    //     sessionStorage.clear();
    //     window.location.href = 'index.html';
    // });
}