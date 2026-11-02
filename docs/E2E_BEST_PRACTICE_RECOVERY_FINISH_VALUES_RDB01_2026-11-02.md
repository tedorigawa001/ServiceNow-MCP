# RD-B01 strict構造値型・bounded projection 合成検証

Date: 2026-11-02。Baseline: `3de5c53`（設計`99ac224`後の参照更新を含む）。対象はtests配下の純粋値層のみ。

## 1 実装範囲

[新値層](../tests/support/review/synthetic-recovery-finish-values.ts)で期待値／応答のstrict projectionを別Symbol brandに分けた。data containerをcopy・深くfreezeし、指定opaque参照はidentityを保持するだけで内部を読まない。型付き失敗はshape／limitを区別し、公開message／codeはinternal_review_errorに固定する。

各projectionはauthority:none／validation_scope:structure_onlyと固定unverified 6項目を返す。元結果本文・由来・context／集合・時刻整合・full schema・wire保証は確認済みにしない。比較結果は別brand型だけで、生成関数・比較処理はまだない。通常WJ-C・RA-01・回復ownerの実装は変更していない。

rootのexact keys、0.2／0.3 header、expected input／reviewed・omitted起源、応答reviewedの局所contextを[設計§11](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_VALUES_RDB_DESIGN.md)へ固定した。未知state・余分／不足項目・不正variantは拒否し、full worker resultのfindings／codeを黙って削除する処理は作らない。

## 2 RED・途中失敗・GREEN

最初のtracerは新moduleがないためimportで失敗し、試験本体は0件だった。module追加後、正常な構造projectionが成功した。strict型検査ではSymbol keyの値がstringへwidenされる2件のエラーを確認し、既存RA-01と同じliteral型の保持へ最小修正して再検査した。その後、missing／extra／variant・不正object・有限枠のケースを順に追加した。

## 3 合成検査

- 期待値と応答の別brand、比較結果型との非互換、copy／freeze、opaque identity維持と非freeze／非探索。
- root・nested header／input／reviewed context／omitted originの不足・余分項目、全7stateと不正reason／asset_typeの拒否。
- 0.2／0.3のstrict header、0.3 selectionとcoverageの必須列、0.2への余分selection拒否。
- accessor・Proxy／revoked Proxy・循環・symbol／prototype key・custom prototype・疎配列・配列accessor・非整数／不正UTCの拒否。caller getter／trapを実行しない。
- 最大100件と101件、object 30／31 key、深さ8／9、全体node 10,000／10,001の境界。
- queue方式の独立oracleでnodes／character_unitsを確認。keyと文字列のlength×3、同dataの出現ごとの課金を検証。
- 文字費262144の直下／超過と、record間の共有枠を検査。文字費は3単位刻みなので境界直下は262143以下、次の文字追加で超過する。
- operator_config日時へ新しいfield長capを足さず、既存ISO構造と局所総量だけを検査。期限有効性や壁時計比較はまだ行わない。
- 重複集合・時刻逆行・header不整合等が構造として読めても、matchesや比較成功を返さず未検証項目を保持する。空replyの集合一致も未検証。
- namespaceは2 projection・固定limits・固定error classのみ。seal／owner／job／候補／比較結果の生成口はない。

## 4 最終検証

| 検査 | 結果 |
| --- | --- |
| 新規`synthetic-recovery-finish-values.test.ts` | 134件成功 |
| 関連4ファイル | 484件成功、失敗0 |
| 通常WJ-C `synthetic-worker-finish.test.ts` | 82件成功、変更なし |
| 全体Vitest（maxWorkers=3） | 255ファイル・12,184件成功、失敗0・skip0、約35.7秒 |
| `npm run build` | 成功 |
| 新試験を入口にしたstrict TypeScript検査 | 成功 |
| 新値層・新試験・梱包scriptのESLint | 指摘0 |
| `node tests/review/package-http-classification.mjs` | 成功、441ファイル |

全体回帰はローカル待受可能な条件で、既存の製品／試験期限を変更せず実行した。外部サービス／PDIへの通信や実worker運用の検証ではない。梱包では新module／試験／型／kind／scopeの非同梱と、固定schema依存・I/O／clock／worker／runtime owner import混入の負の対照を確認した。

## 5 残課題と維持条件

RD-B02のscalar共有、RD-B03の集合／context／T_i・U・E比較と二入力共有枠、RD-B04の同accepted封印・RA-03-Bのsealed破棄接続は未実装。比較器への入力化・実finish job・候補・正常終端能力は発行しない。構造projectionを比較成功としてownerへ登録する口も作らない。

node／文字費は入力dataの局所collector指標であり、opaque graphの保持量、Zod内部copy、native ownKeys等の処理費やwire byteを測定していない。追加work／allocation・exact layout・全体上界・元本文保証はUnknownのまま。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持し、実接続・実通信・設定変更・Pushは行っていない。
