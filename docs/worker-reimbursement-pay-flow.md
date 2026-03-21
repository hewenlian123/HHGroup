# 工人报销 → 点击付款 → 生成费用：流程与问题分析

## 一、当前流程描述（代码实际怎么跑）

### 1. 工人报销数据来源

- **表**：`worker_reimbursements`（工人报销主表）
- **列表来源**：前端 `GET /api/worker-reimbursements` → 服务端 `getWorkerReimbursements()` 取全表，再在内存里 `filter(r => r.status === "pending")`，只把 **pending** 的返回给页面。
- **页面**：`src/app/labor/reimbursements/page.tsx`，`load()` 调用上述 API，把 `res.reimbursements` 设进 `rows`，所以列表里**只显示 pending**。

### 2. 用户点击「Mark as Paid」

- **入口**：同一页面，行内下拉菜单里的「Mark as Paid」→ 打开 `payModal`，表单里填付款方式、备注后点「Mark as Paid」触发 `handlePay`。
- **请求**：`handlePay` 发 `POST /api/worker-reimbursements/${payModal.id}/pay`，body：`{ method, note }`。

### 3. 后端 Pay 接口（`src/app/api/worker-reimbursements/[id]/pay/route.ts`）

顺序是：

1. **先**调 `markReimbursementPaid(id)`
   - 执行：`update worker_reimbursements set status = 'paid', paid_at = now() where id = ?`
   - 成功则返回更新后的报销对象；失败则抛错，接口直接 400，**不会**去创建费用。

2. **再**调 `createExpenseFromPaidReimbursement(reimbursement, { method, note })`
   - 用报销数据创建一条 `expenses` 记录（并写一条 `expense_lines`）。
   - 若这里抛错，会被 catch，只把错误信息放进 `expenseWarning`，接口仍 200，报销状态**已经**是 paid。

3. 返回 200 + `{ reimbursement, expenseId?, expenseWarning? }`。

### 4. 前端收到 200 之后

- 关闭弹窗，`await load()` 重新拉列表。
- 因为 API 只返回 `status === 'pending'`，这条已变成 paid 的报销不会再出现在列表里。
- 若有 `expenseId` 会跳转到该费用详情，否则跳费用列表。

### 5. 批量付款（同一流程的另一种入口）

- **入口**：`POST /api/worker-reimbursements/create-payment`，body：`{ reimbursementIds: string[], paymentMethod?, note? }`。
- **逻辑**：`recordBatchReimbursementPayment(ids)` 批量把报销更新为 paid，然后**对每条**报销调一次 `createExpenseFromPaidReimbursement`。
- 单条付款与批量付款都会「先更新报销 → 再创建费用」。

---

## 二、发现的 Bug

### Bug 1：报销状态没更新（已修）

- **原因**：`markReimbursementPaid` 里用了 `.in("status", ["pending", "approved"])`。若库里是别的写法（如 `"Pending"`、`"Approved"`）或其它状态，UPDATE 影响 0 行，接口可能仍继续走并创建了费用，但报销仍是 pending。
- **修复**：已改为**只按 id 更新**，不再带 status 条件，保证「Mark as Paid」一定把该条更新为 paid。

### Bug 2：同一笔报销生成多条费用（重复创建）

- **原因 1**：**防重依赖 `source` / `source_id`**
  - 防重逻辑：先查 `expenses` 是否存在 `source = 'worker_reimbursement'` 且 `source_id = reimbursement.id`，有则直接返回，不插入。
  - 若迁移 `202604141000_expenses_source_source_id_paid.sql` **没跑**，表里没有 `source`、`source_id`，这条 select 会报错；代码里用 try/catch 吞掉错误，`existingId` 一直是 null → **每次都会插入** → 重复费用。

- **原因 2**：**降级插入不写 source/source_id**
  - 首次插入时若因缺少列（如没有 `status='paid'`、没有 `source` 等）走 fallback 插入（noSource、minimal），这些 payload **没有**写 `source`、`source_id`。
  - 这样产生的费用行没有 source 信息，下次同一报销再点「Mark as Paid」时，防重查询仍然找不到 → **再次插入** → 重复。

