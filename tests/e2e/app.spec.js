import { test, expect } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';

/**
 * Helper to generate a valid test PDF in memory
 */
async function generateTestPdf(pageCount = 2) {
  const pdfDoc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([600, 800]);
    page.drawText(`Página de teste #${i + 1} - Compressor de PDF`, {
      x: 50,
      y: 700,
      size: 24,
      color: rgb(0.1, 0.2, 0.7),
    });
    page.drawRectangle({
      x: 50,
      y: 200,
      width: 500,
      height: 400,
      color: rgb(0.9, 0.95, 1.0),
    });
  }
  return await pdfDoc.save();
}

test.describe('PDF Compressor E2E Flow', () => {
  test('should display initial header, privacy badge and upload dropzone', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle(/Compressor de PDF/);
    await expect(page.locator('h1')).toContainText('Compressor de PDF');
    await expect(page.locator('.privacy-badge')).toBeVisible();
    await expect(page.locator('#uploadSection')).toBeVisible();
    await expect(page.locator('#selectedSection')).toBeHidden();
    await expect(page.locator('#progressSection')).toBeHidden();
    await expect(page.locator('#resultSection')).toBeHidden();
  });

  test('should select a PDF, compress it and display download result (< 2 MB)', async ({ page }) => {
    await page.goto('/');

    const pdfBuffer = await generateTestPdf(3);

    // Upload PDF via file input
    const fileInput = page.locator('#fileInput');
    await fileInput.setInputFiles({
      name: 'documento-teste.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBuffer),
    });

    // Verify transition to Selected section
    await expect(page.locator('#uploadSection')).toBeHidden();
    await expect(page.locator('#selectedSection')).toBeVisible();
    await expect(page.locator('#fileName')).toHaveText('documento-teste.pdf');
    await expect(page.locator('#originalSizeBadge')).toContainText('Tamanho:');

    // Click compress button
    await page.locator('#compressBtn').click();

    // Verify progress screen appears then moves to result
    await expect(page.locator('#resultSection')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('.success-banner h2')).toHaveText('Concluído com sucesso!');
    await expect(page.locator('#underTwoMbBadge')).toContainText('inferior a 2.0 MB');

    // Verify download button has download attribute and blob URL
    const downloadBtn = page.locator('#downloadBtn');
    await expect(downloadBtn).toBeVisible();
    await expect(downloadBtn).toHaveAttribute('download', /documento-teste_under2MB\.pdf/);
    const href = await downloadBtn.getAttribute('href');
    expect(href).toMatch(/^blob:/);

    // Test reset button
    await page.locator('#resetBtn').click();
    await expect(page.locator('#uploadSection')).toBeVisible();
    await expect(page.locator('#resultSection')).toBeHidden();
  });

  test('should allow cancelling a selected file before compression', async ({ page }) => {
    await page.goto('/');

    const pdfBuffer = await generateTestPdf(1);
    await page.locator('#fileInput').setInputFiles({
      name: 'cancelar.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from(pdfBuffer),
    });

    await expect(page.locator('#selectedSection')).toBeVisible();
    await page.locator('#cancelBtn').click();

    await expect(page.locator('#uploadSection')).toBeVisible();
    await expect(page.locator('#selectedSection')).toBeHidden();
  });
});
