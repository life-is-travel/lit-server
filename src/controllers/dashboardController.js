/**
 * 대시보드 컨트롤러
 * Phase 3 - 대시보드 요약 정보 API
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';

/**
 * 대시보드 요약 정보 조회
 * GET /api/dashboard/summary
 */
export const getDashboardSummary = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정

    // 1. 점포 정보 조회
    const stores = await query(
      'SELECT business_name FROM stores WHERE id = ? LIMIT 1',
      [storeId]
    );

    if (!stores || stores.length === 0) {
      return res.status(404).json(
        error('STORE_NOT_FOUND', '점포를 찾을 수 없습니다')
      );
    }

    const storeName = stores[0].business_name;

    // 2. 예약 통계 조회
    const reservationStats = await query(
      `SELECT
        COUNT(*) as totalReservations,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pendingReservations,
        SUM(CASE WHEN status = 'active' OR status = 'approved' THEN 1 ELSE 0 END) as activeReservations,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completedReservations,
        SUM(CASE WHEN DATE(created_at) = CURDATE() THEN 1 ELSE 0 END) as todayReservations
      FROM reservations
      WHERE store_id = ?`,
      [storeId]
    );

    const {
      totalReservations = 0,
      pendingReservations = 0,
      activeReservations = 0,
      completedReservations = 0,
      todayReservations = 0,
    } = reservationStats[0] || {};

    // 3. 매출 통계 조회
    const revenueStats = await query(
      `SELECT
        COALESCE(SUM(total_amount), 0) as totalRevenue,
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN total_amount ELSE 0 END), 0) as todayRevenue
      FROM reservations
      WHERE store_id = ? AND payment_status = 'paid'`,
      [storeId]
    );

    const {
      totalRevenue = 0,
      todayRevenue = 0,
    } = revenueStats[0] || {};

    // 4. 보관함 통계 조회
    const storageStats = await query(
      `SELECT
        COUNT(*) as totalStorages,
        SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) as availableStorages,
        SUM(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as occupiedStorages
      FROM storages
      WHERE store_id = ?`,
      [storeId]
    );

    const {
      totalStorages = 0,
      availableStorages = 0,
      occupiedStorages = 0,
    } = storageStats[0] || {};

    // 점유율 계산
    const occupancyRate = totalStorages > 0
      ? (occupiedStorages / totalStorages)
      : 0;

    // 5. 점포 생성일/수정일 조회
    const storeInfo = await query(
      'SELECT created_at, updated_at FROM stores WHERE id = ? LIMIT 1',
      [storeId]
    );

    const createdAt = storeInfo[0]?.created_at || new Date();
    const updatedAt = storeInfo[0]?.updated_at || new Date();

    // 6. 응답 데이터 구성
    const responseData = {
      storeName: storeName || '',
      totalReservations: Number(totalReservations),
      pendingReservations: Number(pendingReservations),
      activeReservations: Number(activeReservations),
      completedReservations: Number(completedReservations),
      todayReservations: Number(todayReservations),
      totalRevenue: Number(totalRevenue),
      todayRevenue: Number(todayRevenue),
      totalStorages: Number(totalStorages),
      availableStorages: Number(availableStorages),
      occupiedStorages: Number(occupiedStorages),
      occupancyRate: Number(occupancyRate.toFixed(2)),
      createdAt: createdAt ? (createdAt instanceof Date ? createdAt.toISOString() : createdAt) : new Date().toISOString(),
      updatedAt: updatedAt ? (updatedAt instanceof Date ? updatedAt.toISOString() : updatedAt) : new Date().toISOString(),
    };

    console.log('[getDashboardSummary] 응답 데이터:', JSON.stringify(responseData, null, 2));

    return res.json(
      success(
        responseData,
        '대시보드 요약 정보 조회 성공'
      )
    );
  } catch (err) {
    console.error('대시보드 요약 정보 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 대시보드 통계 조회
 * GET /api/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    const storeId = req.storeId;
    const { period = 'monthly' } = req.query; // daily, weekly, monthly, yearly

    // 기간 설정
    let dateFilter = '';
    let startDate, endDate;

    switch (period) {
      case 'daily':
        dateFilter = 'DATE(created_at) = CURDATE()';
        startDate = new Date();
        endDate = new Date();
        break;
      case 'weekly':
        dateFilter = 'created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)';
        startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        endDate = new Date();
        break;
      case 'yearly':
        dateFilter = 'YEAR(created_at) = YEAR(NOW())';
        startDate = new Date(new Date().getFullYear(), 0, 1);
        endDate = new Date(new Date().getFullYear(), 11, 31);
        break;
      case 'monthly':
      default:
        dateFilter = 'YEAR(created_at) = YEAR(NOW()) AND MONTH(created_at) = MONTH(NOW())';
        startDate = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
        endDate = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
        break;
    }

    // 매출 통계
    const revenueQuery = `
      SELECT
        COALESCE(SUM(total_amount), 0) as total,
        COALESCE(AVG(total_amount), 0) as average,
        COUNT(*) as count
      FROM reservations
      WHERE store_id = ? AND payment_status = 'paid' AND ${dateFilter}
    `;

    const revenueResult = await query(revenueQuery, [storeId]);
    const revenue = {
      total: Number(revenueResult[0]?.total || 0),
      average: Number(revenueResult[0]?.average || 0),
      growth: 0, // TODO: 이전 기간과 비교하여 계산
    };

    // 예약 통계
    const reservationQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled
      FROM reservations
      WHERE store_id = ? AND ${dateFilter}
    `;

    const reservationResult = await query(reservationQuery, [storeId]);
    const total = Number(reservationResult[0]?.total || 0);
    const completed = Number(reservationResult[0]?.completed || 0);
    const cancelled = Number(reservationResult[0]?.cancelled || 0);

    const reservations = {
      total,
      completed,
      cancelled,
      completionRate: total > 0 ? Number(((completed / total) * 100).toFixed(1)) : 0,
    };

    // 점유율 통계 (평균)
    const occupancyQuery = `
      SELECT
        AVG(CASE WHEN status = 'occupied' THEN 1 ELSE 0 END) as average
      FROM storages
      WHERE store_id = ?
    `;

    const occupancyResult = await query(occupancyQuery, [storeId]);
    const occupancy = {
      average: Number(occupancyResult[0]?.average || 0).toFixed(2),
      peak: 0.95, // TODO: 실제 최고 점유율 계산
      peakTime: null, // TODO: 최고 점유율 시간 계산
    };

    // 고객 만족도 통계
    const reviewQuery = `
      SELECT
        COALESCE(AVG(rating), 0) as averageRating,
        COUNT(*) as totalReviews,
        SUM(CASE WHEN response IS NOT NULL THEN 1 ELSE 0 END) as responded
      FROM reviews
      WHERE store_id = ?
    `;

    const reviewResult = await query(reviewQuery, [storeId]);
    const totalReviews = Number(reviewResult[0]?.totalReviews || 0);
    const responded = Number(reviewResult[0]?.responded || 0);

    const customerSatisfaction = {
      averageRating: Number(reviewResult[0]?.averageRating || 0).toFixed(1),
      totalReviews,
      responseRate: totalReviews > 0 ? Number(((responded / totalReviews) * 100).toFixed(1)) : 0,
    };

    return res.json(
      success(
        {
          period,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
          revenue,
          reservations,
          occupancy,
          customerSatisfaction,
        },
        '대시보드 통계 조회 성공'
      )
    );
  } catch (err) {
    console.error('대시보드 통계 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 실시간 대시보드 데이터 조회
 * GET /api/dashboard/realtime
 */
export const getDashboardRealtime = async (req, res) => {
  try {
    const storeId = req.storeId;

    // 현재 점포 상태
    const statusResult = await query(
      'SELECT status FROM store_status WHERE store_id = ? LIMIT 1',
      [storeId]
    );

    const storeStatus = statusResult[0]?.status || 'closed';

    // 현재 활성 예약 수
    const activeReservations = await query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE store_id = ? AND (status = 'active' OR status = 'approved')`,
      [storeId]
    );

    // 대기 중인 예약 수
    const pendingReservations = await query(
      `SELECT COUNT(*) as count FROM reservations
       WHERE store_id = ? AND status = 'pending'`,
      [storeId]
    );

    // 오늘 매출
    const todayRevenue = await query(
      `SELECT COALESCE(SUM(total_amount), 0) as revenue
       FROM reservations
       WHERE store_id = ? AND DATE(created_at) = CURDATE() AND payment_status = 'paid'`,
      [storeId]
    );

    // 현재 점유 보관함 수
    const occupiedStorages = await query(
      `SELECT COUNT(*) as count FROM storages
       WHERE store_id = ? AND status = 'occupied'`,
      [storeId]
    );

    // 사용 가능한 보관함 수
    const availableStorages = await query(
      `SELECT COUNT(*) as count FROM storages
       WHERE store_id = ? AND status = 'available'`,
      [storeId]
    );

    // 읽지 않은 알림 수
    const unreadNotifications = await query(
      `SELECT COUNT(*) as count FROM notifications
       WHERE store_id = ? AND is_read = 0`,
      [storeId]
    );

    return res.json(
      success(
        {
          storeStatus,
          activeReservations: Number(activeReservations[0]?.count || 0),
          pendingReservations: Number(pendingReservations[0]?.count || 0),
          todayRevenue: Number(todayRevenue[0]?.revenue || 0),
          occupiedStorages: Number(occupiedStorages[0]?.count || 0),
          availableStorages: Number(availableStorages[0]?.count || 0),
          unreadNotifications: Number(unreadNotifications[0]?.count || 0),
          lastUpdated: new Date(),
        },
        '실시간 대시보드 데이터 조회 성공'
      )
    );
  } catch (err) {
    console.error('실시간 대시보드 데이터 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};