- **原因 3**：**没有用 reference_no 做兜底防重**
  - 费用里已经稳定写了 `reference_no = 'REIM-${reimbursementId}'`，但防重只看了 source/source_id，没有用 reference_no 再查一次，所以在「无 source 列」或「历史数据无 source」时无法防重。

### Bug 3：付款“没成功”的体感

- 若 Bug 1 存在：接口 200、费用也建了，但报销还是 pending，列表刷新后仍能看到同一条，用户会以为「付款没成功」。
- 修复 Bug 1 后，只要接口 200，报销一定已是 paid，列表会刷新掉，体感会正常。

---

## 三、涉及的数据库结构

### 表 1：`worker_reimbursements`

| 字段        | 类型                   | 说明                                     |
| ----------- | ---------------------- | ---------------------------------------- |
| id          | uuid PK                | 主键                                     |
| worker_id   | uuid                   | 工人                                     |
| project_id  | uuid nullable          | 项目                                     |
| vendor      | text                   | 供应商/说明（后续迁移加）                |
| amount      | numeric                | 金额                                     |
| description | text                   | 描述                                     |
| receipt_url | text                   | 收据链接                                 |
| status      | text default 'pending' | pending / paid                           |
| created_at  | timestamptz            | 创建时间                                 |
| paid_at     | timestamptz            | 付款时间（后续迁移加）                   |
| payment_id  | uuid                   | 关联 worker_payments（批量付款用，可选） |

- **无唯一约束**在 (source_type, source_id) 上，因为这是报销表不是费用表。
- 状态应统一小写 `pending` / `paid`，避免与 update 条件不一致。

### 表 2：`expenses`

| 字段                                    | 说明                                          |
| --------------------------------------- | --------------------------------------------- |
| id                                      | 主键                                          |
| expense_date                            | 日期                                          |
| vendor / vendor_name                    | 供应商                                        |
| reference_no                            | 单据号，我们写 `REIM-${reimbursementId}`      |
| total, line_count                       | 金额、行数                                    |
| status                                  | 需包含 'paid'（迁移 202604141000 已加）       |
| **source**                              | 来源，写 `'worker_reimbursement'`（同上迁移） |
| **source_id**                           | 来源 id，写 `reimbursement.id`（同上迁移）    |
| notes, payment_method, receipt_url, ... | 其它                                          |

- **缺失/冲突**：若未跑 202604141000，则缺 `source`、`source_id`，且 `status` 的 check 可能不含 `'paid'`，会导致插入失败或走 fallback；fallback 插入又不写 source/source_id，导致无法防重。

### 表 3：`expense_lines`

- 每笔报销对应费用只插一条 line，category 用 `'reimbursement'`，amount = 报销金额。

---

## 四、后端 API 与具体出问题的文件/函数

