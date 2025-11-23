/**
 * 이메일 설정 및 발송
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

// 환경변수
const EMAIL_HOST = process.env.EMAIL_HOST || 'smtp.gmail.com';
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || '587');
const EMAIL_SECURE = process.env.EMAIL_SECURE === 'true';
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD;
const EMAIL_FROM = process.env.EMAIL_FROM || 'Lit <noreply@lit.com>';

/**
 * Nodemailer transporter 생성
 * @returns {Object} Nodemailer transporter
 */
export const createTransporter = () => {
  return nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_SECURE,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });
};

// 기본 transporter export (테스트용)
export const transporter = createTransporter();

/**
 * 이메일 인증 코드 발송
 * @param {string} email - 수신자 이메일
 * @param {string} code - 인증 코드
 * @returns {Promise<Object>} { success: boolean, messageId?: string, error?: string }
 */
export const sendVerificationEmail = async (email, code) => {
  try {
    // 입력 검증
    if (!email || !email.trim()) {
      return {
        success: false,
        error: '이메일이 필요합니다',
      };
    }

    if (!code || !code.trim()) {
      return {
        success: false,
        error: '인증 코드가 필요합니다',
      };
    }

    const transporter = createTransporter();

    // 텍스트 이메일
    const textContent = `[Lit] 이메일 인증 코드

인증 코드: ${code}

이 코드는 3분 내에만 유효합니다.

- Lit`;

    // 이메일 발송
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: email,
      subject: '[Lit] 이메일 인증 코드',
      text: textContent,
    });

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('이메일 발송 중 에러:', error);
    return {
      success: false,
      error: error.message || '이메일 발송 실패',
    };
  }
};

/**
 * 일반 이메일 발송
 * @param {string} to - 수신자 이메일
 * @param {string} subject - 제목
 * @param {string} html - HTML 본문
 * @param {string} text - 텍스트 본문 (선택)
 * @returns {Promise<Object>} { success: boolean, messageId?: string, error?: string }
 */
export const sendEmail = async (to, subject, html, text = '') => {
  try {
    // 입력 검증
    if (!to || !to.trim()) {
      return {
        success: false,
        error: '수신자 이메일이 필요합니다',
      };
    }

    if (!subject || !subject.trim()) {
      return {
        success: false,
        error: '제목이 필요합니다',
      };
    }

    if (!html || !html.trim()) {
      return {
        success: false,
        error: 'HTML 본문이 필요합니다',
      };
    }

    const transporter = createTransporter();

    const mailOptions = {
      from: EMAIL_FROM,
      to,
      subject,
      html,
    };

    if (text && text.trim()) {
      mailOptions.text = text;
    }

    const info = await transporter.sendMail(mailOptions);

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error('이메일 발송 중 에러:', error);
    return {
      success: false,
      error: error.message || '이메일 발송 실패',
    };
  }
};
