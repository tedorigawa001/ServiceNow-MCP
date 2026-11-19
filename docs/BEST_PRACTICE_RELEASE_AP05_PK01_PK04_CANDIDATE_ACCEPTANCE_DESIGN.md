# AP05：PK01〜04の共通受入表・候補固定・終了確認

Version: release-ap05-pk01-pk04-candidate-acceptance-draft-0.3 / Date: 2026-11-19。
Status: **設計のみ。検証開始・旧試験切替・撤去・公開は未承認。** 静的照合基準は `e4da77f`。これはPK03分離設計までの文書基準で、製品の候補revisionではない。候補patch・実行結果・終了確認はいずれも未取得。

draft-0.3のレビュー修正：レビュー修正の基準HEADは`6cc608b`（修正時のHEADは`6cc608b`）。§4末尾の外側時間枠設計への参照段落が具体化対象からAP5-G03／04を落としていたため、外側時間枠設計の冒頭の記載に合わせて「§1のAP5-G03／04、本節のAP5-T01〜04と§5」とした。他の行・ID・判定は変更していない。

[PK01／FX05](BEST_PRACTICE_RELEASE_AP05_PK01_FX05_VERIFICATION_SPLIT_DESIGN.md)、[PK02／FX03・04](BEST_PRACTICE_RELEASE_AP05_PK02_FX03_FX04_VERIFICATION_SPLIT_DESIGN.md)、[PK03／FX06](BEST_PRACTICE_RELEASE_AP05_PK03_FX06_VERIFICATION_SPLIT_DESIGN.md)の直接assertionは各原文を正とする。本書は[PK04の標準梱包検査](../tests/review/package-worker.mjs)を正対照に加え、[friend試験保証レビュー](BEST_PRACTICE_RELEASE_FRIEND_TEST_GUARANTEE_REVIEW.md)のRG03／04と[B-03](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)のartifact・終了条件を、同じ候補の判定手順に結ぶ。UN62／新LM03は別gate。

先行AP03の未コミット差分を維持する。通常経路未切替、正式発行口・C実行入口／body起動閉鎖、全体受付無効、Unknown・VM／監視／telemetry調査保留を維持する。元期限・既定並列度を変更しない。今回はMDのみ。旧試験変更・skip、実装・撤去、試験実行、build・梱包・展開・混入操作、依存導入、実接続・実通信・実機操作・設定変更・公開・コミット・Pushは行わない。

## 1 着手条件：レビュー、候補pin、起動許可を分ける

| ID | 起動前の必要条件 | 揃わない場合 |
|---|---|---|
| AP5-G01／仕様 | [AP02のS01〜07／K01〜04](BEST_PRACTICE_RELEASE_AP02_REMOVAL_SCOPE_BASELINE_DESIGN.md)と[入口ED01〜07](BEST_PRACTICE_RELEASE_AP02_AP03_AP05_ENTRY_DECISION_HANDOFF.md)に、切る到達辺・残す通常owner／共有kernel・元assertion・責務先を結ぶ。AP03のC05-B（非Proxyのown-only、外側Proxyの反射前拒否）、C07-B（通常2引数、JSの第3引数の明示undefinedのみ互換）、C02〜04案P（禁止own `synthetic_io` の副作用前同期 `invalid_input`）、C06（型／named・namespace／deep importの区別）の採用記録を、候補の仕様根拠として別途固定する | 現HEADに未コミットのAP03記録を合成して「同revision」としない。外部利用・未解決動的辺・共有責務が不明ならUnknown。記録の採用を実装完了・AP03全体の承認にしない |
| AP5-G02／保証と許可 | [AP01残差台帳](BEST_PRACTICE_RELEASE_AP01_INDIVIDUAL_APPROVAL_RESIDUAL_LEDGER.md)で未代替保証を旧case単位に確認し、保持・回復・非提供時の処遇と責務先を審査する。[AP04](BEST_PRACTICE_RELEASE_GUARANTEE_RECOVERY_SCOPE_REVIEW.md)の旧rejectとDのunknown／withheldは非同等。AP02実装・候補検証の実行・AP05旧試験切替は別々に承認し、旧試験を維持したまま検証できる範囲を明示する | 影響行の処遇・必要な承認がなければ着手しない。限定リリース方針、Dの成功、Pの不在のいずれも保証低下の承認にしない |
| AP5-G03／同一候補 | 候補の完全なcommit ID、source tree、承認済み変更の範囲、test entry／入力manifest、package／lock／build設定、Nodeの実体と実解決される依存の固定記録を採る。同revisionの空の専用出力から作るtarballのdigestと同一展開内容を結合し、P+／P0はその成果物を共有する。候補と独立した検査器・fixtureも版／digestを固定する | dirty差分、生成物・実解決先・lockの不一致、別worktree・別dist・ソース／tsx・隣のnode_modulesへのfallbackは停止。候補の作り直しやpin変更は別候補として、旧結果を持ち越さない |
| AP5-G04／実行と保存 | H（旧build／元fixture）、P（隔離した候補配布物）、D（開発別build／別brand・別台帳）を明示し、各source revision／固定entry／解決先を記録する。§4の上限・終了観測・保管／削除責務を承認し、**各起動前に**同候補／同owner・次slotの空き・前slotの完全終端・残時間を再照合する | 必須entry・実行根拠・依存・先行slotのいずれか欠ければ起動0。再起動・タイマー延長・registry取得への切替を自動で行わない |

