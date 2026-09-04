#!/usr/bin/env node
/**
 * pv 启动器 CLI（Form B，docs/11 §3）。
 * `pv up --peers N`：批量拉起 `pi --mode rpc` 对等会话并注入共享环境；
 * 拉起后即退居二线，对子会话无任何持续权力（docs/02 §2）。
 *
 * M1 以 Form A（人工开终端）验证人类体验；本 CLI 在 Form B / 自动化测试阶段实现。
 */
import { PROTOCOL_VERSION } from "pv-core";

interface UpOptions {
  peers: number;
}

function parseArgs(argv: string[]): { command: string | undefined; options: UpOptions } {
  const [command, ...rest] = argv;
  let peers = 2;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--peers") {
      const n = Number(rest[i + 1]);
      if (Number.isInteger(n) && n > 0) peers = n;
      i++;
    }
  }
  return { command, options: { peers } };
}

function printHelp(): void {
  console.log(`pv — Piniverse launcher (protocol v${PROTOCOL_VERSION})

用法:
  pv up --peers <N>   以 Form B 拉起 N 个对等 pi 会话（待实现）
  pv --help           显示本帮助

M1 推荐使用 Form A：手工开多个终端运行 pi，由 .pi/extensions/pv-ext 自动加载（docs/11 §3）。`);
}

async function main(argv: string[]): Promise<number> {
  const { command, options } = parseArgs(argv);
  if (!command || command === "--help" || command === "-h") {
    printHelp();
    return 0;
  }
  if (command === "up") {
    console.error(`[pv] Form B 尚未实现（规划于自动化测试阶段）；将拉起 ${options.peers} 个对等会话。`);
    return 0;
  }
  console.error(`[pv] 未知命令: ${command}（运行 pv --help 查看用法）`);
  return 1;
}

main(process.argv.slice(2)).then((code) => process.exit(code), (err) => {
  console.error(err);
  process.exit(1);
});
