# RC3-D03：dispatch前binding不一致・release GET=0の合成検証

Date: 2026-11-01 / Baseline: `0f14dc4`。

## 1 範囲・非主張

package-excludedの開発assembly／固定200 transcript／合成sourceだけ。実source、session、ReleasePermit、transport、workerの正式bindingを有効化しない。正式発行口閉鎖・全体受付無効・Unknown・VM／監視／telemetry調査保留を維持する。実接続・実通信・実機操作・トークン発行・設定変更・Pushは行わない。

[RC-03設計draft-0.6 §13](BEST_PRACTICE_ABORT_SCOPE_RELEASE_ADOPTION_RC03_DESIGN.md)に従い、同context／source／leaseへclaim済みの条件ownerが親consume後、release dispatch前に一度だけ判断する。binding不一致と対応issueが整合すれば固定比較器へnot_requestedを渡し、release行のdispatch／受信／解析を省略する。空200やHTTP cleanup証拠を生成したと見なさない。

profileのstarted_at／observed_at／policyの3fieldとstrict copyは維持する。not_requestedでは観測時刻を比較入力へ渡さず、出力にも含めない。形式検査対象のobserved_atがあることは実測の証明ではない。binding値とissueの矛盾はclock／I/O前のinvalid_inputを維持する。D01試験1件の期待を、承認された整合不一致ではなく、引き続き拒否する「不一致なのにissueなし」へ変更した。反対の矛盾（同bindingなのにmismatch issue）と他の旧試験は維持する。

## 2 変更箇所と所有権

- [条件owner](../tests/support/review/ef03/release-conditions.ts)：claimed→decidingをguard前に消費。同identity・ready世代・親受理・release未開始を検査し、normalはrequested、mismatchは固定比較／source終端後にcompared。pre/post guard、失敗後再開拒否、takeForCloseを維持する。
- [同realm source](../tests/support/review/ef03/source.ts)：専用のfinishUnrequestedはarmed・未発行ack・親1／release0・同contextを要求。release→consuming→doneの前後guardを確認し、release consumeを増やさない。公開summaryから呼べる権限は渡さない。
- [固定transcript](../tests/support/review/ef03/bootstrap.ts)：release行のobserve／C計上より前に判断し、falseならdelivery／chunk／projectionなし。スキップした固定bytesも既存disposeで消去する。
- [root](../tests/support/review/ef03/assembly.ts)：source値経路とtranscript経路が同owner判断を利用する。final4予約・返却・同canonical会計は既存ownerに残す。cleanup／seal後だけ非実行summaryを返す。

既存bootstrapのrelease_attemptsは**予約返却試行**でありrelease GET回数ではない。release GET=0は、親consume=1、release consume=0、総dispatch/Cが認証＋親だけ、Gがそのbody bytesだけ、P=0、およびrelease用throw／不正bytesが実行・解析されないことを対にして確認する。

## 3 合成試験・独立oracle

[新規試験](../tests/review/development-release-no-request.test.ts)は28件。比較器をmockせず、独立した固定期待値と既存の合成時間／I/O境界で確認する。

| 境界 | 期待と観測 |
|---|---|
| tracer／per-user／cached | 親1試行のみ、G=親bytes長、P=0、release0、final4 peak=4→0、返却1回 |
| exchange | 認証＋親2試行のみ、G=両bytes合計、release0。模擬token／binding／観測時刻を出力しない |
| source値profile | 不正なrelease行projectionを呼ばずrelease0・unknown／config_binding_mismatch。同profile pinは省略しない |
| 認証／親不正・取消 | 対応する既存primaryで停止、取得済み会計を保持し予約返却。非実行summaryを出さない |
| 決定の順序・one-shot | 親前／二重判断／二重transfer・比較経路への迂回・caught reentryを拒否。失敗後再開しない |
| 混入・失効 | 別context／sourceを拒否し他ownerは継続可。同source終端中のowner／source revokeを拒否 |
| guard3位置 | pre／比較後／source完了後の取消／期限理由を保持し、未公開候補を破棄 |
| request／G境界 | 親分しか余裕がなくてもreleaseを課金せず成功。親自体のG超過は課金後に停止し返却 |
| policy整合 | 不正な日時関係をbinding不一致で救済せず内部停止、release0 |
| 同bindingの連続200 | 空200のAustralia／Zurich設定代替、Australia実測一致、Zurich設定との競合の4ケースはrelease GET=1。独立したC/G値・limitations順序を確認 |
| successive run | 同rootの別runで独立予約／返却、active／registered／principal_keys=0へ復帰 |

