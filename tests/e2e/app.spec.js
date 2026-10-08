import { test, expect } from '@playwright/test';
import { PDFDocument, PDFName, rgb, StandardFonts } from 'pdf-lib';

const MB = 1024 * 1024;

/** Small text-only PDF. */
async function textPdf(pageCount = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const page = doc.addPage([595, 842]);
    page.drawText(`Página de teste #${i + 1}`, { x: 50, y: 760, size: 24, font, color: rgb(0.1, 0.2, 0.7) });
    page.drawRectangle({ x: 50, y: 200, width: 495, height: 400, color: rgb(0.9, 0.95, 1) });
  }
  return Buffer.from(await doc.save());
}

/**
 * Photo-like JPEG made in the browser (smooth gradient + grain), encoded at
 * high quality so it is large, like a phone photo or a 300 dpi scan.
 */
async function browserJpeg(page, width, height, { grain = 40, quality = 0.97, seed = 1 } = {}) {
  const bytes = await page.evaluate(async ({ width, height, grain, quality, seed }) => {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(width, height);
    let s = seed * 9301 + 49297;
    const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        if (grain === 'noise') {
          img.data[i] = rand() * 255;
          img.data[i + 1] = rand() * 255;
          img.data[i + 2] = rand() * 255;
        } else {
          const n = (rand() - 0.5) * grain;
          img.data[i] = (x / width) * 200 + 30 + n;
          img.data[i + 1] = (y / height) * 180 + 40 + n;
          img.data[i + 2] = ((x + y) / (width + height)) * 160 + 60 + n;
        }
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }, { width, height, grain, quality, seed });
  return Buffer.from(bytes, 'base64');
}

/** PDF with text plus one big embedded photo per page (scanned-document style). */
async function photoPdf(page, pageCount, opts = {}) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pageCount; i++) {
    const jpeg = await browserJpeg(page, opts.width || 2000, opts.height || 2600, { ...opts, seed: i + 1 });
    const image = await doc.embedJpg(jpeg);
    const p = doc.addPage([595, 842]);
    p.drawImage(image, { x: 40, y: 120, width: 515, height: 680 });
    p.drawText(`Documento digitalizado ${i + 1}`, { x: 40, y: 60, size: 18, font });
  }
  return Buffer.from(await doc.save());
}

async function upload(page, files) {
  await page.locator('#fileInput').setInputFiles(files);
  await expect(page.locator('#workspaceView')).toBeVisible();
}

async function resultBytes(page, index = 0) {
  const href = await page.locator('.download-link').nth(index).getAttribute('href');
  const base64 = await page.evaluate(async (url) => {
    const blob = await (await fetch(url)).blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  }, href);
  return new Uint8Array(Buffer.from(base64, 'base64'));
}

function hasFonts(doc) {
  return doc.getPages().every((p) => p.node.Resources()?.lookup(PDFName.of('Font')));
}

