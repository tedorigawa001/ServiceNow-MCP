# BP-5 R-2 OL-03：現行collectorの純粋resource数量モデル・合成検証

Date: 2026-10-21 / Scope: private Rust scalar算術・合成source。OS/PDI/実署名のE2Eではない。

## 1. 実装subsetと停止状態

[3round resource台帳設計](BEST_PRACTICE_BP5_R2_OL03_THREE_ROUND_RESOURCE_LEDGER_DESIGN.md)の最初の段階として、`scan_ops/resource_model.rs` と純粋算術/実source traceの合成テストを追加した。初版の固定IDは `bp5-r2-scan-resource-0.1`、後続§7でxattr前提を結合した0.2へ改版。callee modelは独立literalで現行collectorのIDと照合する。旧scan_workの仮定係数を呼び出さず、現行の実処理から式を導いた。

raw ShapeはE/F/D/h/K/C/Lのscalarだけ。domain/checked算術は検査するが、受理済みindex・個別file制約・receipt/roundの由来を証明しない。数量は非Clone/非serdeでopaque Debug。保護されたprofile/binding、session内部型・生成claim、実台帳、cap/予約/permitへの変換口は未実装である。運用上の上限を新設・増額しない。

全体受付無効、telemetry保留、APPROVED_REGISTRY=None、通常v2 Unavailable、gate92、DER/absence停止を維持。bridgeと通常strictのruntime経路は変更していない。

## 2. 現行操作式と小fixture

T=D+1、W=2E+3、A=W(h+1)+2Kとして、open O=A+T+E、snapshot M=A+E+2T+2F+1。各snapshotはMetadata9回（ACL init込み）とACL cleanup1回を使う。列挙時のchild open/snapshot・cursor/親事後snapshot・file bind/EOF後の追加snapshot・保持rootの最終snapshotを含める。

| 分類 | 通常成功の上界 | 基本fixture |
|---|---|---:|
| Open | O | 63 |
| Enum | E+3T | 14 |
| Read | C+F | 6 |
| Metadata | 9M | 657 |
| Cleanup | O+M | 136 |
| 合計 | sum(base) | 876 |

基本fixtureはE5/F3/D2/h2/K8/C3、O63/M73。shapeのLはvirtual indexを含み、fixture設定により変わる。純粋unit試験では数量式の検査用にL=4590を使用する。実collector照合では各fixtureの宣言から毎回Lを集計し、固定値4590を実データとして渡していない。

r=8のround分類別上界 `[63,15,15,657,136]`、3round分類別 `[189,43,27,1971,408]`、独立総上界885/2637。Enum/Readの最後の異常試行は同じ実行で両方発生しないので、分類別上界の和は総上界より1大きい。retry残rは3roundへ一度だけ加算する。round枠はr全部を1roundへ集中できる値を持つが、sessionへrを3倍付与しないという設計§5.1を維持する。

初版のxattrはsnapshotあたり最大65536の容量積だったが、§7で成功prefix最大21 byteと全体停止を前提に引き締めた。enum output capacityは試行あたり255、payloadは3(L+F)の保守量を維持。enumの値を実コピーbytesと呼ばず、xattr台帳へ混ぜない。scan内peak owner5は3roundでも15へ加算せず、外側owner・OS FD・memoryの承認と分ける。

## 3. 新規10テスト

- 純粋計算7件：基本数量/固定9 work、独立u128 oracleの3 shape×retry0〜8、不正shape/未知model、checked overflow、全不足work残0〜8、9課金点の取消、9行終端の期限と先行sticky理由。
- collector照合3件：10 shape×3roundのsource traceを分類しbaseと比較、876の操作位置への失敗/cleanup不明/取消/期限注入と16拒否条件・data/EOFのretry0/1/8/9を上界と比較、合法EINTR1回を共有する3roundの実消費/既存AfterScan/FinalIndexを確認。

3roundの実試行は2629=3×876+1で、同startと共有retry残7を維持。台帳を実装した試験ではなく、既存kernel_for_test・round別の合成quotaで実行したsource traceと純粋数量の照合である。capsの累積強制やsession one-shotを検証済みとはしない。traceは合成pathを含むtest内部のみで、製品の出力経路を追加しない。

