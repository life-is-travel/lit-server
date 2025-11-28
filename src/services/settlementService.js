/**
 * 정산 서비스 v1.4 (운영/모니터링 강화판)
 *
 * 포함 기능:
 * - 동시성 제어: SELECT ... FOR UPDATE + UPDATE is_settled=0 조건
 * - 정산 기간: periodStart, periodEnd 명확화
 * - 금액 검증: totalSales <= 0 스킵
 * - INSERT 결과 검증: statementId 체크 + 에러 로그
 * - UPDATE 결과 검증: affectedRows 체크 + 에러 로그
 * - UPDATE 성공 시에만 settlement_items INSERT (정합성 보장)
 * - settlement_logs: 카운터 및 합계 기록
 * - settlement_errors: 오류 상황 상세 로그
 * - dryRun 지원: DB 반영 없이 결과만 시뮬레이션
 * - 수수료 정책: 20% (commission = floor(totalSales * 0.2))
 */

import { pool } from '../config/database.js';

const PLATFORM_COMMISSION_RATE = 0.2; // 20%

/**
 * 정산 실행
 * @param {Object} params
 * @param {Date} params.periodStart - 정산 시작 시간
 * @param {Date} params.periodEnd - 정산 종료 시간
 * @param {boolean} params.dryRun - 시뮬레이션 모드 (실제 DB 반영 안함)
 * @returns {Promise<Object>}
 */
