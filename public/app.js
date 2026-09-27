// ==========================================================
// DROPSEND CLIENT APPLICATION LOGIC
// ==========================================================

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB in bytes

// State
let selectedFile = null;
let currentUploadXhr = null;
let currentCode = '';
let countdownInterval = null;

// DOM Elements - Navigation
const tabSend = document.getElementById('tabSend');
const tabReceive = document.getElementById('tabReceive');
const panelSend = document.getElementById('panelSend');
const panelReceive = document.getElementById('panelReceive');

// DOM Elements - Send Panel
const uploadView = document.getElementById('uploadView');
const uploadProgressView = document.getElementById('uploadProgressView');
const uploadSuccessView = document.getElementById('uploadSuccessView');
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const selectedFileCard = document.getElementById('selectedFileCard');
const fileCardIcon = document.getElementById('fileCardIcon');
const fileNameDisplay = document.getElementById('fileNameDisplay');
const fileSizeDisplay = document.getElementById('fileSizeDisplay');
const fileSizeStatus = document.getElementById('fileSizeStatus');
const btnRemoveFile = document.getElementById('btnRemoveFile');
const btnUpload = document.getElementById('btnUpload');
const checkBurnAfterDownload = document.getElementById('checkBurnAfterDownload');

// DOM Elements - Progress
const progressBarFill = document.getElementById('progressBarFill');
const progressPercent = document.getElementById('progressPercent');
const progressTransferred = document.getElementById('progressTransferred');
const progressSpeed = document.getElementById('progressSpeed');
const btnCancelUpload = document.getElementById('btnCancelUpload');

// DOM Elements - Success
const codePart1 = document.getElementById('codePart1');
const codePart2 = document.getElementById('codePart2');
const btnCopyCode = document.getElementById('btnCopyCode');
const btnShowQr = document.getElementById('btnShowQr');
const directLinkInput = document.getElementById('directLinkInput');
const btnCopyLink = document.getElementById('btnCopyLink');
const successFileName = document.getElementById('successFileName');
const successFileSize = document.getElementById('successFileSize');
const successExpiryDate = document.getElementById('successExpiryDate');
const btnSendAnother = document.getElementById('btnSendAnother');

// DOM Elements - Receive Panel
const receiveForm = document.getElementById('receiveForm');
const otpContainer = document.getElementById('otpContainer');
const otpInputs = Array.from(otpContainer.querySelectorAll('.otp-input'));
const btnFetchFile = document.getElementById('btnFetchFile');
const receiveLoading = document.getElementById('receiveLoading');
const receiveError = document.getElementById('receiveError');
const receiveErrorMessage = document.getElementById('receiveErrorMessage');
const btnTryAgain = document.getElementById('btnTryAgain');
const receiveSuccess = document.getElementById('receiveSuccess');
const readyIcon = document.getElementById('readyIcon');
const readyFileName = document.getElementById('readyFileName');
const readyFileSize = document.getElementById('readyFileSize');
const readyMimeType = document.getElementById('readyMimeType');
const readyCountdown = document.getElementById('readyCountdown');
const btnTriggerDownload = document.getElementById('btnTriggerDownload');

// DOM Elements - Modal & Toast
const qrModal = document.getElementById('qrModal');
const qrCodeImg = document.getElementById('qrCodeImg');
const qrCodeNumber = document.getElementById('qrCodeNumber');
const btnCloseQr = document.getElementById('btnCloseQr');
const toastContainer = document.getElementById('toastContainer');

// ==========================================================
// UTILITY FUNCTIONS
// ==========================================================

function formatBytes(bytes, decimals = 2) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

function getFileEmoji(fileName) {
  const ext = (fileName || '').split('.').pop().toLowerCase();
  switch (ext) {
    case 'pdf': return '📕';
    case 'doc': case 'docx': case 'txt': case 'rtf': return '📄';
    case 'zip': case 'rar': case '7z': case 'tar': case 'gz': return '🗄️';
    case 'jpg': case 'jpeg': case 'png': case 'gif': case 'webp': case 'svg': return '🖼️';
    case 'mp4': case 'mkv': case 'mov': case 'avi': case 'webm': return '🎬';
    case 'mp3': case 'wav': case 'flac': case 'ogg': return '🎵';
    case 'js': case 'ts': case 'py': case 'html': case 'css': case 'json': return '💻';
    case 'xls': case 'xlsx': case 'csv': return '📊';
    default: return '📦';
  }
}

function showToast(message, type = 'info', duration = 3500) {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(successMsg, 'success');
    }).catch(() => fallbackCopy(text, successMsg));
  } else {
    fallbackCopy(text, successMsg);
  }
}

