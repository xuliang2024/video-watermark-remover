/* 净影 CleanFrame — 算子能力数据、预设与计费引擎 */

window.CLEANFRAME_DATA = {
  previewAsset: './assets/frame_16x9.png',

  /* 01 任务总览列表（已同步收口：每行对应不同方案 + 翻译任务） */
  tasks: [
    {
      id: 'task-20261113-01a8',
      file: 'S01E01_雨夜来客.mp4',
      meta: '1920×1080 · 29.97fps · 8:24',
      type: 'inpaint',
      scheme: '专业版 · 精准识别',
      subScheme: '水印 · 普通字幕',
      status: 'running',
      statusLabel: '运行中',
      progress: 62,
      usage: '—',
      time: '14:32',
      targetView: 'monitor',
    },
    {
      id: 'task-20261113-02c4',
      file: 'S01E02_灯下无声.mp4',
      meta: '1920×1080 · 29.97fps · 8:12',
      type: 'inpaint',
      scheme: '专业版 · 精准识别',
      subScheme: '仅普通字幕',
      status: 'completed',
      statusLabel: '已完成',
      progress: 100,
      usage: '8.20 分',
      time: '13:58',
      targetView: 'compare',
    },
    {
      id: 'task-20261113-03f1',
      file: 'EP03_旧信.mp4',
      meta: '3840×2160 · 25.00fps · 9:06',
      type: 'inpaint',
      scheme: '专业版 · 精准识别',
      subScheme: '水印 · 角标 · Logo',
      status: 'completed',
      statusLabel: '已完成',
      progress: 100,
      usage: '18.20 分',
      time: '13:20',
      targetView: 'compare',
    },
    {
      id: 'task-20261113-04d9',
      file: 'S02E01_潮汐.mp4',
      meta: '1920×1080 · 30.00fps · 7:48',
      type: 'inpaint',
      scheme: '极速版 · 标准检测',
      subScheme: '字幕 + 水印',
      status: 'failed',
      statusLabel: '失败',
      progress: 0,
      usage: '—',
      time: '12:46',
      errorMsg: 'Video.VLMFailed：检测服务瞬时超时，建议重试',
      targetView: 'monitor',
    },
    {
      id: 'task-20261113-05b2',
      file: 'BTS_花絮_0412.mp4',
      meta: '2560×1440 · 24.00fps · 3:02',
      type: 'inpaint',
      scheme: '专业版 · 全文字擦除',
      subScheme: '全部画面文字',
      status: 'queued',
      statusLabel: '排队中',
      progress: 0,
      usage: '—',
      time: '12:31',
      targetView: 'monitor',
    },
    {
      id: 'task-20261113-06e7',
      file: '预告片_竖版_15s.mp4',
      meta: '1080×1920 · 30.00fps · 0:15',
      type: 'translate',
      scheme: '翻译 · 高质量配音',
      subScheme: 'en-US · ja-JP · ko-KR',
      status: 'completed',
      statusLabel: '已完成',
      progress: 100,
      usage: '0.75 分',
      time: '11:56',
      targetView: 'translate-result',
    },
  ],

  /* 02 新建修复任务初始素材 */
  inpaintFiles: [
    {
      id: 'inf-1',
      name: 'S01E01_雨夜来客.mp4',
      width: 1920,
      height: 1080,
      fps: 29.97,
      durationSec: 504, // 8:24 -> 8.40 min
      sizeGB: 1.24,
    },
    {
      id: 'inf-2',
      name: 'S01E02_灯下无声.mp4',
      width: 1920,
      height: 1080,
      fps: 29.97,
      durationSec: 492, // 8:12 -> 8.20 min
      sizeGB: 1.18,
    },
    {
      id: 'inf-3',
      name: 'EP03_旧信.mp4',
      width: 3840,
      height: 2160,
      fps: 25.00,
      durationSec: 546, // 9:06 -> 9.10 min (4K coeff 2 -> 18.20)
      sizeGB: 3.86,
    },
    {
      id: 'inf-4',
      name: 'BTS_花絮_0412.mp4',
      width: 2560,
      height: 1440,
      fps: 59.94,
      durationSec: 182, // 3:02 -> 3.033 min (2.5K > 1080p -> coeff 2 -> 6.06)
      sizeGB: 0.94,
    },
  ],

  inpaintPresets: {
    drama_watermark: {
      name: '预设 · 剧集去水印',
      modelLevel: 'pro',
      targets: ['watermark', 'subtitle'],
      locateMode: 'precise',
      maxResolution: '4k',
      maxFps: 30,
      videoMode: 'balanced',
      codec: 'h264',
      subtitleProtect: false,
      subtitlePersistent: false,
    },
    logo_only: {
      name: '预设 · 仅擦角标保字幕',
      modelLevel: 'pro',
      targets: ['watermark'],
      locateMode: 'precise',
      maxResolution: '1080p',
      maxFps: 30,
      videoMode: 'high',
      codec: 'h264',
      subtitleProtect: true,
      subtitlePersistent: false,
    },
    fast_clean: {
      name: '预设 · 极速清字幕',
      modelLevel: 'lite',
      targets: ['subtitle', 'scrolling_subtitle'],
      locateMode: 'standard',
      maxResolution: '1080p',
      maxFps: 30,
      videoMode: 'balanced',
      codec: 'h264',
      subtitleProtect: false,
      subtitlePersistent: true,
    },
  },

  /* 03 区域标注：归一化 1000×1000 坐标与生效时段 */
  annotationFiles: [
    { name: 'S01E01_雨夜来客.mp4', width: 1920, height: 1080, fps: 29.97, durationSec: 504, frames: 15105 },
    { name: 'S01E02_灯下无声.mp4', width: 1920, height: 1080, fps: 29.97, durationSec: 492, frames: 14745 },
    { name: 'EP03_旧信.mp4', width: 3840, height: 2160, fps: 25.00, durationSec: 546, frames: 13650 },
    { name: 'BTS_花絮_0412.mp4', width: 2560, height: 1440, fps: 59.94, durationSec: 182, frames: 10909 },
  ],

  regions: [
    {
      id: 'reg-1',
      name: '区域 1 · 角标',
      shortName: '区域 1 · 角标',
      color: 'mint',
      bbox: [820, 60, 960, 180],
      startSec: 0.5,
      endSec: 62.0,
      untilEnd: false,
    },
    {
      id: 'reg-2',
      name: '区域 2 · 字幕',
      shortName: '区域 2 · 字幕',
      color: 'blue',
      bbox: [80, 820, 920, 930],
      startSec: 62.0,
      endSec: 504.0,
      untilEnd: true,
    },
    {
      id: 'reg-3',
      name: '区域 3 · 剧集信息',
      shortName: '区域 3 · 剧集',
      color: 'amber',
      bbox: [40, 80, 300, 160],
      startSec: 4.0,
      endSec: 40.0,
      untilEnd: false,
    },
  ],

  /* 04 批次运行监控 */
  batchQueue: [
    { id: 'q-1', name: 'S01E01_雨夜来客.mp4', meta: '1920×1080 · 8:24 · 计费 8.40 分钟', status: 'completed', statusLabel: '已完成', progress: 100, eta: '14:41', billMin: 8.40 },
    { id: 'q-2', name: 'S01E02_灯下无声.mp4', meta: '1920×1080 · 8:12 · 计费 8.20 分钟', status: 'completed', statusLabel: '已完成', progress: 100, eta: '14:38', billMin: 8.20 },
    { id: 'q-3', name: 'EP03_旧信.mp4', meta: '3840×2160 · 9:06 · 预计 18.20 分钟', status: 'running', statusLabel: '运行中', progress: 62, eta: '预计 15:24', billMin: 18.20 },
    { id: 'q-4', name: 'BTS_花絮_0412.mp4', meta: '2560×1440 · 3:02 · 预计 6.06 分钟', status: 'queued', statusLabel: '排队中', progress: 0, eta: '预计 15:41', billMin: 6.06 },
    { id: 'q-5', name: 'S02E01_潮汐.mp4', meta: '1920×1080 · 7:48 · 待计费', status: 'queued', statusLabel: '排队中', progress: 0, eta: '预计 15:52', billMin: 7.80 },
    { id: 'q-6', name: '预告片_竖版_15s.mp4', meta: '1080×1920 · 0:15 · 待计费', status: 'queued', statusLabel: '排队中', progress: 0, eta: '预计 15:58', billMin: 0.25 },
  ],

  batchLogs: [
    { time: '14:32:04', tag: 'submit', msg: '6 tasks accepted', tone: 'dim' },
    { time: '14:32:11', tag: 'S01E01', msg: 'PENDING → RUNNING', tone: 'normal' },
    { time: '14:38:52', tag: 'S01E01', msg: 'COMPLETED   8.40 min', tone: 'mint' },
    { time: '14:38:53', tag: 'S01E02', msg: 'PENDING → RUNNING', tone: 'normal' },
    { time: '14:41:06', tag: 'S01E02', msg: 'COMPLETED   8.20 min', tone: 'mint' },
    { time: '14:41:07', tag: 'EP03', msg: 'PENDING → RUNNING', tone: 'normal' },
    { time: '14:48:20', tag: 'EP03', msg: 'info: 4K output, res coeff 2.0', tone: 'amber' },
    { time: '14:52:31', tag: 'EP03', msg: 'progress 62%', tone: 'normal' },
    { time: '14:52:34', tag: 'poll', msg: 'task-abc123 RUNNING', tone: 'faint' },
    { time: '14:52:37', tag: 'queue', msg: '3 tasks waiting', tone: 'faint' },
    { time: '14:52:40', tag: 'poll', msg: 'task-abc123 RUNNING', tone: 'faint' },
    { time: '14:55:02', tag: 'EP03', msg: 'progress 71%', tone: 'dim' },
    { time: '14:58:14', tag: 'EP03', msg: 'progress 84%', tone: 'dim' },
    { time: '15:01:33', tag: 'EP03', msg: 'progress 96%', tone: 'dim' },
    { time: '15:02:47', tag: 'S02E01', msg: 'queued  position 1', tone: 'dim' },
    { time: '15:02:47', tag: 'PRV15', msg: 'queued  position 2', tone: 'dim' },
    { time: '15:02:48', tag: 'poll', msg: 'task-abc123 RUNNING', tone: 'faint' },
  ],

  /* 06 新建翻译任务数据 */
  translateFiles: [
    {
      id: 'trf-1',
      name: 'S01E01_雨夜来客.mp4',
      resolution: '1920×1080',
      fps: '29.97fps',
      durationSec: 504, // 8:24
      sizeGB: 1.24,
      detectedLang: '中文（简体）',
    },
    {
      id: 'trf-2',
      name: '预告_30s_竖版.mp4',
      resolution: '1080×1920',
      fps: '30.00fps',
      durationSec: 42, // 0:42 -> total 546s = 9:06 = 9.10 min
      sizeGB: 0.29,
      detectedLang: '中文（简体）',
    },
  ],

  sourceLanguages: [
    { code: 'zh-CN', name: '中文（简体）' },
    { code: 'yue-CN', name: '粤语' },
    { code: 'en-US', name: '英语' },
    { code: 'ja-JP', name: '日语' },
    { code: 'ko-KR', name: '韩语' },
    { code: 'es-MX', name: '西班牙语' },
    { code: 'fr-FR', name: '法语' },
    { code: 'de-DE', name: '德语' },
    { code: 'id-ID', name: '印尼语' },
    { code: 'th-TH', name: '泰语' },
    { code: 'vi-VN', name: '越南语' },
    { code: 'pt-BR', name: '葡萄牙语' },
    { code: 'ru-RU', name: '俄语' },
    { code: 'ar-SA', name: '阿拉伯语' },
  ],

  /* 31 种完整输出语种 */
  outputLanguages: [
    { code: 'en-US', name: '英语', primary: true, font: 'NotoSans-Regular' },
    { code: 'ja-JP', name: '日语', primary: true, font: 'NotoSansJP-Regular' },
    { code: 'ko-KR', name: '韩语', primary: true, font: 'NotoSansKR-Regular' },
    { code: 'es-MX', name: '西班牙语', primary: true, font: 'NotoSans-Regular' },
    { code: 'id-ID', name: '印尼语', primary: true, font: 'NotoSans-Regular' },
    { code: 'pt-BR', name: '葡萄牙语', primary: false, font: 'NotoSans-Regular' },
    { code: 'fr-FR', name: '法语', primary: false, font: 'NotoSans-Regular' },
    { code: 'de-DE', name: '德语', primary: false, font: 'NotoSans-Regular' },
    { code: 'th-TH', name: '泰语', primary: false, font: 'NotoSansThai-Regular' },
    { code: 'vi-VN', name: '越南语', primary: false, font: 'NotoSans-Regular' },
    { code: 'ms-MY', name: '马来语', primary: false, font: 'NotoSans-Regular' },
    { code: 'fil-PH', name: '菲律宾语', primary: false, font: 'NotoSans-Regular' },
    { code: 'ar-SA', name: '阿拉伯语', primary: false, font: 'NotoSansArabic-Regular' },
    { code: 'ru-RU', name: '俄语', primary: false, font: 'NotoSans-Regular' },
    { code: 'it-IT', name: '意大利语', primary: false, font: 'NotoSans-Regular' },
    { code: 'tr-TR', name: '土耳其语', primary: false, font: 'NotoSans-Regular' },
    { code: 'hi-IN', name: '印地语', primary: false, font: 'NotoSansDevanagari-Regular' },
    { code: 'nl-NL', name: '荷兰语', primary: false, font: 'NotoSans-Regular' },
    { code: 'pl-PL', name: '波兰语', primary: false, font: 'NotoSans-Regular' },
    { code: 'el-GR', name: '希腊语', primary: false, font: 'NotoSans-Regular' },
    { code: 'sv-SE', name: '瑞典语', primary: false, font: 'NotoSans-Regular' },
    { code: 'no-NO', name: '挪威语', primary: false, font: 'NotoSans-Regular' },
    { code: 'da-DK', name: '丹麦语', primary: false, font: 'NotoSans-Regular' },
    { code: 'fi-FI', name: '芬兰语', primary: false, font: 'NotoSans-Regular' },
    { code: 'he-IL', name: '希伯来语', primary: false, font: 'NotoSansHebrew-Regular' },
    { code: 'km-KH', name: '高棉语', primary: false, font: 'NotoSansKhmer-Regular' },
    { code: 'lo-LA', name: '老挝语', primary: false, font: 'NotoSansLao-Regular' },
    { code: 'my-MM', name: '缅甸语', primary: false, font: 'NotoSansMyanmar-Regular' },
    { code: 'sw-KE', name: '斯瓦希里语', primary: false, font: 'NotoSans-Regular' },
    { code: 'yue-CN', name: '粤语', primary: false, font: 'NotoSansHK-Regular' },
    { code: 'zh-CN', name: '中文（简体）', primary: false, font: 'NotoSansSC-Regular' },
  ],

  /* 07 多语成片结果（已补齐 ko-KR 列 & 10 个文件口径） */
  translateResult: {
    file: 'S01E01_雨夜来客.mp4',
    cards: [
      {
        code: 'en-US',
        label: 'en-US · 英语',
        fontClass: 'lang-en',
        size: 'MP4 · 86.4 MB',
        captions: 'SRT + ASS',
        defaultLineIdx: 2,
      },
      {
        code: 'ja-JP',
        label: 'ja-JP · 日语',
        fontClass: 'lang-ja',
        size: 'MP4 · 84.1 MB',
        captions: 'SRT + ASS',
        defaultLineIdx: 2,
      },
      {
        code: 'ko-KR',
        label: 'ko-KR · 韩语',
        fontClass: 'lang-ko',
        size: 'MP4 · 88.9 MB',
        captions: 'SRT + ASS',
        defaultLineIdx: 2,
      },
    ],
    captionLines: [
      {
        time: '00:00:12',
        zh: '我已经等了三年。',
        en: "I've waited three years.",
        ja: 'もう三年も待ったのよ。',
        ko: '벌써 삼 년이나 기다렸어요.',
      },
      {
        time: '00:00:16',
        zh: '你还要我等到什么时候？',
        en: 'How much longer do you want me to wait?',
        ja: 'いつまで待てばいいの？',
        ko: '언제까지 기다리라는 거예요?',
      },
      {
        time: '00:01:02',
        zh: '我不会再等你了。',
        en: "I won't wait for you anymore.",
        ja: 'もう、あなたを待たない。',
        ko: '더는 당신을 기다리지 않을게요.',
      },
    ],
  },

  /* 字幕样式默认参数 */
  subtitleStyle: {
    font: 'NotoSans',
    fontSize: 60,
    fontColor: '#FFFFFF',
    bold: false,
    outlineColor: '#000000',
    outlineWidth: 2,
    bgColor: '#000000',
    bgOpacity: 0,
    topMarginRatio: 77,
    widthRatio: 88,
    lineSpacing: 0,
  },

  /* 用量账单明细（侧栏「用量账单」视图） */
  billingRecords: [
    { date: '2026-11-13 14:41', batch: 'B-0412 · S01E01_雨夜来客.mp4', op: '视频修复 · 专业版精准', unit: '¥3.00/分', usage: '8.40 分', cost: '¥25.20' },
    { date: '2026-11-13 14:38', batch: 'B-0412 · S01E02_灯下无声.mp4', op: '视频修复 · 专业版精准', unit: '¥3.00/分', usage: '8.20 分', cost: '¥24.60' },
    { date: '2026-11-13 13:20', batch: 'B-0411 · EP03_旧信.mp4 (4K ×2)', op: '视频修复 · 专业版精准', unit: '¥3.00/分', usage: '18.20 分', cost: '¥54.60' },
    { date: '2026-11-13 11:56', batch: 'B-0410 · 预告片_竖版_15s.mp4 (3语种)', op: '视频智能剪辑 · 高质量配音', unit: '¥4.00/分', usage: '0.75 分', cost: '¥3.00' },
    { date: '2026-11-12 20:14', batch: 'B-0408 · S01 全季翻译交付 (3语种)', op: '视频智能剪辑 · 高质量配音', unit: '¥4.00/分', usage: '25.20 分', cost: '¥100.80' },
    { date: '2026-11-12 18:05', batch: 'B-0407 · S01 字幕清洗批次 (6集)', op: '视频修复 · 极速版', unit: '¥0.50/分', usage: '48.40 分', cost: '¥24.20' },
  ],
};

