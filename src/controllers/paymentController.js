/**
 * 결제 관리 컨트롤러
 * 토스페이먼츠 결제 연동
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';
import axios from 'axios';
import {
  validateReservation,
  generateOrderId,
  createPayment,
  updateReservationPaymentStatus,
} from '../services/paymentService.js';

/**
 * 결제 준비
 * POST /api/payments/prepare
 */
export const preparePayment = async (req, res) => {
  try {
    const {
      store_id,
      user_id,
      amount,
      order_name,
      customer_email,
      customer_name,
      reservation_id,
    } = req.body;

    // 필수 필드 검증
    if (!store_id || !user_id || !amount || !order_name) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', {
          required: ['store_id', 'user_id', 'amount', 'order_name'],
        })
      );
    }

    // 금액 검증 (양수, 최소 금액)
    if (amount < 100) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '결제 금액은 최소 100원 이상이어야 합니다')
      );
    }

    // 예약 ID가 있으면 예약 정보 검증
    if (reservation_id) {
      try {
        await validateReservation(reservation_id, user_id);
      } catch (validationError) {
        return res.status(400).json(
          error('RESERVATION_VALIDATION_FAILED', validationError.message)
        );
      }
    }

    // 고유한 주문번호(orderId) 생성
    const orderId = generateOrderId();

    // payments 테이블에 PENDING 상태로 사전 저장
    await createPayment({
      storeId: store_id,
      userId: user_id,
      reservationId: reservation_id,
      amount,
      orderId,
    });

    // 예약 상태를 'payment_pending'으로 업데이트
    if (reservation_id) {
      await updateReservationPaymentStatus(reservation_id, 'pending');
    }

    // 클라이언트에 필요한 정보 반환
    return res.status(200).json(
      success({
        order_id: orderId,
        amount: amount,
        currency: 'KRW',
        order_name: order_name,
        customer_key: `USER_${user_id}`, // 회원 결제용 고유 키
        client_key: process.env.TOSS_CLIENT_KEY, // 클라이언트 키
        customer_email: customer_email,
        customer_name: customer_name,
        reservation_id: reservation_id,
      })
    );
  } catch (err) {
    console.error('결제 준비 실패:', err);
    return res.status(500).json(
      error('PAYMENT_PREPARE_FAILED', '결제 준비 중 오류가 발생했습니다', {
        detail: err.message,
      })
    );
  }
};

/**
 * 결제 승인
 * POST /api/payments/confirm
 */
