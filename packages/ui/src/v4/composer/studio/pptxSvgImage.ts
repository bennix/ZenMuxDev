/** 保存 PPT 时把内联 SVG 光栅成 PNG，这样流程图仍是一张图片，文字框保持可编辑。 */

interface SvgImageNode {
  kind: string;
  src?: string;
  w: number;
  h: number;
}

function drawSvg(src: string, width: number, height: number): Promise<string | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * 2));
      canvas.height = Math.max(1, Math.round(height * 2));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

export function svgSnapshot(el: Element, width: number, height: number): string {
  // iframe 元素使用自己的 realm；按已知 SVG 元素类型复制，不用父窗口 instanceof。
  const clone = el.cloneNode(true) as Element;
  if (clone.nodeType !== 1) return "";
  if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(Math.max(1, Math.round(width))));
  clone.setAttribute("height", String(Math.max(1, Math.round(height))));
  const xml = new XMLSerializer().serializeToString(clone);
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
}

export async function rasterizeSvgImages(nodes: readonly SvgImageNode[]): Promise<void> {
  for (const node of nodes) {
    if (node.kind !== "image" || !node.src?.startsWith("data:image/svg+xml")) continue;
    const png = await drawSvg(node.src, node.w, node.h);
    if (png) node.src = png;
  }
}
