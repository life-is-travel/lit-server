/**
 * 결제 라우트
 * 토스페이먼츠 결제 연동 API 엔드포인트
 */

import express from 'express';
import {
  preparePayment,
  confirmPayment,
  getPayment,
  getPayments,
  cancelPayment,
  handleWebhook,
} from '../controllers/paymentController.js';
import { authenticate } from '../middleware/auth.js';

const router = express.Router();

/**
 * 결제 준비
 * POST /api/payments/prepare
 * 토스페이먼츠 결제창을 띄우기 전에 주문 정보를 생성하고 orderId를 발급
 */
router.post('/prepare', authenticate, preparePayment);

/**
 * 결제 승인
 * POST /api/payments/confirm
 * 토스페이먼츠 결제창에서 결제 완료 후 successUrl에서 호출
 */
router.post('/confirm', confirmPayment);

/**
 * 결제 단건 조회
 * GET /api/payments/:paymentKey
 */
router.get('/:paymentKey', authenticate, getPayment);

/**
 * 결제 목록 조회
 * GET /api/payments
 * Query params: store_id, user_id, status, page, limit
 */
router.get('/', authenticate, getPayments);

/**
 * 결제 취소
 * POST /api/payments/:paymentKey/cancel
 */
router.post('/:paymentKey/cancel', authenticate, cancelPayment);

/**
 * 토스페이먼츠 웹훅
 * POST /api/payments/webhook
 * 결제 상태 변경 시 토스페이먼츠에서 호출
 */
router.post('/webhook', handleWebhook);

export default router;