test.describe('PDF Compressor', () => {
  test('shows the upload step with privacy notice', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Compressor de PDF/);
    await expect(page.locator('h1')).toHaveText('Compressor de PDF');
    await expect(page.locator('.privacy-pill')).toBeVisible();
    await expect(page.locator('#uploadView')).toBeVisible();
    await expect(page.locator('#workspaceView')).toBeHidden();
    await expect(page.locator('#stepper li').first()).toHaveAttribute('aria-current', 'step');
  });

  test('keeps a file that is already small untouched', async ({ page }) => {
    await page.goto('/');
    await upload(page, { name: 'pequeno.pdf', mimeType: 'application/pdf', buffer: await textPdf(3) });

    await expect(page.locator('#wsSummary')).toContainText('1 ficheiro · 3 páginas');
    await expect(page.locator('.page-card')).toHaveCount(3);
    await page.locator('#compressBtn').click();

    await expect(page.locator('#resultsView')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#resultTitle')).toHaveText('Pronto a submeter!');
    await expect(page.locator('[data-testid="status"]')).toContainText('Abaixo de 2 MB');
    await expect(page.locator('.download-link')).toHaveAttribute('download', 'pequeno_2MB.pdf');
    await expect(page.locator('.result-mode')).toContainText(/sem alterações|sem perda/);
  });

  test('recompresses embedded photos below 2 MB and keeps the text', async ({ page }) => {
    await page.goto('/');
    const input = await photoPdf(page, 3);
    expect(input.length).toBeGreaterThan(2 * MB);

    await upload(page, { name: 'digitalizado.pdf', mimeType: 'application/pdf', buffer: input });
    await page.locator('#compressBtn').click();

    await expect(page.locator('#resultsView')).toBeVisible({ timeout: 45000 });
    await expect(page.locator('[data-testid="status"]')).toContainText('Abaixo de 2 MB');
    await expect(page.locator('.result-mode')).toContainText('texto preservado');

    const out = await resultBytes(page);
    expect(out.length).toBeLessThanOrEqual(2 * MB);
    const doc = await PDFDocument.load(out);
    expect(doc.getPageCount()).toBe(3);
    expect(hasFonts(doc)).toBe(true);
  });

  test('turns photos into one merged PDF with edited pages', async ({ page }) => {
    await page.goto('/');
    const photo1 = await browserJpeg(page, 1600, 1200, { seed: 3 });
    const photo2 = await browserJpeg(page, 1200, 1600, { seed: 4 });
    await upload(page, [
      { name: 'foto1.jpg', mimeType: 'image/jpeg', buffer: photo1 },
      { name: 'foto2.jpg', mimeType: 'image/jpeg', buffer: photo2 },
      { name: 'texto.pdf', mimeType: 'application/pdf', buffer: await textPdf(2) },
    ]);

    await expect(page.locator('#wsSummary')).toContainText('3 ficheiros · 4 páginas');
    await expect(page.locator('#outputOption')).toBeVisible();
    await expect(page.locator('#photoOption')).toBeVisible();
    await expect(page.locator('#compressBtnLabel')).toHaveText('Juntar e comprimir para menos de 2 MB');

    // Delete the second PDF page and rotate the first photo.
    await page.getByRole('button', { name: 'Apagar página 2' }).click();
    await page.getByRole('button', { name: 'Rodar página 1' }).first().click();
    await expect(page.locator('#wsSummary')).toContainText('3 páginas');

    await page.locator('#compressBtn').click();
    await expect(page.locator('#resultsView')).toBeVisible({ timeout: 30000 });
    await expect(page.locator('.result-item')).toHaveCount(1);
    await expect(page.locator('.download-link')).toHaveAttribute('download', 'foto1_junto_2MB.pdf');

    const doc = await PDFDocument.load(await resultBytes(page));
    expect(doc.getPageCount()).toBe(3);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
  });

  test('produces separate PDFs with a ZIP option and a custom size', async ({ page }) => {
    await page.goto('/');
    await upload(page, [
      { name: 'a.pdf', mimeType: 'application/pdf', buffer: await textPdf(1) },
      { name: 'b.pdf', mimeType: 'application/pdf', buffer: await textPdf(2) },
    ]);
    await page.getByText('Um PDF por ficheiro').click();
    await page.getByText('Outro', { exact: true }).click();
    await page.locator('#customTarget').fill('abc');
    await expect(page.locator('#compressBtn')).toBeDisabled();
    await expect(page.locator('#targetHint')).toHaveText(/entre 0,1 e 500/);
    await page.locator('#customTarget').fill('1,5');
    await expect(page.locator('#compressBtnLabel')).toHaveText('Comprimir para menos de 1.5 MB');

    await page.locator('#compressBtn').click();
    await expect(page.locator('#resultsView')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('.result-item')).toHaveCount(2);
    await expect(page.locator('#zipBtn')).toBeVisible();

    const download = page.waitForEvent('download');
    await page.locator('#zipBtn').click();
    expect((await download).suggestedFilename()).toBe('pdf_comprimidos.zip');

    // Going back keeps the files and settings.
    await page.locator('#backBtn').click();
    await expect(page.locator('.file-group')).toHaveCount(2);
    await expect(page.locator('#customTarget')).toHaveValue('1,5');
  });

  test('is honest when the target cannot be reached', async ({ page }) => {
    await page.goto('/');
    const input = await photoPdf(page, 12, { width: 520, height: 700, grain: 'noise' });
    await upload(page, { name: 'ruido.pdf', mimeType: 'application/pdf', buffer: input });
    await page.getByText('Outro', { exact: true }).click();
    await page.locator('#customTarget').fill('0.1');
    await page.locator('#compressBtn').click();

    await expect(page.locator('#resultsView')).toBeVisible({ timeout: 50000 });
    await expect(page.locator('#resultTitle')).toHaveText('Quase lá');
    await expect(page.locator('[data-testid="status"]')).toContainText('Acima de 0.1 MB');
  });

  test('switches to English and remembers it', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'EN' }).click();
    await expect(page.locator('h1')).toHaveText('PDF Compressor');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.reload();
    await expect(page.locator('.dropzone-title')).toHaveText('Drag PDFs or photos here');
  });

  test('rejects unsupported files with a visible message', async ({ page }) => {
    await page.goto('/');
    await page.locator('#fileInput').setInputFiles({ name: 'notas.txt', mimeType: 'text/plain', buffer: Buffer.from('olá') });
    await expect(page.locator('.toast')).toContainText('não é um PDF');
    await expect(page.locator('#uploadView')).toBeVisible();
  });

  test('cancelling returns to the workspace', async ({ page }) => {
    await page.goto('/');
    await upload(page, { name: 'grande.pdf', mimeType: 'application/pdf', buffer: await photoPdf(page, 3) });
    await page.locator('#compressBtn').click();
    await expect(page.locator('#progressView')).toBeVisible();
    await page.locator('#cancelBtn').click();
    await expect(page.locator('#workspaceView')).toBeVisible();
    await expect(page.locator('.page-card')).toHaveCount(3);
  });
});
