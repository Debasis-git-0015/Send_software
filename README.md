# 🚀 DropSend - Code-Based 100MB File Transfer

> A sleek, modern file-sharing web application inspired by `sendfileonline.com`. Upload files up to **100 Megabytes**, set an expiration window (**1 Day, 1 Week, or 1 Month**), and generate a **6-digit download code**. The sender can completely turn off their computer or close their browser — the file remains safely stored on the cloud server until it expires or is downloaded.

---

## ✨ Features

- 📦 **100 MB File Limit**: Generous file size support for large documents, videos, archives, and datasets.
- 🔢 **Simple 6-Digit Code**: Easy to memorize and enter on mobile phones, tablets, or another computer.
- ⏳ **Custom Expiration Windows**:
  - **1 Day** (24 hours - Recommended)
  - **1 Week** (7 days)
  - **1 Month** (30 days)
  - **1 Hour** (Quick burn transfer)
- ☁️ **True Server Persistence**: Upload is stored on the server's disk with streaming downloads. The 1st device does **not** need to stay online or keep the tab open.
- 🧹 **Automatic Cleanup**: Expired files are automatically wiped from server disk storage and database on schedule.
- 📱 **QR Code & Direct Links**: Instant smartphone camera scanning and 1-click shareable URLs (`#receive?code=123456`).
- 🔥 **Burn After Download (Optional)**: One-time download mode that deletes the file immediately once the recipient finishes downloading.
- 📊 **Real-Time Progress & Speed**: Live upload percentage, transfer progress (MB/MB), upload speed, and cancellation support.
- 🎨 **State-of-the-Art UI**: Cyber-glassmorphism dark aesthetic, smooth micro-animations, auto-advancing OTP digit boxes, and responsive mobile-first design.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express 5, Multer (streaming disk storage with 100MB limit)
- **Frontend**: Vanilla HTML5, Modern CSS (Glassmorphism, CSS Custom Properties), JavaScript (ES6+ with `XMLHttpRequest` upload progress and deep-link routing)
- **Utilities**: `qrcode` (native offline QR generator), `crypto` (random 6-digit code generation)

---

## 🚀 Quick Start (Running Locally)

### Prerequisites
- Node.js (v18 or higher)
- npm (v9 or higher)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start the Server
```bash
npm start
```
The server will start at:
```
http://localhost:3000
```

### 3. Development Mode (with Auto-Reload)
```bash
npm run dev
```

---

## 🌐 Deploying Online (Free Cloud Platforms)

To access your website from any device anywhere in the world, deploy it to a cloud provider:

### Option 1: Deploy on Render (Recommended - Free)
1. Push your repository to GitHub.
2. Sign in to [Render](https://render.com).
3. Click **New +** > **Web Service**.
4. Connect your GitHub repository.
5. Render will automatically detect the settings from `render.yaml`:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Click **Deploy Web Service**. You will receive an instant `https://your-app.onrender.com` URL!

---

### Option 2: Deploy on Railway
1. Sign up at [Railway.app](https://railway.app).
2. Click **New Project** > **Deploy from GitHub repo**.
3. Select your repo. Railway will automatically build and deploy your container or Node app.
4. Add a Persistent Volume mounted at `/app/uploads` if you want uploads to survive redeploys.

---

### Option 3: Deploy with Docker
You can run DropSend on any VPS (DigitalOcean, AWS, Linode, Hetzner, etc.):

```bash
# Build the Docker image
docker build -t dropsend .

# Run the container (mounting the uploads volume for persistence)
docker run -d -p 3000:3000 -v dropsend_data:/app/uploads --name dropsend dropsend
```

---

## 📡 API Reference

### 1. Get Service Status
- **Endpoint**: `GET /api/stats`
- **Response**:
```json
{
  "maxSizeBytes": 104857600,
  "maxSizeFormatted": "100 MB",
  "activeTransfers": 4
}
```

### 2. Upload File
- **Endpoint**: `POST /api/upload`
- **Content-Type**: `multipart/form-data`
- **Fields**:
  - `file`: The binary file (Max 100MB)
  - `duration`: `'1d'` (default), `'1w'`, `'1m'`, `'1h'`
  - `burnAfterDownload`: `'true'` or `'false'`
- **Response**:
```json
{
  "success": true,
  "code": "482910",
  "file": {
    "originalName": "project_report.pdf",
    "size": 15420100,
    "expiresAt": "2026-09-28T11:50:00.000Z",
    "duration": "1d",
    "burnAfterDownload": false
  },
  "directUrl": "https://your-domain.com/#receive?code=482910",
  "qrCodeUrl": "data:image/png;base64,..."
}
```

### 3. File Metadata Lookup
- **Endpoint**: `GET /api/info/:code`
- **Response**:
```json
{
  "success": true,
  "code": "482910",
  "originalName": "project_report.pdf",
  "size": 15420100,
  "mimeType": "application/pdf",
  "createdAt": "2026-09-27T11:50:00.000Z",
  "expiresAt": "2026-09-28T11:50:00.000Z",
  "timeRemainingMs": 86399000,
  "burnAfterDownload": false
}
```

### 4. Download File
- **Endpoint**: `GET /api/download/:code`
- **Response**: Streams the file binary with appropriate `Content-Disposition: attachment; filename="..."` headers.
- **Auto-Burn**: If `burnAfterDownload` is enabled, the file and record are destroyed right after streaming finishes.

---

## 📁 Project Structure

```
├── public/
│   ├── index.html        # Modern responsive UI (Send & Receive tabs)
│   ├── styles.css        # Cyber-glassmorphism styles & animations
│   ├── app.js            # Frontend logic, XHR upload progress, OTP input
│   └── favicon.svg       # Custom brand vector icon
├── server.js             # Express 5 server, Multer 100MB limit, cleanup timer
├── Dockerfile            # Container deployment definition
├── render.yaml           # 1-click Render cloud deploy config
├── package.json          # Project configuration & dependencies
├── uploads/              # Server-side persistent file storage
└── data/                 # JSON database for codes & expiration records
```

---

## 🛡️ Security & Integrity

- **Filename Sanitization**: Uploaded files are stored with random UUID filenames on disk to avoid file system collision or execution vulnerabilities. Original names are preserved in metadata and restored upon download.
- **Strict Size Validation**: File size is validated both client-side and server-side at the stream parser level.
- **Automated Purging**: Expired files are permanently deleted automatically every 5 minutes and on server reboot.
