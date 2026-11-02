# RD-B03 回復finishの集合・context・時刻 局所比較検証

Date: 2026-11-02。Baseline: `fe7e296`。対象はtests配下の純粋値層と合成試験。runtime／通常WJ-C／RA-01／回復ownerの実装は変更していない。

## 1 実装した境界

[値層](../tests/support/review/synthetic-recovery-finish-values.ts)に`compareRecoveryFinishValues(rawExpectation, rawReply)`を追加。期待値と応答を同じBudgetで順にcollect／strict parseし、集合・元input／receipt・state・reviewed context・固定header・S/O/T_i/U/Eを比較する。既存の単独projectionの受付とstructure-only結果は維持した。

成功は別Symbol brandの非実行結果だけ。authority:none、checked_scope:context_and_manifest_only、matches:true、二入力合算usage、未確認4項目（binding_provenance／original_body／full_schema／wire）を固定する。raw値・opaque参照・本文は返さない。shape／limit／mismatchの型付き失敗でもmessage／codeはinternal_review_errorとし、元例外・Zod issue・causeを含めない。

入力内のreceipt／accepted_outcome参照の同一性は比較するが、実owner由来は証明しない。元reviewed本文／findingsのcaptureは未接続で、同contextやomissionを本文保証へ昇格させない。比較関数の再呼出しは可能であり、一度限りのseal／owner消費ではない。

## 2 テスト先行と途中失敗

- E<Uのtracerは比較関数がないためTypeErrorで失敗。共有BudgetとE境界接続後に成功。
- 同長のID差替えと親header置換が未接続の段階で各REDを確認し、集合／header接続後GREEN。
- 初回strict型検査はreviewed分岐後のunion絞り込みで3件失敗。拒否経路が関数を終えることを明示し、値のcastやschema緩和をせず解消。
- 独立差替え試験の初回に3件の期待理由違い。旧ruleset値と固定max_findingsの変更はmismatch以前にshapeで拒否されるため、意味不一致には許可済みの別rulesetを使い、固定上限の不正値はshape専用試験へ分離した。
- 追加の診断保持fixtureで1件失敗。既存enumにないconsistency_unverifiedを使用していたため、既存のchanged_during_reviewへ訂正。製品の失敗enumは広げていない。
- 初回collection failedなのに非空window／active receiptがある値を受理するREDを確認し、既存aggregate同様のfailed件数・状態制約で停止するよう修正。
- 最終レビューで、release観測が元Oより後・応答Eより前なら受理していたREDを追加。元Oでのrelease証拠検査を接続し、未来観測の救済を拒否した。

## 3 独立合成確認

[比較試験](../tests/review/synthetic-recovery-finish-compare.test.ts)は152件。

- 7状態×7状態の49通りの独立遷移表。元state維持とreviewed→response_limit omissionだけ許し、後者はresponse_truncated必須。元omitted→reviewedや理由・asset_type変更を拒否。
- IDの追加・欠落・重複・同長置換、期待canonical順、input ID／receiptの重複、別receipt混入、同accepted_outcomeの多重利用を拒否。応答順の変更のみ許可。
- completed／not_processedの整合、reviewedのexpected_context必須、omittedのcompleted inputとreviewed_originを検査。未取得not_processedにinput／T_iを作らない。
- reviewedのT_i・retrieved_at・target ID／Update Set／record更新UTC・instance binding・rule・release・必要limitationsを独立に差替え、拒否を確認。active T_iと過去のreviewed T_iを混同しない。
- E=U／E=S+Lと±1ms、短い実効L、S／O／U／入力順の矛盾を確認。operator expiryはS+59999／60000／60001で独立に判定し、Eや短いLへの置換を拒否。
- releaseのbinding・必要警告・asserted_at・family整合・Oより未来の実測を拒否。開始S・L・Oを再採取／clampしない。
- 0.2／0.3、固定header・rule順序差と重複拒否、0.3 selection／対象種別／必要inventory制限／candidate_filterエラー、changed診断と元errors保持を確認。
- metadata_seen=101／selected=100のtruncated windowは警告付きで比較可。警告欠落を拒否。
- 各入力の単独projectionが通る場合でも、二入力合計の文字費262144／node10000を超えればlimit。合計node10000／10001と文字費の境界直下／直上も、schema失敗と区別して確認。成功usageは単独projectionの独立合計と一致。
- accessor／Proxyを実行せず停止。projection wrapper／check summaryをraw値として再投入できず、元入力を変更・freezeしない。raw秘密値・参照を出力へ含めず、反復比較で権限を作らない。

