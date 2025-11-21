# User Service

用户认证与管理微服务

## 环境变量配置

**重要**: 在生产环境中，必须设置安全的环境变量。

### 必需的环境变量

- `JWT_SECRET`: JWT签名密钥（**必填**）
  - 开发环境: 使用.env文件中的值
  - 生产环境: **必须**设置为强随机字符串，至少32个字符
  - 生成示例: `openssl rand -base64 32`
  - 如果未设置，服务将拒绝启动

- `PORT`: 服务端口（可选，默认3001）
- `NODE_ENV`: 运行环境（development/production）

### 安全要求

1. **密码策略**:
   - 最小长度: 8个字符
   - 必须包含: 大写字母、小写字母、数字
   - 使用bcrypt加密存储

2. **JWT Token**:
   - 7天有效期
   - HS256签名算法
   - 包含userId和email信息

3. **生产环境清单**:
   - [ ] 设置强随机JWT_SECRET
   - [ ] 使用HTTPS
   - [ ] 迁移到PostgreSQL数据库
   - [ ] 实施密码策略迁移（强制现有用户更新弱密码）
   - [ ] 添加速率限制（防止暴力破解）
   - [ ] 启用日志记录
   - [ ] 配置CORS白名单

4. **密码策略迁移**:
   - 当前使用内存存储，每次重启清空数据，无遗留弱密码
   - 迁移到PostgreSQL后需实施:
     - 添加`password_policy_version`字段到user表
     - 登录时检查密码策略版本，强制旧用户重置密码
     - 或在登录时验证密码强度，不符合则要求更新

## API端点

### POST /api/auth/register
注册新用户

### POST /api/auth/login
用户登录

### GET /api/user/profile
获取用户信息（需要认证）

## 运行服务

```bash
npm install
npm start
```

## 测试

```bash
# 注册用户
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"Test1234"}'

# 登录
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test1234"}'
```
