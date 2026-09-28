/**
 * ATS resume client — the ONLY file that talks to the ATS engine.
 *
 * TEMPORARY SET-UP (works today, replace after deployment):
 * the browser calls the service directly. The URL and the key both come from
 * `apps/frontend/.env.local`:
 *
 *     NEXT_PUBLIC_ATS_ENDPOINT=https://abc.com/v1/format
 *     NEXT_PUBLIC_ATS_API_KEY=dev-key-change-me
 *
 * Both are `NEXT_PUBLIC_*`, which means they are readable in the browser — fine
 * for a throwaway random key during development, NOT for a real one. When the
 * service is deployed, move the key to a server proxy: `ATS_ENDPOINT` below
 * then points at that route and the key stops being public. Nothing else in the
 * feature changes.
 *
 * Request (multipart/form-data):
 *   file       the uploaded .pdf / .docx
 *   max_pages  2
 * Header: X-API-Key
 *
 * Response: 200 application/pdf → downloaded as-is. The filename is read from
 * `content-disposition` when the browser lets us see it.
 * Errors come back as { "detail": "..." } and are shown as-is.
 *
 * If the call fails, the demo generator produces a file instead so the flow
 * still completes, and the result says so.
 *
 *   TODO(ats-python): once the service is live, `demo-resume-pdf.ts` and
 *   `buildDemoResumeDocument()` can be deleted; nothing else imports them.
 */

import {
  resumePdf,
  type ResumeAlign,
  type ResumeBlock,
  type ResumeBlockKind,
  type ResumeBlockStyle,
  type ResumeDocument,
  type ResumeSection,
} from './demo-resume-pdf';
import type { CandidateProfile } from './mock-data';

/* -------------------------------------------------------------------------- */
/*                              Endpoint and key                              */
/* -------------------------------------------------------------------------- */

/* ═══════════════════════════════════════════════════════════════════════════
 *   Set both values in  apps/frontend/.env.local
 *   (copy apps/frontend/.env.example, then restart `pnpm dev`):
 *
 *       NEXT_PUBLIC_ATS_ENDPOINT=https://abc.com/v1/format
 *       NEXT_PUBLIC_ATS_API_KEY=dev-key-change-me
 *
 *   Then the browser POSTs the file there and downloads what comes back.
 *   Replace the URL after you deploy, and the key with a real one —
 *   `openssl rand -hex 32`.
 *
 *   `'demo'` as the URL skips the call and always builds the file in-browser.
 * ═══════════════════════════════════════════════════════════════════════════ */

/** Temporary until the service is deployed. */
export const ATS_FALLBACK_ENDPOINT: string = 'demo';

/** The URL the generate button posts to. */
export const ATS_ENDPOINT: string =
  (process.env.NEXT_PUBLIC_ATS_ENDPOINT ?? '').trim() || ATS_FALLBACK_ENDPOINT;

/** Sent as the X-API-Key header. Public while it is a throwaway key. */
export const ATS_API_KEY: string = (process.env.NEXT_PUBLIC_ATS_API_KEY ?? '').trim();

/**
 * Page budget sent with every upload: `max_pages` in the multipart body.
 * The service accepts 1–5 and prunes longer resumes to fit.
 *
 *       NEXT_PUBLIC_ATS_MAX_PAGES=1        # one page
 *
 * Default is 1. (The service's own default is 2, so the value must be sent
 * explicitly to ask for a single page.)
 */
export const ATS_MAX_PAGES: string = (() => {
  const raw = (process.env.NEXT_PUBLIC_ATS_MAX_PAGES ?? '').trim();
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) return '1';
  return String(Math.min(5, Math.max(1, value)));
})();

/**
 * Where the editor asks for the resume as JSON  (POST /v1/parse).
 *
 * Separate from the format endpoint because one HTTP response is either a PDF
 * or JSON, never both. Empty → the editor can only be opened for files that
 * were generated in the browser (the demo engine), which is the current
 * behaviour until the parser is deployed.
 *
 *       NEXT_PUBLIC_ATS_PARSE_ENDPOINT=https://abc.com/v1/parse
 */
export const ATS_PARSE_ENDPOINT: string = (
  process.env.NEXT_PUBLIC_ATS_PARSE_ENDPOINT ?? ''
).trim();

/** Trailing slashes off, so `{jobId}` or `/{jobId}` can simply be appended. */
function parseBase(endpoint: string): string {
  return endpoint.replace(/\/+$/, '');
}

/** Headers a service may use to name the JSON endpoint. */
const PARSE_URL_HEADERS = [
  'x-resume-json-url',
  'x-resume-json',
  'x-json-url',
  'x-parse-url',
  'x-resume-parse-url',
];

/**
 * Header values may be relative (`/v1/parse/<job-id>`), which is what the
 * service sends — resolve them against the service's own origin. Absolute URLs
 * (Render, ngrok, …) are taken as they are.
 */
export function resolveServiceUrl(value: string | null | undefined, endpoint: string): string | null {
  const raw = (value ?? '').trim();
  if (!raw) return null;
  try {
    return new URL(raw, endpoint).toString();
  } catch {
    return null;
  }
}

/** `…/v1/parse` + job id → `…/v1/parse/<id>`; `…/v1/parse/{jobId}` also works. */
export function parseUrlFor(endpoint: string, jobId: string): string {
  const base = parseBase(endpoint);
  const id = encodeURIComponent(jobId);
  return base.includes('{jobId}') ? base.replace('{jobId}', id) : `${base}/${id}`;
}

/** True when a real parse endpoint is configured. */
export function canParseResume(): boolean {
  return ATS_PARSE_ENDPOINT.length > 0;
}

/**
 * Give up after this long and fall back, so the UI never hangs. Matches the
 * API's recommended 120 s timeout — Render free instances sleep after ~15 min
 * idle and can take 10–30 s to wake up.
 */
export const ATS_REQUEST_TIMEOUT_MS = 120_000;

