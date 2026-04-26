import html2canvas from "html2canvas";
import type { Options } from "html2canvas";

/**
 * html2canvas 1.x는 CSS color() / oklch()를 지원하지 않음.
 * Tailwind v4 + shadcn은 :root 변수와 border-border 등에 oklch를 쓰므로,
 * 클론 문서에서만 테마 변수를 hex로 덮어 캡처 오류를 방지한다.
 */
const CLONE_THEME_HEX_OVERRIDES = `
html {
  --background: #ffffff;
  --foreground: #171717;
  --card: #ffffff;
  --card-foreground: #171717;
  --popover: #ffffff;
  --popover-foreground: #171717;
  --primary: #262626;
  --primary-foreground: #fafafa;
  --secondary: #f5f5f5;
  --secondary-foreground: #262626;
  --muted: #f5f5f5;
  --muted-foreground: #737373;
  --accent: #f5f5f5;
  --accent-foreground: #262626;
  --destructive: #dc2626;
  --border: #e5e5e5;
  --input: #e5e5e5;
  --ring: #a3a3a3;
  --chart-1: #e5e5e5;
  --chart-2: #737373;
  --chart-3: #525252;
  --chart-4: #404040;
  --chart-5: #262626;
  --sidebar: #fafafa;
  --sidebar-foreground: #171717;
  --sidebar-primary: #262626;
  --sidebar-primary-foreground: #fafafa;
  --sidebar-accent: #f5f5f5;
  --sidebar-accent-foreground: #262626;
  --sidebar-border: #e5e5e5;
  --sidebar-ring: #a3a3a3;
  --color-background: #ffffff;
  --color-foreground: #171717;
  --color-border: #e5e5e5;
  --color-input: #e5e5e5;
  --color-ring: #a3a3a3;
  --color-card: #ffffff;
  --color-card-foreground: #171717;
  --color-primary: #262626;
  --color-primary-foreground: #fafafa;
  --color-secondary: #f5f5f5;
  --color-secondary-foreground: #262626;
  --color-muted: #f5f5f5;
  --color-muted-foreground: #737373;
  --color-accent: #f5f5f5;
  --color-accent-foreground: #262626;
  --color-destructive: #dc2626;
  --color-popover: #ffffff;
  --color-popover-foreground: #171717;
}
/* outline-ring/50 등이 oklch·color-mix를 쓰는 경우 파싱 실패 방지 */
* {
  outline: none !important;
}
`;

const UNSUPPORTED_COLOR_FN = /\b(oklch|lab|lch|color-mix)\(/i;

/** 클론 노드에 복사된 computed style 이 oklch 를 담으면 html2canvas 가 실패함 */
function stripUnsupportedColorFunctions(root: HTMLElement) {
  const props = [
    "color",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "background-color",
    "outline-color",
    "fill",
    "stroke",
    "text-decoration-color",
    "caret-color",
    "column-rule-color",
  ];
  const walk = (el: Element) => {
    if (el instanceof HTMLElement) {
      for (const p of props) {
        try {
          const v = el.style.getPropertyValue(p);
          if (v && UNSUPPORTED_COLOR_FN.test(v)) {
            el.style.removeProperty(p);
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
      const style = clonedDoc.createElement("style");
      style.setAttribute("data-html2canvas-oklch-fix", "1");
      style.textContent = CLONE_THEME_HEX_OVERRIDES;
      clonedDoc.documentElement.insertBefore(style, clonedDoc.documentElement.firstChild);
      stripUnsupportedColorFunctions(clonedEl);
      userOnClone?.(clonedDoc, clonedEl);
    },
    ...rest,
  });
}
