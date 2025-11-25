/**
 * 웹훅 서비스
 * 토스페이먼츠 웹훅 처리 비즈니스 로직
 */

import { pool } from '../config/database.js';

/**
 * 토스 상태를 우리 시스템 상태로 매핑
 */
export function mapTossStatusToOurStatus(tossStatus) {
  const statusMap = {
    'READY': 'PENDING',
    'IN_PROGRESS': 'PENDING',
    'WAITING_FOR_DEPOSIT': 'PENDING',
    'DONE': 'SUCCESS',
    'CANCELED': 'CANCELED',
    'PARTIAL_CANCELED': 'CANCELED',
    'ABORTED': 'FAILED',
    'EXPIRED': 'FAILED',
  };

  return statusMap[tossStatus] || 'PENDING';
}

/**
 * 상태 전이 검증
 */
export function isValidStatusTransition(currentStatus, newStatus) {
  const validTransitions = {
    'PENDING': ['SUCCESS', 'FAILED', 'CANCELED'],
    'SUCCESS': ['CANCELED', 'REFUNDED'],
    'FAILED': [],
    'CANCELED': [],
    'REFUNDED': [],
  };

  return validTransitions[currentStatus]?.includes(newStatus) || false;
}

/**
 * 웹훅 멱등성 체크
 */
export async function checkWebhookIdempotency(connection, orderId, eventType, status) {
  const [existingWebhooks] = await connection.query(
    `SELECT * FROM payment_webhooks 
     WHERE pg_order_id = ? 
     AND event_type = ? 
     AND status = ?
     AND created_at >= DATE_SUB(NOW(), INTERVAL 1 HOUR)`,
    [orderId, eventType, status]
  );

  return existingWebhooks.length > 0;
}

/**
 * 웹훅 이력 저장
 */
export async function saveWebhookHistory(connection, webhookData) {
  const {
    paymentId,
    orderId,
    paymentKey,
    eventType,
    status,
    rawData,
  } = webhookData;

  const webhookId = `webhook_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  await connection.query(
    `INSERT INTO payment_webhooks (
      id,
      payment_id,
      pg_order_id,
      pg_payment_key,
      event_type,
      status,
      webhook_data,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      webhookId,
      paymentId,
      orderId,
      paymentKey || null,
      eventType,
      status,
      JSON.stringify(rawData),
    ]
  );

  return webhookId;
}

/**
 * 결제 상태 변경 처리
 */
export async function handlePaymentStatusChanged(connection, payment, data) {
  const { paymentKey, status, approvedAt, totalAmount, method } = data;
  
  const ourStatus = mapTossStatusToOurStatus(status);

  if (ourStatus === 'SUCCESS') {
    // 결제 성공
    await connection.query(
      `UPDATE payments
       SET status = ?,
           pg_payment_key = ?,
           pg_method = ?,
           amount_total = ?,
           paid_at = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        ourStatus,
        paymentKey,
        method || payment.pg_method,
        totalAmount || payment.amount_total,
        approvedAt ? new Date(approvedAt) : new Date(),
        payment.id,
      ]
    );

    // 연결된 예약이 있으면 예약 상태도 업데이트
    if (payment.reservation_id) {
      await connection.query(
        `UPDATE reservations
         SET status = 'confirmed',
             payment_status = 'paid',
             updated_at = NOW()
         WHERE id = ?`,
        [payment.reservation_id]
      );

      console.log(`✅ 예약 확정 완료: ${payment.reservation_id}`);
    }

    console.log(`✅ 결제 성공 처리 완료: ${payment.pg_order_id}`);

  } else if (ourStatus === 'FAILED') {
    // 결제 실패
    await connection.query(
      `UPDATE payments
       SET status = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [ourStatus, payment.id]
    );

    // 예약도 실패 처리
    if (payment.reservation_id) {
      await connection.query(
        `UPDATE reservations
         SET payment_status = 'failed',
             updated_at = NOW()
         WHERE id = ?`,
        [payment.reservation_id]
      );
    }

    console.log(`❌ 결제 실패 처리 완료: ${payment.pg_order_id}`);
  }
}

/**
 * 결제 취소 처리
 */
export async function handlePaymentCanceled(connection, payment, data) {
  const { paymentKey, cancels } = data;

  // 1. 결제 취소
  await connection.query(
    `UPDATE payments
     SET status = 'CANCELED',
         canceled_at = NOW(),
         updated_at = NOW()
     WHERE id = ?`,
    [payment.id]
  );

  // 2. 예약도 취소 처리
  if (payment.reservation_id) {
    await connection.query(
      `UPDATE reservations
       SET status = 'canceled',
           payment_status = 'refunded',
           updated_at = NOW()
       WHERE id = ?`,
      [payment.reservation_id]
    );

    console.log(`🔄 예약 취소 완료: ${payment.reservation_id}`);
  }

  console.log(`🔄 결제 취소 처리 완료: ${payment.pg_order_id}`);
}

/**
 * 웹훅 처리 메인 로직
 */
export async function processWebhook(webhookData) {
  let connection;

  try {
    const {
      eventType,
      createdAt,
      data: {
        paymentKey,
        orderId,
        status,
        approvedAt,
        totalAmount,
        method,
        cancels,
      } = {},
    } = webhookData;

    // 1. 필수 필드 검증
    if (!eventType || !orderId) {
      throw new Error('웹훅 필수 필드 누락');
    }

    // 2. 트랜잭션 시작
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 3. 기존 결제 정보 조회 (FOR UPDATE로 락 걸기)
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE pg_order_id = ? FOR UPDATE',
      [orderId]
    );

    if (payments.length === 0) {
      throw new Error(`존재하지 않는 주문: ${orderId}`);
    }

    const payment = payments[0];

    // 4. 멱등성 체크
    const isAlreadyProcessed = await checkWebhookIdempotency(
      connection,
      orderId,
      eventType,
      status
    );

    if (isAlreadyProcessed) {
      console.log(`⏭️  이미 처리된 웹훅: ${orderId}, ${eventType}, ${status}`);
      await connection.commit();
      return { success: true, message: 'Already processed (idempotent)' };
    }

    // 5. 웹훅 이력 저장
    await saveWebhookHistory(connection, {
      paymentId: payment.id,
      orderId,
      paymentKey,
      eventType,
      status,
      rawData: webhookData,
    });

    // 6. 상태 전이 검증
    const currentStatus = payment.status;
    const newStatus = mapTossStatusToOurStatus(status);

    if (!isValidStatusTransition(currentStatus, newStatus)) {
      console.warn(`⚠️  잘못된 상태 전이: ${currentStatus} -> ${newStatus}`);
      await connection.commit();
      return { success: false, message: 'Invalid status transition' };
    }

    // 7. 이벤트 타입별 처리
    switch (eventType) {
      case 'PAYMENT_STATUS_CHANGED':
        await handlePaymentStatusChanged(connection, payment, {
          paymentKey,
          status,
          approvedAt,
          totalAmount,
          method,
        });
        break;

      case 'PAYMENT_CANCELED':
        await handlePaymentCanceled(connection, payment, {
          paymentKey,
          cancels,
        });
        break;

      default:
        console.log(`ℹ️  처리하지 않는 이벤트 타입: ${eventType}`);
    }

    // 8. 트랜잭션 커밋
    await connection.commit();

    return { success: true, message: 'Webhook processed successfully' };

  } catch (err) {
    console.error('❌ 웹훅 처리 실패:', err);
    
    if (connection) {
      await connection.rollback();
    }

    throw err;

  } finally {
    if (connection) {
      connection.release();
    }
  }
}
