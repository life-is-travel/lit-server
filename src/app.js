/**
 * Express 애플리케이션 설정
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';

// 환경변수 로드
dotenv.config();

// Express 앱 생성
const app = express();

// ============================================================================
// 미들웨어 설정
// ============================================================================

// CORS 설정
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || '*',
  /*
  운영 단계
  origin: ["https://lifeistravel.io", "https://api.lifeistravel.io"],
  */
  credentials: process.env.CORS_CREDENTIALS === 'true',
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// Body 파싱 미들웨어
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 요청 로깅 미들웨어 (개발 환경)
if (process.env.NODE_ENV !== 'test') {
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path}`);
    next();
  });
}

// ============================================================================
// 헬스체크 엔드포인트
// ============================================================================

app.get('/health', async (req, res) => {
  try {
    const dbConnected = await testConnection();

    res.status(200).json({
      success: true,
      message: 'Server is running',
      timestamp: new Date().toISOString(),
      database: dbConnected ? 'connected' : 'disconnected',
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Server is running but database connection failed',
      timestamp: new Date().toISOString(),
      database: 'disconnected',
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0',
    });
  }
});

// ============================================================================
// API 라우트
// ============================================================================

import authRoutes from './routes/authRoutes.js';
import storeRoutes from './routes/storeRoutes.js';
import dashboardRoutes from './routes/dashboardRoutes.js';
import storageRoutes from './routes/storageRoutes.js';
import reservationRoutes from './routes/reservationRoutes.js';
import statisticsRoutes from './routes/statisticsRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import reviewRoutes from './routes/reviewRoutes.js';
import checkinRoutes from './routes/checkin.js';
import paymentRoutes from './routes/paymentRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

// 인증 라우트
app.use('/api/auth', authRoutes);

// 점포 라우트
app.use('/api/store', storeRoutes);

// 대시보드 라우트
app.use('/api/dashboard', dashboardRoutes);

// 보관함 라우트 (Locker units)
app.use('/api/storages', storageRoutes);

// 체크인 라우트 (현재 보관 중인 짐 - Flutter StorageItem)
app.use('/api/checkins', checkinRoutes);

// 예약 라우트
app.use('/api/reservations', reservationRoutes);

// 통계 라우트
app.use('/api/statistics', statisticsRoutes);

// 알림 라우트
app.use('/api/notifications', notificationRoutes);

// 리뷰 라우트
app.use('/api/reviews', reviewRoutes);

// 결제 라우트
app.use('/api/payments', paymentRoutes);

// 웹훅 라우트 (인증 불필요)
app.use('/api/webhooks', webhookRoutes);

// ============================================================================
// 404 에러 핸들러
// ============================================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'ROUTE_NOT_FOUND',
      message: `경로를 찾을 수 없습니다: ${req.method} ${req.path}`,
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================================
// 전역 에러 핸들러
// ============================================================================

app.use((err, req, res, next) => {
  console.error('서버 에러:', err);

  // 에러 상태 코드 결정
  const statusCode = err.statusCode || err.status || 500;

  // 에러 응답
  res.status(statusCode).json({
    success: false,
    error: {
      code: err.code || 'SERVER_ERROR',
      message: err.message || '서버 내부 오류가 발생했습니다.',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
      timestamp: new Date().toISOString(),
    },
  });
});

// ============================================================================
// 앱 내보내기
// ============================================================================

export default app;
