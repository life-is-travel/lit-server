/**
 * MySQL 데이터베이스 연결 설정
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 데이터베이스 연결 풀 생성
export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'suittrip',
  connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10,
  waitForConnections: true,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
  charset: 'utf8mb4',
  timezone: '+09:00', // 한국 시간대
});

/**
 * 연결 풀에서 연결 가져오기
 * @returns {Promise<PoolConnection>}
 */
export const getConnection = async () => {
  try {
    const connection = await pool.getConnection();
    return connection;
  } catch (error) {
    console.error('데이터베이스 연결 실패:', error);
    throw error;
  }
};

/**
 * 쿼리 실행
 * @param {string} sql - SQL 쿼리
 * @param {Array} params - 쿼리 파라미터
 * @returns {Promise<Array>}
 */
export const query = async (sql, params = []) => {
  try {
    const [rows] = await pool.query(sql, params);
    return rows;
  } catch (error) {
    console.error('쿼리 실행 실패:', error);
    throw error;
  }
};

/**
 * 트랜잭션 시작
 * @param {Function} callback - 트랜잭션 내에서 실행할 콜백
 * @returns {Promise<any>}
 */
export const transaction = async (callback) => {
  const connection = await getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

/**
 * 연결 풀 종료
 * @returns {Promise<void>}
 */
let isPoolClosed = false;

export const closePool = async () => {
  if (isPoolClosed) {
    console.log('⚠️  연결 풀이 이미 종료되었습니다.');
    return;
  }

  try {
    isPoolClosed = true;
    await pool.end();
    console.log('✅ 데이터베이스 연결 풀 종료됨');
  } catch (error) {
    // 이미 닫힌 경우 에러를 무시
    if (error.message && error.message.includes('closed state')) {
      console.log('⚠️  연결 풀이 이미 종료되었습니다.');
      return;
    }
    console.error('❌ 연결 풀 종료 실패:', error.message);
  }
};

/**
 * 데이터베이스 연결 테스트
 * @returns {Promise<boolean>}
 */
export const testConnection = async () => {
  try {
    const connection = await getConnection();
    const [rows] = await connection.query('SELECT 1');
    connection.release();
    console.log('✅ 데이터베이스 연결 성공');
    return true;
  } catch (error) {
    console.error('❌ 데이터베이스 연결 실패:', error.message);
    return false;
  }
};

// NOTE: 프로세스 종료 시 연결 풀 정리는 server.js에서 처리합니다.
// 여기서 처리하면 중복 호출로 인한 에러가 발생할 수 있습니다.

export default pool;
