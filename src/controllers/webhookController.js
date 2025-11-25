/**
 * 웹훅 컨트롤러
 * 토스페이먼츠 웹훅 전용
 */

import { processWebhook } from '../services/webhookService.js';

/**
 * 토스페이먼츠 웹훅 처리
 * POST /api/webhooks/toss
 */
export const handleTossWebhook = async (req, res) => {
  try {
    const webhookData = req.body;

    console.log('📨 웹훅 수신:', JSON.stringify(webhookData, null, 2));

    // 웹훅 처리
    const result = await processWebhook(webhookData);

    // 웹훅은 항상 200 OK 반환 (PG사 재시도 방지)
    return res.status(200).json(result);

  } catch (err) {
    console.error('❌ 웹훅 처리 실패:', err);

    // 웹훅은 실패해도 200 반환 (무한 재시도 방지)
    // 단, 로그는 반드시 남겨서 수동 처리 가능하게
    return res.status(200).json({
      success: false,
      message: 'Webhook processing failed',
      error: err.message,
    });
  }
};
