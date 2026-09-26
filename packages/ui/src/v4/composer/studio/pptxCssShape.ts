import type { EditableHtmlNode } from "./htmlToEditablePptx.js";
export function parseColor(value: string): { hex: string; transparency: number } | null {
  const match = value.match(/rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*[,/]\s*(\d*(?:\.\d+)?))?\s*\)/iu);
  if (!match) return null;
  const hex = [match[1], match[2], match[3]]
    .map((part) => Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
  const alpha = match[4] == null || match[4] === "" ? 1 : Math.max(0, Math.min(1, Number(match[4])));
  return { hex, transparency: Math.round((1 - alpha) * 100) };
}

export function cssBorders(computed:CSSStyleDeclaration,box:{x:number;y:number;w:number;h:number},zIndex:number|undefined):{triangle?:EditableHtmlNode;uniformBorder:boolean;visibleEdges:Array<{width:number;color:{hex:string;transparency:number}|null;index:number}>} {
const {x,y,w,h}=box;
    const edges = ["Top","Right","Bottom","Left"].map(side=>({width:Number.parseFloat(computed.getPropertyValue(`border-${side.toLowerCase()}-width`)) || 0,color:parseColor(computed.getPropertyValue(`border-${side.toLowerCase()}-color`))}));
    const visibleEdges=edges.map((edge,index)=>({...edge,index})).filter(edge=>edge.width>0 && edge.color && edge.color.transparency<99);
    // CSS border 三角不是矩形描边；导出为原生三角，保留箭头方向和填色。
    if (Number.parseFloat(computed.width) === 0 && Number.parseFloat(computed.height) === 0 && visibleEdges.length === 1) {
      const edge=visibleEdges[0]!;
      return {triangle:{kind:"shape",x,y,w,h,fill:edge.color!.hex,fillTransparency:edge.color!.transparency,triangleRotation:[180,270,0,90][edge.index],zIndex},uniformBorder:false,visibleEdges};
    }
    const uniformBorder = edges.every(edge=>edge.width===edges[0]!.width && edge.color?.hex===edges[0]!.color?.hex && edge.color?.transparency===edges[0]!.color?.transparency);

return {uniformBorder,visibleEdges};
}