すべての成功handleで一度だけの解放とlive空を確認する。失敗注入には指定位置が対象種別と違って発火しない場合もあり、その成功経路も数量内に入ることを確認する。全OS応答/最大N/全raw ABIに対する証明ではない。

## 4. 費用と初回失敗の切り分け

算術は9行（model/domain/walk/snapshot/base/round/three/bytes/publication）へ元SharedBudgetのworkを1ずつ課金。各行の前後/終端で停止を検査し、work/payload/予約/retryを再発行しない。分類処理は固定5要素だけを走査する。collector側のS1902やbridge1910・準備込み1991を変えておらず、将来接続時はこの9をO側へ別計上する。shape統計を収集する費用はまだ含まない。

最初のwide/deep照合は既存fixtureの通常quota各分類10000でLimitになった。診断時の実消費 `[920,142,95,10000,2031]` によりmetadata枠での停止と確認した。上界式を緩めず、既存work_accountingのwide/deep試験と同じrun_with_audit入口（test専用の既存quota）で照合するよう変更し、10 shape×3roundが成功した。製品のquota判定や上限・期限を変更したものではない。

## 5. 再現コマンド・結果

```sh
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml resource_
bdo cargo test --offline --locked --manifest-path native/r2-outer/Cargo.toml
bdo cargo clippy --offline --locked --manifest-path native/r2-outer/Cargo.toml --all-targets -- -D warnings
bdo cargo build --offline --locked --release --manifest-path native/r2-outer/Cargo.toml
bdo cargo fmt --manifest-path native/r2-outer/Cargo.toml -- --check
bdo git -c core.fsmonitor=false diff --check
```

初版結果：全体750テスト成功（従来740＋新規10、5 suites、9.72秒）。Clippy全targets警告禁止、release build、rustfmt check、diff check成功。resource_フィルターは18テスト成功で、既存8を含むため新規10と混同しない。更新5文書の相対リンク先62件、fence対応・末尾改行・末尾空白を確認した（節anchorの自動照合ではない）。後続xattr改版の結果は§7に分ける。npm全体・OS source・PDI・実署名の試験は再実行していない。

## 6. 残課題

protected profile/receipt/budget/roundへの数量結合・統計収集費、session唯一生成claimと状態遷移、round/session累積枠・cleanup予約の実強制、外側owner・管理allocation・運用cap承認、strict acknowledgementとcleanup証拠の通常経路伝播は未対応。数値が算出できても実closureの受付可能性は保証しない。

OS接続・実機操作・token発行・設定変更・permit発行は行っていない。telemetry調査も再開していない。

## 7. xattr上界の引締め・resource-0.2

成功names一覧は空またはNUL込み21 byteだけで、その他は同snapshot内でsticky停止し次のNamesReadを行わない。この前提で `Q(N)=21(N−1)+65536` とし、roundはQ(M)、3round全体はQ(3M)。M73で67,048/70,114 byte、M137,538でround 2,953,813 byte。capacity検査に使う最大64KiB自体は変更しない。

許可一覧をnormalizerが使う定数へ集約し、数量モデルはpolicy ID・文字列全体・最大capacityを独立の固定値と照合する。許可名追加/上限拡大/未知名後の継続や再scanを認めるならpolicy/数量modelの再審査・改版が必要。resource-0.2は旧0.1をUnavailableで拒否する。算術9 work、collectorの受理条件と操作数は維持した。

追加2テスト：QのN=0/1/73/137538/MAX・checked overflow・policy/文字列/capacity変更拒否・旧model拒否、実normalizerで成功prefix0/1/72件後の未知64KiB一覧コピー。capがQちょうどなら最後までコピーしてMetadataで止まり、Q−1なら最後のコピー前にLimit。両方で次snapshotのsource操作は0、使用量/cleanup証拠を保持する。既存wide u128 oracleにもQ(M)/Q(3M)の照合を追加。

初回はprefix72件が小fixtureのmetadata100回枠でLimitになったため、その試験だけsnapshot数×9の既存合成枠を設定した。製品枠は変更していない。未知名を受理して継続する変異を一時適用すると新しい実normalizer試験が失敗し、sticky拒否を復元して再実行した。

改版後の最終結果：全体752テスト成功（前段750＋追加2、5 suites、10.84秒）。release build、Clippy全targets警告禁止、rustfmt check、diff check成功。session台帳/cap強制・通常strict接続・全体受付は未対応のまま。
