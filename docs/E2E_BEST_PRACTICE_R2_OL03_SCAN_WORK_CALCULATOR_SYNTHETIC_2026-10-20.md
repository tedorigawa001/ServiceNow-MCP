# BP-5 R-2 OL-03：scan shape・操作数・work計算器の合成検証

Date: 2026-10-20 / Scope: ローカル純粋算術・fake clockのみ。collector/PDI/native E2Eではない。

## 1. 実装範囲

[scan設計draft-0.2 §11](BEST_PRACTICE_BP5_R2_OL03_BOUNDED_SCAN_COLLECTOR_DESIGN.md#11-純粋な計算器の先行実装collector未接続)の内部計算器を追加した。通常strict pipelineへはmodule宣言だけを追加し、呼出し・source・MCP登録・work予約は接続していない。

固定IDは `bp5-r2-scan-work-0.1`。F/D/P/h/index bytes/L/Cを防御的な量のenvelopeで検査し、operation histogram・費目別work・payload/name copy上界をchecked算術で計算する。元共有retry残を読み取り、3scanで一度だけ加算する。結果は数量であり、宣言/root/実観測の信頼証拠ではない。

計算自体12 work、require1、quantity-only cap helper2を元共有予算へ課金する。collectorの予定固定16/metadata18の実計数を行ったわけではない。cap helper成功も全体受付・実行authorityではない。

## 2. 追加13件の試験

| 試験 | 確認内容 |
|---|---|
| 小例・費目 | E5/F'3/T3/K8/W12/Owalk52/O55/M61/H12/Qenum15、primitive base741、cleanup116。work base1362、共有r8で1round1378・3round4102 |
| shared retry | 元r=0〜8、3scanではworkへ2r・primitiveへrだけ加算。counterは消費/補充しない |
| schedule oracle | テスト専用の予定walk/metadata/enum/read/cleanup列挙と式を比較。collectorの実操作証明ではない |
| shape境界 | N100000/P6300063、h1/64、index1/65535/65536/65537/16MiB。zero-file算術例を有効宣言へ昇格しない |
| 不整合拒否 | 14種類の過大件数・path深さ・byte/chunk・file容量不整合をShape limit、共有予算境界側Limitへラッチ |
| bytes/chunks | 空file、1 byte file、index chunk跨ぎ、file512MiB、総量2GiBのenvelope |
| overflow/retry | add/mul/sumとshapeのoverflow、壊れた残retry9を内部Overflow/Retry limitとして区別 |
| model/binding | 空/未知/次版model、別budget、retry snapshot変化、test-only破損modelを拒否。guard1 work |
| cap | 4102ちょうど成功・4101不足・available100万超過拒否。helper2 work、予約0。spentを見ない数量比較であることも明示的に検証 |
| 共有work | 残12ちょうど成功・11不足・spent u64 overflow、既存HashMismatchの優先。resetなし |
| 中断 | 全計算clock点でDeadline/Cancelled。clock内の遅延cancelはcaller guardで捨てる。最終guard後の取消保証ではない |
| 大規模2例 | metadata127529/work2671628とmetadata39513/work905312を再現し、3scanは100万capで拒否 |
| 既存台帳 | 非0のspent/I/O/予約/metadata/cleanup/name/topologyとretry残3を保ち、2回計算でworkだけ24増加 |

最初の計算器12件の実行は成功した。台帳試験を追加した後の全体実行は**574成功（5 suites、7.17秒）**、Clippy（-D warnings）も問題なし。

### 感度検証

- 3scanのretry費を2rから6rへ一時変更すると、共有retry試験がr=1で4092対4088として失敗した。変更を復旧し、残8をroundごとに再発行しない条件を検証した。
- metadata係数を18から17へ一時変更すると、予定schedule interpreterとの比較が1378対1317で失敗した。変更を復旧した。この試験で候補係数の算術への反映は検証できるが、native collectorの実費18を証明するものではない。

復旧後の最終全体実行も**574成功（5 suites、8.52秒）**。release build、Clippy（-D warnings）、cargo fmtチェック、exec_probe fixtureのrustfmt、3文書のlocal link/fence/空白・小例/大規模2例の式、変異復旧・git diff --checkの検査も成功した。

## 3. 未対応・停止状態

protectedなshape producer、root/receipt/scope結合、単発source・bounded collector、native列挙ABI/buffering、係数16/18の実操作計数、scan専用quota、cleanup precharge/終了報告、clock/leaseは未実装・未確認。

APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止、telemetry保留、全体受付無効を維持する。実機操作・API実接続・token発行・設定変更・permit発行・Pushは行っていない。