/** False when the demo engine should be used instead of a network call. */
export function usesAtsApi(): boolean {
  return Boolean(ATS_ENDPOINT) && ATS_ENDPOINT !== 'demo' && ATS_ENDPOINT !== 'off';
}

export function endpointHost(endpoint: string | null): string {
  if (!endpoint) return 'demo engine';
  if (endpoint.startsWith('/')) return `${endpoint} (proxied)`;
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

/* -------------------------------------------------------------------------- */
/*                            Uploads and validation                          */
/* -------------------------------------------------------------------------- */

export type ResumeKind = 'pdf' | 'docx';

export interface AtsUploadedFile {
  name: string;
  size: number;
  kind: ResumeKind;
  /** ISO timestamp of when it was selected/replaced. */
  uploadedAt: string;
}

/** The service caps uploads at 20 MB (its MAX_UPLOAD_MB default). */
export const ATS_MAX_BYTES = 20 * 1024 * 1024;
export const ATS_ACCEPTED_LABEL = 'PDF or DOCX · up to 20 MB';
export const ATS_ACCEPT_ATTR =
  '.pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** The service accepts .pdf and .docx only — legacy .doc gets a 415. */
export function resumeKindOf(fileName: string): ResumeKind | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'pdf';
  if (lower.endsWith('.docx')) return 'docx';
  return null;
}

export function toUploadedFile(file: File): AtsUploadedFile | null {
  const kind = resumeKindOf(file.name);
  if (!kind) return null;
  return { name: file.name, size: file.size, kind, uploadedAt: new Date().toISOString() };
}

