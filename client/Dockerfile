# 使用官方Node.js运行时作为基础镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制package.json和package-lock.json
COPY package*.json ./

# 复制前端应用代码
COPY . .

# 暴露端口
EXPOSE 5000

# 启动应用
CMD ["npm", "start"]