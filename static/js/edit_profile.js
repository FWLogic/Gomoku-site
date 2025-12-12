// Edit profile page JS: preview selected avatar image immediately
document.addEventListener('DOMContentLoaded', function () {
  const fileInput = document.getElementById('id_avatar');
  const preview = document.querySelector('.avatar-preview');
  const clearCheckbox = document.querySelector('input[name="clear_avatar"]');

  if (!fileInput || !preview) return;

  // Save initial preview HTML so we can restore it when clear-avatar is unchecked
  const initialPreviewHTML = preview.innerHTML;
  // Also expose the initial letter (provided by template) for when user clears avatar
  const initialLetter = (typeof USERNAME_FIRST_LETTER !== 'undefined') ? String(USERNAME_FIRST_LETTER) : '';

  fileInput.addEventListener('change', function (e) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) return;

    // Only preview image files
    if (!file.type.startsWith('image/')) {
      // Optionally inform the user
      alert('请选择图片文件作为头像。');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = function (ev) {
      // Replace preview contents with the new image
      preview.innerHTML = '';
      const img = document.createElement('img');
      img.src = ev.target.result;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      preview.appendChild(img);

      // Uncheck clear avatar if it was checked
      if (clearCheckbox) clearCheckbox.checked = false;
    };
    reader.readAsDataURL(file);
  });

  // If user checks 'clear avatar', show the default letter; if unchecked, restore the original preview
  if (clearCheckbox) {
    clearCheckbox.addEventListener('change', function () {
      if (clearCheckbox.checked) {
        // Clear file input
        if (fileInput) fileInput.value = '';

        // Show the initial letter (fallback) instead of an object text node
        preview.innerHTML = '';
        if (initialLetter) {
          // put the letter inside a span to preserve styling
          const span = document.createElement('span');
          span.textContent = initialLetter;
          span.style.fontSize = '36px';
          span.style.fontWeight = '700';
          preview.appendChild(span);
        }
      } else {
        // Restore the original preview (could be the original image or the original letter)
        preview.innerHTML = initialPreviewHTML;
      }
    });
  }
});