/** Returns a message to show the candidate, or `null` when the file is fine. */
export function validateAtsUpload(file: File): string | null {
  if (!resumeKindOf(file.name)) {
    return 'Only PDF and DOCX are supported. Export your resume to one of those and try again.';
  }
  if (file.size === 0) {
    return 'That file looks empty — download it again and re-upload.';
  }
  if (file.size > ATS_MAX_BYTES) {
    return `That file is ${formatBytes(file.size)}. The service accepts up to 20 MB.`;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** `bibek-thapa-ats-resume.pdf` — the name the candidate downloads. */
export function resumeFileName(profile: CandidateProfile): string {
  const person = profile.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${person || 'candidate'}-ats-resume.pdf`;
}

/* -------------------------------------------------------------------------- */
/*                                  Pipeline                                  */
/* -------------------------------------------------------------------------- */

export const ATS_PIPELINE_STEPS = [
  'Uploading your file',
  'Generating the ATS version',
  'Preparing your download',
] as const;

export interface AtsProgress {
  step: string;
  /** 0-100. */
  percent: number;
}

export type AtsEngine = 'demo' | 'service' | 'service-fallback';

export interface AtsGenerationResult {
  fileName: string;
  blob: Blob;
  pages: number;
  generatedAt: string;
  engine: AtsEngine;
  /** One line the UI shows under the result. */
  note: string;
  /** The endpoint that produced this file (absent for the demo engine). */
  endpoint?: string;
  /** `x-job-id` from the format response — the handle used to fetch the JSON. */
  jobId?: string;
  /**
   * `x-resume-json-url` from the format response, resolved to an absolute URL.
   * When the service sends it, Edit needs no configuration at all — it simply
   * GETs this address.
   */
  parseUrl?: string;
  /** Present for demo results only — drives the in-page preview. */
  document?: ResumeDocument;
}

export interface GenerateAtsResumeInput {
  file: AtsUploadedFile;
  profile: CandidateProfile;
  /** The real File, when the candidate uploaded one. */
  rawFile?: File | null;
  onProgress?: (progress: AtsProgress) => void;
}

/** Copy shown while the engine is the local one. */
export const DEMO_ENGINE_NOTE =
  'Demo engine: this file was generated in the browser from your JobDev profile. The ATS API can be switched on later in candidate/ats-service.ts (one constant).';

/* -------------------------------------------------------------------------- */
/*                            Demo document builder                           */
/* -------------------------------------------------------------------------- */

/**
 * Builds the ATS-friendly structure: one column, standard headings, no tables,
 * no images, no page headers — everything a parser can read.
 * Delete this with the rest of the demo scaffolding once the service is live.
 */
export function buildDemoResumeDocument(profile: CandidateProfile): ResumeDocument {
  const sections: ResumeDocument['sections'] = [
    {
      title: 'Summary',
      blocks: [
        {
          kind: 'text',
          text: `${profile.seniority} ${profile.headline.split('·')[0].trim()} with ${
            profile.experienceYears
          } years shipping production software. ${profile.about}`,
        },
      ],
    },
    { title: 'Skills', blocks: [{ kind: 'text', text: profile.skills.join(', ') }] },
    {
      title: 'Experience',
      blocks: profile.experience.flatMap((role) => [
        { kind: 'entry' as const, text: `${role.role} - ${role.company} - ${role.period}` },
        ...role.highlights.map((highlight) => ({ kind: 'bullet' as const, text: highlight })),
      ]),
    },
    {
      title: 'Education',
      blocks: profile.education.map((entry) => ({
        kind: 'entry' as const,
        text: `${entry.degree} - ${entry.school} - ${entry.period}`,
      })),
    },
    {
      title: 'Links',
      blocks: profile.links.map((link) => ({
        kind: 'text' as const,
        text: `${link.label}: ${link.url}`,
      })),
    },
    {
      title: 'Additional',
      blocks: [
        {
          kind: 'text',
          text: [
            profile.openToWork ? 'Open to work' : 'Not currently looking',
            `Preferred setup: ${profile.workModes.join(', ')}`,
            `Notice period: ${profile.noticePeriod}`,
            `Expected salary: ${profile.expectedSalary}`,
          ].join(' | '),
        },
      ],
    },
  ];

  return {
    name: profile.name,
    headline: profile.headline,
    contacts: [profile.location, profile.phone, profile.email, ...profile.links.map((l) => l.url)],
    sections,
  };
}

/* -------------------------------------------------------------------------- */
/*                          Reading the API response                          */
/* -------------------------------------------------------------------------- */

interface ServiceFile {
  blob: Blob;
  fileName: string;
  pages?: number;
}

const PDF_MIME = 'application/pdf';

function base64ToBlob(base64: string, mime = PDF_MIME): Blob {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').replace(/\s+/g, '');
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mime });
}

function pickString(payload: unknown, keys: string[]): string | null {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  /* One level of nesting: { data: { url } }, { result: { base64 } }, … */
  for (const nestedKey of ['data', 'result', 'output', 'file']) {
    const nested = record[nestedKey];
    if (nested && typeof nested === 'object') {
      const found = pickString(nested, keys);
      if (found) return found;
    }
  }
  return null;
}

/** Reads `attachment; filename="X.pdf"` (and the RFC 5987 form) from the header. */
function fileNameFromDisposition(value: string | null, fallback: string): string {
  if (!value) return fallback;
  const utf8 = /filename\*=UTF-8''([^;]+)/i.exec(value);
  if (utf8) {
    try {
      return decodeURIComponent(utf8[1].trim().replace(/^"|"$/g, ''));
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(value);
  return plain ? plain[1].trim() : fallback;
}

/** The service answers errors as `{"detail": "human-readable reason"}`. */
async function readDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body?.detail === 'string' && body.detail.trim()) return body.detail.trim();
  } catch {
    /* not JSON */
  }
  return null;
}

/** Turns the API's status codes into something a candidate can act on. */
function friendlyStatus(status: number, detail: string | null): string {
  if (detail) return detail;
  switch (status) {
    case 400:
      return 'No file was received by the service.';
    case 401:
      return 'The service rejected our API key (401).';
    case 413:
      return 'The upload is larger than the service allows (413).';
    case 415:
      return 'The service accepts PDF and DOCX only (415).';
    case 422:
      return 'No text could be read — a scanned image PDF cannot be parsed (422).';
    case 429:
      return 'Rate limit reached on the ATS service (429). Try again in a minute.';
    case 503:
      return 'The ATS service has no API keys configured (503).';
    default:
      return `The ATS service answered ${status}.`;
  }
}

async function fetchAsBlob(url: string, fallbackName: string): Promise<ServiceFile> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`the file URL answered ${response.status}`);
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('the file URL returned an empty body');
  return {
    blob: new Blob([bytes], { type: response.headers.get('content-type') ?? PDF_MIME }),
    fileName: response.headers.get('x-file-name') ?? fallbackName,
  };
}

/**
 * Turns whatever the API answered into a downloadable file, covering the three
 * response styles a format/convert service normally uses.
 */
async function readServiceResponse(
  response: Response,
  fallbackName: string,
): Promise<ServiceFile> {
  const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
  /* The service names the file in content-disposition; x-file-name is our
     proxy's fallback, then the locally generated name. */
  const headerName = fileNameFromDisposition(
    response.headers.get('content-disposition'),
    response.headers.get('x-file-name') ?? fallbackName,
  );
  const headerPages = Number(response.headers.get('x-pages') ?? '');
  const pages = Number.isFinite(headerPages) && headerPages > 0 ? headerPages : undefined;

  /* 1 — JSON: either a link to the file, or the file itself as base64. */
  if (contentType.includes('json') || contentType.includes('text/plain')) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error('the API answered with text instead of a file');
    }

    const url = pickString(payload, ['url', 'pdfUrl', 'fileUrl', 'downloadUrl', 'link']);
    if (url) {
      const file = await fetchAsBlob(url, headerName ?? fallbackName);
      return { ...file, pages };
    }

    const base64 = pickString(payload, ['base64', 'pdf', 'file', 'content']);
    if (base64) {
      if (/^https?:\/\//i.test(base64)) {
        const file = await fetchAsBlob(base64, headerName ?? fallbackName);
        return { ...file, pages };
      }
      return {
        blob: base64ToBlob(base64, PDF_MIME),
        fileName: headerName ?? fallbackName,
        pages,
      };
    }

    throw new Error('the API returned JSON without `url` or `base64`');
  }

  /* 2 — Anything else is treated as the file bytes. */
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) throw new Error('the API returned an empty body');
  return {
    blob: new Blob([bytes], { type: contentType || PDF_MIME }),
    fileName: headerName ?? fallbackName,
    pages,
  };
}

/* -------------------------------------------------------------------------- */
/*                              Generator entry point                         */
/* -------------------------------------------------------------------------- */

async function runDemoPipeline(input: GenerateAtsResumeInput): Promise<AtsGenerationResult> {
  const perStep = 100 / ATS_PIPELINE_STEPS.length;
  for (let index = 0; index < ATS_PIPELINE_STEPS.length; index += 1) {
    input.onProgress?.({
      step: ATS_PIPELINE_STEPS[index],
      percent: Math.round(index * perStep),
    });
    // Stands in for the round trip to the API.
    await new Promise((resolve) => window.setTimeout(resolve, 340));
  }

  const document = buildDemoResumeDocument(input.profile);
  const { blob, pages } = resumePdf(document);
  input.onProgress?.({ step: 'Ready to download', percent: 100 });

  return {
    fileName: resumeFileName(input.profile),
    blob,
    pages,
    generatedAt: new Date().toISOString(),
    engine: 'demo',
    note: DEMO_ENGINE_NOTE,
    document,
  };
}

/** POSTs the resume to the API and turns its response into the download. */
async function runServicePipeline(
  endpoint: string,
  input: GenerateAtsResumeInput,
): Promise<AtsGenerationResult> {
  /* Exactly the fields the service documents: the file and the page budget. */
  const form = new FormData();
  if (input.rawFile) form.append('file', input.rawFile, input.rawFile.name);
  form.append('max_pages', ATS_MAX_PAGES);

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), ATS_REQUEST_TIMEOUT_MS);

  input.onProgress?.({ step: `Uploading to ${endpointHost(endpoint)}`, percent: 25 });

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      /* The key goes in the header; omitted entirely when none is configured. */
      headers: ATS_API_KEY ? { 'X-API-Key': ATS_API_KEY } : undefined,
      body: form,
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await readDetail(response);
      throw new Error(friendlyStatus(response.status, detail));
    }

    input.onProgress?.({ step: 'Reading the response', percent: 65 });
    const jobId = response.headers.get('x-job-id');
    /* The service often names the JSON URL outright: X-Resume-Json-Url. */
    const parseUrl =
      PARSE_URL_HEADERS.map((header) =>
        resolveServiceUrl(response.headers.get(header), response.url || endpoint),
      ).find((candidate): candidate is string => Boolean(candidate)) ?? null;
    const file = await readServiceResponse(response, resumeFileName(input.profile));
    input.onProgress?.({ step: 'Preparing your download', percent: 90 });

    return {
      fileName: file.fileName,
      blob: file.blob,
      pages: file.pages ?? 1,
      generatedAt: new Date().toISOString(),
      engine: 'service',
      /* kept so Edit can fetch the parsed JSON without re-uploading the file */
      ...(jobId ? { jobId } : {}),
      ...(parseUrl ? { parseUrl } : {}),
      endpoint,
      note: `Generated by the ATS service${jobId ? ` · job ${jobId}` : ''}.`,
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new Error(`the API did not answer within ${ATS_REQUEST_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

/**
 * Upload → generate. Calls the API and uses its response; if that fails the
 * demo file is produced instead so the flow still completes, flagged in the UI.
 */
export async function generateAtsResume(
  input: GenerateAtsResumeInput,
): Promise<AtsGenerationResult> {
  if (!usesAtsApi()) return runDemoPipeline(input);

  try {
    return await runServicePipeline(ATS_ENDPOINT, input);
  } catch (error) {
    const fallback = await runDemoPipeline(input);
    return {
      ...fallback,
      engine: 'service-fallback',
      endpoint: ATS_ENDPOINT,
      note: `Could not reach ${ATS_ENDPOINT} (${
        error instanceof Error ? error.message : 'unknown error'
      }) — this file came from the demo engine instead.`,
    };
  }
}

/* -------------------------------------------------------------------------- */
/*                                  Download                                  */
/* -------------------------------------------------------------------------- */

export function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* -------------------------------------------------------------------------- */
/*                     Parse → JSON (what the editor edits)                   */
/* -------------------------------------------------------------------------- */

const BLOCK_KINDS: readonly ResumeBlockKind[] = ['entry', 'bullet', 'text'];
const ALIGNMENTS: readonly ResumeAlign[] = ['left', 'center', 'right'];

/* Key aliases, so a parser that names things differently still opens. */
const SECTION_KEY_ALIASES = ['sections', 'resume_sections', 'blocks'];
const SECTION_TITLE_ALIASES = ['title', 'heading', 'section', 'name', 'label'];
const SECTION_ITEMS_ALIASES = ['blocks', 'items', 'lines', 'bullets', 'entries', 'content', 'children'];
const BLOCK_TEXT_ALIASES = ['text', 'content', 'value', 'line', 'description', 'bullet', 'title'];
const NAME_ALIASES = [
  'name',
  'full_name',
  'fullName',
  'fullname',
  'candidate',
  'candidate_name',
  'candidateName',
];
const HEADLINE_ALIASES = [
  'headline',
  'title',
  'role',
  'position',
  'designation',
  'summary_title',
  'current_title',
  'current_role',
  'professional_title',
];
const CONTACT_ALIASES = [
  'contacts',
  'contact',
  'contact_info',
  'contact_information',
  'contact_details',
  'personal_details',
  'links',
  'details',
];
const PLAIN_TEXT_ALIASES = [
  'text',
  'raw_text',
  'plain_text',
  'rawText',
  'plainText',
  'content',
  'extracted_text',
  'raw_resume_data',
  'resume_text',
  'resumeText',
  'extracted_resume',
];
/** Containers a service may wrap the resume in. */
const ENVELOPE_ALIASES = [
  'resume',
  'parsed',
  'data',
  'result',
  'document',
  'profile',
  'output',
  'payload',
  'raw_resume_data',
  'resume_data',
  'raw_data',
  'parsed_resume',
  'parsed_data',
  'resume_json',
  'json',
  /* The service wraps the whole answer: { success, candidate_name, raw_resume_data } */
  'response',
  'content',
];
/** Single-value contact fields a parser may keep beside the name. */
const CONTACT_FIELD_KEYS = [
  'email',
  'email_address',
  'phone',
  'phone_number',
  'mobile',
  'linkedin',
  'github',
  'website',
  'portfolio',
  'address',
  'location',
  'city',
];

/** Top-level arrays that clearly are resume sections when `sections` is absent. */
const SECTION_ARRAY_ALIASES: Array<[string, string]> = [
  ['summary', 'Summary'],
  ['objective', 'Objective'],
  ['experience', 'Experience'],
  ['work_experience', 'Experience'],
  ['workExperience', 'Experience'],
  ['employment', 'Experience'],
  ['education', 'Education'],
  ['skills', 'Skills'],
  ['projects', 'Projects'],
  ['certifications', 'Certifications'],
  ['awards', 'Awards'],
  ['publications', 'Publications'],
  ['languages', 'Languages'],
  ['interests', 'Interests'],
  ['volunteer', 'Volunteer'],
  ['achievements', 'Achievements'],
];

const KNOWN_HEADINGS =
  /^(summary|profile|objective|about|experience|work experience|employment|education|skills|technical skills|projects|certifications?|licenses?|awards?|honors?|publications?|languages?|interests?|volunteer|achievements?|references?|activities|training|courses?)\b/i;

function asText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function asAlign(value: unknown): ResumeAlign | undefined {
  return typeof value === 'string' && (ALIGNMENTS as readonly string[]).includes(value)
    ? (value as ResumeAlign)
    : undefined;
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = asText(source[key]);
    if (value) return value;
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'object' && item !== null) {
        const text = firstString(item as Record<string, unknown>, BLOCK_TEXT_ALIASES);
        return text ? [text] : [];
      }
      const text = asText(item);
      return text ? [text] : [];
    });
  }
  /* { email, phone, linkedin } → three entries. */
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap((item) => stringList(item));
  }
  const text = asText(value);
  return text ? text.split(/\s*[|•·]\s*/).filter(Boolean) : [];
}

