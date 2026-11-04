import './mobile-controls.css';

/** Keep the existing controls and their handlers; move reading panels into a
 * modal on phones, then restore their exact positions on larger screens. */
export function createMobileControls({clearInput}) {
  const query = matchMedia('(max-width:800px), (max-width:1100px) and (max-height:600px)');
  const bar = document.createElement('div');
  bar.className = 'mobile-game-bar';
  const title = document.createElement('span');
  title.className = 'mobile-game-title';
  const toggle = document.createElement('button');
  toggle.id = 'mobileMenuToggle';
  toggle.type = 'button';
  toggle.textContent = '菜单';
  toggle.setAttribute('aria-controls', 'mobileGameMenu');
  toggle.setAttribute('aria-expanded', 'false');
  bar.append(title, toggle);

  const menu = document.createElement('dialog');
  menu.id = 'mobileGameMenu';
  menu.setAttribute('aria-labelledby', 'mobileGameMenuTitle');
  const head = document.createElement('div');
  head.className = 'mobile-menu-head';
  const heading = document.createElement('h2');
  heading.id = 'mobileGameMenuTitle';
  heading.textContent = '游玩菜单';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '继续游玩 ×';
  close.setAttribute('aria-label', '收起菜单，继续游玩');
  head.append(heading, close);
  const content = document.createElement('div');
  content.className = 'mobile-menu-content';
  menu.append(head, content);
  const dock = document.createElement('div');
  dock.className = 'mobile-action-dock';
  document.body.append(bar, menu, dock);

  const moves = [];
  function move(node, parent) {
    if (!node) return;
    const marker = document.createComment('mobile-control-home');
    node.before(marker);
    moves.push({node, marker});
    parent.append(node);
  }
  function closeMenu() { menu.close(); }
  toggle.onclick = () => {
    clearInput?.();
    menu.showModal();
    toggle.setAttribute('aria-expanded', 'true');
  };
  close.onclick = closeMenu;
  menu.addEventListener('close', () => {
    toggle.setAttribute('aria-expanded', 'false');
    clearInput?.();
  });
  menu.addEventListener('click', event => {
    if (event.target === menu) {
      const rect = menu.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeMenu();
    }
    // Finish a choice directly in the scene (or in the destination dialog).
    if (event.target.closest('.header-actions button,.compound-panel button,#importButton,#stamp')) closeMenu();
  });
  menu.addEventListener('change', event => { if (event.target.id === 'compoundBuilding') closeMenu(); });

  const station = document.getElementById('stationName');
  const updateTitle = () => { title.textContent = station?.textContent || '山河访古'; };
  updateTitle();
  if (station) new MutationObserver(updateTitle).observe(station, {childList:true, characterData:true, subtree:true});

  function applyLayout() {
    closeMenu();
    clearInput?.();
    document.body.classList.toggle('mobile-game', query.matches);
    if (query.matches && !moves.length) {
      move(document.getElementById('journeyInteract'), dock);
      for (const selector of ['.header-actions', '.compound-panel', '.journey-location', '.journey-hud', '.intro', '.field-card', '#importButton']) {
        move(document.querySelector(selector), content);
      }
    } else if (!query.matches) {
      for (const {node, marker} of moves.reverse()) marker.replaceWith(node);
      moves.length = 0;
    }
  }
  query.addEventListener('change', applyLayout);
  applyLayout();
  return {close: closeMenu};
}
