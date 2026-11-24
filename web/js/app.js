/* 净影 CleanFrame — 7 屏完整交互与算子联动逻辑 */
(function () {
  const DATA = window.CLEANFRAME_DATA;
  const CALC = window.CLEANFRAME_CALC;

  /* ================================
     Application State
     ================================ */
  const state = {
    view: 'overview',
    searchQuery: '',
    taskFilter: 'all',
    tasks: DATA.tasks.map((t) => ({ ...t })),

    // F2 新建修复任务
    inpaintFiles: DATA.inpaintFiles.map((f) => ({ ...f })),
    inpaintPresetKeys: Object.keys(DATA.inpaintPresets),
    inpaintPresetIdx: 0,
    inpaintCfg: { ...DATA.inpaintPresets.drama_watermark, targets: [...DATA.inpaintPresets.drama_watermark.targets] },

    // F3 区域标注
    annotateFileIdx: 0,
    annotateTool: 'select', // 'select' | 'draw'
    regions: DATA.regions.map((r) => ({ ...r, bbox: [...r.bbox] })),
    selectedRegionId: 'reg-2',
    applyAllBatch: true,

    // F4 批次监控
    queuePaused: false,
    batchQueue: DATA.batchQueue.map((q) => ({ ...q })),
    batchLogs: DATA.batchLogs.map((l) => ({ ...l })),

    // F5 结果对比
    comparePct: 50,

    // F6 新建翻译任务
    translateFiles: DATA.translateFiles.map((f) => ({ ...f })),
    translateCfg: {
      sourceLang: 'zh-CN',
      targetLangs: ['en-US', 'ja-JP', 'ko-KR'],
      dubbingMode: 'high_quality', // emotion | timbre | high_quality
      fastMode: true,
      dynamicDuration: true,
      burnSubtitles: true,
      captionFormats: ['.srt', '.ass'],
      enableInpaint: true,
      outputDubbingAudio: false,
    },

    // F7 多语成片结果
    activeCaptionIdx: 2,

    // 字幕样式
    subtitleStyle: { ...DATA.subtitleStyle },
  };

  /* ================================
     Utilities
     ================================ */
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let toastTimer = null;
  function showToast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
  }

  function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  /* ================================
     Navigation & Command Palette
     ================================ */
  const VIEW_TO_NAV = {
    overview: 'overview',
    inpaint: 'inpaint',
    translate: 'translate',
    annotate: 'annotate',
    'subtitle-style': 'subtitle-style',
    billing: 'billing',
    monitor: 'overview',
    compare: 'overview',
    'translate-result': 'overview',
  };

  const CMD_ITEMS = [
    { view: 'overview', code: '01', title: '任务总览', desc: 'KPI 概览、5 态筛选与双算子任务表', tone: 'mint' },
    { view: 'inpaint', code: '02', title: '新建修复任务', desc: '本地批量上传、擦除目标 × 定位方式与实时计费', tone: 'mint' },
    { view: 'annotate', code: '03', title: '区域标注', desc: '1000×1000 归一化框选与三泳道生效时段时间轴', tone: 'mint' },
    { view: 'monitor', code: '04', title: '批次运行监控', desc: '分段总进度、队列明细、Poll 日志与计费累计', tone: 'mint' },
    { view: 'compare', code: '05', title: '修复结果对比', desc: '左右拖动擦除对比滑块与 5 列结果指标条', tone: 'mint' },
    { view: 'translate', code: '06', title: '新建翻译任务', desc: '31 种输出语种、配音模式、去水印前处理与产出预览', tone: 'blue' },
    { view: 'translate-result', code: '07', title: '多语成片结果', desc: '英日韩三语烧录预览、5 列字幕对照与修复原片', tone: 'blue' },
    { view: 'subtitle-style', code: '样式', title: '字幕样式编辑器', desc: '配置烧录字号、位置、描边与背景不透明度', tone: 'blue' },
    { view: 'billing', code: '账单', title: '用量账单', desc: '本月修复与翻译计费汇总及出账明细', tone: 'mint' },
  ];

  function switchView(viewId) {
    state.view = viewId;
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${viewId}`));
    const navTarget = VIEW_TO_NAV[viewId] || 'overview';
    $$('.nav-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.nav === navTarget);
    });
    const scrollEl = $('.view-scroll');
    if (scrollEl) scrollEl.scrollTop = 0;
  }

  function renderCmdPalette(keyword = '') {
    const q = keyword.trim().toLowerCase();
    const list = $('#cmdList');
    const matched = CMD_ITEMS.filter(
      (i) => !q || i.title.toLowerCase().includes(q) || i.desc.toLowerCase().includes(q) || i.code.includes(q)
    );
    list.innerHTML = matched
      .map(
        (i) => `
      <button class="cmd-item" data-jump="${i.view}">
        <div class="cmd-item-left">
          <span class="cmd-badge ${i.tone === 'blue' ? 'blue' : ''}">${i.code}</span>
          <div>
            <div class="cmd-title">${i.title}</div>
            <div class="cmd-desc">${i.desc}</div>
          </div>
        </div>
        <span class="mono" style="font-size:10px;color:var(--text-faint);">↵</span>
      </button>`
      )
      .join('');
    list.querySelectorAll('.cmd-item').forEach((btn) => {
      btn.addEventListener('click', () => {
        switchView(btn.dataset.jump);
        closeCmdModal();
      });
    });
  }

  function openCmdModal() {
    $('#cmdModal').classList.add('open');
    $('#cmdSearchInput').value = '';
    renderCmdPalette('');
    setTimeout(() => $('#cmdSearchInput').focus(), 20);
  }

  function closeCmdModal() {
    $('#cmdModal').classList.remove('open');
  }

  /* ================================
     01 · 任务总览 (F1)
     ================================ */
  function renderTaskTable() {
    const tbody = $('#taskTableBody');
    const q = state.searchQuery.trim().toLowerCase();
    const filtered = state.tasks.filter((t) => {
      const matchFilter = state.taskFilter === 'all' || t.status === state.taskFilter;
      const matchQuery =
        !q ||
        t.file.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q) ||
        t.scheme.toLowerCase().includes(q) ||
        t.subScheme.toLowerCase().includes(q);
      return matchFilter && matchQuery;
    });

    $('#taskTotalCount').textContent = state.taskFilter === 'all' && !q ? '24' : String(filtered.length);

    if (!filtered.length) {
      tbody.innerHTML = `<div class="empty-state">当前筛选条件下暂无匹配任务</div>`;
      return;
    }

    tbody.innerHTML = filtered
      .map((t) => {
        const barClass = t.status === 'running' ? 'blue' : t.status === 'completed' ? '' : 'dim';
        const barWidth = t.status === 'completed' ? 100 : t.status === 'running' ? t.progress : 4;
        const pctLabel =
          t.status === 'completed' ? '100%' : t.status === 'running' ? `${t.progress}%` : t.status === 'queued' ? '排队' : '—';
        return `
        <div class="task-row" data-task-id="${t.id}" data-target-view="${t.targetView}" title="点击查看详情">
          <div class="task-file-cell">
            <div class="thumb"><img src="${DATA.previewAsset}" alt="" /></div>
            <div class="cell-stack">
              <span class="file-name">${escapeHtml(t.file)}</span>
              <span class="file-meta">${escapeHtml(t.meta)}</span>
            </div>
          </div>
          <div class="cell-stack">
            <span class="scheme-main">${escapeHtml(t.scheme)}</span>
            <span class="scheme-sub">${escapeHtml(t.subScheme)}</span>
          </div>
          <div>
            <span class="status-pill ${t.status}"><span class="dot"></span>${t.statusLabel}</span>
          </div>
          <div class="progress-cell">
            <div class="progress-track"><div class="progress-fill ${barClass}" style="width:${barWidth}%;"></div></div>
            <span class="progress-pct">${pctLabel}</span>
          </div>
          <div class="cell-mono">${escapeHtml(t.usage)}</div>
          <div class="cell-time">${escapeHtml(t.time)}</div>
          <div style="display:flex;justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="3.4" cy="8" r="1.15" fill="#4C5560"/>
              <circle cx="8" cy="8" r="1.15" fill="#4C5560"/>
              <circle cx="12.6" cy="8" r="1.15" fill="#4C5560"/>
            </svg>
          </div>
        </div>`;
      })
      .join('');

    tbody.querySelectorAll('.task-row').forEach((row) => {
      row.addEventListener('click', () => {
        const target = row.dataset.targetView;
        switchView(target);
      });
    });
  }

  /* ================================
     02 · 新建修复任务 (F2)
     ================================ */
  function renderInpaint() {
    const cfg = state.inpaintCfg;

    // 约束 1：lite 不支持 precise
    const preciseBtn = $('#locatePreciseBtn');
    if (cfg.modelLevel === 'lite') {
      preciseBtn.disabled = true;
      if (cfg.locateMode === 'precise') cfg.locateMode = 'standard';
    } else {
      preciseBtn.disabled = false;
    }

    // 约束 2：字幕保护仅在不含字幕类目标且非手动框选时有效
    const hasSubtitleTarget = cfg.targets.includes('subtitle') || cfg.targets.includes('scrolling_subtitle');
    const protectAllowed = cfg.locateMode !== 'fixed' && !hasSubtitleTarget && cfg.targets.includes('watermark');
    const protectRow = $('#subtitleProtectRow');
    const protectSwitch = $('#subtitleProtectSwitch');
    const protectLabel = $('#subtitleProtectLabel');

    if (!protectAllowed) {
      cfg.subtitleProtect = false;
      protectRow.classList.add('disabled');
      protectSwitch.classList.remove('on');
      if (cfg.locateMode === 'fixed') {
        protectLabel.textContent = '字幕区域保护（手动框选模式下不生效）';
      } else if (hasSubtitleTarget) {
        protectLabel.textContent = '字幕区域保护（当前含字幕目标，不生效）';
      } else {
        protectLabel.textContent = '字幕区域保护（需勾选水印目标）';
      }
    } else {
      protectRow.classList.remove('disabled');
      protectSwitch.classList.toggle('on', cfg.subtitleProtect);
      protectLabel.textContent = '字幕区域保护（排除普通/滚动字幕区）';
    }
    $('#subtitlePersistentSwitch').classList.toggle('on', cfg.subtitlePersistent);

    // 同步按钮与下拉
    $$('#modelLevelSeg .seg-tile').forEach((b) => b.classList.toggle('active', b.dataset.model === cfg.modelLevel));
    $$('#inpaintTargetsWrap .chip').forEach((c) => {
      c.classList.toggle('active', cfg.targets.includes(c.dataset.target));
      c.disabled = cfg.locateMode === 'fixed';
    });
    $$('#locateModeSeg .seg-tile').forEach((b) => b.classList.toggle('active', b.dataset.locate === cfg.locateMode));
    $('#inpaintResSelect').value = cfg.maxResolution;
    $('#inpaintFpsSelect').value = String(cfg.maxFps);
    $('#inpaintQualitySelect').value = cfg.videoMode;
    $('#inpaintCodecSelect').value = cfg.codec;
    $('#inpaintPresetBadge').textContent = cfg.name || '自定义方案';

    // 定位方式说明
    const descEl = $('#locateModeDesc');
    if (cfg.locateMode === 'precise') {
      descEl.innerHTML = '精准识别 · 大模型定位水印 / 角标 / Logo，单价为标准模式的 2 倍';
    } else if (cfg.locateMode === 'standard') {
      const allSelected = cfg.targets.length >= 4;
      descEl.innerHTML = allSelected
        ? '标准检测 · 全文字擦除模式（覆盖字幕、水印及非背景文字），单价更低'
        : '标准检测 · 通用文字识别引擎，适合常规字幕与静态角落文字水印';
    } else {
      descEl.innerHTML = `手动框选 · 已配置 ${state.regions.length} 个固定区域，跳过动态检测 <button class="mode-inline-action" id="goAnnotateInlineBtn">编辑区域 →</button>`;
      const jumpBtn = $('#goAnnotateInlineBtn');
      if (jumpBtn) jumpBtn.addEventListener('click', () => switchView('annotate'));
    }

    // 渲染素材列表 + 实时计费
    const listEl = $('#inpaintFileList');
    let totalSec = 0;
    let totalGB = 0;
    let totalBillMin = 0;
    let totalCost = 0;
    const highFpsFiles = [];

    if (!state.inpaintFiles.length) {
      listEl.innerHTML = `<div class="empty-state" style="padding:32px 20px;">暂未添加视频文件 · <button class="mode-inline-action" id="restoreInpaintSamples">恢复示例素材</button></div>`;
      const restoreBtn = $('#restoreInpaintSamples');
      if (restoreBtn) {
        restoreBtn.addEventListener('click', () => {
          state.inpaintFiles = DATA.inpaintFiles.map((f) => ({ ...f }));
          renderInpaint();
        });
      }
    } else {
      listEl.innerHTML = state.inpaintFiles
        .map((f) => {
          const r = CALC.calcInpaintFile(f, cfg);
          totalSec += f.durationSec;
          totalGB += f.sizeGB;
          totalBillMin += r.billMin;
          totalCost += r.cost;
          if (f.fps > Number(cfg.maxFps)) highFpsFiles.push(f);
          return `
          <div class="file-row">
            <div class="thumb md"><img src="${DATA.previewAsset}" alt="" /></div>
            <div class="cell-stack" style="flex:1;">
              <span class="file-name">${escapeHtml(f.name)}</span>
              <span class="file-meta">${f.width}×${f.height} · ${f.fps.toFixed(2)}fps · ${CALC.formatDuration(f.durationSec)} · ${f.sizeGB.toFixed(2)} GB</span>
            </div>
            <span class="file-row-estimate">≈ ¥${r.cost.toFixed(2)}</span>
            <button class="remove-btn" data-remove-inpaint="${f.id}" title="移除文件">
              <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 3l7 7M10 3l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
            </button>
          </div>`;
        })
        .join('');

      listEl.querySelectorAll('[data-remove-inpaint]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.inpaintFiles = state.inpaintFiles.filter((x) => x.id !== btn.dataset.removeInpaint);
          renderInpaint();
        });
      });
    }

    $('#inpaintFileSummary').textContent = `${state.inpaintFiles.length} 个文件 · 合计 ${CALC.formatDurationCN(totalSec)} · ${totalGB.toFixed(2)} GB`;

    // 高帧率警示条
    const warnEl = $('#inpaintFpsWarn');
    if (highFpsFiles.length) {
      warnEl.style.display = 'flex';
      const first = highFpsFiles[0];
      const more = highFpsFiles.length > 1 ? ` 等 ${highFpsFiles.length} 个文件` : '';
      $('#inpaintFpsWarnText').textContent = `${first.name}${more} 帧率 ${first.fps.toFixed(2)}fps 高于输出上限，将按 ${cfg.maxFps}fps 输出 · 可避免 2 倍帧率系数`;
    } else {
      warnEl.style.display = 'none';
    }

    // 底部汇总
    $('#inpaintTotalUsage').textContent = `${totalBillMin.toFixed(1)} 分钟`;
    $('#inpaintTotalCost').textContent = `¥${totalCost.toFixed(2)}`;
    $('#submitInpaintLabel').textContent = `提交 ${state.inpaintFiles.length} 个任务`;
    $('#submitInpaintBtn').disabled = state.inpaintFiles.length === 0;
  }

  function addLocalFilesToInpaint(fileList) {
    const added = Array.from(fileList || []).filter((f) => f && f.name);
    if (!added.length) return;
    added.forEach((f, idx) => {
      const sizeGB = Math.max(0.05, +(f.size / (1024 * 1024 * 1024)).toFixed(2));
      const estSec = Math.min(3600, Math.max(30, Math.round(sizeGB * 400)));
      state.inpaintFiles.push({
        id: `inf-u-${Date.now()}-${idx}`,
        name: f.name,
        width: 1920,
        height: 1080,
        fps: 30.0,
        durationSec: estSec,
        sizeGB,
      });
    });
    renderInpaint();
    showToast(`已添加 ${added.length} 个视频到修复队列`);
  }

  /* ================================
     03 · 区域标注 (F3)
     ================================ */
  function getActiveAnnotateFile() {
    return DATA.annotationFiles[state.annotateFileIdx] || DATA.annotationFiles[0];
  }

  function getSelectedRegion() {
    return state.regions.find((r) => r.id === state.selectedRegionId) || state.regions[0];
  }

  function renderAnnotate() {
    const file = getActiveAnnotateFile();
    const totalSec = file.durationSec;

    $('#annotateFileName').textContent = file.name;
    $('#annotateFileIdx').textContent = `${state.annotateFileIdx + 1} / ${DATA.annotationFiles.length}`;
    $('#annotateFrameInfo').textContent = `${file.width}×${file.height} · ${file.fps.toFixed(2)}fps · ${file.frames} 帧`;
    $('#timelineDurationMeta').textContent = `总时长 ${CALC.formatDuration(totalSec)} · ${Math.round(file.fps)}fps`;
    $('#regionCountChip').textContent = String(state.regions.length);

    // 时间轴刻度
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((p) => `<span>${CALC.formatDuration(totalSec * p)}</span>`).join('');
    $('#timelineTicks').innerHTML = ticks;

    // 工具状态
    $('#toolSelectBtn').classList.toggle('active', state.annotateTool === 'select');
    $('#toolDrawBtn').classList.toggle('active', state.annotateTool === 'draw');
    $('#annotateCanvas').classList.toggle('draw-mode', state.annotateTool === 'draw');

    // 渲染画布上的归一化 bbox
    const layer = $('#bboxLayer');
    layer.innerHTML = state.regions
      .map((r) => {
        const [x1, y1, x2, y2] = r.bbox;
        const left = (x1 / 10).toFixed(2);
        const top = (y1 / 10).toFixed(2);
        const width = ((x2 - x1) / 10).toFixed(2);
        const height = ((y2 - y1) / 10).toFixed(2);
        const sel = r.id === state.selectedRegionId ? 'selected' : '';
        return `
        <div class="bbox-rect ${r.color} ${sel}" data-region-id="${r.id}" style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;">
          <span class="bbox-tag">${escapeHtml(r.name)}</span>
          <span class="bbox-handle nw" data-handle="nw"></span>
          <span class="bbox-handle ne" data-handle="ne"></span>
          <span class="bbox-handle sw" data-handle="sw"></span>
          <span class="bbox-handle se" data-handle="se"></span>
        </div>`;
      })
      .join('');

    // 渲染时间轴泳道
    const lanesEl = $('#timelineLanes');
    lanesEl.innerHTML = state.regions
      .map((r) => {
        const end = r.untilEnd ? totalSec : Math.min(totalSec, r.endSec);
        const start = Math.max(0, Math.min(r.startSec, end - 1));
        const leftPct = (start / totalSec) * 100;
        const widthPct = Math.max(3, ((end - start) / totalSec) * 100);
        return `
        <div class="timeline-lane" data-lane-id="${r.id}">
          <div class="lane-label-col">
            <span class="lane-dot ${r.color}"></span>
            <span>${escapeHtml(r.shortName)}</span>
          </div>
          <div class="lane-track">
            <div class="lane-clip ${r.color}" data-clip-id="${r.id}" style="left:${leftPct.toFixed(2)}%;width:${widthPct.toFixed(2)}%;">
              <span class="clip-edge" data-edge="left"></span>
              <span class="clip-edge" data-edge="right"></span>
            </div>
          </div>
        </div>`;
      })
      .join('');

    // 渲染右侧区域卡片
    const cardsEl = $('#regionCardsList');
    cardsEl.innerHTML = state.regions
      .map((r) => {
        const sel = r.id === state.selectedRegionId;
        const end = r.untilEnd ? totalSec : Math.min(totalSec, r.endSec);
        const dur = Math.max(0, end - r.startSec);
        const timeStr = r.untilEnd
          ? `${r.startSec.toFixed(1)} s – 片尾`
          : `${r.startSec.toFixed(1)} – ${end.toFixed(1)} s · 持续 ${dur.toFixed(1)} s`;
        return `
        <div class="region-card ${r.color} ${sel ? 'selected' : ''}" data-card-region="${r.id}">
          <div class="region-card-head">
            <span class="lane-dot ${r.color}"></span>
            <span class="region-card-name">${escapeHtml(r.name)}</span>
            ${sel ? '<span class="region-editing-tag">编辑中</span>' : ''}
          </div>
          <span class="region-coords">bbox [${r.bbox.join(', ')}]</span>
          <span class="region-time">${timeStr}</span>
        </div>`;
      })
      .join('');

    cardsEl.querySelectorAll('[data-card-region]').forEach((card) => {
      card.addEventListener('click', () => {
        state.selectedRegionId = card.dataset.cardRegion;
        renderAnnotate();
      });
    });

    // 同步选中区域参数卡
    const active = getSelectedRegion();
    if (active) {
      $('#activeRegionParamTitle').textContent = `${active.shortName.split(' · ')[0]} 参数`;
      $('#regionStartInput').value = active.startSec.toFixed(1);
      const endInput = $('#regionEndInput');
      if (active.untilEnd) {
        endInput.type = 'text';
        endInput.value = '至片尾';
        endInput.disabled = true;
      } else {
        endInput.type = 'number';
        endInput.step = '0.5';
        endInput.value = Math.min(totalSec, active.endSec).toFixed(1);
        endInput.disabled = false;
      }
      $('#regionUntilEndSwitch').classList.toggle('on', active.untilEnd);
    }

    $('#applyAllBatchSwitch').classList.toggle('on', state.applyAllBatch);
    $('#applyRegionsBtn').textContent = state.applyAllBatch
      ? `保存并应用到 ${state.inpaintFiles.length || 4} 个文件`
      : '保存当前文件标注';

    bindAnnotateDrag();
    bindTimelineDrag();
  }

  function bindAnnotateDrag() {
    const canvas = $('#annotateCanvas');
    $$('#bboxLayer .bbox-rect').forEach((el) => {
      el.addEventListener('pointerdown', (e) => {
        if (state.annotateTool === 'draw') return;
        e.stopPropagation();
        const regionId = el.dataset.regionId;
        state.selectedRegionId = regionId;
        const reg = state.regions.find((r) => r.id === regionId);
        if (!reg) return;

        const handle = e.target.dataset.handle || 'move';
        const rect = canvas.getBoundingClientRect();
        const startX = e.clientX;
        const startY = e.clientY;
        const orig = [...reg.bbox];

        function onMove(ev) {
          const dx = Math.round(((ev.clientX - startX) / rect.width) * 1000);
          const dy = Math.round(((ev.clientY - startY) / rect.height) * 1000);
          let [x1, y1, x2, y2] = orig;
          if (handle === 'move') {
            const w = x2 - x1;
            const h = y2 - y1;
            x1 = Math.max(0, Math.min(1000 - w, x1 + dx));
            y1 = Math.max(0, Math.min(1000 - h, y1 + dy));
            x2 = x1 + w;
            y2 = y1 + h;
          } else {
            if (handle.includes('w')) x1 = Math.max(0, Math.min(x2 - 30, x1 + dx));
            if (handle.includes('e')) x2 = Math.min(1000, Math.max(x1 + 30, x2 + dx));
            if (handle.includes('n')) y1 = Math.max(0, Math.min(y2 - 30, y1 + dy));
            if (handle.includes('s')) y2 = Math.min(1000, Math.max(y1 + 30, y2 + dy));
          }
          reg.bbox = [x1, y1, x2, y2];
          renderAnnotate();
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        renderAnnotate();
      });
    });
  }

  function bindTimelineDrag() {
    const totalSec = getActiveAnnotateFile().durationSec;
    $$('#timelineLanes .lane-clip').forEach((clip) => {
      clip.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        const id = clip.dataset.clipId;
        state.selectedRegionId = id;
        const reg = state.regions.find((r) => r.id === id);
        if (!reg) return;
        const trackRect = clip.parentElement.getBoundingClientRect();
        const mode = e.target.dataset.edge || 'move';
        const startX = e.clientX;
        const origStart = reg.startSec;
        const origEnd = reg.untilEnd ? totalSec : reg.endSec;

        function onMove(ev) {
          const deltaSec = ((ev.clientX - startX) / trackRect.width) * totalSec;
          if (mode === 'move') {
            const len = origEnd - origStart;
            const nextStart = Math.max(0, Math.min(totalSec - len, origStart + deltaSec));
            reg.startSec = +nextStart.toFixed(1);
            reg.endSec = +(nextStart + len).toFixed(1);
            if (reg.endSec < totalSec - 1) reg.untilEnd = false;
          } else if (mode === 'left') {
            reg.startSec = +Math.max(0, Math.min(origEnd - 2, origStart + deltaSec)).toFixed(1);
          } else if (mode === 'right') {
            const nextEnd = Math.min(totalSec, Math.max(origStart + 2, origEnd + deltaSec));
            reg.endSec = +nextEnd.toFixed(1);
            reg.untilEnd = nextEnd >= totalSec - 1;
          }
          renderAnnotate();
        }
        function onUp() {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        }
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        renderAnnotate();
      });
    });
  }

  function setupAnnotateDrawTool() {
    const canvas = $('#annotateCanvas');
    canvas.addEventListener('pointerdown', (e) => {
      if (state.annotateTool !== 'draw') return;
      if (e.target.closest('.floating-toolbar')) return;
      const rect = canvas.getBoundingClientRect();
      const sx = Math.max(0, Math.min(1000, Math.round(((e.clientX - rect.left) / rect.width) * 1000)));
      const sy = Math.max(0, Math.min(1000, Math.round(((e.clientY - rect.top) / rect.height) * 1000)));
      const colors = ['mint', 'blue', 'amber'];
      const nextNum = state.regions.length + 1;
      const newReg = {
        id: `reg-${Date.now()}`,
        name: `区域 ${nextNum} · 自定义`,
        shortName: `区域 ${nextNum} · 自定义`,
        color: colors[(nextNum - 1) % colors.length],
        bbox: [sx, sy, Math.min(1000, sx + 80), Math.min(1000, sy + 60)],
        startSec: 0,
        endSec: getActiveAnnotateFile().durationSec,
        untilEnd: true,
      };
      state.regions.push(newReg);
      state.selectedRegionId = newReg.id;

      function onMove(ev) {
        const cx = Math.max(0, Math.min(1000, Math.round(((ev.clientX - rect.left) / rect.width) * 1000)));
        const cy = Math.max(0, Math.min(1000, Math.round(((ev.clientY - rect.top) / rect.height) * 1000)));
        newReg.bbox = [Math.min(sx, cx), Math.min(sy, cy), Math.max(sx, cx, Math.min(sx, cx) + 25), Math.max(sy, cy, Math.min(sy, cy) + 25)];
        renderAnnotate();
      }
      function onUp() {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        state.annotateTool = 'select';
        renderAnnotate();
      }
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      renderAnnotate();
    });
  }

  /* ================================
     04 · 批次运行监控 (F4)
     ================================ */
  function renderMonitor() {
    const done = state.batchQueue.filter((q) => q.status === 'completed');
    const running = state.batchQueue.filter((q) => q.status === 'running');
    const queued = state.batchQueue.filter((q) => q.status === 'queued');
    const total = state.batchQueue.length;

    const accruedMin = done.reduce((s, q) => s + q.billMin, 0);
    const accruedCost = accruedMin * 3.0;

    $('#monitorSubtitle').textContent = `算子 las_video_inpaint_pro v1 · cn-beijing · 提交于 14:32 · 已完成 ${done.length} / ${total}`;
    $('#monitorRatio').textContent = `${done.length} / ${total}`;
    $('#monitorStateDesc').textContent = `完成 · ${running.length} 个运行中 · ${queued.length} 个排队`;
    $('#monitorRightMeta').textContent = `已用 12:48  ·  剩余约 26:20  ·  已产生 ¥${accruedCost.toFixed(2)}`;
    $('#monitorAccruedCost').textContent = `¥${accruedCost.toFixed(2)}`;
    $('#monitorAccruedSub').textContent = `已完成 ${done.length} 个文件 · 计费 ${accruedMin.toFixed(2)} 分钟`;

    const donePct = (done.length / total) * 100;
    const runPct = running.reduce((s, q) => s + q.progress / 100, 0) / total * 100;
    $('#monitorDoneBar').style.width = `${donePct.toFixed(1)}%`;
    $('#monitorRunBar').style.width = `${runPct.toFixed(1)}%`;

    $('#pauseBtnLabel').textContent = state.queuePaused ? '继续队列' : '暂停队列';

    // 渲染队列行
    const body = $('#monitorQueueBody');
    body.innerHTML = state.batchQueue
      .map((q) => {
        const barClass = q.status === 'running' ? 'blue' : q.status === 'completed' ? '' : 'dim';
        const barW = q.status === 'completed' ? 100 : q.status === 'running' ? q.progress : 3;
        const pct = q.status === 'completed' ? '100%' : q.status === 'running' ? `${q.progress}%` : '—';
        const etaColor = q.status === 'running' ? 'color:var(--blue-text);' : 'color:var(--text-dim);';
        return `
        <div class="queue-row ${q.status === 'completed' ? 'clickable' : ''}" data-q-status="${q.status}" title="${q.status === 'completed' ? '点击查看修复前后对比' : ''}">
          <div class="cell-stack">
            <span class="file-name">${escapeHtml(q.name)}</span>
            <span class="file-meta">${escapeHtml(q.meta)}</span>
          </div>
          <div><span class="status-pill ${q.status}"><span class="dot"></span>${q.statusLabel}</span></div>
          <div class="progress-cell">
            <div class="progress-track"><div class="progress-fill ${barClass}" style="width:${barW}%;"></div></div>
            <span class="progress-pct">${pct}</span>
          </div>
          <div class="mono" style="font-size:10px;${etaColor}">${escapeHtml(q.eta)}</div>
        </div>`;
      })
      .join('');

    body.querySelectorAll('.queue-row.clickable').forEach((row) => {
      row.addEventListener('click', () => switchView('compare'));
    });

    // 渲染日志
    const logBody = $('#monitorLogBody');
    logBody.innerHTML =
      state.batchLogs
        .map((l) => `<div class="log-line ${l.tone}">${l.time}  ${l.tag.padEnd(9, ' ')} ${escapeHtml(l.msg)}</div>`)
        .join('') + `<div class="log-tail">— ${state.queuePaused ? '队列已暂停' : '等待下一个事件 · Poll RPM 600'} —</div>`;
    logBody.scrollTop = logBody.scrollHeight;
  }

  /* ================================
     05 · 修复结果对比 (F5)
     ================================ */
  function updateCompareSlider(pct) {
    const clamped = Math.max(2, Math.min(98, pct));
    state.comparePct = clamped;
    $('#compareBeforeLayer').style.clipPath = `inset(0 ${(100 - clamped).toFixed(2)}% 0 0)`;
    $('#compareDivider').style.left = `${clamped.toFixed(2)}%`;
    $('#compareHandle').style.left = `${clamped.toFixed(2)}%`;
  }

  function setupCompareSlider() {
    const stage = $('#compareStage');
    let dragging = false;

    function setFromClientX(clientX) {
      const rect = stage.getBoundingClientRect();
      const pct = ((clientX - rect.left) / rect.width) * 100;
      updateCompareSlider(pct);
    }

    stage.addEventListener('pointerdown', (e) => {
      dragging = true;
      stage.classList.add('dragging');
      stage.setPointerCapture(e.pointerId);
      setFromClientX(e.clientX);
    });
    stage.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setFromClientX(e.clientX);
    });
    stage.addEventListener('pointerup', () => {
      dragging = false;
      stage.classList.remove('dragging');
    });
    stage.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') updateCompareSlider(state.comparePct - 3);
      if (e.key === 'ArrowRight') updateCompareSlider(state.comparePct + 3);
    });

    updateCompareSlider(50);
  }

  /* ================================
     06 · 新建翻译任务 (F6)
     ================================ */
  function renderTranslate() {
    const cfg = state.translateCfg;

    // 约束：快速模式仅高质量配音可用
    const fastRow = $('#trFastModeRow');
    const fastSwitch = $('#trFastModeSwitch');
    const fastLabel = $('#trFastModeLabel');
    if (cfg.dubbingMode !== 'high_quality') {
      cfg.fastMode = false;
      fastRow.classList.add('disabled');
      fastSwitch.classList.remove('on');
      fastLabel.textContent = '快速模式（仅高质量配音可用）';
    } else {
      fastRow.classList.remove('disabled');
      fastSwitch.classList.toggle('on', cfg.fastMode);
      fastLabel.textContent = '快速模式（缩短耗时）';
    }

    $('#trDynamicDurSwitch').classList.toggle('on', cfg.dynamicDuration);
    $('#trBurnSubSwitch').classList.toggle('on', cfg.burnSubtitles);
    $('#trEnableInpaintSwitch').classList.toggle('on', cfg.enableInpaint);
    $('#trOutputAudioSwitch').classList.toggle('on', cfg.outputDubbingAudio);

    // 源语言下拉
    const srcSelect = $('#translateSourceLang');
    if (!srcSelect.options.length) {
      srcSelect.innerHTML = DATA.sourceLanguages
        .map((l) => `<option value="${l.code}">${l.name} ${l.code}</option>`)
        .join('');
    }
    srcSelect.value = cfg.sourceLang;

    // 快捷目标语种 chips
    const primaryLangs = DATA.outputLanguages.filter((l) => l.primary || cfg.targetLangs.includes(l.code));
    const shown = primaryLangs.slice(0, 6);
    const hiddenCount = DATA.outputLanguages.length - shown.length;
    const chipsWrap = $('#translateTargetLangs');
    chipsWrap.innerHTML =
      shown
        .map((l) => {
          const isSrc = l.code === cfg.sourceLang;
          const active = cfg.targetLangs.includes(l.code) && !isSrc;
          return `<button class="chip ${active ? 'active' : ''}" data-tlang="${l.code}" ${isSrc ? 'disabled title="不可与源语言相同"' : ''}>${l.name}</button>`;
        })
        .join('') +
      `<button class="chip ghost" id="openMoreLangsBtn">+ ${hiddenCount} 种</button>`;

    chipsWrap.querySelectorAll('[data-tlang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.tlang;
        if (cfg.targetLangs.includes(code)) {
          if (cfg.targetLangs.length === 1) {
            showToast('至少保留 1 个目标输出语种');
            return;
          }
          cfg.targetLangs = cfg.targetLangs.filter((c) => c !== code);
        } else {
          cfg.targetLangs.push(code);
        }
        renderTranslate();
      });
    });

    const moreBtn = $('#openMoreLangsBtn');
    if (moreBtn) moreBtn.addEventListener('click', openLangModal);

    // 配音模式
    $$('#dubbingModeSeg .seg-tile').forEach((b) => b.classList.toggle('active', b.dataset.dubbing === cfg.dubbingMode));

    // 字幕格式 chips
    $$('#trCaptionFormats .chip').forEach((c) => c.classList.toggle('active', cfg.captionFormats.includes(c.dataset.fmt)));

    // 字幕样式摘要
    const st = state.subtitleStyle;
    $('#trStyleSummary').textContent = `${st.font} · ${st.fontSize}px · 底部 ${st.topMarginRatio}%`;

    // 源文件列表
    const fileListEl = $('#translateFileList');
    const totalGB = state.translateFiles.reduce((s, f) => s + f.sizeGB, 0);
    const calc = CALC.calcTranslateBatch(state.translateFiles, cfg);

    if (!state.translateFiles.length) {
      fileListEl.innerHTML = `<div class="empty-state" style="padding:28px 20px;">暂未添加源文件 · <button class="mode-inline-action" id="restoreTranslateSamples">恢复示例素材</button></div>`;
      const btn = $('#restoreTranslateSamples');
      if (btn) {
        btn.addEventListener('click', () => {
          state.translateFiles = DATA.translateFiles.map((f) => ({ ...f }));
          renderTranslate();
        });
      }
    } else {
      fileListEl.innerHTML = state.translateFiles
        .map(
          (f) => `
        <div class="file-row" style="height:66px;">
          <div class="thumb sm"><img src="${DATA.previewAsset}" alt="" /></div>
          <div class="cell-stack" style="flex:1;">
            <span class="file-name">${escapeHtml(f.name)}</span>
            <span class="file-meta">${f.resolution} · ${f.fps} · ${CALC.formatDuration(f.durationSec)} · ${f.sizeGB.toFixed(2)} GB</span>
          </div>
          <span class="lang-detected-chip">识别为 ${escapeHtml(f.detectedLang)}</span>
          <button class="remove-btn" data-remove-tr="${f.id}" title="移除文件">
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M3 3l7 7M10 3l-7 7" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>
          </button>
        </div>`
        )
        .join('');

      fileListEl.querySelectorAll('[data-remove-tr]').forEach((btn) => {
        btn.addEventListener('click', () => {
          state.translateFiles = state.translateFiles.filter((x) => x.id !== btn.dataset.removeTr);
          renderTranslate();
        });
      });
    }

    $('#translateFileSummary').textContent = `${state.translateFiles.length} 个文件 · 合计 ${CALC.formatDurationCN(calc.totalSec)} · ${totalGB.toFixed(2)} GB`;

    // 产出预览卡（已修正：字幕份数 = 任务数 × 格式数）
    const fmtLabel = cfg.captionFormats.map((f) => f.replace('.', '')).join('+') || '无';
    $('#trPreviewTasks').textContent = String(calc.taskCount);
    $('#trPreviewVideos').textContent = `${calc.taskCount} 个 · MP4`;
    $('#trPreviewCaptions').textContent = `${calc.captionCount} 份 · ${fmtLabel}`;
    const audioEl = $('#trPreviewAudio');
    audioEl.textContent = cfg.outputDubbingAudio ? `${calc.audioCount} 个 · WAV` : '0 个';
    audioEl.classList.toggle('muted', !cfg.outputDubbingAudio);

    const parallelText =
      calc.taskCount <= 10
        ? `${calc.taskCount} 个任务可全部并行`
        : `账号并发上限 10，将分 ${Math.ceil(calc.taskCount / 10)} 批执行`;
    $('#trPreviewNote').textContent = `${state.translateFiles.length} 个源文件 × ${calc.langCount} 个目标语种 · ${parallelText}，预计 ${calc.estMinutes} 分钟完成`;

    const sampleBase = (state.translateFiles[0]?.name || 'S01E01.mp4').split('_')[0].replace(/\.[^.]+$/, '');
    const sampleNames = cfg.targetLangs.slice(0, 3).map((c) => `${sampleBase}_${c}.mp4`).join(' · ');
    $('#trNamingSample').textContent = `命名示例  ${sampleNames || '请选择至少 1 种目标语言'}`;

    // 底部费用
    $('#trTotalUsage').textContent = `${calc.billMin.toFixed(1)} 分钟`;
    $('#trTotalCost').textContent = `¥${calc.cost.toFixed(2)}`;
    const extraNote = cfg.enableInpaint ? '；去水印按修复算子另行计费' : '；未开启去水印前处理';
    $('#trCostFormula').textContent = `${calc.unitPrice} 元/分 × ${calc.totalMin.toFixed(1)} 分钟 × ${calc.langCount} 语种${extraNote}`;
    $('#submitTranslateLabel').textContent = `提交 ${calc.taskCount} 个任务`;
    $('#submitTranslateBtn').disabled = calc.taskCount === 0;
  }

  function openLangModal() {
    const grid = $('#langModalGrid');
    const cfg = state.translateCfg;
    grid.innerHTML = DATA.outputLanguages
      .map((l) => {
        const isSrc = l.code === cfg.sourceLang;
        const active = cfg.targetLangs.includes(l.code) && !isSrc;
        return `
        <button class="chip ${active ? 'active' : ''}" data-mlang="${l.code}" ${isSrc ? 'disabled' : ''} style="justify-content:space-between;height:32px;padding:0 10px;">
          <span>${l.name}</span>
          <span class="mono" style="font-size:9px;opacity:0.75;">${l.code}</span>
        </button>`;
      })
      .join('');

    grid.querySelectorAll('[data-mlang]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const code = btn.dataset.mlang;
        if (cfg.targetLangs.includes(code)) {
          if (cfg.targetLangs.length === 1) return;
          cfg.targetLangs = cfg.targetLangs.filter((c) => c !== code);
        } else {
          cfg.targetLangs.push(code);
        }
        renderTranslate();
        openLangModal();
      });
    });

    $('#langModal').classList.add('open');
  }

  function addLocalFilesToTranslate(fileList) {
    const added = Array.from(fileList || []).filter((f) => f && f.name);
    if (!added.length) return;
    added.forEach((f, idx) => {
      const sizeGB = Math.max(0.04, +(f.size / (1024 * 1024 * 1024)).toFixed(2));
      const estSec = Math.min(3600, Math.max(20, Math.round(sizeGB * 380)));
      state.translateFiles.push({
        id: `trf-u-${Date.now()}-${idx}`,
        name: f.name,
        resolution: '1920×1080',
        fps: '30.00fps',
        durationSec: estSec,
        sizeGB,
        detectedLang: '中文（简体）',
      });
    });
    renderTranslate();
    showToast(`已添加 ${added.length} 个视频到翻译队列`);
  }

  /* ================================
     07 · 多语成片结果 (F7)
     ================================ */
  function renderTranslateResult() {
    const lines = DATA.translateResult.captionLines;
    const activeLine = lines[state.activeCaptionIdx] || lines[2];

    const keyByCode = { 'en-US': 'en', 'ja-JP': 'ja', 'ko-KR': 'ko' };

    $('#translateResultCards').innerHTML = DATA.translateResult.cards
      .map((card) => {
        const text = activeLine[keyByCode[card.code]];
        return `
        <article class="lang-card">
          <div class="lang-thumb">
            <img src="${DATA.previewAsset}" alt="${card.label}" />
            <span class="lang-badge">${card.label}</span>
            <div class="burned-sub ${card.fontClass}">${escapeHtml(text)}</div>
          </div>
          <div class="lang-card-body">
            <span class="lang-orig">原文  ${escapeHtml(activeLine.zh)}</span>
            <span class="lang-trans ${card.fontClass}">${escapeHtml(text)}</span>
            <div class="lang-chips">
              <span class="meta-chip">${card.size}</span>
              <span class="meta-chip">${card.captions}</span>
            </div>
            <button class="btn btn-tonal btn-sm" style="width:100%;" data-dl-lang="${card.code}">下载成片与字幕</button>
          </div>
        </article>`;
      })
      .join('');

    $('#translateResultCards')
      .querySelectorAll('[data-dl-lang]')
      .forEach((btn) => {
        btn.addEventListener('click', () => {
          showToast(`已开始打包下载 ${btn.dataset.dlLang} 配音视频与 .srt/.ass 字幕`);
        });
      });

    const tbody = $('#captionCompareBody');
    tbody.innerHTML = lines
      .map(
        (line, idx) => `
      <div class="caption-row ${idx === state.activeCaptionIdx ? 'active' : ''}" data-cap-idx="${idx}">
        <span class="cap-time">${line.time}</span>
        <span class="cap-orig">${escapeHtml(line.zh)}</span>
        <span class="cap-trans">${escapeHtml(line.en)}</span>
        <span class="cap-trans lang-ja">${escapeHtml(line.ja)}</span>
        <span class="cap-trans lang-ko">${escapeHtml(line.ko)}</span>
      </div>`
      )
      .join('');

    tbody.querySelectorAll('[data-cap-idx]').forEach((row) => {
      row.addEventListener('click', () => {
        state.activeCaptionIdx = Number(row.dataset.capIdx);
        renderTranslateResult();
      });
    });
  }

  /* ================================
     字幕样式编辑器 & 用量账单
     ================================ */
  function renderSubtitleStylePreview() {
    const st = state.subtitleStyle;
    const el = $('#liveSubtitlePreview');
    const previewSize = Math.round(st.fontSize * 0.34);
    el.style.fontSize = `${previewSize}px`;
    el.style.color = st.fontColor;
    el.style.top = `${st.topMarginRatio}%`;
    el.style.width = `${st.widthRatio}%`;
    el.style.padding = st.bgOpacity > 0 ? '4px 12px' : '0';
    el.style.background = st.bgOpacity > 0 ? `rgba(0, 0, 0, ${st.bgOpacity / 100})` : 'transparent';
    const ow = st.outlineWidth;
    el.style.textShadow =
      ow > 0
        ? `0 0 ${ow * 2}px #000, ${ow}px ${ow}px 0 #000, -${ow}px -${ow}px 0 #000, ${ow}px -${ow}px 0 #000, -${ow}px ${ow}px 0 #000`
        : 'none';

    $('#styleSizeVal').textContent = `${st.fontSize} px`;
    $('#styleTopVal').textContent = `${st.topMarginRatio}%`;
    $('#styleOutlineVal').textContent = `${Number(st.outlineWidth).toFixed(1)} px`;
    $('#styleBgVal').textContent = `${st.bgOpacity}%`;
  }

  function renderBilling() {
    $('#billingTableBody').innerHTML = DATA.billingRecords
      .map(
        (b) => `
      <div class="bill-row">
        <span class="mono" style="font-size:10.5px;color:var(--text-dim);">${b.date}</span>
        <span style="color:var(--text-high);font-weight:500;">${escapeHtml(b.batch)}</span>
        <span style="font-size:11.5px;color:var(--text-body);">${escapeHtml(b.op)}</span>
        <span class="mono" style="font-size:10.5px;color:var(--text-subtle);">${b.unit}</span>
        <span class="mono" style="font-size:11px;color:var(--text-secondary);">${b.usage}</span>
        <span class="mono" style="font-size:11.5px;font-weight:500;color:var(--accent);text-align:right;">${b.cost}</span>
      </div>`
      )
      .join('');
  }

  /* ================================
     Event Wiring & Boot
     ================================ */
  function bindEvents() {
    // 全局导航跳转
    $$('[data-nav]').forEach((el) => {
      el.addEventListener('click', () => switchView(el.dataset.nav));
    });

    // 顶栏搜索实时过滤任务总览
    $('#globalSearchInput').addEventListener('input', (e) => {
      state.searchQuery = e.target.value;
      if (state.view !== 'overview') switchView('overview');
      renderTaskTable();
    });

    // ⌘K 快捷面板
    $('#openCmdPaletteBtn').addEventListener('click', openCmdModal);
    $('#closeCmdBtn').addEventListener('click', closeCmdModal);
    $('#cmdModal').addEventListener('click', (e) => {
      if (e.target.id === 'cmdModal') closeCmdModal();
    });
    $('#cmdSearchInput').addEventListener('input', (e) => renderCmdPalette(e.target.value));
    window.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if ($('#cmdModal').classList.contains('open')) closeCmdModal();
        else openCmdModal();
      } else if (e.key === 'Escape') {
        closeCmdModal();
        $('#langModal').classList.remove('open');
      }
    });

    $('#notifyBtn').addEventListener('click', () => {
      showToast('批次 B-0412 已完成 2 / 6，点击运行中任务可实时跟踪');
    });

    // F1 事件
    $$('#taskFilterSeg .filter-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.taskFilter = btn.dataset.filter;
        $$('#taskFilterSeg .filter-btn').forEach((b) => b.classList.toggle('active', b === btn));
        renderTaskTable();
      });
    });

    $('#quickJumpMonitorBtn').addEventListener('click', () => switchView('monitor'));

    $('#exportManifestBtn').addEventListener('click', () => {
      const header = 'task_id,file,scheme,targets,status,usage,submit_time\n';
      const rows = state.tasks
        .map((t) => `${t.id},"${t.file}","${t.scheme}","${t.subScheme}",${t.statusLabel},"${t.usage}",${t.time}`)
        .join('\n');
      downloadTextFile('cleanframe-tasks.csv', '\uFEFF' + header + rows, 'text/csv;charset=utf-8');
      showToast('已导出任务清单 cleanframe-tasks.csv');
    });

    // F2 事件
    const inpDrop = $('#inpaintDropzone');
    $('#inpaintChooseBtn').addEventListener('click', () => $('#inpaintFileInput').click());
    $('#inpaintFileInput').addEventListener('change', (e) => {
      addLocalFilesToInpaint(e.target.files);
      e.target.value = '';
    });
    inpDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      inpDrop.classList.add('dragover');
    });
    inpDrop.addEventListener('dragleave', () => inpDrop.classList.remove('dragover'));
    inpDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      inpDrop.classList.remove('dragover');
      addLocalFilesToInpaint(e.dataTransfer.files);
    });
    $('#inpaintClearBtn').addEventListener('click', () => {
      state.inpaintFiles = [];
      renderInpaint();
    });

    function cycleInpaintPreset() {
      state.inpaintPresetIdx = (state.inpaintPresetIdx + 1) % state.inpaintPresetKeys.length;
      const key = state.inpaintPresetKeys[state.inpaintPresetIdx];
      const p = DATA.inpaintPresets[key];
      state.inpaintCfg = { ...p, targets: [...p.targets] };
      renderInpaint();
      showToast(`已切换方案：${p.name}`);
    }
    $('#cycleInpaintPresetBtn').addEventListener('click', cycleInpaintPreset);
    $('#inpaintPresetBadge').addEventListener('click', cycleInpaintPreset);

    $$('#modelLevelSeg .seg-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.inpaintCfg.modelLevel = btn.dataset.model;
        renderInpaint();
      });
    });

    $$('#inpaintTargetsWrap .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.disabled) return;
        const t = chip.dataset.target;
        const arr = state.inpaintCfg.targets;
        if (arr.includes(t)) {
          if (arr.length === 1) {
            showToast('至少需要保留 1 个擦除目标');
            return;
          }
          state.inpaintCfg.targets = arr.filter((x) => x !== t);
        } else {
          state.inpaintCfg.targets.push(t);
        }
        renderInpaint();
      });
    });

    $$('#locateModeSeg .seg-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        state.inpaintCfg.locateMode = btn.dataset.locate;
        renderInpaint();
      });
    });

    $('#inpaintResSelect').addEventListener('change', (e) => {
      state.inpaintCfg.maxResolution = e.target.value;
      renderInpaint();
    });
    $('#inpaintFpsSelect').addEventListener('change', (e) => {
      state.inpaintCfg.maxFps = Number(e.target.value);
      renderInpaint();
    });
    $('#inpaintQualitySelect').addEventListener('change', (e) => {
      state.inpaintCfg.videoMode = e.target.value;
      renderInpaint();
    });
    $('#inpaintCodecSelect').addEventListener('change', (e) => {
      state.inpaintCfg.codec = e.target.value;
      renderInpaint();
    });

    $('#subtitleProtectRow').addEventListener('click', () => {
      if ($('#subtitleProtectRow').classList.contains('disabled')) return;
      state.inpaintCfg.subtitleProtect = !state.inpaintCfg.subtitleProtect;
      renderInpaint();
    });
    $('#subtitlePersistentRow').addEventListener('click', () => {
      state.inpaintCfg.subtitlePersistent = !state.inpaintCfg.subtitlePersistent;
      renderInpaint();
    });

    $('#submitInpaintBtn').addEventListener('click', () => {
      const count = state.inpaintFiles.length;
      if (!count) return;
      showToast(`已提交 ${count} 个修复任务至队列 B-0412`);
      switchView('monitor');
    });

    // F3 事件
    $('#annotatePrevFile').addEventListener('click', () => {
      state.annotateFileIdx = (state.annotateFileIdx - 1 + DATA.annotationFiles.length) % DATA.annotationFiles.length;
      renderAnnotate();
    });
    $('#annotateNextFile').addEventListener('click', () => {
      state.annotateFileIdx = (state.annotateFileIdx + 1) % DATA.annotationFiles.length;
      renderAnnotate();
    });
    $('#toolSelectBtn').addEventListener('click', () => {
      state.annotateTool = 'select';
      renderAnnotate();
    });
    $('#toolDrawBtn').addEventListener('click', () => {
      state.annotateTool = 'draw';
      renderAnnotate();
      showToast('在视频画面上按住拖动即可框选新区域');
    });
    $('#toolUndoBtn').addEventListener('click', () => {
      state.regions = DATA.regions.map((r) => ({ ...r, bbox: [...r.bbox] }));
      state.selectedRegionId = 'reg-2';
      renderAnnotate();
      showToast('已重置为初始 3 个标注区域');
    });
    $('#addRegionBtn').addEventListener('click', () => {
      const colors = ['mint', 'blue', 'amber'];
      const n = state.regions.length + 1;
      const item = {
        id: `reg-${Date.now()}`,
        name: `区域 ${n} · 自定义`,
        shortName: `区域 ${n} · 自定义`,
        color: colors[(n - 1) % colors.length],
        bbox: [280, 260, 560, 420],
        startSec: 0,
        endSec: getActiveAnnotateFile().durationSec,
        untilEnd: true,
      };
      state.regions.push(item);
      state.selectedRegionId = item.id;
      renderAnnotate();
    });

    $('#regionStartInput').addEventListener('change', (e) => {
      const reg = getSelectedRegion();
      if (!reg) return;
      const total = getActiveAnnotateFile().durationSec;
      const val = Math.max(0, Math.min(total - 1, parseFloat(e.target.value) || 0));
      reg.startSec = +val.toFixed(1);
      if (!reg.untilEnd && reg.endSec <= reg.startSec) reg.endSec = Math.min(total, reg.startSec + 5);
      renderAnnotate();
    });

    $('#regionEndInput').addEventListener('change', (e) => {
      const reg = getSelectedRegion();
      if (!reg || reg.untilEnd) return;
      const total = getActiveAnnotateFile().durationSec;
      const val = Math.max(reg.startSec + 1, Math.min(total, parseFloat(e.target.value) || total));
      reg.endSec = +val.toFixed(1);
      renderAnnotate();
    });

    $('#regionUntilEndRow').addEventListener('click', () => {
      const reg = getSelectedRegion();
      if (!reg) return;
      reg.untilEnd = !reg.untilEnd;
      if (!reg.untilEnd && reg.endSec <= reg.startSec) {
        reg.endSec = Math.min(getActiveAnnotateFile().durationSec, reg.startSec + 60);
      }
      renderAnnotate();
    });

    $('#applyAllBatchRow').addEventListener('click', () => {
      state.applyAllBatch = !state.applyAllBatch;
      renderAnnotate();
    });

    $('#saveTemplateBtn').addEventListener('click', () => {
      showToast(`已保存区域模板（含 ${state.regions.length} 个归一化修复框）`);
    });

    $('#applyRegionsBtn').addEventListener('click', () => {
      state.inpaintCfg.locateMode = 'fixed';
      renderInpaint();
      showToast(`已将 ${state.regions.length} 个固定区域应用到当前修复任务`);
      switchView('inpaint');
    });

    // F4 事件
    $('#toggleQueuePauseBtn').addEventListener('click', () => {
      state.queuePaused = !state.queuePaused;
      const now = new Date();
      const ts = [now.getHours(), now.getMinutes(), now.getSeconds()].map((v) => String(v).padStart(2, '0')).join(':');
      state.batchLogs.push({
        time: ts,
        tag: 'queue',
        msg: state.queuePaused ? 'paused by operator' : 'resumed polling (3s)',
        tone: state.queuePaused ? 'amber' : 'mint',
      });
      renderMonitor();
    });

    $('#cancelBatchBtn').addEventListener('click', () => {
      state.queuePaused = true;
      showToast('已停止后续排队任务提交，已完成文件不受影响');
      renderMonitor();
    });

    // F5 事件
    $('#downloadRepairedBtn').addEventListener('click', () => {
      showToast('正在获取预签名链接并下载 S01E01_雨夜来客_inpainted.mp4（24 小时有效）');
    });

    // F6 事件
    const trDrop = $('#translateDropzone');
    $('#translateChooseBtn').addEventListener('click', () => $('#translateFileInput').click());
    $('#translateFileInput').addEventListener('change', (e) => {
      addLocalFilesToTranslate(e.target.files);
      e.target.value = '';
    });
    trDrop.addEventListener('dragover', (e) => {
      e.preventDefault();
      trDrop.classList.add('dragover');
    });
    trDrop.addEventListener('dragleave', () => trDrop.classList.remove('dragover'));
    trDrop.addEventListener('drop', (e) => {
      e.preventDefault();
      trDrop.classList.remove('dragover');
      addLocalFilesToTranslate(e.dataTransfer.files);
    });
    $('#translateClearBtn').addEventListener('click', () => {
      state.translateFiles = [];
      renderTranslate();
    });

    $('#translateSourceLang').addEventListener('change', (e) => {
      state.translateCfg.sourceLang = e.target.value;
      state.translateCfg.targetLangs = state.translateCfg.targetLangs.filter((c) => c !== e.target.value);
      if (!state.translateCfg.targetLangs.length) {
        state.translateCfg.targetLangs = [e.target.value === 'en-US' ? 'ja-JP' : 'en-US'];
      }
      renderTranslate();
    });

    $$('#dubbingModeSeg .seg-tile').forEach((btn) => {
      btn.addEventListener('click', () => {
        state.translateCfg.dubbingMode = btn.dataset.dubbing;
        if (btn.dataset.dubbing === 'high_quality') state.translateCfg.fastMode = true;
        renderTranslate();
      });
    });

    $('#trFastModeRow').addEventListener('click', () => {
      if ($('#trFastModeRow').classList.contains('disabled')) return;
      state.translateCfg.fastMode = !state.translateCfg.fastMode;
      renderTranslate();
    });
    $('#trDynamicDurRow').addEventListener('click', () => {
      state.translateCfg.dynamicDuration = !state.translateCfg.dynamicDuration;
      renderTranslate();
    });
    $('#trBurnSubRow').addEventListener('click', () => {
      state.translateCfg.burnSubtitles = !state.translateCfg.burnSubtitles;
      renderTranslate();
    });
    $('#trEnableInpaintRow').addEventListener('click', () => {
      state.translateCfg.enableInpaint = !state.translateCfg.enableInpaint;
      renderTranslate();
    });
    $('#trOutputAudioRow').addEventListener('click', () => {
      state.translateCfg.outputDubbingAudio = !state.translateCfg.outputDubbingAudio;
      renderTranslate();
    });

    $$('#trCaptionFormats .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const fmt = chip.dataset.fmt;
        const arr = state.translateCfg.captionFormats;
        if (arr.includes(fmt)) {
          if (arr.length === 1) {
            showToast('至少保留 1 种字幕输出格式');
            return;
          }
          state.translateCfg.captionFormats = arr.filter((x) => x !== fmt);
        } else {
          state.translateCfg.captionFormats.push(fmt);
        }
        renderTranslate();
      });
    });

    $('#closeLangModalBtn').addEventListener('click', () => $('#langModal').classList.remove('open'));
    $('#langModal').addEventListener('click', (e) => {
      if (e.target.id === 'langModal') $('#langModal').classList.remove('open');
    });

    $('#submitTranslateBtn').addEventListener('click', () => {
      const calc = CALC.calcTranslateBatch(state.translateFiles, state.translateCfg);
      if (!calc.taskCount) return;
      showToast(`已提交 ${calc.taskCount} 个翻译任务，可在多语成片页查看示例结果`);
      switchView('translate-result');
    });

    // F7 事件
    $('#downloadAllTranslateBtn').addEventListener('click', () => {
      showToast('正在打包下载全部 10 个产物（3 成片 + 6 字幕 + 1 修复原片）');
    });
    $('#packCaptionsBtn').addEventListener('click', () => {
      showToast('已生成 6 份多语字幕压缩包 S01E01_captions.zip');
    });
    $('#downloadCleanMasterBtn').addEventListener('click', () => {
      showToast('正在下载修复原片 S01E01_repaired_master.mp4（82.1 MB）');
    });

    // 字幕样式事件
    $('#styleFontSelect').addEventListener('change', (e) => {
      state.subtitleStyle.font = e.target.value;
      renderSubtitleStylePreview();
    });
    $('#styleSizeRange').addEventListener('input', (e) => {
      state.subtitleStyle.fontSize = Number(e.target.value);
      renderSubtitleStylePreview();
    });
    $('#styleTopRange').addEventListener('input', (e) => {
      state.subtitleStyle.topMarginRatio = Number(e.target.value);
      renderSubtitleStylePreview();
    });
    $('#styleOutlineRange').addEventListener('input', (e) => {
      state.subtitleStyle.outlineWidth = Number(e.target.value);
      renderSubtitleStylePreview();
    });
    $('#styleBgRange').addEventListener('input', (e) => {
      state.subtitleStyle.bgOpacity = Number(e.target.value);
      renderSubtitleStylePreview();
    });
    $$('#styleColorSwatches .swatch').forEach((sw) => {
      sw.addEventListener('click', () => {
        state.subtitleStyle.fontColor = sw.dataset.color;
        $$('#styleColorSwatches .swatch').forEach((s) => s.classList.toggle('active', s === sw));
        renderSubtitleStylePreview();
      });
    });
    $('#resetSubStyleBtn').addEventListener('click', () => {
      state.subtitleStyle = { ...DATA.subtitleStyle };
      $('#styleFontSelect').value = state.subtitleStyle.font;
      $('#styleSizeRange').value = state.subtitleStyle.fontSize;
      $('#styleTopRange').value = state.subtitleStyle.topMarginRatio;
      $('#styleOutlineRange').value = state.subtitleStyle.outlineWidth;
      $('#styleBgRange').value = state.subtitleStyle.bgOpacity;
      renderSubtitleStylePreview();
      showToast('已恢复默认烧录字幕样式');
    });
    $('#applySubStyleBtn').addEventListener('click', () => {
      renderTranslate();
      showToast('字幕样式已应用到翻译方案');
      switchView('translate');
    });

    // 账单导出
    $('#exportBillBtn').addEventListener('click', () => {
      const header = '出账时间,批次与文件,计费项,单价,计费用量,金额\n';
      const rows = DATA.billingRecords
        .map((b) => `"${b.date}","${b.batch}","${b.op}","${b.unit}","${b.usage}","${b.cost}"`)
        .join('\n');
      downloadTextFile('cleanframe-billing-2026-11.csv', '\uFEFF' + header + rows, 'text/csv;charset=utf-8');
      showToast('已导出本月对账单 cleanframe-billing-2026-11.csv');
    });
  }

  /* ================================
     Init
     ================================ */
  function init() {
    renderTaskTable();
    renderInpaint();
    renderAnnotate();
    renderMonitor();
    renderTranslate();
    renderTranslateResult();
    renderSubtitleStylePreview();
    renderBilling();
    setupAnnotateDrawTool();
    setupCompareSlider();
    bindEvents();

    const hashView = window.location.hash.replace(/^#/, '');
    if (hashView && VIEW_TO_NAV[hashView]) {
      switchView(hashView);
    }
    window.addEventListener('hashchange', () => {
      const next = window.location.hash.replace(/^#/, '');
      if (next && VIEW_TO_NAV[next]) switchView(next);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