/** Steps into whatever wrapper the service used: { resume: { … } }, { data: { … } }, … */
/** A string that is really serialised JSON (`raw_resume_data` often is). */
function parseJsonString(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const text = value.trim();
  if (!/^[[{]/.test(text)) return value;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return value;
  }
}

/**
 * Every level of the payload, outermost first. A service that answers
 * `{ success, candidate_name, raw_resume_data: { … } }` keeps the name on the
 * wrapper, so the mapping needs both levels — the resume itself and the
 * envelope around it.
 */
export function unwrapLevels(payload: unknown): Array<Record<string, unknown>> {
  const levels: Array<Record<string, unknown>> = [];
  let current = parseJsonString(payload);
  for (let depth = 0; depth < 5; depth += 1) {
    if (Array.isArray(current)) {
      /* A bare array of sections/entries. */
      const level = { sections: current } as Record<string, unknown>;
      levels.push(level);
      return levels;
    }
    if (current === null || typeof current !== 'object') return levels;

    const source = current as Record<string, unknown>;
    levels.push(source);

    /* 1. The resume is here: a `sections` array, or the usual section arrays. */
    if (Array.isArray(source.sections) && source.sections.length > 0) return levels;
    if (
      SECTION_ARRAY_ALIASES.some(([key]) => {
        const value = source[key];
        return Array.isArray(value) && value.length > 0;
      })
    ) {
      return levels;
    }

    /* 2. It is wrapped — { success, candidate_name, raw_resume_data: { … } } —
          including the case where the wrapper is a JSON string. */
    const next = ENVELOPE_ALIASES.map((key) => parseJsonString(source[key])).find(
      (value) => value !== null && typeof value === 'object',
    );
    if (next === undefined) return levels;   /* nothing nested left */
    current = next;
  }
  return levels;
}

/** An object entry like { company, title, dates } → one entry line plus bullets. */
function blocksFromEntry(item: unknown): ResumeBlock[] {
  if (typeof item === 'string') {
    const text = item.trim();
    return text ? [{ kind: 'text' as const, text }] : [];
  }
  if (item === null || typeof item !== 'object') return [];
  const entry = item as Record<string, unknown>;
  const blocks: ResumeBlock[] = [];

  const head = [firstString(entry, ['company', 'organization', 'employer', 'institution', 'school']),
                firstString(entry, ['title', 'position', 'role', 'degree', 'name', 'field'])];
  const dates = [firstString(entry, ['dates', 'date', 'period', 'duration']),
                 firstString(entry, ['start', 'start_date'])]
    .filter(Boolean)
    .join(' – ');
  const headline = [head.filter(Boolean).join(' — '), dates && `· ${dates}`].filter(Boolean).join(' ');
  if (headline) blocks.push({ kind: 'entry', text: headline });

  for (const key of ['highlights', 'bullets', 'responsibilities', 'achievements', 'details', 'description', 'summary']) {
    for (const line of stringList(entry[key])) blocks.push({ kind: 'bullet', text: line });
  }
  if (!blocks.length) {
    const fallback = firstString(entry, BLOCK_TEXT_ALIASES);
    if (fallback) blocks.push({ kind: 'text', text: fallback });
  }
  return blocks;
}

/** Sections straight from the parser's own shape. */
function sectionsFromSections(source: Record<string, unknown>): ResumeSection[] {
  const raw = SECTION_KEY_ALIASES.map((key) => source[key]).find((value) => Array.isArray(value));
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .map((rawSection) => {
      const section = (rawSection ?? {}) as Record<string, unknown>;
      const items = SECTION_ITEMS_ALIASES.map((key) => section[key]).find((value) => Array.isArray(value));
      const rawBlocks: unknown[] = Array.isArray(items) ? (items as unknown[]) : [];
      const blocks: ResumeBlock[] = [];
      for (const rawBlock of rawBlocks) {
        if (typeof rawBlock === 'object' && rawBlock !== null && !BLOCK_TEXT_ALIASES.some((k) => asText((rawBlock as Record<string, unknown>)[k]))) {
          blocks.push(...blocksFromEntry(rawBlock));
          continue;
        }
        const block = (rawBlock ?? {}) as Record<string, unknown>;
        const text = typeof rawBlock === 'string' ? rawBlock.trim() : firstString(block, BLOCK_TEXT_ALIASES);
        if (!text) continue;
        const kind = BLOCK_KINDS.includes(block.kind as ResumeBlockKind) ? (block.kind as ResumeBlockKind) : 'text';
        const rawStyle = (block.style ?? {}) as Record<string, unknown>;
        const style: ResumeBlockStyle = {};
        if (typeof rawStyle.bold === 'boolean') style.bold = rawStyle.bold;
        if (typeof rawStyle.italic === 'boolean') style.italic = rawStyle.italic;
        if (typeof rawStyle.size === 'number') style.size = rawStyle.size;
        const align = asAlign(rawStyle.align);
        if (align) style.align = align;
        blocks.push(Object.keys(style).length ? { kind, text, style } : { kind, text });
      }
      return { title: firstString(section, SECTION_TITLE_ALIASES) || 'Section', blocks };
    })
    .filter((section) => section.blocks.length > 0);
}

/* -------------------------------------------------------------------------- */
/*                     JSON Resume (jsonresume.org) mapping                   */
/* -------------------------------------------------------------------------- */

/**
 * The parser wraps the standard JSON Resume schema:
 *
 *   { success, candidate_name, total_years_experience,
 *     raw_resume_data: { basics, work[], education[], skills[], projects[], … } }
 *
 * Everything below maps that schema onto the studio's document.
 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function looksLikeJsonResume(source: Record<string, unknown>): boolean {
  const basics = source.basics;
  if (basics !== null && typeof basics === 'object') return true;
  const skillGroups = asArray(source.skills).some(
    (item) => item !== null && typeof item === 'object' && Array.isArray((item as Record<string, unknown>).keywords),
  );
  return asArray(source.work).length > 0 || skillGroups;
}

/** JSON Resume keeps dates in several shapes; show the human string when given. */
function jsonResumeDates(entry: Record<string, unknown>): string {
  const raw = asText(entry.datesRaw);
  if (raw) return raw;
  const start = asText(entry.startDate);
  const end = asText(entry.endDate);
  if (start && end) return `${start} – ${end}`;
  return start || end || '';
}

/** `Primary — Secondary · Dates`, skipping whatever is missing. */
function entryLine(primary: string, secondary: string, dates: string): string {
  const head = [primary, secondary].filter(Boolean).join(' — ');
  return [head, dates].filter(Boolean).join(' · ');
}

function jsonResumeSections(source: Record<string, unknown>): ResumeSection[] {
  const sections: ResumeSection[] = [];
  const basics = (source.basics ?? {}) as Record<string, unknown>;

  const summary = asText(basics.summary);
  if (summary) sections.push({ title: 'Summary', blocks: [{ kind: 'text', text: summary }] });

  const work = asArray(source.work);
  if (work.length) {
    const blocks: ResumeBlock[] = [];
    for (const item of work) {
      const entry = (item ?? {}) as Record<string, unknown>;
      const line = entryLine(asText(entry.name), asText(entry.position), jsonResumeDates(entry));
      if (line) blocks.push({ kind: 'entry', text: line });
      for (const highlight of stringList(entry.highlights)) blocks.push({ kind: 'bullet', text: highlight });
      const description = asText(entry.summary);
      if (description) blocks.push({ kind: 'text', text: description });
    }
    if (blocks.length) sections.push({ title: 'Experience', blocks });
  }

  const education = asArray(source.education);
  if (education.length) {
    const blocks: ResumeBlock[] = [];
    for (const item of education) {
      const entry = (item ?? {}) as Record<string, unknown>;
      const line = entryLine(asText(entry.institution), asText(entry.area), jsonResumeDates(entry));
      if (line) blocks.push({ kind: 'entry', text: line });
      const score = asText(entry.score);
      if (score) blocks.push({ kind: 'text', text: `Score: ${score}` });
      const detail = asText(entry.location);
      if (detail) blocks.push({ kind: 'text', text: detail });
    }
    if (blocks.length) sections.push({ title: 'Education', blocks });
  }

  const skills = asArray(source.skills);
  if (skills.length) {
    const blocks: ResumeBlock[] = [];
    for (const item of skills) {
      const entry = (item ?? {}) as Record<string, unknown>;
      const group = asText(entry.name);
      const keywords = stringList(entry.keywords ?? entry.keywords_);
      if (group && keywords.length) blocks.push({ kind: 'text', text: `${group}: ${keywords.join(', ')}` });
      else if (group) blocks.push({ kind: 'text', text: group });
      else if (keywords.length) blocks.push({ kind: 'text', text: keywords.join(', ') });
    }
    if (blocks.length) sections.push({ title: 'Skills', blocks });
  }

  const projects = asArray(source.projects);
  if (projects.length) {
    const blocks: ResumeBlock[] = [];
    for (const item of projects) {
      const entry = (item ?? {}) as Record<string, unknown>;
      const line = entryLine(asText(entry.name), asText(entry.description), jsonResumeDates(entry));
      if (line) blocks.push({ kind: 'entry', text: line });
      for (const highlight of stringList(entry.highlights)) blocks.push({ kind: 'bullet', text: highlight });
      const url = asText(entry.url);
      if (url) blocks.push({ kind: 'text', text: url });
    }
    if (blocks.length) sections.push({ title: 'Projects', blocks });
  }

  /* The rest of the schema, in a sensible order, only when present. */
  const extras: Array<[string, string, string, string]> = [
    ['certificates', 'Certifications', 'name', 'issuer'],
    ['awards', 'Awards', 'title', 'awarder'],
    ['publications', 'Publications', 'name', 'publisher'],
    ['volunteer', 'Volunteer', 'organization', 'position'],
    ['languages', 'Languages', 'language', 'fluency'],
    ['interests', 'Interests', 'name', 'keywords'],
    ['references', 'References', 'name', 'reference'],
  ];
  for (const [key, title, primaryKey, secondaryKey] of extras) {
    const items = asArray(source[key]);
    if (!items.length) continue;
    const blocks: ResumeBlock[] = [];
    for (const item of items) {
      if (typeof item === 'string') {
        if (item.trim()) blocks.push({ kind: 'text', text: item.trim() });
        continue;
      }
      const entry = (item ?? {}) as Record<string, unknown>;
      const secondary = secondaryKey === 'keywords' ? stringList(entry.keywords).join(', ') : asText(entry[secondaryKey]);
      const line = entryLine(
        asText(entry[primaryKey]),
        secondary,
        asText(entry.date) || asText(entry.releaseDate) || jsonResumeDates(entry),
      );
      if (line) blocks.push({ kind: title === 'References' ? 'entry' : 'text', text: line });
    }
    if (blocks.length) sections.push({ title, blocks });
  }

  return sections;
}

function identityFromJsonResume(source: Record<string, unknown>): {
  name: string;
  headline: string;
  contacts: string[];
} {
  const basics = (source.basics ?? {}) as Record<string, unknown>;
  const contacts: string[] = [];
  const email = asText(basics.email);
  if (email) contacts.push(email);
  const phone = asText(basics.phone);
  if (phone) contacts.push(phone);

  const location = basics.location;
  if (location !== null && typeof location === 'object') {
    const place = (location ?? {}) as Record<string, unknown>;
    const text =
      asText(place.raw) ||
      [asText(place.city), asText(place.region), asText(place.countryCode)].filter(Boolean).join(', ');
    if (text) contacts.push(text);
  } else if (asText(location)) {
    contacts.push(asText(location));
  }

  for (const item of asArray(basics.profiles)) {
    const profile = (item ?? {}) as Record<string, unknown>;
    const text = asText(profile.url) || asText(profile.username);
    if (text) contacts.push(text);
  }

  return { name: asText(basics.name), headline: asText(basics.label), contacts };
}

/** No `sections` key, but the parser split the resume into the usual arrays. */
function sectionsFromArrays(source: Record<string, unknown>): ResumeSection[] {
  const sections: ResumeSection[] = [];
  for (const [key, title] of SECTION_ARRAY_ALIASES) {
    const value = source[key];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      const blocks = value.flatMap((item) => blocksFromEntry(item));
      if (blocks.length) sections.push({ title, blocks });
    } else {
      const lines = stringList(value);
      if (lines.length) sections.push({ title, blocks: lines.map((text) => ({ kind: 'text' as const, text })) });
    }
  }
  return sections;
}

