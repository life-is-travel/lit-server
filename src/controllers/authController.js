/**
 * 인증 컨트롤러
 */

import { success, error } from '../utils/response.js';
import { isValidEmail, isValidPassword } from '../utils/validation.js';
import {
  generateVerificationCode,
  saveVerificationCode,
  verifyCode,
} from '../utils/emailVerification.js';
import { sendVerificationEmail } from '../config/email.js';
import { query } from '../config/database.js';
import { hashPassword, comparePassword } from '../utils/password.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/jwt.js';
import { generateStoreId } from '../utils/generateId.js';

/**
 * 이메일 인증 코드 발송
 * POST /api/auth/email/send-verification
 */
export const sendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    // 이메일 검증
    if (!email || !email.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '이메일이 필요합니다', {
          field: 'email',
        })
      );
    }

    if (!isValidEmail(email)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '올바른 이메일 형식이 아닙니다', {
          field: 'email',
        })
      );
    }

    // 이미 등록된 이메일인지 확인
    const existingStores = await query(
      'SELECT id FROM stores WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingStores && existingStores.length > 0) {
      return res.status(400).json(
        error('EMAIL_ALREADY_EXISTS', '이미 등록된 이메일입니다', {
          email,
        })
      );
    }

    // 인증 코드 생성
    const code = generateVerificationCode();

    // DB에 저장
    const saveResult = await saveVerificationCode(email, code);
    if (!saveResult.success) {
      return res.status(500).json(
        error('DATABASE_ERROR', saveResult.error || '인증 코드 저장 실패')
      );
    }

    // 이메일 발송
    const emailResult = await sendVerificationEmail(email, code);
    if (!emailResult.success) {
      return res.status(500).json(
        error('EMAIL_SEND_ERROR', emailResult.error || '이메일 발송 실패')
      );
    }

    return res.json(
      success(
        {
          email,
          expiresIn: 180, // 3분
        },
        '인증 코드가 이메일로 발송되었습니다'
      )
    );
  } catch (err) {
    console.error('인증 코드 발송 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 이메일 인증 코드 검증
 * POST /api/auth/email/verify-code
 */
export const verifyVerificationCode = async (req, res) => {
  try {
    const { email, code } = req.body;

    // 입력 검증
    if (!email || !email.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '이메일이 필요합니다', {
          field: 'email',
        })
      );
    }

    if (!code || !code.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '인증 코드가 필요합니다', {
          field: 'code',
        })
      );
    }

    if (!isValidEmail(email)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '올바른 이메일 형식이 아닙니다', {
          field: 'email',
        })
      );
    }

    // 코드 검증
    const verifyResult = await verifyCode(email, code);

    if (!verifyResult.success) {
      return res.status(400).json(
        error('VERIFICATION_FAILED', verifyResult.error || '인증 코드 검증 실패', {
          email,
        })
      );
    }

    return res.json(
      success(
        {
          verified: true,
          email,
        },
        '이메일 인증이 완료되었습니다'
      )
    );
  } catch (err) {
    console.error('인증 코드 검증 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 회원가입
 * POST /api/auth/register
 */
export const register = async (req, res) => {
  try {
    const {
      email,
      password,
      phoneNumber,
      businessNumber,
      businessName,
      representativeName,
      address,
      detailAddress,
      latitude,
      longitude,
      businessType,
      description,
    } = req.body;

    // 필수 필드 검증
    if (!email || !email.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '이메일이 필요합니다', { field: 'email' })
      );
    }

    if (!isValidEmail(email)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '올바른 이메일 형식이 아닙니다', {
          field: 'email',
        })
      );
    }

    if (!password || !password.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '비밀번호가 필요합니다', {
          field: 'password',
        })
      );
    }

    if (!isValidPassword(password)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '비밀번호는 8자 이상이어야 합니다', {
          field: 'password',
        })
      );
    }

    if (!businessName || !businessName.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '사업자명이 필요합니다', { field: 'businessName' })
      );
    }

    // 1. 이메일 인증 확인
    const verificationRecords = await query(
      'SELECT email, is_verified FROM email_verifications WHERE email = ? ORDER BY created_at DESC LIMIT 1',
      [email]
    );

    if (!verificationRecords || verificationRecords.length === 0) {
      return res.status(400).json(
        error('EMAIL_NOT_VERIFIED', '이메일 인증이 필요합니다', { email })
      );
    }

    if (!verificationRecords[0].is_verified) {
      return res.status(400).json(
        error('EMAIL_NOT_VERIFIED', '이메일 인증이 완료되지 않았습니다', {
          email,
        })
      );
    }

    // 2. 이메일 중복 확인
    const existingStores = await query(
      'SELECT id FROM stores WHERE email = ? LIMIT 1',
      [email]
    );

    if (existingStores && existingStores.length > 0) {
      return res.status(400).json(
        error('EMAIL_ALREADY_EXISTS', '이미 등록된 이메일입니다', { email })
      );
    }

    // 3. 사업자 등록번호 중복 확인
    if (businessNumber) {
      const existingBusinessNumber = await query(
        'SELECT id FROM stores WHERE business_number = ? LIMIT 1',
        [businessNumber]
      );

      if (existingBusinessNumber && existingBusinessNumber.length > 0) {
        return res.status(400).json(
          error('BUSINESS_NUMBER_ALREADY_EXISTS', '이미 등록된 사업자 등록번호입니다', { businessNumber })
        );
      }
    }

    // 4. 비밀번호 해싱
    const passwordHash = await hashPassword(password);

    // 4. 점포 ID 생성
    const storeId = generateStoreId();

    // 5. 점포 정보 저장
    await query(
      `INSERT INTO stores (
        id, email, password_hash, phone_number,
        business_number, business_name, representative_name,
        address, detail_address, latitude, longitude,
        business_type, description, has_completed_setup,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [
        storeId,
        email,
        passwordHash,
        phoneNumber || null,
        businessNumber || null,
        businessName,
        representativeName || null,
        address || null,
        detailAddress || null,
        latitude || null,
        longitude || null,
        businessType || null,
        description || null,
        false, // has_completed_setup
      ]
    );

    // 6. 초기 store_status 생성
    await query(
      `INSERT INTO store_status (
        store_id, status, reason, created_at, updated_at
      ) VALUES (?, ?, ?, NOW(), NOW())`,
      [storeId, 'closed', '신규 가입']
    );

    // 7. 초기 store_settings 생성
    await query(
      `INSERT INTO store_settings (
        store_id, created_at, updated_at
      ) VALUES (?, NOW(), NOW())`,
      [storeId]
    );

    // 8. JWT 토큰 발급
    const accessToken = generateAccessToken(storeId, email);
    const refreshToken = generateRefreshToken(storeId, email);

    // 9. Refresh Token 저장
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30일 후

    await query(
      `INSERT INTO refresh_tokens (
        store_id, token, expires_at, created_at
      ) VALUES (?, ?, ?, NOW())`,
      [storeId, refreshToken, expiresAt]
    );

    // 10. 생성된 store 정보 조회 (created_at, updated_at 포함)
    const createdStores = await query(
      `SELECT id, email, phone_number, business_number,
              business_name, representative_name, address, detail_address,
              latitude, longitude, business_type, description,
              has_completed_setup, created_at, updated_at
       FROM stores
       WHERE id = ?
       LIMIT 1`,
      [storeId]
    );

    const createdStore = createdStores[0];

    // 11. 응답 (로그인과 동일한 형식)
    return res.status(201).json(
      success(
        {
          token: accessToken,
          refreshToken: refreshToken,
          expiresIn: 3600, // 1시간 (초 단위)
          user_info: {
            id: createdStore.id,
            storeId: createdStore.id,
            email: createdStore.email,
            businessName: createdStore.business_name,
            phoneNumber: createdStore.phone_number,
            businessType: createdStore.business_type,
            hasCompletedSetup: Boolean(createdStore.has_completed_setup), // MySQL int -> boolean
            businessNumber: createdStore.business_number,
            businessName: createdStore.business_name,
            representativeName: createdStore.representative_name,
            address: createdStore.address,
            detailAddress: createdStore.detail_address,
            latitude: createdStore.latitude != null ? Number(createdStore.latitude) : null,
            longitude: createdStore.longitude != null ? Number(createdStore.longitude) : null,
            description: createdStore.description,
            createdAt: createdStore.created_at,
            updatedAt: createdStore.updated_at,
          },
        },
        '회원가입이 완료되었습니다'
      )
    );
  } catch (err) {
    console.error('회원가입 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 로그인
 * POST /api/auth/login
 */
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 입력 검증
    if (!email || !email.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '이메일이 필요합니다', { field: 'email' })
      );
    }

    if (!isValidEmail(email)) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '올바른 이메일 형식이 아닙니다', {
          field: 'email',
        })
      );
    }

    if (!password || !password.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', '비밀번호가 필요합니다', {
          field: 'password',
        })
      );
    }

    // 1. 사용자 조회
    const stores = await query(
      `SELECT
        id, email, password_hash, phone_number,
        business_number, business_name, representative_name,
        address, detail_address, latitude, longitude,
        business_type, description, has_completed_setup,
        created_at, updated_at
      FROM stores
      WHERE email = ?
      LIMIT 1`,
      [email]
    );

    if (!stores || stores.length === 0) {
      return res.status(401).json(
        error('AUTHENTICATION_FAILED', '이메일 또는 비밀번호가 일치하지 않습니다')
      );
    }

    const store = stores[0];

    // 2. 비밀번호 확인
    const isPasswordValid = await comparePassword(password, store.password_hash);

    if (!isPasswordValid) {
      return res.status(401).json(
        error('AUTHENTICATION_FAILED', '이메일 또는 비밀번호가 일치하지 않습니다')
      );
    }

    // 3. JWT 토큰 발급
    const accessToken = generateAccessToken(store.id, store.email);
    const refreshToken = generateRefreshToken(store.id, store.email);

    // 4. Refresh Token 저장
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30일 후

    await query(
      `INSERT INTO refresh_tokens (
        store_id, token, expires_at, created_at
      ) VALUES (?, ?, ?, NOW())`,
      [store.id, refreshToken, expiresAt]
    );

    // 5. 응답 (비밀번호 해시 제외)
    delete store.password_hash;

    return res.json(
      success(
        {
          token: accessToken,
          refreshToken: refreshToken,
          expiresIn: 3600, // 1시간 (초 단위)
          user_info: {
            id: store.id,
            storeId: store.id, // Flutter가 기대하는 필드명
            email: store.email,
            businessName: store.business_name,
            phoneNumber: store.phone_number,
            businessType: store.business_type,
            hasCompletedSetup: Boolean(store.has_completed_setup), // MySQL int(0/1) -> boolean 변환
            businessNumber: store.business_number,
            businessName: store.business_name,
            representativeName: store.representative_name,
            address: store.address,
            detailAddress: store.detail_address,
            latitude: store.latitude != null ? Number(store.latitude) : null,
            longitude: store.longitude != null ? Number(store.longitude) : null,
            description: store.description,
            createdAt: store.created_at,
            updatedAt: store.updated_at,
          },
        },
        '로그인에 성공했습니다'
      )
    );
  } catch (err) {
    console.error('로그인 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 로그아웃
 * POST /api/auth/logout
 */
export const logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Refresh Token 검증
    if (!refreshToken || !refreshToken.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', 'Refresh Token이 필요합니다', {
          field: 'refreshToken',
        })
      );
    }

    // DB에서 Refresh Token 삭제
    const result = await query(
      'DELETE FROM refresh_tokens WHERE token = ?',
      [refreshToken]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json(
        error('TOKEN_NOT_FOUND', '유효하지 않은 Refresh Token입니다')
      );
    }

    return res.json(
      success(
        {
          message: '로그아웃이 완료되었습니다',
        },
        '로그아웃에 성공했습니다'
      )
    );
  } catch (err) {
    console.error('로그아웃 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};

/**
 * 토큰 갱신
 * POST /api/auth/refresh
 */
export const refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    // Refresh Token 검증
    if (!refreshToken || !refreshToken.trim()) {
      return res.status(400).json(
        error('VALIDATION_ERROR', 'Refresh Token이 필요합니다', {
          field: 'refreshToken',
        })
      );
    }

    // 1. Refresh Token 검증 (JWT)
    const verifyResult = verifyRefreshToken(refreshToken);

    if (!verifyResult.valid) {
      return res.status(401).json(
        error('TOKEN_INVALID', 'Refresh Token이 유효하지 않습니다', {
          message: verifyResult.error,
        })
      );
    }

    // 2. DB에서 Refresh Token 확인
    const tokens = await query(
      `SELECT store_id, expires_at
       FROM refresh_tokens
       WHERE token = ?
       LIMIT 1`,
      [refreshToken]
    );

    if (!tokens || tokens.length === 0) {
      return res.status(401).json(
        error('TOKEN_NOT_FOUND', 'Refresh Token을 찾을 수 없습니다')
      );
    }

    const tokenData = tokens[0];

    // 3. 만료 시간 확인
    const now = new Date();
    const expiresAt = new Date(tokenData.expires_at);

    if (now > expiresAt) {
      // 만료된 토큰 삭제
      await query('DELETE FROM refresh_tokens WHERE token = ?', [refreshToken]);

      return res.status(401).json(
        error('TOKEN_EXPIRED', 'Refresh Token이 만료되었습니다')
      );
    }

    // 4. 사용자 정보 조회
    const stores = await query(
      'SELECT id, email FROM stores WHERE id = ? LIMIT 1',
      [tokenData.store_id]
    );

    if (!stores || stores.length === 0) {
      return res.status(404).json(
        error('STORE_NOT_FOUND', '점포를 찾을 수 없습니다')
      );
    }

    const store = stores[0];

    // 5. 새로운 Access Token 발급
    const newAccessToken = generateAccessToken(store.id, store.email);

    // 6. 응답
    return res.json(
      success(
        {
          token: newAccessToken,
          expiresIn: 3600, // 1시간 (초 단위)
        },
        '토큰이 갱신되었습니다'
      )
    );
  } catch (err) {
    console.error('토큰 갱신 중 에러:', err);
    return res.status(500).json(
      error('INTERNAL_ERROR', '서버 오류가 발생했습니다', {
        message: err.message,
      })
    );
  }
};
