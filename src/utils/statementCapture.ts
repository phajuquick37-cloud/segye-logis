import html2canvas from "html2canvas";
import type { Options } from "html2canvas";

/**
 * html2canvas 1.x는 CSS color() / oklch()를 지원하지 않음.
 * Tailwind v4 + shadcn은 :root 변수와 border-border 등에 oklch를 쓰므로,
 * 클론 문서에서만 테마 변수를 hex로 덮어 캡처 오류를 방지한다.
 */
/**
 * Tailwind v4 + shadcn :root / @theme 은 뒤에서 oklch 를 다시 넣으므로
 * :root,html 에 !important 로 고정. (스타일을 head 끝에 append 필수)
 */
const CLONE_THEME_HEX_OVERRIDES = `
:root, html {
  --background: #ffffff !important;
  --foreground: #171717 !important;
  --card: #ffffff !important;
  --card-foreground: #171717 !important;
  --popover: #ffffff !important;
  --popover-foreground: #171717 !important;
  --primary: #262626 !important;
  --primary-foreground: #fafafa !important;
  --secondary: #f5f5f5 !important;
  --secondary-foreground: #262626 !important;
  --muted: #f5f5f5 !important;
  --muted-foreground: #737373 !important;
  --accent: #f5f5f5 !important;
  --accent-foreground: #262626 !important;
  --destructive: #dc2626 !important;
  --border: #e5e5e5 !important;
  --input: #e5e5e5 !important;
  --ring: #a3a3a3 !important;
  --chart-1: #e5e5e5 !important;
  --chart-2: #737373 !important;
  --chart-3: #525252 !important;
  --chart-4: #404040 !important;
  --chart-5: #262626 !important;
  --sidebar: #fafafa !important;
  --sidebar-foreground: #171717 !important;
  --sidebar-primary: #262626 !important;
  --sidebar-primary-foreground: #fafafa !important;
  --sidebar-accent: #f5f5f5 !important;
  --sidebar-accent-foreground: #262626 !important;
  --sidebar-border: #e5e5e5 !important;
  --sidebar-ring: #a3a3a3 !important;
  --color-background: #ffffff !important;
  --color-foreground: #171717 !important;
  --color-border: #e5e5e5 !important;
  --color-input: #e5e5e5 !important;
  --color-ring: #a3a3a3 !important;
  --color-card: #ffffff !important;
  --color-card-foreground: #171717 !important;
  --color-primary: #262626 !important;
  --color-primary-foreground: #fafafa !important;
  --color-secondary: #f5f5f5 !important;
  --color-secondary-foreground: #262626 !important;
  --color-muted: #f5f5f5 !important;
  --color-muted-foreground: #737373 !important;
  --color-accent: #f5f5f5 !important;
  --color-accent-foreground: #262626 !important;
  --color-destructive: #dc2626 !important;
  --color-popover: #ffffff !important;
  --color-popover-foreground: #171717 !important;
  --color-slate-50: #f8fafc !important;
  --color-slate-100: #f1f5f9 !important;
  --color-slate-200: #e2e8f0 !important;
  --color-slate-300: #cbd5e1 !important;
  --color-slate-400: #94a3b8 !important;
  --color-slate-500: #64748b !important;
  --color-slate-600: #475569 !important;
  --color-slate-700: #334155 !important;
  --color-slate-800: #1e293b !important;
  --color-slate-900: #0f172a !important;
  --color-blue-50: #eff6ff !important;
  --color-blue-100: #dbeafe !important;
  --color-blue-200: #bfdbfe !important;
  --color-blue-300: #93c5fd !important;
  --color-blue-400: #60a5fa !important;
  --color-blue-500: #3b82f6 !important;
  --color-blue-600: #2563eb !important;
  --color-blue-700: #1d4ed8 !important;
  --color-blue-800: #1e40af !important;
  --color-purple-300: #d8b4fe !important;
  --color-purple-700: #7e22ce !important;
  --color-red-300: #fca5a5 !important;
  --color-red-500: #ef4444 !important;
  --color-red-700: #b91c1c !important;
  --color-green-50: #f0fdf4 !important;
  --color-green-200: #bbf7d0 !important;
  --color-green-500: #22c55e !important;
  --color-green-700: #15803d !important;
  --color-emerald-600: #059669 !important;
}
* {
  outline: none !important;
}
* {
  --tw-shadow: 0 0 #0000 !important;
  --tw-shadow-colored: 0 0 #0000 !important;
}
`;