| 文件                                                        | 函数/路由                            | 问题                                                                                                                                     |
| ----------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/worker-reimbursements-db.ts`                       | `markReimbursementPaid`              | ~~曾用 `.in("status", ["pending","approved"])` 导致 0 行更新~~ → 已改为只按 id 更新。                                                    |
| `src/lib/expenses-db.ts`                                    | `createExpenseFromPaidReimbursement` | ① 防重仅靠 source/source_id，无列或报错时被 catch 后总是插入；② fallback 插入不写 source/source_id，无法防重；③ 未用 reference_no 兜底。 |
| `src/app/api/worker-reimbursements/[id]/pay/route.ts`       | POST                                 | 顺序正确（先更新报销再创建费用），无逻辑错误。                                                                                           |
| `src/app/api/worker-reimbursements/route.ts`                | GET                                  | 已只返回 pending，列表只显示待付款。                                                                                                     |
| `src/app/api/worker-reimbursements/create-payment/route.ts` | POST                                 | 批量先更新再逐条创建费用，逻辑正确；同样依赖 `createExpenseFromPaidReimbursement` 防重。                                                 |

**结论**：问题集中在 **`createExpenseFromPaidReimbursement`** 的防重与 fallback 策略；`markReimbursementPaid` 已修。

---

## 五、为什么同一笔报销会生成多条费用

1. **第一次点击「Mark as Paid」**
   - 若 DB 还没有 source/source_id 列：防重 select 报错 → catch 后 existingId = null → 插入一条费用（可能用 noSource/minimal，没 source/source_id）。
   - 若 DB 有 source/source_id 但插入时因 `status='paid'` 不在 check 里失败：走 noSource 插入，仍然不写 source/source_id。

2. **第二次再对同一条报销点「Mark as Paid」**（例如列表没刷新、或从别处又进）
   - 防重：用 source + source_id 查，要么列不存在（又报错被吞），要么这条费用没有 source/source_id（查不到）。
   - 结果再次执行 insert → **第二条费用**。

3. **重复次数**：每多点一次或批量里重复 id，就多插一条，因为没有任何「按 reference_no 或 source_id 只保留一条」的兜底。

---

## 六、正确流程应该是什么样

1. 用户对某条 **pending** 报销点击「Mark as Paid」并提交。
2. 后端 **先** `UPDATE worker_reimbursements SET status='paid', paid_at=now() WHERE id=?`，且必须按 id 成功更新（找不到则 400）。
3. **再** 创建费用：
   - 先防重：有 source/source_id 则按 `(source, source_id)` 查；**无论有没有这两列，都再按 reference_no = `REIM-${reimbursementId}` 查一次**。
   - 若已存在任一条则直接返回该费用，**不插入**。
   - 若不存在才 insert 一条 expenses + 一条 expense_lines，并尽量写上 source、source_id、reference_no、status='paid'；fallback 时至少保证 reference_no 一致，便于下次防重。
4. 返回 200，前端 `load()` 刷新列表；列表只含 pending，该条已 paid 会消失。
5. 同一笔报销无论点多少次「Mark as Paid」，费用表里**至多一条**对应 `REIM-${id}` 或 (source, source_id)。

---

## 七、修复计划（不重新设计系统）

1. **防重兜底（必做）**  
   在 `createExpenseFromPaidReimbursement` 里，在「按 source/source_id 查」之后（无论是否查到），**再查一次**：  
   `reference_no = 'REIM-${reimbursementId}'`。  
   若查到已有费用，直接返回该记录，不插入。这样即使没有 source/source_id 或历史数据没这两列，也不会重复建费用。

2. **Fallback 插入仍写 source/source_id（可选但建议）**  
   在 noSource/minimal 等 fallback 里，若当前环境有 source、source_id 列，则继续带上；若插入报错再去掉。这样新环境迁移后不会产生新的“无 source”数据。  
   （若为少改代码，可只做 reference_no 防重，不强制改 fallback。）

3. **保证 reference_no 一致**  
   所有插入路径（含 fallback）都已使用 `reference_no = REIM-${reimbursementId}`，无需再改。

4. **迁移与状态**  
   确保生产跑过 `202604141000_expenses_source_source_id_paid.sql`，这样新数据会有 source/source_id，防重更稳；旧数据靠 reference_no 兜底。

5. **不改 UI、不改流程**  
   不增加新接口、不改变「先更新报销再创建费用」的顺序，只修防重与更新逻辑。

按上述步骤实施后，可以解决：付款状态不更新、同一报销重复生成费用、以及“付款没成功”的体感问题。

---

## 八、已实施的修复

1. **报销状态必更新**（`worker-reimbursements-db.ts`）  
   `markReimbursementPaid` 已改为仅按 `id` 更新，不再带 `status in ('pending','approved')`，避免 0 行更新导致状态仍为 pending。

2. **防重复创建费用**（`expenses-db.ts`）  
   在 `createExpenseFromPaidReimbursement` 中增加**按 reference_no 兜底**：
   - 先按 `source = 'worker_reimbursement'` 且 `source_id = reimbursementId` 查；
   - 若未查到，再按 `reference_no = 'REIM-${reimbursementId}'` 查；
   - 任一步查到已存在费用则直接返回该费用，不插入。  
     这样即使未跑 source/source_id 迁移或历史数据无 source，同一报销也只会对应一条费用。
