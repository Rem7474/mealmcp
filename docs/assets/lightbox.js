(() => {
  const box = document.getElementById('lightbox');
  if (!box || !box.showModal) return;
  const img = box.querySelector('img');
  const caption = box.querySelector('.lb-caption');
  const items = Array.prototype.slice.call(document.querySelectorAll('a.zoom'));
  let index = 0;

  function show(i) {
    index = (i + items.length) % items.length;
    const a = items[index];
    const thumb = a.querySelector('img');
    img.src = a.href;
    img.alt = thumb ? thumb.alt : '';
    caption.textContent = thumb ? thumb.alt : '';
  }

  items.forEach((a, i) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      show(i);
      box.showModal();
    });
  });

  box.querySelectorAll('.lb-nav').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      show(index + Number(btn.getAttribute('data-dir')));
    });
  });

  img.addEventListener('click', () => {
    box.close();
  });
  box.addEventListener('click', (e) => {
    if (e.target === box) box.close();
  });
  box.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') show(index - 1);
    else if (e.key === 'ArrowRight') show(index + 1);
  });
})();