/** Last resort: the parser returned the resume as plain text — split it on headings. */
export function sectionsFromPlainText(raw: string): ResumeSection[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+$/, ''))
    .filter((line, index, all) => line.trim().length > 0 || (index > 0 && all[index - 1].trim().length > 0));

  const sections: ResumeSection[] = [];
  let current: ResumeSection | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    const isHeading = trimmed.length <= 48 && (KNOWN_HEADINGS.test(trimmed) || (!/[a-z]/.test(trimmed) && /[A-Z]{3,}/.test(trimmed)));
    if (isHeading) {
      current = { title: trimmed.replace(/:$/, ''), blocks: [] };
      sections.push(current);
      continue;
    }
    if (!current) {
      current = { title: 'Summary', blocks: [] };
      sections.push(current);
    }
    const bullet = /^[-•*·▪]\s+/.test(trimmed);
    current.blocks.push({
      kind: bullet ? 'bullet' : 'text',
      text: bullet ? trimmed.replace(/^[-•*·▪]\s+/, '') : trimmed,
    });
  }
  return sections.filter((section) => section.blocks.length > 0);
}

/**
 * Plain text → document. The first one or two lines are usually the name and
 * the headline, so they are lifted out before the headings are split.
 */
export function resumeFromPlainText(raw: string): {
  name: string;
  headline: string;
  contacts: string[];
  sections: ResumeSection[];
} {
  const lines = raw.split(/\r?\n/).map((line) => line.trim());
  let cursor = 0;
  const nextLine = () => {
    while (cursor < lines.length && !lines[cursor]) cursor += 1;
    return cursor < lines.length ? lines[cursor++] : '';
  };

  let name = '';
  let headline = '';
  let contacts: string[] = [];

  const first = nextLine();
  const looksLikeName = first.length > 0 && first.length <= 48 && !/[\d@]/.test(first);
  if (looksLikeName) {
    name = first;
    const second = nextLine();
    if (second && second.length <= 120 && !KNOWN_HEADINGS.test(second)) {
      contacts = stringList(second);
      if (contacts.length > 1) {
        /* "email | phone | city" — everything from the first @ onwards is contact info. */
        const firstContact = contacts.findIndex((part) => /[@+]|\d/.test(part));
        if (firstContact >= 0) {
          headline = contacts.slice(0, firstContact).join(' ').trim();
          contacts = contacts.slice(firstContact);
        } else {
          headline = second;
          contacts = [];
        }
      } else {
        headline = second;
        contacts = [];
      }
    } else if (second) {
      cursor -= 1;
    }
  } else {
    cursor -= 1;
  }

  return { name, headline, contacts, sections: sectionsFromPlainText(lines.slice(cursor).join('\n')) };
}

