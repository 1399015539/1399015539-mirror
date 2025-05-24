#!/bin/bash

# 代码打包脚本
# 用于打包本地代码以便上传到服务器

set -e

# 颜色输出
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

# 项目根目录
PROJECT_ROOT=$(pwd)
PACKAGE_NAME="midjourney-mirror-$(date +%Y%m%d_%H%M%S).tar.gz"

log_info "开始打包项目..."
log_info "项目目录: $PROJECT_ROOT"
log_info "包名: $PACKAGE_NAME"

# 创建临时目录
TEMP_DIR=$(mktemp -d)
log_step "创建临时目录: $TEMP_DIR"

# 复制文件到临时目录
log_step "复制项目文件..."

# 复制源码
cp -r src/ "$TEMP_DIR/"

# 复制配置文件
cp package.json "$TEMP_DIR/"
cp package-lock.json "$TEMP_DIR/" 2>/dev/null || true
cp tsconfig.json "$TEMP_DIR/" 2>/dev/null || true

# 复制公共文件
cp -r public/ "$TEMP_DIR/" 2>/dev/null || true
cp -r public-self/ "$TEMP_DIR/" 2>/dev/null || true

# 复制部署相关文件
cp deploy.md "$TEMP_DIR/" 2>/dev/null || true
cp deploy.sh "$TEMP_DIR/" 2>/dev/null || true

# 复制 README 等文档文件
cp README.md "$TEMP_DIR/" 2>/dev/null || true
cp *.md "$TEMP_DIR/" 2>/dev/null || true

# 创建环境变量示例文件
cat > "$TEMP_DIR/.env.example" << EOF
NODE_ENV=production
PORT=3000
EOF

# 创建部署后的启动脚本
cat > "$TEMP_DIR/start.sh" << 'EOF'
#!/bin/bash

# 检查 PM2 是否安装
if ! command -v pm2 &> /dev/null; then
    echo "PM2 未安装，请先安装 PM2: npm install -g pm2"
    exit 1
fi

# 安装依赖
echo "安装依赖..."
npm install

# 创建日志目录
mkdir -p logs

# 停止可能存在的服务
pm2 delete midjourney-mirror 2>/dev/null || true

# 启动服务
echo "启动服务..."
pm2 start ecosystem.config.js --env production

# 显示状态
pm2 status

echo "服务启动完成！"
echo "查看日志: pm2 logs midjourney-mirror"
EOF

chmod +x "$TEMP_DIR/start.sh"

# 创建 PM2 配置文件
cat > "$TEMP_DIR/ecosystem.config.js" << 'EOF'
module.exports = {
  apps: [{
    name: 'midjourney-mirror',
    script: 'src/index.ts',
    interpreter: 'node',
    interpreter_args: '--loader=ts-node/esm',
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

# 创建简单的部署说明
cat > "$TEMP_DIR/DEPLOY_INSTRUCTIONS.md" << EOF
# 部署说明

## 快速部署（推荐）

1. 解压文件
2. 运行自动部署脚本：
   \`\`\`bash
   chmod +x deploy.sh
   ./deploy.sh
   \`\`\`

## 手动部署

1. 安装 Node.js 18.x
2. 安装 PM2：\`npm install -g pm2\`
3. 安装依赖：\`npm install\`
4. 启动服务：\`./start.sh\`

## 访问应用

- 主页（账号选择）：http://your-server-ip:3000/
- 探索页面：http://your-server-ip:3000/explore

## 管理命令

- 查看状态：\`pm2 status\`
- 查看日志：\`pm2 logs midjourney-mirror\`
- 重启服务：\`pm2 restart midjourney-mirror\`
- 停止服务：\`pm2 stop midjourney-mirror\`
EOF

# 显示将要打包的文件
log_step "检查文件结构..."
cd "$TEMP_DIR"
find . -type f | head -20
echo "..."

# 创建压缩包
log_step "创建压缩包..."
cd "$TEMP_DIR"
tar -czf "$PROJECT_ROOT/$PACKAGE_NAME" .

# 清理临时目录
rm -rf "$TEMP_DIR"

# 显示结果
log_info "打包完成！"
echo ""
echo "======================================"
echo "        打包完成"
echo "======================================"
echo ""
echo "包文件: $PACKAGE_NAME"
echo "文件大小: $(du -h "$PACKAGE_NAME" | cut -f1)"
echo ""
echo "上传到服务器的命令示例："
echo "scp $PACKAGE_NAME user@your-server-ip:/tmp/"
echo ""
echo "在服务器上部署："
echo "1. mkdir -p /opt/midjourney-mirror"
echo "2. cd /opt/midjourney-mirror"
echo "3. tar -xzf /tmp/$PACKAGE_NAME"
echo "4. chmod +x deploy.sh"
echo "5. ./deploy.sh"
echo ""
echo "======================================"

log_info "打包流程完成！" 