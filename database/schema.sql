-- ============================================================================
-- 수뜨립(Suittrip) 데이터베이스 스키마
-- ============================================================================
-- 설명: 짐 보관소 관리 플랫폼 전체 스키마
-- 생성일: 2025-01-14
-- 버전: 1.0.1
-- ============================================================================

-- ============================================================================
-- 1. stores - 점포 기본 정보
-- ============================================================================
CREATE TABLE IF NOT EXISTS stores (
  id VARCHAR(255) PRIMARY KEY COMMENT '점포 고유 ID',
  email VARCHAR(255) UNIQUE NOT NULL COMMENT '이메일 (로그인 ID)',
  password_hash VARCHAR(255) NOT NULL COMMENT '암호화된 비밀번호',
  phone_number VARCHAR(20) COMMENT '전화번호',
  business_type ENUM('RESTAURANT', 'CAFE', 'HOTEL', 'OTHER') COMMENT '업종',
  profile_image_url TEXT COMMENT '프로필 이미지 URL',
  has_completed_setup BOOLEAN DEFAULT FALSE COMMENT '초기 설정 완료 여부',

  -- 사업자 정보
  business_number VARCHAR(50) UNIQUE COMMENT '사업자 등록번호',
  business_name VARCHAR(255) NOT NULL COMMENT '사업자명',
  representative_name VARCHAR(255) COMMENT '대표자명',

  -- 위치 정보
  address TEXT COMMENT '주소',
  detail_address TEXT COMMENT '상세 주소',
  latitude DECIMAL(10, 8) COMMENT '위도',
  longitude DECIMAL(11, 8) COMMENT '경도',
  description TEXT COMMENT '점포 소개',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  INDEX idx_email (email),
  INDEX idx_business_number (business_number),
  INDEX idx_location (latitude, longitude)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='점포 기본 정보';

-- ============================================================================
-- 2. store_status - 점포 실시간 상태
-- ============================================================================
CREATE TABLE IF NOT EXISTS store_status (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '상태 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  status ENUM('open', 'closed', 'temporarily_closed') NOT NULL COMMENT '영업 상태',
  reason TEXT COMMENT '상태 변경 사유',
  reopen_time TIMESTAMP NULL COMMENT '재개장 예정 시간',
  today_open_time TIME COMMENT '오늘 영업 시작 시간',
  today_close_time TIME COMMENT '오늘 영업 종료 시간',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  INDEX idx_store_id (store_id),
  INDEX idx_status (status),
  INDEX idx_updated_at (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='점포 실시간 상태';

-- ============================================================================
-- 3. store_operating_hours - 영업시간
-- ============================================================================
CREATE TABLE IF NOT EXISTS store_operating_hours (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '영업시간 ID',
  store_id VARCHAR(255) NOT NULL UNIQUE COMMENT '점포 ID',

  -- 월요일
  monday_open TIME COMMENT '월요일 오픈 시간',
  monday_close TIME COMMENT '월요일 마감 시간',
  monday_operating BOOLEAN DEFAULT TRUE COMMENT '월요일 영업 여부',

  -- 화요일
  tuesday_open TIME COMMENT '화요일 오픈 시간',
  tuesday_close TIME COMMENT '화요일 마감 시간',
  tuesday_operating BOOLEAN DEFAULT TRUE COMMENT '화요일 영업 여부',

  -- 수요일
  wednesday_open TIME COMMENT '수요일 오픈 시간',
  wednesday_close TIME COMMENT '수요일 마감 시간',
  wednesday_operating BOOLEAN DEFAULT TRUE COMMENT '수요일 영업 여부',

  -- 목요일
  thursday_open TIME COMMENT '목요일 오픈 시간',
  thursday_close TIME COMMENT '목요일 마감 시간',
  thursday_operating BOOLEAN DEFAULT TRUE COMMENT '목요일 영업 여부',

  -- 금요일
  friday_open TIME COMMENT '금요일 오픈 시간',
  friday_close TIME COMMENT '금요일 마감 시간',
  friday_operating BOOLEAN DEFAULT TRUE COMMENT '금요일 영업 여부',

  -- 토요일
  saturday_open TIME COMMENT '토요일 오픈 시간',
  saturday_close TIME COMMENT '토요일 마감 시간',
  saturday_operating BOOLEAN DEFAULT TRUE COMMENT '토요일 영업 여부',

  -- 일요일
  sunday_open TIME COMMENT '일요일 오픈 시간',
  sunday_close TIME COMMENT '일요일 마감 시간',
  sunday_operating BOOLEAN DEFAULT FALSE COMMENT '일요일 영업 여부',

  -- 휴일 정보
  holiday_notice TEXT COMMENT '휴일 공지사항',
  holiday_start_date DATE COMMENT '휴일 시작일',
  holiday_end_date DATE COMMENT '휴일 종료일',

  -- 자동 스케줄
  auto_schedule_enabled BOOLEAN DEFAULT FALSE COMMENT '자동 스케줄 활성화',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='영업시간 설정';

-- ============================================================================
-- 4. store_settings - 점포 설정
-- ============================================================================
CREATE TABLE IF NOT EXISTS store_settings (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '설정 ID',
  store_id VARCHAR(255) NOT NULL UNIQUE COMMENT '점포 ID',

  -- 기본 정보
  store_photos JSON COMMENT '점포 사진 (JSON 배열)',

  -- 운영 설정
  total_slots INT DEFAULT 20 COMMENT '전체 보관함 수',
  daily_rate_threshold INT DEFAULT 7 COMMENT '일 단위 요금 적용 기준 (시간)',
  auto_approval BOOLEAN DEFAULT FALSE COMMENT '자동 승인 여부',
  auto_overdue_notification BOOLEAN DEFAULT TRUE COMMENT '연체 자동 알림',

  -- 소형 보관함 가격
  small_hourly_rate INT DEFAULT 2000 COMMENT '소형 시간당 요금',
  small_daily_rate INT DEFAULT 15000 COMMENT '소형 일 요금',
  small_hour_unit INT DEFAULT 1 COMMENT '소형 시간 단위',
  small_max_capacity INT DEFAULT 5 COMMENT '소형 최대 수용 개수',
  small_enabled BOOLEAN DEFAULT TRUE COMMENT '소형 사용 가능 여부',

  -- 중형 보관함 가격
  medium_hourly_rate INT DEFAULT 3000 COMMENT '중형 시간당 요금',
  medium_daily_rate INT DEFAULT 24000 COMMENT '중형 일 요금',
  medium_hour_unit INT DEFAULT 1 COMMENT '중형 시간 단위',
  medium_max_capacity INT DEFAULT 8 COMMENT '중형 최대 수용 개수',
  medium_enabled BOOLEAN DEFAULT TRUE COMMENT '중형 사용 가능 여부',

  -- 대형 보관함 가격
  large_hourly_rate INT DEFAULT 5000 COMMENT '대형 시간당 요금',
  large_daily_rate INT DEFAULT 40000 COMMENT '대형 일 요금',
  large_hour_unit INT DEFAULT 1 COMMENT '대형 시간 단위',
  large_max_capacity INT DEFAULT 3 COMMENT '대형 최대 수용 개수',
  large_enabled BOOLEAN DEFAULT TRUE COMMENT '대형 사용 가능 여부',

  -- 냉장 보관
  refrigeration_available BOOLEAN DEFAULT FALSE COMMENT '냉장 보관 가능 여부',
  refrigeration_extra_fee INT DEFAULT 1000 COMMENT '냉장 추가 요금',
  refrigeration_max_capacity INT DEFAULT 3 COMMENT '냉장 최대 수용 개수',

  -- 알림 설정
  new_reservation_notification BOOLEAN DEFAULT TRUE COMMENT '신규 예약 알림',
  checkout_reminder_notification BOOLEAN DEFAULT TRUE COMMENT '체크아웃 알림',
  overdue_notification BOOLEAN DEFAULT TRUE COMMENT '연체 알림',
  system_notification BOOLEAN DEFAULT TRUE COMMENT '시스템 알림',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='점포 설정';

-- ============================================================================
-- 5. storages - 보관함
-- ============================================================================
CREATE TABLE IF NOT EXISTS storages (
  id VARCHAR(255) PRIMARY KEY COMMENT '보관함 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  number VARCHAR(50) NOT NULL COMMENT '보관함 번호',
  type ENUM('small', 'medium', 'large') NOT NULL COMMENT '보관함 크기',
  status ENUM('available', 'occupied', 'maintenance') DEFAULT 'available' COMMENT '보관함 상태',

  -- 크기 (cm)
  width INT COMMENT '가로',
  height INT COMMENT '세로',
  depth INT COMMENT '깊이',

  pricing INT NOT NULL COMMENT '가격',

  -- 점포 내 위치
  floor INT COMMENT '층',
  section VARCHAR(10) COMMENT '섹션',
  row_num INT COMMENT '행',
  column_num INT COMMENT '열',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE KEY unique_storage_number (store_id, number),
  INDEX idx_store_status (store_id, status),
  INDEX idx_store_type (store_id, type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='보관함';

-- ============================================================================
-- 6. reservations - 예약
-- ============================================================================
CREATE TABLE IF NOT EXISTS reservations (
  id VARCHAR(255) PRIMARY KEY COMMENT '예약 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  customer_id VARCHAR(255) COMMENT '고객 ID',
  customer_name VARCHAR(255) NOT NULL COMMENT '고객명',
  customer_phone VARCHAR(20) NOT NULL COMMENT '고객 전화번호',
  customer_email VARCHAR(255) COMMENT '고객 이메일',

  storage_id VARCHAR(255) COMMENT '보관함 ID',
  storage_number VARCHAR(50) COMMENT '보관함 번호',

  status ENUM('pending', 'pending_approval', 'confirmed', 'rejected', 'in_progress', 'completed', 'cancelled') DEFAULT 'pending' COMMENT '예약 상태',

  -- 시간 정보
  start_time TIMESTAMP NOT NULL COMMENT '시작 시간',
  end_time TIMESTAMP COMMENT '종료 시간',
  request_time TIMESTAMP NOT NULL COMMENT '요청 시간',
  actual_start_time TIMESTAMP COMMENT '실제 시작 시간',
  actual_end_time TIMESTAMP COMMENT '실제 종료 시간',

  -- 예약 정보
  duration INT NOT NULL COMMENT '예약 기간 (시간)',
  bag_count INT NOT NULL COMMENT '짐 개수',
  total_amount INT NOT NULL COMMENT '총 금액',

  message TEXT COMMENT '메시지',
  special_requests TEXT COMMENT '특별 요청사항',

  -- 짐 사진
  luggage_image_urls JSON COMMENT '짐 사진 URL (JSON 배열)',

  -- 결제 정보
  payment_status ENUM('pending', 'paid', 'refunded') DEFAULT 'pending' COMMENT '결제 상태',
  payment_method VARCHAR(50) COMMENT '결제 방법',

  qr_code TEXT COMMENT 'QR 코드',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (storage_id) REFERENCES storages(id) ON DELETE SET NULL,
  INDEX idx_store_status (store_id, status),
  INDEX idx_store_date (store_id, start_time),
  INDEX idx_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='예약';

-- ============================================================================
-- 7. reviews - 리뷰
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id VARCHAR(255) PRIMARY KEY COMMENT '리뷰 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  customer_id VARCHAR(255) NOT NULL COMMENT '고객 ID',
  customer_name VARCHAR(255) NOT NULL COMMENT '고객명',
  reservation_id VARCHAR(255) COMMENT '예약 ID',
  storage_id VARCHAR(255) COMMENT '보관함 ID',
  storage_number VARCHAR(50) COMMENT '보관함 번호',

  type ENUM('storage', 'store') NOT NULL COMMENT '리뷰 타입',
  rating INT NOT NULL COMMENT '평점 (1-5)' CHECK (rating >= 1 AND rating <= 5),
  comment TEXT NOT NULL COMMENT '리뷰 내용',
  images JSON COMMENT '리뷰 이미지 (JSON 배열)',

  status ENUM('pending', 'responded') DEFAULT 'pending' COMMENT '응답 상태',
  response TEXT COMMENT '점포 응답',
  response_date TIMESTAMP COMMENT '응답 일시',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  INDEX idx_store_type (store_id, type),
  INDEX idx_store_status (store_id, status),
  INDEX idx_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='리뷰';

-- ============================================================================
-- 8. notifications - 알림
-- ============================================================================
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(255) PRIMARY KEY COMMENT '알림 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  type ENUM('newReservation', 'checkoutReminder', 'overdue', 'checkinComplete', 'systemUpdate', 'revenue') NOT NULL COMMENT '알림 타입',
  title VARCHAR(255) NOT NULL COMMENT '알림 제목',
  message TEXT NOT NULL COMMENT '알림 내용',

  is_read BOOLEAN DEFAULT FALSE COMMENT '읽음 여부',
  read_at TIMESTAMP COMMENT '읽은 시간',

  action_data JSON COMMENT '액션 데이터 (JSON)',
  luggage_image_urls JSON COMMENT '짐 이미지 URL (JSON 배열)',

  priority ENUM('low', 'normal', 'high') DEFAULT 'normal' COMMENT '우선순위',
  related_id VARCHAR(255) COMMENT '관련 ID',
  related_type VARCHAR(50) COMMENT '관련 타입',
  action_required BOOLEAN DEFAULT FALSE COMMENT '액션 필요 여부',
  action_url TEXT COMMENT '액션 URL',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  INDEX idx_store_read (store_id, is_read),
  INDEX idx_store_created (store_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='알림';

-- ============================================================================
-- 9. payments - 결제 정보
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '결제 ID',

  -- 어떤 가게 / 어떤 유저 매출인지
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  user_id VARCHAR(255) NOT NULL COMMENT '사용자 ID',
  reservation_id VARCHAR(255) NULL COMMENT '예약 ID (예약 결제인 경우)',

  -- 금액 관련
  amount_total INT UNSIGNED NOT NULL COMMENT '고객이 결제한 총 금액(원)',
  currency VARCHAR(3) NOT NULL DEFAULT 'KRW' COMMENT '통화',

  -- PG 관련 정보
  pg_provider VARCHAR(50) NOT NULL COMMENT 'PG사 (toss)',
  pg_payment_key VARCHAR(100) NULL COMMENT '토스 paymentKey',
  pg_order_id VARCHAR(100) NOT NULL COMMENT '주문 ID',
  pg_method VARCHAR(30) NOT NULL DEFAULT 'UNKNOWN' COMMENT '결제 방법 (CARD, KAKAOPAY 등)',

  -- 상태
  status ENUM('PENDING', 'SUCCESS', 'FAILED', 'CANCELED', 'REFUNDED')
        NOT NULL DEFAULT 'PENDING' COMMENT '결제 상태',

  -- 시간
  paid_at DATETIME NULL COMMENT '실제 결제 완료 시각',
  canceled_at DATETIME NULL COMMENT '취소 시각',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '수정일시',

  -- 정산 관련
  is_settled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '정산에 포함되었는지 여부',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  FOREIGN KEY (reservation_id) REFERENCES reservations(id) ON DELETE SET NULL,
  UNIQUE INDEX idx_payments_pg_payment_key (pg_payment_key),
  UNIQUE INDEX idx_payments_pg_order_id (pg_order_id),
  INDEX idx_payments_store_paid (store_id, paid_at),
  INDEX idx_payments_reservation (reservation_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='결제 정보';

-- ============================================================================
-- 10. settlements - 정산 내역
-- ============================================================================
CREATE TABLE IF NOT EXISTS settlements (
  id VARCHAR(255) PRIMARY KEY COMMENT '정산 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  payout_id VARCHAR(255) COMMENT '지급 ID',

  amount INT NOT NULL COMMENT '정산 금액',
  fee INT NOT NULL COMMENT '수수료',
  net_amount INT NOT NULL COMMENT '실 지급액',

  status ENUM('pending', 'completed', 'failed') DEFAULT 'pending' COMMENT '정산 상태',
  description TEXT COMMENT '설명',

  requested_at TIMESTAMP NOT NULL COMMENT '요청 일시',
  completed_at TIMESTAMP COMMENT '완료 일시',
  failure_reason TEXT COMMENT '실패 사유',

  bank_code VARCHAR(10) COMMENT '은행 코드',
  bank_name VARCHAR(100) COMMENT '은행명',
  account_number VARCHAR(50) COMMENT '계좌번호',
  account_holder VARCHAR(100) COMMENT '예금주',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  INDEX idx_store_status (store_id, status),
  INDEX idx_requested_at (requested_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='정산 내역';

-- ============================================================================
-- 11. daily_statistics - 일별 통계
-- ============================================================================
CREATE TABLE IF NOT EXISTS daily_statistics (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '통계 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  date DATE NOT NULL COMMENT '날짜',

  total_revenue INT DEFAULT 0 COMMENT '총 매출',
  total_reservations INT DEFAULT 0 COMMENT '총 예약 수',
  completed_reservations INT DEFAULT 0 COMMENT '완료된 예약 수',
  cancelled_reservations INT DEFAULT 0 COMMENT '취소된 예약 수',

  average_duration DECIMAL(5,2) COMMENT '평균 이용 시간',
  occupancy_rate DECIMAL(5,2) COMMENT '점유율',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  UNIQUE KEY unique_store_date (store_id, date),
  INDEX idx_store_date (store_id, date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='일별 통계';

-- ============================================================================
-- 12. refresh_tokens - 리프레시 토큰
-- ============================================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '토큰 ID',
  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  token VARCHAR(500) NOT NULL COMMENT '리프레시 토큰',
  expires_at TIMESTAMP NOT NULL COMMENT '만료 시간',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',

  FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  INDEX idx_token (token(255)),
  INDEX idx_store_id (store_id),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='리프레시 토큰';

-- ============================================================================
-- 13. email_verifications - 이메일 인증
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_verifications (
  id INT AUTO_INCREMENT PRIMARY KEY COMMENT '인증 ID',
  email VARCHAR(255) NOT NULL COMMENT '이메일',
  code VARCHAR(10) NOT NULL COMMENT '인증 코드',
  is_verified BOOLEAN DEFAULT FALSE COMMENT '인증 완료 여부',
  expires_at TIMESTAMP NOT NULL COMMENT '만료 시간',
  attempt_count INT DEFAULT 0 COMMENT '시도 횟수',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT '생성일시',

  INDEX idx_email (email),
  INDEX idx_code (code),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='이메일 인증';

-- ============================================================================
-- 13. payment_webhooks - 결제 웹훅 이력 (멱등성 체크 및 정산 기준)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payment_webhooks (
  id VARCHAR(100) PRIMARY KEY COMMENT '웹훅 ID',
  payment_id BIGINT UNSIGNED NOT NULL COMMENT '결제 ID',
  pg_order_id VARCHAR(100) NOT NULL COMMENT 'PG 주문 ID',
  pg_payment_key VARCHAR(100) NULL COMMENT 'PG 결제 키',
  event_type VARCHAR(50) NOT NULL COMMENT '이벤트 타입',
  status VARCHAR(30) NULL COMMENT '결제 상태',
  webhook_data JSON NULL COMMENT '웹훅 원본 데이터',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '수신일시',

  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE,
  INDEX idx_payment_id (payment_id),
  INDEX idx_pg_order_id (pg_order_id),
  INDEX idx_event_status (event_type, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='결제 웹훅 이력';

-- ============================================================================
-- 14. settlement_statements - 정산 명세 테이블
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlement_statements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '정산 ID',

  store_id VARCHAR(255) NOT NULL COMMENT '점포 ID',
  
  -- 정산 기간(선택: 일단 날짜만 두고 나중에 확장 가능)
  period_start DATETIME NOT NULL COMMENT '정산 대상 시작 시각',
  period_end   DATETIME NOT NULL COMMENT '정산 대상 종료 시각',

  -- 매출 및 금액
  total_sales INT UNSIGNED NOT NULL COMMENT '정산 대상 총 매출(원)',
  commission_rate DECIMAL(5,4) NOT NULL DEFAULT 0.2000 COMMENT '플랫폼 수수료 비율',
  commission_amount INT UNSIGNED NOT NULL COMMENT '플랫폼 수수료 합계(원)',
  payout_amount INT UNSIGNED NOT NULL COMMENT '가맹점 지급 금액(원)',

  -- 상태
  status ENUM('pending', 'paid', 'failed') NOT NULL DEFAULT 'pending' COMMENT '정산 상태',
  payout_at DATETIME NULL COMMENT '실제 송금 완료 시각(세틀뱅크 성공 시)',

  meta JSON NULL COMMENT '추가 메타데이터(테스트용 플래그, 비고 등)',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_store_period (store_id, period_start, period_end),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='점포 정산 명세';

-- ============================================================================
-- 15. settlement_items - 정산 상세 테이블
-- ============================================================================

CREATE TABLE IF NOT EXISTS settlement_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY COMMENT '정산 항목 ID',

  statement_id BIGINT UNSIGNED NOT NULL COMMENT '정산 명세 ID',
  payment_id BIGINT UNSIGNED NOT NULL COMMENT '결제 ID',

  amount INT UNSIGNED NOT NULL COMMENT '이 결제의 정산 반영 금액(원)',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (statement_id) REFERENCES settlement_statements(id) ON DELETE CASCADE,
  FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,

  UNIQUE KEY uniq_statement_payment (statement_id, payment_id),
  INDEX idx_statement (statement_id),
  INDEX idx_payment (payment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='정산 상세(결제별)';

-- ============================================================================
-- 테이블 변경 사항
-- ============================================================================

ALTER TABLE payments
  ADD COLUMN settlement_statement_id BIGINT UNSIGNED NULL COMMENT '포함된 정산 ID',
  ADD INDEX idx_settle (is_settled, store_id, paid_at),
  ADD FOREIGN KEY (settlement_statement_id) REFERENCES settlement_statements(id) ON DELETE SET NULL;

-- 완료 메시지
SELECT '✅ 데이터베이스 스키마 생성 완료!' AS message;
