export type WorkspaceViewId =
  | 'overview'
  | 'inpaint'
  | 'translate'
  | 'annotate'
  | 'monitor'
  | 'compare'
  | 'translate-result'
  | 'subtitle-style'
  | 'billing'
  | 'settings';

export interface SystemConfig {
  execution_mode: 'auto' | 'live' | 'mock';
  effective_mode: 'live' | 'mock';
  public_base_url: string;
  monthly_quota_minutes: number;
  has_las_api_key: boolean;
  las_api_key_masked: string;
  las_region: string;
  las_base_url: string;
  las_base_url_raw: string;
  las_callback_url: string;
  callback_url: string;
  tos_bucket: string;
  tos_endpoint: string;
  tos_region: string;
  tos_input_prefix: string;
  tos_output_prefix: string;
  has_volc_ak: boolean;
  volc_access_key_id_masked: string;
  has_volc_sk: boolean;
  volc_access_key_secret_masked: string;
  has_tos_credentials: boolean;
  scheduler_enabled: boolean;
  max_concurrency: number;
  poll_interval_seconds: number;
  database_url: string;
  storage_dir: string;
  active_database_url: string;
  active_storage_dir: string;
  restart_required: boolean;
  setup_completed: boolean;
  is_first_run: boolean;
  env_file_path: string;
  env_preview: string;
  supported_regions: string[];
}

export interface SystemConfigUpdatePayload {
  execution_mode?: 'auto' | 'live' | 'mock';
  public_base_url?: string;
  monthly_quota_minutes?: number;
  las_api_key?: string;
  las_region?: string;
  las_base_url?: string;
  las_callback_url?: string;
  tos_bucket?: string;
  tos_region?: string;
  tos_endpoint?: string;
  tos_input_prefix?: string;
  tos_output_prefix?: string;
  volc_access_key_id?: string;
  volc_access_key_secret?: string;
  scheduler_enabled?: boolean;
  max_concurrency?: number;
  poll_interval_seconds?: number;
  database_url?: string;
  storage_dir?: string;
  clear_keys?: Array<'las_api_key' | 'volc_access_key_id' | 'volc_access_key_secret'>;
}

export interface LanguageItem {
  code: string;
  name: string;
  primary?: boolean;
  font?: string;
}

export interface RegionItem {
  id: string;
  name: string;
  short_name: string;
  color: 'mint' | 'blue' | 'amber';
  bbox: [number, number, number, number];
  start_sec: number;
  end_sec: number;
  until_end: boolean;
}

export interface RegionTemplate {
  id: string;
  name: string;
  regions: RegionItem[];
  is_active: boolean;
}

export interface SubtitleStyleConfig {
  font: string;
  font_size: number;
  font_color: string;
  bold: boolean;
  outline_color: string;
  outline_width: number;
  bg_color: string;
  bg_opacity: number;
  top_margin_ratio: number;
  width_ratio: number;
  line_spacing: number;
}

export interface InpaintConfig {
  key?: string;
  name: string;
  model_level: 'lite' | 'pro';
  targets: Array<'watermark' | 'subtitle' | 'scrolling_subtitle' | 'drama_info'>;
  locate_mode: 'standard' | 'precise' | 'fixed';
  max_resolution: '720p' | '1080p' | '4k';
  max_fps: number;
  video_mode: 'economy' | 'balanced' | 'high' | 'source';
  codec: 'h264' | 'h265';
  subtitle_protect: boolean;
  subtitle_persistent: boolean;
  regions?: RegionItem[];
}

export interface TranslateConfig {
  source_lang: string;
  target_langs: string[];
  dubbing_mode: 'emotion' | 'timbre' | 'high_quality';
  fast_mode: boolean;
  dynamic_duration: boolean;
  burn_subtitles: boolean;
  caption_formats: Array<'.srt' | '.ass' | '.vtt' | '.txt' | '.xml'>;
  enable_inpaint: boolean;
  output_dubbing_audio: boolean;
  subtitle_style?: SubtitleStyleConfig;
}

export interface MediaAsset {
  id: string;
  name: string;
  purpose: 'inpaint' | 'translate';
  thumbnail_url: string;
  video_url?: string | null;
  tos_uri?: string | null;
  width: number;
  height: number;
  resolution: string;
  fps: number;
  duration_sec: number;
  frames: number;
  size_bytes: number;
  size_gb: number;
  detected_lang: string;
  detected_lang_code: string;
  is_sample: boolean;
}

export interface TaskRow {
  id: string;
  batch_id: string;
  file: string;
  meta: string;
  thumbnail_url: string;
  type: 'inpaint' | 'translate';
  operator_id: string;
  scheme: string;
  sub_scheme: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'timeout';
  raw_status: string;
  status_label: string;
  progress: number;
  usage: string;
  bill_minutes: number;
  estimated_bill_min: number;
  cost_cny: number;
  eta: string;
  time: string;
  elapsed_seconds?: number | null;
  processing_duration?: string;
  started_at?: string | null;
  finished_at?: string | null;
  error_msg: string;
  remote_task_id?: string | null;
  execution_mode: string;
  target_view: 'monitor' | 'compare' | 'translate-result';
}

export interface DashboardOverview {
  subtitle: string;
  kpis: {
    processed_today: string;
    processed_delta: string;
    success_rate: string;
    recent_count: string;
    queued_count: number;
    queue_eta: string;
    monthly_cost: string;
    monthly_usage: string;
  };
  total_count: number;
  active_batch_id: string | null;
  tasks: TaskRow[];
}

export interface BatchDetail {
  id: string;
  code: string;
  name: string;
  job_type: 'inpaint' | 'translate';
  operator_id: string;
  operator_version: string;
  region: string;
  status: string;
  paused: boolean;
  execution_mode: string;
  submitted_at: string;
  counts: {
    total: number;
    completed: number;
    running: number;
    queued: number;
    failed: number;
  };
  progress_bars: {
    done_pct: number;
    running_pct: number;
  };
  billing: {
    accrued_bill_min: number;
    accrued_cost: number;
    estimated_bill_min: number;
    estimated_cost: number;
    unit_price: number;
  };
  queue: TaskRow[];
  logs: Array<{
    id: number;
    time: string;
    tag: string;
    msg: string;
    tone: string;
  }>;
}

export interface TaskDetail extends TaskRow {
  input_video_url?: string | null;
  output_video_url?: string | null;
  inpainted_video_path?: string | null;
  repaired_video_url?: string | null;
  subtitle_bbox?: string | null;
  output_resolution: string;
  output_fps: number;
  unit_price: number;
  expires_label: string;
  request_payload: Record<string, unknown>;
  result: Record<string, any>;
}

export interface BillingSummary {
  month: string;
  total_cost: number;
  total_minutes: number;
  monthly_quota_minutes: number;
  quota_percent: number;
  inpaint_minutes: number;
  inpaint_cost: number;
  translate_minutes: number;
  translate_cost: number;
  max_concurrency: number;
  rpm_limit: number;
  records: Array<{
    id: string;
    date: string;
    batch: string;
    op: string;
    job_type: string;
    unit: string;
    usage: string;
    cost: string;
    cost_num: number;
  }>;
}

export interface BootstrapData {
  system: SystemConfig;
  source_languages: LanguageItem[];
  output_languages: LanguageItem[];
  inpaint_presets: InpaintConfig[];
  subtitle_style: SubtitleStyleConfig;
  region_templates: RegionTemplate[];
  default_regions: RegionItem[];
  monthly_quota_minutes: number;
}
