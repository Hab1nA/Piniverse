/**
 * 本会话契约面板（ctx.ui.setWidget）：网络图的局部视角（docs/02 §2、docs/11 §2）。
 * 只可视化、不参与任何决策（P6）。
 */
export interface WidgetModel {
  pid: string;
  edges: { master: string; worker: string; contract_id: string; state: string }[];
}

/** 构建 TUI widget 模型；M3 与 pv-hub 的全局视图对齐字段。 */
export function buildContractWidget(_model: WidgetModel): unknown {
  throw new Error("[pv-ext] buildContractWidget 未实现（M3）");
}
