export const SUPPORTED_LANGS = ['pt', 'en'];
const STORAGE_KEY = 'pdfc.lang';

export const messages = {
  pt: {
    'app.docTitle': 'Compressor de PDF — reduza PDFs e fotos para o tamanho certo',
    'app.title': 'Compressor de PDF',
    'app.subtitle': 'Reduza PDFs e fotos para o tamanho que o portal pede, em segundos.',
    'app.privacy': 'Privado: os ficheiros nunca saem do seu dispositivo',
    'lang.label': 'Idioma',

    'step.choose': 'Escolher',
    'step.adjust': 'Ajustar',
    'step.download': 'Descarregar',

    'drop.title': 'Arraste PDFs ou fotos para aqui',
    'drop.hint': 'ou clique para escolher. Pode juntar vários ficheiros.',
    'drop.button': 'Escolher ficheiros',
    'drop.formats': 'PDF, JPG, PNG ou WebP',
    'feature.compress': 'Comprime até ao tamanho que escolher',
    'feature.text': 'Mantém o texto selecionável',
    'feature.photos': 'Fotos do telemóvel → PDF',
    'feature.merge': 'Junta vários ficheiros num só',

    'ws.files_one': '1 ficheiro',
    'ws.files_other': '{n} ficheiros',
    'ws.pages_one': '1 página',
    'ws.pages_other': '{n} páginas',
    'ws.addMore': 'Adicionar',
    'ws.clear': 'Recomeçar',
    'ws.empty': 'Todas as páginas foram removidas. Adicione ficheiros para continuar.',
    'ws.loading': 'A abrir…',
    'file.moveUp': 'Mover “{name}” para cima',
    'file.moveDown': 'Mover “{name}” para baixo',
    'file.remove': 'Remover “{name}”',
    'page.label': 'Página {n}',
    'page.rotate': 'Rodar página {n}',
    'page.moveBack': 'Mover página {n} para trás',
    'page.moveForward': 'Mover página {n} para a frente',
    'page.delete': 'Apagar página {n}',

    'opt.target': 'Tamanho máximo',
    'opt.targetHint': 'Muitos portais aceitam no máximo 2 MB.',
    'opt.custom': 'Outro',
    'opt.customLabel': 'Tamanho em MB',
    'opt.customInvalid': 'Indique um valor entre 0,1 e 500 MB.',
    'opt.output': 'Resultado',
    'opt.merge': 'Juntar num só PDF',
    'opt.separate': 'Um PDF por ficheiro',
    'opt.grayscale': 'Preto e branco',
    'opt.grayscaleHint': 'Fotos e digitalizações em tons de cinzento: ficheiro ainda mais pequeno.',
    'opt.photoPage': 'Página das fotos',
    'opt.photoA4': 'A4',
    'opt.photoFit': 'Tamanho da foto',
    'cta.compress': 'Comprimir para menos de {size}',
    'cta.merge': 'Juntar e comprimir para menos de {size}',

    'progress.title': 'A otimizar os seus ficheiros…',
    'progress.file': 'Ficheiro {n} de {total}',
    'progress.cancel': 'Cancelar',
    'progress.starting': 'A preparar…',
    'progress.reading': 'A ler o PDF…',
    'progress.lossless': 'A limpar o ficheiro sem perder qualidade…',
    'progress.images': 'A recomprimir imagens ({done}/{total}, qualidade {quality}%)…',
    'progress.saving': 'A guardar…',
    'progress.raster': 'A converter páginas em imagem ({page}/{total})…',
    'progress.assembling': 'A preparar as páginas…',

    'result.okTitle': 'Pronto a submeter!',
    'result.okBody_one': 'O seu ficheiro está abaixo de {size}.',
    'result.okBody_other': 'Os {n} ficheiros estão abaixo de {size}.',
    'result.failTitle': 'Quase lá',
    'result.failBody': 'Não foi possível ficar abaixo de {size}. Experimente “Preto e branco”, um tamanho maior ou remover páginas.',
    'result.ok': 'Abaixo de {size}',
    'result.fail': 'Acima de {size}',
    'result.download': 'Descarregar',
    'result.compare': 'Comparar',
    'result.zip': 'Descarregar tudo (ZIP)',
    'result.share': 'Partilhar',
    'result.back': 'Voltar a ajustar',
    'result.again': 'Novos ficheiros',
    'result.original': 'Original',
    'result.new': 'Novo',
    'result.reduction': 'Redução',
    'mode.original': 'Já estava abaixo do limite, sem alterações',
    'mode.lossless': 'Otimizado sem perda de qualidade',
    'mode.images': 'Imagens recomprimidas, texto preservado',
    'mode.raster': 'Páginas convertidas em imagem: o texto deixa de ser selecionável',
    'mode.photos': 'Fotos convertidas em PDF e otimizadas',

    'compare.title': 'Antes e depois',
    'compare.before': 'Original',
    'compare.after': 'Comprimido',
    'compare.page': 'Página {n} de {total}',
    'compare.prev': 'Página anterior',
    'compare.next': 'Página seguinte',
    'compare.close': 'Fechar',

    'error.notSupported': '“{name}” não é um PDF nem uma imagem suportada.',
    'error.image-unsupported': '“{name}”: este formato de imagem não funciona neste navegador. Guarde-a como JPG ou PNG.',
    'error.password': '“{name}” está protegido por palavra-passe. Remova a proteção e tente novamente.',
    'error.encrypted': '“{name}” tem restrições de edição e não pode ser juntado nem editado. Comprima-o sozinho, sem alterar páginas.',
    'error.unreadable': '“{name}” parece estar danificado e não pode ser lido.',
    'error.failed': 'Ocorreu um erro inesperado: {message}',
    'error.noPages': 'Não há páginas para comprimir.',
    'toast.close': 'Fechar aviso',

    'footer.privacy': 'Tudo acontece no seu navegador. Nenhum ficheiro é enviado para servidores.',
    'footer.offline': 'Depois da primeira visita, funciona mesmo sem internet.',
    'footer.install': 'Instalar app',
  },

  en: {
    'app.docTitle': 'PDF Compressor — shrink PDFs and photos to the size you need',
    'app.title': 'PDF Compressor',
    'app.subtitle': 'Shrink PDFs and photos to the size an upload form asks for, in seconds.',
    'app.privacy': 'Private: your files never leave your device',
    'lang.label': 'Language',

    'step.choose': 'Choose',
    'step.adjust': 'Adjust',
    'step.download': 'Download',

    'drop.title': 'Drag PDFs or photos here',
    'drop.hint': 'or click to choose. You can combine several files.',
    'drop.button': 'Choose files',
    'drop.formats': 'PDF, JPG, PNG or WebP',
    'feature.compress': 'Compresses to the size you pick',
    'feature.text': 'Keeps text selectable',
    'feature.photos': 'Phone photos → PDF',
    'feature.merge': 'Merges several files into one',

    'ws.files_one': '1 file',
    'ws.files_other': '{n} files',
    'ws.pages_one': '1 page',
    'ws.pages_other': '{n} pages',
    'ws.addMore': 'Add',
    'ws.clear': 'Start over',
    'ws.empty': 'All pages were removed. Add files to continue.',
    'ws.loading': 'Opening…',
    'file.moveUp': 'Move “{name}” up',
    'file.moveDown': 'Move “{name}” down',
    'file.remove': 'Remove “{name}”',
    'page.label': 'Page {n}',
    'page.rotate': 'Rotate page {n}',
    'page.moveBack': 'Move page {n} back',
    'page.moveForward': 'Move page {n} forward',
    'page.delete': 'Delete page {n}',

    'opt.target': 'Maximum size',
    'opt.targetHint': 'Many upload forms accept 2 MB at most.',
    'opt.custom': 'Other',
    'opt.customLabel': 'Size in MB',
    'opt.customInvalid': 'Enter a value between 0.1 and 500 MB.',
    'opt.output': 'Output',
    'opt.merge': 'Merge into one PDF',
    'opt.separate': 'One PDF per file',
    'opt.grayscale': 'Black & white',
    'opt.grayscaleHint': 'Photos and scans in grayscale: an even smaller file.',
    'opt.photoPage': 'Photo page size',
    'opt.photoA4': 'A4',
    'opt.photoFit': 'Photo size',
    'cta.compress': 'Compress to under {size}',
    'cta.merge': 'Merge and compress to under {size}',

    'progress.title': 'Optimizing your files…',
    'progress.file': 'File {n} of {total}',
    'progress.cancel': 'Cancel',
    'progress.starting': 'Getting ready…',
    'progress.reading': 'Reading the PDF…',
    'progress.lossless': 'Cleaning up the file without losing quality…',
    'progress.images': 'Recompressing images ({done}/{total}, quality {quality}%)…',
    'progress.saving': 'Saving…',
    'progress.raster': 'Converting pages to images ({page}/{total})…',
    'progress.assembling': 'Preparing pages…',

    'result.okTitle': 'Ready to upload!',
    'result.okBody_one': 'Your file is under {size}.',
    'result.okBody_other': 'All {n} files are under {size}.',
    'result.failTitle': 'Almost there',
    'result.failBody': 'Could not get under {size}. Try “Black & white”, a larger size, or removing pages.',
    'result.ok': 'Under {size}',
    'result.fail': 'Over {size}',
    'result.download': 'Download',
    'result.compare': 'Compare',
    'result.zip': 'Download all (ZIP)',
    'result.share': 'Share',
    'result.back': 'Back to adjust',
    'result.again': 'New files',
    'result.original': 'Original',
    'result.new': 'New',
    'result.reduction': 'Saved',
    'mode.original': 'Already under the limit, left unchanged',
    'mode.lossless': 'Optimized with no quality loss',
    'mode.images': 'Images recompressed, text preserved',
    'mode.raster': 'Pages converted to images: text is no longer selectable',
    'mode.photos': 'Photos converted to PDF and optimized',

    'compare.title': 'Before and after',
    'compare.before': 'Original',
    'compare.after': 'Compressed',
    'compare.page': 'Page {n} of {total}',
    'compare.prev': 'Previous page',
    'compare.next': 'Next page',
    'compare.close': 'Close',

    'error.notSupported': '“{name}” is not a PDF or a supported image.',
    'error.image-unsupported': '“{name}”: this image format does not work in this browser. Save it as JPG or PNG.',
    'error.password': '“{name}” is password protected. Remove the password and try again.',
    'error.encrypted': '“{name}” has editing restrictions and cannot be merged or edited. Compress it on its own without changing pages.',
    'error.unreadable': '“{name}” seems to be damaged and cannot be read.',
    'error.failed': 'Something went wrong: {message}',
    'error.noPages': 'There are no pages to compress.',
    'toast.close': 'Dismiss',

    'footer.privacy': 'Everything happens in your browser. No file is uploaded to any server.',
    'footer.offline': 'After the first visit it works even without internet.',
    'footer.install': 'Install app',
  },
};