/* 算子计费公式（严格对齐文档） */
window.CLEANFRAME_CALC = {
  /**
   * las_video_inpaint_pro 计费
   * 总费用 = 单价 * (视频时长(分) * 帧率系数 * 分辨率系数)
   */
  calcInpaintFile(file, cfg) {
    const durationMin = file.durationSec / 60;
    const outFps = Math.min(file.fps, Number(cfg.maxFps) || 30);
    let fpsCoeff = 1;
    if (outFps <= 24) fpsCoeff = 0.8;
    else if (outFps <= 30) fpsCoeff = 1;
    else fpsCoeff = Math.ceil(outFps / 30);

    // 根据输出分辨率上限缩放后的有效像素数
    const capMap = {
      '720p': 1280 * 720,
      '1080p': 1920 * 1080,
      '4k': 3840 * 2160,
    };
    const maxPixels = capMap[cfg.maxResolution] || capMap['1080p'];
    const effPixels = Math.min(file.width * file.height, maxPixels);

    let resCoeff = 1;
    if (cfg.modelLevel === 'lite') {
      resCoeff = effPixels <= 1920 * 1080 ? 1 : 2;
    } else {
      if (effPixels <= 1280 * 720) resCoeff = 0.6;
      else if (effPixels <= 1920 * 1080) resCoeff = 1;
      else resCoeff = 2;
    }

    let unitPrice = 0.5;
    if (cfg.modelLevel === 'pro') {
      unitPrice = cfg.locateMode === 'precise' ? 3.0 : 1.5;
    }

    const billMin = durationMin * fpsCoeff * resCoeff;
    const cost = billMin * unitPrice;
    return { billMin, cost, fpsCoeff, resCoeff, unitPrice, outFps };
  },

  /**
   * las_video_translate 计费
   * 总费用 = (视频翻译单价 * 输入时长 + 面容翻译单价 * 面容翻译时长) * 新语种数
   */
  calcTranslateBatch(files, cfg) {
    const totalSec = files.reduce((s, f) => s + f.durationSec, 0);
    const totalMin = totalSec / 60;
    const langCount = Math.max(0, cfg.targetLangs.length);
    const unitPrice = cfg.dubbingMode === 'high_quality' ? 4.0 : 1.5;
    const billMin = totalMin * langCount;
    const cost = billMin * unitPrice;
    const taskCount = files.length * langCount;
    const captionCount = taskCount * cfg.captionFormats.length;
    const audioCount = cfg.outputDubbingAudio ? taskCount : 0;
    const estMinutes = Math.max(
      1,
      Math.round(totalMin * (cfg.dubbingMode === 'high_quality' && cfg.fastMode ? 4 : 5) * Math.max(1, Math.ceil(taskCount / 10)))
    );
    return { totalSec, totalMin, langCount, unitPrice, billMin, cost, taskCount, captionCount, audioCount, estMinutes };
  },

  formatDuration(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${String(r).padStart(2, '0')}`;
  },

  formatDurationCN(sec) {
    const s = Math.max(0, Math.round(sec));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m} 分 ${String(r).padStart(2, '0')} 秒`;
  },
};