export const confirmPayment = async (req, res) => {
  try {
    const { paymentKey, orderId, amount } = req.body;

    // 필수 필드 검증
    if (!paymentKey || !orderId || !amount) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', {
          required: ['paymentKey', 'orderId', 'amount'],
        })
      );
    }

    // DB에서 해당 주문 조회
    const [payment] = await query(
      'SELECT * FROM payments WHERE pg_order_id = ?',
      [orderId]
    );

    if (!payment) {
      return res.status(404).json(
        error('PAYMENT_NOT_FOUND', '결제 정보를 찾을 수 없습니다')
      );
    }

    // 금액 검증 (위변조 방지)
    if (payment.amount_total !== amount) {
      return res.status(400).json(
        error('AMOUNT_MISMATCH', '결제 금액이 일치하지 않습니다', {
          expected: payment.amount_total,
          received: amount,
        })
      );
    }

    // 이미 승인된 결제인지 확인
    if (payment.status === 'SUCCESS') {
      return res.status(400).json(
        error('ALREADY_CONFIRMED', '이미 승인된 결제입니다')
      );
    }

    // 토스페이먼츠 결제 승인 API 호출
    const secretKey = process.env.TOSS_SECRET_KEY;
    const encodedKey = Buffer.from(secretKey + ':').toString('base64');

    const tossResponse = await axios.post(
      'https://api.tosspayments.com/v1/payments/confirm',
      {
        paymentKey,
        orderId,
        amount,
      },
      {
        headers: {
          Authorization: `Basic ${encodedKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const paymentData = tossResponse.data;

    // DB 업데이트 - 결제 승인 성공
    await query(
      `UPDATE payments 
       SET 
         pg_payment_key = ?,
         pg_method = ?,
         status = ?,
         paid_at = NOW(),
         updated_at = NOW()
       WHERE pg_order_id = ?`,
      [
        paymentKey,
        paymentData.method || 'CARD',
        'SUCCESS',
        orderId,
      ]
    );

    return res.status(200).json(
      success({
        message: '결제가 성공적으로 승인되었습니다',
        payment: {
          orderId: paymentData.orderId,
          paymentKey: paymentData.paymentKey,
          method: paymentData.method,
          amount: paymentData.totalAmount,
          status: paymentData.status,
          approvedAt: paymentData.approvedAt,
        },
      })
    );
  } catch (err) {
    console.error('결제 승인 실패:', err);

    // 토스페이먼츠 API 에러 처리
    if (err.response) {
      const tossError = err.response.data;
      
      // DB 업데이트 - 결제 실패
      if (orderId) {
        await query(
          `UPDATE payments 
           SET status = ?, updated_at = NOW()
           WHERE pg_order_id = ?`,
          ['FAILED', orderId]
        );
      }

      return res.status(err.response.status).json(
        error('PAYMENT_CONFIRM_FAILED', tossError.message || '결제 승인에 실패했습니다', {
          code: tossError.code,
          detail: tossError.message,
        })
      );
    }

    return res.status(500).json(
      error('PAYMENT_CONFIRM_FAILED', '결제 승인 중 오류가 발생했습니다', {
        detail: err.message,
      })
    );
  }
};

/**
 * 결제 단건 조회
 * GET /api/payments/:paymentKey
 */
export const getPayment = async (req, res) => {
  try {
    const { paymentKey } = req.params;

    const [payment] = await query(
      'SELECT * FROM payments WHERE pg_payment_key = ?',
      [paymentKey]
    );

    if (!payment) {
      return res.status(404).json(
        error('PAYMENT_NOT_FOUND', '결제 정보를 찾을 수 없습니다')
      );
    }

    return res.status(200).json(success(payment));
  } catch (err) {
    console.error('결제 조회 실패:', err);
    return res.status(500).json(
      error('PAYMENT_QUERY_FAILED', '결제 조회 중 오류가 발생했습니다', {
        detail: err.message,
      })
    );
  }
};

/**
 * 결제 목록 조회
 * GET /api/payments
 */
export const getPayments = async (req, res) => {
  try {
    const { store_id, user_id, status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let queryStr = 'SELECT * FROM payments WHERE 1=1';
    const params = [];

    if (store_id) {
      queryStr += ' AND store_id = ?';
      params.push(store_id);
    }

    if (user_id) {
      queryStr += ' AND user_id = ?';
      params.push(user_id);
    }

    if (status) {
      queryStr += ' AND status = ?';
      params.push(status);
    }

    queryStr += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const payments = await query(queryStr, params);

    // 전체 개수 조회
    let countQuery = 'SELECT COUNT(*) as total FROM payments WHERE 1=1';
    const countParams = [];

    if (store_id) {
      countQuery += ' AND store_id = ?';
      countParams.push(store_id);
    }

    if (user_id) {
      countQuery += ' AND user_id = ?';
      countParams.push(user_id);
    }

    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }

    const [{ total }] = await query(countQuery, countParams);

    return res.status(200).json(
      success({
        payments,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          totalPages: Math.ceil(total / limit),
        },
      })
    );
  } catch (err) {
    console.error('결제 목록 조회 실패:', err);
    return res.status(500).json(
      error('PAYMENTS_QUERY_FAILED', '결제 목록 조회 중 오류가 발생했습니다', {
        detail: err.message,
      })
    );
  }
};

/**
 * 결제 취소
 * POST /api/payments/:paymentKey/cancel
 */
export const cancelPayment = async (req, res) => {
  try {
    const { paymentKey } = req.params;
    const { cancelReason } = req.body;

    if (!cancelReason) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '취소 사유가 필요합니다')
      );
    }

    // DB에서 결제 정보 조회
    const [payment] = await query(
      'SELECT * FROM payments WHERE pg_payment_key = ?',
      [paymentKey]
    );

    if (!payment) {
      return res.status(404).json(
        error('PAYMENT_NOT_FOUND', '결제 정보를 찾을 수 없습니다')
      );
    }

    if (payment.status !== 'SUCCESS') {
      return res.status(400).json(
        error('INVALID_PAYMENT_STATUS', '취소할 수 없는 결제 상태입니다', {
          currentStatus: payment.status,
        })
      );
    }

    // 토스페이먼츠 결제 취소 API 호출
    const secretKey = process.env.TOSS_SECRET_KEY;
    const encodedKey = Buffer.from(secretKey + ':').toString('base64');

    const tossResponse = await axios.post(
      `https://api.tosspayments.com/v1/payments/${paymentKey}/cancel`,
      {
        cancelReason,
      },
      {
        headers: {
          Authorization: `Basic ${encodedKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    // DB 업데이트 - 결제 취소
    await query(
      `UPDATE payments 
       SET status = ?, canceled_at = NOW(), updated_at = NOW()
       WHERE pg_payment_key = ?`,
      ['CANCELED', paymentKey]
    );

    return res.status(200).json(
      success({
        message: '결제가 성공적으로 취소되었습니다',
        canceledAt: tossResponse.data.cancels[0].canceledAt,
      })
    );
  } catch (err) {
    console.error('결제 취소 실패:', err);

    if (err.response) {
      const tossError = err.response.data;
      return res.status(err.response.status).json(
        error('PAYMENT_CANCEL_FAILED', tossError.message || '결제 취소에 실패했습니다', {
          code: tossError.code,
          detail: tossError.message,
        })
      );
    }

    return res.status(500).json(
      error('PAYMENT_CANCEL_FAILED', '결제 취소 중 오류가 발생했습니다', {
        detail: err.message,
      })
    );
  }
};