function fallbackCopy(text, successMsg) {
  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  try {
    document.execCommand('copy');
    showToast(successMsg, 'success');
  } catch (err) {
    showToast('Failed to copy. Please select and copy manually.', 'error');
  }
  document.body.removeChild(tempInput);
}

// ==========================================================
// TAB SWITCHING
// ==========================================================

function switchTab(tabName) {
  if (tabName === 'send') {
    tabSend.classList.add('active');
    tabReceive.classList.remove('active');
    panelSend.classList.add('active');
    panelReceive.classList.remove('active');
  } else {
    tabReceive.classList.add('active');
    tabSend.classList.remove('active');
    panelReceive.classList.add('active');
    panelSend.classList.remove('active');
    // Focus first OTP input
    setTimeout(() => {
      const emptyInput = otpInputs.find(i => !i.value) || otpInputs[0];
      emptyInput.focus();
    }, 100);
  }
}

tabSend.addEventListener('click', () => switchTab('send'));
tabReceive.addEventListener('click', () => switchTab('receive'));

// ==========================================================
// SEND MODE: FILE SELECTION & DRAG & DROP
// ==========================================================

function handleFileSelection(file) {
  if (!file) return;

  if (file.size > MAX_FILE_SIZE) {
    showToast(`File size is ${formatBytes(file.size)}. Max allowed is 100 MB.`, 'error', 4500);
    fileInput.value = '';
    return;
  }

  selectedFile = file;

  // Update UI
  fileCardIcon.textContent = getFileEmoji(file.name);
  fileNameDisplay.textContent = file.name;
  fileSizeDisplay.textContent = formatBytes(file.size);
  fileSizeStatus.className = 'file-size-status valid';
  fileSizeStatus.textContent = `✓ ${formatBytes(file.size)} (Within 100MB limit)`;

  selectedFileCard.classList.remove('hidden');
  dropzone.classList.add('hidden');
  btnUpload.removeAttribute('disabled');
}

function clearSelectedFile() {
  selectedFile = null;
  fileInput.value = '';
  selectedFileCard.classList.add('hidden');
  dropzone.classList.remove('hidden');
  btnUpload.setAttribute('disabled', 'true');
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    handleFileSelection(e.target.files[0]);
  }
});

btnRemoveFile.addEventListener('click', (e) => {
  e.stopPropagation();
  clearSelectedFile();
});

// Drag & Drop
['dragenter', 'dragover'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.add('dragover');
  });
});

['dragleave', 'drop'].forEach(eventName => {
  dropzone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropzone.classList.remove('dragover');
  });
});

dropzone.addEventListener('drop', (e) => {
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleFileSelection(e.dataTransfer.files[0]);
  }
});

// Expiration radio pills styling
const expiryPills = document.querySelectorAll('.expiry-pill');
expiryPills.forEach(pill => {
  pill.addEventListener('click', () => {
    expiryPills.forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
  });
});

// ==========================================================
// SEND MODE: UPLOAD HANDLING WITH PROGRESS
// ==========================================================

btnUpload.addEventListener('click', () => {
  if (!selectedFile) return;

  const durationInput = document.querySelector('input[name="duration"]:checked');
  const duration = durationInput ? durationInput.value : '1d';
  const burnAfterDownload = checkBurnAfterDownload.checked;

  const formData = new FormData();
  formData.append('file', selectedFile);
  formData.append('duration', duration);
  formData.append('burnAfterDownload', burnAfterDownload);

  // Transition UI to progress view
  uploadView.classList.add('hidden');
  uploadProgressView.classList.remove('hidden');

  let startTime = Date.now();
  let lastLoaded = 0;
  let lastTime = startTime;

  currentUploadXhr = new XMLHttpRequest();

  currentUploadXhr.upload.addEventListener('progress', (e) => {
    if (e.lengthComputable) {
      const percentComplete = Math.round((e.loaded / e.total) * 100);
      progressBarFill.style.width = `${percentComplete}%`;
      progressPercent.textContent = `${percentComplete}%`;
      progressTransferred.textContent = `${formatBytes(e.loaded)} / ${formatBytes(e.total)}`;

      // Calculate upload speed
      const now = Date.now();
      const timeDiffSec = (now - lastTime) / 1000;
      if (timeDiffSec >= 0.5) {
        const bytesDiff = e.loaded - lastLoaded;
        const speedBytesPerSec = bytesDiff / timeDiffSec;
        progressSpeed.textContent = `${formatBytes(speedBytesPerSec)}/s`;
        lastLoaded = e.loaded;
        lastTime = now;
      }
    }
  });

  currentUploadXhr.addEventListener('load', () => {
    if (currentUploadXhr.status >= 200 && currentUploadXhr.status < 300) {
      try {
        const response = JSON.parse(currentUploadXhr.responseText);
        handleUploadSuccess(response);
      } catch (err) {
        showToast('Error parsing server response.', 'error');
        resetToUploadView();
      }
    } else {
      let errMsg = 'Failed to upload file.';
      try {
        const errObj = JSON.parse(currentUploadXhr.responseText);
        if (errObj.error) errMsg = errObj.error;
      } catch (e) {}
      showToast(errMsg, 'error');
      resetToUploadView();
    }
  });

  currentUploadXhr.addEventListener('error', () => {
    showToast('Network error during upload. Please check connection.', 'error');
    resetToUploadView();
  });

  currentUploadXhr.addEventListener('abort', () => {
    showToast('Upload was cancelled.', 'info');
    resetToUploadView();
  });

  currentUploadXhr.open('POST', '/api/upload');
  currentUploadXhr.send(formData);
});

