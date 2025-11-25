/**
 * 예약 관리 컨트롤러
 * Phase 3 - 예약 관리 APIs
 */

import { success, error } from '../utils/response.js';
import { query, pool } from '../config/database.js';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

/**
 * 예약 생성
 * POST /api/reservations
 */
export const createReservation = async (req, res) => {
  try {
    const storeId = req.storeId || req.body.storeId; // 매장 앱이 아닌 고객 앱에서도 호출 가능
    const {
      customerName,
      phoneNumber,
      email,
      requestTime,
      startTime,
      endTime,
      duration,
      price,
      bagCount,
      message,
      specialRequests,
      luggageImageUrls,
      paymentMethod = 'card'
    } = req.body;

    // 필수 필드 검증
    if (!customerName || !phoneNumber || !startTime || !duration || !bagCount) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '필수 정보가 누락되었습니다', {
          required: ['customerName', 'phoneNumber', 'startTime', 'duration', 'bagCount']
        })
      );
    }

    // 매장 ID 확인
    if (!storeId) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '매장 ID가 필요합니다')
      );
    }

    // 날짜를 MySQL DATETIME 형식으로 변환하는 함수
    const toMySQLDateTime = (dateString) => {
      if (!dateString) return null;
      const date = new Date(dateString);
      // MySQL DATETIME 형식: 'YYYY-MM-DD HH:MM:SS'
      return date.toISOString().slice(0, 19).replace('T', ' ');
    };

    // 예약 ID 생성
    const reservationId = `res_${uuidv4()}`;

    // 종료 시간 계산 (endTime이 없으면 startTime + duration으로 계산)
    let calculatedEndTime = endTime;
    if (!calculatedEndTime && startTime && duration) {
      const start = new Date(startTime);
      start.setHours(start.getHours() + duration);
      calculatedEndTime = start.toISOString();
    }

    // 고객 ID 생성 (실제로는 고객 앱에서 전달받아야 함)
    const customerId = req.body.customerId || `customer_${Date.now()}`;

    // 예약 생성
    await query(
      `INSERT INTO reservations (
        id, store_id, customer_id, customer_name, customer_phone, customer_email,
        status, start_time, end_time, request_time, duration, bag_count,
        total_amount, message, special_requests, luggage_image_urls,
        payment_status, payment_method, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        reservationId,
        storeId,
        customerId,
        customerName,
        phoneNumber,
        email || null,
        'pending', // 초기 상태는 대기중
        toMySQLDateTime(startTime),
        toMySQLDateTime(calculatedEndTime),
        toMySQLDateTime(requestTime || new Date().toISOString()),
        duration,
        bagCount,
        price || 0,
        message || null,
        specialRequests || null,
        luggageImageUrls ? JSON.stringify(luggageImageUrls) : null,
        'pending', // 결제 상태
        paymentMethod
      ]
    );

    // 생성된 예약 조회
    const [newReservation] = await query(
      `SELECT
        id, store_id as storeId, customer_id as customerId,
        customer_name as customerName, customer_phone as phoneNumber,
        customer_email as email, status, start_time as startTime,
        end_time as endTime, request_time as requestTime, duration,
        bag_count as bagCount, total_amount as price, message,
        special_requests as specialRequests, payment_status as paymentStatus,
        payment_method as paymentMethod, created_at as createdAt
      FROM reservations
      WHERE id = ?`,
      [reservationId]
    );

    return res.status(201).json(
      success({
        ...newReservation,
        phoneNumber: newReservation.phoneNumber, // Flutter 호환성
        price: newReservation.price // Flutter 호환성
      }, '예약이 성공적으로 생성되었습니다')
    );
  } catch (err) {
    console.error('예약 생성 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message
      })
    );
  }
};

/**
 * 예약 목록 조회
 * GET /api/reservations
 */
export const getReservations = async (req, res) => {
  try {
    const storeId = req.storeId;
    const {
      status: statusFilter,
      date,
      customerId,
      page = 1,
      limit = 20,
    } = req.query;

    // 필터 조건 구성
    const conditions = ['store_id = ?'];
    const params = [storeId];

    if (statusFilter) {
      conditions.push('status = ?');
      params.push(statusFilter);
    }

    if (date) {
      conditions.push('DATE(start_time) = ?');
      params.push(date);
    }

    if (customerId) {
      conditions.push('customer_id = ?');
      params.push(customerId);
    }

    const whereClause = conditions.join(' AND ');

    // 전체 개수 조회
    const countResult = await query(
      `SELECT COUNT(*) as total FROM reservations WHERE ${whereClause}`,
      params
    );
    const totalItems = countResult[0].total;
    const totalPages = Math.ceil(totalItems / limit);

    // 페이지네이션 계산
    const offset = (page - 1) * limit;

    // 예약 목록 조회
    const reservations = await query(
      `SELECT
        r.id, r.store_id as storeId, r.customer_id as customerId,
        r.customer_name as customerName, r.customer_phone as customerPhone,
        r.customer_email as customerEmail,
        r.storage_id as storageId, r.storage_number as storageNumber,
        r.status, r.start_time as startTime, r.end_time as endTime,
        r.request_time as requestTime, r.actual_start_time as actualStartTime,
        r.actual_end_time as actualEndTime, r.duration,
        r.bag_count as bagCount, r.total_amount as totalAmount,
        r.message, r.special_requests as specialRequests,
        r.luggage_image_urls as luggageImageUrls,
        r.payment_status as paymentStatus, r.payment_method as paymentMethod,
        r.qr_code as qrCode, r.created_at as createdAt, r.updated_at as updatedAt
      FROM reservations r
      WHERE ${whereClause}
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    // 응답 데이터 구성
    const formattedReservations = reservations.map(reservation => {
      // luggage_image_urls JSON 파싱
      let luggageImageUrls = [];
      if (reservation.luggageImageUrls) {
        try {
          luggageImageUrls = typeof reservation.luggageImageUrls === 'string'
            ? JSON.parse(reservation.luggageImageUrls)
            : reservation.luggageImageUrls;
        } catch (e) {
          console.error('[getReservations] luggage_image_urls 파싱 실패:', e);
        }
      }

      return {
        id: reservation.id,
        customerName: reservation.customerName,
        phoneNumber: reservation.customerPhone, // Flutter 앱: phoneNumber
        email: reservation.customerEmail,
        requestTime: reservation.requestTime,
        startTime: reservation.startTime,
        duration: reservation.duration,
        price: reservation.totalAmount, // Flutter 앱: price
        bagCount: reservation.bagCount,
        message: reservation.message || '',
        specialRequests: reservation.specialRequests,
        luggageImageUrls,
        status: reservation.status,
        createdAt: reservation.createdAt,
        updatedAt: reservation.updatedAt,
      };
    });

    return res.json(
      success(
        {
          reservations: formattedReservations,
          pagination: {
            currentPage: Number(page),
            totalPages,
            totalItems,
            itemsPerPage: Number(limit),
          },
        },
        '예약 목록 조회 성공'
      )
    );
  } catch (err) {
    console.error('예약 목록 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 예약 단일 조회
 * GET /api/reservations/:id
 */
export const getReservation = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;

    const reservations = await query(
      `SELECT
        r.id, r.store_id as storeId, r.customer_id as customerId,
        r.customer_name as customerName, r.customer_phone as customerPhone,
        r.customer_email as customerEmail,
        r.storage_id as storageId, r.storage_number as storageNumber,
        r.status, r.start_time as startTime, r.end_time as endTime,
        r.request_time as requestTime, r.actual_start_time as actualStartTime,
        r.actual_end_time as actualEndTime, r.duration,
        r.bag_count as bagCount, r.total_amount as totalAmount,
        r.message, r.special_requests as specialRequests,
        r.luggage_image_urls as luggageImageUrls,
        r.payment_status as paymentStatus, r.payment_method as paymentMethod,
        r.qr_code as qrCode, r.created_at as createdAt, r.updated_at as updatedAt,
        s.number as storageNumberDetail, s.type as storageType
      FROM reservations r
      LEFT JOIN storages s ON r.storage_id = s.id
      WHERE r.id = ? AND r.store_id = ?
      LIMIT 1`,
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
      );
    }

    const reservation = reservations[0];

    // luggage_image_urls JSON 파싱
    let luggageImageUrls = [];
    if (reservation.luggageImageUrls) {
      try {
        luggageImageUrls = typeof reservation.luggageImageUrls === 'string'
          ? JSON.parse(reservation.luggageImageUrls)
          : reservation.luggageImageUrls;
      } catch (e) {
        console.error('[getReservation] luggage_image_urls 파싱 실패:', e);
      }
    }

    const result = {
      id: reservation.id,
      customerName: reservation.customerName,
      phoneNumber: reservation.customerPhone, // Flutter 앱: phoneNumber
      email: reservation.customerEmail,
      requestTime: reservation.requestTime,
      startTime: reservation.startTime,
      duration: reservation.duration,
      price: reservation.totalAmount, // Flutter 앱: price
      bagCount: reservation.bagCount,
      message: reservation.message || '',
      specialRequests: reservation.specialRequests,
      luggageImageUrls,
      status: reservation.status,
      createdAt: reservation.createdAt,
      updatedAt: reservation.updatedAt,
    };

    return res.json(success(result, '예약 조회 성공'));
  } catch (err) {
    console.error('예약 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 예약 승인
 * PUT /api/reservations/:id/approve
 */
export const approveReservation = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const { storageId, storageNumber } = req.body;

    // 예약 존재 및 상태 확인
    const reservations = await query(
      'SELECT status FROM reservations WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
      );
    }

    // pending 또는 pending_approval 상태만 승인 가능
    if (reservations[0].status !== 'pending' && reservations[0].status !== 'pending_approval') {
      return res.status(400).json(
        error('INVALID_STATUS', '승인 가능한 상태가 아닙니다', {
          currentStatus: reservations[0].status,
        })
      );
    }

    // 보관함이 지정된 경우 상태 확인 및 업데이트
    if (storageId) {
      const storages = await query(
        'SELECT status FROM storages WHERE id = ? AND store_id = ? LIMIT 1',
        [storageId, storeId]
      );

      if (!storages || storages.length === 0) {
        return res.status(404).json(
          error('STORAGE_NOT_FOUND', '보관함을 찾을 수 없습니다')
        );
      }

      if (storages[0].status !== 'available') {
        return res.status(400).json(
          error('STORAGE_NOT_AVAILABLE', '사용 가능한 보관함이 아닙니다', {
            currentStatus: storages[0].status,
          })
        );
      }

      // 보관함 상태를 occupied로 변경
      await query(
        'UPDATE storages SET status = \'occupied\', updated_at = NOW() WHERE id = ? AND store_id = ?',
        [storageId, storeId]
      );
    }

    // 예약 상태를 confirmed로 변경
    await query(
      `UPDATE reservations
       SET status = 'confirmed', storage_id = ?, storage_number = ?, updated_at = NOW()
       WHERE id = ? AND store_id = ?`,
      [storageId || null, storageNumber || null, id, storeId]
    );

    // 업데이트된 예약 조회
    const updatedReservations = await query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, storage_id as storageId, storage_number as storageNumber,
        start_time as startTime, end_time as endTime, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(success(updatedReservations[0], '예약 승인 성공'));
  } catch (err) {
    console.error('예약 승인 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 예약 거부 (자동 환불 포함)
 * PUT /api/reservations/:id/reject
 */
export const rejectReservation = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const { reason } = req.body;

    await connection.beginTransaction();

    // 1. 예약 정보 조회 (FOR UPDATE로 락 걸기)
    const [reservations] = await connection.query(
      'SELECT * FROM reservations WHERE id = ? AND store_id = ? FOR UPDATE',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      await connection.rollback();
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
      );
    }

    const reservation = reservations[0];

    // 2. 이미 처리된 예약인지 확인
    if (reservation.status !== 'pending' && reservation.status !== 'pending_approval') {
      await connection.rollback();
      return res.status(400).json(
        error('INVALID_STATUS', '거부할 수 없는 예약 상태입니다', {
          currentStatus: reservation.status,
        })
      );
    }

    // 3. 결제 정보 조회
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE reservation_id = ? AND status = "SUCCESS"',
      [id]
    );

    let refundResult = null;
    const payment = payments && payments.length > 0 ? payments[0] : null;

    // 4. 결제가 완료된 경우 자동 환불
    if (payment) {
      const secretKey = process.env.TOSS_SECRET_KEY;
      const encodedKey = Buffer.from(secretKey + ':').toString('base64');

      try {
        // 토스페이먼츠 환불 API 호출
        const tossResponse = await axios.post(
          `https://api.tosspayments.com/v1/payments/${payment.pg_payment_key}/cancel`,
          {
            cancelReason: reason || '가게 사정으로 예약 거부',
          },
          {
            headers: {
              Authorization: `Basic ${encodedKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        refundResult = tossResponse.data;

        // 결제 상태 업데이트
        await connection.query(
          `UPDATE payments
           SET status = 'CANCELED',
               canceled_at = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [payment.id]
        );

        console.log(`✅ 자동 환불 완료: ${payment.pg_payment_key}`);

      } catch (refundError) {
        console.error('환불 실패:', refundError);
        await connection.rollback();
        
        return res.status(500).json(
          error('REFUND_FAILED', '환불 처리 중 오류가 발생했습니다', {
            detail: refundError.response?.data || refundError.message,
          })
        );
      }
    }

    // 5. 예약 상태 업데이트
    await connection.query(
      `UPDATE reservations
       SET status = 'rejected',
           payment_status = ?,
           message = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        payment ? 'refunded' : reservation.payment_status,
        reason || '점포 사정으로 예약이 거부되었습니다',
        id,
      ]
    );

    await connection.commit();

    // 6. 업데이트된 예약 조회
    const [updatedReservations] = await connection.query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, payment_status as paymentStatus, message, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(
      success({
        reservation: updatedReservations[0],
        refunded: !!payment,
        refund_amount: payment?.amount_total,
        refund_data: refundResult,
      }, '예약 거부 및 환불 처리 완료')
    );

  } catch (err) {
    await connection.rollback();
    console.error('예약 거부 중 에러:', err);
    
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  } finally {
    connection.release();
  }
};

/**
 * 예약 취소 (자동 환불 포함)
 * PUT /api/reservations/:id/cancel
 * 가게에서 자동 승인된 예약을 취소할 때 사용
 */
export const cancelReservation = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const { reason } = req.body;

    await connection.beginTransaction();

    // 1. 예약 정보 조회 (FOR UPDATE로 락 걸기)
    const [reservations] = await connection.query(
      'SELECT * FROM reservations WHERE id = ? AND store_id = ? FOR UPDATE',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      await connection.rollback();
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
      );
    }

    const reservation = reservations[0];

    // 2. 상태 검증
    if (reservation.status === 'cancelled') {
      await connection.rollback();
      return res.status(400).json(
        error('ALREADY_CANCELLED', '이미 취소된 예약입니다')
      );
    }

    if (reservation.status === 'completed') {
      await connection.rollback();
      return res.status(400).json(
        error('CANNOT_CANCEL_COMPLETED', '완료된 예약은 취소할 수 없습니다')
      );
    }

    // 3. 결제 정보 조회
    const [payments] = await connection.query(
      'SELECT * FROM payments WHERE reservation_id = ? AND status = "SUCCESS"',
      [id]
    );

    let refundResult = null;
    const payment = payments && payments.length > 0 ? payments[0] : null;

    // 4. 결제가 완료된 경우 자동 환불
    if (payment) {
      const secretKey = process.env.TOSS_SECRET_KEY;
      const encodedKey = Buffer.from(secretKey + ':').toString('base64');

      try {
        // 토스페이먼츠 환불 API 호출
        const tossResponse = await axios.post(
          `https://api.tosspayments.com/v1/payments/${payment.pg_payment_key}/cancel`,
          {
            cancelReason: reason || '가게 사정으로 예약 취소',
          },
          {
            headers: {
              Authorization: `Basic ${encodedKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        refundResult = tossResponse.data;

        // 결제 상태 업데이트
        await connection.query(
          `UPDATE payments
           SET status = 'CANCELED',
               canceled_at = NOW(),
               updated_at = NOW()
           WHERE id = ?`,
          [payment.id]
        );

        console.log(`✅ 자동 환불 완료: ${payment.pg_payment_key}`);

      } catch (refundError) {
        console.error('환불 실패:', refundError);
        await connection.rollback();
        
        return res.status(500).json(
          error('REFUND_FAILED', '환불 처리 중 오류가 발생했습니다', {
            detail: refundError.response?.data || refundError.message,
          })
        );
      }
    }

    // 5. 보관함이 할당된 경우 상태를 available로 변경
    if (reservation.storage_id) {
      await connection.query(
        'UPDATE storages SET status = \'available\', updated_at = NOW() WHERE id = ? AND store_id = ?',
        [reservation.storage_id, storeId]
      );
    }

    // 6. 예약 상태 업데이트
    await connection.query(
      `UPDATE reservations
       SET status = 'cancelled',
           payment_status = ?,
           message = ?,
           updated_at = NOW()
       WHERE id = ?`,
      [
        payment ? 'refunded' : reservation.payment_status,
        reason || '가게 사정으로 예약 취소',
        id,
      ]
    );

    await connection.commit();

    // 7. 업데이트된 예약 조회
    const [updatedReservations] = await connection.query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, payment_status as paymentStatus, message, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(
      success({
        reservation: updatedReservations[0],
        refunded: !!payment,
        refund_amount: payment?.amount_total,
        refund_data: refundResult,
      }, '예약 취소 및 환불 처리 완료')
    );

  } catch (err) {
    await connection.rollback();
    console.error('예약 취소 중 에러:', err);
    
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  } finally {
    connection.release();
  }
};

/**
 * 예약 상태 변경
 * PUT /api/reservations/:id/status
 */
export const updateReservationStatus = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { id } = req.params;
    const { status: newStatus } = req.body;

    // 상태값 검증
    const validStatuses = ['pending', 'confirmed', 'rejected', 'in_progress', 'completed', 'cancelled'];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '유효한 상태값이 필요합니다', {
          validStatuses,
        })
      );
    }

    // 예약 존재 확인
    const reservations = await query(
      'SELECT status, storage_id FROM reservations WHERE id = ? AND store_id = ? LIMIT 1',
      [id, storeId]
    );

    if (!reservations || reservations.length === 0) {
      return res.status(404).json(
        error('RESERVATION_NOT_FOUND', '예약을 찾을 수 없습니다')
      );
    }

    const currentStatus = reservations[0].status;
    const storageId = reservations[0].storage_id;

    // 상태 전환 로직 처리
    if (newStatus === 'in_progress' && currentStatus === 'confirmed') {
      // 예약 시작 - actual_start_time 설정
      await query(
        'UPDATE reservations SET status = ?, actual_start_time = NOW(), updated_at = NOW() WHERE id = ? AND store_id = ?',
        [newStatus, id, storeId]
      );
    } else if (newStatus === 'completed' && (currentStatus === 'in_progress' || currentStatus === 'confirmed')) {
      // 예약 완료 - actual_end_time 설정, 보관함 상태를 available로 변경
      await query(
        'UPDATE reservations SET status = ?, actual_end_time = NOW(), updated_at = NOW() WHERE id = ? AND store_id = ?',
        [newStatus, id, storeId]
      );

      if (storageId) {
        await query(
          'UPDATE storages SET status = \'available\', updated_at = NOW() WHERE id = ? AND store_id = ?',
          [storageId, storeId]
        );
      }
    } else {
      // 일반적인 상태 변경
      await query(
        'UPDATE reservations SET status = ?, updated_at = NOW() WHERE id = ? AND store_id = ?',
        [newStatus, id, storeId]
      );
    }

    // 업데이트된 예약 조회
    const updatedReservations = await query(
      `SELECT
        id, store_id as storeId, customer_name as customerName,
        status, actual_start_time as actualStartTime,
        actual_end_time as actualEndTime, updated_at as updatedAt
      FROM reservations
      WHERE id = ?
      LIMIT 1`,
      [id]
    );

    return res.json(success(updatedReservations[0], '예약 상태 변경 성공'));
  } catch (err) {
    console.error('예약 상태 변경 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};
