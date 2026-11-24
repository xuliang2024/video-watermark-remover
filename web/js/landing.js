/* 净影 CleanFrame — 官网宣传页交互逻辑 */
(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* ================================
     1. Hero Interactive Compare & Multi-Lang Preview
     ================================ */
  const HERO_MODES = {
    wipe: {
      isTranslate: false,
      link: './workspace.html#compare',
      linkText: '在工作台查看对比 ↗',
      hint: '左右拖动中间白色手柄，核验右上角角标与底部硬字幕的无痕擦除效果',
    },
    'en-US': {
      isTranslate: true,
      badge: 'en-US 英语配音 · 音色 1:1 复刻',
      caption: "I won't wait for you anymore.",
      langClass: '',
      link: './workspace.html#translate-result',
      linkText: '查看多语成片 ↗',
      hint: '自动擦除中文原字幕后烧录英文字幕，同步生成原声复刻英语配音与 .srt / .ass 字幕文件',
    },
    'ja-JP': {
      isTranslate: true,
      badge: 'ja-JP 日语配音 · 音色 1:1 复刻',
      caption: 'もう、あなたを待たない。',
      langClass: 'lang-ja',
      link: './workspace.html#translate-result',
      linkText: '查看多语成片 ↗',
      hint: '日语字幕自动匹配 NotoSansJP 字体族，短剧台词按本地语境润色',
    },
    'ko-KR': {
      isTranslate: true,
      badge: 'ko-KR 韩语配音 · 音色 1:1 复刻',
      caption: '더는 당신을 기다리지 않을게요.',
      langClass: 'lang-ko',
      link: './workspace.html#translate-result',
      linkText: '查看多语成片 ↗',
      hint: '韩语字幕自动匹配 NotoSansKR 字体族，支持同时导出纯人声配音 .wav',
    },
  };

  function setupHeroStage() {
    const compare = $('#heroCompare');
    const beforeLayer = $('#heroBeforeLayer');
    const divider = $('#heroDivider');
    const handle = $('#heroHandle');
    let pct = 50;
    let dragging = false;

    function setSlider(next) {
      pct = Math.max(4, Math.min(96, next));
      beforeLayer.style.clipPath = `inset(0 ${(100 - pct).toFixed(2)}% 0 0)`;
      divider.style.left = `${pct.toFixed(2)}%`;
      handle.style.left = `${pct.toFixed(2)}%`;
    }

    function fromClientX(clientX) {
      const rect = compare.getBoundingClientRect();
      setSlider(((clientX - rect.left) / rect.width) * 100);
    }

    compare.addEventListener('pointerdown', (e) => {
      if (compare.classList.contains('translate-mode')) return;
      dragging = true;
      compare.classList.add('dragging');
      compare.setPointerCapture(e.pointerId);
      fromClientX(e.clientX);
    });
    compare.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      fromClientX(e.clientX);
    });
    compare.addEventListener('pointerup', () => {
      dragging = false;
      compare.classList.remove('dragging');
    });

    $$('.stage-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const mode = tab.dataset.heroMode;
        const cfg = HERO_MODES[mode];
        if (!cfg) return;
        $$('.stage-tab').forEach((t) => t.classList.toggle('active', t === tab));
        compare.classList.toggle('translate-mode', cfg.isTranslate);
        $('#heroOpenWorkspaceLink').href = cfg.link;
        $('#heroOpenWorkspaceLink').textContent = cfg.linkText;
        $('#heroStageHint').textContent = cfg.hint;

        if (cfg.isTranslate) {
          $('#heroDubBadgeText').textContent = cfg.badge;
          const cap = $('#heroBurnedCaption');
          cap.textContent = cfg.caption;
          cap.className = `hero-burned-caption ${cfg.langClass}`;
        }
      });
    });

    setSlider(50);
  }

  /* ================================
     2. Feature Screenshot Tab Switchers
     ================================ */
  function setupFeatureShowcases() {
    $$('[data-showcase-group]').forEach((group) => {
      const targetImg = document.getElementById(group.dataset.showcaseImg);
      const targetLink = document.getElementById(group.dataset.showcaseLink);
      group.querySelectorAll('.showcase-tab').forEach((btn) => {
        btn.addEventListener('click', () => {
          group.querySelectorAll('.showcase-tab').forEach((b) => b.classList.toggle('active', b === btn));
          if (targetImg && btn.dataset.src) targetImg.src = btn.dataset.src;
          if (targetLink && btn.dataset.href) targetLink.href = btn.dataset.href;
        });
      });
    });
  }

  /* ================================
     3. Interactive Cost Calculator
     ================================ */
  const calcState = {
    minutesPerFile: 8,
    fileCount: 4,
    inpaintTier: 'precise', // none | lite | standard | precise
    resolution: '1080p', // 1080p | 4k
    translateMode: 'high_quality', // none | standard | high_quality
    langCount: 3,
  };

  function updateCalculator() {
    const totalInputMin = calcState.minutesPerFile * calcState.fileCount;
    $('#calcDurVal').textContent = `${calcState.minutesPerFile} 分钟/集`;
    $('#calcCountVal').textContent = `${calcState.fileCount} 集（合计 ${totalInputMin} 分钟）`;
    $('#calcLangVal').textContent = `${calcState.langCount} 种语种`;

    // 修复费用（按 30fps 系数 1 计算）
    const inpaintPriceMap = { none: 0, lite: 0.5, standard: 1.5, precise: 3.0 };
    const resCoeff = calcState.resolution === '4k' ? 2 : 1;
    const inpaintBillMin = calcState.inpaintTier === 'none' ? 0 : totalInputMin * resCoeff;
    const inpaintCost = inpaintBillMin * inpaintPriceMap[calcState.inpaintTier];

    // 翻译费用（按输入时长 × 语种数）
    const transPriceMap = { none: 0, standard: 1.5, high_quality: 4.0 };
    const translateEnabled = calcState.translateMode !== 'none';
    const transBillMin = translateEnabled ? totalInputMin * calcState.langCount : 0;
    const transCost = transBillMin * transPriceMap[calcState.translateMode];

    $('#calcLangGroup').style.opacity = translateEnabled ? '1' : '0.4';
    $('#calcLangRange').disabled = !translateEnabled;

    $('#calcInpaintLine').textContent =
      calcState.inpaintTier === 'none'
        ? '未启用'
        : `¥${inpaintCost.toFixed(2)}（${inpaintBillMin} 折算分）`;

    $('#calcTranslateLine').textContent = !translateEnabled
      ? '未启用'
      : `¥${transCost.toFixed(2)}（${totalInputMin} 分 × ${calcState.langCount} 语种）`;

    const total = inpaintCost + transCost;
    $('#calcTotalPrice').textContent = `¥${total.toFixed(2)}`;

    const cta = $('#calcStartBtn');
    if (translateEnabled) {
      cta.href = './workspace.html#translate';
      cta.textContent = '进入工作台配置多语翻译 →';
    } else {
      cta.href = './workspace.html#inpaint';
      cta.textContent = '进入工作台批量去水印 →';
    }
  }

  function setupCalculator() {
    $('#calcDurRange').addEventListener('input', (e) => {
      calcState.minutesPerFile = Number(e.target.value);
      updateCalculator();
    });
    $('#calcCountRange').addEventListener('input', (e) => {
      calcState.fileCount = Number(e.target.value);
      updateCalculator();
    });
    $('#calcLangRange').addEventListener('input', (e) => {
      calcState.langCount = Number(e.target.value);
      updateCalculator();
    });

    $$('[data-calc-inpaint]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calcState.inpaintTier = btn.dataset.calcInpaint;
        $$('[data-calc-inpaint]').forEach((b) => b.classList.toggle('active', b === btn));
        updateCalculator();
      });
    });

    $$('[data-calc-res]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calcState.resolution = btn.dataset.calcRes;
        $$('[data-calc-res]').forEach((b) => b.classList.toggle('active', b === btn));
        updateCalculator();
      });
    });

    $$('[data-calc-trans]').forEach((btn) => {
      btn.addEventListener('click', () => {
        calcState.translateMode = btn.dataset.calcTrans;
        $$('[data-calc-trans]').forEach((b) => b.classList.toggle('active', b === btn));
        updateCalculator();
      });
    });

    updateCalculator();
  }

  /* ================================
     4. FAQ Accordion
     ================================ */
  function setupFaq() {
    $$('.faq-q').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        item.classList.toggle('open');
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupHeroStage();
    setupFeatureShowcases();
    setupCalculator();
    setupFaq();
  });
})();
