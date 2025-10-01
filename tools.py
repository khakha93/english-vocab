import pandas as pd
from flask import jsonify, session
import json

# 데이터 로딩


def seperate_words(df):
    """EffVocabViewer의 데이터 전처리 로직을 웹에 맞게 변환"""
    # 표제어만 필터링하여 title_df 생성
    title_df = df[df['분류'] == '표제어'].reset_index()
    # 원본 인덱스를 'original_index'로 저장
    title_df = title_df.rename(columns={'index': 'original_index'})

    # 파생어만 필터링하여 deriv_df 생성
    deriv_df = df[df['분류'] != '표제어'].copy()

    if not deriv_df.empty and not title_df.empty:
        # 각 파생어에 해당하는 표제어의 'original_index'를 찾기 위한 준비
        # 표제어인 행은 해당 행의 인덱스를, 아닌 행은 NaN을 갖는 'Series' 생성
        # df.index는 'Index' 객체이므로, Series로 변환 후 where를 적용해야 ffill()을 사용할 수 있습니다.
        title_indices = pd.Series(df.index).where(df['분류'] == '표제어')
        # ffill()을 사용하여 각 행이 속한 가장 가까운 이전 표제어의 인덱스를 찾음
        parent_title_indices = title_indices.ffill()
        
        # 파생어에 해당하는 표제어의 original_index를 'key'로 할당
        deriv_df['key'] = parent_title_indices[deriv_df.index]
        
        # 'key' (원본 인덱스)를 title_df의 새 인덱스로 매핑하기 위한 딕셔너리 생성
        original_to_new_index_map = title_df.reset_index().set_index('original_index')['index'].to_dict()
        deriv_df['key'] = deriv_df['key'].map(original_to_new_index_map)

    return title_df, deriv_df

def get_word():
    """JavaScript에서 호출하여 다음 단어 정보를 가져오는 API"""

    current_pos = 0
    word_indices = list(range(len(data)))

    # 세션에 저장된 인덱스 순서에 따라 실제 단어 인덱스를 가져옵니다.
    actual_index = word_indices[current_pos]
    
    row = data[str(actual_index)]

    # 파생어 찾기

    print(row)
    return 


with open('data.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
get_word()