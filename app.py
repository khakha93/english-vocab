import os, json
import time
from datetime import timedelta
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
from flask_session import Session
import random

app = Flask(__name__)

# --- 서버 측 세션 설정 ---
# 세션 데이터를 서버의 파일 시스템에 저장하도록 설정합니다.
app.config["SESSION_PERMANENT"] = False
app.config["SESSION_TYPE"] = "filesystem"
# 세션 파일이 저장될 폴더를 생성합니다.
session_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'flask_session')
os.makedirs(session_dir, exist_ok=True)
app.config["SESSION_FILE_DIR"] = session_dir
Session(app)

app.secret_key = 'your_very_secret_key'

# 데이터 로딩 (애플리케이션 시작 시 한 번만 로드)
try:
    with open(r'vocab\data.json', 'r', encoding='utf-8') as f:
        EFF_JS_ORIGINAL = json.load(f)
except FileNotFoundError:
    print("Warning: efficiencyvoca_highschool_essential.csv not found.")
    EFF_JS_ORIGINAL = None




@app.route('/', methods=['GET', 'POST'])
def index():
    """시작 화면. 시작 인덱스와 셔플 여부를 설정합니다."""
    if request.method == 'POST':
        try:
            start_index = int(request.form.get('start_index', 1)) - 1
        except (ValueError, TypeError):
            start_index = 0

        is_shuffle = request.form.get('is_shuffle') == 'on'

        # 세션에는 큰 데이터를 저장하지 않고, 인덱스 목록만 관리합니다.
        word_indices = list(range(len(EFF_JS_ORIGINAL)))
        if is_shuffle:
            # 시작 인덱스 이후의 단어들을 셔플합니다.
            part_to_shuffle = word_indices[start_index:]
            random.shuffle(part_to_shuffle)
            word_indices[start_index:] = part_to_shuffle
        
        session['word_indices'] = word_indices

        if not (0 <= start_index < len(word_indices)):
            start_index = 0

        session['start_index'] = start_index
        session['current_index'] = start_index
        session['pass_rows'] = []
        session['start_time'] = time.time()
        session['pause_total'] = 0
        session['last_index'] = -1

        return redirect(url_for('viewer'))

    return render_template('index.html', max_index=len(EFF_JS_ORIGINAL))


@app.route('/viewer')
def viewer():
    """단어 학습 메인 화면"""
    if 'word_indices' not in session:
        return redirect(url_for('index'))
    return render_template('viewer.html')


@app.route('/get_word')
def get_word():
    """JavaScript에서 호출하여 다음 단어 정보를 가져오는 API"""
    if 'word_indices' not in session:
        return jsonify({'error': 'Session not started'}), 400

    current_pos = session.get('current_index', 0)
    word_indices = session['word_indices']

    if not (0 <= current_pos < len(word_indices)):
        # 학습 완료
        return jsonify({'finished': True})

    # 세션에 저장된 인덱스 순서에 따라 실제 단어 인덱스를 가져옵니다.
    actual_index = word_indices[current_pos]
    row = EFF_JS_ORIGINAL[str(actual_index)]
    session['last_index'] = actual_index # 요약 화면을 위해 실제 인덱스를 저장

    # 다음 인덱스 준비
    session['current_index'] = (current_pos + 1)

    progress = current_pos - session['start_index'] + 1
    already_know = len(session['pass_rows'])

    return jsonify({
        'title_en': row['en'],
        'title_ko': row['ko'],
        'deriv_en': row['deriv_en'],
        'deriv_ko': row['deriv_ko'],
        'progress': f"{progress} ({progress - already_know})",
        'finished': False
    })

@app.route('/pass_word', methods=['POST'])
def pass_word():
    """'Pass' 버튼 클릭 시 호출. 현재 단어를 통과 처리."""
    if 'word_indices' not in session:
        return jsonify({'error': 'Session not started'}), 400

    # pass_rows에는 셔플 여부와 관계없이 DataFrame의 고유 인덱스(actual_index)를 저장합니다.
    last_actual_index = session.get('last_index', -1)
    if last_actual_index != -1:
        pass_list = session['pass_rows']
        if last_actual_index not in pass_list:
            pass_list.append(last_actual_index)
            session['pass_rows'] = pass_list

    return jsonify({'status': 'success'})


@app.route('/end_run', methods=['POST'])
def end_run():
    """학습 종료 및 요약 화면으로 이동"""
    if 'word_indices' not in session:
        return redirect(url_for('index'))

    # 타이머 정지 (클라이언트에서 pause_total을 보내줌)
    data = request.get_json()
    session['pause_total'] = data.get('pause_total', session.get('pause_total', 0))
    session['total_elapsed'] = time.time() - session['start_time']

    return redirect(url_for('summary'))

@app.route('/summary')
def summary():
    """결과 요약 화면"""
    if 'word_indices' not in session or 'total_elapsed' not in session:
        return redirect(url_for('index'))

    total_time = timedelta(seconds=int(session['total_elapsed'] - session['pause_total']))
    pause_time = timedelta(seconds=int(session['pause_total']))
    passed_count = len(session.get('pass_rows', []))
    start_idx = session.get('start_index', 0) + 1

    # 총 진행 개수 계산
    total_studied = session.get('current_index', 0) - session.get('start_index', 0)
    final_progress_str = f"{total_studied} ({total_studied - passed_count})"

    return render_template('summary.html', total_time=total_time, pause_time=pause_time,
                           passed_count=passed_count, start_idx=start_idx,
                           total_studied=total_studied, final_progress=final_progress_str)

if __name__ == '__main__':
    # app.run(debug=True)
    app.run(host="0.0.0.0", port=5000, debug=True)