btnCancelUpload.addEventListener('click', () => {
  if (currentUploadXhr) {
    currentUploadXhr.abort();
    currentUploadXhr = null;
  }
});

function resetToUploadView() {
  uploadProgressView.classList.add('hidden');
  uploadSuccessView.classList.add('hidden');
  uploadView.classList.remove('hidden');
  progressBarFill.style.width = '0%';
  progressPercent.textContent = '0%';
  progressTransferred.textContent = '0 MB / 0 MB';
  progressSpeed.textContent = '0 MB/s';
}

function handleUploadSuccess(data) {
  currentCode = data.code;

  // Split code into two groups of 3
  codePart1.textContent = currentCode.slice(0, 3);
  codePart2.textContent = currentCode.slice(3, 6);

  // Set link and QR
  directLinkInput.value = data.directUrl;
  qrCodeImg.src = data.qrCodeUrl;
  qrCodeNumber.textContent = `Code: ${currentCode.slice(0, 3)} - ${currentCode.slice(3, 6)}`;

  // Summary fields
  successFileName.textContent = data.file.originalName;
  successFileSize.textContent = formatBytes(data.file.size);
  const expiryDate = new Date(data.file.expiresAt);
  successExpiryDate.textContent = expiryDate.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });

  // Switch to success view
  uploadProgressView.classList.add('hidden');
  uploadSuccessView.classList.remove('hidden');

  showToast('File uploaded successfully! Code generated.', 'success');
}

// Success Actions
btnCopyCode.addEventListener('click', () => {
  copyToClipboard(currentCode, `Code ${currentCode} copied to clipboard!`);
});

btnCopyLink.addEventListener('click', () => {
  copyToClipboard(directLinkInput.value, 'Direct download link copied!');
});

btnShowQr.addEventListener('click', () => {
  qrModal.classList.remove('hidden');
});

btnCloseQr.addEventListener('click', () => {
  qrModal.classList.add('hidden');
});

qrModal.addEventListener('click', (e) => {
  if (e.target === qrModal) {
    qrModal.classList.add('hidden');
  }
});

btnSendAnother.addEventListener('click', () => {
  clearSelectedFile();
  resetToUploadView();
});

// ==========================================================
// RECEIVE MODE: 6-DIGIT OTP INPUT & DOWNLOAD
// ==========================================================

function getEnteredCode() {
  return otpInputs.map(input => input.value.trim()).join('');
}

function setEnteredCode(code) {
  const digits = code.replace(/\D/g, '').slice(0, 6).split('');
  otpInputs.forEach((input, idx) => {
    input.value = digits[idx] || '';
  });
}

// Handle OTP input navigation
otpInputs.forEach((input, index) => {
  // Input event (typing digit)
  input.addEventListener('input', (e) => {
    const val = e.target.value.replace(/\D/g, '');
    e.target.value = val.slice(-1); // only keep last typed digit

    if (val && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }

    // Auto submit if all 6 digits entered
    const fullCode = getEnteredCode();
    if (fullCode.length === 6) {
      fetchFileInfo(fullCode);
    }
  });

  // Keydown event (backspace & arrow keys)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Backspace') {
      if (!input.value && index > 0) {
        otpInputs[index - 1].focus();
      }
    } else if (e.key === 'ArrowLeft' && index > 0) {
      otpInputs[index - 1].focus();
    } else if (e.key === 'ArrowRight' && index < otpInputs.length - 1) {
      otpInputs[index + 1].focus();
    }
  });

  // Paste event (user pastes full 6 digits)
  input.addEventListener('paste', (e) => {
    e.preventDefault();
    const pasteData = (e.clipboardData || window.clipboardData).getData('text');
    const digits = pasteData.replace(/\D/g, '').slice(0, 6);

    if (digits.length > 0) {
      setEnteredCode(digits);
      const targetIndex = Math.min(digits.length, otpInputs.length - 1);
      otpInputs[targetIndex].focus();

      if (digits.length === 6) {
        fetchFileInfo(digits);
      }
    }
  });
});

receiveForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const code = getEnteredCode();
  if (code.length !== 6) {
    showToast('Please enter the full 6-digit code.', 'error');
    return;
  }
  fetchFileInfo(code);
});

// Fetch File Info by Code
async function fetchFileInfo(code) {
  // Reset previous states
  receiveError.classList.add('hidden');
  receiveSuccess.classList.add('hidden');
  receiveLoading.classList.remove('hidden');

  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }

  try {
    const res = await fetch(`/api/info/${code}`);
    const data = await res.json();
    receiveLoading.classList.add('hidden');

    if (!res.ok || !data.success) {
      receiveErrorMessage.textContent = data.error || 'Code not found or file has expired.';
      receiveError.classList.remove('hidden');
      return;
    }

    // File found! Populate ready card
    readyIcon.textContent = getFileEmoji(data.originalName);
    readyFileName.textContent = data.originalName;
    readyFileSize.textContent = formatBytes(data.size);
    readyMimeType.textContent = data.mimeType.split('/')[1]?.toUpperCase() || 'FILE';

    // Start live countdown
    startCountdown(data.expiresAt);

    // Setup download button
    btnTriggerDownload.onclick = () => {
      showToast(`Starting download: ${data.originalName}`, 'success');
      // Trigger native download
      window.location.href = `/api/download/${code}`;

      if (data.burnAfterDownload) {
        setTimeout(() => {
          showToast('🔥 Notice: This file was set to burn after download.', 'info', 5000);
        }, 1500);
      }
    };

    receiveSuccess.classList.remove('hidden');
  } catch (err) {
    receiveLoading.classList.add('hidden');
    receiveErrorMessage.textContent = 'Unable to connect to server. Please try again.';
    receiveError.classList.remove('hidden');
  }
}

function startCountdown(expiresAtIso) {
  const targetDate = new Date(expiresAtIso).getTime();

  function update() {
    const now = Date.now();
    const diff = targetDate - now;

    if (diff <= 0) {
      readyCountdown.textContent = 'Expired';
      readyCountdown.className = 'meta-tag countdown expired';
      btnTriggerDownload.setAttribute('disabled', 'true');
      btnTriggerDownload.innerHTML = 'File Expired';
      if (countdownInterval) clearInterval(countdownInterval);
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
    const minutes = Math.floor((diff / 1000 / 60) % 60);
    const seconds = Math.floor((diff / 1000) % 60);

    let text = 'Expires in: ';
    if (days > 0) {
      text += `${days}d ${hours}h ${minutes}m`;
    } else if (hours > 0) {
      text += `${hours}h ${minutes}m ${seconds}s`;
    } else {
      text += `${minutes}m ${seconds}s`;
    }

    readyCountdown.textContent = text;
  }

  update();
  countdownInterval = setInterval(update, 1000);
}

btnTryAgain.addEventListener('click', () => {
  receiveError.classList.add('hidden');
  setEnteredCode('');
  otpInputs[0].focus();
});

// ==========================================================
// URL HASH / QUERY PARAM AUTO-DETECTION
// ==========================================================

function handleDeepLink() {
  const hash = window.location.hash;
  const search = window.location.search;

  let code = null;

  // Check ?code=XXXXXX in search
  const urlParams = new URLSearchParams(search);
  if (urlParams.has('code')) {
    code = urlParams.get('code');
  }

  // Check #receive?code=XXXXXX in hash
  if (!code && hash.includes('code=')) {
    const hashParams = new URLSearchParams(hash.substring(hash.indexOf('?') + 1));
    code = hashParams.get('code');
  }

  if (code) {
    code = code.replace(/\D/g, '').slice(0, 6);
    if (code.length === 6) {
      switchTab('receive');
      setEnteredCode(code);
      fetchFileInfo(code);
    }
  } else if (hash.includes('receive')) {
    switchTab('receive');
  }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
  handleDeepLink();
});

window.addEventListener('hashchange', () => {
  handleDeepLink();
});
