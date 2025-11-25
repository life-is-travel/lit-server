/**
 * 결제 서비스
 * 결제 관련 비즈니스 로직
 */

import { query } from '../config/database.js';

/**
 * 예약 정보 검증
 */
export const validateReservation = async (reservationId, userId) => {
  const [reservation] = await query(
    'SELECT * FROM reservations WHERE id = ? AND customer_id = ?',
    [reservationId, userId]
  );

  if (!reservation) {
    throw new Error('예약 정보를 찾을 수 없습니다');
  }

  if (reservation.payment_status === 'paid') {
    throw new Error('이미 결제된 예약입니다');
  }

  return reservation;
};

/**
 * 주문번호 생성
 */
export const generateOrderId = () => {
  const timestamp = Date.now();
  const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `ORDER_${timestamp}_${randomStr}`;
};

/**
 * 결제 정보 생성
 */
export const createPayment = async (paymentData) => {
  const {
    storeId,
    userId,
    reservationId,
    amount,
    orderId,
  } = paymentData;

  await query(
    `INSERT INTO payments (
      store_id,
      user_id,
      reservation_id,
      amount_total,
      currency,
      pg_provider,
      pg_order_id,
      pg_method,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      storeId,
      userId,
      reservationId || null,
      amount,
      'KRW',
      'toss',
      orderId,
      'UNKNOWN',
      'PENDING',
    ]
  );

  return orderId;
};

/**
 * 예약 결제 상태 업데이트
 */
export const updateReservationPaymentStatus = async (reservationId, status) => {
  if (!reservationId) return;

  await query(
    `UPDATE reservations
     SET payment_status = ?,
         updated_at = NOW()
     WHERE id = ?`,
    [status, reservationId]
  );
};