/**
 * Turns whatever the parser sends into the shape the studio can edit and
 * `resumePdf()` can render.
 *
 * Handles, in order: its own documented shape; a resume wrapped in
 * `{resume|data|parsed|result|document: …}`; section arrays named differently
 * (`items`, `lines`, `bullets`, `content`); the usual top-level arrays
 * (`experience`, `education`, `skills`, …) built from objects; and finally a
 * plain-text resume split on headings. Unknown fields are dropped, missing ones
 * defaulted, so a different parser payload still opens in the editor.
 */
export function toResumeDocument(payload: unknown): ResumeDocument {
  const levels = unwrapLevels(payload);
  const source = levels.length ? levels[levels.length - 1] : {};

  /* The standard JSON Resume schema first — the parser wraps one. */
  const fromJsonResume = looksLikeJsonResume(source) ? jsonResumeSections(source) : [];
  let sections = fromJsonResume;
  if (!sections.length) sections = sectionsFromSections(source);
  if (!sections.length) sections = sectionsFromArrays(source);

  /* The wrapper may hold the name while the resume object holds the rest:
     read from the inside out, and copy nothing twice. */
  const contacts: string[] = [];
  for (const level of [...levels].reverse()) {
    for (const candidate of stringList(
      CONTACT_ALIASES.map((key) => level[key]).find((value) => value !== undefined),
    )) {
      if (!contacts.includes(candidate)) contacts.push(candidate);
    }
    for (const key of CONTACT_FIELD_KEYS) {
      const value = asText(level[key]);
      if (value && !contacts.includes(value)) contacts.push(value);
    }
  }

  const identity = identityFromJsonResume(source);
  for (const contact of identity.contacts) {
    if (!contacts.includes(contact)) contacts.push(contact);
  }

  const name =
    identity.name ||
    [...levels].reverse().map((level) => firstString(level, NAME_ALIASES)).find(Boolean) ||
    '';
  const headline =
    identity.headline ||
    [...levels].reverse().map((level) => firstString(level, HEADLINE_ALIASES)).find(Boolean) ||
    '';

  if (!sections.length) {
    /* Nothing structured: the answer may be the resume as plain text. */
    const plain = PLAIN_TEXT_ALIASES.map((key) => asText(source[key])).find((text) => text.length > 40);
    if (plain) {
      const fromText = resumeFromPlainText(plain);
      return {
        name: name || fromText.name || 'Your name',
        headline: headline || fromText.headline,
        contacts: contacts.length ? contacts : fromText.contacts,
        sections: fromText.sections,
      };
    }
  }

  return { name: name || 'Your name', headline, contacts, sections };
}

