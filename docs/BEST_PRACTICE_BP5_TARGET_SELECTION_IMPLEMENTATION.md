# BP-5：opt-in対象選択・0.3契約の実装と合成検証

Date: 2026-10-18 / Status: 実装・合成検証。今回の実機操作はなし。
[契約と公式仕様](BEST_PRACTICE_BP5_TARGET_SELECTION_CONTRACT.md)の案Aを実装した。
既存の同文書§6.1のPDI metadata照会は履歴として保持するが、今回の検証や新モードの実機E2Eに数えない。
規則カードの承認・独立した人手品質評価・新モードのPDI E2Eは未実施。

## 1. 入力・版・互換性

`review_update_set_best_practices`に任意の`selection_mode`を追加した。

| 指定 | 選択とJSON |
|---|---|
| 省略 / bounded_all | 従来の全種別・sys_id昇順の有限窓。集約はbp-mcp-review-0.2。対象外/削除も枠に含む |
| review_targets | 固定の更新/action・名前候補フィルター。集約はbp-mcp-review-0.3 |

無効な列挙・null・型違い・追加キーは広告JSON Schemaとランタイムで拒否する。
`max_records`は既定20、最大100で、成功件数ではなくmetadata候補の行予算。
source・adapter・worker・MCP dispatchの一連の経路を接続し、新しいツールを別登録する方式にはしない。
instanceは既存serverが消費し、利用者のquery・fields・release・予算指定は引き続き禁止する。

既存の0.2スキーマ・JSON Schema export・固定評価セットを維持した。
共通の集約不変条件を新旧で共有し、0.3用の厳格構造・検証器・JSON Schemaと版別unionを追加。
入れ子の1件契約はbp-review-0.2、規則・カタログ・依存の版は変更しない。
MCPは従来どおりコンパクトJSON textを返す。structuredContentを追加せず、成功/固定失敗を混同する
単一の集約outputSchemaを広告しない。text内の集約の版はschema_versionで判定する。

## 2. 固定候補条件と拒否

`src/review/target-selection.ts`にtarget-prefix-0.1の固定ポリシーを置く。
BRのみ・Client Scriptのみ・両方の3条件は契約書どおりで、OR・複数ストリーム・ページ追加を使わない。
新モードのmetadata一覧だけoffset=0 / no_count=trueを付け、初回と最終照合で同じ条件を使う。
名前の厳密な識別は引き続きローカル・XML側で行い、typeの表示文言を信用しない。

返却された全N+1行（lookaheadも含む）の親・action・包含/除外条件を検証する。
条件違反は初回ならcandidate_filter_violationで一覧全体を不採用にし、payloadを取得しない。
最終照合の条件違反なら収集済み結果をpartialで保持し、consistency=unverifiedにする。
必須列・重複・順序違反は既存のmetadata_unavailable経路。条件内の観測差はchanged。
候補窓に入る正規の対象外種別はnot_applicable、壊れた対象名はidentity_mismatchで枠を消費し、補充しない。

## 3. 0.3の範囲・件数

selectionにmode、filter_version、要求規則から導く種別、action範囲、順序を固定値で記録する。
除外した対象外/削除/他actionの件数は取得せずnull。coverageはselected_candidate_windowを示し、
candidate_inventory_complete / update_set_inventory_completeはfalse固定。
ACL前limitによる未知・候補フィルターだけ・除外件数未収集・全Update Set未レビューの4制限を必須とする。

metadata_seenは初回の採用一覧の返却行数。再試行・最終照合の行を累積しない。
selected=min(metadata_seen,N)=assets.length、ID一意・各counts一致を新旧共通で検証する。
0.3は0件でanalysis_complete=trueを許さない。N以下/truncated=falseでも、ACL前limitにより
可視候補を全て取得したとは言わない。analysis_completeは選択窓の機械的完了だけで、独立品質や安全性ではない。
PoCは引き続きpartialであり、status=completedを許さない。

## 4. 維持した予算・中断処理

- 最大N=100、一覧N+1、最終照合N+1。lookaheadのpayloadは取得しない。
- HTTPは1応答4MiB、全受信16MiB、payloadは1件2MiB・合計8MiB。
  既存bounded sessionでエラー/再試行の受信量も同じ全体予算へ数える。
