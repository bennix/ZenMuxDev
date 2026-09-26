/** Show one rendered page without discarding the others or modifying source bytes. */
export function showOfficePreviewPage(
  pages: readonly HTMLElement[],
  requestedIndex: number,
): number {
  const index = Math.max(0, Math.min(pages.length - 1, Math.trunc(requestedIndex) || 0));
  pages.forEach((page, pageIndex) => {
    // 预览库可能为页面写入 display 样式；只用 hidden 会被覆盖，导致所有页仍然显示。
    page.style.display = pageIndex === index ? "" : "none";
    page.setAttribute("aria-hidden", String(pageIndex !== index));
  });
  return index;
}