初回tracerは開始前invalid_inputでRED（予約peak=0、親も取得しない）を確認した。最小のpre-dispatch分岐・同source終端を接続してGREEN。その後、停止・混入・上限・通常200連続caseを追加した。試験・製品の期限は緩めていない。

## 4 検証結果

| 検証 | 結果 |
|---|---|
| 新規＋既存development回帰 | 7ファイル／231件成功（新規28件） |
| standalone TypeScript | 新規・D01／D02試験・assemblyでエラー0 |
| `npm run build` | 成功 |
| オフライン梱包 | `node tests/review/package-http-classification.mjs`成功、425ファイル。既存compiled fixtureとD03専用入口の非同梱を確認 |
| 全体合成テスト | maxWorkers=1で227ファイル／9,974件成功、失敗0・pending 0、約200.9秒 |
| 差分・文書参照 | `git diff --check`成功。更新4文書のローカル参照59件が存在 |

全体実行：`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-rc3-d03-tests-20261101.json`。build／別testと重ねず単独実行した。JSONはローカル一時成果物で、恒久的な結果は本書へ記録する。直列での成功であり、通常並列の再発解消を主張しない。専用オフライン梱包だけを実行し、[D02記録](E2E_BEST_PRACTICE_RELEASE_ADOPTION_D02_2026-11-01.md)に残した補助package-workerのEPERM／依存取得ENOTFOUNDは再実行・解消したと主張しない。過去の初回失敗記録も変更しない。

コミット前確認：候補12ファイルを含むindex全体を一時ディレクトリへ書き出し、既存node_modulesだけを参照して再検証した。候補ファイルのbytes一致、無関係な`.vscode/`・`CLAUDE.md`の不在を確認。そこでbuild・関連7ファイル231件・standalone TypeScript・425ファイルのオフライン梱包がすべて成功した。この再確認では全体9,974件は再実行せず、上表の実装時の結果と区別する。検証後の追加はこの記録だけで、実装・試験内容を変更していない。

## 5 レビュー修正（2026-11-01）

条件ownerの`compare`は`requested`だけでなく`claimed`からも開始でき、`beforeRelease`のrelease要求判断を経ない比較が型上は可能だった（assemblyは常に`beforeRelease`を通すため実経路への影響はない）。開始状態を`requested`に限定した。D02単体試験のfixtureは親消費後に`beforeRelease`を呼ぶ形へ更新し、失敗後の再試行拒否の試験はsourceを直接完了させる形にして期待を緩めていない。`beforeRelease`を省いた比較が`invalid_state`で拒否される試験を1件追加した。関連3ファイル105件成功。変異確認として修正前のownerへ戻すと追加試験1件だけが失敗し、退避copyから復元して`cmp`で一致を確認した。§3・§4の件数は修正前の記録として残す。

## 6 残課題

Rの実source差替え・構築時readonly全deadline供給・実session／Permit binding・非200/native移行は未実装／未承認。B-03の旧case保証整理／開発assembly専用compiled保証、friend撤去・日時長cap・全体work／byte／同期解析上界も残す。今回のpackage内既存compiled fixture成功は、開発assemblyの専用compiled保証の代替ではない。

`0f14dc4`のcleanup後候補withheld処理を維持し、既存runのok／code／run_primaryをlate guardで書き換えない。値unknown／ok=trueもレビュー開始可能・実Permit・fallback承認を意味しない。