- 全体210 HTTP試行、最終照合4試行予約、1要求の再試行最大1回を維持。
- 取得/解析50秒、最終照合55秒、集約/worker終了込み60秒。別時計・別予算を設けない。
- 解析済み結果を保持する内部期限partialと、選択済み未処理IDの理由付けを維持。
  全体期限/cancel/内部契約破損は固定エラーだけ。worker終了をawaitしてから認証枠を解放する。
- 最大100指摘・集約256KiB・エスケープ済みMCP envelope 256KiB。本文・原例外非露出を維持。

## 5. 合成検証の対象と経過

新規`tests/review/target-selection.test.ts`ではHTTP境界を合成し、source/adapter/XML/AST/worker/集約を実際に接続する。
MCP入力・dispatch、0.3の構造JSON Schema（AJV）とランタイム項目間検証も通す。

- 対象外/削除120行の後ろの対象へ、N=1のまま到達する。
- 省略/明示bounded_allの0.2契約・元のクエリ、3種類の固定条件、共有N+1、同一条件の最終照合。
- 0/N/N+1/101候補、未知種別・壊れた名前、フィルター違反・別親・未知action・除外語混入。
- lookaheadの条件違反、最終条件違反時のpartial、版/集合変更、必須列欠落・重複・順序違反。
- 未照合リリースで一覧を取得しないこと、MCPのmode列挙・dispatch、本文・資格情報非露出。
- 0.3の型・追加キー・要求種別/順序・null・必須制限・counts・時刻・filterエラーstageの改変拒否。
- 要求数予約、再試行の受信量、応答/payload/総payload制限、エスケープ済みMCP応答サイズ。
- 50/55/60秒とcancelを合成時計で発生させ、完了済み結果・未処理数・worker終了を確認。

制限値を下げる既存のtrusted test optionsを容量境界の一部で使い、製品の上限定数も照合した。
合成時計の期限検証は実時間60秒の負荷試験ではない。公式演算子のDB解釈・全ACL挙動・実データの
網羅性を合成サーバーが証明するものではない。

TDDの最初の到達テストはinvalid_inputで失敗し、接続後に成功。
次に、0.3契約が初回filter違反をstable/completeとして受理する回帰テストの失敗を確認し、
stageとcollection/status/consistencyの整合検査を加えて成功させた。
型検査ではunionのエラー配列を版で絞り込んで修正した。0.2へ新コードを混入させる型キャストで回避していない。
追加の容量fixtureは初回600バイトでは総payloadが超過しなかったため、400バイトへ修正した（製品上限は不変）。
並行lint中にテストランナー5秒超過→未終了呼出しのreview_busy連鎖が出たため、並行lintを止めて単独再実行した。
製品の60秒上限・認証枠を緩めて回避していない。

## 6. 実行結果

検証環境：macOS / Node v24.18.0。

- `bdo npm test -- tests/review/target-selection.test.ts`：新規35件成功。
- `bdo npm test`：99ファイル・2,456件成功（既存2,421件＋新規35件）。実機E2Eは含まない。
- `bdo npm run type-check`：成功。
- `bdo npm run lint`：エラー0、既存警告374。変更したTypeScriptには新規警告なし。
- `bdo npm run test:pack`：ビルド・361ファイルのtarball・本番依存のみの隔離環境で成功。
  直接worker、compiled serverのMCP呼出しのそれぞれで0.2と0.3を解析・集約した。
  通常実行はnpmキャッシュへの書き込み制限でEPERMとなったため、権限付きで同じコマンドを再実行した。
  キャッシュの所有者変更や依存版更新は行っていない。
- 文書のローカル参照・JSON抜粋構文・`git diff --check`を確認。製品上限・package/lockは変更なし。

実機E2E・PDI操作は今回実施していない。合成検証件数を実機疎通率へ加算しない。

## 7. 残る制約・次工程

新モードの実機E2E、未知の接頭辞の枠占有、ACL前limitで短い/空の返却、DB性能は未保証。
opt-inをAIが選ばない場合、従来の対象外/削除による枠占有は残る。ツール説明・利用例で
BR/Client Scriptレビュー時はreview_targetsを明示するよう案内し、省略時の互換性は変更しない。
PDI再確認は別途許可後に読み取り専用で行い、コード本文を出力しない。
