#!/bin/bash

# Midjourney Mirror 自动部署脚本
# 适用于 CentOS 7/8

set -e

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# 检查是否为root用户
check_root() {
    if [[ $EUID -eq 0 ]]; then
        log_error "请不要使用root用户运行此脚本"
        exit 1
    fi
}

# 检查系统版本
check_system() {
    log_step "检查系统版本..."
    if [[ -f /etc/redhat-release ]]; then
        log_info "检测到 CentOS/RHEL 系统"
    else
        log_error "此脚本仅支持 CentOS/RHEL 系统"
        exit 1
    fi
}

# 安装系统依赖
install_dependencies() {
    log_step "更新系统并安装依赖..."
    sudo yum update -y
    sudo yum install -y curl wget git vim htop
}

# 安装 Node.js
install_nodejs() {
    log_step "安装 Node.js..."
    
    # 检查是否已安装
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_info "Node.js 已安装: $NODE_VERSION"
        read -p "是否重新安装 Node.js? (y/N): " reinstall
        if [[ $reinstall != "y" && $reinstall != "Y" ]]; then
            return
        fi
    fi

    # 安装 Node.js 18.x
    curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
    sudo yum install -y nodejs
    
    # 验证安装
    log_info "Node.js 版本: $(node --version)"
    log_info "npm 版本: $(npm --version)"
}

# 安装 PM2
install_pm2() {
    log_step "安装 PM2..."
    
    if command -v pm2 &> /dev/null; then
        log_info "PM2 已安装"
        return
    fi
    
    sudo npm install -g pm2
    log_info "PM2 安装完成"
}

# 创建项目目录
create_project_dir() {
    log_step "创建项目目录..."
    
    PROJECT_DIR="/opt/midjourney-mirror"
    
    if [[ -d $PROJECT_DIR ]]; then
        log_warn "项目目录已存在: $PROJECT_DIR"
        read -p "是否删除现有目录重新开始? (y/N): " recreate
        if [[ $recreate == "y" || $recreate == "Y" ]]; then
            sudo rm -rf $PROJECT_DIR
        else
            log_info "使用现有目录"
            return
        fi
    fi
    
    sudo mkdir -p $PROJECT_DIR
    sudo chown $USER:$USER $PROJECT_DIR
    cd $PROJECT_DIR
    
    log_info "项目目录创建完成: $PROJECT_DIR"
}

# 部署代码
deploy_code() {
    log_step "部署代码..."
    
    cd /opt/midjourney-mirror
    
    echo "选择部署方式:"
    echo "1) 从本地上传压缩包"
    echo "2) 从 Git 仓库克隆"
    read -p "请选择 (1-2): " deploy_method
    
    case $deploy_method in
        1)
            read -p "请输入压缩包的完整路径: " tar_path
            if [[ -f $tar_path ]]; then
                tar -xzf $tar_path
                log_info "代码解压完成"
            else
                log_error "压缩包不存在: $tar_path"
                exit 1
            fi
            ;;
        2)
            read -p "请输入 Git 仓库 URL: " git_url
            git clone $git_url .
            log_info "代码克隆完成"
            ;;
        *)
            log_error "无效选择"
            exit 1
            ;;
    esac
}

# 安装项目依赖
install_deps() {
    log_step "安装项目依赖..."
    
    cd /opt/midjourney-mirror
    
    if [[ ! -f package.json ]]; then
        log_error "package.json 不存在，请检查代码是否正确部署"
        exit 1
    fi
    
    npm install
    log_info "依赖安装完成"
}

# 配置环境
setup_environment() {
    log_step "配置环境..."
    
    cd /opt/midjourney-mirror
    
    # 创建 .env 文件
    cat > .env << EOF
NODE_ENV=production
PORT=3000
EOF
    
    # 创建日志目录
    mkdir -p logs
    
    log_info "环境配置完成"
}

# 配置防火墙
setup_firewall() {
    log_step "配置防火墙..."
    
    # 检查防火墙状态
    if systemctl is-active --quiet firewalld; then
        sudo firewall-cmd --permanent --add-port=3000/tcp
        sudo firewall-cmd --reload
        log_info "防火墙已配置，开放端口 3000"
    else
        log_warn "防火墙未运行，跳过配置"
    fi
}

# 创建 PM2 配置
create_pm2_config() {
    log_step "创建 PM2 配置..."
    
    cd /opt/midjourney-mirror
    
    cat > ecosystem.config.js << 'EOF'
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
    
    log_info "PM2 配置创建完成"
}

# 启动服务
start_service() {
    log_step "启动服务..."
    
    cd /opt/midjourney-mirror
    
    # 如果服务已经运行，先停止
    if pm2 list | grep -q "midjourney-mirror"; then
        pm2 delete midjourney-mirror
    fi
    
    # 启动服务
    pm2 start ecosystem.config.js --env production
    
    # 设置开机自启
    pm2 startup
    pm2 save
    
    log_info "服务启动完成"
    
    # 显示状态
    pm2 status
}

# 安装 Nginx（可选）
install_nginx() {
    log_step "是否安装 Nginx 反向代理?"
    read -p "安装 Nginx? (y/N): " install_nginx_choice
    
    if [[ $install_nginx_choice != "y" && $install_nginx_choice != "Y" ]]; then
        return
    fi
    
    log_step "安装 Nginx..."
    sudo yum install -y nginx
    
    # 启动并设置开机自启
    sudo systemctl start nginx
    sudo systemctl enable nginx
    
    # 创建配置
    read -p "请输入域名或服务器IP: " server_name
    
    sudo tee /etc/nginx/conf.d/midjourney-mirror.conf << EOF
server {
    listen 80;
    server_name $server_name;
    
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
    if systemctl is-active --quiet firewalld; then
        sudo firewall-cmd --permanent --add-service=http
        sudo firewall-cmd --reload
    fi
    
    log_info "Nginx 配置完成"
}

# 显示部署结果
show_result() {
    log_step "部署完成！"
    
    SERVER_IP=$(hostname -I | awk '{print $1}')
    
    echo ""
    echo "======================================"
    echo "        部署完成"
    echo "======================================"
    echo ""
    echo "访问地址:"
    echo "  直接访问: http://$SERVER_IP:3000"
    
    if systemctl is-active --quiet nginx; then
        echo "  通过 Nginx: http://$SERVER_IP"
    fi
    
    echo ""
    echo "管理命令:"
    echo "  查看状态: pm2 status"
    echo "  查看日志: pm2 logs midjourney-mirror"
    echo "  重启服务: pm2 restart midjourney-mirror"
    echo "  停止服务: pm2 stop midjourney-mirror"
    echo ""
    echo "日志文件位置:"
    echo "  /opt/midjourney-mirror/logs/"
    echo ""
    echo "======================================"
}

# 主函数
main() {
    log_info "开始部署 Midjourney Mirror..."
    
    check_root
    check_system
    install_dependencies
    install_nodejs
    install_pm2
    create_project_dir
    deploy_code
    install_deps
    setup_environment
    setup_firewall
    create_pm2_config
    start_service
    install_nginx
    show_result
    
    log_info "部署完成！"
}

# 运行主函数
main "$@" 