固定は段階別とする。**build前**にcommit／tree・検査器／入力・toolchain／依存と空出力を確認し、**pack前**にそのbuildの出力manifestを固定する。**展開前**にtarballのdigest、**P起動前**にそのtarballから得た展開manifest・実解決先を確定する。後段のdigestを前段の起動条件にして循環させず、生成済みのpinは各段の前後・回収前に照合する。

Node／lockの宣言だけで依存の実体をpin済みにしない。将来の隔離実行では承認済みのローカル依存だけを使う。現行PK04の `--prefer-offline` を実通信なしの保証とはみなさず、依存不足は環境不適合として停止する。digest一致は同bytesの証拠であり、供給元の真正性や安全性承認ではない。

## 2 PK01〜04の共通受入表（全て未実行）

P+＝通常・必要物の正対照、P0＝正常候補での不在／拒否、PΔ＝検査が意図した差を検出する独立対照。P+とP0は変更していない同じ候補tarball由来の展開物で確認する。展開物へのテスト用entry／lockの添付は配布payloadのmanifest取得後に分け、配布物として数えず、元payloadの変更を許さない。PΔは同候補に由来する別の隔離コピーを**一変異につき一つ**使い、正常候補に戻さない。

| PK／維持する旧境界 | P+ 通常経路・必要物 | P0 正常候補で不在／拒否 | PΔ 混入・欠落の負対照／判別理由 |
|---|---|---|---|
| PK01／H：現行fake I/O同梱期待とFX05の旧prepared／課金・非露出。旧検査の期待値は反転しない | canonical core・単一C/G/P・final4予約／返却、通常GETと注入typed dispatchのC=0／1差、省略時の同期summary・初期source結合・固定close、通常source／Permitを別入力で維持 | `review-composition-fake-io` のJS・宣言・両mapと参照を除外。通常classがロードでき、禁止own `synthetic_io`（非列挙／値undefinedを含む）が副作用前に同期拒否。AP03の通常options対照も独立確認 | fake I/Oの4出力残留、別名／動的辺、旧受付の復活を別々に検出。canonical kernel欠落はP+が所定の理由で失敗し、P0成功にはしない |
| PK02／H：FX03の4正常variant＋401故障、FX04の通常受理／unconfirmed拒否、両friendの旧再取得拒否 | 通常2引数source、同session／coreの `claimStatusBinding` と単一会計、元の親→release判定→matched時の同source／Permit／port、停止・固定close | SA／NDの2系統それぞれで旧named export・namespace own key・class上の禁止口、登録slot・private runner・取得／呼出し辺が不在。残るmoduleのnamed link失敗と廃止wrapperのdeep import解決失敗を区別 | 片系統だけの復活、休眠登録、別名・再export、解決した動的／型の辺、stale出力は各々の理由で失敗。必要dependency欠落や旧takeの二度目拒否は不在の証拠にしない |
| PK03／H：FX06の値実行と旧実class synthetic、関連旧比較／owner／TH行、旧stop直結を維持 | release系6値moduleのJS・宣言・両mapを残し、sessionをロードしない純粋compiled entryでhandoff／discardを検証。通常sessionのS・全deadline・policy、legacy観測と通常stop／owner失効・signal・予約・close、既存時刻出力を別確認 | 不在対象は通常classや値moduleではなく、session→旧観測／handoffの実行辺・旧projection／型・比較／時刻のrunnerとstale生成物。通常stopそのものは残す | constructor／stop／rollback／prepareへの旧結合復活を別々に検出。値module欠落または通常stop／close削除はP+失敗。空rowsの値成功を旧実classの空200採取成功とはしない |
| PK04／[標準梱包設計](BEST_PRACTICE_BP5_PACKAGING.md)のworker／MCP smoke・fixture境界。既存assertionを維持 | 展開物の既存固定worker JSと本番依存だけで、XML／AST分析・集約、MCP handlerの既存tool登録・合成request・worker応答（0.2／0.3、非露出）、通常sessionの会計・同sourceのprivate release bindingを確認 | src／tests、dev bootstrap、評価／検索等の既存除外、開発loader／依存、既存fixture authorityが同梱・解決されない。検査時だけ添付したfixtureと同梱物を混同しない | 必須worker／lifecycle／本番依存の欠落は正対照側の失敗。開発loader・別distへのfallbackや開発出力の混入は隔離検査が失敗。公開MCP起動や実接続で補わない |

