module.exports = {
  apps: [
    {
      name: "dashboard-backend",
      script: "./backend/server.js",
      cwd: "/var/www/dashboard",   // ← change to your VPS deploy path
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "300M",
      env: {
        NODE_ENV: "production",
        PORT: 4000
      },
      error_file: "/var/log/dashboard/error.log",
      out_file:   "/var/log/dashboard/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};
