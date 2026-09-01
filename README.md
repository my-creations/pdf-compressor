# PDF Compressor (< 2 MB) 📄⚡

A fast, client-side web application designed to compress PDF documents larger than 2 MB down to **under 2 MB** for online portal submissions.

Hosted on **GitHub Pages** with continuous deployment via **GitHub Actions**.

## 🌟 Key Features

- **⚡ Client-Side WebAssembly / Canvas Engine**: Compression runs directly inside the user's web browser using high-performance image processing and PDF stream optimization.
- **🔒 100% Private**: Your PDF never leaves your device. Zero server uploads, zero privacy risks.
- **🎯 Guaranteed Target Size (< 2 MB)**: Adaptively adjusts DPI scaling and compression quality to strictly ensure the final output file is under 2.0 MB while preserving document clarity.
- **👨‍👩‍👧 Designed for Parents**: Extremely clean, accessible interface with drag-and-drop support, progress tracking, and one-click download.
- **🎉 Confetti Feedback**: Friendly visual confirmation once compression completes.

## 🚀 How It Works

1. **Select / Drag & Drop**: Drop any PDF file (e.g. 5 MB, 15 MB, 30 MB).
2. **Adaptive Pass Algorithm**:
   - Renders PDF pages to offscreen canvas contexts.
   - Calculates target scale and JPEG compression factor.
   - Re-builds PDF streams with embedded compressed images.
3. **One-Click Download**: Download the generated PDF (< 2 MB) instantly.

## 🛠 Local Development

```bash
# Clone the repository
git clone https://github.com/my-creations/pdf-compressor.git
cd pdf-compressor

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

## 📦 Deployment

Automatically deployed to GitHub Pages on push to `main` branch via GitHub Actions workflow defined in `.github/workflows/deploy.yml`.

To enable GitHub Pages in your repository settings:
1. Go to **Settings** > **Pages**.
2. Under **Build and deployment** > **Source**, select **GitHub Actions**.
