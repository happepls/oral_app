#!/usr/bin/env node
/**
 * list-feedback.js — 运维查看用户意见反馈
 *
 * 用户反馈通过 POST /api/users/feedback 写入 PostgreSQL `user_feedback` 表，
 * 但没有面向开发者的查看界面。这个脚本提供最小成本的查看途径（无新攻击面、
 * 无 admin 角色依赖），直接 JOIN users 拉取反馈明细。
 *
 * 用法（在 user-service 容器内跑，能读到 DATABASE_URL）：
 *   docker compose exec user-service node src/scripts/list-feedback.js [limit] [category]
 *
 * 示例：
 *   docker compose exec user-service node src/scripts/list-feedback.js              # 最近 50 条
 *   docker compose exec user-service node src/scripts/list-feedback.js 100          # 最近 100 条
 *   docker compose exec user-service node src/scripts/list-feedback.js 50 功能建议   # 按类别过滤
 *   docker compose exec user-service node src/scripts/list-feedback.js --json       # JSON 输出（便于管道处理）
 *
 * 纯 SQL 备选（不跑脚本）：
 *   docker compose exec postgres psql -U user -d oral_app -c \
 *     "SELECT f.id, f.created_at, f.category, f.message, u.username, u.email \
 *      FROM user_feedback f JOIN users u ON u.id = f.user_id \
 *      ORDER BY f.created_at DESC LIMIT 50;"
 */

require('dotenv').config();
const { pool } = require('../models/db');

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const positional = args.filter((a) => !a.startsWith('--'));
  const limit = Math.max(1, Math.min(parseInt(positional[0] || '50', 10) || 50, 1000));
  const category = positional[1] || null;

  const params = [limit];
  let where = '';
  if (category) {
    where = 'WHERE f.category = $2';
    params.push(category);
  }

  const sql =
    `SELECT f.id, f.created_at, f.category, f.message, u.username, u.email
     FROM user_feedback f
     JOIN users u ON u.id = f.user_id
     ${where}
     ORDER BY f.created_at DESC
     LIMIT $1`;

  const { rows } = await pool.query(sql, params);

  if (asJson) {
    console.log(JSON.stringify(rows, null, 2));
    return rows.length;
  }

  if (rows.length === 0) {
    console.log('（暂无反馈记录' + (category ? `，类别=${category}` : '') + '）');
    return 0;
  }

  console.log(`\n用户反馈（最近 ${rows.length} 条${category ? `，类别=${category}` : ''}）：\n`);
  for (const r of rows) {
    const when = r.created_at ? new Date(r.created_at).toISOString().replace('T', ' ').slice(0, 19) : '?';
    console.log(`#${r.id}  [${when}]  ${r.category}`);
    console.log(`  用户: ${r.username || '?'} <${r.email || '?'}>`);
    console.log(`  内容: ${r.message}`);
    console.log('');
  }
  return rows.length;
}

main()
  .then((n) => {
    if (n !== undefined && process.argv.includes('--json') === false) {
      console.error(`共 ${n} 条。`);
    }
    return pool.end();
  })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('list-feedback 失败:', err.message);
    pool.end().finally(() => process.exit(1));
  });
