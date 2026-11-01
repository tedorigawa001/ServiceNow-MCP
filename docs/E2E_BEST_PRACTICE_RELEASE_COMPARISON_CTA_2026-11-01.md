# CT-A：同projection／sourceのrows・O receiptと固定比較候補の合成検証

Date: 2026-11-01 / Baseline: `4c691ed`。

## 1 限定範囲

[接続契約draft-0.2 §10](BEST_PRACTICE_ABORT_SCOPE_RELEASE_COMPARISON_TIME_BINDING_DESIGN.md)のCT-Aを実装。同sessionの消費済みprojection、同sourceで消費する元ack、同rows projection、OU-01の観測UTCを一体のreceiptに結合し、固定比較器入力と一度限りの非実行候補受理へ進める。

正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持。通常実sourceの値判定・既存legacy結果／Permitへ候補を採用せず、実接続・実通信・実機操作・トークン発行・設定変更・Pushは行わない。CT-B／CのTimeOwner／上位移譲・worker job・T_i／E照合は未実装。

## 2 所有・消費・停止

- [値receipt owner](../src/servicenow/review-kernel/release-comparison-receipt.ts)：同projection reference／session／source／key・元S／全L／P・元ackを固定。issueはpre-guard前に発行状態を消費し、strict入力copyをopaque receiptへ格納。compareはMapからreceiptを先に削除して固定compareReleaseを呼び、acceptもcandidateを先に消費する。
- 正常accept後だけOと凍結非実行draftを保持。空200でも内部Oは保持し、assertion／source:noneの公開evidenceにobserved_atを足さない。二重消費・混入・caught reentry・guard拒否・policy矛盾はfail-closedでO／候補を消し、再開しない。
- [source](../src/review/bounded-source.ts)：既存creator-only継続のoptional hookへ元ack・同project済みrows・同Oを渡す。既存private construction keyの検査を迂回する入口は追加しない。通常GETにはhookを渡さない。
- [session](../src/servicenow/bounded-read.ts)：元mint済みackとRP-01 projectionへownerを結合し、同origin／source／keyと生存を各guardで検査。同期失効／finally／rollback／closeでownerとprojection参照を消す。通常options・summaryへ新しいsupplier／候補／receiptを加えず、新friend・registryも追加しない。

値ownerは任意のfake objectで生成しても実sessionの真正性・権限を発行するものではない。unit .inspectは非実行dataの検査用で、runtimeのprivate ownerを外部から取得できるAPIではない。runtime内部draftの直接読取を可能にする試験用friendは追加していない。

Pは元のpin object identityを保持する。pin関数が有効設定にもown issue:undefinedを持つため、比較の値projectionでassertion／issueがundefinedのときだけkeyを省略する。未知keyは保持してstrict parserで拒否し、意味再判定・provider再実行・parser緩和・元Pの書換えはしない。

copy／receipt Map／candidate Map各最大1枠・O保持・固定guardが追加費目。受信JSONの再decode・追加GET／C/G/P課金、予約owner・cleanup・元deadlineの更新はない。rows21／build_name40等を維持し、正確なlayout／全体work・同期上界はUnknownのまま。

## 3 新規40件と保証の区別

[値owner35件](../tests/review/release-comparison-receipt.test.ts)と[実class＋fake継続5件](../tests/review/release-comparison-receipt-session.test.ts)。固定比較器をmockせず、値は独立した固定期待値で確認する。guardはfake owner、実classの時計・I/Oは既存の合成境界を使う。

| 観点 | 確認 |
|---|---|
| 空200 | accept後のprivate O保持、assertion evidenceにOなし、権限4項目false |
| 同rows | issue後に元rowsを変更しても最初のbounded copyで比較。実測のraw_buildname／Oを固定期待値で確認 |
| 同一性 | 別projection／ack／receipt／candidate、serialized draftを拒否。他ownerは健全なまま |
| one-shot | issue／compare／accept二度目・caught reentry・失敗後再開拒否。closeでO／draft破棄 |
| guard | 発行・比較・受理のpre/post計6位置で取消／期限の理由を保持。比較器invalid_inputよりpost-guardの先行取消を優先 |
| 値判断 | 5family、空／未知／不完全／21行、raw22／policy矛盾／逆行／上界。ordinary unknownも非実行値で保持 |
| 元S／L | Oが45秒後でも元L=60秒・validity_insufficientを維持。remainingで有効設定へ救済しない |
| policy構造 | unset optionalだけを省略し元object不変。未知fieldを黙って除去しない |
| 実class | 空200／実測の既存prepared結果・C=2、G=親＋release bytes、P=0、reserved=0・cleanup=closedを維持。時計はconstructor1回＋O1回のまま |
| 閉鎖境界 | 元bytesの後付け変更・外部candidate注入・偽constructor keyを拒否。取得中取消後にtimerなし、別fresh run可能 |

