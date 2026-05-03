(function () {
  const data = globalThis.MENTOMATE_ATLAS_DATA;
  if (!data) {
    throw new Error('MENTOMATE_ATLAS_DATA is not loaded.');
  }

  const categoryColors = Object.fromEntries(
    data.legends.map((legend) => [legend.id, legend.color])
  );
  const statusClasses = {
    Current: 'status-current',
    Dormant: 'status-dormant',
    Deferred: 'status-deferred',
    Future: 'status-future',
  };

  const nodesById = new Map(data.nodes.map((node) => [node.id, node]));
  const boardsById = new Map(data.boards.map((board) => [board.id, board]));
  const params = new URLSearchParams(window.location.search);
  const requestedBoard = params.get('board');
  const exportMode = params.get('export') === '1';

  let currentIndex = Math.max(
    0,
    data.boards.findIndex((board) => board.id === requestedBoard)
  );
  if (currentIndex < 0) currentIndex = 0;
  let selectedNodeId = null;

  const boardStage = document.getElementById('board-stage');
  const indexPanel = document.getElementById('index-panel');
  const drawer = document.getElementById('node-drawer');
  const toast = document.getElementById('atlas-toast');

  if (exportMode) {
    document.body.classList.add('export-mode');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function slugStatus(status) {
    return statusClasses[status] || '';
  }

  function pathHref(path) {
    if (/^https?:\/\//.test(path)) return path;
    return `../../${path.replaceAll('\\', '/')}`;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('visible');
    window.clearTimeout(showToast.timeout);
    showToast.timeout = window.setTimeout(() => {
      toast.classList.remove('visible');
    }, 2800);
  }

  function getBoardLinks(boardId, nodeIds) {
    const laneSet = new Set(nodeIds);
    return data.links.filter(
      (link) =>
        link.boards.includes(boardId) &&
        laneSet.has(link.from) &&
        laneSet.has(link.to)
    );
  }

  function renderStatusChip(status) {
    return `<span class="status-chip ${slugStatus(status)}">${escapeHtml(status)}</span>`;
  }

  function renderCategoryChip(category) {
    return `<span class="category-chip">${escapeHtml(category)}</span>`;
  }

  function renderNodeCard(node) {
    const color = categoryColors[node.category] || '#667085';
    const selected = node.id === selectedNodeId ? ' selected' : '';
    return `
      <button
        type="button"
        class="node-card${selected}"
        data-node-id="${escapeHtml(node.id)}"
        style="--category-color: ${escapeHtml(color)}"
      >
        <span class="node-meta">
          ${renderStatusChip(node.status)}
          ${renderCategoryChip(node.category)}
        </span>
        <span class="node-name">${escapeHtml(node.name)}</span>
        <span class="node-role">${escapeHtml(node.role)}</span>
      </button>
    `;
  }

  function renderLane(board, lane, laneIndex) {
    const nodes = lane.nodeIds.map((id) => nodesById.get(id)).filter(Boolean);
    const color =
      categoryColors[nodes[0]?.category] ||
      data.legends[laneIndex % data.legends.length].color;
    const links = getBoardLinks(board.id, lane.nodeIds);
    return `
      <section class="lane" id="lane-${escapeHtml(lane.id)}">
        <div class="lane-label" style="--lane-color: ${escapeHtml(color)}">
          <span class="pill">Lane ${laneIndex + 1}</span>
          <h3>${escapeHtml(lane.title)}</h3>
          <p>${escapeHtml(lane.description)}</p>
        </div>
        <div class="node-grid">
          ${nodes.map(renderNodeCard).join('')}
        </div>
        ${
          links.length > 0
            ? `<div class="lane-flow">
                ${links
                  .slice(0, 8)
                  .map(
                    (link) =>
                      `<span class="flow-chip">${escapeHtml(nodesById.get(link.from)?.name || link.from)} -> ${escapeHtml(nodesById.get(link.to)?.name || link.to)}</span>`
                  )
                  .join('')}
              </div>`
            : ''
        }
      </section>
    `;
  }

  function renderLegend() {
    return `
      <section class="legend-box" aria-label="Legend">
        <h3 class="panel-title">Legend</h3>
        <div class="legend-grid">
          ${data.legends
            .map(
              (legend) => `
                <span class="legend-item">
                  <span class="legend-swatch" style="--legend-color: ${escapeHtml(legend.color)}"></span>
                  <span>${escapeHtml(legend.label)}</span>
                </span>
              `
            )
            .join('')}
          ${data.statuses
            .map(
              (status) => `
                <span class="legend-item">
                  <span class="legend-swatch ${slugStatus(status.label)}" style="--legend-color: var(--status-color)"></span>
                  <span>${escapeHtml(status.label)}</span>
                </span>
              `
            )
            .join('')}
        </div>
      </section>
    `;
  }

  function renderBoard() {
    const board = data.boards[currentIndex];
    const total = data.boards.length;
    document.title = `${board.number}. ${board.title} - Mentomate Atlas`;
    boardStage.innerHTML = `
      <article class="board" data-board-id="${escapeHtml(board.id)}">
        <header class="board-header">
          <div>
            <div class="board-kicker">
              <span class="pill">Board ${board.number} of ${total}</span>
              <span class="pill">Guided Tour + Index</span>
            </div>
            <h2>${escapeHtml(board.title)}</h2>
            <p class="board-purpose">${escapeHtml(board.purpose)}</p>
          </div>
          <aside class="board-source-box">
            <h3 class="source-title">Where this board is grounded</h3>
            <ul class="source-list">
              ${board.sourceRefs
                .map(
                  (source) =>
                    `<li><a href="${escapeHtml(pathHref(source))}">${escapeHtml(source)}</a></li>`
                )
                .join('')}
            </ul>
          </aside>
        </header>
        <div class="board-body">
          ${board.lanes.map((lane, index) => renderLane(board, lane, index)).join('')}
          <footer class="board-footer">
            ${renderLegend()}
            <section class="decision-box" aria-label="Risk and decision notes">
              <h3 class="panel-title">Risk and decision notes</h3>
              <ul class="decision-list">
                ${board.decisionNotes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}
              </ul>
            </section>
          </footer>
        </div>
      </article>
    `;
    renderIndex();
    renderDrawer();
    if (!exportMode) {
      history.replaceState(null, '', `#${board.id}`);
    }
  }

  function renderIndex() {
    const board = data.boards[currentIndex];
    indexPanel.innerHTML = `
      <section class="panel-section">
        <h2 class="panel-title">Boards</h2>
        <ol class="board-list">
          ${data.boards
            .map(
              (item, index) => `
                <li>
                  <button
                    type="button"
                    class="board-jump${index === currentIndex ? ' active' : ''}"
                    data-board-index="${index}"
                  >
                    <span class="board-number">${item.number}</span>
                    <span class="board-jump-title">${escapeHtml(item.title)}</span>
                  </button>
                </li>
              `
            )
            .join('')}
        </ol>
      </section>
      <section class="panel-section">
        <h2 class="panel-title">Current board groups</h2>
        <ol class="lane-list">
          ${board.lanes
            .map(
              (lane) => `
                <li>
                  <button type="button" class="lane-jump" data-lane-id="${escapeHtml(lane.id)}">
                    ${escapeHtml(lane.title)}
                  </button>
                </li>
              `
            )
            .join('')}
        </ol>
      </section>
      <section class="panel-section">
        <h2 class="panel-title">High-signal topics</h2>
        <ol class="lane-list">
          ${[
            'llm-router',
            'revenuecat',
            'stripe',
            'inngest',
            'profile-boundary',
            'cloudflare-workers',
            'neon',
            'eas-build-submit',
          ]
            .map((id) => nodesById.get(id))
            .filter(Boolean)
            .map(
              (node) => `
                <li>
                  <button type="button" class="lane-jump" data-topic-node-id="${escapeHtml(node.id)}">
                    ${escapeHtml(node.name)}
                  </button>
                </li>
              `
            )
            .join('')}
        </ol>
      </section>
    `;
  }

  function renderDrawerField(title, values, options = {}) {
    if (!values || values.length === 0) return '';
    const items = values
      .map((value) => {
        if (options.paths) {
          return `<li><a href="${escapeHtml(pathHref(value))}">${escapeHtml(value)}</a></li>`;
        }
        if (options.boards) {
          const board = boardsById.get(value);
          return `<li>${escapeHtml(board ? `${board.number}. ${board.title}` : value)}</li>`;
        }
        return `<li>${escapeHtml(value)}</li>`;
      })
      .join('');
    return `
      <section class="drawer-section">
        <h3>${escapeHtml(title)}</h3>
        <ul>${items}</ul>
      </section>
    `;
  }

  function renderDrawer() {
    const board = data.boards[currentIndex];
    const firstBoardNode = board.lanes
      .flatMap((lane) => lane.nodeIds)
      .map((id) => nodesById.get(id))
      .find(Boolean);
    const node = nodesById.get(selectedNodeId) || firstBoardNode;
    if (!node) {
      drawer.innerHTML = '<p class="drawer-empty">Select a node to inspect details.</p>';
      return;
    }
    selectedNodeId = node.id;
    drawer.innerHTML = `
      <header class="drawer-header">
        <span class="node-meta">
          ${renderStatusChip(node.status)}
          ${renderCategoryChip(node.category)}
        </span>
        <h2>${escapeHtml(node.name)}</h2>
        <p class="drawer-role">${escapeHtml(node.role)}</p>
      </header>
      ${renderDrawerField('Inbound dependencies', node.inbound)}
      ${renderDrawerField('Outbound dependencies', node.outbound)}
      ${renderDrawerField('Data touched', node.dataTouched)}
      ${renderDrawerField('Where to look', node.repoPaths, { paths: true })}
      ${renderDrawerField('Related docs', node.relatedDocs, { paths: true })}
      ${renderDrawerField('Tests / verification', node.tests)}
      ${renderDrawerField('Operational dashboards / logs', node.operations)}
      ${renderDrawerField('Risks / decisions', node.risks)}
      ${renderDrawerField('Notes', node.notes)}
      ${renderDrawerField('Related boards', node.relatedBoards, { boards: true })}
    `;
  }

  function setBoard(index) {
    currentIndex = (index + data.boards.length) % data.boards.length;
    const board = data.boards[currentIndex];
    selectedNodeId = board.lanes[0]?.nodeIds[0] || null;
    renderBoard();
    window.scrollTo({ top: 0, left: 0, behavior: exportMode ? 'auto' : 'smooth' });
  }

  async function exportCurrentBoard() {
    const board = data.boards[currentIndex];
    const command = `node docs/visual-artefacts/scripts/export-png.mjs --board ${board.id}`;
    try {
      await navigator.clipboard.writeText(command);
      showToast(`Export command copied: ${command}`);
    } catch {
      showToast(command);
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;

    const action = target.dataset.action;
    if (action === 'previous') setBoard(currentIndex - 1);
    if (action === 'next') setBoard(currentIndex + 1);
    if (action === 'index') indexPanel.scrollTo({ top: 0, behavior: 'smooth' });
    if (action === 'export') exportCurrentBoard();

    if (target.dataset.boardIndex) {
      setBoard(Number(target.dataset.boardIndex));
    }
    if (target.dataset.laneId) {
      document
        .getElementById(`lane-${target.dataset.laneId}`)
        ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    if (target.dataset.topicNodeId) {
      selectedNodeId = target.dataset.topicNodeId;
      renderDrawer();
      showToast(`Selected ${nodesById.get(selectedNodeId)?.name || selectedNodeId}`);
    }
    if (target.dataset.nodeId) {
      selectedNodeId = target.dataset.nodeId;
      renderDrawer();
      boardStage
        .querySelectorAll('.node-card')
        .forEach((card) => card.classList.toggle('selected', card.dataset.nodeId === selectedNodeId));
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') setBoard(currentIndex - 1);
    if (event.key === 'ArrowRight') setBoard(currentIndex + 1);
  });

  if (window.location.hash) {
    const hashId = window.location.hash.slice(1);
    const hashIndex = data.boards.findIndex((board) => board.id === hashId);
    if (hashIndex >= 0) currentIndex = hashIndex;
  }

  setBoard(currentIndex);
  window.MENTOMATE_ATLAS_READY = true;
})();
