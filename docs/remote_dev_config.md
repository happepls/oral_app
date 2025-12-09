# IntelliJ IDEA 远程开发配置指南

## 1. SSH连接配置

### 创建SSH配置
在IntelliJ IDEA中配置SSH连接：

1. **Tools** → **Deployment** → **Configuration**
2. 点击 **+** 添加新的SFTP服务器
3. 配置参数：
   - **Name**: `oral_app_remote`
   - **Type**: SFTP
   - **Host**: `your-remote-server-ip` (替换为实际服务器IP)
   - **Port**: `22`
   - **Root path**: `/home/your-username/oral_app` (远程项目路径)
   - **Username**: `your-username`
   - **Auth type**: Key pair (推荐) 或 Password

## 2. 目录映射配置

### 本地到远程映射
配置本地和远程目录的对应关系：

| 本地路径 | 远程路径 | 同步方向 |
|---------|---------|---------|
| `/Users/sgcc-work/IdeaProjects/oral_app/` | `/home/your-username/oral_app/` | 双向 |
| `api-gateway/` | `api-gateway/` | 双向 |
| `client/` | `client/` | 双向 |
| `services/` | `services/` | 双向 |
| `docs/` | `docs/` | 双向 |

### 配置步骤
1. 在Deployment配置中，切换到 **Mappings** 标签
2. 设置：
   - **Local path**: `/Users/sgcc-work/IdeaProjects/oral_app`
   - **Deployment path**: `/`
   - **Web path**: (留空，非Web项目)

## 3. 自动同步配置

### 启用自动上传
1. **Tools** → **Deployment** → **Options**
2. 勾选 **Upload changed files automatically to the default server**
3. 选择 **On explicit save action (Ctrl+S)**

### 排除不需要同步的文件
在 **Excluded Paths** 中添加：
- `node_modules/`
- `.git/`
- `.DS_Store`
- `*.log`
- `dist/`
- `build/`

## 4. 远程解释器配置

### 配置Docker远程解释器
1. **File** → **Project Structure** → **SDKs**
2. 添加 **Docker** SDK
3. 选择 **Docker for Mac**
4. 配置镜像：`node:18-alpine`

### 配置服务运行配置
为每个微服务创建运行配置：

```json
{
  "ai-omni-service": {
    "type": "Node.js",
    "node interpreter": "Docker",
    "working directory": "/home/your-username/oral_app/services/ai-omni-service",
    "javascript file": "src/index.js"
  }
}
```

## 5. 版本控制集成

### Git远程仓库配置
确保远程仓库配置正确：

```bash
# 检查远程仓库
cd /Users/sgcc-work/IdeaProjects/oral_app
git remote -v

# 应该显示类似：
# origin  git@github.com:sjx1943/oral_app.git (fetch)
# origin  git@github.com:sjx1943/oral_app.git (push)
```

### 同步策略
1. **本地开发流程**：
   - 在本地修改代码
   - 自动同步到远程服务器
   - 在远程服务器测试
   - 提交到Git

2. **远程修改处理**：
   - 启用 **Tools** → **Deployment** → **Download from...**
   - 定期从远程下载更改

## 6. 故障排除

### 常见问题解决

#### 连接失败
- 检查SSH密钥权限：`chmod 600 ~/.ssh/id_rsa`
- 验证网络连接和防火墙设置

#### 同步失败
- 检查文件权限：`chmod -R 755 /home/your-username/oral_app`
- 验证磁盘空间

#### Docker容器访问问题
- 检查Docker服务状态：`systemctl status docker`
- 验证端口映射配置

## 7. 最佳实践

### 开发工作流
1. **开始工作前**：从远程下载最新更改
2. **开发过程中**：定期保存(Ctrl+S)触发自动同步
3. **提交前**：在远程服务器验证功能
4. **结束工作**：确保所有更改已同步和提交

### 性能优化
- 使用SSH密钥认证而非密码
- 配置SSH连接保持：在 `~/.ssh/config` 中添加：
  ```
  Host your-remote-server
      HostName your-remote-server-ip
      User your-username
      ServerAliveInterval 60
      ServerAliveCountMax 3
  ```

### 安全考虑
- 使用强密码或SSH密钥
- 定期更新SSH密钥
- 配置防火墙限制访问IP
- 使用非root用户运行服务

## 8. 监控和维护

### 日志监控
配置日志文件同步排除，但保留错误日志监控：
- 远程服务器：`tail -f /var/log/oral_app/*.log`
- 本地查看：通过SSH会话实时监控

### 定期维护
- 清理临时文件：`find /tmp -name "oral_app*" -mtime +7 -delete`
- 检查磁盘使用情况
- 更新依赖包版本

这个配置指南将帮助您建立稳定的远程开发环境，确保本地和远程代码的实时同步。