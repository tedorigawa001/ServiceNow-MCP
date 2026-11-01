# OU-01：観測UTCの一度限り採取・pre/post guardの合成検証

Date: 2026-11-01 / Baseline: `d95faca`。

## 1 範囲・非主張

[観測UTC契約draft-0.2 §9](BEST_PRACTICE_ABORT_SCOPE_RELEASE_OBSERVATION_UTC_DESIGN.md)の限定実装。既存fixed fake-200継続で、同session projectionに結合したUTCを同rows projection・取得後guardの後に一度採り、post-guardを行う。空200・実測・競合・不完全／未知／21行に同じ採取順序を適用する。

通常の実source GET／値判定は差し替えず、非200・native status-only・実transportも有効化しない。正式発行口閉鎖・Unknown・全体受付無効・VM／監視／telemetry調査保留を維持し、実接続・実通信・実機操作・トークン発行・設定変更・Pushは行わない。

比較器への入力化、空200のOを上位検証用watermarkとして保持する接続、T_i／reviewed_at／Eとの整合、B-03専用compiled保証は未実施。今回のO採取を全体の時刻保証へ昇格させない。

## 2 実装境界・所有権

- [値専用部品](../src/servicenow/review-kernel/release-observation.ts)：S／全Lとtrusted依存参照を生成時に固定する。fresh→samplingをpre-guard前に消費。単一Dateのepoch／ISO整合・既存ISO構造・S <= O <= S+Lを検査し、post-guard後だけ値を返す。二重採取／failed／closed／caught reentryを拒否し、raw例外を保持・公開しない。これは値部品であってsession認証／Permitではない。
- [session](../src/servicenow/bounded-read.ts)：RP-01 projectionを一度消費した後、固定の`()=>new Date()`と同session／source／keyのguardで部品を生成。元originのS／L／policy・現状態を照合し、先行停止があればその理由を保持する。同期失効／finally／rollback／closeでcloseして参照を消す。
- [sourceのcreator-only継続](../src/review/bounded-source.ts)：既存private construction keyで認められた同session継続だけにobserveReleaseUtc hookを渡す。正常にprojectしたrowsの取得後guardに続けて採り、再guard後に既存値分岐へ進む。fakeの実測／競合evidenceは同Oを使い、legacyのUTC再採取をしない。通常GETにはhookを渡さず、従来の採取・判定を維持する。

clockをtool input／通常session optionsへ追加していない。新friend・session登録・公開projection supplierはない。内部型のoptional hookは既存constructor keyを持たない呼出しから利用できる採用口ではない。公開summary／JSON field／failure codeは変更しない。

C/G/P・予約／返却・cleanupは同ownerのまま。追加確保は採取状態とclosure・Date／ISO値、固定比較とguard。全体work・allocation layout・同期実行上界はUnknownのまま。S・全LはOの成功／失敗でも更新せず、remainingから再計算しない。全60秒・210試行・受信上限と試験期限を緩めていない。

## 3 新規27件・期待値

[値部品11件](../tests/review/release-observation.test.ts)と[実class＋fixed fake16件](../tests/review/release-observation-session.test.ts)。比較器／sourceの内部判定をmockして成功を作らず、UTC・タイマーの外部時計境界を制御する。

| 条件 | 確認した期待値 |
|---|---|
| 部品の正常順序 | guard→clock1回→guard。O=S／S+LのUTC等号を許可し、二度目はclock0回 |
| 部品の失敗／close | pre失敗はclock0回、post失敗は1回、時計throw・逆行・非有限でも再試行のclock増加なし。caught reentryでも復活しない |
| 元値・依存の固定 | 生成後に元S／L・clock依存を交換しても採用しない。新しいdeadlineや後付けclockで救済しない |
| 空200／全null | constructor UTC1回＋観測O1回。設定代替evidenceへobserved_atを追加しない。時計障害ではfallback成功にしない |
| 実測Australia | 同じOを既存observed_atへ使用し、legacy再採取なし。C=2、G=親＋release bytes合計、P=0、reserved=0・cleanup=closed |
| 不完全／未知／21行／競合 | Oは1回、既存release_not_admittedを維持。unknownから追加Permitを発行しない |
| raw22／不正行 | projectionで既存の非admitted境界を維持。constructor時刻以外の観測採取0回 |
| runtime逆行／forward | release待機中のwall UTCをSより前／S+Lより後へ動かすとinternal_review_error。mono予算が残っていてもS／Lを書換えない |
| clock中の停止 | 取消・元deadline・取消＋時計throwで元理由を保持。後始末後timerなし |
| 取得前の取消 | 遅延bodyを取消し、観測時計へ未到達。元の取消理由と解放を保持 |