各PΔは基準P+／P0が通った候補に結合し、差分1件・対象判定ID・期待する失敗理由を先に固定する。出力層の対照はJS・宣言・JS map・宣言map（埋め込みsource含む）をそれぞれ判別する。依存辺はexport表・構文・解決した到達閉包を照合し、文字列検索だけで判定しない。PΔの「失敗検出」は指定の判定点で予定理由が観測され、かつ終了が確認された場合だけ合格。非0終了・起動不能・誤った理由・別の判定で先に落ちた結果は代用不可。必要物の欠落は必ず正対照の失敗として記録する。

AP03の横断対照は、通常options／継承getterの未読・許可own値の利用、外側Proxyのtrap非実行、禁止own keyと別の不正が重なった場合の同期拒否順を分ける。C07-BのJS明示undefined受入と他の第3値／4引数以上の拒否は、通常2引数の成功および配布宣言の2引数契約とは別判定とする。C06は残るmoduleの通常ロード、旧named importのlink時失敗、namespaceに旧名がないこと、廃止moduleの解決失敗をそれぞれ記録する。型エラー・C=0・停止後のsummaryだけで、JSの拒否位置や副作用ゼロを代用しない。

## 3 H／P／Dの証拠を併合しない

- **H：** 元ID／元revision／fixture／入力variant／注入位置／直接assertionを固定する。現在のPK01／PK02・03が見るpack一覧とrepo `dist` は隔離配布物の実績ではない。旧fixtureの期待や実行元を切り替えない。
- **P：** §2のP+／P0／PΔを別々の結果にする。通常の同期summaryや時刻・Permitが一致するだけで、旧専用slot・登録世代・比較claimの存続や不在を推定しない。正対照の観測を増やすために新friend／採用口を作らない。
- **D：** FX05の会計／比較、FX03・04の別reader／status・診断、FX06の固定Oと保留を、別brandの補完として記録する。旧実classの同bytes・同owner／登録ready・close前受理、NDの正常404／bodyありと401同期throw、空200の実class採取とpost-O取消・破棄は、該当する元条件／旧assertionと差を残す。Dの返値／tokenをPへ採用しない。D／Uの同process非干渉はB-03の独立対照で、候補不在や未代替保証の回復に読み替えない。

## 4 実行枠・終了確認・停止時の保持

現行PK04は外部コマンドに各120秒、3つのsmoke childに各15秒を指定しているが、全系列の外側期限や、孫worker／stdio／cleanupの完了確認ではない。PK01〜03の対象compiled childには明示timeoutのない起動箇所がある。通常並列3件の元5秒・既定並列度、別の旧比較childの60秒、製品の全体60秒は別軸であり、本系列の上限への転用・延長はしない。

