/**
 * WCAG 2.1 contrast measurement against the *rendered* page (NFR-010, NFR-013).
 *
 * Nothing here reads the stylesheet: every ratio comes from
 * `getComputedStyle` on a real element in a real palette, so a token the CSS
 * defines but never applies cannot make a sample pass, and a colour the
 * browser composites differently than the tokens suggest cannot hide.
 */
import type { Page } from '@playwright/test';

/** Which computed colour of the element is being measured. */
export type ColourProp =
  | 'color'
  | 'outlineColor'
  | 'borderTopColor'
  | 'textDecorationColor'
  | 'backgroundColor';

export interface Sample {
  /** Human-readable name, used in the failure message. */
  label: string;
  selector: string;
  prop: ColourProp;
  /**
   * Focus the element first, so `outlineColor` reports the focus ring the
   * visitor actually sees (FR-049, NFR-013).
   */
  focus?: boolean;
}

export interface Measurement {
  label: string;
  ratio: number;
  foreground: string;
  background: string;
}

/**
 * Measure each sample's colour against the opaque background the browser
 * composites behind it. Throws if a selector matches nothing, so a sample can
 * never silently pass by being absent.
 */
export async function measureContrast(page: Page, samples: Sample[]): Promise<Measurement[]> {
  const out: Measurement[] = [];
  // A focus sample is measured on its own, with that element actually focused
  // — focus is singular, so they cannot be batched.
  for (const sample of samples) {
    if (sample.focus) await page.locator(sample.selector).first().focus();
    out.push(...(await measureBatch(page, [sample])));
  }
  return out;
}

function measureBatch(page: Page, samples: Sample[]): Promise<Measurement[]> {
  return page.evaluate((specs: Sample[]) => {
    type Rgba = { r: number; g: number; b: number; a: number };

    const parse = (css: string): Rgba => {
      const nums = css.match(/[\d.]+/g);
      if (!nums || css === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
      const [r, g, b, a] = nums.map(Number);
      return { r: r ?? 0, g: g ?? 0, b: b ?? 0, a: a === undefined ? 1 : a };
    };

    /** `over` composited on top of `under`, both opaque-ised against white. */
    const over = (top: Rgba, bottom: Rgba): Rgba => ({
      r: top.r * top.a + bottom.r * (1 - top.a),
      g: top.g * top.a + bottom.g * (1 - top.a),
      b: top.b * top.a + bottom.b * (1 - top.a),
      a: 1,
    });

    /**
     * The opaque colour behind `el`: every ancestor background composited from
     * the first opaque one downwards. The page always reaches `body`, which
     * paints an opaque `--bg`, so the white fallback is only a safety net.
     */
    const backgroundOf = (el: Element): Rgba => {
      const layers: Rgba[] = [];
      for (let node: Element | null = el; node; node = node.parentElement) {
        const colour = parse(getComputedStyle(node).backgroundColor);
        if (colour.a > 0) layers.push(colour);
        if (colour.a >= 1) break;
      }
      let result: Rgba = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) result = over(layers[i]!, result);
      return result;
    };

    const luminance = ({ r, g, b }: Rgba): number => {
      const channel = (v: number): number => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
    };

    const ratio = (a: Rgba, b: Rgba): number => {
      const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
    };

    const show = (c: Rgba): string =>
      `rgb(${Math.round(c.r)}, ${Math.round(c.g)}, ${Math.round(c.b)})`;

    return specs.map((spec) => {
      const el = document.querySelector(spec.selector);
      if (!el) throw new Error(`contrast sample "${spec.label}": no element ${spec.selector}`);

      const style = getComputedStyle(el);
      // What the sampled colour is adjacent to:
      //   - `backgroundColor`: whatever is behind the element;
      //   - `outlineColor` with a non-negative `outline-offset`: the ring is
      //     drawn wholly outside the border box, with the offset gap showing
      //     the same surface, so its neighbour is what is behind the element;
      //   - everything else (text, borders, underlines, an inset ring): the
      //     element's own composited background.
      const outsideRing =
        spec.prop === 'outlineColor' && Number.parseFloat(style.outlineOffset || '0') >= 0;
      const behind = backgroundOf(
        spec.prop === 'backgroundColor' || outsideRing ? (el.parentElement ?? el) : el,
      );
      const raw = parse(style[spec.prop] as string);
      const foreground = over(raw, behind);

      return {
        label: spec.label,
        ratio: ratio(foreground, behind),
        foreground: show(foreground),
        background: show(behind),
      };
    });
  }, samples);
}

/** Every measurement below `min`, formatted for an assertion message. */
export function failures(measurements: Measurement[], min: number): string[] {
  return measurements
    .filter((m) => m.ratio < min)
    .map(
      (m) =>
        `${m.label}: ${m.ratio.toFixed(2)}:1 (${m.foreground} on ${m.background}), need ${min}:1`,
    );
}
