# 测试「Mark as Paid」流程（小林 $128.23）

## 前置条件

1. **确认/执行迁移**（任选其一）：
   - 浏览器访问 `GET /api/ensure-expenses-migration-202604141000`，若返回 `hasColumns: false`，再请求 `POST /api/ensure-expenses-migration-202604141000` 执行迁移。
   - 或在 Supabase SQL Editor 中执行 `supabase/migrations/202604141000_expenses_source_source_id_paid.sql` 内容。
2. 数据库重复数据已清理；列表中有一笔 **小林 $128.23** 的 pending 报销。

## 测试步骤

1. 打开 **工人报销** 页面：`/labor/reimbursements`。
2. 找到 **小林、金额 $128.23** 的那条报销（状态为待付款）。
3. 点击该行操作菜单（三个点）→ **Mark as Paid**。
4. 在弹窗中填写付款方式（可选）、备注（可选），点击 **Mark as Paid**。
5. **预期结果**：
   - 页面顶部出现提示：**「已标记为已付款，并已生成费用。」**
   - 约 1.2 秒后自动跳转到 **费用详情**（或费用列表）。
   - 回到 **工人报销** 列表刷新：**小林 $128.23 这笔不再显示**（已从 pending 列表消失）。
6. **确认只生成一条费用**：
   - 打开 **费用** 列表 `/financial/expenses`，按 `reference_no` 或备注搜索「REIM-」或「小林」。
   - 或 Supabase 表 `expenses` 中查询：`WHERE source = 'worker_reimbursement' AND source_id = '<该报销的 id>'`，或 `WHERE reference_no = 'REIM-<该报销的 id>'`。
   - **应只有 1 条** 对应这笔报销。
7. **重复点击测试（防重复）**：
   - 若该报销已从列表消失，无法再次点击，则说明状态已正确变为 paid。
   - 若在清理数据后再次有一笔「小林 $128.23」pending，再次点击 Mark as Paid，应仍然只创建/关联 **同一条** 费用（防重生效）。

## 若迁移未执行

- 单次点击可能因无 `source`/`source_id` 而创建多条费用（防重会依赖 `reference_no` 兜底，通常仍只一条）。
- 建议执行迁移后按上述步骤再测一遍，确认 `expenses` 表有 `source`、`source_id` 且只生成一条费用。
