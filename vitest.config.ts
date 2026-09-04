import { defineConfig } from "vitest/config";

// 单元/性质测试：docs/11 §7。集成测试（Form B 驱动真实 pi 会话）在后续里程碑接入。
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
    globals: false,
  },
});
