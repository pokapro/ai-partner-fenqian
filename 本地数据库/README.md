# 本地数据库

本目录用于 V0 内测阶段保存本地兜底数据。

- `app.db`：当前 V0 主数据库。服务默认从这里读取和写入案例、审核状态、付费/解锁申请。
- `local_cases_ledger.jsonl`：案例追加流水。用户提交、报告更新、后台审核、备注、申请状态变化都会追加写入。
- `cases_backup.json`、`versions/`、`daily/`：SQLite 的 JSON 备份，用于误删或异常时恢复。
- 服务启动和后台登录时会自动读取该流水，把缺失案例恢复到 SQLite。
- 以上文件包含用户联系方式和原始提交内容，不提交到 Git。

兼容说明：

- 旧版本曾把数据库写到 `$HOME/.fenqian-data/app.db` 或 `data/app.db`。
- 当前版本启动时会自动把旧库里的案例合并进 `本地数据库/app.db`。
- 后台可通过 `/api/admin/db-health` 查看当前数据库路径、案例数量、本地流水和备份状态。

后续迁移云端时，可将该 JSONL 流水导入 Supabase/Postgres 或其他云数据库。