let current = 'pt';
const listeners = new Set();

/** Pick a language: saved choice, then browser preference, then Portuguese. */
export function detectLanguage(saved, browserLangs = []) {
  if (SUPPORTED_LANGS.includes(saved)) return saved;
  for (const lang of browserLangs) {
    const code = String(lang).toLowerCase().slice(0, 2);
    if (SUPPORTED_LANGS.includes(code)) return code;
  }
  return 'pt';
}

export function initLanguage() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* storage unavailable */ }
  const browserLangs = typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : [];
  setLanguage(detectLanguage(saved, browserLangs), { persist: false });
}

export function getLanguage() {
  return current;
}

export function setLanguage(lang, { persist = true } = {}) {
  current = SUPPORTED_LANGS.includes(lang) ? lang : 'pt';
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, current); } catch { /* storage unavailable */ }
  }
  if (typeof document !== 'undefined') {
    document.documentElement.lang = current === 'pt' ? 'pt-PT' : 'en';
    document.title = t('app.docTitle');
    applyTranslations(document);
  }
  listeners.forEach((fn) => fn(current));
}

export function onLanguageChange(fn) {
  listeners.add(fn);
}

/** Translate a key, interpolating {params}. */
export function t(key, params = {}, lang = current) {
  const template = messages[lang]?.[key] ?? messages.pt[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => (name in params ? String(params[name]) : `{${name}}`));
}

/** Plural-aware translation using `key_one` / `key_other`. */
export function tn(key, n, params = {}, lang = current) {
  return t(`${key}_${n === 1 ? 'one' : 'other'}`, { n, ...params }, lang);
}

/** Use the decimal comma in Portuguese ("1,5 MB"); English keeps the point. */
export function localizeNumber(text, lang = current) {
  return lang === 'pt' ? String(text).replace(/(\d)\.(\d)/g, '$1,$2') : String(text);
}

/**
 * Fill elements marked with data-i18n (text) and data-i18n-attr ("attr:key;attr:key").
 */
export function applyTranslations(root) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':').map((s) => s.trim());
      if (attr && key) el.setAttribute(attr, t(key));
    }
  });
}
