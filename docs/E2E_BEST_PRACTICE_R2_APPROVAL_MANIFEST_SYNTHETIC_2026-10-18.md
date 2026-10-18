# BP-5 R-2：承認manifestのスキーマ・安全な読込の合成検証

Date: 2026-10-18 / Result: 合成試験PASS / 実機: 未実施

## 1. 範囲

[runner接続設計§13](BEST_PRACTICE_BP5_R2_PDI_ADAPTER_RUNNER_DESIGN.md)に従い、
非秘密の承認manifest契約とオフライン読込器だけを実装した。
telemetry調査・maint担当者への依頼は保留。PDI接続、実token発行、登録/ロール/ACL/設定変更はしていない。
実manifestの作成・配置や人の承認照合もしていない。fixtureは合成値を使う一時ファイルで、終了時に削除した。

## 2. 実装

- `src/review/r2-approval-manifest.ts`：`bp5-r2-approval-0.1`のstrict Zod契約、draft-7 JSON Schema、
  `loadR2ApprovalManifest`、一度限りの非同期consumer、固定失敗code。
- `src/servicenow/trusted-config-file.ts`：既存の信頼済みPOSIX読込に、上限値・hardlink拒否・重複キー拒否を
  opt-inとして追加。既存設定の既定上限1MiBと重複キーの扱いは維持。
- `tests/review/r2-approval-manifest.test.ts`：61件。
- `tests/servicenow/trusted-config-file.test.ts`：9件（既存7件と既定動作/文字列tokenizationの回帰2件）。

承認参照・専用接続slot/HTTPS origin/binding・固定callback・専用client/本人ID/Update Set・scope・
C方式設定snapshot・review条件を明示する。token、client secret、任意query/module/未知fieldは拒否。
別ファイルのC設定参照を設けず、manifest内にコピーして整合性とファイル信頼性を同時に検証する。

## 3. 確認項目

| 区分 | 合成試験で確認したこと |
|---|---|
| 正常/構造 | strict JSON Schema、オフライン読込、deep-freeze、consumerへ1回だけ引渡し、再消費拒否、ネットワーク呼出しなし |
| 所有者 | process UIDの信頼済みテスト境界で不一致を模擬して拒否。実ファイルの所有者変更はしていない |
| mode/祖先 | 0644/0640/0620/0666/0700を拒否し自動修復なし、書込可能な親を拒否 |
| symlink等 | leaf/親symlink・hardlink・ディレクトリ・未存在・相対/非正規pathを拒否 |
| データ量/JSON | 64KiB等値受理/+1拒否、JSON構文/UTF-8不正、top/nested/Unicode escapeの重複キー拒否。文字列値中の構造らしい文字は誤検知しない |
| 承認/C方式期限 | 期限切れ・将来日時を拒否。検査時刻+385秒の等値を拒否し、それを超える余裕を必要とする |
| binding | manifest/C設定slot・接続origin・各hash・対象Update Set整合性を検査。canonical origin以外を拒否 |
| 消費直前 | ファイルを安全に再読込。内容の意味変更、permission変更、期限/余裕不足、時計巻戻り/非有限値ならconsumerを呼ばない |
| 失敗/非出力 | 同期例外・非同期rejectを固定理由へ変換し、生例外/値/path/戻り値を返さない。status/JSON/inspect/stdout/stderrに合成の識別値・秘密マーカーを出さない |
| 実測のみ | C assertion省略時も専用slotを保持し受理。ただし実測/`matched`を生成せず、後段release gateを代替しない |
| 既存互換 | opt-inなしの読込は64KiB超の既存上限内JSON/従来の重複キーを受理。既存評価/JSON契約/worker試験も全体試験に含めた |

実行環境はmacOS。Linux/getfacl・Windowsの実OSでの検証ではない。
ACLの固定コマンド/前後照合は既存読込器を利用し、ACL判定の既存合成試験も再実行した。
一時fixture以外のpermission/ACL/設定には触れていない。

TDDでは、読込器未実装、期限、binding、hardlink/サイズ/重複キー、消費直前の再検証、
非同期consumer失敗の各段階で失敗を確認してから実装した。

## 4. 実行結果

| コマンド | 結果 |
|---|---|
| `bdo npm test -- tests/review/r2-approval-manifest.test.ts tests/servicenow/trusted-config-file.test.ts` | 2ファイル、70件PASS |
| `bdo npm test -- --maxWorkers=2` | 108ファイル、2,784件PASS |
| `bdo npm run type-check` | PASS |
| `bdo npm run lint` | エラー0、既存警告374 |
| `bdo npx eslint src/review/r2-approval-manifest.ts src/servicenow/trusted-config-file.ts tests/review/r2-approval-manifest.test.ts tests/servicenow/trusted-config-file.test.ts` | エラー/警告0 |
| `bdo npm run test:pack` | build・361ファイル梱包・production-only導入・解析/集約worker・MCP smoke PASS。R-2非同梱を維持 |
| `bdo git diff --check` | PASS |

梱包の初回はsandbox内のnpm cache書込でEPERM。ファイル所有者の修復や設定変更を行わず、
sandbox外で同じローカル梱包検証を再実行してPASS。npm公開ではない。

## 5. 未実装・確認限界

- manifestとlistener/session/SDK/runnerの接続、check-plan CLI、OS signal・385秒全体監督・終了票は未実装。
  consumerの停止/監督は後続runnerで行う。今回の非同期API自体はconsumerの実行期限を保証しない。
- SHA-256比較は最初の検証済み内容からの意味変更検出であり、署名・承認者認証ではない。
  ファイル読込成功だけで人の承認・実行権限・scope/本人性・release matchedを主張しない。
- 読込時と消費直前の時刻を検査するが、信頼済み時計・同一UID/管理者侵害・あらゆるOS競合の防御は保証しない。
  一度消費したsnapshotは固定し、稼働中のファイル変更/取消を自動監視する仕組みはない。
- consumerのコピー、JS/OSメモリの完全消去、実機tokenの失効は保証しない。
- 実PDI/権限・Public Client/S256/loopback・本人操作・実manifest配置の承認は別途必要。
  今回の結果をG2/G4や実機E2Eの完了に数えない。telemetry調査を再開しない。
