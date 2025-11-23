/**
 * 점포 관리 컨트롤러
 */

import { success, error } from '../utils/response.js';
import { query } from '../config/database.js';

/**
 * 점포 상태 조회
 * GET /api/store/status
 */
export const getStoreStatus = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정

    // 점포 상태 조회
    const statuses = await query(
      `SELECT store_id, status, reason, created_at, updated_at
       FROM store_status
       WHERE store_id = ?
       LIMIT 1`,
      [storeId]
    );

    if (!statuses || statuses.length === 0) {
      // 상태가 없으면 기본 상태 반환
      return res.json(
        success(
          {
            storeId,
            status: 'closed',
            reason: null,
          },
          '점포 상태 조회 성공 (기본값)'
        )
      );
    }

    const status = statuses[0];

    return res.json(
      success(
        {
          storeId: status.store_id,
          status: status.status,
          reason: status.reason,
          lastUpdated: status.updated_at || status.created_at,
        },
        '점포 상태 조회 성공'
      )
    );
  } catch (err) {
    console.error('점포 상태 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 점포 상태 변경
 * PUT /api/store/status
 */
export const updateStoreStatus = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정
    const { status: newStatus, reason } = req.body;

    // 상태값 검증
    const validStatuses = ['open', 'closed', 'temporarily_closed'];
    if (!newStatus || !validStatuses.includes(newStatus)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '유효한 상태값이 필요합니다 (open, closed, temporarily_closed)', {
          field: 'status',
          validValues: validStatuses,
        })
      );
    }

    // 기존 상태 확인
    const existingStatuses = await query(
      'SELECT id FROM store_status WHERE store_id = ? LIMIT 1',
      [storeId]
    );

    if (existingStatuses && existingStatuses.length > 0) {
      // 업데이트
      await query(
        `UPDATE store_status
         SET status = ?, reason = ?, updated_at = NOW()
         WHERE store_id = ?`,
        [newStatus, reason || null, storeId]
      );
    } else {
      // 새로 생성
      await query(
        `INSERT INTO store_status (store_id, status, reason, created_at, updated_at)
         VALUES (?, ?, ?, NOW(), NOW())`,
        [storeId, newStatus, reason || null]
      );
    }

    // 업데이트된 상태 조회
    const statuses = await query(
      `SELECT store_id, status, reason, created_at, updated_at
       FROM store_status
       WHERE store_id = ?
       LIMIT 1`,
      [storeId]
    );

    const status = statuses[0];

    return res.json(
      success(
        {
          storeId: status.store_id,
          status: status.status,
          reason: status.reason,
          lastUpdated: status.updated_at || status.created_at,
        },
        '점포 상태 변경 성공'
      )
    );
  } catch (err) {
    console.error('점포 상태 변경 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 점포 정보 조회
 * GET /api/store
 */
export const getStoreInfo = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정

    // 점포 정보 조회
    const stores = await query(
      `SELECT
        id, email, phone_number, business_number,
        business_name, representative_name, address, detail_address,
        latitude, longitude, business_type, description,
        has_completed_setup, created_at, updated_at
      FROM stores
      WHERE id = ?
      LIMIT 1`,
      [storeId]
    );

    if (!stores || stores.length === 0) {
      return res.status(404).json(
        error('STORE_NOT_FOUND', '점포를 찾을 수 없습니다')
      );
    }

    const store = stores[0];

    return res.json(
      success(
        {
          id: store.id,
          email: store.email,
          businessName: store.business_name,
          phoneNumber: store.phone_number,
          businessNumber: store.business_number,
          businessName: store.business_name,
          representativeName: store.representative_name,
          address: store.address,
          detailAddress: store.detail_address,
          latitude: store.latitude != null ? Number(store.latitude) : null,
          longitude: store.longitude != null ? Number(store.longitude) : null,
          businessType: store.business_type,
          description: store.description,
          hasCompletedSetup: Boolean(store.has_completed_setup), // MySQL int -> boolean 변환
          createdAt: store.created_at,
          updatedAt: store.updated_at,
        },
        '점포 정보 조회 성공'
      )
    );
  } catch (err) {
    console.error('점포 정보 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 점포 정보 수정
 * PUT /api/store
 */
export const updateStoreInfo = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정
    const {
      name,
      phoneNumber,
      address,
      detailAddress,
      latitude,
      longitude,
      description,
      hasCompletedSetup,
    } = req.body;

    // 수정할 필드만 동적으로 업데이트
    const updates = [];
    const values = [];

    if (name !== undefined) {
      updates.push('name = ?');
      values.push(name);
    }
    if (phoneNumber !== undefined) {
      updates.push('phone_number = ?');
      values.push(phoneNumber);
    }
    if (address !== undefined) {
      updates.push('address = ?');
      values.push(address);
    }
    if (detailAddress !== undefined) {
      updates.push('detail_address = ?');
      values.push(detailAddress);
    }
    if (latitude !== undefined) {
      updates.push('latitude = ?');
      values.push(latitude);
    }
    if (longitude !== undefined) {
      updates.push('longitude = ?');
      values.push(longitude);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (hasCompletedSetup !== undefined) {
      updates.push('has_completed_setup = ?');
      values.push(hasCompletedSetup);
    }

    if (updates.length === 0) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '수정할 정보가 없습니다')
      );
    }

    // updated_at 추가
    updates.push('updated_at = NOW()');
    values.push(storeId);

    // 업데이트 실행
    await query(
      `UPDATE stores SET ${updates.join(', ')} WHERE id = ?`,
      values
    );

    // 업데이트된 정보 조회
    const stores = await query(
      `SELECT
        id, email, phone_number, business_number,
        business_name, representative_name, address, detail_address,
        latitude, longitude, business_type, description,
        has_completed_setup, created_at, updated_at
      FROM stores
      WHERE id = ?
      LIMIT 1`,
      [storeId]
    );

    const store = stores[0];

    return res.json(
      success(
        {
          id: store.id,
          email: store.email,
          businessName: store.business_name,
          phoneNumber: store.phone_number,
          businessNumber: store.business_number,
          representativeName: store.representative_name,
          address: store.address,
          detailAddress: store.detail_address,
          latitude: store.latitude != null ? Number(store.latitude) : null,
          longitude: store.longitude != null ? Number(store.longitude) : null,
          businessType: store.business_type,
          description: store.description,
          hasCompletedSetup: Boolean(store.has_completed_setup), // MySQL int -> boolean 변환
          createdAt: store.created_at,
          updatedAt: store.updated_at,
        },
        '점포 정보 수정 성공'
      )
    );
  } catch (err) {
    console.error('점포 정보 수정 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 점포 설정 조회 (전체 설정 통합 조회)
 * GET /api/store/settings
 * Flutter의 StoreSettings 모델 형식으로 응답
 */
export const getStoreSettings = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정

    // 1. store_operating_hours에서 운영시간 조회
    const hours = await query(
      `SELECT * FROM store_operating_hours WHERE store_id = ? LIMIT 1`,
      [storeId]
    );

    // 2. store_settings에서 가격/보관/알림 설정 및 카테고리 조회
    const settings = await query(
      `SELECT * FROM store_settings WHERE store_id = ? LIMIT 1`,
      [storeId]
    );

    // 3. Flutter 형식으로 변환
    const operationSettings = hours && hours.length > 0 ? {
      operatingDays: {
        '월': Boolean(hours[0].monday_operating),
        '화': Boolean(hours[0].tuesday_operating),
        '수': Boolean(hours[0].wednesday_operating),
        '목': Boolean(hours[0].thursday_operating),
        '금': Boolean(hours[0].friday_operating),
        '토': Boolean(hours[0].saturday_operating),
        '일': Boolean(hours[0].sunday_operating),
      },
      openTime: hours[0].monday_open || '9:0',
      closeTime: hours[0].monday_close || '22:0',
      dailyHours: {
        '월': { openTime: hours[0].monday_open || '9:0', closeTime: hours[0].monday_close || '22:0', isOperating: Boolean(hours[0].monday_operating) },
        '화': { openTime: hours[0].tuesday_open || '9:0', closeTime: hours[0].tuesday_close || '22:0', isOperating: Boolean(hours[0].tuesday_operating) },
        '수': { openTime: hours[0].wednesday_open || '9:0', closeTime: hours[0].wednesday_close || '22:0', isOperating: Boolean(hours[0].wednesday_operating) },
        '목': { openTime: hours[0].thursday_open || '9:0', closeTime: hours[0].thursday_close || '22:0', isOperating: Boolean(hours[0].thursday_operating) },
        '금': { openTime: hours[0].friday_open || '9:0', closeTime: hours[0].friday_close || '22:0', isOperating: Boolean(hours[0].friday_operating) },
        '토': { openTime: hours[0].saturday_open || '9:0', closeTime: hours[0].saturday_close || '22:0', isOperating: Boolean(hours[0].saturday_operating) },
        '일': { openTime: hours[0].sunday_open || '9:0', closeTime: hours[0].sunday_close || '22:0', isOperating: Boolean(hours[0].sunday_operating) },
      },
      totalSlots: settings && settings.length > 0 ? settings[0].total_slots : 20,
      dailyRateThreshold: settings && settings.length > 0 ? settings[0].daily_rate_threshold : 7,
      autoApproval: settings && settings.length > 0 ? Boolean(settings[0].auto_approval) : false,
      autoOverdueNotification: settings && settings.length > 0 ? Boolean(settings[0].auto_overdue_notification) : true,
      holidayNotice: hours[0].holiday_notice,
      holidayStartDate: hours[0].holiday_start_date,
      holidayEndDate: hours[0].holiday_end_date,
    } : null;

    const storageSettings = settings && settings.length > 0 ? {
      small: {
        hourlyRate: settings[0].small_hourly_rate,
        dailyRate: settings[0].small_daily_rate,
        hourUnit: settings[0].small_hour_unit,
        maxCapacity: settings[0].small_max_capacity,
      },
      medium: {
        hourlyRate: settings[0].medium_hourly_rate,
        dailyRate: settings[0].medium_daily_rate,
        hourUnit: settings[0].medium_hour_unit,
        maxCapacity: settings[0].medium_max_capacity,
      },
      large: {
        hourlyRate: settings[0].large_hourly_rate,
        dailyRate: settings[0].large_daily_rate,
        hourUnit: settings[0].large_hour_unit,
        maxCapacity: settings[0].large_max_capacity,
      },
      isSmallEnabled: Boolean(settings[0].small_enabled),
      isMediumEnabled: Boolean(settings[0].medium_enabled),
      isLargeEnabled: Boolean(settings[0].large_enabled),
      refrigerationAvailable: Boolean(settings[0].refrigeration_available),
      refrigerationExtraFee: settings[0].refrigeration_extra_fee,
      refrigerationMaxCapacity: settings[0].refrigeration_max_capacity,
    } : null;

    const notificationSettings = settings && settings.length > 0 ? {
      newReservationNotification: Boolean(settings[0].new_reservation_notification),
      checkoutReminderNotification: Boolean(settings[0].checkout_reminder_notification),
      overdueNotification: Boolean(settings[0].overdue_notification),
      systemNotification: Boolean(settings[0].system_notification),
    } : null;

    // 카테고리 데이터 파싱 (JSON 컬럼)
    let categories = [];
    if (settings && settings.length > 0 && settings[0].categories) {
      try {
        categories = typeof settings[0].categories === 'string'
          ? JSON.parse(settings[0].categories)
          : settings[0].categories;
      } catch (e) {
        console.error('[getStoreSettings] 카테고리 파싱 실패:', e);
        categories = [];
      }
    }

    return res.json(
      success(
        {
          storeId,
          basicInfo: { storePhotos: [] }, // 추후 구현
          operationSettings,
          storageSettings,
          notificationSettings,
          categories,
        },
        '점포 설정 조회 성공'
      )
    );
  } catch (err) {
    console.error('점포 설정 조회 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 점포 설정 수정 (전체 설정 통합 저장)
 * PUT /api/store/settings
 * Flutter의 StoreSettings 모델 전체를 받아서 여러 테이블에 분산 저장
 */
export const updateStoreSettings = async (req, res) => {
  try {
    const storeId = req.storeId; // auth 미들웨어에서 설정
    const {
      basicInfo,
      operationSettings,
      storageSettings,
      notificationSettings,
      categories,
    } = req.body;

    console.log('[updateStoreSettings] 요청 데이터:', JSON.stringify(req.body, null, 2));

    // 1. stores 테이블 업데이트 - 초기 설정 완료 표시
    await query(
      `UPDATE stores SET has_completed_setup = 1, updated_at = NOW() WHERE id = ?`,
      [storeId]
    );

    // 2. store_operating_hours 테이블에 운영시간 저장 (operationSettings에서)
    if (operationSettings && operationSettings.dailyHours) {
      const hours = operationSettings.dailyHours;
      const existingHours = await query(
        'SELECT id FROM store_operating_hours WHERE store_id = ? LIMIT 1',
        [storeId]
      );

      const hoursData = {
        monday_open: hours['월']?.openTime || null,
        monday_close: hours['월']?.closeTime || null,
        monday_operating: hours['월']?.isOperating !== false,
        tuesday_open: hours['화']?.openTime || null,
        tuesday_close: hours['화']?.closeTime || null,
        tuesday_operating: hours['화']?.isOperating !== false,
        wednesday_open: hours['수']?.openTime || null,
        wednesday_close: hours['수']?.closeTime || null,
        wednesday_operating: hours['수']?.isOperating !== false,
        thursday_open: hours['목']?.openTime || null,
        thursday_close: hours['목']?.closeTime || null,
        thursday_operating: hours['목']?.isOperating !== false,
        friday_open: hours['금']?.openTime || null,
        friday_close: hours['금']?.closeTime || null,
        friday_operating: hours['금']?.isOperating !== false,
        saturday_open: hours['토']?.openTime || null,
        saturday_close: hours['토']?.closeTime || null,
        saturday_operating: hours['토']?.isOperating !== false,
        sunday_open: hours['일']?.openTime || null,
        sunday_close: hours['일']?.closeTime || null,
        sunday_operating: hours['일']?.isOperating !== false,
        holiday_notice: operationSettings.holidayNotice || null,
        holiday_start_date: operationSettings.holidayStartDate || null,
        holiday_end_date: operationSettings.holidayEndDate || null,
      };

      if (existingHours && existingHours.length > 0) {
        // 업데이트
        await query(
          `UPDATE store_operating_hours
           SET monday_open = ?, monday_close = ?, monday_operating = ?,
               tuesday_open = ?, tuesday_close = ?, tuesday_operating = ?,
               wednesday_open = ?, wednesday_close = ?, wednesday_operating = ?,
               thursday_open = ?, thursday_close = ?, thursday_operating = ?,
               friday_open = ?, friday_close = ?, friday_operating = ?,
               saturday_open = ?, saturday_close = ?, saturday_operating = ?,
               sunday_open = ?, sunday_close = ?, sunday_operating = ?,
               holiday_notice = ?, holiday_start_date = ?, holiday_end_date = ?,
               updated_at = NOW()
           WHERE store_id = ?`,
          [
            hoursData.monday_open, hoursData.monday_close, hoursData.monday_operating,
            hoursData.tuesday_open, hoursData.tuesday_close, hoursData.tuesday_operating,
            hoursData.wednesday_open, hoursData.wednesday_close, hoursData.wednesday_operating,
            hoursData.thursday_open, hoursData.thursday_close, hoursData.thursday_operating,
            hoursData.friday_open, hoursData.friday_close, hoursData.friday_operating,
            hoursData.saturday_open, hoursData.saturday_close, hoursData.saturday_operating,
            hoursData.sunday_open, hoursData.sunday_close, hoursData.sunday_operating,
            hoursData.holiday_notice, hoursData.holiday_start_date, hoursData.holiday_end_date,
            storeId,
          ]
        );
      } else {
        // 새로 생성
        await query(
          `INSERT INTO store_operating_hours (
            store_id,
            monday_open, monday_close, monday_operating,
            tuesday_open, tuesday_close, tuesday_operating,
            wednesday_open, wednesday_close, wednesday_operating,
            thursday_open, thursday_close, thursday_operating,
            friday_open, friday_close, friday_operating,
            saturday_open, saturday_close, saturday_operating,
            sunday_open, sunday_close, sunday_operating,
            holiday_notice, holiday_start_date, holiday_end_date,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [
            storeId,
            hoursData.monday_open, hoursData.monday_close, hoursData.monday_operating,
            hoursData.tuesday_open, hoursData.tuesday_close, hoursData.tuesday_operating,
            hoursData.wednesday_open, hoursData.wednesday_close, hoursData.wednesday_operating,
            hoursData.thursday_open, hoursData.thursday_close, hoursData.thursday_operating,
            hoursData.friday_open, hoursData.friday_close, hoursData.friday_operating,
            hoursData.saturday_open, hoursData.saturday_close, hoursData.saturday_operating,
            hoursData.sunday_open, hoursData.sunday_close, hoursData.sunday_operating,
            hoursData.holiday_notice, hoursData.holiday_start_date, hoursData.holiday_end_date,
          ]
        );
      }
    }

    // 3. store_settings 테이블에 가격/보관/알림 설정 저장
    const existingSettings = await query(
      'SELECT id FROM store_settings WHERE store_id = ? LIMIT 1',
      [storeId]
    );

    const settingsData = {
      // 운영 설정
      total_slots: operationSettings?.totalSlots || 20,
      daily_rate_threshold: operationSettings?.dailyRateThreshold || 7,
      auto_approval: operationSettings?.autoApproval || false,
      auto_overdue_notification: operationSettings?.autoOverdueNotification !== false,

      // 보관함 가격 설정
      small_hourly_rate: storageSettings?.small?.hourlyRate || 2000,
      small_daily_rate: storageSettings?.small?.dailyRate || 15000,
      small_hour_unit: storageSettings?.small?.hourUnit || 1,
      small_max_capacity: storageSettings?.small?.maxCapacity || 5,
      small_enabled: storageSettings?.isSmallEnabled || false,

      medium_hourly_rate: storageSettings?.medium?.hourlyRate || 3000,
      medium_daily_rate: storageSettings?.medium?.dailyRate || 24000,
      medium_hour_unit: storageSettings?.medium?.hourUnit || 1,
      medium_max_capacity: storageSettings?.medium?.maxCapacity || 8,
      medium_enabled: storageSettings?.isMediumEnabled || false,

      large_hourly_rate: storageSettings?.large?.hourlyRate || 5000,
      large_daily_rate: storageSettings?.large?.dailyRate || 40000,
      large_hour_unit: storageSettings?.large?.hourUnit || 1,
      large_max_capacity: storageSettings?.large?.maxCapacity || 3,
      large_enabled: storageSettings?.isLargeEnabled || false,

      // 냉장 보관
      refrigeration_available: storageSettings?.refrigerationAvailable || false,
      refrigeration_extra_fee: storageSettings?.refrigerationExtraFee || 1000,
      refrigeration_max_capacity: storageSettings?.refrigerationMaxCapacity || 3,

      // 알림 설정
      new_reservation_notification: notificationSettings?.newReservationNotification !== false,
      checkout_reminder_notification: notificationSettings?.checkoutReminderNotification !== false,
      overdue_notification: notificationSettings?.overdueNotification !== false,
      system_notification: notificationSettings?.systemNotification !== false,

      // 카테고리 (JSON)
      categories: categories ? JSON.stringify(categories) : null,
    };

    if (existingSettings && existingSettings.length > 0) {
      // 업데이트
      await query(
        `UPDATE store_settings
         SET total_slots = ?, daily_rate_threshold = ?, auto_approval = ?, auto_overdue_notification = ?,
             small_hourly_rate = ?, small_daily_rate = ?, small_hour_unit = ?, small_max_capacity = ?, small_enabled = ?,
             medium_hourly_rate = ?, medium_daily_rate = ?, medium_hour_unit = ?, medium_max_capacity = ?, medium_enabled = ?,
             large_hourly_rate = ?, large_daily_rate = ?, large_hour_unit = ?, large_max_capacity = ?, large_enabled = ?,
             refrigeration_available = ?, refrigeration_extra_fee = ?, refrigeration_max_capacity = ?,
             new_reservation_notification = ?, checkout_reminder_notification = ?, overdue_notification = ?, system_notification = ?,
             categories = ?,
             updated_at = NOW()
         WHERE store_id = ?`,
        [
          settingsData.total_slots, settingsData.daily_rate_threshold, settingsData.auto_approval, settingsData.auto_overdue_notification,
          settingsData.small_hourly_rate, settingsData.small_daily_rate, settingsData.small_hour_unit, settingsData.small_max_capacity, settingsData.small_enabled,
          settingsData.medium_hourly_rate, settingsData.medium_daily_rate, settingsData.medium_hour_unit, settingsData.medium_max_capacity, settingsData.medium_enabled,
          settingsData.large_hourly_rate, settingsData.large_daily_rate, settingsData.large_hour_unit, settingsData.large_max_capacity, settingsData.large_enabled,
          settingsData.refrigeration_available, settingsData.refrigeration_extra_fee, settingsData.refrigeration_max_capacity,
          settingsData.new_reservation_notification, settingsData.checkout_reminder_notification, settingsData.overdue_notification, settingsData.system_notification,
          settingsData.categories,
          storeId,
        ]
      );
    } else {
      // 새로 생성
      await query(
        `INSERT INTO store_settings (
          store_id,
          total_slots, daily_rate_threshold, auto_approval, auto_overdue_notification,
          small_hourly_rate, small_daily_rate, small_hour_unit, small_max_capacity, small_enabled,
          medium_hourly_rate, medium_daily_rate, medium_hour_unit, medium_max_capacity, medium_enabled,
          large_hourly_rate, large_daily_rate, large_hour_unit, large_max_capacity, large_enabled,
          refrigeration_available, refrigeration_extra_fee, refrigeration_max_capacity,
          new_reservation_notification, checkout_reminder_notification, overdue_notification, system_notification,
          categories,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          storeId,
          settingsData.total_slots, settingsData.daily_rate_threshold, settingsData.auto_approval, settingsData.auto_overdue_notification,
          settingsData.small_hourly_rate, settingsData.small_daily_rate, settingsData.small_hour_unit, settingsData.small_max_capacity, settingsData.small_enabled,
          settingsData.medium_hourly_rate, settingsData.medium_daily_rate, settingsData.medium_hour_unit, settingsData.medium_max_capacity, settingsData.medium_enabled,
          settingsData.large_hourly_rate, settingsData.large_daily_rate, settingsData.large_hour_unit, settingsData.large_max_capacity, settingsData.large_enabled,
          settingsData.refrigeration_available, settingsData.refrigeration_extra_fee, settingsData.refrigeration_max_capacity,
          settingsData.new_reservation_notification, settingsData.checkout_reminder_notification, settingsData.overdue_notification, settingsData.system_notification,
          settingsData.categories,
        ]
      );
    }

    // 4. 응답 - Flutter 형식으로 다시 조합
    return res.json(
      success(
        {
          storeId,
          basicInfo: basicInfo || { storePhotos: [] },
          operationSettings,
          storageSettings,
          notificationSettings,
          categories: categories || [],
        },
        '점포 설정 수정 성공'
      )
    );
  } catch (err) {
    console.error('점포 설정 수정 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};