/** For the error message: what the payload actually contained. */
/**
 * Human-readable summary of a payload the mapper could not use: checks the whole
 * object (including envelopes) and reports `path: type`, with array lengths —
 * enough to add the missing mapping without guessing.
 */
export function describePayload(payload: unknown): string {
  const paths: string[] = [];
  const seen = new Set<unknown>();

  const walk = (value: unknown, path: string, depth: number) => {
    if (paths.length >= 14 || depth > 2) return;
    if (Array.isArray(value)) {
      const label = value.length
        ? `array[${value.length}] of ${typeof value[0]}`
        : 'empty array';
      paths.push(`${path}: ${label}`);
      if (value.length && typeof value[0] === 'object' && value[0] !== null) {
        for (const key of Object.keys(value[0] as Record<string, unknown>).slice(0, 6)) {
          paths.push(`${path}[0].${key}: ${typeof (value[0] as Record<string, unknown>)[key]}`);
        }
      }
      return;
    }
    if (value !== null && typeof value === 'object') {
      if (seen.has(value)) return;
      seen.add(value);
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        walk(child, path ? `${path}.${key}` : key, depth + 1);
      }
      return;
    }
    const text = typeof value === 'string' ? `"${value.slice(0, 28)}${value.length > 28 ? '…' : ''}"` : String(value);
    paths.push(`${path}: ${text}`);
  };

  walk(parseJsonString(payload), '', 0);
  return paths.length ? paths.join(' · ') : 'an empty object';
}
/**
 * Asks the parser for the resume as JSON so the editor can open it.
 *
 * Two shapes are supported because both are sensible service designs:
 *
 *   GET  {NEXT_PUBLIC_ATS_PARSE_ENDPOINT}/{job_id}   ← preferred: the job already
 *        holds the file, so nothing is re-uploaded. The id is the `x-job-id`
 *        header sent with the PDF by /v1/format.  (also accepts `…/{jobId}`)
 *
 *   POST {NEXT_PUBLIC_ATS_PARSE_ENDPOINT}            ← fallback: send the file
 *        again (multipart `file`, header X-API-Key).
 *
 * Unlike generation there is no fallback to the demo writer: without the real
 * text there is nothing to edit, so failures are surfaced as they are.
 */