constructorのS採取と観測Oの回数は別集計。新規runtime試験のtoISOString計2回は、それぞれ1回という意味で、全runで時計を1回しか読まないという主張ではない。

## 4 RED／GREENと初回失敗

1. 初回の値部品試験はmodule未実装のためimport失敗（0件実行）。部品追加後、時計throw後の再採取拒否を確認した。このimport失敗を動作REDの証明とは数えない。
2. 実classの空200でOのISO化が失敗する試験は、旧継続がOを採らず設定代替として成功してしまいRED。取得後guardからのhookと同owner採取を接続し、固定internal_review_errorへ停止してGREEN。
3. 生成後にclock依存を差し替える試験が1件RED。依存objectを都度参照せず、生成時にclock／check／reject関数を固定してGREEN。S／Lの元object変更も採取値に反映しないことを確認した。

## 5 検証結果

| 確認 | 結果 |
|---|---|
| 新規＋RP-01／旧private ack／source binding回帰 | 5ファイル／109件成功、新規27件 |
| `npm run build` | 成功 |
| standalone TypeScript | 新規2試験でエラー0 |
| オフライン梱包 | `node tests/review/package-http-classification.mjs`成功、429ファイル。値部品のJS／宣言／map4成果物と既存compiled fixtureを確認 |
| 全体合成テスト | maxWorkers=1で230ファイル／10,027件成功、失敗0・pending 0、約164.7秒 |
| 文書・差分 | 更新6文書のローカル参照88件・版数参照13件が整合。`git diff --check`成功 |

全体実行：`npm test -- --maxWorkers=1 --reporter=json --outputFile=/tmp/servicenow-ou01-tests-20261101.json`。別build／testと重ねず単独実行した。JSONはローカル一時成果物で恒久結果は本書に記録する。B-03の開発assembly専用compiled保証・通常並列の再発解消を主張しない。補助package-workerの依存取得試験は再実行していない。

コミット前確認：候補13ファイルを含むindex全体を一時コピーへ書き出し、既存node_modulesだけを参照した。候補のbytes一致と無関係な`.vscode/`・`CLAUDE.md`の不在を確認し、そのコピーでbuild・関連5ファイル109件・standalone TypeScript・429ファイルのオフライン梱包が成功した。全体10,027件は再実行せず、上表の実装時結果と区別する。検証後の追加はこの記録だけで、実装・試験内容は変更していない。

## 6 レビュー修正（2026-11-01）

[オフライン梱包検査](../tests/review/package-http-classification.mjs)は`release-observation`のJS／宣言／map4成果物の同梱だけを確認し、`release-family`／`release-comparison`と同じ依存・壁時計のAST検査に含めていなかった。同ループへ追加し、importはzodだけ、`new Date`・`Date.now`・fetch／timer・動的import・re-export・requireを拒否する。時計は注入された依存からだけ読むことを配布物でも確認する。

build後の梱包検査は429ファイルで成功。変異確認として生成済みJSへ`Date.now()`を一時注入すると「reads wall clock」で失敗し、退避copyから復元して`cmp`で一致を確認した。§3・§5の件数は修正前の記録として残す。

## 7 保持する限界

本部品が判定する逆行はSに対する観測点の値。点の間の一時的な時計変動や、今後の上位T_i／Eの順序を検証済みとはしない。空200のOを公開shapeに出さないまま上位へ安全に結合する仕組みは後続工程。比較器入力化・UTC全受入条件・低減Lと出力宣言deadlineの差・設定日時長cap・全体work上界・実source採用は残す。

このfixed fake継続はbinding不一致のときもrelease bodyをdispatch済みで既存unknownへ進む。OU-01はその枝でOを採らないが、D03の別assemblyのrelease GET=0をこの経路で実現したとは主張しない。native／非200／cleanup不正の挙動も今回変更しない。過去の検証・失敗履歴や旧case対応表の分類は変更しない。
