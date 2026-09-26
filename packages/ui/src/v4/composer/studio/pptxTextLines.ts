import type { EditableHtmlNode } from "./htmlToEditablePptx.js";

function fontFace(style: CSSStyleDeclaration, text: string): string {
  const serif = /serif/u.test(style.fontFamily) && !/sans-serif/u.test(style.fontFamily);
  if (/[\u3400-\u9fff]/u.test(text)) {
    const candidates = serif ? ["Songti SC", "Noto Serif CJK SC", "SimSun"] : ["PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC"];
    const canvas = document.createElement("canvas").getContext("2d");
    if (canvas) {
      canvas.font = '28px monospace';
      const fallback = canvas.measureText("AaWw 条件判断中文测试").width;
      for (const family of candidates) {
        canvas.font = `28px "${family}", monospace`;
        if (Math.abs(canvas.measureText("AaWw 条件判断中文测试").width - fallback) > 0.1) return family;
      }
    }
    return serif ? "SimSun" : "Microsoft YaHei";
  }
  const first = style.fontFamily.split(",")[0]?.replace(/["']/gu, "").trim() || "Arial";
  return first === "monospace" ? "Courier New" : first === "sans-serif" ? "Arial" : first === "serif" ? "Georgia" : first;
}

/** 行内元素跨行时 boundingClientRect 是所有行的并集，不能当成一个新文本框重新排版。 */
export function measuredTextLines(el: HTMLElement, root: HTMLElement, base: EditableHtmlNode): EditableHtmlNode[] {
  const doc = el.ownerDocument, origin = root.getBoundingClientRect();
  const style = getComputedStyle(el);
  const walker = doc.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lines: {text:string;x:number;y:number;right:number;bottom:number; cjk:boolean}[] = [];
  for(let node=walker.nextNode();node;node=walker.nextNode()) {
    const value=node.textContent ?? "";
    for(let i=0;i<value.length;) {
      const char=String.fromCodePoint(value.codePointAt(i)!);
      const range=doc.createRange();range.setStart(node,i);range.setEnd(node,i+char.length);i+=char.length;
      const rect=range.getBoundingClientRect();
      if(rect.width<0.1 || rect.height<0.1 || char==='\n' || char==='\r') continue;
      const cjk=/[\u3400-\u9fff]/u.test(char);
      let line=lines.at(-1);
      if(!line || line.cjk!==cjk || Math.abs(line.y-(rect.y-origin.y))>2) {
        line={text:"",cjk,x:rect.x-origin.x,y:rect.y-origin.y,right:rect.right-origin.x,bottom:rect.bottom-origin.y};lines.push(line);
      }
      line.text+=char;line.right=Math.max(line.right,rect.right-origin.x);line.bottom=Math.max(line.bottom,rect.bottom-origin.y);
    }
  }
  if(lines.length<=1 && style.display!=="inline" && !el.closest("pre,code")) return [{...base,fontFace:fontFace(style,base.text ?? "")}];
  return lines.filter(line=>line.text.trim()).map(line=>({...base,x:line.x,y:line.y,w:line.right-line.x+2,h:line.bottom-line.y+2,text:line.text,fontFace:fontFace(style,line.text),align:"left",valign:"top",noWrap:true,widenPx:undefined,unwrapLines:undefined}));
}
