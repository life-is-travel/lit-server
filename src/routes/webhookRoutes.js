/**
 * 웹훅 라우트
 * PG사 웹훅 전용 엔드포인트
 */

import express from 'express';
import { handleTossWebhook } from '../controllers/webhookController.js';

const router = express.Router();

/**
 * 토스페이먼츠 웹훅
 * POST /api/webhooks/toss
 * 
 * 특징:
 * - 인증 불필요 (토스페이먼츠에서 호출)
 * - 서명 검증 필요 (프로덕션)
 * - 멱등성 보장
 * - 항상 200 응답 (재시도 방지)
 */
router.post('/toss', handleTossWebhook);

// 나중에 다른 PG사 추가 가능
// router.post('/kakaopay', handleKakaoWebhook);
// router.post('/naverpay', handleNaverWebhook);

export default router;
