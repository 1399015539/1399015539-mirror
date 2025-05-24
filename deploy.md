# Midjourney Mirror CentOS 部署指南

## 1. 服务器环境准备

### 更新系统
```bash
sudo yum update -y
```

### 安装必要的系统工具
```bash
sudo yum install -y curl wget git vim htop
```

## 2. 安装 Node.js

### 方法1: 使用 NodeSource 仓库（推荐）
```bash
# 添加 NodeSource 仓库（Node.js 18.x LTS）
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -

# 安装 Node.js
sudo yum install -y nodejs

# 验证安装
node --version
npm --version
```

### 方法2: 使用 NVM（可选）
```bash
# 安装 NVM
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

# 重新加载 bash profile
source ~/.bashrc

# 安装最新的 LTS Node.js
nvm install --lts
nvm use --lts
```

## 3. 安装 PM2（进程管理器）
```bash
sudo npm install -g pm2
```

## 4. 创建项目目录
```bash
# 创建项目目录
sudo mkdir -p /opt/midjourney-mirror
sudo chown $USER:$USER /opt/midjourney-mirror
cd /opt/midjourney-mirror
```

## 5. 部署代码

### 方法1: 使用 Git Clone（如果代码在Git仓库）
```bash
git clone <your-git-repo-url> .
```

### 方法2: 手动上传代码
```bash
# 在本地打包代码
cd /Users/zhaoshiyu/Documents/code/fetcher-mcp-main
tar -czf midjourney-mirror.tar.gz --exclude=node_modules --exclude=.git .

# 上传到服务器（替换 your-server-ip）
scp midjourney-mirror.tar.gz user@your-server-ip:/opt/midjourney-mirror/

# 在服务器上解压
cd /opt/midjourney-mirror
tar -xzf midjourney-mirror.tar.gz
rm midjourney-mirror.tar.gz
```

## 6. 安装依赖
```bash
cd /opt/midjourney-mirror
npm install
```

## 7. 配置环境

### 检查配置文件
```bash
# 确保配置文件存在
ls -la src/config/

# 如果需要，编辑配置
vim src/config/index.ts
```

### 设置生产环境变量
```bash
# 创建环境变量文件
cat > .env << EOF
NODE_ENV=production
PORT=3000
EOF
```

## 8. 构建项目（如果需要）
```bash
npm run build
```

## 9. 配置防火墙
```bash
# 开放3000端口
sudo firewall-cmd --permanent --add-port=3000/tcp
sudo firewall-cmd --reload

# 查看开放的端口
sudo firewall-cmd --list-ports
```

## 10. 使用 PM2 启动服务

### 创建 PM2 配置文件
```bash
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'midjourney-mirror',
    script: 'dist/index.js', // 如果有构建后的文件
    // script: 'src/index.ts', // 或者直接运行 TypeScript
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
};
EOF
```

### 创建日志目录
```bash
mkdir -p logs
```

### 启动服务
```bash
# 启动服务
pm2 start ecosystem.config.js --env production

# 查看状态
pm2 status

# 查看日志
pm2 logs midjourney-mirror

# 设置开机自启
pm2 startup
pm2 save
```

## 11. 设置反向代理（可选）

### 安装 Nginx
```bash
sudo yum install -y nginx

# 启动并设置开机自启
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 配置 Nginx
```bash
sudo tee /etc/nginx/conf.d/midjourney-mirror.conf << EOF
server {
    listen 80;
    server_name your-domain.com;  # 替换为你的域名或服务器IP
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_buffering off;
    }
}
EOF

# 测试配置
sudo nginx -t

# 重启 Nginx
sudo systemctl restart nginx

# 开放80端口
sudo firewall-cmd --permanent --add-service=http
sudo firewall-cmd --reload
```

## 12. 常用管理命令

### PM2 管理
```bash
# 查看状态
pm2 status

# 重启服务
pm2 restart midjourney-mirror

# 停止服务
pm2 stop midjourney-mirror

# 查看日志
pm2 logs midjourney-mirror

# 实时监控
pm2 monit

# 删除服务
pm2 delete midjourney-mirror
```

### 系统监控
```bash
# 查看端口占用
sudo netstat -tlnp | grep :3000

# 查看系统资源
htop

# 查看磁盘空间
df -h

# 查看内存使用
free -h
```

## 13. 故障排查

### 检查服务状态
```bash
# 检查 PM2 状态
pm2 status

# 查看详细日志
pm2 logs midjourney-mirror --lines 50

# 检查端口
sudo ss -tlnp | grep :3000
```

### 常见问题解决

#### 1. 端口被占用
```bash
# 找到占用端口的进程
sudo lsof -i :3000

# 杀死进程（替换 PID）
sudo kill -9 <PID>
```

#### 2. 权限问题
```bash
# 确保项目目录权限正确
sudo chown -R $USER:$USER /opt/midjourney-mirror
```

#### 3. Node.js 内存不足
```bash
# 增加 Node.js 内存限制
pm2 restart midjourney-mirror --update-env
```

## 14. 性能优化

### 启用 Gzip 压缩（Nginx）
```bash
# 编辑 Nginx 配置
sudo vim /etc/nginx/nginx.conf

# 在 http 块中添加：
gzip on;
gzip_vary on;
gzip_min_length 1024;
gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;
```

### PM2 集群模式（可选）
```bash
# 修改 ecosystem.config.js 中的 instances
instances: 'max', // 使用所有CPU核心
exec_mode: 'cluster'
```

## 15. 安全建议

### 更新系统安全
```bash
# 定期更新系统
sudo yum update -y

# 配置 fail2ban（防止暴力破解）
sudo yum install -y epel-release
sudo yum install -y fail2ban
sudo systemctl enable fail2ban
sudo systemctl start fail2ban
```

### 配置SSL（推荐使用 Let's Encrypt）
```bash
# 安装 certbot
sudo yum install -y certbot python3-certbot-nginx

# 获取SSL证书
sudo certbot --nginx -d your-domain.com

# 设置自动续期
sudo crontab -e
# 添加以下行：
0 12 * * * /usr/bin/certbot renew --quiet
```

## 访问应用

部署完成后，你可以通过以下方式访问：

- 直接访问：`http://your-server-ip:3000`
- 通过 Nginx：`http://your-domain.com`
- HTTPS（如果配置了SSL）：`https://your-domain.com`

选择账号页面：`http://your-server-ip:3000/`
探索页面：`http://your-server-ip:3000/explore` 