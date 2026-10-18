# BP-5：読み取り専用MCP登録・dispatch・合成検証

Version: bp5-mcp-registration-0.1 / Date: 2026-10-18。
実装と合成検証の記録。実機操作・人手評価・製品品質/公開の承認は行っていない。
ツールが呼べることと、規則/根拠の承認・独立した検出品質を区別する。
後続の[opt-in対象選択・0.3契約の実装記録](BEST_PRACTICE_BP5_TARGET_SELECTION_IMPLEMENTATION.md)を参照。
以下の登録時点の合成検証結果は履歴として維持する。
最新の[対象選択PDI E2E](E2E_BEST_PRACTICE_TARGET_SELECTION_2026-10-18.md)は5成功・0スキップ。
opt-inで既存BR10件へ到達し、省略時の0.2互換性も確認した。Client Scriptの実機正例は未確認。

## 1. 公開する範囲

`review_update_set_best_practices`を`src/tools/best-practice.ts`から定義/実行し、既存MODULESの
定義→executor対応へ追加する。fullは503ツール/47モジュール、platform_developerは45ツール。
service_desk等の他パッケージには追加しない。MCPサーバーは非公開パッケージからの呼出しも拒否する。
パッケージ選択自体はServiceNow認可の代わりではなく、選択済みclientの実効ACLが適用される。

annotationsはreadOnlyHint=true/destructiveHint=false/idempotentHint=true/openWorldHint=true。
WRITE_ENABLED/SCRIPTING_ENABLEDを要求せず、レコード作成/更新、コード実行、外部LLM/CDN/OSV送信は行わない。
service-accountのOAuthトークン取得は既存bounded経路のままで、別資格情報への代替はしない。

Australia、AU-BR-001/002・AU-CL-004の3規則、BR/Client Scriptの保存payload版だけを対象とする。
source_approval_pending、候補/low/info、poc_only=true、code_return_mode=noneを維持し、
正常解析でもstatus=partial。「違反確定」「安全」「実機経路を確認済み」とは扱わない。

## 2. 入力と接続先

| 引数 | JSON Schema/ランタイムの共通制約 |
|---|---|
| update_set_sys_id | 必須、小文字hex32桁。名前/URL/encoded query不可 |
| max_records | 整数1–100、既定20。metadata候補行の予算。従来モードは対象外/削除も含む |
| selection_mode | 任意、bounded_all / review_targets。省略/bounded_allは従来の0.2、review_targetsだけ固定候補選択と0.3 |
| requested_rule_ids | 先行3規則だけ、1–3件、重複不可。既定は全3規則 |
| instance | サーバー側の既存接続先選択値。任意、空でない文字列、最大100文字 |

内部アダプターのZod入力を共通化し、instanceだけを加えたstrict schemaからJSON Schemaを生成する。
default付き項目を必須にしないため`io: input`で生成し、配列のuniqueItemsを明示する。
追加キーはJSON Schemaとランタイム双方で拒否する。payload/query/fields/release/actor、
reviewReleaseConfig、workerFactory、limits等をMCP入力に設けない。

サーバーは全引数を検証した後に一度だけInstanceContext.getClient(instance)を呼び、instanceを消費する。
以後はそのclientを変更せず、既存bounded sessionが接続先/認証を固定する。
接続先選択の例外は原文を返さずinput/config_invalidとする。名前や設定パスの候補一覧も出力しない。
MCP呼出しによるrelease自己申告やファイル設定の変更経路は追加しない。

## 3. MCP結果・エラー・キャンセル境界

一般ツールのpretty-print/原例外ログを通さず、専用のrenderReviewToolOutcomeで返す。

- 成功/partial：MCP isError=false、contentのtext1個に検証済み集約JSONをコンパクトに格納する。
  内部のisError/resultラッパーをそのままtextへ包んで成功と誤認させない。
- 固定失敗：MCP isError=true、textは`{status:"failed",error:{stage,code}}`。
  アダプターが検証済みfailed集約を返す場合だけ、同じJSONのresultへ添える。
- 想定外例外は固定internal_review_error。payload/HTTP本文、stack、URL、資格情報、設定パスを
  一般serverのlogger.errorや返答へ渡さない。通常の「Tool called: 固定ツール名」ログは残す。
- 1件/集約の100指摘/256KiB上限に加え、textのJSONエスケープを含むCallToolResult本体の
  JSONシリアライズ後サイズも256KiB以下に制限する。超過時はoutput/response_limitの固定失敗のみ。
  不完全なJSONや一部の本文を切り貼りして返さない。JSON-RPCのid等の外側枠をこの測定に含めるものではない。
- structuredContentへ同じ集約を複製しない。成功と固定失敗で形が異なるため、単一の集約outputSchemaは広告しない。
- createServerのSDK RequestHandlerExtra.signalをhandleCallTool→router→adapterへ渡す。
  HTTP/stdioとも同じcreateServer経路を使い、全体/工程期限と同じ中断処理を適用する。
  SDK側でキャンセルしたclientは呼出し自体が拒否される場合があり、キャンセル後のJSON受領は保証しない。

