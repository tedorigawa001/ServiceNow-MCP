# RC-02：release純粋比較・policy整合・非実行draftの合成検証

Date: 2026-11-01 / Baseline: `439c4ec`。ローカルの合成依存・固定値だけを使用する。

## 1 範囲と維持する停止境界

[設計draft-0.3](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARATOR_DESIGN.md)のRC-02を、`src/servicenow/review-kernel/release-comparison.ts`に実装した。`compareRelease(unknown)`は入力構造のcopy／freeze、policy自己整合、固定順の観測比較、limitations、非実行draft生成だけを行う。RC-01の構造parserの公開意味は変更しない。

既存BoundedUpdateSetSource、設定pin、認証・単一会計、private Permit block、legacy非200 catch、MCP入口は変更しない。旧試験・旧case対応表の分類／件数も保持する。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、実Permit発行・実接続・実通信・実機操作・設定変更・Pushは対象外。

## 2 独立oracleとRED／GREEN

新規`tests/review/release-comparison.test.ts`の70件は既存sourceや設定pinの返値を期待値に使わない。固定family一覧・policy境界表・期待するevidence全体・limitations配列を試験側に書き、旧関数との比較だけをoracleにしない。

1. 実測Australiaのtrim／case保持と非実行draftを先に追加し、未実装関数の失敗を確認して最小生成を実装。
2. 未来asserted_at、同一／逆転validity、issue欠落・付替えの9ケースで拒否されないREDを確認し、policy整合を追加。
3. 空／全空欄、一部欠落、未知family、有効21行、invalid_observationの優先表でREDを確認し、順序を追加。
4. 有効設定による空値の代替、expired／insufficient、開始＋deadlineの等号／+1ms、binding不一致最優先のREDを確認し、代替と正確なwarning順を追加。
5. 観測5family×設定5familyの25組合せ、使用不可設定も含む競合、初出順の重複除去でREDを確認して競合処理を追加。後から不要なconfig warningを競合へ足さない。

TDD途中の失敗は実装前の期待されたREDである。優先表の実装確認中に次のfallbackケースを同じファイルへ追記したため、確認runは旧23件成功＋新11件REDとして収集された。完了確認はその後の停止済みrunの出力を読んでから行い、最終99件のまとめ直しも実施した。

追加の固定表では、正常20行／有効21行sentinel／不正22行の区別、有効21行でもrow不正ならinvalid_inputになること、設定ではinvalid観測を救済しないことを確認する。getter／Proxy実行0、権限形／status形の混入、draft JSONの再入力拒否、Date.now非使用、入力不変、全階層fresh freezeも確認する。

## 3 policy・出力の具体的な保証と限界

- policyは元runのstarted_atとdeadline_msだけで整合を導く。binding不一致、expired、validity不足、issueなしの順。期限の等号は不足、1ms超過はこの判定では有効。未来asserted_at・逆転期間はordinary unknownでなくinvalid_input。
- 実測値に期限切れの同family設定があれば実測＋対応issueを返す。familyが違えば、設定が代替に使えなくてもconflictを保持し、そのlimitationsは`release_evidence_conflict, release_unknown`だけ。
- 21行→空欄→未知→競合の優先順を維持する。実測raw値は最初のtrim済みcase、conflictのfamily配列は初出順。未知raw文字列や例外本文は出力しない。
- draftはok=trueでも権限4項目がfalseで、Permit／source／lease／consumer／採用tokenはない。入力を新規copyしてから計算するため、外部の元入力・反復結果間に可変参照を共有しない。ordinary unknown／mismatchedと不正引数を分ける。
- 設定asserted_at／expires_atの長さ上限は承認待ち。両方に1,000桁の小数秒を与えた試験で元文字列の保持を確認し、上限追加・丸め・再整形を行わない。Date.parseによる値比較の精度は既存pinと同じで、新たな高精度時計の証明ではない。
- observed_at≧started_atや現在時刻による期限判定を追加しない。生成ownerの同session／source結合、pre/post guard、外側のclockや取消／cleanupはRC-03以降の未接続責務で、draftから成功を推定しない。