unitでの内部値保証と実classの固定hook／既存出力・会計保証を合算して「runtime private draftを直接検査した」とはしない。型／梱包では固定module依存とprivate宣言非露出も検査する。旧試験の削除・skip・期待緩和はしていない。

## 4 初回失敗と修正

1. 最初のunitはmodule不在によるimport失敗（0件実行）。部品追加後に空200のO保持を確認した。import失敗を動作REDとは数えない。
2. 実classへ接続した最初の関連4ファイル79件は10件失敗／69件成功。有効assertionにown issue:undefinedが残るpin済みPをそのままstrict比較入力へ入れていた。通常の設定代替／競合等がinternal_review_errorへ変わっていたため、原因をpolicy構造に切り分けた。
3. own issue:undefinedを持つ最小unitでREDを再現し、未設定optionalだけを値projectionから省略してGREEN。元Pやpin／strict parserは変更しない。
4. 初期のfield選別案では未知fieldも落としてしまうため、未知field拒否の1件でRED。fresh copyに未知fieldを残し、undefinedの既知optionalだけを削除する方式にしてGREEN。既存runtime回帰も元の期待のまま成功した。

## 5 検証結果

| 検証 | 結果 |
|---|---|
| 新規＋OU-01／RP-01／private ack／source binding | 7ファイル／149件成功、新規40件 |
| `npm run build` | 成功 |
| standalone TypeScript | 新規2試験でエラー0 |
| オフライン梱包 | `node tests/review/package-http-classification.mjs`成功、433ファイル。新値部品の4成果物、固定比較器だけの依存・時計／I/O禁止AST検査、private宣言非露出、既存compiled fixtureを確認 |
| 全体合成テスト | maxWorkers=1で232ファイル／10,067件成功、失敗0・pending 0、約161.5秒 |
| 文書・差分 | 更新7文書のローカル参照109件・版数参照18件が整合。`git diff --check`成功 |

全体実行：`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-cta-tests-20261101.json`。別build／testと重ねず単独実行し、製品・試験の期限を緩めていない。JSONはローカル一時成果物で恒久結果は本書に記録する。B-03の開発assembly専用compiled保証・通常並列の再発解消を主張しない。補助package-workerの依存取得試験は再実行していない。

コミット前確認：候補14ファイルを含むindex全体を一時コピーへ展開し、既存node_modulesだけを参照して、build・関連7ファイル149件・新規2試験のstandalone TypeScript・433ファイルのオフライン梱包を再確認し、すべて成功した。候補14ファイルのbytes一致と、無関係な`.vscode/`・`CLAUDE.md`がコピーに含まれないことも確認した。全体10,067件はこのコミット前確認では再実行せず、上表の実装時結果と区別する。確認後の追加変更は本段落だけで、実装・試験は変更していない。

## 6 残課題・非主張

CT-AのO保持は同private候補ownerが生きている間だけ。空200もcloseで破棄し、CT-B用TimeOwner／worker jobへの終端移譲・T_i／Eとの整合はまだない。legacy非admittedでrunが失敗すれば、内部に正常なunknown候補ができても破棄する。候補を新しいPermitや代替成功に使わない。

fixed fake継続のbinding不一致は依然release bodyをdispatch済みで、D03の別assemblyのGET=0とは別。native／非200／不正応答の既存境界も維持する。CT-B／C・B-03・旧caseの未代替保証・friend撤去・日時長cap・全体work上界・低減Lと宣言deadlineの差は残課題。過去の失敗履歴と固定評価セットは変更しない。
