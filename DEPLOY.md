# Dashboard Deployment Guide
# Ubuntu VPS + Nginx + Node.js + MongoDB

# ══════════════════════════════════════════════════════════════
# STEP 1 — Install dependencies on VPS (run once)
# ══════════════════════════════════════════════════════════════

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MongoDB
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
sudo apt update
sudo apt install -y mongodb-org
sudo systemctl start mongod
sudo systemctl enable mongod

# Install Nginx
sudo apt install -y nginx

# Install PM2 globally
sudo npm install -g pm2

# ══════════════════════════════════════════════════════════════
# STEP 2 — Upload your project to VPS
# ══════════════════════════════════════════════════════════════

# From your LOCAL machine — zip the project
zip -r dashboard.zip dashboard-project/

# Upload via SCP (replace with your VPS IP)
scp dashboard.zip root@YOUR_VPS_IP:/var/www/

# On VPS — unzip
cd /var/www
unzip dashboard.zip
mv dashboard-project dashboard

# ══════════════════════════════════════════════════════════════
# STEP 3 — Install backend dependencies
# ══════════════════════════════════════════════════════════════

cd /var/www/dashboard/backend
npm install

# ══════════════════════════════════════════════════════════════
# STEP 4 — Edit the .env file
# ══════════════════════════════════════════════════════════════

nano /var/www/dashboard/backend/.env

# Set these values:
#   PORT=4000
#   MONGO_URI=mongodb://localhost:27017/dashboard
#   SESSION_SECRET=some-very-long-random-string-here
#   NODE_ENV=production

# ══════════════════════════════════════════════════════════════
# STEP 5 — Build the React frontend
# ══════════════════════════════════════════════════════════════

cd /var/www/dashboard/frontend
npm install
npm run build
# → Creates frontend/dist/ folder (this is what Nginx serves)

# ══════════════════════════════════════════════════════════════
# STEP 6 — Configure Nginx
# ══════════════════════════════════════════════════════════════

# Copy the nginx config
sudo cp /var/www/dashboard/nginx.conf /etc/nginx/sites-available/dashboard

# Edit it — replace "your-domain.com" with your actual domain or IP
sudo nano /etc/nginx/sites-available/dashboard

# Enable it
sudo ln -s /etc/nginx/sites-available/dashboard /etc/nginx/sites-enabled/

# Remove default site
sudo rm -f /etc/nginx/sites-enabled/default

# Test config
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx

# ══════════════════════════════════════════════════════════════
# STEP 7 — Create log directory & Start with PM2
# ══════════════════════════════════════════════════════════════

sudo mkdir -p /var/log/dashboard
sudo chown $USER:$USER /var/log/dashboard

# Start the backend with PM2
cd /var/www/dashboard
pm2 start ecosystem.config.js

# Save PM2 process list so it restarts on reboot
pm2 save
pm2 startup   # ← run the command it prints

# ══════════════════════════════════════════════════════════════
# STEP 8 — Verify everything is running
# ══════════════════════════════════════════════════════════════

pm2 status                          # should show "online"
pm2 logs dashboard-backend          # watch live logs
curl http://localhost:4000/api/auth/me   # should return 401 (good!)
sudo systemctl status nginx         # should be active

# ══════════════════════════════════════════════════════════════
# DEFAULT LOGIN CREDENTIALS
# ══════════════════════════════════════════════════════════════
# Username: admin
# Password: admin123
# ⚠ Change this immediately after first login via Admin > Users

# ══════════════════════════════════════════════════════════════
# UPDATING THE APP (future deployments)
# ══════════════════════════════════════════════════════════════

# Upload new code to /var/www/dashboard
# Then:
cd /var/www/dashboard/frontend && npm run build
pm2 restart dashboard-backend

# ══════════════════════════════════════════════════════════════
# OPTIONAL: HTTPS with Let's Encrypt (free SSL)
# ══════════════════════════════════════════════════════════════

sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
# Then uncomment the HTTPS block in nginx.conf