## 4 検証結果

| 検証 | 結果 |
|---|---|
| RC-02新規＋RC-01構造／family | 3ファイル99件成功（新規70件） |
| build | 成功 |
| 新規／既存RC unitとcompile-only type fixtureのstandalone TypeScript | エラー0 |
| 旧release／設定代替／private snapshot／固定bootstrapとの関連回帰 | 新規・RC-01を含む7ファイル207件成功 |
| compiled／オフライン梱包 | 成功。425ファイル。RC-01／02と既存compiled fixtureの確認成功 |
| 全体合成テスト | maxWorkers=3で単独実行。224ファイル／9,870件成功、失敗0、pending 0、約105.2秒 |
| 更新6文書のローカル参照 | 86リンクの参照先存在を確認 |
| whitespace差分 | `git -c core.fsmonitor=false diff --check`成功 |

compiled fixtureは、期限切れ設定との競合・warning順・issue欠落拒否・21行sentinel・非実行権限・fresh frozen dataを生成JSで確認する。梱包AST検査はruntime importをzod／node:util／familyに限定し、dynamic import・require・root re-exportと、直接のDate現在時計／fetch／timer呼出しを拒否する。純粋moduleの検証であり、B-03の別assembly compiled保証や実sourceの生成元証拠の代替ではない。

全体実行：`npm test -- --maxWorkers=3 --reporter=json --outputFile=/tmp/servicenow-rc02-tests-20261101.json`。製品・試験の期限値は変更せず、ビルド／他試験と重ねず実行した。通常の並列数での再実行は今回行っていないため、RC-01で記録した初回16件失敗の解消を主張しない。JSONはローカル一時成果物で、恒久的な結果集計は本書に保持する。

## 5 残課題

RC-03の実／開発source採用点を別々に設計・接続し、生成元・pre/post guard・単一停止owner・上位診断保持と、既存private Permit block不変を確認する。legacy非200 catchは別の移行課題で、本pure inputにHTTP失敗を足してfallbackを有効化しない。

設定日時長の承認、全入力byte／work上界、壁時計逆行と上位結果時刻の整合は未完了。旧case対応表の未代替実class保証を閉じず、固定評価セットや本試行の品質主張も変更しない。通常並列の初回16件失敗は[RC-01記録](E2E_BEST_PRACTICE_RELEASE_CONTRACT_RC01_2026-11-01.md)に保持し、本変更で再発解消済みとはしない。

## 6 コミット対象限定の再検証

RC-02の11ファイルだけをindexへ登録し、index全体を`/tmp/servicenow-rc02-commit-20261101/`へ書き出した。依存は既存node_modulesへの参照を使用し、distはこのコピーで新規buildした。無関係な未追跡`.vscode/`・`CLAUDE.md`がコピーに存在しないことも確認した。

- `npm run build`：成功。
- RC-02／RC-01のunitとcompile-only type fixtureのstandalone TypeScript：エラー0。
- `node tests/review/package-http-classification.mjs`：425ファイル、RC-01／02と既存compiled fixture・梱包境界の確認成功。
- 更新6文書のローカル参照：86リンクの参照先存在を確認。
- `npm test -- --maxWorkers=3 --reporter=json --outputFile=/tmp/servicenow-rc02-commit-tests-20261101.json`：224ファイル／9,870件成功、失敗0、pending 0、約56.7秒。全test fileがこの検証用コピーから収集されたことをJSONで確認した。全体テストは他のビルド／試験と重ねず、期限値は変更していない。

再検証後の変更は本節の記録のみで、実装・テスト条件は変更していない。RC-01の初回16件失敗と未確認事項は保持し、この成功を通常並列の再発解消・実source採用・実Permit結合の完了とは扱わない。