将来の外側ownerは、最初の副作用（build・一時領域確保など）**前**に同一単調時計の起点 `T0`、絶対観測締切 `D_obs`、cleanup込みの絶対締切 `D_end`（`T0 < D_obs < D_end`）、各slotの上界とcleanup予約を固定する。`D_end - D_obs` は停止・join、stdio drain、保全／上位受理、所有物削除確認の上界を覆う。部分生成の回収もここに含め、slot admissionでは同じ `D_obs` までに必要観測を収められ、cleanup予約を侵食しないことを確認する。ローカルの実行上限を個別に考慮しつつ、再試行で外側期限を更新しない。数値・根拠・対象process上限・保全先は未承認で、承認されるまで起動しない。

| 軸／所有 | 起動前に確保するものと完了根拠 | 未確認・失敗時 |
|---|---|---|
| AP5-T01／runner・command | 固定slotとspawn attemptを先に保持し、同attemptのhandle、exit／signalと再回収不要の確認、実行したentry／checkpointを結ぶ。timeout／kill要求と実exitを区別 | spawn throw・遅いhandleを未起動と推定しない。PID単独や最終ログで終端にしない |
| AP5-T02／子・worker | 同runner／generationの既知子・孫・worker threadの一覧と所有関係、各join／退出または確認済み未生成を照合 | 未登録tail・未joinはUnknown。runnerのcode 0やworkerのfinish返答だけで退出済みにしない |
| AP5-T03／stdio | stdout／stderrを別に先行確保し、固定上限でdrain、各EOF／closeと所有stdinのcloseを確認。上限到達は欠落として保持し、可能なdrainは続ける | stream保留・出力欠落・上限超過は別理由。成功文字列で欠落を埋めず、子がexitしても監視完了にしない |
| AP5-T04／cleanup・保全 | 同候補／slotの一時成果物・領域、固定診断、保管先と唯一の後始末ownerを先行確保。許可された有限の結果・残存責務を同slotで上位に渡し、受理確認後に所有範囲だけを一度削除し、その結果を記録 | 未確認processが使う領域・未移譲資料は消さない。移譲ackと削除確認は別。ackなし・部分削除・親喪失時の責務が残るならUnknown、無断再試行や原本削除なし |

採取値は候補ID・manifest／slot ID・PK／対照ID・到達位置・固定結果理由・終了4軸・残存責務への参照に限定し、stdout／stderrも固定件数／byte上限と欠落状態を持たせる。token・URL・payload・例外本文は保存しない。上限、保全先、親喪失時に引き継ぐ方法が未確定なら、heap内保持や削除結果を推測して開始しない。[B-03の終了条件](BEST_PRACTICE_RELEASE_B03_COMPILED_MIGRATION_FAULT_DESIGN.md)を優先し、[通常並列用の終了・外側時間枠設計](BEST_PRACTICE_WFB_SGA_TERMINATION_OUTER_BUDGET_DESIGN.md)からは「判定と物理終端・責務移譲を分ける」原則だけを参照する。

[外側時間枠・cleanup予約・保全責務の詳細設計 draft-0.2](BEST_PRACTICE_RELEASE_AP05_CANDIDATE_OUTER_BUDGET_CUSTODY_DESIGN.md)で、§1のAP5-G03／04、本節のAP5-T01〜04と§5を、一本の絶対時間枠・slot入場条件・cleanup予約R1〜R7・終了未確認時の保全と受渡しへ具体化した。数値・保全先・実行は未承認のまま。

## 5 判定と次に進まない条件

1. **開始拒否：** AP5-G01〜04の不足・pin不一致・未承認・前slot未終端なら起動0。検査器や依存欠落、対象未解決を不在判定へ送らない。
2. **実行停止：** P+不成立ならその候補の不在／混入を成功扱いにしない。想定外の判定、取消、clock不明・逆行、`D_obs` 到達、同一性の破れでは新規slotを止め、確保済みのcleanup・保全だけへ進む。`D_end` までに終端が揃わなければ、最初の理由と未確認軸を封印し、次slotを開始しない。遅いexit／EOFは解放記録にのみ追加し、元判定を成功へ戻さない。
3. **候補受入：** 必須のP+／P0／PΔが全て予定判定で、同revision・同配布物由来、展開物のpost-pin、および各終了軸・cleanupが期限内に確認された場合のみ、AP05の候補配布物確認として記録する。H／Dの結果と残差は別添とし、元assertionを廃止・代替済みにはしない。旧試験切替、AP06の通常並列3件timeout対照・版・公開は別途承認。閉鎖条件・Unknown・調査保留は候補受入だけでは解除しない。
