-- ============================================================
-- Seed: Integration Providers + Node Definitions
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. INTEGRATION PROVIDERS
-- ────────────────────────────────────────────────────────────
INSERT INTO integration_providers (key, display_name, description_ko, category, auth_type, is_korean_service, is_available, required_plan) VALUES

-- 한국 서비스
('kakao',        '카카오',          '카카오톡, 알림톡, 카카오페이 연동',       'messaging',    'oauth2',   TRUE,  TRUE, 'free'),
('naver',        '네이버',          '네이버 메일, 카페, 블로그 연동',           'productivity', 'oauth2',   TRUE,  TRUE, 'free'),
('kakaotalk_biz','카카오 비즈니스', '알림톡 및 친구톡 발송',                    'messaging',    'api_key',  TRUE,  TRUE, 'starter'),

-- 이메일
('gmail',        'Gmail',           'Google 이메일 서비스',                     'email',        'oauth2',   FALSE, TRUE, 'free'),
('outlook',      'Outlook',         'Microsoft 이메일 서비스',                  'email',        'oauth2',   FALSE, TRUE, 'free'),

-- 메시지 & 협업
('slack',        'Slack',           '팀 메시지 및 알림',                        'messaging',    'oauth2',   FALSE, TRUE, 'free'),
('notion',       'Notion',          '노션 페이지 및 DB 연동',                   'productivity', 'oauth2',   FALSE, TRUE, 'starter'),
('google_sheets','Google Sheets',   '구글 스프레드시트 읽기/쓰기',              'productivity', 'oauth2',   FALSE, TRUE, 'free'),
('google_calendar','Google Calendar','구글 캘린더 일정 관리',                   'calendar',     'oauth2',   FALSE, TRUE, 'free'),

-- 스토리지
('google_drive', 'Google Drive',    '파일 업로드 및 공유',                      'storage',      'oauth2',   FALSE, TRUE, 'starter'),

-- 내부
('flowmate',     'FlowMate 내부',   '워크플로우 간 연결 및 내부 트리거',        'custom',       'none',     FALSE, TRUE, 'free')

ON CONFLICT (key) DO NOTHING;


-- ────────────────────────────────────────────────────────────
-- 2. NODE DEFINITIONS
-- ────────────────────────────────────────────────────────────

-- 편의를 위해 provider id를 변수처럼 사용
DO $$
DECLARE
  p_kakao        UUID;
  p_naver        UUID;
  p_kakao_biz    UUID;
  p_gmail        UUID;
  p_outlook      UUID;
  p_slack        UUID;
  p_notion       UUID;
  p_gsheets      UUID;
  p_gcalendar    UUID;
  p_gdrive       UUID;
  p_flowmate     UUID;