内部50/55秒・全体60秒、worker終了待ち、未処理理由、認証枠、soft cutoff時のpartialは
[内部期限記録](BEST_PRACTICE_BP5_SOFT_DEADLINE.md)のまま。全体期限/cancel/契約不整合は部分結果を救済しない。
クライアント側timeoutはサーバーの終了待ちも考慮する必要があり、サーバー予算の延長を指示する引数は無い。

## 4. AI利用例（合成ID）

MCPツール引数：

```json
{
  "update_set_sys_id": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "requested_rule_ids": ["AU-BR-001", "AU-BR-002", "AU-CL-004"],
  "max_records": 20,
  "instance": "dev"
}
```

AIへの依頼例：

> このUpdate Setをreview_update_set_best_practicesで読み取り専用レビューしてください。
> JSONの公式根拠URL・該当規則・位置・required_follow_upを添えて、候補として報告してください。
> releaseの実測/運用者申告、取得範囲・未評価/未処理・省略・一貫性・未承認の制限を最初に示してください。
> 0件を「安全」「違反なし」と言い換えず、本文の再取得や修正・実行はしないでください。

BR/Client Scriptの規則を評価する場合は、上記引数に`"selection_mode": "review_targets"`を明示する。
省略時の既定動作は変更しない。0.3のselection・coverage・limitationsを確認し、除外件数のnullを0へ読み替えない。
候補の全件取得は保証されず、解析窓が完了してもUpdate Set全体のレビューとは報告しない。

sys_update_set/sys_update_xmlとリリース証拠の可視性が必要。sys_cluster_stateが読めない場合の
運用者設定は[設定導入手順](BEST_PRACTICE_BP5_OPERATOR_SETUP.md)を参照する。
本機能のためにACLを弱めたりcluster_node_adminを自動付与したりしない。

## 5. 合成テスト・検証記録（2026-10-18）

- `tests/tools/best-practice.test.ts`と`tests/review/mcp-review.test.ts`：新規40件。
  登録/annotation/package、SDKのAJVプロバイダーによる入力Schemaとランタイムの拒否一致、
  任意引数注入、既定値、client/資格情報/instance binding分離、認証/metadata失敗、
  リリース未照合の取得停止、soft partial、固定MCPエラー、CallToolResultの容量境界を検証する。
- router/adapter/workerはmockせず、HTTP・接続先設定の境界だけを合成する。
  serverの実ハンドラーと、SDK Client/ServerのInMemoryTransportでtools/list、正常call、キャンセル通知を通した。
- 登録前のUNKNOWN_TOOL/定義0件、サーバー接続前のisError未伝播をそれぞれ失敗→実装→成功で確認した。
  JSON Schema生成の初回はdefault項目が必須になったため、入力モードへ修正して両層を照合した。
  容量テストの初回fixtureは入れ子とlimitations配列を共有して上限を超えていたため、
  独立した有効集約を構成し直した。実装の容量上限は緩めていない。
- 梱包テストにcompiled-review-mcp-smoke.mjsを追加。リポジトリ外の展開先、空の初期環境変数、
  合成HOME/設定/HTTP、本番依存だけでcompiled serverのlist/call→router→adapter→workerを通す。
  実ユーザー設定や実機には接続せず、外部待受サーバーも起動しない。

固定評価セット・結果JSON契約・規則カタログ・依存の版は変更しない。
README/TOOLS/CHANGELOGと設計の実装状態を更新する。241件の既存実機E2E対象数には加算せず、
分母だけ503へ更新する（約47.9%）。新規40件は機能回帰であり、独立した検出性能/人手品質の評価ではない。

最終確認：

- `bdo npm test`：98ファイル、2,421件成功（既存2,381件＋新規40件）。
- `bdo npm run type-check`：成功。
- `bdo npm run test:pack`：TypeScriptビルド、357ファイルの梱包、本番依存のみの直接workerとMCP経由の解析/集約が成功。
- `bdo npm run lint`：エラー0、既存警告374。新規モジュール/テスト/fixtureは警告0。
- `git diff --check`：成功。package/lock、1件/集約JSON契約、固定評価器/fixture・規則カタログは変更なし。

検証環境はmacOS/Node v24.18.0。Node 22.12、Linux/Windows、実ServiceNowでの読み取りE2E、
stdio/HTTPの実ネットワークを通した新ツールの通信は未検証。残課題はこれらの許可済み確認、
運用上の権限/上限・規則/境界の人による承認、独立評価と品質/公開審査。

後続の[PDI読み取りE2E](E2E_BEST_PRACTICE_REVIEW_2026-10-18.md)では取得/分類/集約を2件成功で確認した。
対象スクリプト更新は先頭100行の外にあり、payload取得/解析は理由付き1スキップ。登録段階の実機未検証記録と区別する。
