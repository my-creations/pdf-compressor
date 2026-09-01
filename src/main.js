import confetti from 'canvas-confetti';
import { compressPdf, formatMB } from './pdfCompressor.js';

// DOM Elements
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

const uploadSection = document.getElementById('uploadSection');
const selectedSection = document.getElementById('selectedSection');
const progressSection = document.getElementById('progressSection');
const resultSection = document.getElementById('resultSection');

const fileNameEl = document.getElementById('fileName');
const originalSizeBadge = document.getElementById('originalSizeBadge');

const compressBtn = document.getElementById('compressBtn');
const cancelBtn = document.getElementById('cancelBtn');

const statusText = document.getElementById('statusText');
const subStatusText = document.getElementById('subStatusText');
const progressBar = document.getElementById('progressBar');
const progressPercent = document.getElementById('progressPercent');

const resOriginalSize = document.getElementById('resOriginalSize');
const resCompressedSize = document.getElementById('resCompressedSize');
const resReduction = document.getElementById('resReduction');
const downloadBtn = document.getElementById('downloadBtn');
const downloadBtnSize = document.getElementById('downloadBtnSize');
const resetBtn = document.getElementById('resetBtn');

let selectedFile = null;
let currentBlobUrl = null;

// Drag & Drop event handlers
['dragenter', 'dragover'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag-over');
  }, false);
});

['dragleave', 'drop'].forEach(eventName => {
  dropZone.addEventListener(eventName, (e) => {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag-over');
  }, false);
});

dropZone.addEventListener('drop', (e) => {
  const dt = e.dataTransfer;
  const files = dt.files;
  if (files && files.length > 0 && files[0].type === 'application/pdf') {
    handleFileSelect(files[0]);
  } else {
    alert('Por favor selecione um ficheiro em formato PDF.');
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files.length > 0) {
    handleFileSelect(e.target.files[0]);
  }
});

function handleFileSelect(file) {
  if (file.type !== 'application/pdf') {
    alert('Ficheiro inválido. Por favor selecione um ficheiro PDF.');
    return;
  }

  selectedFile = file;
  fileNameEl.textContent = file.name;
  originalSizeBadge.textContent = `Tamanho: ${formatMB(file.size)}`;

  uploadSection.classList.add('hidden');
  selectedSection.classList.remove('hidden');
}

cancelBtn.addEventListener('click', () => {
  resetState();
});

resetBtn.addEventListener('click', () => {
  resetState();
});

function resetState() {
  selectedFile = null;
  fileInput.value = '';
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
    currentBlobUrl = null;
  }

  uploadSection.classList.remove('hidden');
  selectedSection.classList.add('hidden');
  progressSection.classList.add('hidden');
  resultSection.classList.add('hidden');
}

compressBtn.addEventListener('click', async () => {
  if (!selectedFile) return;

  selectedSection.classList.add('hidden');
  progressSection.classList.remove('hidden');

  updateProgress(0, 'A preparar ficheiro...');

  try {
    const arrayBuffer = await selectedFile.arrayBuffer();

    const result = await compressPdf(arrayBuffer, (percent, message) => {
      updateProgress(percent, message);
    });

    displayResult(result);
  } catch (error) {
    console.error('Erro ao comprimir PDF:', error);
    alert(`Ocorreu um erro ao processar o ficheiro PDF: ${error.message}`);
    resetState();
  }
});

function updateProgress(percent, message) {
  progressBar.style.width = `${percent}%`;
  progressPercent.textContent = `${percent}%`;
  statusText.textContent = message;
}

function displayResult(result) {
  progressSection.classList.add('hidden');
  resultSection.classList.remove('hidden');

  const origMB = formatMB(result.originalSize);
  const compMB = formatMB(result.compressedSize);
  const reduction = Math.round((1 - result.compressedSize / result.originalSize) * 100);

  resOriginalSize.textContent = origMB;
  resCompressedSize.textContent = compMB;
  resReduction.textContent = reduction > 0 ? `-${reduction}%` : '0%';

  // Generate downloadable Blob URL
  const blob = new Blob([result.pdfBytes], { type: 'application/pdf' });
  if (currentBlobUrl) {
    URL.revokeObjectURL(currentBlobUrl);
  }
  currentBlobUrl = URL.createObjectURL(blob);

  // Set up download link
  const originalName = selectedFile.name.replace(/\.pdf$/i, '');
  downloadBtn.href = currentBlobUrl;
  downloadBtn.download = `${originalName}_under2MB.pdf`;
  downloadBtnSize.textContent = compMB;

  // Trigger celebration confetti
  confetti({
    particleCount: 80,
    spread: 60,
    origin: { y: 0.6 }
  });
}