BEGIN
  SELECT id INTO p_kakao        FROM integration_providers WHERE key = 'kakao';
  SELECT id INTO p_naver        FROM integration_providers WHERE key = 'naver';
  SELECT id INTO p_kakao_biz    FROM integration_providers WHERE key = 'kakaotalk_biz';
  SELECT id INTO p_gmail        FROM integration_providers WHERE key = 'gmail';
  SELECT id INTO p_outlook      FROM integration_providers WHERE key = 'outlook';
  SELECT id INTO p_slack        FROM integration_providers WHERE key = 'slack';
  SELECT id INTO p_notion       FROM integration_providers WHERE key = 'notion';
  SELECT id INTO p_gsheets      FROM integration_providers WHERE key = 'google_sheets';
  SELECT id INTO p_gcalendar    FROM integration_providers WHERE key = 'google_calendar';
  SELECT id INTO p_gdrive       FROM integration_providers WHERE key = 'google_drive';
  SELECT id INTO p_flowmate     FROM integration_providers WHERE key = 'flowmate';

  INSERT INTO node_definitions
    (key, provider_id, display_name_ko, display_name_en, description_ko, category,
     node_type, input_schema, output_schema, ui_config, required_integration, required_plan)
  VALUES

  -- ──────────────────────────────────────────────
  -- TRIGGERS (시작 노드)
  -- ──────────────────────────────────────────────
  (
    'trigger.manual', p_flowmate,
    '직접 실행', 'Manual Run',
    '버튼을 눌러 워크플로우를 직접 실행합니다',
    '트리거', 'trigger',
    '{"type":"object","properties":{}}'::jsonb,
    '{"type":"object","properties":{"triggered_at":{"type":"string"}}}'::jsonb,
    '{"icon":"▶️","color":"#7c3aed","hint":"가장 기본적인 시작점입니다"}'::jsonb,
    NULL, 'free'
  ),
  (
    'trigger.schedule', p_flowmate,
    '정해진 시간에 실행', 'Schedule',
    '매일, 매주 등 원하는 시간에 자동으로 실행됩니다',
    '트리거', 'trigger',
    '{"type":"object","properties":{"cron":{"type":"string","title":"반복 주기","description":"매일 오전 9시, 매주 월요일 등","enum":["매일 오전 9시","매일 오전 9시·오후 6시","매주 월요일 오전 9시","매월 1일 오전 9시","직접 설정"]},"timezone":{"type":"string","title":"시간대","default":"Asia/Seoul"}},"required":["cron"]}'::jsonb,
    '{"type":"object","properties":{"scheduled_at":{"type":"string"}}}'::jsonb,
    '{"icon":"⏰","color":"#0891b2","hint":"반복 주기를 선택해주세요"}'::jsonb,
    NULL, 'free'
  ),
  (
    'trigger.form', p_flowmate,
    '폼 제출 시 실행', 'Form Submission',
    '누군가 폼을 작성하고 제출하면 워크플로우가 시작됩니다',
    '트리거', 'trigger',
    '{"type":"object","properties":{"form_fields":{"type":"array","title":"폼 항목","items":{"type":"object","properties":{"name":{"type":"string"},"label":{"type":"string"},"type":{"type":"string","enum":["텍스트","이메일","전화번호","숫자","선택"]},"required":{"type":"boolean"}}}}}}'::jsonb,
    '{"type":"object","properties":{"submission":{"type":"object"},"submitted_at":{"type":"string"}}}'::jsonb,
    '{"icon":"📋","color":"#059669","hint":"링크를 공유하면 누구나 폼을 제출할 수 있어요"}'::jsonb,
    NULL, 'free'
  ),
  (
    'trigger.kakao_message', p_kakao,
    '카카오톡 메시지 받을 때', 'Kakao Message Received',
    '특정 카카오톡 메시지를 받으면 워크플로우가 시작됩니다',
    '트리거', 'trigger',
    '{"type":"object","properties":{"keyword":{"type":"string","title":"키워드 (선택)","description":"특정 단어가 포함된 메시지에만 반응"}}}'::jsonb,
    '{"type":"object","properties":{"sender":{"type":"string"},"message":{"type":"string"},"received_at":{"type":"string"}}}'::jsonb,
    '{"icon":"💬","color":"#FEE500","hint":"카카오채널 연동이 필요합니다"}'::jsonb,
    'kakao', 'pro'
  ),

  -- ──────────────────────────────────────────────
  -- 카카오 액션
  -- ──────────────────────────────────────────────
  (
    'kakao.send_message', p_kakao,
    '카카오톡 메시지 보내기', 'Send KakaoTalk Message',
    '카카오톡으로 나 또는 친구에게 메시지를 보냅니다',
    '카카오', 'action',
    '{"type":"object","properties":{"to":{"type":"string","title":"받는 사람","description":"나에게 보내기 또는 친구","enum":["나에게 보내기","친구에게 보내기"]},"message":{"type":"string","title":"메시지 내용","description":"보낼 메시지를 입력하세요"}},"required":["to","message"]}'::jsonb,
    '{"type":"object","properties":{"sent_at":{"type":"string"},"message_id":{"type":"string"}}}'::jsonb,
    '{"icon":"💬","color":"#FEE500","hint":"카카오 계정 연동이 필요합니다"}'::jsonb,
    'kakao', 'free'
  ),
  (
    'kakao.alimtalk', p_kakao_biz,
    '카카오 알림톡 보내기', 'Send KakaoTalk Alimtalk',
    '카카오 비즈니스 알림톡을 대량 발송합니다',
    '카카오', 'action',
    '{"type":"object","properties":{"phone":{"type":"string","title":"수신자 전화번호"},"template_code":{"type":"string","title":"템플릿 코드"},"variables":{"type":"object","title":"템플릿 변수"}},"required":["phone","template_code"]}'::jsonb,
    '{"type":"object","properties":{"result_code":{"type":"string"},"sent_at":{"type":"string"}}}'::jsonb,
    '{"icon":"📣","color":"#FEE500","hint":"카카오 비즈니스 채널 연동이 필요합니다"}'::jsonb,
    'kakaotalk_biz', 'starter'
  ),

  -- ──────────────────────────────────────────────
  -- 네이버 액션
  -- ──────────────────────────────────────────────
  (
    'naver.send_email', p_naver,
    '네이버 메일 보내기', 'Send Naver Mail',
    '네이버 메일로 이메일을 발송합니다',
    '네이버', 'action',
    '{"type":"object","properties":{"to":{"type":"string","title":"받는 이메일","description":"example@naver.com"},"subject":{"type":"string","title":"제목"},"body":{"type":"string","title":"내용","description":"이메일 본문을 입력하세요"}},"required":["to","subject","body"]}'::jsonb,
    '{"type":"object","properties":{"sent_at":{"type":"string"},"message_id":{"type":"string"}}}'::jsonb,
    '{"icon":"✉️","color":"#03C75A","hint":"네이버 계정 연동이 필요합니다"}'::jsonb,
    'naver', 'free'
  ),
  (
    'naver.cafe_post', p_naver,
    '네이버 카페 글쓰기', 'Post to Naver Cafe',
    '네이버 카페 게시판에 글을 자동으로 작성합니다',
    '네이버', 'action',
    '{"type":"object","properties":{"cafe_id":{"type":"string","title":"카페 ID"},"board_id":{"type":"string","title":"게시판"},"title":{"type":"string","title":"글 제목"},"content":{"type":"string","title":"글 내용"}},"required":["cafe_id","board_id","title","content"]}'::jsonb,
    '{"type":"object","properties":{"post_id":{"type":"string"},"posted_at":{"type":"string"}}}'::jsonb,
    '{"icon":"📝","color":"#03C75A","hint":"네이버 계정 연동이 필요합니다"}'::jsonb,
    'naver', 'starter'
  ),

  -- ──────────────────────────────────────────────
  -- Gmail 액션
  -- ──────────────────────────────────────────────
  (
    'gmail.send_email', p_gmail,
    'Gmail 보내기', 'Send Gmail',
    'Gmail로 이메일을 발송합니다',
    '이메일', 'action',
    '{"type":"object","properties":{"to":{"type":"string","title":"받는 이메일"},"cc":{"type":"string","title":"참조 (선택)"},"subject":{"type":"string","title":"제목"},"body":{"type":"string","title":"본문"},"is_html":{"type":"boolean","title":"HTML 형식","default":false}},"required":["to","subject","body"]}'::jsonb,
    '{"type":"object","properties":{"sent_at":{"type":"string"},"thread_id":{"type":"string"}}}'::jsonb,
    '{"icon":"📧","color":"#EA4335","hint":"Google 계정 연동이 필요합니다"}'::jsonb,
    'gmail', 'free'
  ),
  (
    'gmail.watch_inbox', p_gmail,
    'Gmail 새 메일 받을 때', 'Gmail New Email Trigger',
    '새 이메일이 도착하면 워크플로우가 시작됩니다',
    '이메일', 'trigger',
    '{"type":"object","properties":{"from_filter":{"type":"string","title":"발신자 필터 (선택)"},"subject_filter":{"type":"string","title":"제목 키워드 (선택)"}}}'::jsonb,
    '{"type":"object","properties":{"from":{"type":"string"},"subject":{"type":"string"},"body":{"type":"string"},"received_at":{"type":"string"}}}'::jsonb,
    '{"icon":"📥","color":"#EA4335","hint":"Google 계정 연동이 필요합니다"}'::jsonb,
    'gmail', 'free'
  ),

  -- ──────────────────────────────────────────────
  -- Slack 액션
  -- ──────────────────────────────────────────────
  (
    'slack.send_message', p_slack,
    'Slack 메시지 보내기', 'Send Slack Message',
    'Slack 채널 또는 DM에 메시지를 보냅니다',
    '협업', 'action',
    '{"type":"object","properties":{"channel":{"type":"string","title":"채널 또는 사용자","description":"#general 또는 @홍길동"},"message":{"type":"string","title":"메시지 내용"}},"required":["channel","message"]}'::jsonb,
    '{"type":"object","properties":{"ts":{"type":"string"},"channel":{"type":"string"}}}'::jsonb,
    '{"icon":"💼","color":"#4A154B","hint":"Slack 워크스페이스 연동이 필요합니다"}'::jsonb,
    'slack', 'free'
  ),

  -- ──────────────────────────────────────────────
  -- Google Sheets 액션
  -- ──────────────────────────────────────────────
  (
    'google_sheets.append_row', p_gsheets,
    'Google Sheets 행 추가', 'Append Row to Google Sheets',
    '구글 스프레드시트에 새 행을 추가합니다',
    '데이터', 'action',
    '{"type":"object","properties":{"spreadsheet_id":{"type":"string","title":"스프레드시트 ID"},"sheet_name":{"type":"string","title":"시트 이름","default":"Sheet1"},"values":{"type":"array","title":"추가할 데이터","items":{"type":"string"}}},"required":["spreadsheet_id","values"]}'::jsonb,
    '{"type":"object","properties":{"updated_range":{"type":"string"},"updated_rows":{"type":"integer"}}}'::jsonb,
    '{"icon":"📊","color":"#34A853","hint":"Google 계정 연동이 필요합니다"}'::jsonb,
    'google_sheets', 'free'
  ),
  (
    'google_sheets.get_rows', p_gsheets,
    'Google Sheets 데이터 가져오기', 'Get Rows from Google Sheets',
    '구글 스프레드시트에서 데이터를 읽어옵니다',
    '데이터', 'action',
    '{"type":"object","properties":{"spreadsheet_id":{"type":"string","title":"스프레드시트 ID"},"range":{"type":"string","title":"범위","description":"A1:Z100 형식","default":"A:Z"}},"required":["spreadsheet_id"]}'::jsonb,
    '{"type":"object","properties":{"rows":{"type":"array"},"total_rows":{"type":"integer"}}}'::jsonb,
    '{"icon":"📋","color":"#34A853","hint":"Google 계정 연동이 필요합니다"}'::jsonb,
    'google_sheets', 'free'
  ),

  -- ──────────────────────────────────────────────
  -- Google Calendar 액션
  -- ──────────────────────────────────────────────
  (
    'google_calendar.create_event', p_gcalendar,
    '구글 캘린더 일정 만들기', 'Create Google Calendar Event',
    '구글 캘린더에 새 일정을 추가합니다',
    '일정', 'action',
    '{"type":"object","properties":{"title":{"type":"string","title":"일정 제목"},"start_time":{"type":"string","title":"시작 시간"},"end_time":{"type":"string","title":"종료 시간"},"description":{"type":"string","title":"설명 (선택)"},"attendees":{"type":"string","title":"참석자 이메일 (선택)","description":"쉼표로 구분"}},"required":["title","start_time","end_time"]}'::jsonb,
    '{"type":"object","properties":{"event_id":{"type":"string"},"event_link":{"type":"string"}}}'::jsonb,
    '{"icon":"📅","color":"#4285F4","hint":"Google 계정 연동이 필요합니다"}'::jsonb,
    'google_calendar', 'free'
  ),

  -- ──────────────────────────────────────────────
  -- Notion 액션
  -- ──────────────────────────────────────────────
  (
    'notion.create_page', p_notion,
    '노션 페이지 만들기', 'Create Notion Page',
    '노션 데이터베이스에 새 페이지를 추가합니다',
    '생산성', 'action',
    '{"type":"object","properties":{"database_id":{"type":"string","title":"데이터베이스 ID"},"title":{"type":"string","title":"페이지 제목"},"properties":{"type":"object","title":"속성 값"}},"required":["database_id","title"]}'::jsonb,
    '{"type":"object","properties":{"page_id":{"type":"string"},"page_url":{"type":"string"}}}'::jsonb,
    '{"icon":"📓","color":"#000000","hint":"노션 연동이 필요합니다"}'::jsonb,
    'notion', 'starter'
  ),

  -- ──────────────────────────────────────────────
  -- 조건 & 흐름
  -- ──────────────────────────────────────────────
  (
    'flow.condition', p_flowmate,
    '조건 분기', 'Condition / If-Else',
    '조건에 따라 다른 경로로 나뉩니다',
    '흐름', 'condition',
    '{"type":"object","properties":{"conditions":{"type":"array","title":"조건 목록","items":{"type":"object","properties":{"field":{"type":"string","title":"비교할 값"},"operator":{"type":"string","title":"조건","enum":["같다","같지 않다","포함한다","포함하지 않는다","크다","작다"]},"value":{"type":"string","title":"기준값"}}}}},"required":["conditions"]}'::jsonb,
    '{"type":"object","properties":{"matched":{"type":"boolean"},"branch":{"type":"string"}}}'::jsonb,
    '{"icon":"🔀","color":"#f59e0b","hint":"참/거짓에 따라 다른 경로로 실행됩니다"}'::jsonb,
    NULL, 'free'
  ),
  (
    'flow.delay', p_flowmate,
    '시간 지연', 'Wait / Delay',
    '다음 단계까지 일정 시간 기다립니다',
    '흐름', 'delay',
    '{"type":"object","properties":{"amount":{"type":"integer","title":"대기 시간","minimum":1},"unit":{"type":"string","title":"단위","enum":["분","시간","일"],"default":"분"}},"required":["amount","unit"]}'::jsonb,
    '{"type":"object","properties":{"waited_until":{"type":"string"}}}'::jsonb,
    '{"icon":"⏳","color":"#6b7280","hint":"지연 후 다음 노드가 실행됩니다"}'::jsonb,
    NULL, 'free'
  ),
  (
    'flow.loop', p_flowmate,
    '목록 반복', 'Loop / For Each',
    '목록의 각 항목마다 이후 노드를 반복 실행합니다',
    '흐름', 'action',
    '{"type":"object","properties":{"list":{"type":"string","title":"반복할 목록","description":"이전 노드의 결과 목록을 선택하세요"}},"required":["list"]}'::jsonb,
    '{"type":"object","properties":{"item":{"type":"object"},"index":{"type":"integer"}}}'::jsonb,
    '{"icon":"🔁","color":"#6b7280","hint":"목록의 각 항목마다 반복됩니다"}'::jsonb,
    NULL, 'free'
  ),

  -- ──────────────────────────────────────────────
  -- 데이터 변환
  -- ──────────────────────────────────────────────
  (
    'transform.text', p_flowmate,
    '텍스트 가공', 'Text Transform',
    '텍스트를 원하는 형식으로 변환합니다',
    '데이터', 'transform',
    '{"type":"object","properties":{"input":{"type":"string","title":"입력 텍스트"},"operations":{"type":"array","title":"변환 작업","items":{"type":"string","enum":["대문자로","소문자로","앞뒤 공백 제거","줄바꿈 제거","특수문자 제거"]}}},"required":["input"]}'::jsonb,
    '{"type":"object","properties":{"result":{"type":"string"}}}'::jsonb,
    '{"icon":"✏️","color":"#0ea5e9","hint":"텍스트를 원하는 형태로 바꿉니다"}'::jsonb,
    NULL, 'free'
  ),
  (
    'transform.format_date', p_flowmate,
    '날짜 형식 변환', 'Format Date',
    '날짜를 원하는 형식으로 변환합니다',
    '데이터', 'transform',
    '{"type":"object","properties":{"input":{"type":"string","title":"입력 날짜"},"format":{"type":"string","title":"출력 형식","enum":["YYYY년 MM월 DD일","YYYY-MM-DD","MM/DD/YYYY","오늘","어제","이번 주 월요일"]}},"required":["input","format"]}'::jsonb,
    '{"type":"object","properties":{"result":{"type":"string"}}}'::jsonb,
    '{"icon":"📆","color":"#0ea5e9"}'::jsonb,
    NULL, 'free'
  ),

  -- ──────────────────────────────────────────────
  -- AI 노드
  -- ──────────────────────────────────────────────
  (
    'ai.generate_text', p_flowmate,
    'AI 텍스트 생성', 'AI Text Generation',
    'AI가 원하는 내용의 글이나 메시지를 작성합니다',
    'AI', 'ai',
    '{"type":"object","properties":{"prompt":{"type":"string","title":"요청 내용","description":"어떤 글을 써줄지 설명해주세요"},"tone":{"type":"string","title":"말투","enum":["친근하게","공식적으로","간결하게","상세하게"],"default":"친근하게"},"max_length":{"type":"integer","title":"최대 글자 수","default":500}},"required":["prompt"]}'::jsonb,
    '{"type":"object","properties":{"text":{"type":"string"},"tokens_used":{"type":"integer"}}}'::jsonb,
    '{"icon":"🤖","color":"#8b5cf6","hint":"AI가 자동으로 글을 작성합니다"}'::jsonb,
    NULL, 'free'
  ),
  (
    'ai.summarize', p_flowmate,
    'AI 요약', 'AI Summarize',
    '긴 텍스트를 AI가 핵심만 요약합니다',
    'AI', 'ai',
    '{"type":"object","properties":{"text":{"type":"string","title":"요약할 텍스트"},"length":{"type":"string","title":"요약 길이","enum":["한 문장","세 줄","다섯 줄"],"default":"세 줄"}},"required":["text"]}'::jsonb,
    '{"type":"object","properties":{"summary":{"type":"string"}}}'::jsonb,
    '{"icon":"🧠","color":"#8b5cf6"}'::jsonb,
    NULL, 'free'
  ),
  (
    'ai.translate', p_flowmate,
    'AI 번역', 'AI Translate',
    '텍스트를 다른 언어로 번역합니다',
    'AI', 'ai',
    '{"type":"object","properties":{"text":{"type":"string","title":"번역할 텍스트"},"target_language":{"type":"string","title":"번역 언어","enum":["영어","일본어","중국어","스페인어","프랑스어","독일어"]}},"required":["text","target_language"]}'::jsonb,
    '{"type":"object","properties":{"translated":{"type":"string"},"source_language":{"type":"string"}}}'::jsonb,
    '{"icon":"🌐","color":"#8b5cf6"}'::jsonb,
    NULL, 'free'
  ),
  (
    'ai.sentiment', p_flowmate,
    'AI 감정 분석', 'AI Sentiment Analysis',
    '텍스트가 긍정적인지 부정적인지 분석합니다',
    'AI', 'ai',
    '{"type":"object","properties":{"text":{"type":"string","title":"분석할 텍스트"}},"required":["text"]}'::jsonb,
    '{"type":"object","properties":{"sentiment":{"type":"string","enum":["긍정","부정","중립"]},"score":{"type":"number"}}}'::jsonb,
    '{"icon":"😊","color":"#8b5cf6"}'::jsonb,
    NULL, 'starter'
  )

  ON CONFLICT (key) DO NOTHING;

END $$;
