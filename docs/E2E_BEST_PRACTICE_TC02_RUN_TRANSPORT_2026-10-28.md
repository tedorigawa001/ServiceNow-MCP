# TC-02：共通run lifecycle・単一fake会計・typed cleanup接続の合成検証

Date: 2026-10-28 / 対象：[接続設計draft-0.3 §11](BEST_PRACTICE_ABORT_SCOPE_RUN_TRANSPORT_CLEANUP_DESIGN.md)。

## 1. 対象と境界

- [開発専用composition](../src/review/abort-scope-evidence-run-transport.ts)で既存のrun lifecycleをfake session／snapshot／readonly leaseに結合し、TC-01分類器のprivate handleを同じclosureからだけ使用する。
- C/G/P・origin／last／hardは単一private state。既存sessionのstatsを取り込む再登録や、readonly leaseを更新portへcastする処理はない。productionのbounded-read／lifecycle／fixture registryは変更しない。
- fake dispatch／abort／worker-stopとfake clockだけを注入。URL・token・本文・raw Errorは依存へ渡さず、Promise、Response、Web Streams、実Worker、タイマーを起動しない。
- 実sessionの会計更新・実transport・実機操作・トークン発行・設定変更は対象外。正式証拠・seal・finding・選択payload receiptの発行は0で、`evidence_issuance=disabled`を維持する。

## 2. 合成テスト：51件

[run-transport-cleanup.test.ts](../tests/review/run-transport-cleanup.test.ts)を通して確認した。

| 分類 | 確認した振舞い |
|---|---|
| 唯一の生成 | laneを生成時に固定、transport claimを依存呼出前に消費、二重claim・失敗後再準備・再入・legacy混用拒否 |
| 単一会計 | fake dispatch直前にCを1回、同attemptと連番でG/Sを1回、confirmed EOF後のモデル受理／discardでPを1回 |
| 独立oracle | 4 dispatch、chunk列1+2+3+4、UTF-8 payload 4byteから製品計数器を使わず期待値を決定。C=4、G=10、P=4。normal→finalで継続 |
| 上限 | 下げたC/G/S/P、G等号／1超過、超過chunk課金保持、G優先、単体P局所拒否と累計P全体停止、上限引上げ・未知設定拒否 |
| 再利用 | duplicate chunk sequence・外国attempt・並列開始・P二重受理・discard後受理・未消費Pでのfinish拒否。新sequenceで同じbyte objectを受けた場合は別fakeイベントとして加算 |
| 停止 | dispatch同期throw・callback取消でもC保持。revokeがabortより前。兄弟worker停止要求は最大1回。先行取消／認証／権限／予算診断保持 |
| cleanup | 開始失敗後もprivate current slotから観測可能。confirmed要求だけを受けず、HTTP／worker独立の終端票・固定理由を消費。未消費started resourceはunconfirmed |
| 時計 | 同じorigin／hard、終了観測の期限直前・等号・超過、dispatch後の期限超過、逆行／NaN／例外／値復旧。古いlastでcleanupをconfirmedにしない |
| 線形化・秘密 | native typed-array長を使い、caller getterで課金sectionへ割り込ませない。閉鎖後の遅着で診断不変。固定理由のみ、opaque handle、readonly view、秘密／adoption口の非露出 |

### TDDで確認したRED→GREEN

未実装moduleを参照する最初の試験をREDとした後、以下を一つずつ追加して失敗を観測し、その都度実装してGREENへ戻した。

1. 同期dispatch失敗でhandleを返せなくても、固定current slotからcleanupする入口。
2. fake dispatchが時計を進めた場合のpost-dispatch期限検査。
3. worker終端の接続と二軸の分離。
4. confirmed EOF後のモデルP受理・一度限りの課金。
5. 未消費P枠が残るfinishの拒否。
6. 元の会計・時計を維持する一方向final移行。
7. 時計の逆行／例外／非有限値で、古いlastを使ったHTTP confirmedが誤って成立した3件を再現し、観測失敗を分類器へ渡すよう修正。
8. HTTP／workerの固定cleanup reasonを上位primaryと並べて保持。
9. caller定義のbyteLength getterで取消・偽byte数が採用される再現を追加し、native内部長の一度だけの取得へ変更。

これらはTC-02開発途中の合成失敗であり、実transportでの不具合再現や本番適用ではない。

## 3. 検証コマンドと結果

| 検証 | 結果 |
|---|---|
| `bdo proxy node node_modules/vitest/vitest.mjs run tests/review/run-transport-cleanup.test.ts` | 1 file／51件成功 |
| `bdo npm run build` | 成功 |
| `bdo proxy node node_modules/eslint/bin/eslint.js src/review/abort-scope-evidence-run-transport.ts tests/review/run-transport-cleanup.test.ts` | エラー・警告なし |
| 全体合成テスト `--maxWorkers=3` | 166 files／4,915件成功、27.94秒。スキップなし |
| production-only梱包テスト | 377 files、production-only install＋解析＋集約成功。既存の`!dist/review/abort-scope-evidence*`除外でTC-02も非同梱 |
| 文書確認 | 変更対象5MDの相対リンク48件、参照先欠落なし。`git diff --check`成功 |

全体試験のローカルHTTP待受は合成fixtureのみ。PDIや実transportへ接続しない。中間コード（追加試験50件時点）の全体実行は166 files／4,914件成功、28.65秒だったが、最終コードの結果と区別する。

## 4. 未対応・次工程

- 今回は**同fake sessionでの接続**であり、実BoundedReadSessionのmutable会計port・lane選択・ReleasePermit／選択payload／worker jobへの正式bindingは未接続。
- descriptorの用途名／ordinalは合成ラベル。認証ready・source／planの前提、論理GET重複排除、retry受付、E／R／T動的予約、50/55秒のphase cutoffはまだ検証していない。C/G/Pに別会計を混ぜて未導出項目を確認済みにしない。
- Pのfake受理文字列と実chunkの本文同一性・UTF-8／JSON decode・版照合を証明しない。body／payload受領物は出力しない。
- `status`は最後に観測した時計のview。fake成功は実OSでの強制終了・解放・制御work／allocation上限の証明ではない。
- 次はTC-03：注入Web Streamsのread・cancel・closed・releaseLockから同attemptのtyped終端へ接続。実fetchは使わず、正式発行口は閉じたまま。

Unknown・全体受付無効、VM／監視／telemetry調査保留を維持する。

その後のレビューで、1応答上限（S）超過を`invalid_response`で停止していた点を、本番`bounded-read`（S／G超過とも`receive_budget_exceeded`で全体停止）と同じコードへ揃えた。該当試験の期待値を更新してprimaryも確認し、本試験51件・全体試験が成功した。