## 4 初回collection失敗の停止境界

構造値層はcollection failed variantも読むが、初回metadata failedは件数0・truncated=false・consistency=unverifiedが前提。一方、本回復subsetは非空selected／active inputが必須であるため、整合する意味入力を構成できない。RD-B03ではこの組合せを拒否し、ゼロ件や架空receiptで救済しない。RA-01の旧値比較・通常WJ-Cを変更するものではない。full集約schemaの代替や、全failed結果への一般対応を主張しない。

## 5 検証結果

- `npm run build`：成功。
- 新比較／既存構造試験のstrict TypeScript型検査：成功。
- 変更TS／梱包scriptのESLint：成功。
- 関連合成：5ファイル593件成功（新比較152、既存RD-B01 134、RA-01 204、通常WJ-C82、scalar21）。失敗0・skip0。
- 初回全体合成：257ファイル12,356件成功、失敗0・skip0（約35.8秒）。元Oとrelease観測の追加1件より前の結果。
- 追加後の最終全体合成：257ファイル12,357件成功、失敗0・skip0（約44.3秒）。
- `node tests/review/package-http-classification.mjs`：441ファイルで成功。比較関数・brandを含む非同梱、dist JS／型／mapのmarker非露出、純粋import allowlistとruntime／I/O／clock／worker注入の負の対照、既存compiled fixtureを確認。

関連はmaxWorkers=1、全体はmaxWorkers=3。150秒の外側監督は検証の停止装置で、製品／試験の期限は緩めていない。既存のローカル待受合成テストを含むが、外部ServiceNowへ接続していない。

## 6 レビュー修正（2026-11-02）

§3・§5の件数と、ESLintを対象ファイルだけに対して実行した結果は、修正前の記録として残す。

**finalize由来のomission errorの扱い（試験helperの実装修正）**：修正前はheaderのerrorsを完全一致で比較していた。既存`finalizeAggregate`（`aggregate-finalize.ts`のomit）は、reviewedをresult_omittedへ変えるとき、`response_truncated`がまだなければそれを追加すると同時に`addReviewError`で`{stage:'output',code:'response_limit'}`を1件追加する。修正前の試験はlimitationだけを足していたため通っていたが、finalizeと同じ形の応答は`mismatch`で拒否された。errorsは期待値の全件を同順の先頭に保ち、上記の条件でだけomission errorを1件末尾に許す（期待errorsが100件なら代わりにerror_details_truncatedを要求）形に改めた。

| 追加・変更した試験 | 確認内容 |
|---|---|
| 既存2件（state oracleのreviewed→omitted、response_truncated要求） | finalizeと同じくlimitationとomission errorの両方を足した形へ更新 |
| limitationだけのomission | omission errorがないため拒否 |
| 無関係なerrorの追加 | 拒否 |
| 新omissionなしのomission error | 拒否 |
| 期待に既にresponse_truncatedがある場合 | 追加errorなしで一致、errorを足すと拒否 |
| 期待errorsが100件の場合 | error_details_truncatedが必要 |
| 同じ長さで重複assetが欠落IDを隠す応答 | 拒否（assetsの重複拒否） |
| 期待の非release limitationを落とす応答 | 拒否 |
| 応答coverageのskipped_rules | 拒否 |

各判定を外す変異では対応する追加試験だけが失敗し（errors比較の全体を外す変異では関係する既存1件と追加3件）、復元後に`cmp`一致を確認した。

修正後の結果：

| 検証 | 結果 |
|---|---|
| RD-B03比較試験 | 160件成功 |
| ESLint | `npm run lint`（repo全体）exit 0 |
| build・梱包 | `npm run build`成功、offline梱包441ファイル成功 |
| 全体合成 | maxWorkers=3、257ファイル／12,365件成功、失敗0・pending 0、exit 0。約53.0秒 |

RD-B詳細設計はdraft-0.5へ更新し、参照する3文書の版数リンクも直した。

## 7 未実施・残課題

RD-B04の同accepted seal、同期失効とRA-03-B固定discard接続、ownerのpost-guard優先／一度限り消費は未実装。元本文／由来・full schema／wire、比較work／実allocation・全体上界・本番capはUnknown。正式発行口閉鎖・全体受付無効・VM／監視／telemetry調査保留を維持した。実Permit／candidate／finish job発行、実worker／runtime接続・実通信・実機操作・設定変更・Pushは行っていない。

[詳細設計§13](BEST_PRACTICE_ABORT_SCOPE_RECOVERY_FINISH_VALUES_RDB_DESIGN.md)参照。