export async function runSettlementPeriod({ periodStart, periodEnd, dryRun = false }) {
  if (!periodStart || !periodEnd) {
    throw new Error('periodStart, periodEnd 는 필수입니다.');
  }
  if (!(periodStart instanceof Date) || !(periodEnd instanceof Date)) {
    throw new Error('periodStart, periodEnd 는 Date 객체여야 합니다.');
  }
  if (periodEnd <= periodStart) {
    throw new Error('periodEnd 는 periodStart 보다 이후여야 합니다.');
  }

  const connection = await pool.getConnection();
  const startedAt = new Date();
  let logId = null;

  // 모니터링 카운터
  let totalPayments = 0;
  let successPaymentCount = 0;
  let skippedPaymentCount = 0;
  let totalCommission = 0;
  let totalPayout = 0;

  try {
    await connection.beginTransaction();

    // 0) 정산 로그 skeleton 생성
    const [logResult] = await connection.query(
      `INSERT INTO settlement_logs (
         started_at, period_start, period_end,
         status, message,
         total_payments, total_statements,
         success_payments, skipped_payments,
         total_payout, total_commission,
         created_at
       ) VALUES (?, ?, ?, 'noop', '정산 시작', 0, 0, 0, 0, 0, 0, NOW())`,
      [startedAt, periodStart, periodEnd]
    );
    logId = logResult.insertId;

    // 1) 정산 대상 결제 조회 (FOR UPDATE)
    const [payments] = await connection.query(
      `SELECT id, store_id, amount_total, paid_at
         FROM payments
        WHERE status = 'SUCCESS'
          AND is_settled = 0
          AND paid_at >= ?
          AND paid_at < ?
        ORDER BY store_id, paid_at
        FOR UPDATE`,
      [periodStart, periodEnd]
    );

    totalPayments = payments.length;

    if (payments.length === 0) {
      const endedAt = new Date();
      await connection.query(
        `UPDATE settlement_logs
            SET ended_at = ?, status='noop', message='정산 대상 없음',
                total_payments = 0
          WHERE id = ?`,
        [endedAt, logId]
      );
      await connection.commit();

      return {
        success: true,
        status: 'noop',
        totalPayments: 0,
        totalStatements: 0,
        settlements: [],
      };
    }

    // 2) dryRun 모드: 계산만
    if (dryRun) {
      const { settlements, totalStatements } = simulateSettlement(payments);

      const endedAt = new Date();
      await connection.query(
        `UPDATE settlement_logs
            SET ended_at = ?, status='success',
                message='드라이런 완료',
                total_payments = ?, total_statements = ?
          WHERE id = ?`,
        [endedAt, totalPayments, totalStatements, logId]
      );

      await connection.commit();
      return {
        success: true,
        status: 'success',
        dryRun: true,
        totalPayments,
        totalStatements,
        settlements,
      };
    }

    // 3) store_id 기준으로 그룹핑
    const storeMap = new Map();
    for (const p of payments) {
      if (!storeMap.has(p.store_id)) storeMap.set(p.store_id, []);
      storeMap.get(p.store_id).push(p);
    }

    const settlementsResult = [];

    // 4) 점포별 정산 생성
    for (const [storeId, storePayments] of storeMap.entries()) {
      const totalSales = storePayments.reduce((sum, p) => sum + p.amount_total, 0);

      // 매출 0 이하 스킵
      if (totalSales <= 0) {
        console.warn(`[정산 스킵] storeId=${storeId}, totalSales<=0`);
        skippedPaymentCount += storePayments.length;
        continue;
      }

      const commissionAmount = Math.floor(totalSales * PLATFORM_COMMISSION_RATE);
      const payoutAmount = totalSales - commissionAmount;

      // 정산 명세 INSERT
      let statementId;
      try {
        const [statementResult] = await connection.query(
          `INSERT INTO settlement_statements (
              store_id,
              period_start,
              period_end,
              total_sales,
              commission_rate,
              commission_amount,
              payout_amount,
              status,
              meta,
              created_at,
              updated_at
           ) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, NOW(), NOW())`,
          [
            storeId,
            periodStart,
            periodEnd,
            totalSales,
            PLATFORM_COMMISSION_RATE,
            commissionAmount,
            payoutAmount,
            JSON.stringify({
              note: '자동 정산 생성',
              paymentsCount: storePayments.length,
            }),
          ]
        );
        statementId = statementResult.insertId;
      } catch (e) {
        await logSettlementError(connection, {
          settlementLogId: logId,
          type: 'STATEMENT_INSERT_FAIL',
          storeId,
          message: e.message,
          rawData: { totalSales, periodStart, periodEnd },
        });
        throw e;
      }

      if (!statementId) {
        await logSettlementError(connection, {
          settlementLogId: logId,
          type: 'STATEMENT_INSERT_NO_ID',
          storeId,
          message: 'statementId가 없습니다.',
          rawData: { totalSales, periodStart, periodEnd },
        });
        throw new Error(`정산 명세 INSERT 실패: storeId=${storeId}`);
      }

      // 카운터 누적
      totalCommission += commissionAmount;
      totalPayout += payoutAmount;

      // 결제별 처리
      for (const p of storePayments) {
        // 4-1) UPDATE 먼저 수행
        const [updateResult] = await connection.query(
          `UPDATE payments
              SET is_settled = 1,
                  settlement_statement_id = ?
            WHERE id = ? AND is_settled = 0`,
          [statementId, p.id]
        );

        if (updateResult.affectedRows === 0) {
          // 이미 정산됨 (동시성 충돌 가능성)
          skippedPaymentCount++;
          console.warn(`[스킵] paymentId=${p.id} 이미 정산됨 (동시 실행 감지)`);
          
          await logSettlementError(connection, {
            settlementLogId: logId,
            type: 'PAYMENT_ALREADY_SETTLED',
            paymentId: p.id,
            storeId,
            statementId,
            message: 'payments UPDATE affectedRows = 0 (이미 정산됨)',
            rawData: p,
          });
          
          continue; // 해당 payment만 스킵, 나머지 계속 처리
        }

        successPaymentCount++;

        // 4-2) settlement_items INSERT (UPDATE 성공 시에만)
        try {
          await connection.query(
            `INSERT INTO settlement_items (
                statement_id, payment_id, amount, created_at
             ) VALUES (?, ?, ?, NOW())`,
            [statementId, p.id, p.amount_total]
          );
        } catch (e) {
          await logSettlementError(connection, {
            settlementLogId: logId,
            type: 'ITEM_INSERT_FAIL',
            paymentId: p.id,
            storeId,
            statementId,
            message: e.message,
            rawData: p,
          });
          throw e; // 전체 롤백
        }
      }

      settlementsResult.push({
        storeId,
        statementId,
        totalSales,
        commissionAmount,
        payoutAmount,
        paymentsCount: storePayments.length,
      });
    }

    const endedAt = new Date();
    await connection.query(
      `UPDATE settlement_logs
          SET ended_at = ?,
              status = 'success',
              message = '정산 완료',
              total_payments = ?,
              total_statements = ?,
              success_payments = ?,
              skipped_payments = ?,
              total_payout = ?,
              total_commission = ?
        WHERE id = ?`,
      [
        endedAt,
        totalPayments,
        settlementsResult.length,
        successPaymentCount,
        skippedPaymentCount,
        totalPayout,
        totalCommission,
        logId,
      ]
    );

    await connection.commit();

    return {
      success: true,
      status: 'success',
      totalPayments,
      totalStatements: settlementsResult.length,
      successPaymentCount,
      skippedPaymentCount,
      totalPayout,
      totalCommission,
      settlements: settlementsResult,
    };
  } catch (err) {
    console.error('정산 실행 중 오류:', err);

    const endedAt = new Date();
    if (logId !== null) {
      try {
        await connection.query(
          `UPDATE settlement_logs
              SET ended_at = ?,
                  status = 'failed',
                  message = '정산 실패',
                  error_message = ?
            WHERE id = ?`,
          [endedAt, err.message.slice(0, 1000), logId]
        );
      } catch (logErr) {
        console.error('settlement_logs 업데이트 실패:', logErr);
      }
    }

    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

/**
 * dryRun 계산 전용
 * @param {Array} payments - 결제 목록
 * @returns {Object}
 */
function simulateSettlement(payments) {
  const storeMap = new Map();
  for (const p of payments) {
    if (!storeMap.has(p.store_id)) storeMap.set(p.store_id, []);
    storeMap.get(p.store_id).push(p);
  }

  const settlements = [];
  for (const [storeId, list] of storeMap.entries()) {
    const totalSales = list.reduce((sum, p) => sum + p.amount_total, 0);
    if (totalSales <= 0) continue;

    const commissionAmount = Math.floor(totalSales * PLATFORM_COMMISSION_RATE);
    const payoutAmount = totalSales - commissionAmount;

    settlements.push({
      storeId,
      statementId: null,
      totalSales,
      commissionAmount,
      payoutAmount,
      paymentsCount: list.length,
    });
  }

  return {
    totalStatements: settlements.length,
    settlements,
  };
}

/**
 * settlement_errors 에 에러 기록 헬퍼
 * @param {Object} connection - DB 커넥션
 * @param {Object} params - 에러 정보
 */
async function logSettlementError(
  connection,
  { 
    settlementLogId = null,
    type, 
    paymentId = null, 
    storeId = null, 
    statementId = null, 
    message = '', 
    rawData = null 
  }
) {
  try {
    await connection.query(
      `INSERT INTO settlement_errors (
          settlement_log_id, type, payment_id, store_id, statement_id,
          message, raw_data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        settlementLogId,
        type, 
        paymentId, 
        storeId, 
        statementId, 
        message, 
        rawData ? JSON.stringify(rawData) : null
      ]
    );
  } catch (e) {
    console.error('settlement_errors INSERT 실패:', e);
    // 여기서 throw 하지 않음 (에러 로깅 실패 때문에 전체 정산을 더 망치지는 않기 위함)
  }
}