const UNSUPPORTED_COLOR = /\b(oklch|lab\(|lch\(|color-mix\()/i;

/** getComputedStyle 이 여전히 oklch 를 돌려주는 속성 → rgb/hex 고정 (인라인 !important) */
const COLOR_LIKE_PROPS = [
  "color",
  "background-color",
  "background",
  "background-image",
  "border-color",
  "border-top-color",
  "border-right-color",
  "border-bottom-color",
  "border-left-color",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "outline",
  "outline-color",
  "box-shadow",
  "text-shadow",
  "filter",
  "fill",
  "stroke",
  "text-decoration",
  "text-decoration-color",
  "caret-color",
  "column-rule-color",
] as const;

/** 모든 computed 속성값에 oklch 등이 남아 있으면 인라인으로 덮어 html2canvas 파서가 안 읽게 함 */
function sanitizeHtml2CanvasColors(root: HTMLElement) {
  const win = root.ownerDocument?.defaultView;
  if (!win) return;

  const fixValue = (el: HTMLElement | SVGElement, name: string, val: string) => {
    const n = name.toLowerCase();
    if (n.includes("shadow") || n === "box-shadow" || n === "text-shadow") {
      el.style.setProperty(name, "none", "important");
    } else if (n === "filter") {
      el.style.setProperty("filter", "none", "important");
    } else if (n.includes("background-image") || (n === "background" && /url\(|gradient|oklch/i.test(val))) {
      el.style.setProperty("background-image", "none", "important");
      if (n === "background") {
        el.style.setProperty("background-color", "#ffffff", "important");
      }
    } else if (n.includes("border") && n.includes("color")) {
      el.style.setProperty(name, "#555555", "important");
    } else if (n === "background-color" || n === "background") {
      el.style.setProperty("background-color", "#ffffff", "important");
    } else if (n === "color" || n === "fill" || n === "stroke") {
      el.style.setProperty(name, "#111111", "important");
    } else if (n.includes("outline")) {
      el.style.setProperty(name, "none", "important");
    }
  };

  const walk = (el: Element) => {
    const isBox =
      el instanceof HTMLElement ||
      (typeof SVGElement !== "undefined" && el instanceof SVGElement);
    if (isBox) {
      const cs = win.getComputedStyle(el);
      for (const p of COLOR_LIKE_PROPS) {
        const hyphen = p.replace(/([A-Z])/g, "-$1").toLowerCase();
        let v = "";
        try {
          v = cs.getPropertyValue(hyphen);
        } catch {
          v = "";
        }
        if (!v || v === "none" || v === "rgba(0, 0, 0, 0)" || v === "transparent") continue;
        if (!UNSUPPORTED_COLOR.test(v) && !v.includes("oklch")) continue;
        if (p === "background-image" && v.includes("gradient")) {
          el.style.setProperty("background-image", "none", "important");
          continue;
        }
        if (p === "box-shadow" || p === "text-shadow") {
          el.style.setProperty(hyphen, "none", "important");
        } else if (p === "filter") {
          el.style.setProperty("filter", "none", "important");
        } else if (
          (p === "border" || (p.startsWith("border-") && p !== "border-color")) &&
          el instanceof HTMLElement
        ) {
          el.style.setProperty("border-color", "#94a3b8", "important");
        } else if (p === "background" || p === "background-color") {
          el.style.setProperty("background-color", "#ffffff", "important");
          el.style.setProperty("background-image", "none", "important");
        } else if (p === "color" || p === "fill") {
          el.style.setProperty(hyphen, "#0f172a", "important");
        } else {
          el.style.setProperty(hyphen, "#64748b", "important");
        }
      }
      /* 스타일시트에만 있던 oklch — 전체 속성 스캔 (html2canvas 가 직접 파싱하는 경우) */
      for (let i = 0; i < cs.length; i++) {
        const name = cs[i];
        let val = "";
        try {
          val = cs.getPropertyValue(name);
        } catch {
          continue;
        }
        if (!val || !/oklch|lab\(|lch\(|color-mix\(/i.test(val)) continue;
        fixValue(el, name, val);
      }
    }
    for (const c of el.children) walk(c);
  };
  walk(root);
}

/** 클론 문서에서 Tailwind 등 link/style 제거 → oklch 규칙 자체를 없앰 (가장 확실) */
function stripExternalStylesFromClone(clonedDoc: Document) {
  const head = clonedDoc.head;
  if (!head) return;
  head.querySelectorAll('link[rel="stylesheet"]').forEach((n) => n.remove());
  head.querySelectorAll("style").forEach((n) => n.remove());
}

/** inline style 만 검사(구버전) */
function stripUnsupportedColorFunctions(root: HTMLElement) {
  const walk = (el: Element) => {
    if (el instanceof HTMLElement) {
      for (const p of COLOR_LIKE_PROPS) {
        try {
          const v = el.style.getPropertyValue(p.replace(/([A-Z])/g, "-$1").toLowerCase());
          if (v && UNSUPPORTED_COLOR.test(v)) {
            el.style.removeProperty(p.replace(/([A-Z])/g, "-$1").toLowerCase());
          }
        } catch {
          /* ignore */
        }
      }
    }
    for (const c of el.children) {
      walk(c);
    }
  };
  walk(root);
}

export type StatementCaptureOptions = Partial<Options> & {
  scale?: number;
};

/**
 * 거래명세표 DOM → canvas (PNG/PDF/메일용)
 */
export function captureStatementToCanvas(
  element: HTMLElement,
  options: StatementCaptureOptions = {}
): Promise<HTMLCanvasElement> {
  const { scale = 2, logging = false, onclone: userOnClone, ...rest } = options;

  return html2canvas(element, {
    scale,
    useCORS: true,
    backgroundColor: "#ffffff",
    logging,
    onclone: (clonedDoc, clonedEl) => {
      stripExternalStylesFromClone(clonedDoc);
      const style = clonedDoc.createElement("style");
      style.setAttribute("data-html2canvas-oklch-fix", "1");
      style.textContent =
        CLONE_THEME_HEX_OVERRIDES +
        `
html, body { background: #ffffff !important; color: #111111 !important; }
`;
      const head = clonedDoc.head;
      if (head) {
        head.appendChild(style);
      } else {
        clonedDoc.documentElement.appendChild(style);
      }
      try {
        clonedDoc.documentElement.style.setProperty("background-color", "#ffffff", "important");
        clonedDoc.body.style.setProperty("background-color", "#ffffff", "important");
        clonedDoc.body.style.setProperty("color", "#111111", "important");
      } catch {
        /* ignore */
      }
      stripUnsupportedColorFunctions(clonedEl);
      sanitizeHtml2CanvasColors(clonedEl);
      userOnClone?.(clonedDoc, clonedEl);
    },
    foreignObjectRendering: false,
    ...rest,
  });
}