export async function parseAtsResume(input: {
  /**
   * `x-resume-json-url` from the format response (already absolute). Preferred:
   * the service itself says where the JSON is, so nothing has to be configured.
   */
  parseUrl?: string | null;
  /** `x-job-id` from the format response — used when there is no URL header. */
  jobId?: string | null;
  /** The uploaded file, used only when the service offers neither. */
  rawFile?: File | null;
  endpoint?: string;
}): Promise<ResumeDocument> {
  const endpoint = (input.endpoint ?? ATS_PARSE_ENDPOINT).trim();
  const direct = (input.parseUrl ?? '').trim();
  if (!direct && !endpoint) {
    throw new Error(
      'No parser endpoint is configured (NEXT_PUBLIC_ATS_PARSE_ENDPOINT) — set it to enable editing uploaded resumes.',
    );
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATS_REQUEST_TIMEOUT_MS);
  const headers = ATS_API_KEY ? { 'X-API-Key': ATS_API_KEY } : undefined;

  let url = endpoint;
  let init: RequestInit;
  if (direct) {
    /* The service named the address — use it as-is. */
    url = direct;
    init = { method: 'GET', headers, signal: controller.signal, cache: 'no-store' };
  } else if (input.jobId && endpoint) {
    url = parseUrlFor(endpoint, input.jobId);
    init = { method: 'GET', headers, signal: controller.signal, cache: 'no-store' };
  } else if (input.rawFile) {
    const form = new FormData();
    form.append('file', input.rawFile, input.rawFile.name);
    init = { method: 'POST', headers, body: form, signal: controller.signal, cache: 'no-store' };
  } else {
    clearTimeout(timer);
    throw new Error(
      'The uploaded file is only kept for this visit — upload it once more (or generate again), then press Edit.',
    );
  }

  try {
    const response = await fetch(url, init);
    if (response.status === 404) {
      const what = input.jobId ? `job ${input.jobId}` : url;
      throw new Error(
        `The service has nothing at ${what} any more — jobs are created by /v1/format and can expire. Generate again, then press Edit.`,
      );
    }
    if (!response.ok) {
      const detail = await readDetail(response);
      throw new Error(friendlyStatus(response.status, detail));
    }
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('json')) {
      throw new Error(
        `Expected JSON from ${url} but the service answered ${contentType || 'an unknown type'}.`,
      );
    }
    const payload = (await response.json()) as unknown;
    /* Dev builds print the raw answer so the shape can be checked instantly
       (DevTools → Console). Never logged in production. */
    if (process.env.NODE_ENV !== 'production') {
      console.info('[ats] /v1/parse answered with:', payload);
    }
    const document = toResumeDocument(payload);
    if (!document.sections.length) {
      throw new Error(
        `The parser answered, but nothing in it looked like resume sections (${describePayload(payload)}). Send that JSON over and the mapping gets one line added.`,
      );
    }
    return document;
  } catch (problem) {
    if (problem instanceof Error && problem.name === 'AbortError') {
      throw new Error(`The parser did not answer within ${ATS_REQUEST_TIMEOUT_MS / 1000} s.`);
    }
    if (problem instanceof TypeError) {
      throw new Error(
        `Could not reach ${url} — check the URL, that the service is running, and that it allows this browser (CORS).`,
      );
    }
    throw problem;
  } finally {
    clearTimeout(timer);
  }
}
