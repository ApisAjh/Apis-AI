/* =========================================================
   APIS AI — upload.js
   Handles image & file attachment selection, validation,
   and preview before sending.
   ========================================================= */

const ApisUpload = (() => {
  const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const FILE_TYPES_EXT = ['pdf', 'docx', 'txt', 'xlsx', 'pptx', 'zip'];
  const MAX_SIZE = 20 * 1024 * 1024; // 20MB demo cap

  function extOf(name) {
    return (name.split('.').pop() || '').toLowerCase();
  }

  function fileToDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageFiles(fileList) {
    for (const file of fileList) {
      if (!IMAGE_TYPES.includes(file.type)) {
        showToast(`Format gambar tidak didukung: ${file.name}`, 'error');
        continue;
      }
      if (file.size > MAX_SIZE) {
        showToast(`Ukuran gambar terlalu besar: ${file.name}`, 'error');
        continue;
      }
      const dataUrl = await fileToDataURL(file);
      ApisChat.addPendingAttachment({ type: 'image', data: dataUrl, name: file.name, size: file.size });
    }
  }

  async function handleGenericFiles(fileList) {
    for (const file of fileList) {
      const ext = extOf(file.name);
      if (!FILE_TYPES_EXT.includes(ext)) {
        showToast(`Tipe file .${ext} tidak didukung`, 'error');
        continue;
      }
      if (file.size > MAX_SIZE) {
        showToast(`Ukuran file terlalu besar: ${file.name}`, 'error');
        continue;
      }
      ApisChat.addPendingAttachment({ type: 'file', name: file.name, size: file.size, ext });
      showToast(`${file.name} siap dikirim`, 'success', 1800);
    }
  }

  function init() {
    const imageInput = document.getElementById('image-upload-input');
    const fileInput = document.getElementById('file-upload-input');
    const imageBtn = document.getElementById('upload-image-btn');
    const fileBtn = document.getElementById('upload-file-btn');

    imageBtn?.addEventListener('click', () => imageInput.click());
    fileBtn?.addEventListener('click', () => fileInput.click());

    imageInput?.addEventListener('change', (e) => {
      handleImageFiles(e.target.files);
      imageInput.value = '';
    });
    fileInput?.addEventListener('change', (e) => {
      handleGenericFiles(e.target.files);
      fileInput.value = '';
    });

    // Drag & drop onto composer
    const composer = document.querySelector('.composer');
    if (composer) {
      ['dragover', 'drop'].forEach(evt => composer.addEventListener(evt, (e) => e.preventDefault()));
      composer.addEventListener('drop', (e) => {
        const files = Array.from(e.dataTransfer.files);
        const images = files.filter(f => IMAGE_TYPES.includes(f.type));
        const others = files.filter(f => !IMAGE_TYPES.includes(f.type));
        if (images.length) handleImageFiles(images);
        if (others.length) handleGenericFiles(others);
      });
    }
  }

  return { init };
})();
